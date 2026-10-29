"use client";

/**
 * «Ajustes del cerebro» de cada cerebro (CB1013S, contrato §8): selector
 * «Aplicar a» (cerebro completo, una memoria de brain_memory_files o una carpeta
 * de starseed.brain.<id>.memoryRoots), y las pestañas Medios, Seguridad y
 * privacidad, y Vinculación y sincronización. Guardar escribe
 * `saveBrain({ ...cerebro, config: conAjustes(...) })` y, en el nivel cerebro,
 * aplica el almacenamiento con `setMemoryDestinations` (se aplica de verdad).
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveBrain, type Brain } from "@/lib/brains/brains";
import { getMemoryDestinations, setMemoryDestinations } from "@/lib/brains/memory-destinations";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import { listNeurons } from "@/lib/neurons/neurons";
import { conAjustes, ajustesEfectivos, leerAjustes, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { AjustesMedios } from "@/components/cerebro/ajustes-medios";
import { AjustesSeguridad, type NivelAjustes } from "@/components/cerebro/ajustes-seguridad";
import { AjustesSync } from "@/components/cerebro/ajustes-sync";

export interface AjustesCerebroDialogProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    cerebro: Brain;
    cerebros: Brain[];
    onHecho?: () => void;
}

type Objetivo = { nivel: NivelAjustes; id?: string };
type Pestaña = "medios" | "seguridad" | "vinculacion";

const PESTAÑAS: { id: Pestaña; texto: string }[] = [
  { id: "medios", texto: "Medios" },
  { id: "seguridad", texto: "Seguridad y privacidad" },
  { id: "vinculacion", texto: "Vinculación y sincronización" },
];
const SELECTOR = "h-9 max-w-[16rem] rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white";

function claveDe(o: Objetivo): string {
  return o.nivel === "cerebro" ? "cerebro" : `${o.nivel}:${o.id ?? ""}`;
}

function objetivoAPuro(o: Objetivo): Parameters<typeof conAjustes>[1] {
  return o.nivel === "cerebro" ? { tipo: "cerebro" } : { tipo: o.nivel, id: o.id ?? "" };
}

/** Nombres de las memorias (brain_memory_files) y de las carpetas vinculadas de este cerebro. */
async function cargarObjetivos(cerebro: Brain): Promise<{ memorias: string[]; carpetas: { id: string; nombre: string }[]; neuronas: { id: string; nombre: string }[] }> {
  const [archivos, neuronas] = await Promise.all([
    listMemoryFiles(cerebro.id).catch(() => []),
    listNeurons().catch(() => []),
  ]);
  return {
    memorias: Array.from(new Set(archivos.map((a) => a.name))),
    carpetas: leerCarpetas(cerebro.id),
    neuronas: neuronas.map((n) => ({ id: n.id, nombre: n.name })),
  };
}

/** Ids de `starseed.brain.<id>.memoryRoots` con el nombre de la raíz si se conoce. */
function leerCarpetas(brainId: string): { id: string; nombre: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const ids = JSON.parse(window.localStorage.getItem(`starseed.brain.${brainId}.memoryRoots`) ?? "[]") as unknown;
    if (!Array.isArray(ids)) return [];
    const raices = JSON.parse(window.localStorage.getItem("starseed.memory.roots.v1") ?? "[]") as unknown;
    const nombres = new Map<string, string>();
    if (Array.isArray(raices)) {
      for (const raiz of raices) {
        if (!raiz || typeof raiz !== "object" || !("id" in raiz)) continue;
        const fila = raiz as { id: unknown; name?: unknown };
        nombres.set(String(fila.id), typeof fila.name === "string" && fila.name ? fila.name : String(fila.id));
      }
    }
    return ids.filter((id): id is string => typeof id === "string").map((id) => ({ id, nombre: nombres.get(id) ?? id }));
  } catch {
    return [];
  }
}

export default function AjustesCerebroDialog({ open, onOpenChange, cerebro, onHecho }: AjustesCerebroDialogProps) {
  const [pestaña, setPestaña] = useState<Pestaña>("medios");
  const [objetivo, setObjetivo] = useState<Objetivo>({ nivel: "cerebro" });
  const [memorias, setMemorias] = useState<string[]>([]);
  const [carpetas, setCarpetas] = useState<{ id: string; nombre: string }[]>([]);
  const [neuronas, setNeuronas] = useState<{ id: string; nombre: string }[]>([]);
  const [porObjetivo, setPorObjetivo] = useState<Record<string, Partial<AjustesObjetivo>>>({});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPestaña("medios");
    setObjetivo({ nivel: "cerebro" });
    setPorObjetivo({});
    setError(null);
    setMensaje(null);
    let vivo = true;
    cargarObjetivos(cerebro).then((o) => {
      if (!vivo) return;
      setMemorias(o.memorias);
      setCarpetas(o.carpetas);
      setNeuronas(o.neuronas);
    }).catch(() => { /* sin objetivos extra: queda el cerebro completo */ });
    return () => { vivo = false; };
  }, [open, cerebro]);

  const clave = claveDe(objetivo);
  const cambios = porObjetivo[clave] ?? {};
  const valor = useMemo<AjustesObjetivo>(() => ({ ...ajustesEfectivos(leerAjustes(cerebro), objetivoAPuro(objetivo)), ...cambios }), [cerebro, objetivo, cambios]);

  function registrar(parcial: Partial<AjustesObjetivo>): void {
    setError(null);
    setMensaje(null);
    setPorObjetivo((m) => ({ ...m, [clave]: { ...(m[clave] ?? {}), ...parcial } }));
  }

  async function guardar(): Promise<void> {
    if (Object.keys(cambios).length === 0) { setMensaje("Sin cambios por guardar."); return; }
    setOcupado(true); setError(null);
    try {
      const config = conAjustes(cerebro.config, objetivoAPuro(objetivo), cambios);
      const guardado = await saveBrain({ ...cerebro, config });
      if (!guardado) throw new Error("No se pudo guardar el cerebro.");
      if (objetivo.nivel === "cerebro") {
        await aplicarDestinosReales(guardado, cambios.medios?.almacenamiento ?? []);
      }
      setPorObjetivo({});
      setMensaje("Ajustes guardados.");
      onHecho?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const valorSelector = objetivo.nivel === "cerebro" ? "cerebro" : `${objetivo.nivel}:${objetivo.id ?? ""}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajustes del cerebro · «{cerebro.name}»</DialogTitle>
          <DialogDescription>Medios, seguridad y sincronización del cerebro entero, de una memoria o de una carpeta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-white">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="ajustes-objetivo" className="text-xs text-white/60">Aplicar a</label>
            <select id="ajustes-objetivo" className={SELECTOR} value={valorSelector}
              onChange={(e) => { const v = e.target.value; setMensaje(null); setError(null); if (v === "cerebro") setObjetivo({ nivel: "cerebro" }); else { const [nivel, ...resto] = v.split(":"); setObjetivo({ nivel: nivel as NivelAjustes, id: resto.join(":") }); } }}>
              <option value="cerebro">Cerebro completo</option>
              {memorias.length > 0 && (
                <optgroup label="Memorias">
                  {memorias.map((m) => (<option key={m} value={`memoria:${m}`}>{m}</option>))}
                </optgroup>
              )}
              {carpetas.length > 0 && (
                <optgroup label="Carpetas">
                  {carpetas.map((c) => (<option key={c.id} value={`carpeta:${c.id}`}>{c.nombre}</option>))}
                </optgroup>
              )}
            </select>
            {memorias.length === 0 && carpetas.length === 0 && <span className="text-xs text-white/50">Sin memorias ni carpetas ligadas por ahora.</span>}
          </div>
          <div role="tablist" aria-label="Pestañas de los ajustes" className="flex flex-wrap gap-2">
            {PESTAÑAS.map((p) => (
              <Button key={p.id} type="button" size="sm" role="tab" aria-selected={pestaña === p.id} variant={pestaña === p.id ? "default" : "outline"} className="h-auto cursor-pointer whitespace-normal py-1.5" onClick={() => setPestaña(p.id)}>{p.texto}</Button>
            ))}
          </div>
          {pestaña === "medios" && <AjustesMedios valor={valor} onCambio={registrar} cerebro={cerebro} neuronas={neuronas} nivel={objetivo.nivel} />}
          {pestaña === "seguridad" && <AjustesSeguridad valor={valor} onCambio={registrar} nivel={objetivo.nivel} />}
          {pestaña === "vinculacion" && <AjustesSync valor={valor} onCambio={registrar} cerebro={cerebro} />}
          {error && <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-amber-200">{error}</p>}
          {mensaje && <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-emerald-200">{mensaje}</p>}
          <div className="flex flex-wrap gap-2">
            <Button className="h-auto cursor-pointer whitespace-normal" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar"}</Button>
            <Button variant="ghost" className="h-auto cursor-pointer whitespace-normal" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * En el nivel cerebro, la elección concreta de almacenamiento se aplica de verdad
 * sobre `config.memoryDestinations`: enciende o apaga StarSeed y Syncthing (el
 * espejo local nunca se apaga y los externos no tienen interruptor). Con «auto»
 * o sin elección, no toca nada.
 */
async function aplicarDestinosReales(brain: Brain, elegidos: string[]): Promise<Brain | null> {
  if (elegidos.length === 0 || elegidos.includes("auto")) return brain;
  return setMemoryDestinations(brain, {
    starseed: { enabled: elegidos.includes("starseed") },
    p2p: { enabled: elegidos.includes("p2p") },
  });
}
