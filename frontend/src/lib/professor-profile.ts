export type EditableProfessorProfile = {
  name: string;
  email: string;
  bio: string;
  phone: string;
  office: string;
  officeHours: string;
  focus: string;
  department: string;
  designation: string;
  expertiseField: string;
  highestEducation: string;
  licenseDocumentName: string;
  avatarUrl?: string | null;
  skills: string[];
};

const PROFILE_KEY = "cv-professor-profile";
const PROFILE_EVENT = "cv-professor-profile-updated";

export function getStoredProfessorProfile(): EditableProfessorProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EditableProfessorProfile;
  } catch {
    return null;
  }
}

export function setStoredProfessorProfile(profile: EditableProfessorProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: profile }));
}

export function clearStoredProfessorProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PROFILE_KEY);
}

export function professorProfileEventName() {
  return PROFILE_EVENT;
}

export function professorInitialsFromName(name: string) {
  return (
    name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "PR"
  );
}
