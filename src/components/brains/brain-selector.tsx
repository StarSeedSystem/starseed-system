"use client";

/**
 * BrainSelector — selector compacto y reutilizable de cerebro por contexto.
 * Carga los cerebros del usuario + la selección actual para el contexto dado,
 * permite elegir un cerebro (y opcionalmente un servidor) y lo persiste con
 * selectBrainForContext. Muestra el cerebro activo. Embebible en cualquier sitio.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain as BrainIcon, Server, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  listBrains,
  getSelection,
  selectBrainForContext,
  serverKindById,
  type Brain,
} from "@/lib/brains/brains";

export function BrainSelector({ context, contextRef }: { context: string; contextRef?: string }) {
  const ref = contextRef ?? "";
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainId, setBrainId] = useState<string>("");
  const [serverIds, setServerIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sel] = await Promise.all([listBrains(), getSelection(context, ref)]);
      setBrains(list);
      if (sel) {
        setBrainId(sel.brain_id);
        setServerIds(sel.server_ids || []);
      }
    } catch {
      /* */
    }
    setLoading(false);
  }, [context, ref]);

  useEffect(() => {
    load();
  }, [load]);

  const active = useMemo(() => brains.find((b) => b.id === brainId) || null, [brains, brainId]);

  async function pick(id: string) {
    setBrainId(id);
    const b = brains.find((x) => x.id === id);
    const sids = (b?.servers || []).map((s) => s.id);
    setServerIds(sids);
    setSaving(true);
    const ok = await selectBrainForContext(context, ref, id, sids);
    setSaving(false);
    if (ok) {
      toast.success(`Cerebro «${b?.name ?? ""}» activado para este contexto.`);
      setOpen(false);
    } else {
      toast.error("No se pudo activar el cerebro. ¿Has iniciado sesión?");
    }
  }

  async function toggleServer(id: string) {
    if (!brainId) return;
    const next = serverIds.includes(id) ? serverIds.filter((s) => s !== id) : [...serverIds, id];
    setServerIds(next);
    setSaving(true);
    await selectBrainForContext(context, ref, brainId, next);
    setSaving(false);
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
          active
            ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
            : "border-white/10 bg-white/5 text-white/60 hover:text-white/90",
        )}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-pulse" /> : <BrainIcon className="h-3.5 w-3.5" />}
        <span className="max-w-[160px] truncate">{active ? active.name : "Elegir cerebro"}</span>
        {serverIds.length > 0 && (
          <span className="rounded-full bg-cyan-500/20 px-1.5 text-[10px] text-cyan-200">{serverIds.length} srv</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-xl border border-white/10 bg-[#0b0b12] p-2 shadow-xl">
          <div className="mb-1 px-1 text-[10px] uppercase tracking-widest text-cyan-300/60">Cerebro para este contexto</div>
          {brains.length === 0 ? (
            <div className="px-1 py-2 text-[11px] text-white/40">
              Aún no tienes cerebros. Crea uno en la sección Cerebros.
            </div>
          ) : (
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {brains.map((b) => (
                <button
                  key={b.id}
                  onClick={() => pick(b.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                    b.id === brainId ? "bg-cyan-500/15 text-cyan-100" : "text-white/70 hover:bg-white/5",
                  )}
                >
                  <BrainIcon className="h-3.5 w-3.5 shrink-0 text-cyan-300/70" />
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.id === brainId && <Check className="h-3.5 w-3.5 text-cyan-300" />}
                </button>
              ))}
            </div>
          )}

          {active && (active.servers || []).length > 0 && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <div className="mb-1 px-1 text-[10px] uppercase tracking-widest text-cyan-300/60">Servidores</div>
              <div className="space-y-0.5">
                {active.servers.map((s) => {
                  const on = serverIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleServer(s.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px]",
                        on ? "bg-emerald-500/10 text-emerald-200" : "text-white/60 hover:bg-white/5",
                      )}
                    >
                      <Server className="h-3 w-3 shrink-0" />
                      <span className="flex-1 truncate">
                        {serverKindById(String(s.kind))?.icon ?? "•"} {s.name}
                      </span>
                      {on ? <Check className="h-3 w-3 text-emerald-300" /> : <span className="h-3 w-3 rounded-full border border-white/25" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {saving && (
            <div className="mt-2 flex items-center gap-1 px-1 text-[10px] text-white/40">
              <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BrainSelector;
