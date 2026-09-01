export const AUTH_VALIDATION = {
  otpCodeLength: 6,
} as const;

export const AUTH_RATE_LIMIT = {
  limit: 5,
  windowMs: 60_000,
  resendCooldownMs: 30_000,
  otpExpiresMs: 10 * 60_000,
  otpAttemptCap: 5,
} as const;

export const AUTH_MESSAGES = {
  invalidCredentials: "invalid credentials",
  invalidOtp: "invalid or expired code",
  missingToken: "missing token",
  invalidOrExpiredSession: "invalid or expired session",
  userNotFound: "user not found",
  adminOnly: "admin only",
  dbaOnly: "DBA only",
  tooManyAttempts: "too many attempts",
} as const;

export const AUTH_API_DESCRIPTIONS = {
  otpRequested: "Uniform OTP request acknowledgement.",
  otpVerified: "OTP verified; returns the authenticated user.",
  invalidOtp: "Invalid or expired OTP.",
  tooManyOtpAttempts: "Too many OTP attempts.",
  sessionDeleted: "Session deleted.",
  invalidSession: "Missing, invalid, expired, or revoked session.",
} as const;
