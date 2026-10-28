"use client";
/** Ajustes del cerebro: medios · seguridad · sync (CB1013S, contrato §8). Selector «Aplicar a»:
 *  cerebro completo, una memoria (brain_memory_files) o una carpeta (starseed.brain.<id>.memoryRoots).
 *  Guardar aplica `conAjustes` y, en el nivel cerebro, los destinos con `setMemoryDestinations`. */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { saveBrain, type Brain } from "@/lib/brains/brains";
import { setMemoryDestinations, getMemoryDestinations } from "@/lib/brains/memory-destinations";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import { conAjustes, ajustesEfectivos, leerAjustes, type AjustesCerebro, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { AjustesMedios, cambioAlmacenamiento } from "@/components/cerebro/ajustes-medios";
import { AjustesSeguridad, type NivelAjustes } from "@/components/cerebro/ajustes-seguridad";
import { AjustesSync } from "@/components/cerebro/ajustes-sync";
export interface AjustesCerebroDialogProps {
  open: boolean; onOpenChange: (abierto: boolean) => void; cerebro: Brain; cerebros: Brain[]; onHecho?: () => void;
}
type Objetivo = { tipo: "cerebro" } | { tipo: "memoria"; id: string; nombre: string } | { tipo: "carpeta"; id: string; nombre: string };
type Pestana = "medios" | "seguridad" | "sync";
const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: "medios", texto: "Medios" }, { id: "seguridad", texto: "Seguridad y privacidad" }, { id: "sync", texto: "Vinculación y sincronización" },
];
/** Carpetas de memoria declaradas para ESTE cerebro (mismo origen que Telepatía y MOA). */
function leerCarpetas(brainId: string): Array<{ id: string; nombre: string }> {
  try {
    if (typeof window === "undefined") return [];
    const json = (clave: string): unknown => JSON.parse(window.localStorage.getItem(clave) ?? "[]");
    const ids = json(`starseed.brain.${brainId}.memoryRoots`);
    if (!Array.isArray(ids)) return [];
    const raices = Array.isArray(json("starseed.memory.roots.v1")) ? (json("starseed.memory.roots.v1") as unknown[]) : [];
    const nombres = new Map<string, string>(
      raices.filter((r): r is { id: unknown; name?: unknown } => !!r && typeof r === "object" && "id" in r)
        .map((r) => [String(r.id), typeof r.name === "string" && r.name ? r.name : String(r.id)])
    );
    return ids.filter((id): id is string => typeof id === "string").map((id) => ({ id, nombre: nombres.get(id) ?? id }));
  } catch {
    return [];
  }
}
export default function AjustesCerebroDialog({ open, onOpenChange, cerebro, onHecho }: AjustesCerebroDialogProps) {
  const [pestana, setPestana] = useState<Pestana>("medios");
  const [objetivo, setObjetivo] = useState<Objetivo>({ tipo: "cerebro" });
  const [ajustes, setAjustes] = useState<AjustesCerebro>(() => leerAjustes(cerebro));
  const [pendiente, setPendiente] = useState<Partial<AjustesObjetivo>>({});
  const [memorias, setMemorias] = useState<Array<{ id: string; nombre: string }>>([]);
  const [carpetas, setCarpetas] = useState<Array<{ id: string; nombre: string }>>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setAjustes(leerAjustes(cerebro));
    setPendiente({});
    setObjetivo({ tipo: "cerebro" });
    setPestana("medios");
    setError(null);
    setCarpetas(leerCarpetas(cerebro.id));
    let vivo = true;
    void listMemoryFiles(cerebro.id).then((ficheros) => {
      if (vivo) setMemorias(ficheros.map((f) => ({ id: f.id, nombre: f.name || f.id })));
    });
    return () => { vivo = false; };
  }, [open, cerebro]);
  const nivel: NivelAjustes = objetivo.tipo;
  /** Valor efectivo mostrado: lo guardado (con herencia) más lo no guardado aún. */
  const valor = useMemo<AjustesObjetivo>(() => ({ ...ajustesEfectivos(ajustes, objetivo), ...pendiente }), [ajustes, objetivo, pendiente]);
  const onCambio = (parcial: Partial<AjustesObjetivo>) => setPendiente((p) => ({ ...p, ...parcial }));
  const guardar = async () => {
    setOcupado(true);
    setError(null);
    try {
      let base = cerebro;
      if (objetivo.tipo === "cerebro" && cambioAlmacenamiento(valor.medios.almacenamiento, cerebro)) {
        const ids = valor.medios.almacenamiento;
        const aplicado = await setMemoryDestinations(cerebro, {
          starseed: { enabled: ids.includes("starseed") }, p2p: { enabled: ids.includes("p2p") },
          external: getMemoryDestinations(cerebro).external.filter((e) => ids.includes(`ext:${e.id}`)),
        });
        if (!aplicado) { setError("No se pudieron aplicar los destinos de memoria."); setOcupado(false); return; }
        base = aplicado;
      }
      const configClonado = JSON.parse(JSON.stringify(base.config ?? {})) as Record<string, unknown>;
      const guardado = await saveBrain({ ...base, config: conAjustes(configClonado, objetivo, valor) });
      if (!guardado) { setError("No se pudo guardar el cerebro."); setOcupado(false); return; }
      onHecho?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado al guardar.");
    }
    setOcupado(false);
  };
  const elegir = (elegido: string) => {
    if (elegido === "cerebro") return setObjetivo({ tipo: "cerebro" });
    const [tipo, ...resto] = elegido.split(":");
    const id = resto.join(":");
    const lista = tipo === "memoria" ? memorias : tipo === "carpeta" ? carpetas : [];
    if (tipo === "memoria" || tipo === "carpeta") setObjetivo({ tipo, id, nombre: lista.find((x) => x.id === id)?.nombre ?? id });
  };
  const valorAplicar = objetivo.tipo === "cerebro" ? "cerebro" : `${objetivo.tipo}:${objetivo.id}`;
  const etiqueta = objetivo.tipo === "cerebro" ? "el cerebro completo" : `«${objetivo.nombre}»`;
  const SELECTOR = "h-9 rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white cursor-pointer min-w-56";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustes del cerebro · «{cerebro.name}»</DialogTitle>
          <DialogDescription>Qué hace cada capacidad, dónde se guarda y quién puede entrar. Se aplica a {etiqueta}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="aplicar-a" className="text-sm text-white/80">Aplicar a</label>
          <select id="aplicar-a" aria-label="Aplicar ajustes a" className={SELECTOR} value={valorAplicar} onChange={(e) => elegir(e.target.value)}>
            <option value="cerebro">Cerebro completo</option>
            {memorias.length ? <optgroup label="Memorias">{memorias.map((m) => <option key={m.id} value={`memoria:${m.id}`}>{m.nombre}</option>)}</optgroup> : null}
            {carpetas.length ? <optgroup label="Carpetas">{carpetas.map((c) => <option key={c.id} value={`carpeta:${c.id}`}>{c.nombre}</option>)}</optgroup> : null}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Secciones de ajustes">
          {PESTANAS.map((p) => (
            <Button key={p.id} type="button" size="sm" variant={pestana === p.id ? "default" : "outline"} aria-pressed={pestana === p.id}
              className="h-auto whitespace-normal px-3 py-1.5" onClick={() => setPestana(p.id)}>{p.texto}</Button>
          ))}
        </div>
        {pestana === "medios" ? <AjustesMedios cerebro={cerebro} valor={{ medios: valor.medios }} onCambio={onCambio} nivel={nivel} /> : null}
        {pestana === "seguridad" ? <AjustesSeguridad valor={{ privacidad: valor.privacidad, cifradoLocal: valor.cifradoLocal, acceso: valor.acceso }} onCambio={onCambio} nivel={nivel} /> : null}
        {pestana === "sync" ? <AjustesSync valor={{ sync: valor.sync }} onCambio={onCambio} cerebro={cerebro} /> : null}
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" className="h-auto whitespace-normal" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" className="h-auto whitespace-normal" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
