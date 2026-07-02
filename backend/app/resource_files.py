from pathlib import Path

from sqlalchemy.orm import Session

from app.models import StudyResource
from app.storage import STUDY_RESOURCE_UPLOAD_DIR


def resource_file_url(resource_id: int) -> str:
    return f"/api/resources/{resource_id}/file"


def should_use_resource_file_endpoint(item: StudyResource) -> bool:
    return bool(item.file_data) or bool(item.url and item.url.startswith("/uploads/study_resources/"))


def public_resource_url(item: StudyResource) -> str:
    if should_use_resource_file_endpoint(item):
        return resource_file_url(item.id)
    return item.url or ""


def local_study_resource_path(url: str | None) -> Path | None:
    if not url or not url.startswith("/uploads/study_resources/"):
        return None
    return STUDY_RESOURCE_UPLOAD_DIR / Path(url).name


def backfill_local_study_resource_files(db: Session) -> int:
    rows = (
        db.query(StudyResource)
        .filter(StudyResource.file_data.is_(None), StudyResource.url.like("/uploads/study_resources/%"))
        .all()
    )
    updated = 0
    for item in rows:
        path = local_study_resource_path(item.url)
        if not path or not path.exists() or not path.is_file():
            continue

        data = path.read_bytes()
        item.file_data = data
        item.file_size = len(data)
        item.filename = item.filename or path.name.split("_", 2)[-1]
        item.content_type = item.content_type or "application/octet-stream"
        item.url = resource_file_url(item.id)
        updated += 1

    if updated:
        db.commit()
    return updated
