# ElevenLabs setup, step by step

No technical knowledge needed. You'll get two things:

1. An **API key**: a long secret password that lets Pickam use ElevenLabs.
2. A **voice ID**: the code for the voice Ada will speak with.

> ElevenLabs sometimes moves its buttons around. If a button below isn't exactly where I say, look for the same words nearby.

---

## Part 1: Create your account (2 minutes)

1. Go to **elevenlabs.io** and click **Sign up** (top right).
2. The easiest option is **Continue with Google**.
3. It may ask what you'll use it for. Pick anything, like "Conversational AI" or "Building an app", and click through.
4. You're now on the free plan. That's fine for testing.

## Part 2: Get your API key (2 minutes)

1. In the left menu, look near the bottom for **Developers** (or click your **name/profile picture** at the bottom-left).
2. Click **API Keys**.
3. Click **Create API Key** (or **+ Create key**).
4. Name it `Pickam`.
5. If it asks about **permissions** or **restrictions**, leave everything allowed for now. Pickam needs:
   - Text to Speech
   - Speech to Text
   - Voices
   - Agents (sometimes called "Conversational AI")
6. Click **Create**.
7. **Copy the key now.** It looks like `sk_3f9a...` and ElevenLabs only shows it **once**. Paste it into your Notes app for a moment.

> ⚠️ **Never show this key on TikTok or in a screenshot.** Anyone who has it can spend your ElevenLabs credit. If it ever leaks, go back to API Keys, delete it and create a new one.

## Part 3: Choose Ada's voice (10 minutes, the fun part)

1. In the left menu, click **Voices**.
2. Click the **Explore** tab (also called the **Voice Library**). It has thousands of voices made by the community.
3. Use the search box and filters:
   - Search **"Nigerian"**.
   - Or set **Language: English** and **Accent: Nigerian**.
   - **Gender: Female** if you want Ada to sound like a woman. You can pick a male voice and rename the AI in your settings too.
   - Category: **Conversational** voices sound best on calls.
4. Press **play ▶** on each voice. Good receptionist voices:
   - sound **warm and friendly**, like good customer care, not like a news reader
   - are **clear and not too fast**, because phone calls lower the sound quality
   - have **no background music or echo** in the preview
5. Tip: play your favourites through your **phone speaker**. That's how customers will hear Ada.
6. When you find the one, click **Add** (or **Add to My Voices**). The free plan has a limit on saved voices, but one is all you need.
7. Go to the **My Voices** tab, find the voice, click the **⋯** (three dots) next to it, and choose **Copy voice ID**.
   - If you don't see that option, click the voice to open it. The ID is a code like `pNInz6obpgDQGcFmaJgB`, usually with a copy button beside it.
8. Paste the voice ID into your Notes app next to the API key.

**Can't decide?** Shortlist 2–3 voices, generate the demo audio (Part 5) with each, and ask 5 friends which one sounds most like someone they'd trust with their order.

## Part 4: Put the key and voice into Pickam

**On Railway (your live website)**
1. Open your project on **railway.com** and click your Pickam service.
2. Open the **Variables** tab and click **+ New Variable**.
3. Add `ELEVENLABS_API_KEY` with your key as the value.
4. Add `ELEVENLABS_DEFAULT_VOICE_ID` with your voice ID as the value.
5. Railway restarts the site by itself.

**On your computer** (if you run Pickam locally): open the `.env` file and fill in the same two lines:
```
ELEVENLABS_API_KEY=sk_your_key_here
ELEVENLABS_DEFAULT_VOICE_ID=your_voice_id_here
```

## Part 5: Hear Ada for the first time

On your computer, inside the Pickam folder, run:

```bash
npm run make-demo-audio
```

This creates three short MP3 clips of Ada using your chosen voice, in `public/audio/`. Two things happen:
- A **"🔊 Hear Ada's real voice"** button appears on the landing page demo.
- You get clips you can use in your **TikTok videos**.

To try a different voice without changing settings, pass its ID: `npm run make-demo-audio -- OTHER_VOICE_ID`.

## Part 6: Later, when you connect real phone calls

You don't need this for the landing page or TikTok, only when Pickam goes live:

1. Log in to the Pickam dashboard (`/app`), go to **Settings** and click **Save**. Pickam creates the business's AI agent in ElevenLabs automatically.
2. In ElevenLabs, open **Agents** (or **Conversational AI**). You'll see an agent called **"Pickam - <business name>"**. Click it and use the **Test** / **Talk to agent** button to call Ada from your browser.
3. In the Agents **Settings**, find **Webhooks** → **Post-call webhook**:
   - Set the URL to `https://YOUR-SITE/webhooks/elevenlabs/post-call`.
   - Copy the **secret** it gives you.
   - Add it on Railway as `ELEVENLABS_WEBHOOK_SECRET`.
4. Before real customers call, upgrade from the free plan. The free plan doesn't allow business use. See `docs/BUSINESS.md` for costs.
