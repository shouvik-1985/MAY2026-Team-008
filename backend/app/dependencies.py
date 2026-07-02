from typing import Annotated
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db import get_db
from app.models import RevokedToken, Role, User
from app.services.redis_client import is_token_revoked


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _is_token_revoked_in_db(db: Session, jwt_id: str) -> bool:
    revoked = db.get(RevokedToken, jwt_id)
    if not revoked:
        return False
    return _aware_datetime(revoked.expires_at) > datetime.now(timezone.utc)


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
        jwt_id_raw = payload.get("jti")
        if not jwt_id_raw:
            raise ValueError("Missing token id")
        jwt_id = str(jwt_id_raw)
    except (TypeError, ValueError):
        raise credentials_error

    if is_token_revoked(jwt_id) or _is_token_revoked_in_db(db, jwt_id):
        raise credentials_error

    user = db.get(User, user_id)
    if not user:
        raise credentials_error
    if user.role != Role.admin and user.is_blocked:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=user.block_reason or "Your account is blocked. Please contact campus administration.",
        )
    return user
