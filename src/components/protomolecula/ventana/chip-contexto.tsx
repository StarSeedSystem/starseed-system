"use client";
/**
 * Ventana de la Protomolécula · chip del contexto: qué tienes delante (grupo X, publicación Y, archivo Z…),
 * en qué ámbito vive (personal › perfil › grupo › pública) y qué gobierno aplica a un cambio de diseño aquí.
 * El gobierno sale de `decidirCambio` (el mismo que decide al confirmar): el chip nunca promete otra cosa.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { decidirCambio } from "@/lib/protomolecula/gobierno";
import type { ContextoProto, VeredictoGobierno } from "@/lib/protomolecula/peticion/contrato";
import { ETIQUETA_AMBITO, actorDeLaVentana, entidadGobernante, etiquetaContexto, etiquetaEntidad, etiquetaSeleccion } from "./contexto";
import { ICONO_AMBITO, ICONO_ENTIDAD, TONO_DECISION } from "./iconos";
import { Layers } from "lucide-react";

const FRASE: Record<VeredictoGobierno["decision"], string> = {
  aplicar: "se aplica",
  proponer: "se propone",
  votar: "se vota",
  denegar: "no está permitido para ti",
};

export function ChipContexto({ contexto }: { contexto: ContextoProto }) {
  const veredicto = useMemo<VeredictoGobierno | null>(() => {
    try { return decidirCambio(contexto, actorDeLaVentana(contexto, "humano"), "diseno"); } catch { return null; }
  }, [contexto]);
  const Icono = contexto.entidad ? ICONO_ENTIDAD[contexto.entidad.tipo] : Layers;
  const IconoAmbito = ICONO_AMBITO[contexto.ambito];
  const etiqueta = etiquetaContexto(contexto);
  const gobierna = entidadGobernante(contexto);
  const tono = veredicto ? TONO_DECISION[veredicto.decision] : null;

  return (
    <section role="group" aria-label="Lo que tienes delante" data-testid="chip-contexto" className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icono className="h-4 w-4 shrink-0 text-[#00F0FF]" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate font-headline text-sm font-semibold tracking-wide" title={etiqueta}>{etiqueta}</p>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/80"
          title="Ámbito: de lo más privado a lo más abierto, personal › perfil › grupo › pública. Nunca al revés."
        >
          <IconoAmbito className="h-3 w-3" aria-hidden="true" />
          {ETIQUETA_AMBITO[contexto.ambito]}
        </span>
      </div>
      {contexto.seleccion && (
        <p className="mt-1 truncate text-xs text-white/70" title={etiquetaSeleccion(contexto.seleccion)}>Selección · {etiquetaSeleccion(contexto.seleccion)}</p>
      )}
      {gobierna && gobierna.id !== contexto.entidad?.id && (
        <p className="mt-1 truncate text-xs text-white/70">Gobierna · {etiquetaEntidad(gobierna)}</p>
      )}
      {veredicto && tono && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-snug text-white/80" title={veredicto.motivo}>
          <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", tono.punto)} aria-hidden="true" />
          <span>Un cambio de diseño aquí <strong className={cn("font-semibold", tono.texto)}>{FRASE[veredicto.decision]}</strong>. {veredicto.motivo}</span>
        </p>
      )}
    </section>
  );
}
