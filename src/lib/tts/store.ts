/**
 * Store announce audio clips for endpoint playback.
 * Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set.
 */

import { put } from "@vercel/blob";

export function blobStoreConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** Upload an mp3 announce clip; returns a public HTTPS URL. */
export async function storeAnnounceAudio(
  announcementId: string,
  mp3: Buffer,
): Promise<string> {
  if (!blobStoreConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }
  const blob = await put(`announce/${announcementId}.mp3`, mp3, {
    access: "public",
    contentType: "audio/mpeg",
    addRandomSuffix: true,
  });
  return blob.url;
}
