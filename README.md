# Pickam: "Abeg, pick am!"

**Pickam answers your business phone for you.** It is an AI receptionist for Nigerian small businesses: the jollof seller cooking from her kitchen, the fashion vendor on Instagram, the phone accessories shop, the pharmacy, the event planner.

A customer calls. A warm, natural voice (ElevenLabs) picks up, answers questions from what the owner taught it, and takes the order. When it doesn't know the answer, it says *"Let me get the owner to call you back in 10 minutes"*, and the owner's phone and dashboard go **ping ping, urgent**.

```
Customer's phone
   │  calls the business line (or the owner's own line forwards missed calls)
   ▼
Nigerian number (SIP trunk) ──► ElevenLabs Agent (voice + LLM)
                                     │  calls tools during the call
                                     ▼
                              Pickam server (this repo)
                               ├─ get_business_info → live menu, prices, sold-out items, saved answers
                               ├─ place_order       → records order, totals it, alerts owner
                               ├─ escalate_to_owner → callback request + ring/notify/digest alert + SMS
                               └─ post-call webhook → transcript, summary, minutes used
                                     │
                                     ▼
                              Owner dashboard (phone-friendly web app)
                               callbacks inbox · orders · calls · menu · answers · settings
```

## What it does

- **Answers from the owner's knowledge.** The owner fills in their menu/products, prices, delivery, opening hours and Q&A ("Do you deliver to Lekki?") in their free time. The AI only answers from that and never guesses prices.
- **Live availability.** Tap *"Mark sold out"* and the AI knows on the very next call.
- **Takes orders.** It reads the order back, totals it in naira and gives your payment instructions (e.g. your bank account).
- **Hands off to the owner.** For an unknown question, a complaint, a big order or a special discount, it promises a callback within *X* minutes (you set X) and alerts you:
  - **ring**: the dashboard keeps pinging until you tap it, plus SMS
  - **notify**: one ping plus SMS
  - **digest**: shows quietly in the inbox
  - Separate settings for urgent, normal and low, plus **quiet hours** when only urgent alerts come through.
- **Learns.** When you answer a callback in the dashboard, your answer is saved, so next time the AI answers that question by itself.
- **Speaks like a Nigerian.** Clear Nigerian English, and it switches to Pidgin when the caller speaks Pidgin (configurable).
- **Call log.** Every call comes with a summary and transcript, plus minutes used against your plan.

## Run it locally

Requires Node.js 22.13+ (uses the built-in `node:sqlite`, so there is no native build step).

```bash
npm install
```

```bash
cp .env.example .env   # then fill in the keys
```

```bash
npm run create-business -- "Mama Tee's Kitchen" "Titilayo" "+2348012345678"
```

```bash
npm run dev
```

Open the dashboard link that `create-business` printed (`http://localhost:3000/?token=...`). Tap **Enable sound** so alerts can ping.

```bash
npm test
```

## Connect the voice (ElevenLabs)

1. Create an ElevenLabs account and API key. Put it in `ELEVENLABS_API_KEY`.
2. Pick a natural Nigerian-English voice from the ElevenLabs Voice Library and put its id in `ELEVENLABS_DEFAULT_VOICE_ID`.
3. Expose the server on a public HTTPS URL (in development, `ngrok http 3000`) and set `PUBLIC_URL`.
4. In the dashboard, open **Settings** and tap **Save**. This creates the ElevenLabs agent with the prompt and the three tools, and updates it on every later save.
5. In ElevenLabs, under Agents settings, set the **post-call webhook** to `PUBLIC_URL/webhooks/elevenlabs/post-call`. Put its secret in `ELEVENLABS_WEBHOOK_SECRET`.
6. Test with the agent's web test widget in ElevenLabs before connecting a phone number.

> The ElevenLabs agent API changes often. If agent creation fails, compare `buildAgentConfig` in `src/elevenlabs.ts` with the current [ElevenLabs Agents API docs](https://elevenlabs.io/docs). Newer accounts may need tools created separately and referenced by `tool_ids`.

## Connect a Nigerian phone number

ElevenLabs agents accept calls over **SIP trunk** (or Twilio). Twilio doesn't reliably offer Nigerian local numbers, so use a Nigerian voice provider with SIP:

- **Africa's Talking Voice** (Nigerian numbers, SIP) or another licensed Nigerian SIP provider.
- Import the number in ElevenLabs (Phone Numbers, SIP trunk) and assign it to the business's agent.

**Keep your own number (the killer feature).** The owner doesn't have to change the number printed on their flyers and Instagram bio. They set *conditional call forwarding* on their own SIM so calls they **miss, reject or can't take** go to their Pickam number:

| Forward when… | Dial on your phone |
|---|---|
| No answer | `**61*<pickam number>#` |
| Busy / rejected | `**67*<pickam number>#` |
| Switched off / no network | `**62*<pickam number>#` |
| All of the above | `**004*<pickam number>#` |

Test with each network (MTN, Airtel, Glo, 9mobile) whether the original caller's number comes through on forwarded calls. If it doesn't, the AI asks the caller for their number before escalating.

## Project layout

| Path | What it is |
|---|---|
| `src/server.ts` | Express app and startup |
| `src/routes/tools.ts` | Endpoints the voice agent calls mid-call (`business-info`, `order`, `escalate`) |
| `src/routes/webhooks.ts` | ElevenLabs post-call webhook (signature-checked) |
| `src/routes/api.ts` | Owner dashboard API, live alert stream (SSE), admin onboarding |
| `src/elevenlabs.ts` | Agent prompt, tool definitions, agent create/update, webhook signatures |
| `src/knowledge.ts` | Matches callers' questions to saved answers and spoken items to the menu (Pidgin-aware) |
| `src/notify.ts` | Alert routing: ring/notify/digest, quiet hours (Lagos time), SMS via Africa's Talking |
| `src/plans.ts` | Plans, included minutes, overage |
| `src/db.ts` | SQLite schema and data access |
| `public/index.html` | Owner dashboard (mobile-first, no build step) |
| `docs/BUSINESS.md` | Name, pricing, unit economics, go-to-market, roadmap |

## Security notes

- Each business has its own **owner token** (dashboard) and **tool secret** (sent by ElevenLabs on tool calls). Both are random 192-bit values.
- Post-call webhooks are rejected unless their HMAC signature matches `ELEVENLABS_WEBHOOK_SECRET`.
- `POST /admin/businesses` (onboarding) needs the `x-admin-key` header to match `ADMIN_KEY`.
- Before launch: put the server behind HTTPS, add proper owner login (phone number + OTP), and rate-limit the API.
