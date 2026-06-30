from __future__ import annotations

from typing import Any

try:
    from redis import Redis
    from redis.exceptions import RedisError
except ImportError:
    Redis = None  # type: ignore[assignment]
    RedisError = Exception  # type: ignore[assignment]

from app.core.config import get_settings


def get_redis() -> Redis | None:
    if Redis is None:
        return None

    settings = get_settings()
    try:
        client = Redis.from_url(settings.redis_url, decode_responses=True)
        client.ping()
        return client
    except RedisError:
        return None


def cache_token(jwt_id: str, user_id: int, ttl_seconds: int) -> None:
    client = get_redis()
    if client:
        client.setex(f"session:{jwt_id}", ttl_seconds, str(user_id))


def revoke_token(jwt_id: str, ttl_seconds: int) -> None:
    client = get_redis()
    if client:
        client.setex(f"denylist:{jwt_id}", ttl_seconds, "1")


def is_token_revoked(jwt_id: str) -> bool:
    client = get_redis()
    if not client:
        return False
    return client.exists(f"denylist:{jwt_id}") == 1
