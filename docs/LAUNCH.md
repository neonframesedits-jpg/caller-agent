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
