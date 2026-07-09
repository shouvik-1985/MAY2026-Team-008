import json
import math
from typing import Iterable

from fastapi import HTTPException

from app.models import StudentProfile

FACE_TEMPLATE_VERSION = "cv-face-lbph-v1"
FACE_TEMPLATE_MIN_LENGTH = 96
FACE_TEMPLATE_MAX_LENGTH = 768
FACE_MATCH_THRESHOLD = 0.93


def _normalize_template(values: Iterable[float]) -> list[float]:
    cleaned: list[float] = []
    for value in values:
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="Face template contains an invalid numeric value") from exc
        if not math.isfinite(number):
            raise HTTPException(status_code=422, detail="Face template contains a non-finite numeric value")
        cleaned.append(number)

    if len(cleaned) < FACE_TEMPLATE_MIN_LENGTH or len(cleaned) > FACE_TEMPLATE_MAX_LENGTH:
        raise HTTPException(status_code=422, detail="Face template payload is incomplete")

    norm = math.sqrt(sum(value * value for value in cleaned))
    if norm <= 0:
        raise HTTPException(status_code=422, detail="Face template payload is empty")

    return [round(value / norm, 8) for value in cleaned]


def has_face_template(profile: StudentProfile | None) -> bool:
    return bool(profile and profile.biometric_template)


def serialize_face_template(values: Iterable[float]) -> str:
    normalized = _normalize_template(values)
    return json.dumps(
        {
            "version": FACE_TEMPLATE_VERSION,
            "length": len(normalized),
            "values": normalized,
        },
        separators=(",", ":"),
    )


def load_face_template(profile: StudentProfile | None) -> list[float] | None:
    if not profile or not profile.biometric_template:
        return None
    try:
        payload = json.loads(profile.biometric_template)
    except json.JSONDecodeError:
        return None
    values = payload.get("values")
    if not isinstance(values, list):
        return None
    return _normalize_template(values)


def save_face_template(profile: StudentProfile, values: Iterable[float], enrolled_at) -> list[float]:
    normalized = _normalize_template(values)
    profile.biometric_template = json.dumps(
        {
            "version": FACE_TEMPLATE_VERSION,
            "length": len(normalized),
            "values": normalized,
        },
        separators=(",", ":"),
    )
    profile.biometric_template_version = FACE_TEMPLATE_VERSION
    profile.biometric_enrolled_at = enrolled_at
    return normalized


def clear_face_template(profile: StudentProfile) -> None:
    profile.biometric_template = None
    profile.biometric_template_version = None
    profile.biometric_enrolled_at = None


def cosine_similarity(stored: Iterable[float], probe: Iterable[float]) -> float:
    stored_list = list(stored)
    probe_list = list(probe)
    if len(stored_list) != len(probe_list):
        raise HTTPException(status_code=422, detail="Stored biometric template format does not match the live scan")
    return round(sum(left * right for left, right in zip(stored_list, probe_list)), 6)


def verify_face_template(profile: StudentProfile, values: Iterable[float]) -> dict:
    stored = load_face_template(profile)
    if stored is None:
        raise HTTPException(status_code=409, detail="Face template is not enrolled for this account")
    probe = _normalize_template(values)
    score = cosine_similarity(stored, probe)
    return {
        "matched": score >= FACE_MATCH_THRESHOLD,
        "score": score,
        "threshold": FACE_MATCH_THRESHOLD,
        "probe": probe,
    }
