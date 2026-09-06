/**
 * Demo playlist backing the household music player. The player state (which
 * track, playing, which rooms) is real and shared; the audio source is a
 * placeholder until a real integration (Spotify/Sonos) is wired in.
 */
export interface Track {
  title: string;
  artist: string;
  durationSec: number;
}

export const PLAYLIST: Track[] = [
  { title: "Here Comes the Sun", artist: "The Beatles", durationSec: 185 },
  { title: "Lovely Day", artist: "Bill Withers", durationSec: 254 },
  { title: "Dog Days Are Over", artist: "Florence + The Machine", durationSec: 253 },
  { title: "Three Little Birds", artist: "Bob Marley & The Wailers", durationSec: 180 },
  { title: "September", artist: "Earth, Wind & Fire", durationSec: 215 },
];

export const SOURCES = ["Household", "Spotify"] as const;

export function trackAt(index: number): Track {
  const n = PLAYLIST.length;
  return PLAYLIST[((index % n) + n) % n];
}
