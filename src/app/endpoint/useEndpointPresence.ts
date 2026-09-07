"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import {
  getDeviceSecret,
  clearDeviceCredentials,
} from "@/lib/client/identity";
import { decodeCommand } from "@/lib/control/commands";
import { speak, stopSpeaking } from "@/lib/client/speak";
import { toWsUrl } from "@/lib/client/livekitUrl";
import { reportClientError } from "@/lib/client/reportError";
import type { Phase, Speaking } from "./types";
import type { useMediaSession } from "./useMediaSession";

type Media = ReturnType<typeof useMediaSession>;

/**
 * Presence heartbeat + lobby control channel for a paired wall device.
 * Owns phase, DND from server, and dispatch of control commands into media/TTS.
 */
export function useEndpointPresence(media: Media) {
  const { joinMedia, leaveMedia, setRinging } = media;
  const [phase, setPhase] = useState<Phase>("loading");
  const [note, setNote] = useState("");
  const [room, setRoom] = useState("This room");
  const [dnd, setDnd] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [mock, setMock] = useState(false);
  const [speaking, setSpeaking] = useState<Speaking | null>(null);
  const lobbyRef = useRef<Room | null>(null);

  const dismissSpeaking = useCallback(() => {
    stopSpeaking();
    setSpeaking(null);
  }, []);

  const heartbeat = useCallback(async () => {
    const secret = getDeviceSecret();
    if (!secret) {
      setPhase("unpaired");
      return;
    }
    try {
      const res = await fetch("/api/presence", {
        method: "POST",
        headers: { "x-device-secret": secret },
      });
      if (res.status === 401) {
        clearDeviceCredentials();
        setPhase("unpaired");
        return;
      }
      const data = await res.json();
      setDnd(!!data.doNotDisturb);
      setMock(!!data.mock);
      const wsUrl = toWsUrl(data.livekitUrl ?? "");
      setLivekitUrl(wsUrl);
      setPhase("ready");

      if (!data.mock && !lobbyRef.current) {
        const r = new Room();
        lobbyRef.current = r;
        r.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          try {
            const cmd = decodeCommand(payload);
            switch (cmd.type) {
              case "join":
                joinMedia(wsUrl, cmd.token, cmd.mode, "Incoming page");
                break;
              case "ring":
                setRinging({
                  url: wsUrl,
                  token: cmd.token,
                  mode: cmd.mode,
                  title: cmd.from ?? "Incoming call",
                  eventId: cmd.eventId,
                });
                break;
              case "announce":
                setSpeaking({
                  text: cmd.text,
                  label: cmd.from ? `Announcement · ${cmd.from}` : "Announcement",
                  audioUrl: cmd.audioUrl,
                });
                speak(cmd.text, cmd.audioUrl);
                break;
              case "reminder":
                setSpeaking({
                  text: cmd.text,
                  label: "Reminder",
                  audioUrl: cmd.audioUrl,
                });
                speak(cmd.text, cmd.audioUrl);
                break;
              case "hangup":
                setRinging(null);
                leaveMedia();
                break;
              case "ping":
                break;
              default: {
                const _never: never = cmd;
                void _never;
              }
            }
          } catch (e) {
            reportClientError(e, {
              code: "endpoint.control_decode",
              route: "useEndpointPresence",
            });
          }
        });
        r.on(RoomEvent.Disconnected, () => {
          if (lobbyRef.current === r) {
            lobbyRef.current = null;
            setReceiving(false);
          }
        });
        try {
          await r.connect(wsUrl, data.lobbyToken);
          setReceiving(true);
          setReceiveError("");
        } catch (e) {
          if (lobbyRef.current === r) lobbyRef.current = null;
          setReceiving(false);
          setReceiveError(e instanceof Error ? e.message : "Audio connection failed");
          reportClientError(e, {
            code: "endpoint.lobby_connect",
            route: "useEndpointPresence",
          });
        }
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Connection failed");
      setPhase((p) => (p === "ready" ? p : "error"));
      reportClientError(e, {
        code: "endpoint.heartbeat",
        route: "useEndpointPresence",
      });
    }
  }, [joinMedia, leaveMedia, setRinging]);

  useEffect(() => {
    heartbeat();
    const t = setInterval(heartbeat, 10_000);
    return () => clearInterval(t);
  }, [heartbeat]);

  const setDoNotDisturb = useCallback(async (value: boolean) => {
    setDnd(value);
    const secret = getDeviceSecret();
    if (!secret) return;
    const res = await fetch("/api/endpoint/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-device-secret": secret },
      body: JSON.stringify({ doNotDisturb: value }),
    }).catch(() => null);
    if (!res?.ok) heartbeat();
  }, [heartbeat]);

  return {
    phase,
    setPhase,
    note,
    setNote,
    room,
    setRoom,
    dnd,
    setDoNotDisturb,
    receiving,
    receiveError,
    livekitUrl,
    mock,
    speaking,
    setSpeaking,
    dismissSpeaking,
    heartbeat,
  };
}
