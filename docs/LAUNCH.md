# Put the Pickam website online today (for TikTok)

## Go-live checklist (the short version)

1. ✅ Site on Railway, with a volume at `/data` and the variables from Step 2. *(You've done this.)*
2. **Upgrade ElevenLabs to a paid plan** (Starter is about $5/month). The free plan's ~15 minutes would run out after a handful of TikTok viewers, and it doesn't allow business use.
3. On Railway, add `ELEVENLABS_API_KEY` and `ELEVENLABS_DEFAULT_VOICE_ID`, and **delete `ELEVENLABS_LLM`**. Railway restarts the site, and Pickam creates the demo agent by itself.
4. Open your site **in Chrome or Safari** (not inside TikTok). You should see a lime **"Talk to Ada now"** button. Tap it and order some jollof. 🎉
   - No button? Check the Railway **Deploy Logs** for "Website demo agent ready" or an error line starting with `[demo]`.
5. Set your budget: `DEMO_DAILY_CALL_LIMIT=50` (the default) costs at most about ₦13,000 a day. Raise it when a video takes off.
6. Post the TikTok with `https://YOUR-ADDRESS/?ref=tiktok` in your bio. In the video, say: **"Open the link in your browser and talk to Ada yourself."**

What viewers can do today:
- **Talk to Ada** live in their browser. She's the receptionist for a demo jollof kitchen.
- **Join the waitlist**, with the Founding 100 half-price first month.

Businesses get their own Ada phone line once the phone numbers, SMS and WhatsApp approvals are in place (Step 6 below).

> **TikTok tip:** TikTok's built-in browser often blocks the microphone. The page detects this and tells viewers to tap ⋯ → **Open in browser**. Say the same in your video and pinned comment.

---

This gets the **landing page and waitlist** live. You don't need ElevenLabs, Paystack or WhatsApp keys for this part: people can see Ada in action and join the list. Turn the rest on later.

Time: about 20 minutes. Cost: Railway's Hobby plan, about **$5/month**.

---

## Step 1: Put the code on Railway

1. Go to **railway.com** and click **Login → Login with GitHub**. Use the GitHub account that has the `caller-agent` repository.
2. Click **New Project → Deploy from GitHub repo**.
3. If Railway asks for access, allow it for the `caller-agent` repository.
4. Choose **caller-agent**.
5. Click the new service, open **Settings → Source**, and check the **branch**. It must be the branch with Pickam on it: `claude/blissful-clarke-6uiu84`, or `main` once you've merged it.
6. Railway builds and starts it by itself. `railway.json` in the repo tells it how.

## Step 2: Give it permanent storage (so sign-ups are never lost)

1. In your project, right-click the service (or use the **+** button) and choose **Attach Volume**. Set the mount path to `/data`.
2. Open the **Variables** tab and add:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_PATH` | `/data/pickam.db` |
| `ADMIN_KEY` | a long password only you know, e.g. 30 random letters and numbers |
| `SIGNUPS_OPEN` | `false` (the page collects waitlist sign-ups) |

## Step 3: Get your web address

1. Open **Settings → Networking → Generate Domain**. You'll get an address like `pickam-production.up.railway.app`.
2. Add one more variable: `PUBLIC_URL` = `https://pickam-production.up.railway.app` (your actual address).
3. Open the address on your phone. You should see **"Your customers call. Ada picks am."** 🎉

**Your own domain (optional, looks more trustworthy):**
1. Buy `pickam.ng` or `pickam.com.ng` from a Nigerian registrar, e.g. Whogohost or Qservers. A `.com` from Namecheap also works.
2. In Railway, open **Settings → Networking → Custom Domain**, type the domain, and copy the **CNAME** record Railway shows you.
3. Add that CNAME in your registrar's DNS settings. It can take up to a few hours to work.
4. Change `PUBLIC_URL` to the new domain.

## Step 4: See who signed up

Open this in your browser, using your own address and `ADMIN_KEY`:

```
https://YOUR-ADDRESS/admin/waitlist?format=csv&key=YOUR_ADMIN_KEY
```

It downloads a spreadsheet (opens in Excel or Google Sheets) showing each person's:
- name, business name, WhatsApp number, what they sell and city
- **where they came from**
- **how many people they invited**

Keep that link private, because it contains your admin key.

## Step 5: TikTok

**Link in bio:** use `https://YOUR-ADDRESS/?ref=tiktok`. The `?ref=tiktok` part lets the spreadsheet show which sign-ups came from TikTok. Use `?ref=instagram`, `?ref=x` and so on for other platforms.

**Video ideas that work:**
- **"POV: you're cooking jollof and your phone won't stop ringing."** Hands in the pot, phone ringing, cut to Ada answering in Pidgin and taking the order. End on "Order paid ✅".
- **Screen-record the landing page demo.** Tap through the three businesses. Add the "Hear Ada" audio once you've made it (see `docs/ELEVENLABS_SETUP.md`, Part 5).
- **The calculator hook:** "I miss 5 calls a day. Here's how much that costs me…" Then show the number on the page.
- **Street test:** ask vendors at a market, "Would you let an AI pick your calls?"
- **Pidgin vs English:** Ada switching to Pidgin when the caller does always gets a reaction.

> ⚠️ When screen-recording, never show your Railway variables, `.env` file or API keys.

**Turn viewers into sign-ups:**
- Always say **"link in bio, it's free to join."**
- Pin a comment: "Early access is open. First businesses get set up first 🔥"
- Reply to comments with a video. "Does it work for my salon?" makes a great reply video.
- After someone joins, the page asks them to share their invite link on WhatsApp. That spreads in vendor groups.

## Email login with Brevo (free, no SMS needed)

Owners can log in with an email code instead of an SMS code. Email is also used for alerts when WhatsApp and SMS can't reach the owner.

1. Sign up at **brevo.com** (free plan: 300 emails a day).
2. Go to **Senders, Domains & Dedicated IPs → Senders → Add a sender**, enter the email you'll send from, and click the confirmation link Brevo emails you.
   - An address on your own domain, e.g. `hello@pickam.ng`, lands in inboxes far more reliably than a Gmail address. With Gmail, codes may land in spam.
3. Go to **SMTP & API → API Keys → Generate a new API key**.
4. On Railway, add these variables:
   - `BREVO_API_KEY`: the key
   - `BREVO_SENDER_EMAIL`: the sender you verified
5. The login page now shows **Email**. While there's no SMS provider, it shows email only. Once you add Africa's Talking, owners get a choice of **Phone / Email**.

People who sign up by email are asked for their **business phone number** during setup, because that's the number they'll forward to Ada.

## Ada's line (the number calls are forwarded to)

Ada answers calls over the internet, so her line must be a **virtual (SIP/VoIP) number**, not a SIM card in a phone. A SIM card can still be the *owner's* number that forwards to Ada.

1. Get a Nigerian virtual number with SIP access, e.g. from Africa's Talking Voice or a Nigerian VoIP provider. They give you the number plus SIP details (an address, a username and a password).
2. On Railway, add:
   - `SIP_TRUNK_ADDRESS`, `SIP_TRUNK_USERNAME`, `SIP_TRUNK_PASSWORD`: from the provider
   - `POOL_NUMBERS`: the number, e.g. `+2342017001111` (separate several with commas)
3. Make sure `ELEVENLABS_API_KEY` is set. When the site restarts, Pickam adds the number and connects it to ElevenLabs by itself. Look for "Ada's lines ready" in the Railway **Deploy Logs**.
4. Ask the provider to send incoming calls for that number to ElevenLabs. In ElevenLabs → **Phone Numbers**, open the number to see the SIP address to give them.
5. Sign up in `/app` with your own business number. Setup assigns Ada's line and shows your forwarding code. Dial it, ask a friend to call you, and don't pick. Ada answers. 🎉

### Free option for testing: a Twilio trial number

1. Sign up at **twilio.com** (no card needed). You get about $15 of free credit and one free number. It's a US number, since Nigerian numbers aren't sold on the trial.
2. In the Twilio Console, copy your **Account SID** and **Auth Token**.
3. Under **Phone Numbers → Verified Caller IDs**, add every phone you'll test from (yours and a friend's). On the trial, only verified numbers can call in.
4. On Railway, add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `POOL_NUMBERS` = your Twilio number (e.g. `+15551234567`). Pickam connects it to ElevenLabs by itself.
5. Call it from a verified phone. You'll hear a short Twilio "trial account" message first, then Ada.

**Trial limits:**
- calls last 10 minutes at most
- at most 4 calls at the same time
- callers hear the trial message first
- forwarding a Nigerian SIM to a US number costs international airtime

So use it for testing and filming TikToks, and move to a Nigerian number for real customers.

## How business owners connect their own number

Owners never change their number. In the Pickam app (**My number & plan**), they choose:
- **Only calls I miss:** dial `**004*<Ada's line>#`. Ada answers when they don't pick, are busy, or their phone is off.
- **Every call:** dial `**21*<Ada's line>#`. Their phone doesn't ring, and Ada answers everyone.
- **Turn off:** dial `##002#`.

On Android, the **Turn on Ada** button opens the dialer with the code filled in, so they just press call. iPhones don't allow that from websites, so there's a **Copy code** button to paste into the Phone app's keypad. These are standard codes that work on MTN, Airtel, Glo and 9mobile. Owners pay normal airtime for forwarded calls. Confirm current rates with each network and tell owners upfront.

**Testing today, before you have Nigerian numbers:**
1. Buy a Twilio number (US/UK, a few dollars).
2. In ElevenLabs → **Phone Numbers**, import it with the **Twilio** option.
3. Assign it to your agent, then call it.

You'll hear Ada on a real phone call. Forwarding your Nigerian line to it works too, but costs international airtime, so use it for testing and filming only.

## The Pickam app (installable, with notifications)

`/app` installs like a real app, with no Play Store needed. Owners see a **Finish setting up** checklist:
1. connect their number
2. install the app (Android: **Install app** button; iPhone: **Share → Add to Home Screen**)
3. turn on **order alerts**

After that, new orders, addresses, urgent callbacks and the daily summary pop up as phone notifications, even with the app closed. iPhones need iOS 16.4 or later, with Pickam opened from the home screen. Nothing to configure: the notification keys are generated automatically on first start.

## Step 6: When you're ready to launch for real

1. Add your keys on Railway, following `.env.example`:
   - ElevenLabs
   - Africa's Talking
   - WhatsApp
   - Paystack
   - SIP trunk numbers
2. Test with your own business first.
3. Change `SIGNUPS_OPEN` to `true`. The landing page buttons switch to **"Start free trial"**, and new visitors create their account straight away.
4. Message your waitlist on WhatsApp, a batch at a time, with the link.
