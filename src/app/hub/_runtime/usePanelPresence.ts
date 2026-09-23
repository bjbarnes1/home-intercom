"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import {
  getDeviceSecret,
  clearDeviceCredentials,
} from "@/lib/client/identity";
import { speak, stopSpeaking } from "@/lib/client/speak";
import { toWsUrl } from "@/lib/client/livekitUrl";
import { reportClientError } from "@/lib/client/reportError";
import { minutesToHm } from "@/lib/etiquette/quietHours";
import {
  ANNOUNCE_DWELL_DEFAULT,
  clampAnnounceDwellSec,
} from "@/lib/etiquette/announceDwell";
import {
  decodeCommand,
  type MusicControlCommand,
  type MusicFetchCommand,
  type MusicHandoffCommand,
  type MusicHandoffResultCommand,
} from "@/lib/control/commands";
import type { Phase, Speaking } from "./types";
import type { useMediaSession } from "./useMediaSession";

type Media = ReturnType<typeof useMediaSession>;

export interface EtiquetteSettings {
  chimeEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  announceDwellSec: number;
}

export interface PresenceHandlers {
  /**
   * Another panel has handed this one its music. Optional: a surface with no
   * player of its own ignores the command rather than pretending to take it.
   */
  onMusicHandoff?: (cmd: MusicHandoffCommand) => void;
  /** The panel this one handed its music to says whether it started. */
  onMusicHandoffResult?: (cmd: MusicHandoffResultCommand) => void;
  /**
   * Another panel is asking for what this one is playing. Optional for the
   * same reason: a surface with no player has nothing to hand over.
   */
  onMusicFetch?: (cmd: MusicFetchCommand) => void;
  /** Somebody at another panel is working this one's player. */
  onMusicControl?: (cmd: MusicControlCommand) => void;
}

/**
 * Presence heartbeat + lobby control channel for a paired wall device.
 * Owns phase, DND from server, and dispatch of control commands into media/TTS.
 */
export function usePanelPresence(media: Media, handlers: PresenceHandlers = {}) {
  const { joinMedia, leaveMedia, setRinging } = media;
  // Held in a ref so a new handler identity does not tear down the lobby.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [phase, setPhase] = useState<Phase>("loading");
  const [note, setNote] = useState("");
  const [room, setRoom] = useState("This room");
  const [dnd, setDnd] = useState(false);
  /**
   * Set by a parent in the controller, never from the panel: explicit songs
   * are hidden and skipped here. Read from every heartbeat, so a change
   * reaches the panel within one beat.
   */
  const [musicCleanOnly, setMusicCleanOnly] = useState(false);
  const [etiquette, setEtiquette] = useState<EtiquetteSettings>({
    chimeEnabled: true,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    announceDwellSec: ANNOUNCE_DWELL_DEFAULT,
  });
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [mock, setMock] = useState(false);
  const [speaking, setSpeaking] = useState<Speaking | null>(null);
  const lobbyRef = useRef<Room | null>(null);
  const etiquetteRef = useRef(etiquette);
  etiquetteRef.current = etiquette;

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
      // Which room this panel is. Sent every beat, so renaming it in the
      // controller reaches the panel without anybody touching it.
      if (typeof data.room === "string" && data.room) setRoom(data.room);
      setDnd(!!data.doNotDisturb);
      setMusicCleanOnly(data.musicCleanOnly === true);
      setEtiquette({
        chimeEnabled: data.chimeEnabled !== false,
        quietHoursEnabled: !!data.quietHoursEnabled,
        quietHoursStart:
          data.quietHoursStart != null
            ? minutesToHm(data.quietHoursStart)
            : "22:00",
        quietHoursEnd:
          data.quietHoursEnd != null ? minutesToHm(data.quietHoursEnd) : "07:00",
        announceDwellSec: clampAnnounceDwellSec(
          data.announceDwellSec ?? ANNOUNCE_DWELL_DEFAULT,
        ),
      });
      setMock(!!data.mock);
      const wsUrl = toWsUrl(data.livekitUrl ?? "");
      setLivekitUrl(wsUrl);
      setPhase("ready");

      // The server says so explicitly when it could not mint a lobby token.
      // Surface that instead of attempting a connect with nothing and showing
      // whatever LiveKit's client says about an empty token.
      if (data.livekitError) {
        setReceiving(false);
        setReceiveError(String(data.livekitError));
      }

      /*
       * Already connected, but to a room the server is no longer addressing.
       *
       * This is not hypothetical: renaming the lobby from "lobby" to
       * "lobby:<householdId>" left every panel that was connected at the time
       * sitting in the old room, receiving nothing, with no way to notice —
       * the reconnect below only runs when there is no connection at all, and
       * a LiveKit session does not end just because its token expired.
       *
       * Dropping the stale one lets the reconnect below pick up the new token.
       * The Disconnected handler checks identity before clearing, and the ref
       * is already null here, so it cannot clobber the replacement.
       */
      if (
        lobbyRef.current &&
        data.lobbyRoomName &&
        lobbyRef.current.name !== data.lobbyRoomName
      ) {
        const stale = lobbyRef.current;
        lobbyRef.current = null;
        setReceiving(false);
        await stale.disconnect().catch(() => {});
      }

      if (!data.mock && !data.livekitError && data.lobbyToken && !lobbyRef.current) {
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
              case "musicHandoff":
                handlersRef.current.onMusicHandoff?.(cmd);
                break;
              case "musicHandoffResult":
                handlersRef.current.onMusicHandoffResult?.(cmd);
                break;
              case "musicFetch":
                handlersRef.current.onMusicFetch?.(cmd);
                break;
              case "musicControl":
                handlersRef.current.onMusicControl?.(cmd);
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
              route: "usePanelPresence",
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
            route: "usePanelPresence",
          });
        }
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Connection failed");
      setPhase((p) => (p === "ready" ? p : "error"));
      reportClientError(e, {
        code: "endpoint.heartbeat",
        route: "usePanelPresence",
      });
    }
  }, [joinMedia, leaveMedia, setRinging]);

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
          announceDwellSec: clampAnnounceDwellSec(
            saved.announceDwellSec ?? ANNOUNCE_DWELL_DEFAULT,
          ),
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
    musicCleanOnly,
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
