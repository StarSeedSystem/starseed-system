"use client";
/** Pestaña «Medios» de los ajustes (CB1013S, §8): qué servidor/neurona hace cada capacidad y
 *  dónde se guarda cada dato (destinos de `getMemoryDestinations` con `destinosDe()`). */
import { useEffect, useMemo, useState } from "react";
import { HardDrive, Server } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { APLICACION, CAPACIDADES, type AjustesObjetivo, type Capacidad } from "@/lib/cerebros/ajustes";
import { listNeurons } from "@/lib/neurons/neurons";
import type { Brain } from "@/lib/brains/brains";
import { getMemoryDestinations, type ExternalMemoryDestination } from "@/lib/brains/memory-destinations";
import { destinosDe, type DestinoAlmacen } from "@/lib/malla/cristal/destinos-almacen";
import { MarcaAplicacion } from "@/components/cerebro/ajustes-seguridad";

const SELECTOR = "h-9 min-w-40 rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white cursor-pointer";

export interface AjustesMediosProps {
  cerebro: Brain;
  valor: Pick<AjustesObjetivo, "medios">;
  onCambio: (parcial: Partial<AjustesObjetivo>) => void;
  nivel: "cerebro" | "memoria" | "carpeta";
}
/** Motores REALES de guardado, uno por destino (medidos en memory-destinations.ts). */
const MOTORES = ["memory-offline", "entity-state", "fetch-post", "syncthing-scan"] as const;
function idsActuales(starseed: string, external: ExternalMemoryDestination[], p2p: string): string[] {
  return ["local", starseed, ...external.map((e) => `ext:${e.id}`), p2p].filter(Boolean).sort();
}
/** ¿Cambió el almacenamiento respecto a lo guardado? (para aplicar de verdad en Guardar). */
export function cambioAlmacenamiento(ids: string[], cerebro: Brain): boolean {
  const d = getMemoryDestinations(cerebro);
  const iniciales = idsActuales(d.starseed.enabled ? "starseed" : "", d.external, d.p2p.enabled ? "p2p" : "");
  return JSON.stringify(iniciales) !== JSON.stringify([...ids].sort());
}
/** Cambia el elegido de una capacidad: «auto» la borra (vuelve a la herencia). */
export function conCapacidad(medios: AjustesObjetivo["medios"], capacidad: Capacidad, elegido: string): AjustesObjetivo["medios"] {
  const capacidades = { ...medios.capacidades };
  if (elegido === "auto") delete capacidades[capacidad]; else capacidades[capacidad] = elegido;
  return { ...medios, capacidades };
}
const destinoAlmacen = (id: string, tipo: DestinoAlmacen["tipo"], motor: string, cerebroId: string): DestinoAlmacen =>
  ({ id, tipo, motor, publico: false, cerebroId });
const op = (v: string, t: string) => <option key={v} value={v}>{t}</option>;

export function AjustesMedios({ cerebro, valor, onCambio, nivel }: AjustesMediosProps) {
  const [neuronas, setNeuronas] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let vivo = true;
    void listNeurons().then((lista) => {
      if (vivo) setNeuronas(lista.map((n) => ({ id: `neural:${n.id}`, name: n.name || n.id })));
    });
    return () => { vivo = false; };
  }, []);
  const destinos = useMemo(() => getMemoryDestinations(cerebro), [cerebro]);
  const ids = valor.medios.almacenamiento.length ? [...valor.medios.almacenamiento].sort()
    : idsActuales(destinos.starseed.enabled ? "starseed" : "", destinos.external, destinos.p2p.enabled ? "p2p" : "");
  const claseDato: "publico" | "privado" = ["publico", "group", "community", "page"].includes(cerebro.scope) ? "publico" : "privado";
  const disponibles = useMemo<DestinoAlmacen[]>(() => {
    const out = [destinoAlmacen("local", "aparato", "memory-offline", cerebro.id)];
    if (destinos.starseed.enabled || ids.includes("starseed")) out.push(destinoAlmacen("starseed", "servidor", "entity-state", cerebro.id));
    for (const ext of destinos.external) out.push(destinoAlmacen(`ext:${ext.id}`, "servidor", "fetch-post", cerebro.id));
    if (destinos.p2p.enabled || ids.includes("p2p")) out.push(destinoAlmacen("p2p", "servidor", "syncthing-scan", cerebro.id));
    return out;
  }, [cerebro.id, destinos, ids]);
  /** A dónde va cada dato: `destinosDe` juzga los elegidos contra los destinos reales. */
  const ruta = useMemo(() => destinosDe({ clase: claseDato }, { politicaContexto: ids, disponibles, motoresReales: [...MOTORES] }), [claseDato, ids, disponibles]);
  const cambiarIds = (nuevos: string[]) => onCambio({ medios: { ...valor.medios, almacenamiento: nuevos } });
  /** Explicación honesta de adónde va cada dato (guardar → motor real; descartado → motivo). */
  const explicacion = (id: string): string => {
    const bien = ruta.guardar.find((d) => d.id === id);
    if (bien) return `Los datos se guardan aquí mediante ${bien.motor}.`;
    const mal = ruta.descartados.find((d) => d.id === id);
    return mal ? `No recibirá datos: ${mal.motivo}.` : "";
  };
  const capa = (c: Capacidad, etiqueta: string) => (
    <label key={c} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-28 text-white/80">{etiqueta}</span>
      <select aria-label={`Servidor para ${etiqueta}`} className={SELECTOR} value={valor.medios.capacidades[c] ?? "auto"} onChange={(e) => onCambio({ medios: conCapacidad(valor.medios, c, e.target.value) })}>
        {op("auto", "Auto")}
        {cerebro.servers.map((s) => op(s.id, `Servidor · ${s.name || s.id}`))}
        {neuronas.map((n) => op(n.id, `Neurona · ${n.name}`))}
      </select>
    </label>
  );
  const toggle = (id: string, accion: boolean) => cambiarIds(accion ? [...ids, id].sort() : ids.filter((x) => x !== id));
  const titulo = (texto: string, estado: "se-aplica" | "solo-se-guarda", Icono = HardDrive) => (
    <div className="flex flex-wrap items-center gap-2"><Icono className="h-4 w-4 text-white/60" /><h3 className="text-sm font-semibold">{texto}</h3><MarcaAplicacion estado={estado} /></div>
  );
  const nota = (texto: string) => <p className="text-xs text-white/60">{texto}</p>;

  const filaDestino = (id: string, nombre: string, activable: boolean) => (
    <li key={id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <HardDrive className="h-4 w-4 shrink-0 text-white/60" />
        <span className="min-w-0 flex-1 break-words">{nombre}</span>
        {activable ? <Switch checked={ids.includes(id)} onCheckedChange={(v) => toggle(id, v)} aria-label={`Elegir destino ${nombre}`} /> : null}
      </div>
      <p className={cn("mt-1 text-xs", ruta.guardar.some((d) => d.id === id) ? "text-emerald-200/70" : "text-amber-200/70")}>{explicacion(id)}</p>
    </li>
  );
  return (
    <section className="space-y-5 text-white" aria-label="Medios">
      <div className="space-y-2">
        {titulo("Capacidades", APLICACION["medios.capacidades"], Server)}
        {nota(nivel === "cerebro" ? "Qué servidor o neurona hace cada capacidad; «Auto» deja que el sistema elija." : "Se guarda para este objetivo; la ejecución es del cerebro entero.")}
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(CAPACIDADES) as Capacidad[]).map((c) => capa(c, CAPACIDADES[c]))}
        </div>
      </div>
      <div className="space-y-2">
        {titulo("Almacenamiento", APLICACION["medios.almacenamiento"])}
        {nota(nivel === "cerebro" ? "A dónde va cada dato del cerebro. Desactivar un destino deja de enviarle datos; el espejo local nunca se apaga." : "Los destinos de almacenamiento son del cerebro entero: aquí solo se guarda para cuando llegue.")}
        <ul className="space-y-1.5">
          {filaDestino("local", "Mirror local (este aparato)", false)}
          {filaDestino("starseed", "StarSeed (manifiesto, sin contenido)", nivel === "cerebro")}
          {destinos.external.map((ext) => filaDestino(`ext:${ext.id}`, `Destino externo · ${ext.label}`, nivel === "cerebro"))}
          {filaDestino("p2p", "Espejo P2P vía Syncthing", nivel === "cerebro")}
        </ul>
      </div>
    </section>
  );
}
