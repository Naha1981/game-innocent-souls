from worker.main import SpriteJob, validate_contract


def valid_job() -> SpriteJob:
    return SpriteJob.model_validate(
        {
            "schemaVersion": "1.0",
            "jobId": "job-12345678",
            "adventure": "football",
            "provider": "codex",
            "source": {
                "kind": "temporary-child-photo",
                "mimeType": "image/jpeg",
                "sizeBytes": 120_000,
            },
            "character": {
                "style": "friendly-2d-game-character",
                "identityLock": "stylised-only",
                "negative": ["photorealistic-face", "biometric-identification"],
            },
            "states": [
                {"id": "idle", "frames": 4},
                {"id": "walk", "frames": 6},
                {"id": "jump", "frames": 4},
                {"id": "celebrate", "frames": 6},
            ],
            "atlas": {"format": "png", "transparentBackground": True},
            "retention": {"sourcePhoto": "delete-after-generation"},
        }
    )


def test_canonical_contract_is_accepted() -> None:
    assert validate_contract(valid_job()) is None


def test_biometric_identification_is_rejected() -> None:
    job = valid_job()
    job.character["identityLock"] = "biometric"
    assert validate_contract(job) is not None


def test_non_canonical_animation_counts_are_rejected() -> None:
    job = valid_job()
    job.states[1]["frames"] = 5
    assert validate_contract(job) is not None


def test_source_photo_reference_is_optional_at_schema_boundary() -> None:
    # The API deliberately rejects generation without the reference, but contract
    # validation can remain independent from the deployment-specific object store.
    assert valid_job().sourceObjectRef is None
