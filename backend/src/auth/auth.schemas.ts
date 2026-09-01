import {
  authOtpRequestSchema,
  authOtpVerifyRequestSchema,
  emptyBodySchema,
} from "@pulse/contract";

export const otpRequestSchema = authOtpRequestSchema;
export const otpVerifySchema = authOtpVerifyRequestSchema;
export { emptyBodySchema };
