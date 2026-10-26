"use client";
/**
 * Ventana de la Protomolécula · RANURA del resumen de gobierno. Monta el `GobiernoProtoResumen` de la ola (P2,
 * `src/components/protomolecula/gobierno/`: reglas, quién decide, permisos directos y registro de usos), cargado a
 * demanda para no engordar la ventana. Mientras llega (o si no carga), se ve el resumen propio y HONESTO: cómo decide
 * hoy el gobierno de la entidad cada tipo de cambio (el mismo `decidirCambio` que usa la petición al confirmar).
 */
import { useEffect, useMemo, useState } from "react";
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

type ModuloGobierno = typeof import("@/components/protomolecula/gobierno");

/** El componente que monta la pestaña: el resumen completo de P2 en cuanto carga; antes (o si falla), el local. */
export function ResumenGobierno({ contexto }: ResumenGobiernoProps) {
  const [modulo, setModulo] = useState<ModuloGobierno | null>(null);
  useEffect(() => {
    let vivo = true;
    import("@/components/protomolecula/gobierno")
      .then((m) => { if (vivo) setModulo(m); })
      .catch(() => { /* se queda el resumen local, que ya dice la verdad */ });
    return () => { vivo = false; };
  }, []);
  if (!modulo) return <ResumenGobiernoLocal contexto={contexto} />;
  const Completo = modulo.GobiernoProtoResumen;
  return <Completo contexto={contexto} />;
}
