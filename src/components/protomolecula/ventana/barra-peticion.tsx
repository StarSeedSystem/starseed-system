"use client";
/**
 * Ventana de la Protomolécula · barra de petición a Astraura. Escribir o hablar (mismo motor de dictado que la
 * barra de dictado de los controles), con «Directo» o «En una rama». Enter envía; Mayús+Enter salta de línea.
 */
import { useEffect, useRef, useState } from "react";
import { GitBranch, Mic, Send, Square, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { isDictationSupported, startDictation, type DictationHandle } from "@/lib/aurora/dictation";
import type { ModoEdicion } from "@/lib/protomolecula/peticion/contrato";
import type { MotorDictado } from "../barra-dictado";
import { MAX_TEXTO_PETICION } from "./tipos";

const MOTOR: MotorDictado = { soportado: isDictationSupported, iniciar: (o) => startDictation(o) };

const MODOS: { id: ModoEdicion; nombre: string; Icono: typeof Zap; ayuda: string }[] = [
  { id: "directo", nombre: "Directo", Icono: Zap, ayuda: "El cambio se aplica sobre lo que tienes delante, si el gobierno de esta entidad lo permite." },
  { id: "rama", nombre: "En una rama", Icono: GitBranch, ayuda: "El cambio vive aparte hasta que lo aceptes: el original no se toca (Entidad Única: la rama cita, no copia)." },
];

export interface BarraPeticionProps {
  valor: string;
  alCambiar: (v: string) => void;
  modo: ModoEdicion;
  alCambiarModo: (m: ModoEdicion) => void;
  alEnviar: (texto: string) => void;
  ocupado: boolean;
  placeholder: string;
  motor?: MotorDictado;
  idioma?: string;
  entradaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function BarraPeticion({ valor, alCambiar, modo, alCambiarModo, alEnviar, ocupado, placeholder, motor = MOTOR, idioma = "es-ES", entradaRef }: BarraPeticionProps) {
  const [escuchando, setEscuchando] = useState(false);
  const [errorVoz, setErrorVoz] = useState<string | null>(null);
  const handle = useRef<DictationHandle | null>(null);
  const propio = useRef<HTMLTextAreaElement>(null);
  const area = entradaRef ?? propio;
  const soportado = motor.soportado();
  const ayudaModo = MODOS.find((m) => m.id === modo)?.ayuda;

  useEffect(() => () => { handle.current?.stop(); }, []);

  const enviar = (t: string) => {
    const limpio = t.trim();
    if (!limpio || ocupado) return;
    handle.current?.stop();
    setEscuchando(false);
    alEnviar(limpio);
  };

  const alternarMicro = () => {
    if (escuchando) { handle.current?.stop(); setEscuchando(false); return; }
    setErrorVoz(null);
    handle.current = motor.iniciar({
      lang: idioma,
      onInterim: (t) => alCambiar(t.slice(0, MAX_TEXTO_PETICION)),
      onFinal: (t) => { alCambiar(t.slice(0, MAX_TEXTO_PETICION)); enviar(t); },
      onEnd: () => setEscuchando(false),
      onError: (m) => { setErrorVoz(m); setEscuchando(false); },
    });
    setEscuchando(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Cómo se aplica el cambio" className="grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/5 p-1">
        {MODOS.map(({ id, nombre, Icono }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={modo === id}
            title={MODOS.find((m) => m.id === id)?.ayuda}
            onClick={() => alCambiarModo(id)}
            className={cn(
              "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80",
              modo === id ? "bg-[#10B981] text-[#0A0F1D]" : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icono className="h-3.5 w-3.5" aria-hidden="true" />
            {nombre}
          </button>
        ))}
      </div>
      {ayudaModo && <p className="px-1 text-[11px] leading-snug text-white/60">{ayudaModo}</p>}

      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="peticion-astraura">Petición a Astraura</label>
        <textarea
          id="peticion-astraura"
          ref={area}
          rows={2}
          value={valor}
          maxLength={MAX_TEXTO_PETICION}
          disabled={ocupado}
          placeholder={placeholder}
          onChange={(e) => alCambiar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(valor); }
          }}
          className="min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl border border-white/15 bg-black/20 px-3 py-2 text-sm leading-snug text-white placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={alternarMicro}
          disabled={!soportado || ocupado}
          aria-pressed={escuchando}
          aria-label={escuchando ? "Detener dictado" : "Pedir por voz"}
          title={soportado ? undefined : "Este navegador no ofrece dictado por voz: escribe la petición."}
          className={cn(
            "grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-white/15 text-white transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80",
            escuchando && "bg-[#DC143C]/30 border-[#DC143C]/60",
          )}
        >
          {escuchando ? <Square className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => enviar(valor)}
          disabled={ocupado || !valor.trim()}
          aria-label="Pedir a Astraura"
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-[#10B981] text-[#0A0F1D] transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {!soportado && <p className="px-1 text-[11px] text-white/60">Este navegador no ofrece dictado por voz: escribe la petición.</p>}
      {errorVoz && <p role="alert" className="px-1 text-[11px] text-[#FF6B85]">{errorVoz}</p>}
    </div>
  );
}
