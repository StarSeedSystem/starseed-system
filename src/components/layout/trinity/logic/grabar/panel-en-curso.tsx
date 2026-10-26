"use client";

/**
 * Mientras se prepara, se cuenta hacia atrás, se graba, se pausa o se cierra el archivo.
 * Dice lo que de verdad entra en la grabación (micrófono, sonido, cámara), el tamaño en vivo y lo que
 * hay que saber: que se puede cerrar el panel y la grabación sigue.
 */
import { Camera, ImageDown, Loader2, Mic, Pause, Play, Square, Video, Volume2 } from "lucide-react";
import type { Controlador } from "@/lib/grabacion/controlador";
import { formatearTamano } from "@/lib/grabacion/texto";
import { LIMITE_BIBLIOTECA_BYTES, type Instantanea, type SuperficieGrabada } from "@/lib/grabacion/tipos";
import { cn } from "@/lib/utils";
import { BotonLogic } from "../boton-logic";
import { Cronometro } from "./cronometro";

export const ROTULO_SUPERFICIE: Record<SuperficieGrabada, string> = {
  monitor: "Pantalla completa",
  window: "Ventana",
  browser: "Pestaña",
  camara: "Cámara",
};

interface Props {
  estado: Instantanea;
  controlador: Controlador;
  puedeCapturar: boolean;
  /** Mensaje de la última captura de fotograma que falló. */
  avisoCaptura: string | null;
  onCapturar: () => void;
}

function Chip({ icono: Icono, texto }: { icono: typeof Mic; texto: string }) {
  return (
    <li className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2 py-1 text-[11px] text-amber-50/85">
      <Icono className="h-3 w-3" aria-hidden="true" /> {texto}
    </li>
  );
}

export function PanelEnCurso({ estado: s, controlador, puedeCapturar, avisoCaptura, onCapturar }: Props) {
  if (s.fase === "preparando") {
    return (
      <div role="status" data-testid="grabar-preparando" className="flex items-center gap-3 rounded-3xl border border-amber-300/30 bg-amber-400/[0.08] p-4">
        <Loader2 className="h-5 w-5 shrink-0 text-amber-300 motion-safe:animate-spin" aria-hidden="true" />
        <p className="text-[13px] leading-snug text-amber-50">Elige en la ventana del navegador qué quieres compartir…</p>
      </div>
    );
  }

  if (s.fase === "cuenta-atras") {
    return (
      <div role="group" aria-label="Cuenta atrás" data-testid="grabar-cuenta-atras" className="rounded-3xl border border-amber-300/40 bg-gradient-to-br from-amber-400/20 via-black/30 to-black/40 p-4 text-center">
        <p role="status" aria-live="assertive" className="sr-only">
          Empieza en {s.cuenta}
        </p>
        <div
          key={s.cuenta}
          aria-hidden="true"
          className="font-headline text-7xl font-light tabular-nums text-amber-100 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:duration-300"
        >
          {s.cuenta}
        </div>
        <p className="mt-1 text-[12px] leading-snug text-amber-100/70">
          Empieza a grabar en {s.cuenta} s. Puedes cerrar este panel: la grabación sigue y la controlas al volver a abrirlo.
        </p>
        <div className="mt-3">
          <BotonLogic onClick={() => controlador.cancelar()} bloque>
            Cancelar
          </BotonLogic>
        </div>
      </div>
    );
  }

  if (s.fase === "procesando") {
    return (
      <div role="status" data-testid="grabar-procesando" className="flex items-center gap-3 rounded-3xl border border-amber-300/30 bg-amber-400/[0.08] p-4">
        <Loader2 className="h-5 w-5 shrink-0 text-amber-300 motion-safe:animate-spin" aria-hidden="true" />
        <p className="text-[13px] leading-snug text-amber-50">Preparando tu archivo…</p>
      </div>
    );
  }

  // grabando | pausada
  const pausada = s.fase === "pausada";
  const cercaDelLimite = s.bytes >= LIMITE_BIBLIOTECA_BYTES * 0.9;
  const superaLimite = s.bytes > LIMITE_BIBLIOTECA_BYTES;
  return (
    <div
      role="group"
      aria-label={pausada ? "Grabación en pausa" : "Grabando"}
      data-testid="grabar-en-curso"
      className={cn(
        "rounded-3xl border p-4",
        pausada
          ? "border-amber-300/40 bg-gradient-to-br from-amber-400/15 via-black/30 to-black/40"
          : "border-red-400/50 bg-gradient-to-br from-red-500/20 via-black/30 to-black/40 shadow-[0_0_28px_-10px_rgba(220,20,60,0.6)]",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn("h-3 w-3 shrink-0 rounded-full", pausada ? "bg-amber-300" : "bg-red-500 shadow-[0_0_10px_#DC143C] motion-safe:animate-pulse")}
        />
        <Cronometro estado={s} className="font-headline text-4xl font-light tabular-nums leading-none text-amber-50" />
        <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/80">{pausada ? "En pausa" : "Grabando"}</span>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-amber-100/70" data-testid="grabar-tamano">
        {formatearTamano(s.bytes)}
        {s.superficie ? ` · ${ROTULO_SUPERFICIE[s.superficie]}` : ""}
        {s.mimeType ? ` · ${s.mimeType.startsWith("video/mp4") ? "MP4" : "WebM"}` : ""}
      </p>

      <ul aria-label="Lo que entra en la grabación" className="mt-2 flex flex-wrap gap-1.5">
        <Chip icono={Video} texto="Imagen" />
        {s.conMicrofono && <Chip icono={Mic} texto="Micrófono" />}
        {s.conSonidoSistema && <Chip icono={Volume2} texto="Sonido del sistema" />}
        {s.conCamara && s.superficie !== "camara" && <Chip icono={Camera} texto="Cámara superpuesta" />}
      </ul>

      {(cercaDelLimite || superaLimite) && (
        <p role="note" className="mt-2 rounded-xl bg-white/[0.06] px-3 py-2 text-[11px] leading-snug text-amber-100/80">
          {superaLimite
            ? "Ya supera los 50 MB de la Biblioteca: al terminar podrás descargarla, pero no guardarla ahí."
            : "Te acercas a los 50 MB que admite la Biblioteca. Podrás descargarla igualmente."}
        </p>
      )}

      {s.avisos.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Avisos">
          {s.avisos.map((a) => (
            <li key={a} className="rounded-xl bg-white/[0.06] px-3 py-2 text-[11px] leading-snug text-amber-100/80">
              {a}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {pausada ? (
          <BotonLogic icono={Play} onClick={() => controlador.reanudar()}>
            Reanudar
          </BotonLogic>
        ) : (
          <BotonLogic icono={Pause} onClick={() => controlador.pausar()}>
            Pausar
          </BotonLogic>
        )}
        <BotonLogic variante="peligro" icono={Square} onClick={() => void controlador.parar()}>
          Parar
        </BotonLogic>
      </div>
      {puedeCapturar && (
        <div className="mt-2">
          <BotonLogic icono={ImageDown} onClick={onCapturar} bloque>
            Capturar un fotograma
          </BotonLogic>
        </div>
      )}
      {avisoCaptura && (
        <p role="alert" className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] leading-snug text-red-100">
          {avisoCaptura}
        </p>
      )}

      <p className="mt-3 text-[11px] leading-snug text-amber-100/55">
        Puedes cerrar este panel y seguir con lo tuyo: la grabación continúa. Vuelve a abrirlo por el borde derecho para pausar o parar, o usa «Dejar de compartir» del navegador.
      </p>
    </div>
  );
}
