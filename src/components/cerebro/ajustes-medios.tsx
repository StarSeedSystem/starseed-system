"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CAPACIDADES, type Capacidad, APLICACION, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { getMemoryDestinations, setMemoryDestinations } from "@/lib/brains/memory-destinations";
import { listNeurons } from "@/lib/neurons/neurons";
import type { Brain } from "@/lib/brains/brains";
import { MarcaAplicacion } from "@/components/cerebro/ajustes-seguridad";

export interface AjustesMediosProps {
  valor: Pick<AjustesObjetivo, "medios">;
  onCambio: (parcial: Partial<AjustesObjetivo>) => void;
  cerebro: Brain;
  nivel: "cerebro" | "memoria" | "carpeta";
}

export function AjustesMedios({ valor, onCambio, cerebro, nivel }: AjustesMediosProps) {
  const [neuronas, setNeuronas] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    listNeurons().then((list) => setNeuronas(list.map((n) => ({ id: n.id, name: n.name }))));
  }, []);

  const opcionesCapacidad = useMemo(() => {
    const opts: { id: string; label: string }[] = [{ id: "auto", label: "Auto" }];
    for (const s of cerebro.servers) opts.push({ id: s.id, label: s.name || s.id });
    for (const n of neuronas) opts.push({ id: `neurona:${n.id}`, label: `Neurona · ${n.name}` });
    return opts;
  }, [cerebro.servers, neuronas]);

  const cambiarCapacidad = (cap: Capacidad, id: string) => {
    const capacidades = { ...(valor.medios?.capacidades ?? {}) };
    if (id === "auto" || id === "") delete capacidades[cap];
    else capacidades[cap] = id;
    onCambio({ medios: { ...(valor.medios ?? { almacenamiento: [] }), capacidades } });
  };

  const destinos = useMemo(() => getMemoryDestinations(cerebro), [cerebro]);
  const almacenarIds = valor.medios?.almacenamiento ?? [];

  const alternarAlmacen = (id: string) => {
    const cur = new Set(almacenarIds);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    onCambio({ medios: { ...(valor.medios ?? { capacidades: {} }), almacenamiento: Array.from(cur) } });
  };

  return (
    <section className="space-y-5 text-white" aria-label="Medios">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Capacidades</h3>
          <MarcaAplicacion estado={APLICACION["medios.capacidades"] as "se-aplica" | "solo-se-guarda"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(CAPACIDADES) as Capacidad[]).map((cap) => {
            const valorActual = valor.medios?.capacidades?.[cap] ?? "auto";
            return (
              <div key={cap} className="space-y-1">
                <label className="text-xs text-white/70">{CAPACIDADES[cap]}</label>
                <select
                  className="h-9 w-full rounded-md border border-white/15 bg-black/40 px-2 text-sm"
                  value={valorActual}
                  onChange={(e) => cambiarCapacidad(cap, e.target.value)}
                >
                  {opcionesCapacidad.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Almacenamiento</h3>
          <MarcaAplicacion estado={APLICACION["medios.almacenamiento"] as "se-aplica" | "solo-se-guarda"} />
        </div>
        <p className="text-xs text-white/60">Destinos de memoria configurados para este cerebro.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={almacenarIds.includes("local") ? "default" : "outline"} className="h-auto whitespace-normal py-1.5" onClick={() => alternarAlmacen("local")}>Local</Button>
          <Button type="button" size="sm" variant={almacenarIds.includes("starseed") ? "default" : "outline"} className="h-auto whitespace-normal py-1.5" onClick={() => alternarAlmacen("starseed")}>StarSeed</Button>
          {destinos.external.map((e) => (
            <Button key={e.id} type="button" size="sm" variant={almacenarIds.includes(e.id) ? "default" : "outline"} className="h-auto whitespace-normal py-1.5" onClick={() => alternarAlmacen(e.id)}>{e.label}</Button>
          ))}
          {destinos.p2p.enabled && (
            <Button type="button" size="sm" variant={almacenarIds.includes("p2p") ? "default" : "outline"} className="h-auto whitespace-normal py-1.5" onClick={() => alternarAlmacen("p2p")}>Syncthing</Button>
          )}
        </div>
        <p className="text-xs text-white/60">Cada destino indica adónde se guarda la memoria según la política del cerebro.</p>
      </div>
    </section>
  );
}
