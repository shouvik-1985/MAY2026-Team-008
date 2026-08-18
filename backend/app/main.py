from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.db import Base, SessionLocal, engine, ensure_database_shape
from app.resource_files import backfill_local_study_resource_files
from app.routers import admin, auth, complaints, connect, marketplace, placement, professor, resources, student
from app.seed import seed_demo_data
from app.storage import UPLOAD_ROOT, ensure_upload_dirs


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_upload_dirs()
    Base.metadata.create_all(bind=engine)
    ensure_database_shape()
    db = SessionLocal()
    try:
        seed_demo_data(db)
        marketplace.backfill_local_marketplace_upload_assets(db)
        backfill_local_study_resource_files(db)
    finally:
        db.close()
    yield


settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(complaints.router, prefix="/api")
app.include_router(connect.router, prefix="/api")
app.include_router(marketplace.router, prefix="/api")
app.include_router(placement.router, prefix="/api")
app.include_router(professor.router, prefix="/api")
app.include_router(resources.router, prefix="/api")
app.include_router(student.router, prefix="/api")
ensure_upload_dirs()
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")


@app.get("/api/health", tags=["system"])
def health() -> dict:
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.environment,
    }
