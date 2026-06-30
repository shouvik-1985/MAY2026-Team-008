from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
UPLOAD_ROOT = BACKEND_ROOT / "uploads"
STUDY_RESOURCE_UPLOAD_DIR = UPLOAD_ROOT / "study_resources"
CONNECT_UPLOAD_DIR = UPLOAD_ROOT / "connect"


def ensure_upload_dirs() -> None:
    STUDY_RESOURCE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    CONNECT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
