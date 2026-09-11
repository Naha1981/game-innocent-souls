from __future__ import annotations

import base64
import json
import os
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
SOURCE_MAX_BYTES = 8_000_000
SOURCE_TTL_SECONDS = 15 * 60
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
ATLAS_MAX_BYTES = 8_000_000


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


app = FastAPI(title="NahaKids Sprite Generation Worker", version="0.3.0")


def config() -> dict[str, object]:
    root = os.getenv("SPRITE_GEN_ROOT")
    provider = os.getenv("SPRITE_GEN_PROVIDER", "codex")
    timeout = int(os.getenv("SPRITE_GEN_TIMEOUT_SECONDS", "900"))
    source_root = os.getenv("SPRITE_GEN_SOURCE_ROOT") or str(Path(tempfile.gettempdir()) / "nahakids-source")
    return {"configured": bool(root and Path(root).is_absolute()), "provider": provider,
            "timeoutSeconds": timeout, "root": root, "sourceRoot": source_root}


def safe_log(event: str, **fields: object) -> None:
    print(json.dumps({"event": event, **fields}, separators=(",", ":"), sort_keys=True), flush=True)


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
    if not source_ref.startswith("tmp://"):
        raise ValueError("INVALID_SOURCE_OBJECT_REF")
    token = source_ref.removeprefix("tmp://")
    try:
        uuid.UUID(hex=token)
    except ValueError as exc:
        raise ValueError("INVALID_SOURCE_OBJECT_REF") from exc
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
    for candidate in (root / ".venv" / "bin" / "sprite-gen",
                      root / ".venv" / "Scripts" / "sprite-gen.exe",
                      root / ".venv" / "Scripts" / "sprite-gen"):
        if candidate.exists():
            return candidate
    raise FileNotFoundError("sprite-gen executable not found in the configured .venv")


def magic_matches(mime: str, data: bytes) -> bool:
    if mime == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    if mime == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if mime == "image/webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


def canonical_request(job: SpriteJob) -> dict:
    states = {}
    for item in job.states:
        state_id = str(item["id"])
        states[state_id] = {
            "frames": int(item["frames"]),
            "fps": 4 if state_id == "idle" else 8,
            "loop": state_id == "idle",
            "action": {
                "idle": "subtle breathing and blinking",
                "walk": "readable walking cycle with clear alternating gait poses",
                "jump": "jump arc through body position only",
                "celebrate": "joyful celebration pose sequence with clear start and end",
            }[state_id],
        }
    return {
        "version": 1,
        "kind": "sprite-gen-request",
        "engine": "component-row",
        "character": {"id": job.jobId, "description": f"friendly 2D game character for {job.adventure}"},
        "cell": {"shape": "square", "width": 256, "height": 256, "size": 256, "safe_margin": 24},
        "chroma_key": {"name": "magenta", "hex": "#FF00FF", "rgb": [255, 0, 255], "selection": "explicit"},
        "states": states,
        "style": "match the attached base reference exactly; friendly 2D game character; stylised-only; no photorealistic face",
        "layout": "taxonomy/v1",
    }


def run_pipeline(job: SpriteJob, run_dir: Path, cli: Path, base_source: Path) -> dict:
    base_target = run_dir / "base-source.png"
    shutil.copyfile(base_source, base_target)
    request_path = run_dir / "sprite-request.json"
    request_path.write_text(json.dumps(canonical_request(job), indent=2), encoding="utf-8")

    commands = [
        [str(cli), "prepare", "--out-dir", str(run_dir), "--character-id", job.jobId,
         "--base-image", str(base_target), "--request", str(request_path)],
        [str(cli), "gen-set", "--run-dir", str(run_dir), "--provider", job.provider],
        [str(cli), "extract", "--run-dir", str(run_dir)],
        [str(cli), "compose-atlas", "--run-dir", str(run_dir)],
        [str(cli), "inspect", "--run-dir", str(run_dir)],
    ]
    timeout = int(config()["timeoutSeconds"])
    for index, command in enumerate(commands, start=1):
        safe_log("pipeline_stage_start", jobId=job.jobId, stage=index)
        started = time.monotonic()
        completed = subprocess.run(command, cwd=run_dir, capture_output=True, text=True,
                                   timeout=timeout, check=False)
        safe_log("pipeline_stage_finish", jobId=job.jobId, stage=index,
                 exitCode=completed.returncode, elapsedSeconds=round(time.monotonic() - started, 3))
        if completed.returncode != 0:
            raise RuntimeError(f"SPRITE_GEN_STAGE_FAILED:{index}")

    manifest = run_dir / "manifest.json"
    atlas = run_dir / "sprite-sheet-alpha.png"
    if not manifest.is_file() or not atlas.is_file() or manifest.stat().st_size == 0 or atlas.stat().st_size == 0:
        raise RuntimeError("INVALID_GENERATOR_OUTPUT")
    if atlas.stat().st_size > ATLAS_MAX_BYTES:
        raise RuntimeError("ATLAS_TOO_LARGE")
    data = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not data.get("frame_layout"):
        raise RuntimeError("INVALID_GENERATOR_MANIFEST")
    layout = data["frame_layout"]
    rows = layout.get("rows") if isinstance(layout, dict) else None
    if not isinstance(rows, dict) or not rows:
        raise RuntimeError("INVALID_GENERATOR_FRAME_LAYOUT")
    for state in ("idle", "walk", "jump", "celebrate"):
        rects = rows.get(state)
        if not isinstance(rects, list) or not rects:
            raise RuntimeError(f"INVALID_GENERATOR_FRAME_ROW:{state}")
        for rect in rects:
            if not isinstance(rect, dict) or not all(k in rect for k in ("x", "y", "w", "h")):
                raise RuntimeError(f"INVALID_GENERATOR_FRAME_RECT:{state}")
    atlas_bytes = atlas.read_bytes()
    if not magic_matches("image/png", atlas_bytes):
        raise RuntimeError("INVALID_GENERATOR_ATLAS")
    return {
        "manifest": data,
        "atlas": {
            "mimeType": "image/png",
            "encoding": "base64",
            "data": base64.b64encode(atlas_bytes).decode("ascii"),
            "sizeBytes": len(atlas_bytes),
        },
        "atlasReady": True,
    }


@app.get("/health")
def health() -> dict:
    cfg = config()
    root = cfg["root"]
    executable_ready = False
    if isinstance(root, str) and Path(root).is_absolute():
        try:
            executable_ready = locate_cli(Path(root)).is_file()
        except FileNotFoundError:
            pass
    return {"ok": True, "service": "sprite-generation-worker",
            "generatorConfigured": bool(cfg["configured"]),
            "generatorExecutableReady": executable_ready, "provider": cfg["provider"]}


@app.post("/source-photo")
async def upload_source_photo(file: UploadFile = File(...), x_worker_secret: str | None = Header(default=None)) -> JSONResponse:
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
                    raise ValueError("SOURCE_TOO_LARGE")
                if len(prefix) < 32:
                    prefix.extend(chunk[: 32 - len(prefix)])
                handle.write(chunk)
        if size == 0 or not magic_matches(file.content_type, bytes(prefix)):
            raise ValueError("INVALID_SOURCE_IMAGE")
        ref = f"tmp://{token}"
        safe_log("source_uploaded", sourceRef=ref, sizeBytes=size)
        return JSONResponse({"ok": True, "sourceObjectRef": ref, "mimeType": file.content_type,
                             "sizeBytes": size, "expiresAt": int(time.time()) + SOURCE_TTL_SECONDS}, status_code=201)
    except ValueError as exc:
        destination.unlink(missing_ok=True)
        code = str(exc)
        if code == "SOURCE_TOO_LARGE":
            return error(code, "Source image exceeds the 8 MB limit.", 413)
        return error(code, "The uploaded file is not a supported image payload.", 400)
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
        safe_log("job_succeeded", jobId=job.jobId, atlasBytes=result["atlas"]["sizeBytes"])
        return JSONResponse({"ok": True, "jobId": job.jobId, "result": result}, status_code=202)
    except subprocess.TimeoutExpired:
        safe_log("job_failed", jobId=job.jobId, code="GENERATOR_TIMEOUT")
        return error("GENERATOR_TIMEOUT", "Sprite generation exceeded the worker timeout.", 504)
    except RuntimeError as exc:
        safe_log("job_failed", jobId=job.jobId, code=str(exc))
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
