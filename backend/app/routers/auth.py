from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.db import get_db
from app.dependencies import get_current_user
from app.models import AuthProvider, ProfessorProfile, RevokedToken, Role, StudentProfile, User
from app.schemas import GoogleLoginRequest, LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.services.redis_client import cache_token, revoke_token
from app.workers.tasks import audit_login, send_welcome_email

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _student_code(user_id: int) -> str:
    return f"CV-2026-{1000 + user_id:04d}"


def _has_real_google_client_id(client_id: str | None) -> bool:
    return bool(client_id and "your-google-client-id" not in client_id)


def _ensure_student_profile(db: Session, user: User) -> None:
    if user.role != Role.student or user.student_profile:
        return
    seed = user.id % 7
    db.add(
        StudentProfile(
            user_id=user.id,
            student_code=_student_code(user.id),
            department="Computer Science & AI",
            semester=1 + (user.id % 8),
            cgpa=round(8.1 + (seed * 0.13), 1),
            attendance=float(84 + seed),
        )
    )


def _ensure_professor_profile(db: Session, user: User, payload: RegisterRequest) -> None:
    if user.role != Role.faculty or user.professor_profile:
        return

    required = {
        "address": payload.address,
        "gender": payload.gender,
        "highest education": payload.highest_education,
        "expertise field": payload.expertise_field,
        "license document": payload.license_document_name,
    }
    missing = [label for label, value in required.items() if not value or not value.strip()]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Professor registration requires {', '.join(missing)}",
        )

    db.add(
        ProfessorProfile(
            user_id=user.id,
            address=payload.address.strip(),
            gender=payload.gender.strip(),
            highest_education=payload.highest_education.strip(),
            expertise_field=payload.expertise_field.strip(),
            department=(payload.department or "Computer Science & AI").strip(),
            designation=(payload.designation or "Assistant Professor").strip(),
            license_document_name=payload.license_document_name.strip(),
        )
    )


def _enqueue(task, *args) -> None:
    try:
        task.delay(*args)
    except Exception:
        return


def _ensure_student_can_enter(user: User) -> None:
    if user.role == Role.student and user.is_blocked:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=user.block_reason or "Your student account is blocked by a professor.",
        )


def _token_response(user: User) -> TokenResponse:
    _ensure_student_can_enter(user)
    settings = get_settings()
    token, jwt_id, expires_at = create_access_token(subject=str(user.id), role=user.role.value)
    cache_token(jwt_id, user.id, settings.access_token_minutes * 60)
    return TokenResponse(
        access_token=token,
        expires_at=expires_at.isoformat(),
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name.strip(),
        role=payload.role,
        auth_provider=AuthProvider.password,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.flush()
    _ensure_student_profile(db, user)
    _ensure_professor_profile(db, user, payload)
    db.commit()
    db.refresh(user)

    _enqueue(send_welcome_email, user.email, user.full_name)
    _enqueue(audit_login, user.id, "password-register")
    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    _ensure_student_can_enter(user)
    _enqueue(audit_login, user.id, "password")
    return _token_response(user)


@router.post("/google", response_model=TokenResponse)
def google_login(
    payload: GoogleLoginRequest, db: Annotated[Session, Depends(get_db)]
) -> TokenResponse:
    settings = get_settings()
    google_profile: dict[str, str | bool] | None = None

    if _has_real_google_client_id(settings.google_client_id) and payload.credential:
        try:
            from google.auth.transport import requests
            from google.oauth2 import id_token

            google_profile = id_token.verify_oauth2_token(
                payload.credential,
                requests.Request(),
                settings.google_client_id,
            )
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Google token verification failed") from exc
    elif settings.allow_demo_google and payload.email:
        google_profile = {
            "sub": f"demo-google:{payload.email.lower()}",
            "email": payload.email.lower(),
            "name": payload.full_name or payload.email.split("@")[0],
            "email_verified": True,
        }
    else:
        raise HTTPException(status_code=400, detail="Google credential is required")

    if not google_profile.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Google email is not verified")

    email = str(google_profile["email"]).lower()
    google_sub = str(google_profile["sub"])
    full_name = str(google_profile.get("name") or email.split("@")[0])

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            full_name=full_name,
            role=Role.student,
            auth_provider=AuthProvider.google,
            google_sub=google_sub,
        )
        db.add(user)
        db.flush()
        _ensure_student_profile(db, user)
        db.commit()
        db.refresh(user)
        _enqueue(send_welcome_email, user.email, user.full_name)
    else:
        user.auth_provider = AuthProvider.google
        user.google_sub = user.google_sub or google_sub
        if full_name and user.full_name != full_name:
            user.full_name = full_name
        _ensure_student_profile(db, user)
        db.commit()
        db.refresh(user)

    _ensure_student_can_enter(user)
    _enqueue(audit_login, user.id, "google")
    return _token_response(user)


@router.get("/me", response_model=UserOut)
def me(current_user: Annotated[User, Depends(get_current_user)]) -> UserOut:
    return UserOut.model_validate(current_user)


@router.post("/logout")
def logout(token: Annotated[str, Depends(oauth2_scheme)], db: Annotated[Session, Depends(get_db)]) -> dict:
    try:
        payload = decode_access_token(token)
        jwt_id = str(payload["jti"])
        expires_at = datetime.fromtimestamp(int(payload["exp"]), tz=timezone.utc)
        ttl = max(1, int((expires_at - datetime.now(timezone.utc)).total_seconds()))
        revoke_token(jwt_id, ttl)

        try:
            user_id = int(payload.get("sub"))
        except (TypeError, ValueError):
            user_id = None

        revoked = db.get(RevokedToken, jwt_id)
        if revoked:
            revoked.expires_at = expires_at
            revoked.user_id = user_id or revoked.user_id
        else:
            db.add(RevokedToken(jti=jwt_id, user_id=user_id, expires_at=expires_at))

        db.query(RevokedToken).filter(
            RevokedToken.expires_at <= datetime.now(timezone.utc)
        ).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
    return {"ok": True, "message": "Logged out"}
