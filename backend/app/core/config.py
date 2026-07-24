from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


CONFIG_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "CampusVerse API"
    environment: str = "development"
    database_url: str
    jwt_secret: str = "change-me-before-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24
    frontend_origin: str = "http://localhost:5173"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    google_client_id: str | None = None
    allow_demo_google: bool = False
    openai_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_API_KEY", "OPEN_API"),
    )
    openai_model: str = "gpt-5.4-mini"

    model_config = SettingsConfigDict(
        env_file=str(CONFIG_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
