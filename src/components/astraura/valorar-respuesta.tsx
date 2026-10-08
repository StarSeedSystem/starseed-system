"use client";

// Botones de valoración bajo cada respuesta de Astraura (contrato §8):
// 👍 / 👎 y «corregir». Cada valoración se guarda en IDB como experiencia
// (ámbito, capa y modelo que respondieron) vía registrarValoracion.
import { useCallback, useRef, useState } from "react";
import { ThumbsUp, ThumbsDown, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Almacen, Capa, Valoracion, ResultadoHerramienta } from "@/lib/astraura/experiencias";
import { registrarValoracion } from "@/lib/astraura/experiencias-aprendizaje";
import { almacenIDB } from "@/lib/astraura/experiencias-idb";

export interface ValorarRespuestaProps {
  /** Lo que la persona preguntó. */
  entrada: string;
  /** La respuesta valorada. */
  respuesta: string;
  /** Ámbito de la conversación (perfil, página, comunidad…). */
  ambito?: string;
  capa?: Capa;
  /** Modelo que respondió (si se conoce). */
  modelo?: string;
  /** Herramientas que usó la respuesta y si acertaron, si las hubo. */
  herramientas?: ResultadoHerramienta[];
  /** Almacén inyectable (pruebas); en el navegador, IDB por defecto. */
  almacen?: Almacen;
  /** Aviso tras guardar (p. ej. para telemetría de vista). */
  onValorada?: (valoracion: Valoracion, correccion?: string) => void;
  className?: string;
}

export function ValorarRespuesta(props: ValorarRespuestaProps) {
  const {
    entrada, respuesta, ambito = "cuenta", capa = "llm", modelo = "",
    herramientas, almacen, onValorada, className,
  } = props;
  const [estado, setEstado] = useState<"esperando" | "guardado" | "corrigiendo">("esperando");
  const [textoCorreccion, setTextoCorreccion] = useState("");
  const refAlmacen = useRef<Almacen | null>(null);

  const obtenerAlmacen = useCallback((): Almacen => {
    if (almacen) return almacen;
    if (!refAlmacen.current) refAlmacen.current = almacenIDB();
    return refAlmacen.current;
  }, [almacen]);

  const guardar = useCallback(
    (valoracion: Valoracion, correccion?: string) => {
      setEstado("guardado");
      onValorada?.(valoracion, correccion);
      void registrarValoracion(
        {
          ambito,
          capa,
          modelo,
          entrada,
          respuesta,
          valoracion,
          correccion,
          herramientas,
        },
        obtenerAlmacen(),
      ).catch(() => {
        /* el aprendizaje nunca rompe el chat */
      });
    },
    [ambito, capa, modelo, entrada, respuesta, herramientas, obtenerAlmacen, onValorada],
  );

  if (estado === "guardado") {
    return (
      <div
        className={cn("text-[10px] text-white/40 italic", className)}
        role="status"
        aria-live="polite"
      >
        Gracias: tu valoración enseña a Astraura.
      </div>
    );
  }

  if (estado === "corrigiendo") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label className="sr-only" htmlFor="valorar-correccion">
          Escribe la respuesta correcta
        </label>
        <textarea
          id="valorar-correccion"
          value={textoCorreccion}
          onChange={(ev) => setTextoCorreccion(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") setEstado("esperando");
          }}
          placeholder="¿Cómo debería haber respondido?"
          rows={2}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/85 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#7fb8ff]/50"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            className="axc-btn lime cursor-pointer"
            onClick={() => guardar("negativa", textoCorreccion)}
            disabled={!textoCorreccion.trim()}
            aria-label="Enviar corrección"
          >
            <Check className="h-3 w-3" /> Enviar corrección
          </button>
          <button
            type="button"
            className="axc-btn cursor-pointer"
            onClick={() => setEstado("esperando")}
            aria-label="Cancelar corrección"
          >
            <X className="h-3 w-3" /> Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)} role="group" aria-label="Valorar respuesta">
      <button
        type="button"
        className="axc-tree-act cursor-pointer"
        onClick={() => guardar("positiva")}
        title="Respuesta útil"
        aria-label="Respuesta útil"
      >
        <ThumbsUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="axc-tree-act cursor-pointer"
        onClick={() => guardar("negativa")}
        title="Respuesta incorrecta o poco útil"
        aria-label="Respuesta incorrecta"
      >
        <ThumbsDown className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="axc-tree-act cursor-pointer"
        onClick={() => setEstado("corrigiendo")}
        title="Corregir la respuesta"
        aria-label="Corregir la respuesta"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

export default ValorarRespuesta;
