export type EditableStudentProfile = {
  name: string;
  email: string;
  bio: string;
  phone: string;
  address: string;
  focus: string;
  skills: string[];
};

const PROFILE_KEY = "cv-student-profile";
const PROFILE_EVENT = "cv-student-profile-updated";

export function getStoredStudentProfile(): EditableStudentProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EditableStudentProfile;
  } catch {
    return null;
  }
}

export function setStoredStudentProfile(profile: EditableStudentProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: profile }));
}

export function clearStoredStudentProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PROFILE_KEY);
}

export function studentProfileEventName() {
  return PROFILE_EVENT;
}

export function initialsFromName(name: string) {
  return (
    name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "CV"
  );
}
