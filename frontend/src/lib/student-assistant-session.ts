import type { StudentAssistantMessage } from "./api";

const ASSISTANT_CHAT_KEY = "cv-student-assistant-chat";

export function defaultStudentAssistantMessages(): StudentAssistantMessage[] {
  return [
    {
      role: "ai",
      text: "Hi, I am your CampusVerse student assistant. Ask me about attendance, CGPA, fees, deadlines, complaints, placements, or any student tab.",
    },
  ];
}

export function getStoredStudentAssistantMessages(): StudentAssistantMessage[] | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ASSISTANT_CHAT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StudentAssistantMessage[];
    if (!Array.isArray(parsed)) return null;
    const messages = parsed.filter(
      (item) =>
        item &&
        (item.role === "user" || item.role === "ai") &&
        typeof item.text === "string" &&
        item.text.trim(),
    );
    return messages.length ? messages.slice(-80) : null;
  } catch {
    return null;
  }
}

export function setStoredStudentAssistantMessages(messages: StudentAssistantMessage[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ASSISTANT_CHAT_KEY, JSON.stringify(messages.slice(-80)));
}

export function clearStoredStudentAssistantMessages() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ASSISTANT_CHAT_KEY);
}
