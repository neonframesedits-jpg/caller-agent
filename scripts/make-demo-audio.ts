// Generates the "Hear Ada's real voice" clips on the landing page with your chosen ElevenLabs voice.
// Usage: npm run make-demo-audio            (uses ELEVENLABS_DEFAULT_VOICE_ID)
//        npm run make-demo-audio -- <voiceId>
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "../src/config.js";

// Ada's side of each landing-page demo call (keep in step with DEMOS in public/index.html).
const CLIPS: Record<string, string> = {
  food: "Hello, thank you for calling Mama Tee's Kitchen! I'm Ada. How can I help you? ... Yes o! Jollof rice and chicken na three thousand five hundred naira. How many plates you want? ... Done! Two plates na seven thousand naira, plus one thousand five hundred for delivery to Yaba. I don send payment link to your phone.",
  fashion: "Good afternoon, Kemi's Closet! I'm Ada. How can I help? ... Yes, size fourteen is available! It's eighteen thousand naira. Would you like it delivered? ... I can't approve discounts myself, but I'll ask Kemi and she'll call you back within ten minutes. Is this number okay?",
  phones: "Hello, Chuks Gadgets, Computer Village! I'm Ada. How can I help? ... Yes! iPhone thirteen UK used, one twenty-eight gig, na five hundred and twenty thousand naira, with three months warranty. ... Yes, we accept swap. Come our shop for Computer Village, Ikeja. We open Monday to Saturday, nine to seven.",
};

const voiceId = process.argv[2] || config.elevenlabs.defaultVoiceId;
if (!config.elevenlabs.apiKey || !voiceId) {
  console.error("Set ELEVENLABS_API_KEY and ELEVENLABS_DEFAULT_VOICE_ID in .env first (see docs/ELEVENLABS_SETUP.md).");
  process.exit(1);
}

mkdirSync("public/audio", { recursive: true });
for (const [key, text] of Object.entries(CLIPS)) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenlabs.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) {
    console.error(`Failed for ${key}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  writeFileSync(`public/audio/ada-${key}.mp3`, Buffer.from(await res.arrayBuffer()));
  console.log(`Saved public/audio/ada-${key}.mp3`);
}
console.log("Done. Reload the landing page: the 'Hear Ada's real voice' button now appears.");
