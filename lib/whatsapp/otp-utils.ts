import { createHash, randomBytes } from "crypto";

export function generateOTP(length: number = 6): string {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

export function hashOTP(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
