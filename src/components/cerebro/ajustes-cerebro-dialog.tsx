"use client";

/** Ajustes del cerebro (CB1013R–T, contrato §8): medios, seguridad, vinculación/sincro. */

import { useState, useMemo, useEffect } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { Brain } from "@/lib/brains/brains";
import { saveBrain } from "@/lib/brains/brains";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import { leerAjustes, conAjustes, APLICACION, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AjustesSeguridad } from "@/components/cerebro/ajustes-seguridad";
import { AjustesSync } from "@/components/cerebro/ajustes-sync";
import { AjustesMedios } from "@/components/cerebro/ajustes-medios";

export interface AjustesCerebroDialogProps {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  cerebro: Brain;
  cerebros: Brain[];
  onHecho?: () => void;
}

export default function AjustesCerebroDialog({ open, onOpenChange, cerebro, cerebros, onHecho }: AjustesCerebroDialogProps) {
  const [aplicarA, setAplicarA] = useState<"cerebro" | { tipo: "memoria"; id: string } | { tipo: "carpeta"; id: string }>("cerebro");
  const ajustes = useMemo(() => leerAjustes(cerebro), [cerebro]);
  const [valorMedios, setValorMedios] = useState(ajustes.cerebro.medios);
  const [valorSeguridad, setValorSeguridad] = useState({ privacidad: ajustes.cerebro.privacidad, cifradoLocal: ajustes.cerebro.cifradoLocal, acceso: ajustes.cerebro.acceso });
  const [valorSync, setValorSync] = useState({ sync: ajustes.cerebro.sync });

  const [memorias, setMemorias] = useState<string[]>([]);
  const [carpetas, setCarpetas] = useState<Array<{ id: string; nombre: string }>>([]);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const archivos = await listMemoryFiles(cerebro.id);
      if (vivo) setMemorias(archivos.map((a) => a.name));
    })();
    try {
      const ids = JSON.parse(window.localStorage.getItem(`starseed.brain.${cerebro.id}.memoryRoots`) ?? "[]") as unknown;
      const nombres = new Map<string, string>();
      try {
        const raices = JSON.parse(window.localStorage.getItem("starseed.memory.roots.v1") ?? "[]") as unknown;
        if (Array.isArray(raices)) {
          for (const raiz of raices) {
            if (!raiz || typeof raiz !== "object" || !("id" in raiz)) continue;
            const fila = raiz as { id: unknown; name?: unknown };
            nombres.set(String(fila.id), typeof fila.name === "string" && fila.name ? fila.name : String(fila.id));
          }
        }
      } catch { /* sin nombres */ }
      if (Array.isArray(ids)) {
        const carpetasLeidas = ids.filter((id): id is string => typeof id === "string").map((id) => ({ id, nombre: nombres.get(id) ?? id }));
        setCarpetas(carpetasLeidas);
      }
    } catch { /* sin carpetas */ }
    return () => { vivo = false; };
  }, [cerebro.id]);

  async function guardar() {
    const objetivo = aplicarA === "cerebro" ? { tipo: "cerebro" as const } : aplicarA;
    const parcial: Partial<AjustesObjetivo> = {
      medios: valorMedios,
      privacidad: valorSeguridad.privacidad,
      cifradoLocal: valorSeguridad.cifradoLocal,
      acceso: valorSeguridad.acceso,
      sync: valorSync.sync,
    };
    const nuevoConfig = conAjustes(cerebro.config, objetivo, parcial);
    const guardado = await saveBrain({ ...cerebro, config: nuevoConfig });
    if (guardado) onHecho?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <SlidersHorizontal className="h-5 w-5 text-cyan-300" />
            Ajustes · «{cerebro.name}»
          </DialogTitle>
          <DialogDescription className="text-white/60">Medios, seguridad, privacidad, vinculación y sincronización.</DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/60">Aplicar a:</span>
          <select
            className="h-8 cursor-pointer rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
            value={aplicarA === "cerebro" ? "cerebro" : aplicarA.tipo === "memoria" ? `memoria:${aplicarA.id}` : `carpeta:${aplicarA.id}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "cerebro") setAplicarA("cerebro");
              else if (v.startsWith("memoria:")) setAplicarA({ tipo: "memoria", id: v.slice("memoria:".length) });
              else if (v.startsWith("carpeta:")) setAplicarA({ tipo: "carpeta", id: v.slice("carpeta:".length) });
            }}
          >
            <option value="cerebro">Cerebro completo</option>
            <optgroup label="Memorias de este cerebro">
              {memorias.map((m) => (
                <option key={`memoria:${m}`} value={`memoria:${m}`}>{m}</option>
              ))}
            </optgroup>
            <optgroup label="Carpetas de memoria">
              {carpetas.map((c) => (
                <option key={`carpeta:${c.id}`} value={`carpeta:${c.id}`}>{c.nombre}</option>
              ))}
            </optgroup>
          </select>
          <button
            type="button"
            onClick={guardar}
            className="ml-auto h-auto rounded-md bg-cyan-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-cyan-700 cursor-pointer whitespace-normal"
          >
            Guardar ajustes
          </button>
        </div>

        <Tabs defaultValue="medios" className="mt-3">
          <TabsList className="bg-black/30 border border-white/10">
            <TabsTrigger value="medios">Medios</TabsTrigger>
            <TabsTrigger value="seguridad">Seguridad y privacidad</TabsTrigger>
            <TabsTrigger value="vinculacion">Vinculación y sincronización</TabsTrigger>
          </TabsList>

          <TabsContent value="medios" className="mt-3">
            <AjustesMedios
              valor={{ medios: valorMedios }}
              onCambio={(p: Partial<AjustesObjetivo>) => p.medios && setValorMedios(p.medios)}
              cerebro={cerebro}
              nivel={typeof aplicarA === "object" && aplicarA.tipo === "memoria" ? "memoria" : typeof aplicarA === "object" && aplicarA.tipo === "carpeta" ? "carpeta" : "cerebro"}
            />
          </TabsContent>

          <TabsContent value="seguridad" className="mt-3">
            <AjustesSeguridad
              valor={valorSeguridad}
              onCambio={(p: Partial<{ privacidad: AjustesObjetivo["privacidad"]; cifradoLocal: boolean; acceso: AjustesObjetivo["acceso"] }>) => setValorSeguridad((s) => ({ ...s, ...p }))}
              nivel={typeof aplicarA === "object" && aplicarA.tipo === "memoria" ? "memoria" : typeof aplicarA === "object" && aplicarA.tipo === "carpeta" ? "carpeta" : "cerebro"}
            />
          </TabsContent>

          <TabsContent value="vinculacion" className="mt-3">
            <AjustesSync
              valor={valorSync}
              onCambio={(p: Partial<{ sync: AjustesObjetivo["sync"] }>) => setValorSync((s) => ({ ...s, ...p }))}
              cerebro={cerebro}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
