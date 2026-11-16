// Authentication failures carry a short code the app translates (src/i18n) and an HTTP status.
// Codes are deliberately vague where detail would help an attacker (one code for wrong username or password).
export class AuthError extends Error {
  constructor(code, statusCode = 401, details = {}) {
    super(code);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const authFailed = () => new AuthError('authFailed', 401);
export const signInRequired = () => new AuthError('signInRequired', 401);
