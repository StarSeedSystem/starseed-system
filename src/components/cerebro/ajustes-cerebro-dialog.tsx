"use client";

/** Ajustes del cerebro: diálogo con pestañas y selector de aplicación (CB1013T). */

import { useEffect, useMemo, useState } from "react";
import type { Brain } from "@/lib/brains/brains";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { saveBrain } from "@/lib/brains/brains";
import { leerAjustes, conAjustes, ajustesEfectivos, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
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

type Objetivo = { tipo: "cerebro" } | { tipo: "memoria"; id: string } | { tipo: "carpeta"; id: string };

export default function AjustesCerebroDialog({ open, onOpenChange, cerebro, onHecho }: AjustesCerebroDialogProps) {
  const [tab, setTab] = useState<"medios" | "seguridad" | "sync">("medios");
  const [objetivo, setObjetivo] = useState<Objetivo>({ tipo: "cerebro" });
  const [memorias, setMemorias] = useState<string[]>([]);
  const [parcial, setParcial] = useState<Partial<AjustesObjetivo>>({});

  const ajustes = useMemo(() => leerAjustes(cerebro), [cerebro]);

  useEffect(() => {
    if (!open) return;
    listMemoryFiles(cerebro.id).then((files) => setMemorias(files.map((f) => f.name)));
    setObjetivo({ tipo: "cerebro" });
    setTab("medios");
  }, [open, cerebro.id]);

  useEffect(() => {
    const efectivo = ajustesEfectivos(ajustes, objetivo);
    setParcial({});
  }, [objetivo, ajustes]);

  const efectivo = ajustesEfectivos(ajustes, objetivo);

  const nivel = objetivo.tipo === "cerebro" ? "cerebro" : objetivo.tipo === "memoria" ? "memoria" : "carpeta";

  const guardar = async () => {
    const nuevaConfig = conAjustes(cerebro.config ?? {}, objetivo, parcial);
    await saveBrain({ ...cerebro, config: nuevaConfig });
    onHecho?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Ajustes del cerebro · «{cerebro.name}»</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-white/70">Aplicar a</label>
            <select
              className="h-9 rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white"
              value={objetivo.tipo === "cerebro" ? "cerebro" : `${objetivo.tipo}:${objetivo.id}`}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "cerebro") setObjetivo({ tipo: "cerebro" });
                else {
                  const [tipo, id] = v.split(":");
                  if (tipo === "memoria") setObjetivo({ tipo: "memoria", id });
                  else setObjetivo({ tipo: "carpeta", id });
                }
              }}
            >
              <option value="cerebro">Cerebro completo</option>
              {memorias.map((m) => (
                <option key={m} value={`memoria:${m}`}>Memoria · {m}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            {(["medios", "seguridad", "sync"] as const).map((t) => (
              <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} className="h-auto whitespace-normal py-1.5" onClick={() => setTab(t)}>
                {t === "medios" ? "Medios" : t === "seguridad" ? "Seguridad y privacidad" : "Vinculación y sincronización"}
              </Button>
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            {tab === "medios" && (
              <AjustesMedios
                valor={{ medios: efectivo.medios }}
                onCambio={(p) => setParcial((prev) => ({ ...prev, medios: { ...(prev.medios ?? efectivo.medios), ...p.medios } }))}
                cerebro={cerebro}
                nivel={nivel}
              />
            )}
            {tab === "seguridad" && (
              <AjustesSeguridad
                valor={{ privacidad: efectivo.privacidad, cifradoLocal: efectivo.cifradoLocal, acceso: efectivo.acceso }}
                onCambio={(p) => setParcial((prev) => ({ ...prev, ...p }))}
                nivel={nivel}
              />
            )}
            {tab === "sync" && (
              <AjustesSync
                valor={{ sync: efectivo.sync }}
                onCambio={(p) => setParcial((prev) => ({ ...prev, sync: { ...(prev.sync ?? efectivo.sync), ...p.sync } }))}
                cerebro={{ config: cerebro.config }}
              />
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={guardar}>Guardar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
