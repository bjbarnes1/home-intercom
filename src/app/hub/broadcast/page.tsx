"use client";

import { useRouter } from "next/navigation";
import { BROADCAST } from "../data";
import SpeakingCard from "../_components/SpeakingCard";

/**
 * Design reference for the announcement overlay.
 *
 * The live one is mounted by HubRuntime when a broadcast or reminder arrives on
 * the control channel; this route renders the same component with fixture props.
 */
export default function Broadcast() {
  const router = useRouter();
  return (
    <SpeakingCard
      from={BROADCAST.from}
      label="Broadcast message"
      text={BROADCAST.text}
      dwellSec={BROADCAST.countdown}
      onDismiss={() => router.push("/hub")}
    />
  );
}
