"use client";

/**
 * Paso «Actualizaciones» al crear una página, un grupo, una comunidad, un grupo de estudio o un
 * evento (contrato §6): propone la política por defecto de su tipo y deja cambiarla antes de
 * crear. Plegado por defecto: quien no quiere pensar en ello crea igual con lo sensato.
 */

import { RefreshCcw } from "lucide-react";
import { politicaPorDefecto, resumenPolitica, type PoliticaSistema, type TipoEntidad } from "@/lib/actualizaciones/politica";
import type { CapaActualizacion } from "@/lib/actualizaciones/manifiesto";
import { SelectorPolitica } from "./selector-politica";

/** Tipo de sistema de cada clase del diálogo «Crear en la red». */
export const TIPO_DE_CLASE: Record<"page" | "group" | "community" | "study" | "event", Exclude<TipoEntidad, "perfil" | "os">> = {
  page: "pagina",
  group: "grupo",
  community: "comunidad",
  study: "estudio",
  event: "evento",
};

const CAPAS: readonly CapaActualizacion[] = ["datos", "interfaz"];

export interface PasoActualizacionesProps {
  tipo: TipoEntidad;
  /** null = la política por defecto de su tipo. */
  valor: PoliticaSistema | null;
  onCambiar: (p: PoliticaSistema) => void;
}

export function PasoActualizaciones({ tipo, valor, onCambiar }: PasoActualizacionesProps) {
  const politica = valor ?? politicaPorDefecto(tipo);
  return (
    <details className="group rounded-xl border border-border px-3 py-2" data-testid="paso-actualizaciones">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
        <RefreshCcw className="h-4 w-4 text-primary" aria-hidden />
        Actualizaciones
        <span className="ml-auto truncate text-[11px] font-normal text-muted-foreground">{resumenPolitica(politica)}</span>
      </summary>
      <p className="mb-2 mt-1.5 text-[11px] leading-snug text-muted-foreground">
        Cómo llegan a sus miembros las versiones nuevas de su interfaz y sus datos. Se cambia después en su PoliGenesis.
      </p>
      <SelectorPolitica
        compacto
        etiqueta="Actualizaciones de la entidad nueva"
        politica={politica}
        capas={CAPAS}
        onCambiar={(capa, p) => onCambiar({ ...politica, [capa]: p })}
      />
    </details>
  );
}

export default PasoActualizaciones;
