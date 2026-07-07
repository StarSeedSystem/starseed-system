"use client";

// StarSeed · Área Política · Ejecutivo — Administración de RECURSOS COMUNES.
// Vista de recursos con sus asignaciones (persistida vía entity_state, con
// espejo local si la nube no responde — ver src/lib/governance/political.ts).

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Boxes, Loader2, Plus, Trash2, UserCheck, WifiOff } from "lucide-react";
import {
  loadCommonsResources,
  upsertCommonsResource,
  removeCommonsResource,
  labelForUser,
  type CommonsResource,
} from "@/lib/governance/political";
import { createClient } from "@/utils/supabase/client";

const STATUS_OPTIONS: CommonsResource["status"][] = ["Disponible", "En uso", "Mantenimiento"];
const STATUS_CLS: Record<CommonsResource["status"], string> = {
  Disponible: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10",
  "En uso": "border-amber-400/40 text-amber-200 bg-amber-500/10",
  Mantenimiento: "border-red-400/40 text-red-200 bg-red-500/10",
};

function rid(): string {
  return "res_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

export function CommonsResourcesPanel() {
  const [list, setList] = useState<CommonsResource[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("Herramienta");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadCommonsResources();
    setList(res.list);
    setDegraded(res.degraded);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addResource() {
    if (!name.trim()) {
      toast.error("Ponle un nombre al recurso.");
      return;
    }
    setBusy("new");
    const res = await upsertCommonsResource({ id: rid(), name: name.trim(), type, status: "Disponible" });
    if (res.ok) {
      toast.success(res.degraded ? "Guardado en este dispositivo (sin conexión a la red)" : "Recurso añadido");
      setName("");
      await load();
    } else {
      toast.error("No se pudo guardar el recurso.");
    }
    setBusy(null);
  }

  async function assignToMe(r: CommonsResource) {
    setBusy(r.id);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id;
      if (!uid) {
        toast.error("Inicia sesión para asignarte un recurso.");
        setBusy(null);
        return;
      }
      const label = await labelForUser(uid);
      const res = await upsertCommonsResource({ ...r, assignedTo: uid, assignedLabel: label, status: "En uso" });
      if (res.ok) {
        toast.success("Recurso asignado a ti");
        await load();
      }
    } catch {
      toast.error("No se pudo asignar el recurso.");
    }
    setBusy(null);
  }

  async function cycleStatus(r: CommonsResource) {
    const idx = STATUS_OPTIONS.indexOf(r.status);
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    setBusy(r.id);
    const res = await upsertCommonsResource({ ...r, status: next });
    if (res.ok) await load();
    setBusy(null);
  }

  async function remove(id: string) {
    setBusy(id);
    const res = await removeCommonsResource(id);
    if (res.ok) {
      toast.success("Recurso retirado");
      await load();
    }
    setBusy(null);
  }

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Boxes className="h-4 w-4 text-emerald-300" />
        <span className="text-sm font-semibold">Recursos comunes</span>
        {degraded && (
          <Badge variant="outline" className="gap-1 text-[9px] border-amber-400/40 text-amber-200 bg-amber-500/10" title="No se pudo confirmar la sincronización con la red; se está usando la copia de este dispositivo.">
            <WifiOff className="h-2.5 w-2.5" /> guardado local
          </Badge>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del recurso" className="h-8 flex-1 text-xs" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          {["Herramienta", "Espacio", "Conocimiento", "Energía", "Semilla 3D"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <Button size="sm" className="h-8 gap-1" disabled={busy === "new"} onClick={addResource}>
          {busy === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Añadir
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando recursos…
        </div>
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Aún no hay recursos comunes registrados.</p>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.type}{r.assignedLabel ? ` · asignado a ${r.assignedLabel}` : " · sin asignar"}</p>
              </div>
              <button type="button" onClick={() => cycleStatus(r)} className="cursor-pointer" title="Cambiar estado">
                <Badge variant="outline" className={cn("text-[10px]", STATUS_CLS[r.status])}>
                  {busy === r.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : r.status}
                </Badge>
              </button>
              {!r.assignedTo && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" disabled={busy === r.id} onClick={() => assignToMe(r)}>
                  <UserCheck className="h-3 w-3" /> Asignarme
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 px-2 text-white/30 hover:text-red-400" onClick={() => remove(r.id)} disabled={busy === r.id}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

export default CommonsResourcesPanel;
