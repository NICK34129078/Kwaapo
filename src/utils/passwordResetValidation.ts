export const PASSWORD_MIN_LENGTH = 6;

export type PasswordResetFieldErrors = {
  password?: string;
  confirmPassword?: string;
};

export function validateNewPassword(password: string): string | null {
  const value = password.trim();
  if (!value) {
    return "Vul een nieuw wachtwoord in.";
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Wachtwoord moet minimaal ${PASSWORD_MIN_LENGTH} tekens zijn.`;
  }
  return null;
}

export function validatePasswordConfirmation(
  password: string,
  confirmPassword: string
): string | null {
  const confirmError = validateNewPassword(confirmPassword);
  if (confirmError && !confirmPassword.trim()) {
    return "Herhaal je nieuwe wachtwoord.";
  }
  if (password !== confirmPassword) {
    return "Wachtwoorden komen niet overeen.";
  }
  return null;
}

export function validatePasswordResetForm(
  password: string,
  confirmPassword: string
): PasswordResetFieldErrors {
  const errors: PasswordResetFieldErrors = {};
  const passwordError = validateNewPassword(password);
  if (passwordError) {
    errors.password = passwordError;
  }
  const confirmError = validatePasswordConfirmation(password, confirmPassword);
  if (confirmError) {
    errors.confirmPassword = confirmError;
  }
  return errors;
}
