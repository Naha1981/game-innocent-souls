from worker.main import SpriteJob, magic_matches, source_path, validate_contract


def valid_job() -> SpriteJob:
    return SpriteJob.model_validate(
        {
            "schemaVersion": "1.0",
            "jobId": "job-12345678",
            "adventure": "football",
            "provider": "codex",
            "source": {"kind": "temporary-child-photo", "mimeType": "image/jpeg", "sizeBytes": 120_000},
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
            "sourceObjectRef": "tmp://1234567890abcdef1234567890abcdef",
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


def test_source_reference_is_required() -> None:
    job = valid_job()
    job.sourceObjectRef = None
    assert validate_contract(job) is not None


def test_source_reference_cannot_escape_source_root() -> None:
    try:
        source_path("/tmp/child.jpg")
    except ValueError:
        pass
    else:
        raise AssertionError("path traversal-style source reference was accepted")


def test_image_magic_is_checked() -> None:
    assert magic_matches("image/jpeg", b"\xff\xd8\xff\xe0")
    assert magic_matches("image/png", b"\x89PNG\r\n\x1a\nrest")
    assert magic_matches("image/webp", b"RIFF0000WEBP")
    assert not magic_matches("image/png", b"not-a-png")
