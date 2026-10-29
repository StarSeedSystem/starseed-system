"use client";

/**
 * Ajustes de medios (CB1013R, contrato §8).
 * Por cada capacidad: selector con 'auto' + servidores del cerebro + neuronas.
 * Almacenamiento: destinos del cerebro con explicación honesta.
 */

import { useState, useEffect, useMemo } from "react";
import { Server, HardDrive } from "lucide-react";
import type { Brain, BrainServer } from "@/lib/brains/brains";
import { CAPACIDADES, APLICACION, type AjustesObjetivo, type Capacidad } from "@/lib/cerebros/ajustes";
import { getMemoryDestinations, type MemoryDestinationsConfig } from "@/lib/brains/memory-destinations";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
import { destinosDe, type Dato, type DestinoAlmacen } from "@/lib/malla/cristal/destinos-almacen";
import { MarcaAplicacion } from "@/components/cerebro/ajustes-seguridad";
import { cn } from "@/lib/utils";

export interface AjustesMediosProps {
  valor: Pick<AjustesObjetivo, "medios">;
  onCambio: (parcial: Partial<AjustesObjetivo>) => void;
  cerebro: Brain;
  nivel: "cerebro" | "memoria" | "carpeta";
}

const OPCIONES_CAPACIDAD: Capacidad[] = ["texto", "imagen", "voz", "video", "embeddings", "agentes"];

function servidoresComoOpciones(servers: BrainServer[]): { id: string; label: string }[] {
  return servers.map((s) => ({ id: s.id, label: s.name || s.kind || "Servidor" }));
}

function neuronasComoOpciones(neurons: Neuron[]): { id: string; label: string }[] {
  return neurons.map((n) => ({ id: n.id, label: n.name || n.id }));
}

function destinosAAlmacen(config: MemoryDestinationsConfig): DestinoAlmacen[] {
  const out: DestinoAlmacen[] = [];
  out.push({ id: "local", tipo: "aparato", motor: "local", publico: false, cerebroId: undefined });
  out.push({ id: "starseed", tipo: "servidor", motor: "starseed", publico: true, cerebroId: undefined });
  for (const e of config.external) {
    out.push({ id: e.id, tipo: "servidor", motor: "external", publico: false, cerebroId: undefined });
  }
  if (config.p2p.enabled) {
    out.push({ id: "p2p", tipo: "servidor", motor: "syncthing", publico: false, cerebroId: undefined });
  }
  return out;
}

export function AjustesMedios({ valor, onCambio, cerebro, nivel }: AjustesMediosProps) {
  const [neuronas, setNeuronas] = useState<Neuron[]>([]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const ns = await listNeurons();
      if (vivo) setNeuronas(ns);
    })();
    return () => { vivo = false; };
  }, []);

  const destinos = useMemo(() => {
    const d = getMemoryDestinations(cerebro);
    return [
      { id: "local", texto: "Este aparato", activo: d.local.enabled },
      { id: "starseed", texto: "StarSeed", activo: d.starseed.enabled },
      ...d.external.map((e) => ({ id: e.id, texto: e.label || "Externo", activo: true })),
      { id: "p2p", texto: d.p2p.label ? `Syncthing · ${d.p2p.label}` : "Syncthing (P2P)", activo: d.p2p.enabled },
    ];
  }, [cerebro]);

  const servidores = useMemo(() => servidoresComoOpciones(cerebro.servers || []), [cerebro.servers]);
  const neuronasOpc = useMemo(() => neuronasComoOpciones(neuronas), [neuronas]);

  function cambiarCapacidad(cap: Capacidad, valorSel: string) {
    onCambio({ medios: { ...valor.medios, capacidades: { ...valor.medios.capacidades, [cap]: valorSel } } });
  }

  function alternarDestino(id: string) {
    const actuales = valor.medios.almacenamiento ?? [];
    const nuevos = actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id];
    onCambio({ medios: { ...valor.medios, almacenamiento: nuevos } });
  }

  // Explicación honesta por destino con destinosDe() si encaja.
  const explicaciones = useMemo(() => {
    const config = getMemoryDestinations(cerebro);
    const disponibles = destinosAAlmacen(config);
    const dato: Dato = { clase: "privado" };
    const elegidos = valor.medios.almacenamiento ?? [];
    try {
      const res = destinosDe(dato, {
        politicaContexto: elegidos.length > 0 ? elegidos : ["local", "starseed"],
        disponibles,
        elegidosPorDato: elegidos,
        motoresReales: ["local", "starseed", "external", "syncthing"],
      });
      return res.guardar.map((g) => `· ${g.id}: destino permitido (${g.tipo}, ${g.motor})`).join("\n");
    } catch {
      return "Sin medida en este aparato";
    }
  }, [cerebro, valor.medios.almacenamiento]);

  return (
    <section className="space-y-6 text-white" aria-label="Medios">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-white/60" />
          <h3 className="text-sm font-semibold">Capacidades</h3>
          <MarcaAplicacion estado={APLICACION["medios.capacidades"]} />
        </div>
        <p className="text-xs text-white/60">Selecciona dónde opera cada capacidad: 'auto', un servidor de este cerebro o una neurona.</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {OPCIONES_CAPACIDAD.map((cap) => {
            const valorActual = valor.medios.capacidades?.[cap] ?? "auto";
            const todasOpciones = [
              { value: "auto", label: "Auto" },
              ...servidores.map((s) => ({ value: `servidor:${s.id}`, label: `Servidor: ${s.label}` })),
              ...neuronasOpc.map((n) => ({ value: `neurona:${n.id}`, label: `Neurona: ${n.label}` })),
            ];
            return (
              <label key={cap} className="flex flex-col gap-1 text-xs">
                <span className="font-medium capitalize">{CAPACIDADES[cap]}</span>
                <select
                  className="h-9 cursor-pointer rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white"
                  value={valorActual}
                  onChange={(e) => cambiarCapacidad(cap, e.target.value)}
                >
                  {todasOpciones.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-white/60" />
          <h3 className="text-sm font-semibold">Almacenamiento</h3>
          <MarcaAplicacion estado={APLICACION["medios.almacenamiento"]} />
        </div>
        <p className="text-xs text-white/60">En el nivel cerebro, los destinos de memoria se aplican de verdad con <code className="text-[10px] text-amber-200">setMemoryDestinations</code>.</p>

        <div className="flex flex-wrap gap-2">
          {destinos.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => alternarDestino(d.id)}
              className={cn(
                "h-auto whitespace-normal rounded-md border px-3 py-1.5 text-xs transition-colors cursor-pointer",
                (valor.medios.almacenamiento ?? []).includes(d.id)
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-black/20 text-white/70 hover:bg-white/5",
                !d.activo && "opacity-40",
              )}
              disabled={!d.activo}
              title={!d.activo ? "Apagado en los destinos del cerebro" : `Destino: ${d.texto}`}
            >
              {d.texto}{!d.activo && " · apagado"}
            </button>
          ))}
        </div>

        {valor.medios.almacenamiento && valor.medios.almacenamiento.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-white/70">
            <p className="font-semibold text-white/90">Dónde va cada dato:</p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-amber-100/80">{explicaciones}</pre>
          </div>
        )}
      </div>
    </section>
  );
}
