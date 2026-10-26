"use client";
/**
 * Ventana de la Protomolécula · pestaña «Gobierno»: la privacidad y las reglas de la Protomolécula de un grupo,
 * una comunidad o una página (o de lo que cuelga de uno). Solo existe cuando hay una entidad con gobierno.
 */
import { Landmark } from "lucide-react";
import type { ContextoProto } from "@/lib/protomolecula/peticion/contrato";
import { entidadGobernante, etiquetaEntidad } from "./contexto";
import { ResumenGobierno } from "./ranura-gobierno";

export function PestanaGobierno({ contexto }: { contexto: ContextoProto }) {
  const gobierna = entidadGobernante(contexto);
  if (!gobierna) {
    return <p role="status" className="px-1 py-2 text-xs text-white/70">Aquí no hay un grupo, una comunidad ni una página con gobierno propio.</p>;
  }
  return (
    <section aria-label={`Protomolécula de ${etiquetaEntidad(gobierna)}`} data-testid="pestana-gobierno" className="flex flex-col gap-3">
      <p className="flex items-center gap-2 font-headline text-sm font-semibold tracking-wide">
        <Landmark className="h-4 w-4 text-[#FFBF00]" aria-hidden="true" />
        Protomolécula de {etiquetaEntidad(gobierna)}
      </p>
      <ResumenGobierno contexto={contexto} />
    </section>
  );
}

export default PestanaGobierno;
