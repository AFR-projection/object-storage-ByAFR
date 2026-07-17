/**
 * All WhatsApp message copy lives here so tone stays consistent: short, plain,
 * no fluff. Codes are sent as their own plain-text message (see otpCodeOnly) so
 * they are always readable and one-tap copyable — no interactive buttons, which
 * Baileys (unofficial) can render as an undecodable "Waiting for this message".
 */

const APP = "Storage ByAFR";

/**
 * First registration message. Greets the user and asks them to reply with the
 * code shown IN THEIR BROWSER. The code is deliberately NOT included here — only
 * the person who submitted the form can see it, which is what proves possession.
 */
export function pairingPrompt(): string {
  return `*${APP}*\n\nHi! To verify your number, reply to this message with the code shown on your screen.`;
}

/**
 * OTP is delivered as TWO messages because Baileys is unofficial and a single
 * message mixing text + code is awkward to copy. Message 1 is the human context;
 * message 2 (otpCodeOnly) is the bare code so the user can copy it in one tap.
 */
export function otpInfo(minutes: number): string {
  return `*${APP}*\n\nHere is your verification code. It is valid for ${minutes} minutes. Do not share it with anyone.`;
}

/** Message 2: the OTP code and nothing else, for one-tap copy. */
export function otpCodeOnly(code: string): string {
  return code;
}

/** Sign-in from an unrecognized device/IP. */
export function loginAlert(opts: {
  time: string;
  ip?: string | null;
  device?: string | null;
}): string {
  const lines = [
    `*${APP}*`,
    ``,
    `New sign-in detected.`,
    ``,
    `Time: ${opts.time}`,
  ];
  if (opts.ip) lines.push(`IP: ${opts.ip}`);
  if (opts.device) lines.push(`Device: ${opts.device}`);
  lines.push(``, `If this wasn't you, change your password immediately.`);
  return lines.join("\n");
}

/** Password was just changed. */
export function passwordChanged(time: string): string {
  return `*${APP}*\n\nYour password was just changed.\n\nTime: ${time}\n\nIf this wasn't you, contact the administrator immediately.`;
}

/** Account temporarily locked after repeated failed logins. */
export function accountLocked(minutes: number): string {
  return `*${APP}*\n\nYour account has been temporarily locked after several failed sign-in attempts.\n\nYou can try again in ${minutes} minutes. If this wasn't you, change your password.`;
}
