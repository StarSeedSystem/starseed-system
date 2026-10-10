"use client";

/**
 * LlamadaDirectaFlotante — timbre y llamada en curso por un enlace LOCAL sin internet (2026-10-10).
 * Montada perezosa desde `MallaNeuronasMount` (todas las rutas menos las de consola) y dentro del
 * panel «Vincular sin internet» (para las rutas donde el montaje global no corre): solo la dibuja
 * una instancia. Lógica en `src/lib/malla/llamada-directa.ts`. Contrato:
 * `architecture/transporte-universal-sin-internet.md`.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, MicOff, Phone, PhoneIncoming, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  alternarMicro,
  asegurarEscuchaLlamadas,
  colgarLlamada,
  contestarLlamada,
  rechazarLlamada,
  useLlamadaDirecta,
} from "@/lib/malla/llamada-directa";

const boton =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50";

let duenoLlamada: symbol | null = null;
const oyentesDueno = new Set<() => void>();

/**
 * La llamada flotante puede estar montada dos veces (global y dentro del panel): solo la dibuja
 * la primera instancia; si esa se desmonta, la siguiente la toma.
 */
function useSoyDueno(): boolean {
  const yo = useRef(Symbol("llamada"));
  const [, setN] = useState(0);
  useEffect(() => {
    const intentar = () => {
      if (!duenoLlamada) duenoLlamada = yo.current;
      setN((n) => n + 1);
    };
    oyentesDueno.add(intentar);
    intentar();
    return () => {
      oyentesDueno.delete(intentar);
      if (duenoLlamada === yo.current) {
        duenoLlamada = null;
        for (const g of Array.from(oyentesDueno)) g();
      }
    };
  }, []);
  return duenoLlamada === yo.current;
}

function Medio({ stream, video, silenciar }: { stream: MediaStream | null; video: boolean; silenciar?: boolean }) {
  const refVideo = useRef<HTMLVideoElement | null>(null);
  const refAudio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = video ? refVideo.current : refAudio.current;
    if (el) el.srcObject = stream;
  }, [stream, video]);
  if (!stream) return null;
  return video ? (
    <video ref={refVideo} autoPlay playsInline muted={silenciar} className="w-full rounded-lg bg-black object-cover" />
  ) : (
    <audio ref={refAudio} autoPlay muted={silenciar} />
  );
}

export function LlamadaDirectaFlotante() {
  const ll = useLlamadaDirecta();
  const dueno = useSoyDueno();
  useEffect(() => {
    asegurarEscuchaLlamadas();
  }, []);
  if (!dueno || ll.fase === "inactiva") return null;
  const tieneVideoRemoto = !!ll.remoto?.getVideoTracks().length;
  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[min(92vw,340px)] space-y-2 rounded-2xl border border-emerald-400/30 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur" role="dialog" aria-label="Llamada directa sin internet">
      <div className="flex items-center gap-2 text-[12px]">
        {ll.fase === "entrante" ? <PhoneIncoming className="h-4 w-4 animate-pulse text-emerald-300" /> : <Phone className="h-4 w-4 text-emerald-300" />}
        <span className="font-medium">
          {ll.fase === "entrante"
            ? `${ll.nombre} te llama${ll.video ? " (vídeo)" : ""}`
            : ll.fase === "llamando"
              ? `Llamando a ${ll.nombre}…`
              : ll.fase === "en-curso"
                ? ll.nombre
                : "Llamada terminada"}
        </span>
        <span className="ml-auto text-[10px] text-emerald-200/70">sin internet</span>
      </div>
      {ll.fase === "en-curso" || ll.fase === "llamando" ? (
        <div className="space-y-1.5">
          <Medio stream={ll.remoto} video={tieneVideoRemoto} />
          {ll.video ? (
            <div className="ml-auto w-24">
              <Medio stream={ll.local} video silenciar />
            </div>
          ) : null}
          {ll.fase === "en-curso" && !ll.remoto ? <p className="text-[10px] text-white/50">Esperando el audio del otro lado…</p> : null}
        </div>
      ) : null}
      {ll.motivo ? <p className="text-[11px] text-white/60">{ll.motivo}</p> : null}
      <div className="flex flex-wrap justify-end gap-1.5">
        {ll.fase === "entrante" ? (
          <>
            <button type="button" onClick={() => rechazarLlamada()} className={cn(boton, "border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30")}>
              <PhoneOff className="h-3 w-3" /> Rechazar
            </button>
            <button
              type="button"
              onClick={async () => {
                const r = await contestarLlamada();
                if (!r.ok && r.motivo) toast.error(r.motivo);
              }}
              className={cn(boton, "border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30")}
            >
              <Phone className="h-3 w-3" /> Contestar
            </button>
          </>
        ) : null}
        {ll.fase === "en-curso" ? (
          <button type="button" onClick={() => alternarMicro()} className={cn(boton, "border-white/20 text-white/80 hover:border-white/40")} aria-label={ll.micro ? "Silenciar micrófono" : "Activar micrófono"}>
            {ll.micro ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />} {ll.micro ? "Micro" : "Silenciado"}
          </button>
        ) : null}
        {ll.fase === "en-curso" || ll.fase === "llamando" ? (
          <button type="button" onClick={() => colgarLlamada()} className={cn(boton, "border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30")}>
            <PhoneOff className="h-3 w-3" /> Colgar
          </button>
        ) : null}
      </div>
    </div>
  );
}
