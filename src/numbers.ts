// Pool of Nigerian phone numbers Pickam owns, handed out to businesses during onboarding.
import { config } from "./config.js";
import * as db from "./db.js";
import { assignNumberToAgent, importSipNumber, syncAgent } from "./elevenlabs.js";
import { alertAdmin } from "./notify.js";
import { forwardingCodes, normalizePhone } from "./phone.js";

/** Add a number bought from the SIP provider to the pool (and import it into ElevenLabs). */
export async function addNumberToPool(raw: string) {
  const number = normalizePhone(raw);
  if (!number) throw new Error("Invalid phone number");
  const elevenlabsId = config.elevenlabs.apiKey ? await importSipNumber(number) : null;
  db.addPoolNumber(number, elevenlabsId);
  return { number, elevenlabsId };
}

export class NoNumbersError extends Error {}

/**
 * Give a business its Pickam number: make sure its agent exists, reserve a free number and route it to the agent.
 * Idempotent: a business that already has a number gets the same one back.
 */
export async function provisionNumber(b: db.Business) {
  let pool = db.getPoolNumberForBusiness(b.id);
  const claimedNow = !pool;
  if (!pool) {
    pool = db.claimPoolNumber(b.id);
    if (!pool) {
      await alertAdmin(`Number pool is empty. ${b.name || b.ownerPhone} is waiting for a number.`);
      throw new NoNumbersError("All our numbers are taken right now. We've been notified and will text you when yours is ready.");
    }
  }
  try {
    if (config.elevenlabs.apiKey) {
      const agentId = await syncAgent(b);
      if (agentId !== b.agentId) db.setAgentId(b.id, agentId);
      if (pool.elevenlabs_phone_number_id) await assignNumberToAgent(pool.elevenlabs_phone_number_id, agentId);
    }
  } catch (err) {
    if (claimedNow) db.releasePoolNumber(pool.number);
    throw err;
  }
  db.setBusinessFields(b.id, { phone_number: pool.number });
  return { number: pool.number, forwardingCodes: forwardingCodes(pool.number) };
}

/**
 * Make sure every number in POOL_NUMBERS is in the pool and connected to ElevenLabs.
 * Runs at start-up, so adding Ada's lines is just a Railway variable. Safe to run repeatedly.
 */
export async function syncPoolNumbersFromConfig(): Promise<string[]> {
  const added: string[] = [];
  const existing = new Map(db.listPoolNumbers().map((n) => [n.number, n]));
  for (const raw of config.poolNumbers) {
    const number = normalizePhone(raw);
    if (!number) {
      console.error(`[numbers] POOL_NUMBERS has an invalid number: ${raw}`);
      continue;
    }
    const row = existing.get(number);
    if (!row) {
      await addNumberToPool(number);
      added.push(number);
    } else if (!row.elevenlabs_phone_number_id && config.elevenlabs.apiKey) {
      db.setPoolNumberElevenLabsId(number, await importSipNumber(number));
      added.push(number);
    }
  }
  return added;
}
