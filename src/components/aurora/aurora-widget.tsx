"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Settings2, Sparkles, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "./aurora-provider";

export function AuroraWidget() {
  const aurora = useAurora();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  // Cierra el popover al pulsar Escape.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!aurora) return null;

  const {
    supported, enabled, listening, speaking, transcript, interim, lastReply,
    activePersonality, personalities, toggle, speak, setEnabled, setActivePersonality,
  } = aurora;

  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => { longPressed.current = true; setOpen(true); }, 500);
  };
  const endPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };
  const onClick = () => {
    if (longPressed.current) { longPressed.current = false; return; }
    if (!supported) return;
    toggle();
  };

  const state = !supported ? "off" : speaking ? "speaking" : listening ? "listening" : "idle";

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 select-none">
      {open && (
        <div className="w-80 max-w-[88vw] rounded-2xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-fuchsia-900/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">Aurora</div>
              <div className="text-[10px] text-white/45">La voz de Astraura</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-xs text-white/70">Aurora activa</span>
            <button
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition", enabled ? "bg-fuchsia-600" : "bg-white/15")}
            >
              <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition", enabled ? "translate-x-4" : "translate-x-0.5")} />
            </button>
          </div>

          {personalities.length > 0 && (
            <label className="block text-[11px] text-white/50">
              Personalidad
              <select
                value={activePersonality.id || ""}
                onChange={(e) => {
                  const p = personalities.find((x) => x.id === e.target.value);
                  if (p) setActivePersonality(p);
                }}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
              >
                {!activePersonality.id && <option value="" className="bg-zinc-900">{activePersonality.name}</option>}
                {personalities.map((p) => (
                  <option key={p.id} value={p.id} className="bg-zinc-900">{p.name}</option>
                ))}
              </select>
            </label>
          )}

          {(interim || transcript) && (
            <div className="rounded-lg bg-black/40 border border-white/10 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-cyan-300/50 mb-0.5">Tú</div>
              <div className="text-xs text-white/80">{interim || transcript}</div>
            </div>
          )}
          {lastReply && (
            <div className="rounded-lg bg-fuchsia-950/30 border border-fuchsia-500/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-fuchsia-300/50 mb-0.5">Aurora</div>
              <div className="text-xs text-fuchsia-50/90">{lastReply}</div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => speak(`Hola, soy ${activePersonality.name}. Estoy aquí para ayudarte en StarSeed.`)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20 transition"
            >
              <Volume2 className="w-3.5 h-3.5" /> Probar voz
            </button>
            <button
              onClick={() => { setOpen(false); try { router.push("/aurora"); } catch { /* */ } }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 transition"
            >
              <Settings2 className="w-3.5 h-3.5" /> Configurar Aurora
            </button>
          </div>

          {!supported && (
            <div className="text-[10px] text-amber-300/70 text-center">Tu navegador no soporta voz. Aún puedes configurar personalidades.</div>
          )}
        </div>
      )}

      <button
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        title={!supported ? "Tu navegador no soporta voz" : listening ? "Escuchando… (clic para parar)" : "Hablar con Aurora (clic) · mantén pulsado para opciones"}
        aria-label="Aurora"
        className={cn(
          "relative h-14 w-14 rounded-full flex items-center justify-center shadow-xl transition-transform active:scale-95",
          "bg-gradient-to-tr from-fuchsia-600 to-cyan-500",
          !supported && "opacity-50 grayscale",
          state === "listening" && "ring-4 ring-fuchsia-400/40",
          state === "speaking" && "ring-4 ring-cyan-400/40",
        )}
      >
        {(state === "listening" || state === "speaking") && (
          <span className={cn(
            "absolute inset-0 rounded-full animate-ping",
            state === "listening" ? "bg-fuchsia-500/40" : "bg-cyan-500/40"
          )} />
        )}
        <span className="relative">
          {!supported ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
        </span>
        {enabled && supported && (
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-zinc-950" />
        )}
      </button>
    </div>
  );
}

export default AuroraWidget;
