"use client";

/*
 * ServidorNeurona — la neurona vinculada de un servidor del registro (VIN1107T1, 2026-11-07).
 * Lógica: src/lib/malla/registro-servidor-neurona.ts (asociación en una clave propia de este aparato;
 * el registro de servidores no cambia). Si la neurona está vinculada se ve su nombre; si no se sabe,
 * se puede asociar a mano eligiendo una de las vinculadas.
 */

import { useEffect, useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { useVinculosNeuronas, vinculosDeNeuronas } from "@/lib/malla/sincronizacion-neuronas-motor";
import {
  asociarServidor,
  guardarAsociaciones,
  leerAsociaciones,
  textoUnion,
  unirServidoresConVinculos,
  type MapaServidorNeurona,
} from "@/lib/malla/registro-servidor-neurona";

export function ServidorNeurona({ servidor }: { servidor: { id: string; name: string } }) {
  const [mapa, setMapa] = useState<MapaServidorNeurona>({});
  useEffect(() => {
    setMapa(leerAsociaciones());
    try {
      vinculosDeNeuronas(); // el hook solo lee lo que el motor ya cargó
    } catch {
      /* sin motor: no hay vínculos que ofrecer */
    }
  }, []);
  const vinculos = useVinculosNeuronas();
  const fila = useMemo(() => unirServidoresConVinculos([servidor], vinculos, mapa)[0], [servidor, vinculos, mapa]);

  const elegir = (neurona: string) => {
    const nuevo = asociarServidor(mapa, servidor.id, neurona || null);
    setMapa(nuevo);
    guardarAsociaciones(nuevo);
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-white/50" data-testid="servidor-neurona" data-estado={fila.estado}>
      <Link2 className="h-3 w-3 shrink-0" aria-hidden />
      <span>{textoUnion(fila)}</span>
      <label className="sr-only" htmlFor={`sn-${servidor.id}`}>
        Neurona vinculada de {servidor.name}
      </label>
      <select
        id={`sn-${servidor.id}`}
        value={fila.neurona ?? ""}
        onChange={(e) => elegir(e.target.value)}
        className="min-h-7 max-w-[11rem] cursor-pointer rounded-md border border-white/12 bg-black/30 px-1.5 text-[10px] text-white/75"
      >
        <option value="">Sin asociar</option>
        {fila.neurona && !fila.vinculo && <option value={fila.neurona}>Asociada (sin vincular)</option>}
        {vinculos.map((v) => (
          <option key={v.neurona} value={v.neurona}>
            {v.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
