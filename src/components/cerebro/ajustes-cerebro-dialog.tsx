"use client";
// Ajustes del cerebro (CB1013S, contrato §8). Selector «Aplicar a» —cerebro, memoria
// o carpeta— y tres pestañas: Medios, Seguridad y privacidad, Vinculación y
// sincronización. Guarda con `conAjustes` + `saveBrain` y avisa con `onHecho`.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getBrain, saveBrain, type Brain } from "@/lib/brains/brains";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import { ajustesEfectivos, conAjustes, leerAjustes, type AjustesCerebro, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { AjustesMedios } from "@/components/cerebro/ajustes-medios";
import { AjustesSeguridad } from "@/components/cerebro/ajustes-seguridad";
import { AjustesSync } from "@/components/cerebro/ajustes-sync";
export interface AjustesCerebroDialogProps {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  cerebro: Brain;
  cerebros: Brain[];
  onHecho?: () => void;
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
export default function AjustesCerebroDialog({ open, onOpenChange, cerebro, onHecho }: AjustesCerebroDialogProps) {
  const [destino, setDestino] = useState("cerebro");
  const [ajustes, setAjustes] = useState<AjustesCerebro>(() => leerAjustes(cerebro));
  const [cambios, setCambios] = useState<Record<string, Partial<AjustesObjetivo>>>({});
  const [memorias, setMemorias] = useState<string[]>([]);
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [tab, setTab] = useState("medios");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setAjustes(leerAjustes(cerebro)); setCambios({}); setDestino("cerebro"); setTab("medios"); setAviso(null);
    setCarpetas(leerCarpetas(cerebro.id));
    let vivo = true;
    void listMemoryFiles(cerebro.id).then((f) => { if (vivo) setMemorias(f.map((x) => x.name)); });
    return () => { vivo = false; };
  }, [open, cerebro.id]);

  const objetivo = objetivoDe(destino);
  const parcial = cambios[destino] ?? {};
  const valor = combinar(ajustesEfectivos(ajustes, objetivo), parcial);
  const cambiar = (p: Partial<AjustesObjetivo>) => setCambios((prev) => ({ ...prev, [destino]: juntar(prev[destino] ?? {}, p) }));
  const nivel = objetivo.tipo;

  const guardar = async () => {
    if (Object.keys(parcial).length === 0) { onOpenChange(false); return; }
    setGuardando(true); setAviso(null);
    try {
      const fresco = (await getBrain(cerebro.id)) ?? cerebro;
      const guardado = await saveBrain({ ...fresco, config: conAjustes(fresco.config, objetivo, parcial) });
      if (!guardado) throw new Error("No se pudo guardar el cerebro.");
      onHecho?.(); onOpenChange(false);
    } catch (e) { setAviso(e instanceof Error ? e.message : "No se pudo guardar."); } finally { setGuardando(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ajustes del cerebro · «{cerebro.name}»</DialogTitle>
          <DialogDescription>Elige a qué se aplican los ajustes y guarda. Cada ajuste dice si se aplica ya o solo se guarda.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 text-white">
          <label htmlFor="aplicar-a" className="text-sm font-semibold">Aplicar a</label>
          <select id="aplicar-a" className={SELECT} value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="cerebro">Cerebro completo</option>
            {memorias.length > 0 && <optgroup label="Una memoria">{memorias.map((m) => <option key={m} value={`memoria:${m}`}>{m}</option>)}</optgroup>}
            {carpetas.length > 0 && <optgroup label="Una carpeta">{carpetas.map((c) => <option key={c.id} value={`carpeta:${c.id}`}>{c.nombre}</option>)}</optgroup>}
          </select>
          <p className="text-xs leading-relaxed text-white/60">{nivel === "cerebro" ? "El cerebro entero; memorias y carpetas heredan lo que no cambien." : "Solo esta parte; lo que no cambies se hereda del cerebro."}</p>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="medios" className="whitespace-normal">Medios</TabsTrigger>
            <TabsTrigger value="seguridad" className="whitespace-normal">Seguridad y privacidad</TabsTrigger>
            <TabsTrigger value="sync" className="whitespace-normal">Vinculación y sincronización</TabsTrigger>
          </TabsList>
          <TabsContent value="medios"><AjustesMedios valor={valor} onCambio={cambiar} cerebro={cerebro} privacidad={valor.privacidad} nivel={nivel} /></TabsContent>
          <TabsContent value="seguridad"><AjustesSeguridad valor={valor} onCambio={cambiar} nivel={nivel} /></TabsContent>
          <TabsContent value="sync"><AjustesSync valor={valor} onCambio={cambiar} cerebro={cerebro} /></TabsContent>
        </Tabs>
        {aviso && <p className="text-sm text-amber-200">{aviso}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-auto whitespace-normal" onClick={() => onOpenChange(false)} disabled={guardando}>Cancelar</Button>
          <Button type="button" className="h-auto whitespace-normal" onClick={() => void guardar()} disabled={guardando}>{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
