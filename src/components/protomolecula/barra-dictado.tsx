"use client";

/**
 * Protomolécula · BARRA DE DICTADO. Escribir o hablar una orden («sube la
 * reverberación un 10 %») y ver debajo qué se aplicó — o por qué no. El
 * reconocedor real vive en `@/lib/aurora/dictation` (ya corrige los términos
 * StarSeed); aquí solo se inyecta un `motor` con la misma forma.
 */
import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  isDictationSupported,
  startDictation,
  type DictationHandle,
  type DictationOptions,
} from "@/lib/aurora/dictation";
import type { ResultadoDictado } from "@/lib/protomolecula/dictado";

/** Motor de dictado inyectable (por defecto, el de Aurora). */
export interface MotorDictado {
  soportado: () => boolean;
  iniciar: (o: DictationOptions) => DictationHandle;
}

const MOTOR_POR_DEFECTO: MotorDictado = {
  soportado: isDictationSupported,
  iniciar: (o) => startDictation(o),
};

export interface BarraDictadoProps {
  /** Interpreta la frase y devuelve un resultado por operación intentada. */
  alDictar: (frase: string) => ResultadoDictado[];
  motor?: MotorDictado;
  idioma?: string;
}

export function BarraDictado({ alDictar, motor = MOTOR_POR_DEFECTO, idioma = "es-ES" }: BarraDictadoProps) {
  const [frase, setFrase] = useState("");
  const [resultados, setResultados] = useState<ResultadoDictado[]>([]);
  const [errorVoz, setErrorVoz] = useState<string | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const handleRef = useRef<DictationHandle | null>(null);
  const soportado = motor.soportado();

  useEffect(() => () => { handleRef.current?.stop(); }, []);

  const aplicar = (texto: string) => {
    const limpia = texto.trim();
    if (!limpia) return;
    handleRef.current?.stop();
    setEscuchando(false);
    setResultados(alDictar(limpia));
    setFrase("");
  };

  const alternarMicro = () => {
    if (escuchando) {
      handleRef.current?.stop();
      setEscuchando(false);
      return;
    }
    setErrorVoz(null);
    handleRef.current = motor.iniciar({
      lang: idioma,
      onInterim: (t) => setFrase(t),
      onFinal: (t) => aplicar(t),
      onEnd: () => setEscuchando(false),
      onError: (m) => setErrorVoz(m),
    });
    setEscuchando(true);
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={frase}
          onChange={(e) => setFrase(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") aplicar(frase); }}
          placeholder="Escribe o dicta una orden…"
          aria-label="Orden para la protomolécula"
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={alternarMicro}
          disabled={!soportado}
          aria-pressed={escuchando}
          aria-label={escuchando ? "Detener dictado" : "Dictar por voz"}
          title={soportado ? undefined : "Este navegador no ofrece dictado por voz: escribe la orden."}
          className="cursor-pointer rounded-md border border-input px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {escuchando ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => aplicar(frase)}
          className="cursor-pointer rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          Aplicar
        </button>
      </div>
      {!soportado && (
        <p className="text-xs text-muted-foreground">
          Este navegador no ofrece dictado por voz: escribe la orden.
        </p>
      )}
      {errorVoz && <p role="alert" className="text-xs text-destructive">{errorVoz}</p>}
      <div role="status" aria-live="polite" className="flex flex-col gap-1 text-sm">
        {resultados.map((r, i) =>
          r.ok ? (
            <p key={i}>{r.resumen}</p>
          ) : (
            <div key={i}>
              <p>
                No he aplicado nada. {r.razon} {r.sugerencia}
              </p>
              {r.candidatos && r.candidatos.length > 0 && (
                <p className="text-xs text-muted-foreground">Quizá quisiste decir: {r.candidatos.join(", ")}.</p>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export default BarraDictado;
