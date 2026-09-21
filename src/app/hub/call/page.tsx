"use client";

import { useRouter } from "next/navigation";
import { CALL } from "../data";
import CallCard from "../_components/CallCard";

/**
 * Design reference for the call overlay.
 *
 * The live one is mounted by HubRuntime and driven by LiveKit; this route
 * renders the same component with fixture props so the treatment can be opened
 * and reviewed without placing a call.
 */
export default function Call() {
  const router = useRouter();
  return (
    <CallCard
      who={CALL.who}
      mode={CALL.mode}
      elapsed={CALL.elapsed}
      footnote="Hanging up returns you to Open Line, right where you left it"
      onHangUp={() => router.push("/hub/open-line")}
    />
  );
}
