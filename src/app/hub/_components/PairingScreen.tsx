"use client";

interface Props {
  code: string;
  note: string;
  onCodeChange: (code: string) => void;
  onClaim: () => void;
}

export default function PairingScreen({ code, note, onCodeChange, onClaim }: Props) {
  return (
    <main className="kiosk grid min-h-screen place-items-center p-6">
      <div className="flex w-full max-w-xs flex-col gap-4 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-900 text-accent">
          <i className="ph-fill ph-speaker-high text-3xl" />
        </span>
        <h1 className="m-0 text-2xl">Pair this device</h1>
        <p className="text-sm text-neutral-400">
          Enter the 6-character code from the Controller app.
        </p>
        <input
          value={code}
          onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
          maxLength={6}
          autoCapitalize="characters"
          className="input text-center text-2xl tracking-[0.4em]"
          placeholder="ABC234"
        />
        <button onClick={onClaim} className="btn btn-primary min-h-12">
          Pair
        </button>
        {note && <p className="text-sm text-accent-200">{note}</p>}
      </div>
    </main>
  );
}
