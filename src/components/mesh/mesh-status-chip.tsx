"use client";

/**
 * MeshStatusChip — chip compacto y reutilizable del estado de la malla
 * (Adenda 97). Punto de color + texto corto; opcionalmente clicable para
 * saltar a /agent?tab=mesh. SSR-safe (estado inicial estable).
 */

import Link from "next/link";
import { RadioTower } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMeshState } from "@/ai/astraura/mesh";

const STATUS_META: Record<string, { label: string; dot: string }> = {
  disconnected: { label: "Sin radio", dot: "bg-zinc-500" },
  connecting: { label: "Conectando…", dot: "bg-sky-400 animate-pulse" },
  configuring: { label: "Configurando…", dot: "bg-sky-400 animate-pulse" },
  ready: { label: "Malla activa", dot: "bg-emerald-400" },
  degraded: { label: "Malla débil", dot: "bg-amber-400" },
  reconnecting: { label: "Reconectando…", dot: "bg-amber-400 animate-pulse" },
  error: { label: "Error de radio", dot: "bg-rose-400" },
};

export function MeshStatusChip({ link = true, className }: { link?: boolean; className?: string }) {
  const state = useMeshState();
  const meta = STATUS_META[state.status] ?? STATUS_META.disconnected;
  const online = state.nodes.filter((n) => !n.isSelf && n.presence === "online").length;

  const body = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 transition-colors duration-200",
        link && "cursor-pointer hover:border-emerald-400/40 hover:text-white",
        className,
      )}
      title={`Red Mesh: ${meta.label}${online ? ` · ${online} nodos` : ""}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      <RadioTower className="h-3 w-3" />
      {meta.label}
      {state.status === "ready" && online > 0 ? <span className="text-emerald-300">· {online}</span> : null}
    </span>
  );

  if (!link) return body;
  return <Link href="/agent?tab=mesh">{body}</Link>;
}

export default MeshStatusChip;
