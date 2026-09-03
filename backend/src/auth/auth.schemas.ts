import {
  authOtpRequestSchema,
  authOtpVerifyRequestSchema,
  emptyBodySchema,
} from "@3f/contract";

export const otpRequestSchema = authOtpRequestSchema;
export const otpVerifySchema = authOtpVerifyRequestSchema;
export { emptyBodySchema };
