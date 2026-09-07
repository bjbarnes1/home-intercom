"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import {
  getDeviceSecret,
  clearDeviceCredentials,
} from "@/lib/client/identity";
import { decodeCommand, type LedCommand } from "@/lib/control/commands";
import { speak, stopSpeaking } from "@/lib/client/speak";
import { toWsUrl } from "@/lib/client/livekitUrl";
import { reportClientError } from "@/lib/client/reportError";
import {
  defaultRoomLights,
  type FrontMode,
  type LedColorKey,
  type RoomLights,
} from "@/lib/color/led-state";
import { minutesToHm } from "@/lib/etiquette/quietHours";
import type { Phase, Speaking } from "./types";
import type { useMediaSession } from "./useMediaSession";

type Media = ReturnType<typeof useMediaSession>;

export interface EtiquetteSettings {
  chimeEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  hasLeds: boolean;
}

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
  const [etiquette, setEtiquette] = useState<EtiquetteSettings>({
    chimeEnabled: true,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    hasLeds: false,
  });
  const [roomLights, setRoomLights] = useState<RoomLights>(() => defaultRoomLights());
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [mock, setMock] = useState(false);
  const [speaking, setSpeaking] = useState<Speaking | null>(null);
  const lobbyRef = useRef<Room | null>(null);
  const etiquetteRef = useRef(etiquette);
  etiquetteRef.current = etiquette;
  const hasLedsRef = useRef(etiquette.hasLeds);
  hasLedsRef.current = etiquette.hasLeds;

  const dismissSpeaking = useCallback(() => {
    stopSpeaking();
    setSpeaking(null);
  }, []);

  const applyLed = useCallback((cmd: LedCommand) => {
    if (!hasLedsRef.current) return;
    setRoomLights((prev) => {
      const next = { ...prev };
      if (cmd.front) {
        if (cmd.front.mode && cmd.front.mode !== "pulse") {
          next.front = cmd.front.mode as FrontMode;
        }
        if (cmd.front.color && isLedColor(cmd.front.color)) {
          next.frontColor = cmd.front.color;
        }
        if (cmd.front.brightness != null) {
          next.bright = cmd.front.brightness;
        }
      }
      if (cmd.rear) {
        if (cmd.rear.on != null) next.rear = cmd.rear.on;
        if (cmd.rear.color && isLedColor(cmd.rear.color)) {
          next.rearColor = cmd.rear.color;
        }
        if (cmd.rear.brightness != null) {
          next.bright = cmd.rear.brightness;
        }
      }
      return next;
    });
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
      setEtiquette({
        chimeEnabled: data.chimeEnabled !== false,
        quietHoursEnabled: !!data.quietHoursEnabled,
        quietHoursStart:
          data.quietHoursStart != null
            ? minutesToHm(data.quietHoursStart)
            : "22:00",
        quietHoursEnd:
          data.quietHoursEnd != null ? minutesToHm(data.quietHoursEnd) : "07:00",
        hasLeds: !!data.hasLeds,
      });
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
              case "announce": {
                const whisper = !!cmd.whisper;
                const chime =
                  !!cmd.chime ||
                  (!whisper && etiquetteRef.current.chimeEnabled);
                setSpeaking({
                  text: cmd.text,
                  label: cmd.from ? `Announcement · ${cmd.from}` : "Announcement",
                  audioUrl: cmd.audioUrl,
                });
                void speak(cmd.text, cmd.audioUrl, {
                  volume: whisper ? 0.35 : 1,
                  chime: chime && !whisper,
                });
                break;
              }
              case "reminder": {
                const whisper = !!cmd.whisper;
                const chime = !!cmd.chime && !whisper;
                setSpeaking({
                  text: cmd.text,
                  label: "Reminder",
                  audioUrl: cmd.audioUrl,
                });
                void speak(cmd.text, cmd.audioUrl, {
                  volume: whisper ? 0.35 : 1,
                  chime,
                });
                break;
              }
              case "hangup":
                setRinging(null);
                leaveMedia();
                break;
              case "led":
                applyLed(cmd);
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
  }, [joinMedia, leaveMedia, setRinging, applyLed]);

  useEffect(() => {
    heartbeat();
    const t = setInterval(heartbeat, 10_000);
    return () => clearInterval(t);
  }, [heartbeat]);

  const patchSettings = useCallback(
    async (body: Record<string, unknown>) => {
      const secret = getDeviceSecret();
      if (!secret) return null;
      const res = await fetch("/api/endpoint/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-device-secret": secret },
        body: JSON.stringify(body),
      }).catch(() => null);
      if (!res?.ok) {
        heartbeat();
        return null;
      }
      return (await res.json()) as EtiquetteSettings & { doNotDisturb: boolean };
    },
    [heartbeat],
  );

  const setDoNotDisturb = useCallback(
    async (value: boolean) => {
      setDnd(value);
      await patchSettings({ doNotDisturb: value });
    },
    [patchSettings],
  );

  const updateEtiquette = useCallback(
    async (patch: Partial<EtiquetteSettings>) => {
      setEtiquette((e) => ({ ...e, ...patch }));
      const saved = await patchSettings(patch);
      if (saved) {
        setEtiquette({
          chimeEnabled: saved.chimeEnabled,
          quietHoursEnabled: saved.quietHoursEnabled,
          quietHoursStart: saved.quietHoursStart,
          quietHoursEnd: saved.quietHoursEnd,
          hasLeds: saved.hasLeds,
        });
        if ("doNotDisturb" in saved) setDnd(!!saved.doNotDisturb);
      }
    },
    [patchSettings],
  );

  return {
    phase,
    setPhase,
    note,
    setNote,
    room,
    setRoom,
    dnd,
    setDoNotDisturb,
    etiquette,
    updateEtiquette,
    roomLights,
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

function isLedColor(c: string): c is LedColorKey {
  return ["warm", "amber", "rose", "teal", "indigo", "green"].includes(c);
}
