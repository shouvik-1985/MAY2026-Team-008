from datetime import date, datetime, timezone
from math import atan2, cos, radians, sin, sqrt
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import CampusAttendanceSetting, StudentBiometricCheckIn

LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")
EARTH_RADIUS_METERS = 6_371_000


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_local() -> date:
    return datetime.now(LOCAL_TIMEZONE).date()


def get_campus_attendance_setting(db: Session) -> CampusAttendanceSetting:
    setting = db.get(CampusAttendanceSetting, 1)
    if setting:
        return setting

    setting = CampusAttendanceSetting(
        id=1,
        campus_name="CampusVerse College",
        radius_meters=100,
        semester_duration_months=6,
    )
    db.add(setting)
    db.flush()
    return setting


def campus_setting_payload(setting: CampusAttendanceSetting) -> dict:
    return {
        "campus_name": setting.campus_name,
        "latitude": setting.latitude,
        "longitude": setting.longitude,
        "radius_meters": setting.radius_meters,
        "semester_duration_months": setting.semester_duration_months,
        "campus_configured": setting.latitude is not None and setting.longitude is not None,
        "updated_at": setting.updated_at.isoformat() if setting.updated_at else None,
    }


def distance_meters(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    d_lat = radians(lat_b - lat_a)
    d_lon = radians(lon_b - lon_a)
    origin_lat = radians(lat_a)
    target_lat = radians(lat_b)
    haversine = sin(d_lat / 2) ** 2 + cos(origin_lat) * cos(target_lat) * sin(d_lon / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * atan2(sqrt(haversine), sqrt(1 - haversine))


def get_today_checkin(db: Session, student_id: int) -> StudentBiometricCheckIn | None:
    return (
        db.query(StudentBiometricCheckIn)
        .filter(
            StudentBiometricCheckIn.student_id == student_id,
            StudentBiometricCheckIn.checkin_date == today_local(),
        )
        .first()
    )


def checkin_payload(checkin: StudentBiometricCheckIn | None) -> dict | None:
    if not checkin:
        return None
    return {
        "id": checkin.id,
        "studentId": checkin.student_id,
        "date": checkin.checkin_date.isoformat(),
        "status": checkin.status,
        "withinRadius": checkin.within_radius,
        "biometricVerified": checkin.biometric_verified,
        "professorConfirmed": checkin.professor_confirmed,
        "warningFlag": checkin.warning_flag,
        "distanceMeters": round(checkin.distance_meters, 1) if checkin.distance_meters is not None else None,
        "detectedAt": checkin.detected_at.isoformat() if checkin.detected_at else None,
        "verifiedAt": checkin.verified_at.isoformat() if checkin.verified_at else None,
        "confirmedAt": checkin.confirmed_at.isoformat() if checkin.confirmed_at else None,
    }
