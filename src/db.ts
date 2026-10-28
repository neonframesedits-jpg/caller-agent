import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { config } from "./config.js";

export type AlertMode = "ring" | "notify" | "digest";
export type Urgency = "low" | "normal" | "urgent";

export interface Settings {
  /** Name the AI introduces itself with, e.g. "Ada". */
  agentName: string;
  /** First thing the AI says when it picks up. */
  greeting: string;
  /** "english" = clear Nigerian English; "pidgin" = switches to Pidgin when the caller does. */
  languageStyle: "english" | "pidgin";
  /** Minutes the AI promises the owner will call back within. */
  callbackMinutes: number;
  /** How hard to alert the owner, per urgency level. */
  alerts: Record<Urgency, AlertMode>;
  /** Send SMS (Africa's Talking) for alerts that are not "digest". */
  smsAlerts: boolean;
  /** During quiet hours, everything except "urgent" is held for the digest. 24h "HH:MM", Africa/Lagos time. */
  quietHours: { enabled: boolean; start: string; end: string };
  /** Let the AI take orders and quote totals. */
  takeOrders: boolean;
  /** Read out to customers after an order. */
  paymentInstructions: string;
  /** Things the AI must never do or promise, written by the owner. */
  extraRules: string;
}

export const defaultSettings = (businessName: string): Settings => ({
  agentName: "Ada",
  greeting: `Hello, thank you for calling ${businessName}! I'm Ada, the virtual assistant. How can I help you today?`,
  languageStyle: "pidgin",
  callbackMinutes: 10,
  alerts: { low: "digest", normal: "notify", urgent: "ring" },
  smsAlerts: true,
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
  takeOrders: true,
  paymentInstructions: "",
  extraRules: "",
});

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
      name TEXT NOT NULL,
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
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
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
  `);
  return db;
}

const token = () => randomBytes(24).toString("base64url");

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
    // Merge so settings added in later versions get their defaults.
    settings: { ...defaultSettings(row.name), ...JSON.parse(row.settings_json) },
    createdAt: row.created_at,
  };
}

export function createBusiness(input: { name: string; ownerName?: string; ownerPhone?: string; plan?: string }): Business {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO businesses (id, name, owner_name, owner_phone, owner_token, tool_secret, plan, settings_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.ownerName ?? "",
      input.ownerPhone ?? "",
      token(),
      token(),
      input.plan ?? "trial",
      JSON.stringify(defaultSettings(input.name)),
    );
  return getBusiness(id)!;
}

export const getBusiness = (id: string) => toBusiness(getDb().prepare("SELECT * FROM businesses WHERE id = ?").get(id) as Row);
export const getBusinessByToken = (t: string) =>
  toBusiness(getDb().prepare("SELECT * FROM businesses WHERE owner_token = ?").get(t) as Row);
export const getBusinessByAgentId = (agentId: string) =>
  toBusiness(getDb().prepare("SELECT * FROM businesses WHERE agent_id = ?").get(agentId) as Row);

export type BusinessProfile = Pick<
  Business,
  "name" | "description" | "category" | "location" | "openingHours" | "deliveryInfo" | "ownerName" | "ownerPhone"
>;

export function updateBusiness(id: string, profile: Partial<BusinessProfile>, settings?: Partial<Settings>) {
  const current = getBusiness(id);
  if (!current) throw new Error("business not found");
  const next = { ...current, ...profile, settings: { ...current.settings, ...settings } };
  getDb()
    .prepare(
      `UPDATE businesses SET name = ?, description = ?, category = ?, location = ?, opening_hours = ?,
       delivery_info = ?, owner_name = ?, owner_phone = ?, settings_json = ? WHERE id = ?`,
    )
    .run(
      next.name,
      next.description,
      next.category,
      next.location,
      next.openingHours,
      next.deliveryInfo,
      next.ownerName,
      next.ownerPhone,
      JSON.stringify(next.settings),
      id,
    );
  return getBusiness(id)!;
}

export function setAgentId(businessId: string, agentId: string) {
  getDb().prepare("UPDATE businesses SET agent_id = ? WHERE id = ?").run(agentId, businessId);
}

// ---- FAQs -------------------------------------------------------------------

export interface Faq {
  id: number;
  question: string;
  answer: string;
  source: "owner" | "learned";
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
  conversation_id: string | null;
  customer_name: string;
  customer_phone: string;
  question: string;
  summary: string;
  urgency: Urgency;
  status: "open" | "acknowledged" | "resolved";
  owner_answer: string | null;
  callback_due_at: string;
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

// ---- Calls & usage ------------------------------------------------------------------

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

/** Billable minutes this calendar month. Each call is rounded up to the next full minute. */
export function minutesUsedThisMonth(businessId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM((duration_secs + 59) / 60), 0) AS minutes FROM calls
       WHERE business_id = ? AND created_at >= strftime('%Y-%m-01', 'now')`,
    )
    .get(businessId) as Row;
  return Number(row.minutes);
}
