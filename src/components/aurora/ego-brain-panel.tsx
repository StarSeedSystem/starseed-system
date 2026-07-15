"use client";

/**
 * EgoBrainPanel — pilar "Egos de Aurora" del Cerebro.
 *
 * Permite CONECTAR/DESCONECTAR Egos de Aurora (ego.md) a un cerebro concreto.
 * Conectar un ego añade su id a brain.includes.personalities (el campo ya
 * existente que enlaza cerebros con agentes de Aurora) y registra el adjunto en
 * el propio ego. Owner-scoped, realtime, español, estados vacíos.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import { getBrain, saveBrain, type Brain } from "@/lib/brains/brains";
import {
  listEgos,
  attachEgoToBrain,
  detachEgoFromContext,
  createEgoForContext,
  type AuroraEgo,
} from "@/lib/aurora/ego";
import { Sparkles, Loader2, Plus, Link2, Unlink, ExternalLink } from "lucide-react";

export default function EgoBrainPanel({
  brainId,
  brainName,
}: {
  brainId: string | null;
  brainName?: string;
}) {
  const { rows: egos, loading, reload } = useRealtimeRows<AuroraEgo>(
    "aurora_egos",
    () => listEgos(),
    { idKey: "id" },
  );

  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Lee las personalidades (egos) ya conectadas al cerebro activo.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!brainId) {
        setConnectedIds([]);
        return;
      }
      const brain = await getBrain(brainId);
      // getBrain normaliza `includes`, así que las listas siempre existen.
      const ids = brain?.includes?.personalities ?? [];
      if (alive) setConnectedIds(ids);
    })();
    return () => {
      alive = false;
    };
  }, [brainId, egos]);

  const connectedSet = useMemo(() => new Set(connectedIds), [connectedIds]);

  async function onToggle(ego: AuroraEgo) {
    if (!brainId) {
      toast.message("Selecciona un cerebro primero.");
      return;
    }
    setBusyId(ego.id);
    const isConnected = connectedSet.has(ego.id);
    let ok = false;
    if (isConnected) {
      // Desconectar: quita de includes.personalities + adjunto del ego.
      const brain = await getBrain(brainId);
      if (!brain) {
        setBusyId(null);
        toast.error("No se pudo cargar el cerebro.");
        return;
      }
      const ids = (brain.includes?.personalities ?? []).filter((x) => x !== ego.id);
      const saved = await saveBrain({ ...brain, includes: { ...brain.includes, personalities: ids } });
      await detachEgoFromContext(ego.id, "cerebro", brainId);
      ok = !!saved;
      if (ok) setConnectedIds(ids);
    } else {
      ok = await attachEgoToBrain(ego.id, brainId, brainName);
      if (ok) setConnectedIds((p) => [...p, ego.id]);
    }
    setBusyId(null);
    if (ok) toast.success(isConnected ? "Ego desconectado del cerebro." : "Ego conectado al cerebro.");
    else toast.error("No se pudo actualizar la conexión.");
  }

  async function onCreateAndConnect() {
    setCreating(true);
    const ego = await createEgoForContext({
      name: brainName ? `Ego · ${brainName}` : "Ego de Aurora",
      summary: "Ego de Aurora conectado a un cerebro. Integración Aurora ↔ Astraura.",
      attachment: brainId ? { kind: "cerebro", ref: brainId, label: brainName || "Cerebro" } : null,
    });
    if (ego && brainId) {
      await attachEgoToBrain(ego.id, brainId, brainName);
      setConnectedIds((p) => [...p, ego.id]);
    }
    setCreating(false);
    await reload();
    if (ego) toast.success("Ego creado y conectado al cerebro.");
    else toast.error("No se pudo crear el ego.");
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="w-4 h-4 text-fuchsia-300" />
        <span className="text-sm font-semibold text-fuchsia-50">Personalidades de Aurora</span>
        <span className="text-xs text-white/45">— agentes .md conectados a este cerebro</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-white/50" onClick={reload}>
          <RefreshCw className="w-3 h-3" />
        </Button>
        <a
          href="/aurora"
          className="ml-auto inline-flex items-center gap-1 text-xs text-fuchsia-300 hover:text-fuchsia-200 hover:underline"
        >
          <ExternalLink className="w-3 h-3" /> Gestionar Egos
        </a>
      </div>

      <p className="text-xs text-white/50">
        Conecta un Ego de Aurora (su ego.md: personalidad, voz, sentidos, emociones, carácter…) a este cerebro para
        que actúe como su agente integral. Se enlaza vía el programa del cerebro y se sincroniza con Astraura.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-white/50 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando egos…
        </div>
      ) : egos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/15 p-5 text-center">
          <Sparkles className="w-7 h-7 text-white/25 mx-auto mb-2" />
          <p className="text-sm text-white/55">
            Aún no tienes ningún Ego de Aurora. Crea uno para conectarlo a este cerebro.
          </p>
          <Button className="mt-3 gap-1.5" disabled={creating || !brainId} onClick={onCreateAndConnect}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Crear y conectar un Ego
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {egos.map((e) => {
              const connected = connectedSet.has(e.id);
              return (
                <li
                  key={e.id}
                  className={cn(
                    "rounded-lg border bg-black/20 p-3 flex items-center gap-3",
                    connected ? "border-fuchsia-400/40" : "border-white/10",
                  )}
                >
                  <Sparkles className={cn("w-4 h-4 shrink-0", connected ? "text-fuchsia-300" : "text-white/40")} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate flex items-center gap-2">
                      {e.name}
                      {connected && (
                        <Badge variant="outline" className="border-fuchsia-400/40 text-fuchsia-200 text-[9px]">
                          conectado
                        </Badge>
                      )}
                    </div>
                    {e.summary && <div className="text-[10px] text-white/40 truncate">{e.summary}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      "h-7 gap-1.5 text-xs",
                      connected ? "text-amber-200 hover:text-amber-100" : "text-fuchsia-100",
                    )}
                    disabled={busyId === e.id || !brainId}
                    onClick={() => onToggle(e)}
                  >
                    {busyId === e.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : connected ? (
                      <Unlink className="w-3.5 h-3.5" />
                    ) : (
                      <Link2 className="w-3.5 h-3.5" />
                    )}
                    {connected ? "Desconectar" : "Conectar"}
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={creating || !brainId} onClick={onCreateAndConnect}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Crear y conectar otro Ego
          </Button>
        </>
      )}
    </div>
  );
}
