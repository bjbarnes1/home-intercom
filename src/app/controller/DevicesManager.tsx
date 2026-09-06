"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

interface DeviceRow {
  id: string;
  displayName: string;
  room: string | null;
  type: "ENDPOINT" | "CONTROLLER";
  pairing: "PENDING" | "ACTIVE" | "REVOKED";
  online: boolean;
}

interface PairingInfo {
  displayName: string;
  code: string;
}

export default function DevicesManager({ onBack }: { onBack: () => void }) {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/devices");
    if (res.ok) setDevices((await res.json()).devices ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const addDevice = useCallback(async () => {
    if (!name.trim()) {
      setError("Give the device a name.");
      return;
    }
    setError("");
    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: name.trim(),
        room: room.trim() || undefined,
        type: "ENDPOINT",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Couldn't add device");
      return;
    }
    setName("");
    setRoom("");
    setAdding(false);
    setPairing({ displayName: data.device.displayName, code: data.device.pairingCode });
    load();
  }, [name, room, load]);

  const recode = useCallback(
    async (d: DeviceRow) => {
      const res = await fetch(`/api/devices/${d.id}/recode`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setPairing({ displayName: data.device.displayName, code: data.device.pairingCode });
        load();
      }
    },
    [load],
  );

  if (pairing) {
    return <PairingCard info={pairing} onDone={() => setPairing(null)} />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col p-5">
      <header className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="btn btn-ghost min-h-9 px-2">
          <i className="ph ph-caret-left text-lg" />
        </button>
        <div className="flex-1 font-heading text-lg font-medium">Devices</div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="btn btn-primary min-h-9 text-xs"
        >
          <i className="ph ph-plus" />
          Add
        </button>
      </header>

      {adding && (
        <div className="card mb-4 flex flex-col gap-3 p-4">
          <div className="field">
            <label>Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Playroom"
            />
          </div>
          <div className="field">
            <label>Room (optional)</label>
            <input
              className="input"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Playroom"
            />
          </div>
          {error && <p className="text-sm text-accent-200">{error}</p>}
          <button onClick={addDevice} className="btn btn-primary min-h-11">
            Create &amp; get code
          </button>
        </div>
      )}

      <div className="uplabel mb-2">Endpoints</div>
      <div className="flex flex-col gap-1.5">
        {devices
          .filter((d) => d.type === "ENDPOINT")
          .map((d) => (
            <div key={d.id} className="card flex items-center gap-3 p-3">
              <span className={`dot ${d.online ? "dot-online" : "dot-offline"}`} />
              <div className="min-w-0 flex-1">
                <div className="font-heading text-[15px] font-medium">
                  {d.displayName}
                </div>
                <div className="text-[11px] text-neutral-500">
                  {d.pairing === "ACTIVE"
                    ? d.online
                      ? "Online"
                      : "Paired · offline"
                    : d.pairing === "PENDING"
                      ? "Waiting to pair"
                      : "Revoked"}
                </div>
              </div>
              <button onClick={() => recode(d)} className="btn btn-secondary min-h-9 text-xs">
                <i className="ph ph-qr-code" />
                {d.pairing === "ACTIVE" ? "Re-pair" : "Pair"}
              </button>
            </div>
          ))}
        {devices.length === 0 && (
          <div className="text-sm text-neutral-600">No devices yet.</div>
        )}
      </div>
    </div>
  );
}

function PairingCard({
  info,
  onDone,
}: {
  info: PairingInfo;
  onDone: () => void;
}) {
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/endpoint?code=${info.code}`;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 240,
      color: { dark: "#e9e9ed", light: "#00000000" },
    })
      .then(setQr)
      .catch(() => setQr(""));
  }, [info.code]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="uplabel text-accent">Pair {info.displayName}</div>
      <p className="max-w-xs text-sm text-neutral-400">
        On the room device, open <span className="text-neutral-200">/endpoint</span> and
        enter this code — or scan the QR to fill it in.
      </p>

      <div className="font-heading text-5xl font-medium tracking-[0.3em] text-accent-200">
        {info.code}
      </div>

      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="Pairing QR code" width={200} height={200} className="rounded-xl" />
      )}

      <p className="max-w-xs text-[11px] text-neutral-600">
        The code expires in 15 minutes. Re-pairing revokes the old device.
      </p>

      <button onClick={onDone} className="btn btn-primary min-h-12 w-full max-w-xs">
        Done
      </button>
    </div>
  );
}
