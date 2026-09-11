from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError


Provider = Literal["codex", "grok"]
Adventure = Literal["football", "hero", "racer", "space"]
States = Literal["idle", "walk", "jump", "celebrate"]


class SourcePhoto(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["temporary-child-photo"]
    mimeType: str = Field(min_length=1, max_length=100)
    sizeBytes: int = Field(gt=0, le=8_000_000)


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
    # Production transfer is deliberately separate from the metadata contract.
    # A future object reference can be added only after its security contract is defined.
    sourceObjectRef: str | None = None


app = FastAPI(title="NahaKids Sprite Generation Worker", version="0.1.0")


def config() -> dict[str, object]:
    root = os.getenv("SPRITE_GEN_ROOT")
    provider = os.getenv("SPRITE_GEN_PROVIDER", "codex")
    timeout = int(os.getenv("SPRITE_GEN_TIMEOUT_SECONDS", "900"))
    return {
        "configured": bool(root and Path(root).is_absolute()),
        "provider": provider,
        "timeoutSeconds": timeout,
        "root": root,
    }


def safe_log(event: str, **fields: object) -> None:
    # Never log childName, source URLs, image bytes, or request bodies.
    payload = {"event": event, **fields}
    print(json.dumps(payload, separators=(",", ":"), sort_keys=True), flush=True)


def error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse({"ok": False, "code": code, "message": message}, status_code=status)


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


def run_pipeline(job: SpriteJob, run_dir: Path, cli: Path) -> dict:
    # The source-object handoff is intentionally a hard boundary. Until implemented,
    # no generation command is invoked because doing so would produce an asset unrelated
    # to the supplied child photo.
    if not job.sourceObjectRef:
        raise RuntimeError("SOURCE_PHOTO_TRANSFER_NOT_CONFIGURED")

    request_path = run_dir / "sprite-request.json"
    request_path.write_text(
        json.dumps(
            {
                "schemaVersion": "1.0",
                "character": {"id": job.jobId},
                "source": {"objectRef": job.sourceObjectRef},
                "adventure": job.adventure,
                "states": job.states,
                "atlas": job.atlas,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    # The exact source-object materialization and provider auth are deployment concerns.
    # Keep the canonical sprite-gen stage sequence intact; do not substitute ad-hoc image
    # slicing or a fake manifest.
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


@app.post("/generate")
async def generate(payload: dict) -> JSONResponse:
    try:
        job = SpriteJob.model_validate(payload)
    except ValidationError:
        return error("INVALID_GENERATION_REQUEST", "Generation contract validation failed.", 400)

    contract_error = validate_contract(job)
    if contract_error:
        return error("SAFETY_POLICY_VIOLATION", contract_error, 400)

    cfg = config()
    root = cfg["root"]
    if not root or not Path(root).is_absolute():
        return error("GENERATOR_NOT_CONFIGURED", "SPRITE_GEN_ROOT is not configured.", 503)

    try:
        cli = locate_cli(Path(root))
    except FileNotFoundError:
        return error("GENERATOR_NOT_READY", "sprite-gen executable is missing from its dedicated environment.", 503)

    if not job.sourceObjectRef:
        return error(
            "SOURCE_PHOTO_TRANSFER_NOT_CONFIGURED",
            "Secure temporary source-photo transfer is not configured; no generation was attempted.",
            503,
        )

    work_root = os.getenv("SPRITE_GEN_WORK_ROOT")
    parent = Path(work_root) if work_root else None
    if parent and not parent.is_absolute():
        return error("INVALID_WORK_ROOT", "SPRITE_GEN_WORK_ROOT must be absolute.", 500)

    run_dir: Path | None = None
    try:
        run_dir = Path(tempfile.mkdtemp(prefix=f"nahakids-{job.jobId}-", dir=str(parent) if parent else None))
        safe_log("job_started", jobId=job.jobId, adventure=job.adventure, provider=job.provider)
        result = run_pipeline(job, run_dir, cli)
        safe_log("job_succeeded", jobId=job.jobId)
        return JSONResponse({"ok": True, "jobId": job.jobId, "result": result}, status_code=202)
    except subprocess.TimeoutExpired:
        safe_log("job_failed", jobId=job.jobId, code="GENERATOR_TIMEOUT")
        return error("GENERATOR_TIMEOUT", "Sprite generation exceeded the worker timeout.", 504)
    except RuntimeError as exc:
        code = str(exc)
        safe_log("job_failed", jobId=job.jobId, code=code)
        if code == "SOURCE_PHOTO_TRANSFER_NOT_CONFIGURED":
            return error(code, "Secure temporary source-photo transfer is not configured.", 503)
        return error("GENERATOR_FAILED", "Sprite generation failed QA or execution.", 502)
    except Exception:
        safe_log("job_failed", jobId=job.jobId, code="INTERNAL_ERROR")
        return error("INTERNAL_ERROR", "Unexpected worker failure.", 500)
    finally:
        if run_dir and run_dir.exists():
            shutil.rmtree(run_dir, ignore_errors=True)
        safe_log("temporary_run_deleted", jobId=job.jobId)
