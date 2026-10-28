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
| **Free trial** | ₦0 (14 days) | 30 | ~15 | n/a | Everyone, to try it |
| **Starter** | **₦20,000** | 60 | ~30 | ₦300/min | Home kitchens, Instagram vendors, one-person businesses |
| **Business** | **₦45,000** | 200 | ~100 | ₦250/min | Shops, salons, pharmacies, small restaurants, real-estate agents |
| **Pro** | **₦110,000** | 600 | ~300 | ₦200/min | Busy restaurants, clinics, logistics, schools, multi-branch |
| **Enterprise** | from ₦300,000 | custom | custom | custom | Chains, hospitals, estates; custom voice, integrations, SLA |
| **Pay-as-you-go** | ₦5,000 line fee | n/a | n/a | ₦350/min from wallet | Seasonal or occasional sellers |

Annual billing gets **2 months free**. Collect payment with Paystack or Flutterwave (card, transfer, USSD).

**Why customers will pay this:** a receptionist in Lagos costs ₦70,000–150,000 a month, works 8–10 hours, and still misses calls. A single missed jollof order is ₦3,000–10,000 of lost revenue. If Pickam saves 5–7 orders a month, Starter has paid for itself. It also answers at 11pm, on Sundays, and while the owner is driving or cooking.

### Margins

| Plan | Cost if all minutes are used | Margin | Cost at typical use (60%) | Margin |
|---|---|---|---|---|
| Starter ₦20k | ₦13,800 | 31% | ₦10,700 | 47% |
| Business ₦45k | ₦32,000 | 29% | ₦21,600 | 52% |
| Pro ₦110k | ₦84,000 | 24% | ₦52,800 | 52% |
| Extra minutes | ₦130/min | 35–57% | | |

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

## Roadmap (after the MVP in this repo)

- **AI calls the customer back.** The owner types or voice-notes the answer, and Ada calls the customer back with it. The owner never has to make the call.
- **WhatsApp:** alerts to the owner, plus an order confirmation and payment link sent to the customer after the call.
- **Paystack payment link by SMS during the call:** "I've sent you a link to pay ₦7,000."
- **Yoruba, Igbo and Hausa** voices and understanding.
- **Owner's own voice** (cloned with consent) for a personal touch.
- **Outbound calls:** order-ready and delivery-on-the-way calls, appointment reminders.
- **Dispatch integration** (Kwik, Gokada, local riders) so a confirmed order books a rider automatically.
- **Daily digest SMS:** "Yesterday: 23 calls, 9 orders (₦41,500), 2 callbacks pending."
- **Proper login** (phone number + OTP), multi-staff accounts and multi-branch businesses.
- **Compliance:** the Nigeria Data Protection Act 2023 requires telling callers that an AI assistant answers and the call may be recorded (add it to the greeting), a privacy policy, and data retention limits.
