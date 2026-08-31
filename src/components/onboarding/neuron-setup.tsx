"use client";

/**
 * NeuronSetup — alta ESPECIALIZADA de neurona nueva con cuenta EXISTENTE.
 * ============================================================================
 * Aparece al entrar desde un dispositivo/medio donde esta cuenta nunca se ha
 * configurado (marca local ausente) y el onboarding de la cuenta YA está
 * completado. No re-pide datos de cuenta ni de perfil: solo con qué CEREBROS
 * trabajar aquí y cómo sincronizarlos, con la recomendación del agente de
 * integración según el hardware real detectado. Reconfigurable en Ajustes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain as BrainIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listBrains, type Brain } from "@/lib/brains/brains";
import { thisDeviceId, setNeuronName } from "@/lib/neurons/neurons";
import { saveOnboarding } from "@/lib/onboarding/onboarding";
import { detectar, recomendar, type HW } from "@/lib/onboarding/neuron-recommend";
import AgentRecommendation from "./agent-recommendation";

type ModoSync = "tiempo-real" | "al-abrir" | "manual";

export function NeuronSetup({ onClose }: { onClose: () => void }) {
  const [cerebros, setCerebros] = useState<Brain[] | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [modo, setModo] = useState<ModoSync>("tiempo-real");
  const [hw, setHw] = useState<HW | null>(null);
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const [aplicado, setAplicado] = useState(false);

  useEffect(() => {
    let alive = true;
    listBrains().then((bs) => {
      if (!alive) return;
      setCerebros(bs);
      const s: Record<string, boolean> = {};
      bs.forEach((b) => { s[b.id] = true; });
      setSel(s);
    }).catch(() => { if (alive) setCerebros([]); });
    detectar().then((h) => {
      if (!alive) return;
      setHw(h);
      setNombre((p) => p || `Neurona ${h.so}`);
    });
    return () => { alive = false; };
  }, []);

  const razones = useMemo(() => {
    const r: string[] = [];
    if (cerebros === null) r.push("Buscando los cerebros de tu cuenta…");
    else if (cerebros.length === 0) r.push("Tu cuenta aún no tiene cerebros: esta neurona quedará lista y podrás crearlos en Cerebros.");
    else r.push(`Tu cuenta tiene ${cerebros.length} cerebro(s): recomiendo sincronizarlos todos aquí en tiempo real para que esta ventana sea una más de tu mismo sistema.`);
    if (hw) {
      const rec = recomendar(hw);
      r.push(rec.razones[0]);
    }
    return r;
  }, [cerebros, hw]);

  const terminar = useCallback(async () => {
    setCargando(true);
    const elegidos = Object.entries(sel).filter(([, v]) => v).map(([id]) => id);
    try { setNeuronName(thisDeviceId(), nombre || "Mi neurona"); } catch { /* local */ }
    try {
      await saveOnboarding({ steps: { neuronaNueva: { cerebros: elegidos, modo, so: hw?.so ?? null } } });
    } catch { /* best-effort: la marca local evita repetir */ }
    try { window.localStorage.setItem("starseed.neuron.setup.v1", "1"); } catch { /* */ }
    setAplicado(true);
    setCargando(false);
    onClose();
  }, [sel, modo, nombre, hw, onClose]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva neurona detectada</DialogTitle>
          <DialogDescription>
            Tu cuenta ya está lista; solo configuremos cómo trabaja este dispositivo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <AgentRecommendation razones={razones} aplicado={aplicado} onAceptar={terminar} cargando={cargando} />
          <label className="block text-sm">
            <span className="text-muted-foreground">Nombre de esta neurona</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm" />
          </label>
          {(cerebros?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">Cerebros a sincronizar aquí</p>
              {cerebros!.map((b) => (
                <label key={b.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-sm">
                  <input type="checkbox" checked={!!sel[b.id]}
                    onChange={(e) => setSel((s) => ({ ...s, [b.id]: e.target.checked }))}
                    className="h-4 w-4 accent-cyan-400" />
                  <BrainIcon className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                  {b.name || "Cerebro"}
                </label>
              ))}
            </div>
          )}
          <label className="block text-sm">
            <span className="text-muted-foreground">Modo de sincronización</span>
            <select value={modo} onChange={(e) => setModo(e.target.value as ModoSync)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm">
              <option value="tiempo-real">Tiempo real — misma cuenta, mismas ventanas, al instante (recomendado)</option>
              <option value="al-abrir">Al abrir — sincroniza cada vez que entras</option>
              <option value="manual">Manual — tú decides cuándo</option>
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Más tarde</Button>
            <Button size="sm" onClick={terminar} disabled={cargando}>
              {cargando ? "Guardando…" : "Listo, sincronizar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NeuronSetup;
