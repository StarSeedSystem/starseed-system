"use client";
// Medios de un cerebro, memoria o carpeta (CB1013S, contrato §8). Controlado por
// props; aplica los destinos reales con `setMemoryDestinations` y explica cada
// destino con `destinosDe`. Marca de `APLICACION`: se aplica ya o solo se guarda.

import { useEffect, useState } from "react";
import { Cpu, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
import type { Brain, BrainServer } from "@/lib/brains/brains";
import { getMemoryDestinations, setMemoryDestinations, type MemoryDestinationsConfig } from "@/lib/brains/memory-destinations";
import { destinosDe, type Dato, type DestinoAlmacen } from "@/lib/malla/cristal/destinos-almacen";
import { APLICACION, CAPACIDADES, type AjustesObjetivo, type Capacidad } from "@/lib/cerebros/ajustes";
import { MarcaAplicacion } from "@/components/cerebro/ajustes-seguridad";

export type NivelMedios = "cerebro" | "memoria" | "carpeta";

export interface AjustesMediosProps {
  valor: Pick<AjustesObjetivo, "medios">; onCambio: (parcial: Partial<AjustesObjetivo>) => void;
  cerebro: Brain; privacidad: AjustesObjetivo["privacidad"]; nivel: NivelMedios;
}
const SELECT = "h-9 w-full cursor-pointer rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white sm:w-56";
const AUTO = "auto";
const nombreServidor = (s: BrainServer, i: number) => s.name?.trim() || `Servidor ${i + 1}`;
const claseDe = (p: AjustesObjetivo["privacidad"]): Dato["clase"] => (p === "publico" ? "publico" : p === "privado" ? "privado" : "interno");
const tipoDe = (id: string): DestinoAlmacen["tipo"] => (id === "local" || id === "p2p" ? "aparato" : id === "starseed" ? "cerebro" : "servidor");
export function AjustesMedios({ valor, onCambio, cerebro, privacidad, nivel }: AjustesMediosProps) {
  const [neuronas, setNeuronas] = useState<Neuron[]>([]);
  const [destinos, setDestinos] = useState<MemoryDestinationsConfig>(() => getMemoryDestinations(cerebro));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void listNeurons().then((lista) => { if (vivo) setNeuronas(lista); });
    return () => { vivo = false; };
  }, []);
  useEffect(() => { setDestinos(getMemoryDestinations(cerebro)); }, [cerebro]);
  const opciones = [
    { id: AUTO, texto: "Automático" },
    ...cerebro.servers.map((s, i) => ({ id: `servidor:${s.id}`, texto: `Servidor · ${nombreServidor(s, i)}` })),
    ...neuronas.map((n) => ({ id: `neurona:${n.id}`, texto: `Neurona · ${n.name}${n.online ? "" : " (sin conexión)"}` })),
  ];
  const filas = [
    { id: "local", texto: "Este aparato", activo: true, fijo: true, detalle: "Copia local del cerebro; siempre activa." },
    { id: "starseed", texto: "StarSeed", activo: destinos.starseed.enabled, fijo: false, detalle: "El almacén StarSeed de tu cuenta." },
    ...destinos.external.map((e) => ({ id: e.id, texto: e.label, activo: true, fijo: true, detalle: `Destino externo · ${e.url}` })),
    { id: "p2p", texto: destinos.p2p.label ? `Syncthing · ${destinos.p2p.label}` : "Syncthing (P2P)", activo: destinos.p2p.enabled, fijo: false, detalle: "Espejo por Syncthing entre tus aparatos." },
  ];
  const seleccion = valor.medios.almacenamiento.length > 0 ? valor.medios.almacenamiento : filas.filter((f) => f.activo).map((f) => f.id);
  const { guardar, descartados } = destinosDe({ clase: claseDe(privacidad) }, {
    politicaContexto: filas.map((f) => f.id),
    disponibles: filas.map((f) => ({ id: f.id, tipo: tipoDe(f.id), motor: f.id === "local" ? "local" : f.id, publico: false })),
    elegidosPorDato: seleccion,
    motoresReales: ["starseed", "external", "p2p"],
  });
  const motivo = new Map(descartados.map((d) => [d.id, d.motivo]));
  const cambiarCapacidad = (capacidad: Capacidad, id: string) => onCambio({ medios: { ...valor.medios, capacidades: { ...valor.medios.capacidades, [capacidad]: id } } });

  const alternar = async (id: string) => {
    const nueva = seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id];
    onCambio({ medios: { ...valor.medios, almacenamiento: nueva } });
    if (nivel !== "cerebro") return;
    const siguiente: MemoryDestinationsConfig = {
      ...destinos,
      starseed: { enabled: nueva.includes("starseed") },
      p2p: { ...destinos.p2p, enabled: nueva.includes("p2p") },
    };
    setDestinos(siguiente);
    const guardado = await setMemoryDestinations(
      { ...cerebro, config: { ...cerebro.config, memoryDestinations: siguiente } },
      { starseed: siguiente.starseed, p2p: siguiente.p2p },
    );
    if (!guardado) setError("No se pudieron guardar los destinos de memoria; se guardarán al pulsar Guardar.");
  };
  const marcaAlmacen = nivel === "cerebro" ? APLICACION["medios.almacenamiento"] : "solo-se-guarda";
  return (
    <section className="space-y-5 text-white" aria-label="Medios">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><Cpu className="h-4 w-4 text-white/60" aria-hidden /><h3 className="text-sm font-semibold">Capacidades</h3><MarcaAplicacion estado={APLICACION["medios.capacidades"]} /></div>
        <p className="text-xs leading-relaxed text-white/60">Qué servidor o neurona hace cada trabajo. «Automático» deja que lo elija el cerebro.</p>
        <div className="space-y-2">
          {(Object.entries(CAPACIDADES) as [Capacidad, string][]).map(([id, texto]) => {
            const actual = valor.medios.capacidades[id] || AUTO;
            const extra = actual !== AUTO && !opciones.some((o) => o.id === actual) ? [{ id: actual, texto: `Elegido antes · ${actual}` }] : [];
            return (
              <label key={id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-[7rem] flex-1">{texto}</span>
                <select aria-label={`Medio para ${texto}`} className={SELECT} value={actual} onChange={(e) => cambiarCapacidad(id, e.target.value)}>
                  {[...opciones, ...extra].map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><HardDrive className="h-4 w-4 text-white/60" aria-hidden /><h3 className="text-sm font-semibold">Almacenamiento</h3><MarcaAplicacion estado={marcaAlmacen} /></div>
        <p className="text-xs leading-relaxed text-white/60">Adónde va cada dato del cerebro. Este aparato siempre está; lo demás lo eliges tú.</p>
        <ul className="space-y-1.5">
          {filas.map((f) => {
            const elegido = seleccion.includes(f.id);
            const enGuardar = guardar.some((g) => g.id === f.id);
            const estado = f.id === "local" ? "Siempre activa." : !elegido ? "No elegido ahora." : motivo.get(f.id) ?? (enGuardar ? "Se guarda aquí." : "Se guardará al guardar.");
            return (
              <li key={f.id} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {f.fijo ? <span className="text-sm font-medium">{f.texto}</span> : (
                    <Button type="button" size="sm" variant={elegido ? "default" : "outline"} className="h-auto whitespace-normal py-1.5" aria-pressed={elegido} onClick={() => void alternar(f.id)}>{f.texto}</Button>
                  )}
                  <span className="text-xs text-white/60">{f.activo ? "activo" : "apagado"}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-white/60">{f.detalle} · {estado}</p>
              </li>
            );
          })}
        </ul>
        {error && <p className="text-xs text-amber-200">{error}</p>}
      </div>
    </section>
  );
}
