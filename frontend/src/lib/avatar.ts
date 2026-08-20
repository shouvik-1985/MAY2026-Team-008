import { useEffect, useState } from "react";

const AVATAR_KEY = "cv-user-avatar";
const EVENT_NAME = "cv-user-avatar-changed";
const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_DIMENSION = 512;
const MAX_AVATAR_DATA_URL_LENGTH = 600_000;
const MAX_AVATAR_BLOB_BYTES = Math.floor(MAX_AVATAR_DATA_URL_LENGTH * 0.72);
const AVATAR_WEBP_QUALITY = 0.82;

function shouldPersistAvatar(value: string) {
  return !/^data:/i.test(value) || value.length <= MAX_AVATAR_DATA_URL_LENGTH;
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the selected image"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read the compressed avatar"));
    reader.readAsDataURL(blob);
  });
}

async function compressAvatar(file: File) {
  const image = await loadImageFromFile(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Could not read the selected image dimensions");
  }

  const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the profile photo");
  }
  context.drawImage(image, 0, 0, width, height);

  const webpBlob = await canvasToBlob(canvas, "image/webp", AVATAR_WEBP_QUALITY);
  const fallbackBlob =
    webpBlob && webpBlob.size <= MAX_AVATAR_BLOB_BYTES
      ? webpBlob
      : await canvasToBlob(canvas, "image/jpeg", 0.7);
  if (!fallbackBlob) {
    throw new Error("Could not compress the profile photo");
  }

  const dataUrl = await blobToDataUrl(fallbackBlob);
  if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new Error("Profile photo is still too large after compression. Try a smaller image.");
  }
  return dataUrl;
}

export function getCustomAvatar(): string | null {
  try {
    return localStorage.getItem(AVATAR_KEY);
  } catch {
    return null;
  }
}

export function setCustomAvatar(dataUrl: string | null): void {
  try {
    if (dataUrl && shouldPersistAvatar(dataUrl)) {
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
    if (!file.type.startsWith("image/")) {
      throw new Error("Please select an image file (PNG, JPG, WebP)");
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      throw new Error("Image size should be under 5MB");
    }
    const result = await compressAvatar(file);
    setCustomAvatar(result);
    return result;
  }

  function removeAvatar() {
    setCustomAvatar(null);
  }

  return { avatarUrl, updateAvatar, removeAvatar };
}
