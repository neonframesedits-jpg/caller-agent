# Pickam: "Abeg, pick am!"

**Pickam answers your business phone for you.** It is an AI receptionist for Nigerian small businesses: the jollof seller cooking from her kitchen, the fashion vendor on Instagram, the phone accessories shop, the pharmacy, the event planner.

A customer calls. A warm, natural voice (ElevenLabs) picks up, answers questions from what the owner taught it, and takes the order. When it doesn't know the answer, it says *"Let me get the owner to call you back in 10 minutes"*, and the owner's phone goes **ping ping, urgent** on WhatsApp and the dashboard. The owner replies with the answer, and Ada calls the customer back with it.

```
Customer's phone
   │  calls the business line (or the owner's own line forwards missed calls)
   ▼
Nigerian number (SIP trunk) ──► ElevenLabs Agent (voice + LLM)
                                     │  calls tools during the call
                                     ▼
                              Pickam server (this repo)
                               ├─ get_business_info → live menu, prices, sold-out items, saved answers
                               ├─ place_order       → records order, texts a Paystack payment link
                               ├─ escalate_to_owner → callback request + WhatsApp/SMS/dashboard alert
                               └─ post-call webhook → transcript, summary, minutes billed
                                     │
              ┌──────────────────────┼─────────────────────────┐
              ▼                      ▼                         ▼
     Owner dashboard          Owner's WhatsApp              Paystack
     (login by SMS code)      alerts · replies ·            plans · wallet ·
                              voice notes · daily summary   customer payments
```

## Features

**On the call**
- **Answers from the owner's knowledge.** Menu, prices, delivery, hours, Q&A and WhatsApp notes. It never guesses prices.
- **Live availability.** Tap *"Mark sold out"* or send "sold out jollof" on WhatsApp.
- **Takes orders and texts a payment link.** The customer pays by card, transfer or USSD through Paystack. The money settles straight to the owner's bank account, and the owner is alerted when it's paid.
- **Speaks like a Nigerian.** Clear Nigerian English, and it switches to Pidgin when the caller does.

**When Ada needs the owner**
- **Promises a callback** within *X* minutes and alerts the owner. Each urgency level can **ring** (keeps pinging until tapped, plus WhatsApp and SMS), **notify** (WhatsApp, with SMS as backup) or go to the **digest**. Quiet hours hold back everything except urgent.
- **Owner answers from WhatsApp.** Swipe-reply to the alert with text or a voice note, or send `#12 the answer`. **Ada phones the customer** with the answer, and the answer is saved so she can handle that question herself next time.
- **Chases missed callbacks.** When the promised time passes, the owner gets a loud reminder and the customer gets a polite "sorry for the delay" SMS.
- **Teach by voice note.** Any WhatsApp text or voice note, e.g. *"We don't deliver on Sundays"*, becomes knowledge Ada uses.
- **Daily WhatsApp summary:** *"Yesterday: 23 calls, 9 orders (₦41,500). 2 callbacks pending. Questions Ada couldn't answer: …"*

**Running the business**
- **Signup by phone number** with an SMS code, then a 3-step setup: business details, menu and common questions by category, then the Pickam number.
- **Automatic Pickam number** from Pickam's number pool, routed to the business's AI, with the call-forwarding codes the owner dials so their *own* number forwards missed calls to Ada.
- **Plans and wallet.** 14-day free trial, then monthly plans through Paystack. Minutes are metered per call, and extra minutes come from a prepaid wallet. When both run out, Ada switches to **message-only** (takes name and message, no orders) and the owner is told to top up.

## Run it locally

Requires Node.js 22.13+ (uses the built-in `node:sqlite`, so there is no native build step).

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

Open `http://localhost:3000` and log in with any Nigerian number. Without Africa's Talking keys, the login code is printed in the server console. Without keys, everything else works too: the integrations just switch off.

To give test signups a number, add one to the pool:

```bash
curl -X POST localhost:3000/admin/numbers -H "x-admin-key: change-me" -H "Content-Type: application/json" -d '{"number":"02017001111"}'
```

```bash
npm test
```

The tests fake every external API, so they need no keys.

## Hosting: use Railway, not Vercel

Pickam is a long-running server. It keeps a SQLite database file, holds live alert connections open to dashboards, and runs a background job every minute (overdue callbacks, daily summaries). Vercel runs serverless functions with no persistent disk and no always-on process, so the database would be wiped and the background jobs would never run.

**Railway** (or Render or Fly.io) runs it as-is:

1. Create a project from this GitHub repo. `railway.json` sets the build, start and health check.
2. Add a **Volume** mounted at `/data` and set `DATABASE_PATH=/data/pickam.db`.
3. Set `NODE_ENV=production`, `PUBLIC_URL` (your Railway domain or custom domain), and the keys from `.env.example`.
4. Keep it to **one instance**. SQLite, the alert stream and the scheduler all live in one process. That's plenty for thousands of businesses. Move to Postgres and a job queue before scaling out.

Budget about $5–20/month on Railway at the start.

## Connect the services

| Service | What for | Setup |
|---|---|---|
| **ElevenLabs** | The voice, outbound callbacks, voice-note transcription | API key. Pick a Nigerian-English voice (`ELEVENLABS_DEFAULT_VOICE_ID`). Set the post-call webhook to `PUBLIC_URL/webhooks/elevenlabs/post-call` and copy its secret. |
| **SIP provider** (e.g. Africa's Talking Voice) | Nigerian phone numbers | Buy numbers, set `SIP_TRUNK_*`, then add each number with `POST /admin/numbers`. It is imported into ElevenLabs automatically. |
| **Africa's Talking SMS** | Login codes, SMS alerts, payment links, apology texts | API key and username. Register a sender ID (e.g. `PICKAM`) to avoid DND filtering. |
| **WhatsApp Cloud API** (Meta) | Owner alerts, replies, voice notes, daily summary | Create an app and a WhatsApp number. Set the webhook to `PUBLIC_URL/webhooks/whatsapp` (subscribe to `messages`) with `WHATSAPP_VERIFY_TOKEN`. Get a **utility template** named `pickam_alert` approved with body `{{1}}` + newline + `{{2}}`. |
| **Paystack** | Plans, wallet top-ups, customer payments | Secret key. Set the webhook URL to `PUBLIC_URL/webhooks/paystack`. |

> The ElevenLabs agent and phone-number APIs change often. If agent creation, number import or outbound calls fail, compare `src/elevenlabs.ts` with the current [ElevenLabs Agents API docs](https://elevenlabs.io/docs). Newer accounts may need tools created separately and referenced by `tool_ids`.

### Call forwarding (owners keep their own number)

Owners dial one of these on their own SIM. The dashboard shows them with their Pickam number filled in:

| Forward when… | Dial |
|---|---|
| No answer | `**61*<pickam number>#` |
| Busy / rejected | `**67*<pickam number>#` |
| Switched off / no network | `**62*<pickam number>#` |
| All of the above | `**004*<pickam number>#` |
| Turn off | `##004#` |

Test with each network (MTN, Airtel, Glo, 9mobile) whether the original caller's number comes through on forwarded calls. If it doesn't, Ada asks for their number before escalating.

## Project layout

| Path | What it is |
|---|---|
| `src/server.ts` | Express app, startup, scheduler start |
| `src/routes/tools.ts` | Endpoints the voice agent calls mid-call (`business-info`, `order`, `escalate`) |
| `src/routes/webhooks.ts` | ElevenLabs post-call, Paystack and WhatsApp webhooks (all signature-checked) |
| `src/routes/api.ts` | Phone login, owner dashboard API, live alert stream (SSE), admin endpoints |
| `src/auth.ts` | SMS login codes and sessions |
| `src/billing.ts`, `src/plans.ts`, `src/paystack.ts` | Plans, wallet, per-call metering, message-only mode, checkouts, order payment links |
| `src/escalations.ts` | Owner answers, saving them, and Ada's callback call |
| `src/owner-inbox.ts`, `src/whatsapp.ts` | WhatsApp: alerts, swipe-replies, `#id` answers, menu commands, voice notes |
| `src/numbers.ts`, `src/phone.ts` | Number pool provisioning, Nigerian number formatting, forwarding codes |
| `src/notify.ts` | Alert routing: ring/notify/digest, quiet hours, WhatsApp first then SMS |
| `src/scheduler.ts` | Overdue callback chasing and daily summaries |
| `src/elevenlabs.ts` | Agent prompt, tools, agent sync, outbound calls, speech-to-text, number import |
| `src/knowledge.ts` | Matches callers' questions to answers and spoken items to the menu (Pidgin-aware) |
| `src/db.ts` | SQLite schema and data access |
| `public/index.html` | Owner dashboard: login, setup wizard, inbox, orders, calls, menu, answers, plan and number, settings |
| `docs/BUSINESS.md` | Name, pricing, unit economics, go-to-market, roadmap |

## Security notes

- Owners log in with a 6-digit SMS code. Each code expires after 10 minutes and allows 5 tries, and each number can request 5 codes per hour. Sessions last 30 days and are stored hashed.
- Every webhook is signature-checked: ElevenLabs (HMAC-SHA256), Paystack (HMAC-SHA512) and WhatsApp (HMAC-SHA256 with the app secret).
- Each business's tool endpoints need its own random tool secret, which only its ElevenLabs agent knows.
- Paystack payments are applied once per reference, and only if the amount paid matches.
- Before a large launch, add per-IP rate limiting on `/auth/*` and run the server behind HTTPS (Railway does this for you).
