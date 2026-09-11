# Sprite Generation Worker

FastAPI worker boundary for NahaKids Game Factory.

## Contract

The worker receives the metadata-only `SpriteGenJob` contract. A source child photo is **not** accepted as base64 or embedded JSON. Production photo transfer must use a short-lived object reference handled by the deployment layer.

The worker:

1. validates the job and safety invariants;
2. creates an isolated run directory;
3. invokes the pinned `sprite-gen` CLI when configured;
4. validates the published atlas/manifest;
5. returns a runtime manifest;
6. deletes temporary source material in `finally`;
7. emits structured logs without child names, image bytes, or source URLs.

If `SPRITE_GEN_ROOT` or the provider executable is missing, the worker fails honestly. It never returns a successful generated asset for an unconfigured generator.

## Local setup

Python 3.10+ is required by sprite-gen 2.1.0. Install dependencies, install `aldegad/sprite-gen` into its own virtual environment, then set `SPRITE_GEN_ROOT` to that absolute installation path.

```bash
python -m venv .venv
.venv\\Scripts\\pip install -r worker/requirements.txt
```

On Linux:

```bash
python3 -m venv .venv
.venv/bin/pip install -r worker/requirements.txt
```

Run:

```bash
uvicorn worker.main:app --reload
```

## Environment

- `SPRITE_GEN_ROOT` — absolute installed sprite-gen repository path. Required for real generation.
- `SPRITE_GEN_PROVIDER` — `codex` or `grok`; defaults to `codex`.
- `SPRITE_GEN_TIMEOUT_SECONDS` — hard subprocess timeout; defaults to 900.
- `SPRITE_GEN_WORK_ROOT` — optional isolated run root; defaults to a temporary OS directory.

The provider CLI must already be authenticated in the worker environment. Credentials are never sent through the NahaKids web app.

## Endpoint

`GET /health` reports configuration readiness without exposing secrets.

`POST /generate` accepts the canonical generation metadata. Until secure source-object transfer is implemented, requests are rejected with `SOURCE_PHOTO_TRANSFER_NOT_CONFIGURED` rather than pretending the photo exists on the worker.
