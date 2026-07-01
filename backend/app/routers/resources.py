from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import StudyResource
from app.resource_files import local_study_resource_path

router = APIRouter(prefix="/resources", tags=["resources"])


def _content_disposition(filename: str, download: bool) -> str:
    disposition = "attachment" if download else "inline"
    return f"{disposition}; filename*=UTF-8''{quote(filename)}"


@router.get("/{resource_id}/file")
def open_study_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    download: bool = Query(False),
):
    item = db.get(StudyResource, resource_id)
    if not item:
        raise HTTPException(status_code=404, detail="Study resource not found")

    filename = item.filename or f"{item.title}{Path(item.url or '').suffix}"
    content_type = item.content_type or "application/octet-stream"

    if item.file_data:
        return Response(
            content=item.file_data,
            media_type=content_type,
            headers={
                "Content-Disposition": _content_disposition(filename, download),
                "Content-Length": str(item.file_size or len(item.file_data)),
            },
        )

    local_path = local_study_resource_path(item.url)
    if local_path and local_path.exists() and local_path.is_file():
        return FileResponse(
            local_path,
            media_type=content_type,
            filename=filename,
            content_disposition_type="attachment" if download else "inline",
        )

    if item.url and item.url.startswith(("http://", "https://")):
        return RedirectResponse(item.url)

    raise HTTPException(
        status_code=404,
        detail="This file exists only on the uploader's local machine. Ask the professor to re-upload it once.",
    )
