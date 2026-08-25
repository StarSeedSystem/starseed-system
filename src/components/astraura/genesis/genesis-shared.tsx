"use client";

/**
 * Piezas propias de la sección Génesis de Seres.
 * ----------------------------------------------------------------------------
 * El resto del kit visual (CARD, BTN*, SectionTitle, Empty, Badge, Stat,
 * Field, Bar, BusyIcon, fmt*, useS158Load, useBusy, runS158…) se importa
 * directamente de `../s158/shared` en cada fichero de Génesis — es el MISMO
 * idioma "Crystal Liquid Glass" y el MISMO tipo de respuesta de red
 * (`GenesisResponse<T>` es literalmente `Astraura158Response<T>`, ver
 * `genesis-client.ts`), así que no hace falta duplicarlo. Aquí solo vive lo
 * que es propio de Génesis y no cabe en ningún otro sitio.
 */
import { cn } from "@/lib/utils";
import { astraura158Endpoint, type Astraura158Target } from "@/lib/astraura/astraura-158-client";
import type { Ser } from "@/lib/astraura/genesis-types";
import { Badge, PILL, PILL_ON, PILL_OFF } from "../s158/shared";
import { estadoSerLabel, estadoSerTone } from "./genesis-logic";

/** Las cuatro vistas internas de la sección. */
export type GenesisView = "lista" | "ficha" | "ritual" | "propuestas";

export const GENESIS_VIEW_LABEL: Record<GenesisView, string> = {
  lista: "Seres",
  ficha: "Ficha",
  ritual: "Nuevo ser",
  propuestas: "Propuestas",
};

/**
 * Selector compacto local · nube. Mismo mecanismo que el panel 1.58
 * (`astraura158Endpoint`), reescrito aquí porque Génesis es su propia
 * sección y puede acabar viviendo en su propia ventana, sin depender del
 * panel 1.58 para elegir destino.
 */
export function GenesisTargetSwitcher({ target, onChange }: { target: Astraura158Target; onChange: (t: Astraura158Target) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Origen del backend de Génesis">
      {(["local", "nube"] as const).map((t) => (
        <button
          key={t}
          type="button"
          className={cn(PILL, "px-2 py-0.5 text-[10px]", target === t ? PILL_ON : PILL_OFF)}
          aria-pressed={target === t}
          onClick={() => onChange(t)}
          title={astraura158Endpoint(t)}
        >
          {t === "local" ? "Esta neurona" : "Nube"}
        </button>
      ))}
    </div>
  );
}

/** Pastilla de estado del ser, con el vocabulario propio de Génesis (no el genérico de s158). */
export function EstadoSerBadge({ estado }: { estado: Ser["estado"] }) {
  return <Badge tone={estadoSerTone(estado)}>{estadoSerLabel(estado)}</Badge>;
}
