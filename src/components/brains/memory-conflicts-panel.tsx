"use client";

/**
 * MemoryConflictsPanel — UI mínima de "Conflictos" (§8 del SOP de grafos de
 * memorias). Lista las discrepancias detectadas al fusionar la cola offline
 * de un cerebro (memorias `important`/soul/ego que cambiaron a la vez local y
 * remotamente) y deja elegir: versión Local, versión Remota, o editar una
 * fusión manual. Pensada para montarse como sección plegable dentro de
 * memory-graph.tsx, pero es un componente independiente y reutilizable.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, GitMerge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  listConflicts,
  resolveConflict,
  subscribeBrainConflicts,
  BRAIN_OFFLINE_FLUSH_EVENT,
  type MemoryConflict,
} from "@/lib/brains/memory-offline";

export default function MemoryConflictsPanel({ brainId }: { brainId: string }) {
  const [conflicts, setConflicts] = useState<MemoryConflict[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setConflicts(listConflicts(brainId));
  }, [brainId]);

  useEffect(() => {
    reload();
    const unsub1 = subscribeBrainConflicts(reload);
    const onFlush = () => reload();
    if (typeof window !== "undefined") window.addEventListener(BRAIN_OFFLINE_FLUSH_EVENT, onFlush);
    return () => {
      unsub1();
      if (typeof window !== "undefined") window.removeEventListener(BRAIN_OFFLINE_FLUSH_EVENT, onFlush);
    };
  }, [reload]);

  const resolve = async (c: MemoryConflict, resolution: "local" | "remote" | "merged") => {
    setBusyId(c.id);
    const mergedText = resolution === "merged" ? draft : undefined;
    await resolveConflict(brainId, c.id, resolution, mergedText);
    setBusyId(null);
    setEditingId(null);
    reload();
  };

  if (conflicts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white/45">
        <Check className="h-3.5 w-3.5 text-emerald-400" /> Sin conflictos pendientes en este cerebro.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conflicts.map((c) => (
        <div key={c.id} className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="truncate text-sm font-medium text-white/90">{c.fileName}</span>
            <Badge variant="outline" className="ml-auto border-amber-500/40 text-[10px] text-amber-300">
              editado en dos sitios
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-white/50">
            Esta memoria es importante y cambió a la vez en este dispositivo (offline) y en remoto. Elige qué
            versión conservar.
          </p>

          {editingId === c.id ? (
            <div className="mt-2 space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[140px] font-mono text-xs"
                placeholder="Escribe aquí la fusión manual…"
              />
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7 gap-1 px-2 text-xs" disabled={busyId === c.id} onClick={() => resolve(c, "merged")}>
                  {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                  Guardar fusión
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditingId(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
              <button
                onClick={() => resolve(c, "local")}
                disabled={busyId === c.id}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-left text-[11px] text-white/70 hover:bg-white/5"
              >
                <div className="mb-0.5 font-semibold text-cyan-300">Usar local (A)</div>
                <div className="line-clamp-3 whitespace-pre-wrap text-white/45">{c.localContent.slice(0, 160)}</div>
              </button>
              <button
                onClick={() => resolve(c, "remote")}
                disabled={busyId === c.id}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-left text-[11px] text-white/70 hover:bg-white/5"
              >
                <div className="mb-0.5 font-semibold text-violet-300">Usar remoto (B)</div>
                <div className="line-clamp-3 whitespace-pre-wrap text-white/45">{c.remoteContent.slice(0, 160)}</div>
              </button>
              <button
                onClick={() => {
                  setEditingId(c.id);
                  setDraft(`${c.remoteContent.trim()}\n\n---\n\n${c.localContent.trim()}\n`);
                }}
                className="rounded-lg border border-dashed border-white/15 bg-black/20 px-2 py-1.5 text-left text-[11px] text-white/60 hover:bg-white/5"
              >
                <div className="mb-0.5 font-semibold text-amber-300">Editar fusión…</div>
                <div className="text-white/40">Combina A + B a mano antes de guardar.</div>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
