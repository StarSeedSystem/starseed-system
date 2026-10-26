"use client";
/**
 * Ventana de la Protomolécula · RANURA del resumen de gobierno. Un solo punto donde enchufar el componente
 * `GobiernoProtoResumen` de la ola (agente P2, `src/components/protomolecula/gobierno/`).
 *
 * Mientras ese componente no esté integrado, la ranura usa un resumen propio y HONESTO: cómo decide hoy el
 * gobierno de la entidad cada tipo de cambio (el mismo `decidirCambio` que usa la petición al confirmar).
 *
 * PARA INTEGRAR (una línea): sustituir `ResumenGobierno` por
 *   const ResumenGobierno = dynamic(() => import("@/components/protomolecula/gobierno/<archivo>").then((m) => m.GobiernoProtoResumen), { ssr: false, loading: () => <ResumenGobiernoLocal contexto={...} /> })
 * con la misma firma `{ contexto: ContextoProto }`.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { decidirCambio } from "@/lib/protomolecula/gobierno";
import { TIPOS_CAMBIO_PROTO, type ContextoProto, type TipoCambioProto, type VeredictoGobierno } from "@/lib/protomolecula/peticion/contrato";
import { actorDeLaVentana, entidadGobernante, etiquetaEntidad } from "./contexto";
import { TONO_DECISION } from "./iconos";

export const ETIQUETA_CAMBIO: Record<TipoCambioProto, string> = {
  contenido: "Contenido", diseno: "Diseño", funciones: "Funciones", permisos: "Permisos", reglas: "Reglas", creacion: "Creación",
};
const FRASE: Record<VeredictoGobierno["decision"], string> = { aplicar: "Se aplica", proponer: "Se propone", votar: "Se vota", denegar: "No permitido" };

export interface ResumenGobiernoProps { contexto: ContextoProto }

export function ResumenGobiernoLocal({ contexto }: ResumenGobiernoProps) {
  const filas = useMemo(
    () => TIPOS_CAMBIO_PROTO.map((tipo) => {
      let v: VeredictoGobierno | null = null;
      try { v = decidirCambio(contexto, actorDeLaVentana(contexto, "humano"), tipo); } catch { v = null; }
      return { tipo, v };
    }),
    [contexto],
  );
  const gobierna = entidadGobernante(contexto);
  return (
    <div data-testid="resumen-gobierno-local" className="flex flex-col gap-2">
      <p className="text-xs leading-snug text-white/75">
        Así decide hoy el gobierno de {gobierna ? <strong className="font-semibold text-white">{etiquetaEntidad(gobierna)}</strong> : "esta entidad"} cada tipo de cambio de su Protomolécula.
        Cambiar una cosa de aquí la decide quien manda según esta tabla; una IA nunca aprueba sola.
      </p>
      <ul className="flex flex-col gap-1.5" aria-label="Cómo se decide cada tipo de cambio">
        {filas.map(({ tipo, v }) => {
          const tono = v ? TONO_DECISION[v.decision] : null;
          return (
            <li key={tipo} className={cn("rounded-xl border px-3 py-2 text-xs", tono ? [tono.borde, tono.fondo] : "border-white/10 bg-white/5")}>
              <p className="flex items-center justify-between gap-2">
                <span className="font-medium">{ETIQUETA_CAMBIO[tipo]}</span>
                <span className={cn("font-semibold", tono?.texto)}>{v ? FRASE[v.decision] : "Sin dato"}</span>
              </p>
              {v ? <p className="mt-0.5 text-white/70">{v.motivo}</p> : <p className="mt-0.5 text-white/60">El gobierno de esta entidad no pudo responder.</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** El componente que monta la pestaña. Hoy es el resumen propio; al integrar P2, aquí va `GobiernoProtoResumen`. */
export const ResumenGobierno: React.ComponentType<ResumenGobiernoProps> = ResumenGobiernoLocal;
