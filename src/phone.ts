/**
 * Normalise a Nigerian phone number to E.164 (+234XXXXXXXXXX).
 * Accepts 08012345678, 8012345678, 2348012345678, +234 801 234 5678. Other countries pass through if they start with +.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.replace(/[\s\-().]/g, "");
  if (/^\+(?!234)\d{8,15}$/.test(raw)) return raw;
  const digits = raw.replace(/^\+/, "");
  let national: string | null = null;
  if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else if (/^[789]\d{9}$/.test(digits)) national = digits;
  return national ? `+234${national}` : null;
}

/** WhatsApp Cloud API uses numbers without the "+". */
export const toWhatsAppId = (e164: string) => e164.replace(/^\+/, "");

/** GSM conditional call forwarding codes (work on MTN, Airtel, Glo and 9mobile). */
export function forwardingCodes(pickamNumber: string) {
  // Networks accept the local 0XXXXXXXXXX format more reliably than +234 in forwarding codes.
  const n = pickamNumber.replace(/^\+234/, "0");
  return [
    { when: "When you don't answer", code: `**61*${n}#` },
    { when: "When you're busy or reject the call", code: `**67*${n}#` },
    { when: "When your phone is off or has no network", code: `**62*${n}#` },
    { when: "All of the above (recommended)", code: `**004*${n}#` },
    { when: "Turn forwarding off", code: "##004#" },
  ];
}
