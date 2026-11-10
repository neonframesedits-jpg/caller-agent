# Pickam: name, pricing and plan

## The name: **Pickam**

From the Pidgin *"Abeg, pick am!"*, what every Nigerian shouts when a phone is ringing and nobody is answering. Pickam is the one that picks it for you.

- Every Nigerian gets it instantly, and it sounds friendly, not "techy".
- It's short, easy to spell and works as a verb: *"Just pickam your line."*
- **Tagline ideas:** *"We pick am when you no fit pick."* · *"Your phone, always answered."* · *"Never miss a customer again."*
- The AI voice itself has a persona name the owner chooses (default **Ada**), so customers hear *"Hello, this is Ada from Mama Tee's Kitchen"*.

**Alternatives if Pickam is taken:**
- **Padi** / **CallPadi**: *padi* means a trusted friend ("my padi").
- **Oya**: "let's go, quick quick".
- **Hello Ada**: the persona as the brand.
- **Alo**: how many Nigerians actually say "hello" on the phone.

**Availability:** a quick web search found no existing product called "Pickam". The closest names were *Pickmeup* (ride-hailing) and *Pakam* (recycling). That is not a clearance. Before spending money on the brand:
1. Run a CAC business name search and register the name.
2. Run a trademark search at the Nigerian Trademarks Registry (class 9 for software, class 38 for telecoms, class 42 for SaaS).
3. Secure the domains (`pickam.ng`, `pickam.com.ng`, `pickam.app`) and the Instagram, TikTok and X handles.

## What it costs us to run (per minute of call)

Rates as of October 2026, at about ₦1,380 per US dollar (parallel market):

| Cost | Rate | ≈ ₦ per minute |
|---|---|---|
| ElevenLabs Agents (voice + speech recognition + hosting) | ~$0.08/min on paid plans | ₦110 |
| LLM (small fast model, e.g. GPT-4o-mini or Gemini Flash) | ~$0.001–0.01/min | ₦2–14 |
| Nigerian SIP inbound (Africa's Talking) | ₦3–15/min | ₦10 |
| **Total variable cost** | | **≈ ₦130/min** |

Fixed cost per business is roughly **₦6,000/month**: a phone number (about ₦5,000 + VAT on Africa's Talking) plus SMS alerts.

An average customer call is 1.5–2.5 minutes, so **one answered call costs us about ₦200–330**.

> ⚠️ Our costs are in dollars but we charge in naira. If the naira weakens, margins shrink, so review prices every quarter, and the terms of service must allow it.

## Pricing

Nigerians are used to prepaid (airtime, data, electricity units), so there are two ways to pay: **monthly plans** and a **pay-as-you-go wallet**.

| Plan | Price / month | Included minutes | ≈ Calls | Extra minutes | For |
|---|---|---|---|---|---|
| **Free trial** | ₦0 (14 days) | 20 | ~10 | n/a | Everyone, to try it |
| **Pay-as-you-go** | ₦5,000 line fee | n/a | n/a | ₦350/min from wallet | Seasonal or occasional sellers |
| **Starter** | **₦20,000** (₦667/day) | 60 | ~30 | ₦300/min | Home kitchens, Instagram vendors, one-person businesses |
| **Business** ⭐ | **₦45,000** (₦1,500/day) | 180 | ~90 | ₦250/min | Shops, salons, pharmacies, small restaurants, real-estate agents |
| **Pro** | **₦120,000** | 550 | ~275 | ₦220/min | Busy restaurants, clinics, logistics, schools, multi-branch |
| **Enterprise** | from ₦300,000 | custom | custom | custom | Chains, hospitals, estates; custom voice, integrations, SLA |

**Launch offer: "Founding 100".** The first 100 businesses to buy a plan get their **first month at half price** (Starter ₦10,000, Business ₦22,500, Pro ₦60,000). Renewals are full price. It's built into checkout, and `FOUNDING_SLOTS` changes the number (0 turns it off). Worst case it costs a few thousand naira per business for one month, which is cheap customer acquisition and gives a real reason to "join now" in TikTok videos.

Later: annual billing with 2 months free (pay for 10, get 12). Collect payment with Paystack (card, transfer, USSD).

**Why customers will pay this:** a receptionist in Lagos costs ₦70,000–150,000 a month, works 8–10 hours, and still misses calls. A single missed jollof order is ₦3,000–10,000 of lost revenue. If Pickam saves 5–7 orders a month, Starter has paid for itself. It also answers at 11pm, on Sundays, and while the owner is driving or cooking.

### Margins

At about ₦130 per minute of call cost, plus about ₦6,000 a month per business for the number and SMS:

| Plan | Cost if all minutes are used | Margin | Cost at typical use (60%) | Margin |
|---|---|---|---|---|
| Starter ₦20k | ₦13,800 | 31% | ₦10,700 | 47% |
| Business ₦45k | ₦29,400 | 35% | ₦20,000 | 55% |
| Pro ₦120k | ₦77,500 | 35% | ₦48,900 | 59% |
| Extra minutes | ₦130/min | 41–57% | | |

Changes from the first draft:
- Business and Pro minutes were trimmed and Pro was raised to ₦120,000, so no plan drops below about 30% margin even when every minute is used.
- The trial went from 30 to 20 minutes, which caps the cost of a free trial at about ₦5,000.

### Website demo ("Talk to Ada") costs

Each demo call costs ElevenLabs minutes, about ₦130 a minute. Calls are capped at 2 minutes, 3 per visitor per hour, and **50 a day** by default. Worst case that's about ₦13,000 a day; most demo calls last about a minute. Change the cap with `DEMO_DAILY_CALL_LIMIT` to match your budget, and raise it on days a video is blowing up. Set `DEMO_ENABLED=false` to switch the demo off.

**Missed-call mode is what makes the margins work.** Most owners will use call forwarding so Pickam only answers the calls they miss. That keeps minutes low, prices affordable and margins healthy.

**How margins grow over time:**
1. ElevenLabs volume and enterprise pricing as minutes grow.
2. A cheaper voice pipeline for the Starter plan (separate speech-to-text, LLM and TTS) at about $0.03–0.05/min. ElevenLabs stays on paid tiers as the "premium voice".
3. Capping call length (default 5 minutes), which stops runaway costs from pranks or long chats.

## Who to sell to first

1. **Instagram, TikTok and WhatsApp vendors** (food, fashion, hair, skincare), who have the most calls and no staff. Show a demo video: call the demo line and order fake jollof from "Ada".
2. **Home kitchens and caterers.** The owner is cooking and can't touch the phone with oily hands.
3. **Phone and laptop shops** (Computer Village, Ikeja) for price and availability questions all day.
4. **Pharmacies, clinics and salons** for opening hours, availability and booking.
5. **Real-estate agents** who get dozens of "is it still available?" calls.

**Growth ideas:**
- A public demo number.
- Referrals: give a free month, get a free month.
- Partnerships with market associations, POS agents and dispatch companies.
- Pidgin-first marketing on TikTok and Instagram.

## What's built

- **Phone-number login** with SMS codes, plus a 3-step signup: business details, menu and common questions, then the Pickam number.
- **Billing:** monthly plans and a pay-as-you-go wallet through Paystack. Minutes are metered per call. When plan minutes and wallet both run out, Ada switches to message-only and the owner is alerted.
- **Missed-callback chasing:** once the promised callback time passes, the owner gets a loud alert, and the customer gets an apology SMS.
- **WhatsApp alerts**, with SMS as backup.
- **Automatic number setup** from a pool of numbers, with the call-forwarding codes shown to the owner.
- **Ada calls the customer back** with the owner's answer.
- **Paystack payment link by SMS** after an order. The money settles straight to the owner's bank account, and the owner is alerted when it's paid.
- **Teach Ada on WhatsApp:** swipe-reply to an alert, send "#12 answer", send "sold out jollof", or send any text or voice note.
- **Daily WhatsApp summary** at the time the owner chooses.

## Later

- **Yoruba, Igbo and Hausa** voices and understanding.
- **Dispatch integration** (Kwik, Gokada, local riders) so a confirmed order books a rider automatically.
- **Outbound calls** for order-ready and delivery-on-the-way updates, and appointment reminders.
- **Multi-staff accounts** and multi-branch businesses.
- **Owner's own voice**, cloned with their consent.
- **Compliance:** the Nigeria Data Protection Act 2023 requires telling callers that an AI assistant answers and the call may be recorded. The default greeting already says "virtual assistant". Still needed: a privacy policy and data retention limits.
