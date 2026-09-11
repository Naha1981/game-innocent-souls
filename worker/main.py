from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Header, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError


Provider = Literal["codex", "grok"]
Adventure = Literal["football", "hero", "racer", "space"]
States = Literal["idle", "walk", "jump", "celebrate"]
SOURCE_MAX_BYTES = 8_000_000
SOURCE_TTL_SECONDS = 15 * 60
SOURCE_REF_PATTERN = re.compile(r"^tmp://[0-9a-f]{32}$")
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAGIC = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}


class SourcePhoto(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["temporary-child-photo"]
    mimeType: str = Field(min_length=1, max_length=100)
    sizeBytes: int = Field(gt=0, le=SOURCE_MAX_BYTES)


class SpriteJob(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal["1.0"]
    jobId: str = Field(min_length=8, max_length=100)
    adventure: Adventure
    provider: Provider
    source: SourcePhoto
    character: dict
    states: list[dict]
    atlas: dict
    retention: dict
    sourceObjectRef: str | None = None


app = FastAPI(title="NahaKids Sprite Generation Worker", version="0.2.0")


def config() -> dict[str, object]:
    root = os.getenv("SPRITE_GEN_ROOT")
    provider = os.getenv("SPRITE_GEN_PROVIDER", "codex")
    timeout = int(os.getenv("SPRITE_GEN_TIMEOUT_SECONDS", "900"))
    source_root = os.getenv("SPRITE_GEN_SOURCE_ROOT") or str(Path(tempfile.gettempdir()) / "nahakids-source")
    return {
        "configured": bool(root and Path(root).is_absolute()),
        "provider": provider,
        "timeoutSeconds": timeout,
        "root": root,
        "sourceRoot": source_root,
    }


def safe_log(event: str, **fields: object) -> None:
    payload = {"event": event, **fields}
    print(json.dumps(payload, separators=(",", ":"), sort_keys=True), flush=True)


def error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse({"ok": False, "code": code, "message": message}, status_code=status)


def authorized(secret: str | None) -> bool:
    expected = os.getenv("SPRITE_GEN_SHARED_SECRET")
    return not expected or secret == expected


def source_root() -> Path:
    root = Path(str(config()["sourceRoot"]))
    if not root.is_absolute():
        raise RuntimeError("INVALID_SOURCE_ROOT")
    root.mkdir(parents=True, exist_ok=True)
    return root


def source_path(source_ref: str) -> Path:
    if not SOURCE_REF_PATTERN.fullmatch(source_ref):
        raise ValueError("INVALID_SOURCE_OBJECT_REF")
    token = source_ref.removeprefix("tmp://")
    return source_root() / f"{token}.source"


def validate_contract(job: SpriteJob) -> str | None:
    if job.character.get("identityLock") != "stylised-only":
        return "identityLock must be stylised-only"
    if "biometric-identification" not in job.character.get("negative", []):
        return "biometric-identification must be prohibited"
    if job.retention.get("sourcePhoto") != "delete-after-generation":
        return "sourcePhoto retention must be delete-after-generation"
    expected = {"idle": 4, "walk": 6, "jump": 4, "celebrate": 6}
    received = {str(item.get("id")): int(item.get("frames", 0)) for item in job.states}
    if received != expected:
        return "states must match the canonical animation contract"
    if job.atlas.get("format") != "png" or job.atlas.get("transparentBackground") is not True:
        return "atlas must be transparent PNG"
    if not job.sourceObjectRef:
        return "sourceObjectRef is required"
    return None


def locate_cli(root: Path) -> Path:
    candidates = [
        root / ".venv" / "bin" / "sprite-gen",
        root / ".venv" / "Scripts" / "sprite-gen.exe",
        root / ".venv" / "Scripts" / "sprite-gen",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("sprite-gen executable not found in the configured .venv")


def magic_matches(mime: str, data: bytes) -> bool:
    if mime not in MAGIC:
        return False
    if mime == "image/webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return any(data.startswith(signature) for signature in MAGIC[mime])


def run_pipeline(job: SpriteJob, run_dir: Path, cli: Path, base_source: Path) -> dict:
    request_path = run_dir / "sprite-request.json"
    shutil.copyfile(base_source, run_dir / "base-source.png")
    request_path.write_text(
        json.dumps(
            {
                "schemaVersion": "1.0",
                "character": {"id": job.jobId},
                "adventure": job.adventure,
                "states": job.states,
                "atlas": job.atlas,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    commands = [
        [str(cli), "prepare", "--out-dir", str(run_dir), "--character-id", job.jobId,
         "--base-image", str(run_dir / "base-source.png"), "--request", str(request_path)],
        [str(cli), "gen-set", "--run-dir", str(run_dir), "--provider", job.provider],
        [str(cli), "extract", "--run-dir", str(run_dir)],
        [str(cli), "compose-atlas", "--run-dir", str(run_dir)],
        [str(cli), "inspect", "--run-dir", str(run_dir)],
    ]

    timeout = int(config()["timeoutSeconds"])
    for index, command in enumerate(commands, start=1):
        safe_log("pipeline_stage_start", jobId=job.jobId, stage=index)
        started = time.monotonic()
        completed = subprocess.run(
            command,
            cwd=run_dir,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        elapsed = round(time.monotonic() - started, 3)
        safe_log("pipeline_stage_finish", jobId=job.jobId, stage=index,
                 exitCode=completed.returncode, elapsedSeconds=elapsed)
        if completed.returncode != 0:
            raise RuntimeError(f"SPRITE_GEN_STAGE_FAILED:{index}")

    manifest = run_dir / "manifest.json"
    atlas = run_dir / "sprite-sheet-alpha.png"
    if not manifest.is_file() or not atlas.is_file() or manifest.stat().st_size == 0 or atlas.stat().st_size == 0:
        raise RuntimeError("INVALID_GENERATOR_OUTPUT")

    data = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not data.get("frame_layout"):
        raise RuntimeError("INVALID_GENERATOR_MANIFEST")
    return {"manifest": data, "atlasReady": True}


@app.get("/health")
def health() -> dict:
    cfg = config()
    root = cfg["root"]
    executableReady = False
    if isinstance(root, str) and Path(root).is_absolute():
        try:
            executableReady = locate_cli(Path(root)).is_file()
        except FileNotFoundError:
            pass
    return {
        "ok": True,
        "service": "sprite-generation-worker",
        "generatorConfigured": bool(cfg["configured"]),
        "generatorExecutableReady": executableReady,
        "provider": cfg["provider"],
    }


@app.post("/source-photo")
async def upload_source_photo(
    file: UploadFile = File(...),
    x_worker_secret: str | None = Header(default=None),
) -> JSONResponse:
    if not authorized(x_worker_secret):
        return error("UNAUTHORIZED", "Worker authorization failed.", 401)
    if file.content_type not in ALLOWED_MIME:
        return error("UNSUPPORTED_SOURCE_TYPE", "Only JPEG, PNG, and WebP images are accepted.", 415)

    token = uuid.uuid4().hex
    destination = source_root() / f"{token}.source"
    size = 0
    prefix = bytearray()
    try:
        with destination.open("wb") as handle:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > SOURCE_MAX_BYTES:
                    return error("SOURCE_TOO_LARGE", "Source image exceeds the 8 MB limit.", 413)
                if len(prefix) < 32:
                    prefix.extend(chunk[: 32 - len(prefix)])
                handle.write(chunk)
        if size == 0 or not magic_matches(file.content_type, bytes(prefix)):
            return error("INVALID_SOURCE_IMAGE", "The uploaded file is not a supported image payload.", 400)
        expires_at = int(time.time()) + SOURCE_TTL_SECONDS
        safe_log("source_uploaded", sourceRef=f"tmp://{token}", sizeBytes=size)
        return JSONResponse(
            {
                "ok": True,
                "sourceObjectRef": f"tmp://{token}",
                "mimeType": file.content_type,
                "sizeBytes": size,
                "expiresAt": expires_at,
            },
            status_code=201,
        )
    except Exception:
        destination.unlink(missing_ok=True)
        return error("SOURCE_UPLOAD_FAILED", "Temporary source-photo intake failed.", 500)
    finally:
        await file.close()


@app.post("/generate")
async def generate(payload: dict, x_worker_secret: str | None = Header(default=None)) -> JSONResponse:
    if not authorized(x_worker_secret):
        return error("UNAUTHORIZED", "Worker authorization failed.", 401)

    try:
        job = SpriteJob.model_validate(payload)
    except ValidationError:
        return error("INVALID_GENERATION_REQUEST", "Generation contract validation failed.", 400)

    contract_error = validate_contract(job)
    if contract_error:
        return error("SAFETY_POLICY_VIOLATION", contract_error, 400)

    try:
        base_source = source_path(job.sourceObjectRef or "")
    except (RuntimeError, ValueError):
        return error("INVALID_SOURCE_OBJECT_REF", "Temporary source-photo reference is invalid.", 400)

    if not base_source.is_file():
        return error("SOURCE_NOT_FOUND", "Temporary source-photo reference is missing or expired.", 404)
    if base_source.stat().st_mtime + SOURCE_TTL_SECONDS < time.time():
        base_source.unlink(missing_ok=True)
        return error("SOURCE_EXPIRED", "Temporary source-photo reference has expired.", 410)

    cfg = config()
    root = cfg["root"]
    if not root or not Path(root).is_absolute():
        return error("GENERATOR_NOT_CONFIGURED", "SPRITE_GEN_ROOT is not configured.", 503)

    try:
        cli = locate_cli(Path(root))
    except FileNotFoundError:
        return error("GENERATOR_NOT_READY", "sprite-gen executable is missing from its dedicated environment.", 503)

    work_root = os.getenv("SPRITE_GEN_WORK_ROOT")
    parent = Path(work_root) if work_root else None
    if parent and not parent.is_absolute():
        return error("INVALID_WORK_ROOT", "SPRITE_GEN_WORK_ROOT must be absolute.", 500)

    run_dir: Path | None = None
    try:
        run_dir = Path(tempfile.mkdtemp(prefix=f"nahakids-{job.jobId}-", dir=str(parent) if parent else None))
        safe_log("job_started", jobId=job.jobId, adventure=job.adventure, provider=job.provider)
        result = run_pipeline(job, run_dir, cli, base_source)
        safe_log("job_succeeded", jobId=job.jobId)
        return JSONResponse({"ok": True, "jobId": job.jobId, "result": result}, status_code=202)
    except subprocess.TimeoutExpired:
        safe_log("job_failed", jobId=job.jobId, code="GENERATOR_TIMEOUT")
        return error("GENERATOR_TIMEOUT", "Sprite generation exceeded the worker timeout.", 504)
    except RuntimeError as exc:
        code = str(exc)
        safe_log("job_failed", jobId=job.jobId, code=code)
        return error("GENERATOR_FAILED", "Sprite generation failed QA or execution.", 502)
    except Exception:
        safe_log("job_failed", jobId=job.jobId, code="INTERNAL_ERROR")
        return error("INTERNAL_ERROR", "Unexpected worker failure.", 500)
    finally:
        if run_dir and run_dir.exists():
            shutil.rmtree(run_dir, ignore_errors=True)
        base_source.unlink(missing_ok=True)
        safe_log("temporary_source_deleted", jobId=job.jobId)
        safe_log("temporary_run_deleted", jobId=job.jobId)
