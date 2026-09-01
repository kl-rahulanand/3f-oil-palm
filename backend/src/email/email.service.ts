export interface OtpEmail {
  to: string;
  code: string;
  expiresInMinutes: number;
}

export interface EmailService {
  sendOtp(email: OtpEmail): Promise<void>;
  acceptsFixedOtp(code: string): boolean;
}

export const MOCK_OTP_CODE = "000000";

export class MockEmailService implements EmailService {
  async sendOtp(_email: OtpEmail): Promise<void> {
    return;
  }

  acceptsFixedOtp(code: string): boolean {
    return code === MOCK_OTP_CODE;
  }
}

export class SesEmailService implements EmailService {
  private readonly region = "ap-south-1";

  async sendOtp(_email: OtpEmail): Promise<void> {
    throw new Error(
      `SES OTP email transport is not enabled; verify sender identity in ${this.region} before use`,
    );
  }

  acceptsFixedOtp(_code: string): boolean {
    return false;
  }
}

export function createEmailService(): EmailService {
  return loadConfig().authOtpMock ? new MockEmailService() : new SesEmailService();
}
import { loadConfig } from "../config";
