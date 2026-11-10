// Email through Brevo's transactional API (free plan: 300 emails a day).
import { config } from "./config.js";

export const emailConfigured = () => !!(config.brevo.apiKey && config.brevo.senderEmail);

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A simple branded email: a heading, a few paragraphs, optional big code. Returns false when email isn't set up. */
export async function sendEmail(to: string, subject: string, opts: { heading: string; lines: string[]; code?: string }): Promise<boolean> {
  if (!emailConfigured() || !to) return false;
  const text = [opts.heading, "", ...(opts.code ? [opts.code, ""] : []), ...opts.lines].join("\n");
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f1a14">
    <div style="font-size:22px;font-weight:800;letter-spacing:-.02em"><span style="color:#0a7a3e">Pick</span>am</div>
    <h1 style="font-size:20px;margin:24px 0 12px">${escapeHtml(opts.heading)}</h1>
    ${opts.code ? `<div style="font:700 32px monospace;letter-spacing:8px;background:#f1eee6;border-radius:12px;padding:18px;text-align:center;margin:16px 0">${escapeHtml(opts.code)}</div>` : ""}
    ${opts.lines.map((l) => `<p style="font-size:15px;line-height:1.5;color:#3d4a42;margin:0 0 10px">${escapeHtml(l)}</p>`).join("")}
    <p style="font-size:12px;color:#9aa59e;margin-top:24px">Pickam · Your AI receptionist</p></div>`;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": config.brevo.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: config.brevo.senderEmail, name: config.brevo.senderName },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });
  if (!res.ok) throw new Error(`Brevo email failed: ${res.status} ${await res.text()}`);
  return true;
}
