import { useMemo, useState } from "react";
import type { Destino3D, Hierro } from "../adn/optimizacion";
import { planOptimizacion } from "../adn/optimizacion";
import { planificar } from "../adn/canalizacion";
import { capacidadesDe } from "../adn/optimizacion";

export type Partida = "imagen" | "texto";

export interface Generar3DOptions {
  destino: Destino3D;
  partida: Partida;
  esqueleto?: string;
  region?: string | null;
  comercial?: boolean;
  permitirDePago?: boolean;
  cerrada?: boolean;
}

export function useGenerar3D(opts: Generar3DOptions, hierro?: Hierro | null) {
  const [permisoEspacio, setPermisoEspacio] = useState(false);
  const [contienePersonas, setContienePersonas] = useState(false);

  const plan = useMemo(() => {
    if (!hierro) return null;
    const prioridad = planOptimizacion(opts.destino, hierro.vramGB).prioridad;
    const caps = capacidadesDe(hierro);
    return planificar({
      partida: opts.partida,
      esqueleto: (opts.esqueleto as any) ?? "ninguno",
      capacidades: caps,
      region: opts.region ?? null,
      comercial: opts.comercial ?? false,
      permitirDePago: opts.permitirDePago ?? false,
      prioridad,
      cerrada: opts.cerrada ?? false,
    });
  }, [opts, hierro]);

  return { plan, permisoEspacio, setPermisoEspacio, contienePersonas, setContienePersonas };
}
