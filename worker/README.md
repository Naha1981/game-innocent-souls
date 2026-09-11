# Sprite Generation Worker

FastAPI worker boundary for NahaKids Game Factory.

## Contract

The worker receives the metadata-only `SpriteGenJob` contract. A source child photo is **never accepted as base64 or embedded JSON**. Instead, the web server uploads the temporary image to `POST /source-photo` and receives an opaque `tmp://...` reference. The reference expires after 15 minutes and is deleted after generation, including failed runs.

The worker:

1. validates the job and safety invariants;
2. accepts only JPEG, PNG or WebP source images up to 8 MB;
3. creates an opaque temporary source reference;
4. creates an isolated generation run directory;
5. invokes the canonical `sprite-gen` pipeline when configured;
6. validates the published atlas/manifest;
7. deletes temporary source material and run files in `finally`;
8. emits structured logs without child names, image bytes, or source URLs.

If `SPRITE_GEN_ROOT` or the provider executable is missing, the worker fails honestly. It never returns a successful generated asset for an unconfigured generator.

## Local setup

Python 3.10+ is required by sprite-gen 2.1.0. Install worker dependencies, install `aldegad/sprite-gen` into its own dedicated virtual environment, then set `SPRITE_GEN_ROOT` to that absolute installation path.

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
- `SPRITE_GEN_SHARED_SECRET` — server-to-worker secret. Set this in production; never expose it to the browser.
- `SPRITE_GEN_SOURCE_ROOT` — ephemeral directory for uploaded source photos; defaults to the OS temp directory.
- `SPRITE_GEN_WORK_ROOT` — optional isolated run root; defaults to a temporary OS directory.
- `SPRITE_GEN_PROVIDER` — `codex` or `grok`; defaults to `codex`.
- `SPRITE_GEN_TIMEOUT_SECONDS` — hard subprocess timeout; defaults to 900.

The provider CLI must already be authenticated in the worker environment. Credentials are never sent through the NahaKids web app.

## Endpoints

`GET /health` reports generator readiness without exposing secrets.

`POST /source-photo` accepts a multipart image and returns a short-lived opaque source reference. The source reference is not a public URL and is valid only inside the worker.

`POST /generate` accepts the canonical generation metadata plus the opaque `sourceObjectRef`. It runs `prepare → gen-set → extract → compose-atlas → inspect`, validates `manifest.json` and `sprite-sheet-alpha.png`, and then deletes the temporary source/run.

The web app uses `/api/generation/source` as its server-side proxy for source intake and `/api/generation` for the generation request. This keeps the worker secret out of browser code.
