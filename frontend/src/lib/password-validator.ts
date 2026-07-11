/**
 * Password Strength Validator
 * Enforces strong password policy: minimum 12 chars, at least 1 uppercase, 1 lowercase, 1 number, 1 special char
 */

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export interface PasswordValidation {
  isValid: boolean;
  strength: PasswordStrength;
  errors: string[];
  suggestions: string[];
}

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];
  const suggestions: string[] = [];
  let strength: PasswordStrength = "weak";

  // Length check
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  } else if (password.length < 12) {
    suggestions.push("Consider using 12+ characters for better security");
  }

  // Uppercase check
  if (!/[A-Z]/.test(password)) {
    errors.push("Add at least one uppercase letter (A-Z)");
  }

  // Lowercase check
  if (!/[a-z]/.test(password)) {
    errors.push("Add at least one lowercase letter (a-z)");
  }

  // Number check
  if (!/[0-9]/.test(password)) {
    errors.push("Add at least one number (0-9)");
  }

  // Special character check
  const specialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
  if (!specialChars.test(password)) {
    suggestions.push("Consider adding special characters (!@#$%^&*) for maximum security");
  }

  // Determine strength
  if (errors.length === 0) {
    if (
      password.length >= 12 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      specialChars.test(password)
    ) {
      strength = "strong";
    } else if (password.length >= 10) {
      strength = "good";
    } else {
      strength = "fair";
    }
  }

  return {
    isValid: errors.length === 0,
    strength,
    errors,
    suggestions,
  };
}

export function getPasswordStrengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case "weak":
      return "bg-rose-500";
    case "fair":
      return "bg-amber-500";
    case "good":
      return "bg-blue-500";
    case "strong":
      return "bg-emerald-500";
    default:
      return "bg-gray-500";
  }
}

export function getPasswordStrengthLabel(strength: PasswordStrength): string {
  switch (strength) {
    case "weak":
      return "Weak";
    case "fair":
      return "Fair";
    case "good":
      return "Good";
    case "strong":
      return "Strong";
    default:
      return "Unknown";
  }
}
