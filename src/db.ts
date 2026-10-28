import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "./config.js";

export type AlertMode = "ring" | "notify" | "digest";
export type Urgency = "low" | "normal" | "urgent";

export interface Settings {
  /** Name the AI introduces itself with, e.g. "Ada". */
  agentName: string;
  /** First thing the AI says when it picks up. Empty = generated from the business and AI name. */
  greeting: string;
  /** "english" = clear Nigerian English; "pidgin" = switches to Pidgin when the caller does. */
  languageStyle: "english" | "pidgin";
  /** Minutes the AI promises the owner will call back within. */
  callbackMinutes: number;
  /** How hard to alert the owner, per urgency level. */
  alerts: Record<Urgency, AlertMode>;
  /** Send alerts to the owner's WhatsApp. */
  whatsappAlerts: boolean;
  /** Send SMS when WhatsApp is off or fails, and always for "ring" alerts. */
  smsAlerts: boolean;
  /** During quiet hours, everything except "urgent" is held for the digest. 24h "HH:MM", Africa/Lagos time. */
  quietHours: { enabled: boolean; start: string; end: string };
  /** Text the customer an apology if the promised callback time passes. */
  apologySms: boolean;
  /** When the owner answers a callback, the AI phones the customer with the answer by default. */
  aiCallsBack: boolean;
  /** Daily WhatsApp summary of yesterday's calls, orders and pending callbacks. */
  dailySummary: { enabled: boolean; time: string };
  /** Let the AI take orders and quote totals. */
  takeOrders: boolean;
  /** Text the caller a Paystack link to pay for their order (needs a payout account). */
  paymentLinks: boolean;
  /** Read out to customers after an order when payment links are off. */
  paymentInstructions: string;
  /** Things the AI must never do or promise, written by the owner. */
  extraRules: string;
}

export const defaultSettings = (): Settings => ({
  agentName: "Ada",
  greeting: "",
  languageStyle: "pidgin",
  callbackMinutes: 10,
  alerts: { low: "digest", normal: "notify", urgent: "ring" },
  whatsappAlerts: true,
  smsAlerts: true,
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
  apologySms: true,
  aiCallsBack: true,
  dailySummary: { enabled: true, time: "08:00" },
  takeOrders: true,
  paymentLinks: true,
  paymentInstructions: "",
  extraRules: "",
});

export const greetingFor = (b: Pick<Business, "name" | "settings">) =>
  b.settings.greeting ||
  `Hello, thank you for calling ${b.name}! I'm ${b.settings.agentName}, the virtual assistant. How can I help you today?`;

export interface Business {
  id: string;
  name: string;
  description: string;
  category: string;
  location: string;
  openingHours: string;
  deliveryInfo: string;
  ownerName: string;
  ownerPhone: string;
  ownerToken: string;
  toolSecret: string;
  agentId: string | null;
  plan: string;
  planExpiresAt: string;
  periodStart: string;
  walletNaira: number;
  /** The Pickam number customers' calls are answered on. */
  phoneNumber: string | null;
  paystackSubaccount: string | null;
  payoutAccountName: string | null;
  onboarded: boolean;
  lastDigestDate: string | null;
  settings: Settings;
  createdAt: string;
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) openDb(config.databasePath);
  return db!;
}

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      opening_hours TEXT NOT NULL DEFAULT '',
      delivery_info TEXT NOT NULL DEFAULT '',
      owner_name TEXT NOT NULL DEFAULT '',
      owner_phone TEXT NOT NULL DEFAULT '',
      owner_token TEXT NOT NULL UNIQUE,
      tool_secret TEXT NOT NULL,
      agent_id TEXT UNIQUE,
      plan TEXT NOT NULL DEFAULT 'trial',
      plan_expires_at TEXT NOT NULL,
      period_start TEXT NOT NULL,
      wallet_naira INTEGER NOT NULL DEFAULT 0,
      phone_number TEXT,
      paystack_subaccount TEXT,
      payout_account_name TEXT,
      onboarded INTEGER NOT NULL DEFAULT 0,
      last_digest_date TEXT,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS businesses_owner_phone ON businesses(owner_phone) WHERE owner_phone != '';

    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      question TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price_naira INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      available INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS escalations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      conversation_id TEXT,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      urgency TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'open',
      owner_answer TEXT,
      callback_due_at TEXT NOT NULL,
      reminded_at TEXT,
      ai_callback_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      conversation_id TEXT,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL,
      total_naira INTEGER NOT NULL,
      delivery_address TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      payment_link TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calls (
      conversation_id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      customer_phone TEXT NOT NULL DEFAULT '',
      duration_secs INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      transcript_json TEXT NOT NULL DEFAULT '[]',
      successful TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      phone TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL,
      sent_in_window INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      reference TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,            -- plan | wallet | order
      amount_naira INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      amount_naira INTEGER NOT NULL,     -- positive = credit, negative = debit
      reason TEXT NOT NULL,
      ref TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS phone_numbers (
      number TEXT PRIMARY KEY,
      elevenlabs_phone_number_id TEXT,
      business_id TEXT UNIQUE REFERENCES businesses(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Links WhatsApp alerts we sent to the escalation they were about, so a swipe-reply answers it.
    CREATE TABLE IF NOT EXISTS wa_messages (
      wa_message_id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      escalation_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export const randomToken = () => randomBytes(24).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

type Row = Record<string, any>;

function toBusiness(row: Row | undefined): Business | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    location: row.location,
    openingHours: row.opening_hours,
    deliveryInfo: row.delivery_info,
    ownerName: row.owner_name,
    ownerPhone: row.owner_phone,
    ownerToken: row.owner_token,
    toolSecret: row.tool_secret,
    agentId: row.agent_id,
    plan: row.plan,
    planExpiresAt: row.plan_expires_at,
    periodStart: row.period_start,
    walletNaira: row.wallet_naira,
    phoneNumber: row.phone_number,
    paystackSubaccount: row.paystack_subaccount,
    payoutAccountName: row.payout_account_name,
    onboarded: row.onboarded === 1,
    lastDigestDate: row.last_digest_date,
    // Merge so settings added in later versions get their defaults.
    settings: { ...defaultSettings(), ...JSON.parse(row.settings_json) },
    createdAt: row.created_at,
  };
}

export const TRIAL_DAYS = 14;

export function createBusiness(input: { name?: string; ownerName?: string; ownerPhone?: string; plan?: string }): Business {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO businesses (id, name, owner_name, owner_phone, owner_token, tool_secret, plan, plan_expires_at, period_start, settings_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name ?? "",
      input.ownerName ?? "",
      input.ownerPhone ?? "",
      randomToken(),
      randomToken(),
      input.plan ?? "trial",
      daysFromNow(TRIAL_DAYS),
      now,
      JSON.stringify(defaultSettings()),
    );
  return getBusiness(id)!;
}

export const getBusiness = (id: string) => toBusiness(getDb().prepare("SELECT * FROM businesses WHERE id = ?").get(id) as Row);
export const getBusinessByToken = (t: string) =>
  toBusiness(getDb().prepare("SELECT * FROM businesses WHERE owner_token = ?").get(t) as Row);
export const getBusinessByAgentId = (agentId: string) =>
  toBusiness(getDb().prepare("SELECT * FROM businesses WHERE agent_id = ?").get(agentId) as Row);
export const getBusinessByOwnerPhone = (phone: string) =>
  toBusiness(getDb().prepare("SELECT * FROM businesses WHERE owner_phone = ? AND owner_phone != ''").get(phone) as Row);
export const listBusinesses = () => (getDb().prepare("SELECT * FROM businesses").all() as Row[]).map((r) => toBusiness(r)!);

export type BusinessProfile = Pick<
  Business,
  "name" | "description" | "category" | "location" | "openingHours" | "deliveryInfo" | "ownerName"
>;

export function updateBusiness(id: string, profile: Partial<BusinessProfile>, settings?: Partial<Settings>) {
  const current = getBusiness(id);
  if (!current) throw new Error("business not found");
  const next = { ...current, ...profile, settings: { ...current.settings, ...settings } };
  getDb()
    .prepare(
      `UPDATE businesses SET name = ?, description = ?, category = ?, location = ?, opening_hours = ?,
       delivery_info = ?, owner_name = ?, settings_json = ? WHERE id = ?`,
    )
    .run(
      next.name,
      next.description,
      next.category,
      next.location,
      next.openingHours,
      next.deliveryInfo,
      next.ownerName,
      JSON.stringify(next.settings),
      id,
    );
  return getBusiness(id)!;
}

/** Update internal (non-owner-editable) columns. */
export function setBusinessFields(
  id: string,
  fields: Partial<{
    agent_id: string;
    plan: string;
    plan_expires_at: string;
    period_start: string;
    phone_number: string;
    paystack_subaccount: string;
    payout_account_name: string;
    onboarded: number;
    last_digest_date: string;
  }>,
) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  getDb()
    .prepare(`UPDATE businesses SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...(Object.values(fields) as (string | number)[]), id);
}

export const setAgentId = (businessId: string, agentId: string) => setBusinessFields(businessId, { agent_id: agentId });

// ---- Auth: one-time codes and sessions ----------------------------------------------

export interface OtpRow {
  phone: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  window_start: number;
  sent_in_window: number;
}

export const getOtp = (phone: string) => getDb().prepare("SELECT * FROM otp_codes WHERE phone = ?").get(phone) as unknown as OtpRow | undefined;

export function saveOtp(row: OtpRow) {
  getDb()
    .prepare(
      `INSERT INTO otp_codes (phone, code_hash, expires_at, attempts, window_start, sent_in_window) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = excluded.attempts,
         window_start = excluded.window_start, sent_in_window = excluded.sent_in_window`,
    )
    .run(row.phone, row.code_hash, row.expires_at, row.attempts, row.window_start, row.sent_in_window);
}

export const bumpOtpAttempts = (phone: string) => getDb().prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?").run(phone);
/** Spend the code but keep the row, so the hourly send limit still applies. */
export const consumeOtp = (phone: string) => getDb().prepare("UPDATE otp_codes SET expires_at = 0 WHERE phone = ?").run(phone);

export const SESSION_DAYS = 30;

export function createSession(businessId: string): string {
  const token = randomToken();
  getDb()
    .prepare("INSERT INTO sessions (token_hash, business_id, expires_at) VALUES (?, ?, ?)")
    .run(sha256(token), businessId, Date.now() + SESSION_DAYS * 86_400_000);
  return token;
}

export function getBusinessBySession(token: string): Business | null {
  const row = getDb().prepare("SELECT business_id, expires_at FROM sessions WHERE token_hash = ?").get(sha256(token)) as Row | undefined;
  return row && row.expires_at > Date.now() ? getBusiness(row.business_id) : null;
}

export const deleteSession = (token: string) => getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));

// ---- FAQs and owner notes -------------------------------------------------------------

export interface Faq {
  id: number;
  /** Empty for free-form notes (e.g. an owner's WhatsApp voice note). */
  question: string;
  answer: string;
  source: "owner" | "learned" | "whatsapp";
}

export const listFaqs = (businessId: string) =>
  getDb().prepare("SELECT id, question, answer, source FROM faqs WHERE business_id = ? ORDER BY id").all(businessId) as unknown as Faq[];

export function addFaq(businessId: string, question: string, answer: string, source: Faq["source"] = "owner"): number {
  return Number(
    getDb().prepare("INSERT INTO faqs (business_id, question, answer, source) VALUES (?, ?, ?, ?)").run(businessId, question, answer, source)
      .lastInsertRowid,
  );
}

export function deleteFaq(businessId: string, id: number) {
  getDb().prepare("DELETE FROM faqs WHERE business_id = ? AND id = ?").run(businessId, id);
}

// ---- Products ---------------------------------------------------------------

export interface Product {
  id: number;
  name: string;
  priceNaira: number;
  description: string;
  available: boolean;
}

export const listProducts = (businessId: string): Product[] =>
  (getDb().prepare("SELECT * FROM products WHERE business_id = ? ORDER BY name").all(businessId) as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    priceNaira: r.price_naira,
    description: r.description,
    available: r.available === 1,
  }));

export function addProduct(businessId: string, p: Omit<Product, "id">): number {
  return Number(
    getDb()
      .prepare("INSERT INTO products (business_id, name, price_naira, description, available) VALUES (?, ?, ?, ?, ?)")
      .run(businessId, p.name, p.priceNaira, p.description, p.available ? 1 : 0).lastInsertRowid,
  );
}

export function setProductAvailable(businessId: string, id: number, available: boolean) {
  getDb().prepare("UPDATE products SET available = ? WHERE business_id = ? AND id = ?").run(available ? 1 : 0, businessId, id);
}

export function deleteProduct(businessId: string, id: number) {
  getDb().prepare("DELETE FROM products WHERE business_id = ? AND id = ?").run(businessId, id);
}

// ---- Escalations --------------------------------------------------------------

export interface Escalation {
  id: number;
  business_id: string;
  conversation_id: string | null;
  customer_name: string;
  customer_phone: string;
  question: string;
  summary: string;
  urgency: Urgency;
  status: "open" | "acknowledged" | "resolved";
  owner_answer: string | null;
  callback_due_at: string;
  reminded_at: string | null;
  /** null = no AI callback; "calling" | "failed" | "no_number" */
  ai_callback_status: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function createEscalation(
  businessId: string,
  e: Pick<Escalation, "conversation_id" | "customer_name" | "customer_phone" | "question" | "summary" | "urgency">,
  callbackMinutes: number,
): Escalation {
  const due = new Date(Date.now() + callbackMinutes * 60_000).toISOString();
  const id = getDb()
    .prepare(
      `INSERT INTO escalations (business_id, conversation_id, customer_name, customer_phone, question, summary, urgency, callback_due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(businessId, e.conversation_id, e.customer_name, e.customer_phone, e.question, e.summary, e.urgency, due).lastInsertRowid;
  return getDb().prepare("SELECT * FROM escalations WHERE id = ?").get(id) as unknown as Escalation;
}

export const listEscalations = (businessId: string, status?: Escalation["status"]) =>
  (status
    ? getDb().prepare("SELECT * FROM escalations WHERE business_id = ? AND status = ? ORDER BY id DESC").all(businessId, status)
    : getDb().prepare("SELECT * FROM escalations WHERE business_id = ? ORDER BY id DESC LIMIT 200").all(businessId)) as unknown as Escalation[];

export const getEscalation = (businessId: string, id: number) =>
  getDb().prepare("SELECT * FROM escalations WHERE business_id = ? AND id = ?").get(businessId, id) as unknown as Escalation | undefined;

export function updateEscalation(businessId: string, id: number, status: Escalation["status"], ownerAnswer?: string) {
  getDb()
    .prepare(
      `UPDATE escalations SET status = ?, owner_answer = COALESCE(?, owner_answer),
       resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE resolved_at END
       WHERE business_id = ? AND id = ?`,
    )
    .run(status, ownerAnswer ?? null, status, businessId, id);
}

export const setEscalationCallbackStatus = (id: number, status: string) =>
  getDb().prepare("UPDATE escalations SET ai_callback_status = ? WHERE id = ?").run(status, id);

/** Open escalations whose promised callback time has passed and that have not been chased yet. */
export const listOverdueEscalations = (nowIso: string) =>
  getDb()
    .prepare("SELECT * FROM escalations WHERE status = 'open' AND reminded_at IS NULL AND callback_due_at < ?")
    .all(nowIso) as unknown as Escalation[];

export const markEscalationReminded = (id: number) =>
  getDb().prepare("UPDATE escalations SET reminded_at = datetime('now') WHERE id = ?").run(id);

export function linkWhatsAppMessage(waMessageId: string, businessId: string, escalationId: number) {
  getDb().prepare("INSERT OR IGNORE INTO wa_messages (wa_message_id, business_id, escalation_id) VALUES (?, ?, ?)").run(waMessageId, businessId, escalationId);
}

export function escalationForWhatsAppMessage(businessId: string, waMessageId: string): Escalation | undefined {
  const row = getDb().prepare("SELECT escalation_id FROM wa_messages WHERE business_id = ? AND wa_message_id = ?").get(businessId, waMessageId) as Row | undefined;
  return row ? getEscalation(businessId, row.escalation_id) : undefined;
}

// ---- Orders -------------------------------------------------------------------

export interface OrderItem {
  name: string;
  quantity: number;
  unitPriceNaira: number;
}

export function createOrder(
  businessId: string,
  o: { conversationId: string | null; customerName: string; customerPhone: string; items: OrderItem[]; deliveryAddress: string; notes: string },
) {
  const total = o.items.reduce((sum, i) => sum + i.quantity * i.unitPriceNaira, 0);
  const id = getDb()
    .prepare(
      `INSERT INTO orders (business_id, conversation_id, customer_name, customer_phone, items_json, total_naira, delivery_address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(businessId, o.conversationId, o.customerName, o.customerPhone, JSON.stringify(o.items), total, o.deliveryAddress, o.notes).lastInsertRowid;
  return { id: Number(id), totalNaira: total };
}

export const listOrders = (businessId: string) =>
  (getDb().prepare("SELECT * FROM orders WHERE business_id = ? ORDER BY id DESC LIMIT 200").all(businessId) as Row[]).map((r) => ({
    ...r,
    items: JSON.parse(r.items_json) as OrderItem[],
  }));

export function updateOrderStatus(businessId: string, id: number, status: string) {
  getDb().prepare("UPDATE orders SET status = ? WHERE business_id = ? AND id = ?").run(status, businessId, id);
}

export function setOrderPayment(id: number, fields: { payment_status?: string; payment_link?: string }) {
  if (fields.payment_status) getDb().prepare("UPDATE orders SET payment_status = ? WHERE id = ?").run(fields.payment_status, id);
  if (fields.payment_link) getDb().prepare("UPDATE orders SET payment_link = ? WHERE id = ?").run(fields.payment_link, id);
}

// ---- Calls & usage ------------------------------------------------------------------

export const callExists = (conversationId: string) =>
  !!getDb().prepare("SELECT 1 FROM calls WHERE conversation_id = ?").get(conversationId);

export function upsertCall(
  businessId: string,
  c: { conversationId: string; customerPhone: string; durationSecs: number; summary: string; transcript: unknown; successful: string },
) {
  getDb()
    .prepare(
      `INSERT INTO calls (conversation_id, business_id, customer_phone, duration_secs, summary, transcript_json, successful)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET duration_secs = excluded.duration_secs, summary = excluded.summary,
         transcript_json = excluded.transcript_json, successful = excluded.successful`,
    )
    .run(c.conversationId, businessId, c.customerPhone, c.durationSecs, c.summary, JSON.stringify(c.transcript), c.successful);
}

export const listCalls = (businessId: string) =>
  getDb()
    .prepare(
      "SELECT conversation_id, customer_phone, duration_secs, summary, successful, created_at FROM calls WHERE business_id = ? ORDER BY created_at DESC LIMIT 200",
    )
    .all(businessId);

export const getCall = (businessId: string, conversationId: string) => {
  const row = getDb().prepare("SELECT * FROM calls WHERE business_id = ? AND conversation_id = ?").get(businessId, conversationId) as Row | undefined;
  return row ? { ...row, transcript: JSON.parse(row.transcript_json) } : undefined;
};

/** Billable minutes since the given time, excluding one call. Each call is rounded up to the next full minute. */
export function minutesUsedSince(businessId: string, sinceIso: string, excludeConversationId = ""): number {
  // created_at uses SQLite's "YYYY-MM-DD HH:MM:SS" (UTC); compare in the same format.
  const since = sinceIso.replace("T", " ").slice(0, 19);
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM((duration_secs + 59) / 60), 0) AS minutes FROM calls
       WHERE business_id = ? AND created_at >= ? AND conversation_id != ?`,
    )
    .get(businessId, since, excludeConversationId) as Row;
  return Number(row.minutes);
}

/** Calls, orders and escalations created in a UTC time range, for the daily summary. */
export function activityBetween(businessId: string, fromIso: string, toIso: string) {
  const from = fromIso.replace("T", " ").slice(0, 19);
  const to = toIso.replace("T", " ").slice(0, 19);
  const d = getDb();
  const calls = (d.prepare("SELECT COUNT(*) AS n FROM calls WHERE business_id = ? AND created_at >= ? AND created_at < ?").get(businessId, from, to) as Row).n;
  const orders = d
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total_naira), 0) AS total FROM orders WHERE business_id = ? AND created_at >= ? AND created_at < ? AND status != 'cancelled'")
    .get(businessId, from, to) as Row;
  const questions = d
    .prepare("SELECT question FROM escalations WHERE business_id = ? AND created_at >= ? AND created_at < ? ORDER BY id DESC LIMIT 3")
    .all(businessId, from, to) as Row[];
  const pending = (d.prepare("SELECT COUNT(*) AS n FROM escalations WHERE business_id = ? AND status != 'resolved'").get(businessId) as Row).n;
  return {
    calls: Number(calls),
    orders: Number(orders.n),
    orderTotalNaira: Number(orders.total),
    pendingCallbacks: Number(pending),
    unansweredQuestions: questions.map((q) => q.question as string),
  };
}

// ---- Payments & wallet --------------------------------------------------------------

export interface Payment {
  reference: string;
  business_id: string;
  purpose: "plan" | "wallet" | "order";
  amount_naira: number;
  status: "pending" | "success";
  meta: Record<string, any>;
}

export function createPayment(p: Omit<Payment, "status">) {
  getDb()
    .prepare("INSERT INTO payments (reference, business_id, purpose, amount_naira, meta_json) VALUES (?, ?, ?, ?, ?)")
    .run(p.reference, p.business_id, p.purpose, p.amount_naira, JSON.stringify(p.meta));
}

export function getPayment(reference: string): Payment | undefined {
  const row = getDb().prepare("SELECT * FROM payments WHERE reference = ?").get(reference) as Row | undefined;
  return row ? ({ ...row, meta: JSON.parse(row.meta_json) } as Payment) : undefined;
}

/** Marks a pending payment successful. Returns false if it was already processed (webhooks retry). */
export const markPaymentSuccess = (reference: string) =>
  Number(getDb().prepare("UPDATE payments SET status = 'success' WHERE reference = ? AND status = 'pending'").run(reference).changes) === 1;

export function adjustWallet(businessId: string, amountNaira: number, reason: string, ref?: string) {
  if (amountNaira === 0) return;
  getDb().prepare("UPDATE businesses SET wallet_naira = wallet_naira + ? WHERE id = ?").run(amountNaira, businessId);
  getDb().prepare("INSERT INTO wallet_ledger (business_id, amount_naira, reason, ref) VALUES (?, ?, ?, ?)").run(businessId, amountNaira, reason, ref ?? null);
}

export const listWalletLedger = (businessId: string) =>
  getDb().prepare("SELECT amount_naira, reason, ref, created_at FROM wallet_ledger WHERE business_id = ? ORDER BY id DESC LIMIT 50").all(businessId);

// ---- Phone number pool ------------------------------------------------------------------

export interface PoolNumber {
  number: string;
  elevenlabs_phone_number_id: string | null;
  business_id: string | null;
}

export function addPoolNumber(number: string, elevenlabsId: string | null) {
  getDb().prepare("INSERT INTO phone_numbers (number, elevenlabs_phone_number_id) VALUES (?, ?)").run(number, elevenlabsId);
}

export const listPoolNumbers = () => getDb().prepare("SELECT * FROM phone_numbers ORDER BY created_at").all() as unknown as PoolNumber[];
export const getPoolNumberForBusiness = (businessId: string) =>
  getDb().prepare("SELECT * FROM phone_numbers WHERE business_id = ?").get(businessId) as unknown as PoolNumber | undefined;

/** Atomically reserve a free number for a business. */
export function claimPoolNumber(businessId: string): PoolNumber | undefined {
  const row = getDb()
    .prepare(
      "UPDATE phone_numbers SET business_id = ? WHERE number = (SELECT number FROM phone_numbers WHERE business_id IS NULL ORDER BY created_at LIMIT 1) RETURNING *",
    )
    .get(businessId) as unknown as PoolNumber | undefined;
  return row;
}

export const releasePoolNumber = (number: string) => getDb().prepare("UPDATE phone_numbers SET business_id = NULL WHERE number = ?").run(number);
