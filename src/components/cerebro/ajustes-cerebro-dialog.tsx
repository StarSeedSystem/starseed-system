"use client";
// Ajustes del cerebro (CB1013S, contrato §8). El contenido vive en
// `AjustesCerebroContenido` para poder mostrarse dentro del panel lateral común
// de cada pilar (CER1126A) sin perder ninguna opción. El diálogo de siempre se
// conserva como envoltorio para cualquier uso suelto.
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getBrain, saveBrain, type Brain } from "@/lib/brains/brains";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import { ajustesEfectivos, conAjustes, leerAjustes, type AjustesCerebro, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { AjustesMedios } from "@/components/cerebro/ajustes-medios";
import { AjustesSeguridad } from "@/components/cerebro/ajustes-seguridad";
import { AjustesSync } from "@/components/cerebro/ajustes-sync";
import { valoresRecomendadosDeSeccion, type SeccionAjustesPilar } from "@/components/cerebro/panel-ajustes-pilar";

export interface AjustesCerebroDialogProps {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  cerebro: Brain;
  cerebros: Brain[];
  onHecho?: () => void;
}

export interface AjustesCerebroContenidoProps {
  cerebro: Brain;
  seccion: SeccionAjustesPilar;
  /** Cambia de valor para pedir «volver a lo recomendado» de una sección. */
  reinicio?: { seccion: SeccionAjustesPilar; n: number } | null;
  onHecho?: () => void;
  onCerrar?: () => void;
}

type Objetivo = { tipo: "cerebro" } | { tipo: "memoria" | "carpeta"; id: string };
type Carpeta = { id: string; nombre: string };

const SELECT = "h-9 w-full cursor-pointer rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white";

function objetivoDe(destino: string): Objetivo {
  const [tipo, ...resto] = destino.split(":");
  const id = resto.join(":");
  return (tipo === "memoria" || tipo === "carpeta") && id ? { tipo, id } : { tipo: "cerebro" };
}

function leerCarpetas(brainId: string): Carpeta[] {
  if (typeof window === "undefined") return [];
  try {
    const ids = JSON.parse(window.localStorage.getItem(`starseed.brain.${brainId}.memoryRoots`) ?? "[]") as unknown;
    const raices = JSON.parse(window.localStorage.getItem("starseed.memory.roots.v1") ?? "[]") as unknown;
    const nombres = new Map<string, string>();
    if (Array.isArray(raices)) for (const r of raices) {
      if (!r || typeof r !== "object" || !("id" in r)) continue;
      const f = r as { id: unknown; name?: unknown };
      nombres.set(String(f.id), typeof f.name === "string" && f.name ? f.name : String(f.id));
    }
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").map((id) => ({ id, nombre: nombres.get(id) ?? id })) : [];
  } catch { return []; }
}

function combinar(base: AjustesObjetivo, parcial: Partial<AjustesObjetivo>): AjustesObjetivo {
  return { ...base, ...parcial, medios: { capacidades: { ...base.medios.capacidades, ...(parcial.medios?.capacidades ?? {}) }, almacenamiento: parcial.medios?.almacenamiento ?? base.medios.almacenamiento }, sync: parcial.sync ?? base.sync, acceso: parcial.acceso ?? base.acceso };
}

function juntar(a: Partial<AjustesObjetivo>, b: Partial<AjustesObjetivo>): Partial<AjustesObjetivo> {
  return { ...a, ...b, medios: b.medios ?? a.medios, sync: b.sync ?? a.sync, acceso: b.acceso ?? a.acceso };
}

export function AjustesCerebroContenido({ cerebro, seccion, reinicio, onHecho, onCerrar }: AjustesCerebroContenidoProps) {
  const [destino, setDestino] = useState("cerebro");
  const [ajustes, setAjustes] = useState<AjustesCerebro>(() => leerAjustes(cerebro));
  const [cambios, setCambios] = useState<Record<string, Partial<AjustesObjetivo>>>({});
  const [memorias, setMemorias] = useState<string[]>([]);
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const destinoRef = useRef(destino);

  useEffect(() => { destinoRef.current = destino; }, [destino]);

  useEffect(() => {
    setAjustes(leerAjustes(cerebro));
    setCambios({});
    setDestino("cerebro");
    setAviso(null);
    setCarpetas(leerCarpetas(cerebro.id));
    let vivo = true;
    void listMemoryFiles(cerebro.id).then((f) => { if (vivo) setMemorias(f.map((x) => x.name)); });
    return () => { vivo = false; };
  }, [cerebro.id]);

  useEffect(() => {
    if (!reinicio || reinicio.seccion !== seccion) return;
    const recomendado = valoresRecomendadosDeSeccion(seccion, cerebro.scope);
    const clave = destinoRef.current;
    setCambios((prev) => ({ ...prev, [clave]: { ...(prev[clave] ?? {}), ...recomendado } }));
  }, [reinicio, seccion, cerebro.scope]);

  const objetivo = objetivoDe(destino);
  const parcial = cambios[destino] ?? {};
  const valor = combinar(ajustesEfectivos(ajustes, objetivo), parcial);
  const cambiar = (p: Partial<AjustesObjetivo>) => setCambios((prev) => ({ ...prev, [destino]: juntar(prev[destino] ?? {}, p) }));
  const nivel = objetivo.tipo;

  const guardar = async () => {
    if (Object.keys(parcial).length === 0) { onCerrar?.(); return; }
    setGuardando(true); setAviso(null);
    try {
      const fresco = (await getBrain(cerebro.id)) ?? cerebro;
      const guardado = await saveBrain({ ...fresco, config: conAjustes(fresco.config, objetivo, parcial) });
      if (!guardado) throw new Error("No se pudo guardar el cerebro.");
      onHecho?.(); onCerrar?.();
    } catch (e) { setAviso(e instanceof Error ? e.message : "No se pudo guardar."); } finally { setGuardando(false); }
  };

  const contenidoSeccion = seccion === "general"
    ? <AjustesMedios valor={valor} onCambio={cambiar} cerebro={cerebro} privacidad={valor.privacidad} nivel={nivel} />
    : seccion === "privacidad"
      ? <AjustesSeguridad valor={valor} onCambio={cambiar} nivel={nivel} />
      : seccion === "sincronia"
        ? <AjustesSync valor={valor} onCambio={cambiar} cerebro={cerebro} />
        : (
          <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm leading-relaxed text-white/55">
            Los ajustes avanzados de este pilar aparecen aquí cuando el pilar los ofrece. No se ha quitado
            ninguna opción: General, Privacidad y permisos y Sincronía siguen completas.
          </p>
        );

  return (
    <div className="space-y-4 text-white">
      <div className="space-y-1.5">
        <label htmlFor="aplicar-a" className="text-sm font-semibold">Aplicar a</label>
        <select id="aplicar-a" className={SELECT} value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="cerebro">Cerebro completo</option>
          {memorias.length > 0 && <optgroup label="Una memoria">{memorias.map((m) => <option key={m} value={`memoria:${m}`}>{m}</option>)}</optgroup>}
          {carpetas.length > 0 && <optgroup label="Una carpeta">{carpetas.map((c) => <option key={c.id} value={`carpeta:${c.id}`}>{c.nombre}</option>)}</optgroup>}
        </select>
        <p className="text-xs leading-relaxed text-white/60">{nivel === "cerebro" ? "El cerebro entero; memorias y carpetas heredan lo que no cambien." : "Solo esta parte; lo que no cambies se hereda del cerebro."}</p>
      </div>

      {contenidoSeccion}

      {aviso && <p className="text-sm text-amber-200">{aviso}</p>}

      <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-auto whitespace-normal" onClick={() => onCerrar?.()} disabled={guardando}>Cancelar</Button>
        <Button type="button" className="h-auto whitespace-normal" onClick={() => void guardar()} disabled={guardando}>{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Guardar cambios</Button>
      </div>
    </div>
  );
}

const TABS_DIALOGO: { id: SeccionAjustesPilar; etiqueta: string }[] = [
  { id: "general", etiqueta: "Medios" },
  { id: "privacidad", etiqueta: "Seguridad y privacidad" },
  { id: "sincronia", etiqueta: "Vinculación y sincronización" },
];

export default function AjustesCerebroDialog({ open, onOpenChange, cerebro, onHecho }: AjustesCerebroDialogProps) {
  const [seccion, setSeccion] = useState<SeccionAjustesPilar>("general");

  useEffect(() => { if (open) setSeccion("general"); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ajustes del cerebro · «{cerebro.name}»</DialogTitle>
          <DialogDescription>Elige a qué se aplican los ajustes y guarda. Cada ajuste dice si se aplica ya o solo se guarda.</DialogDescription>
        </DialogHeader>
        <div role="group" aria-label="Secciones de ajustes del cerebro" className="flex flex-wrap gap-1.5">
          {TABS_DIALOGO.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSeccion(t.id)}
              aria-pressed={seccion === t.id}
              className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors whitespace-normal h-auto ${seccion === t.id ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 text-white/70 hover:bg-white/5"}`}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
        <AjustesCerebroContenido cerebro={cerebro} seccion={seccion} onHecho={onHecho} onCerrar={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
