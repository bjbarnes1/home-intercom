/**
 * OpenAI neural TTS for household announcements.
 * Voice Ash with fixed delivery instructions (gpt-4o-mini-tts).
 */

import OpenAI from "openai";

export const ASH_ANNOUNCE_INSTRUCTIONS = `Delivery: Fast-paced and dynamic, with rising intonation to build momentum and keep engagement high.

Phrasing: Action-oriented and direct, using motivational cues to push participants forward.

Tone: Positive, energetic, and empowering, creating an atmosphere of encouragement and achievement.`;

export function openaiTtsConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Synthesize announce speech as mp3 bytes. Throws if OpenAI is not configured or the API fails. */
export async function synthesizeAnnounce(text: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not configured");

  const client = new OpenAI({ apiKey: key });
  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "ash",
    input: text,
    instructions: ASH_ANNOUNCE_INSTRUCTIONS,
    response_format: "mp3",
  });

  const ab = await response.arrayBuffer();
  return Buffer.from(ab);
}
