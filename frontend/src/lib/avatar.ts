import { useEffect, useState } from "react";

const AVATAR_KEY = "cv-user-avatar";
const EVENT_NAME = "cv-user-avatar-changed";

export function getCustomAvatar(): string | null {
  try {
    return localStorage.getItem(AVATAR_KEY);
  } catch {
    return null;
  }
}

export function setCustomAvatar(dataUrl: string | null): void {
  try {
    if (dataUrl) {
      localStorage.setItem(AVATAR_KEY, dataUrl);
    } else {
      localStorage.removeItem(AVATAR_KEY);
    }
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch (err) {
    console.error("Failed to save avatar image", err);
  }
}

export function useUserAvatar(): {
  avatarUrl: string | null;
  updateAvatar: (file: File) => Promise<string>;
  removeAvatar: () => void;
} {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(getCustomAvatar);

  useEffect(() => {
    function handleUpdate() {
      setAvatarUrl(getCustomAvatar());
    }
    window.addEventListener(EVENT_NAME, handleUpdate);
    return () => window.removeEventListener(EVENT_NAME, handleUpdate);
  }, []);

  async function updateAvatar(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Please select an image file (PNG, JPG, WebP)"));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error("Image size should be under 5MB"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setCustomAvatar(result);
        resolve(result);
      };
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });
  }

  function removeAvatar() {
    setCustomAvatar(null);
  }

  return { avatarUrl, updateAvatar, removeAvatar };
}
