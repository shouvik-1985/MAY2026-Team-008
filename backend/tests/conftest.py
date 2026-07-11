import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


TEST_DB_PATH = Path(__file__).resolve().parent / "test_auth.db"

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ALLOW_DEMO_GOOGLE"] = "true"

from app.core.config import get_settings

get_settings.cache_clear()

from app.db import engine
from app.main import app


@pytest.fixture(scope="session")
def client():
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()

    with TestClient(app) as test_client:
        yield test_client

    engine.dispose()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
