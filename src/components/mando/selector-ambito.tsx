"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Ambito = { id: string; nombre: string; tipo: string; visibilidad: string; entidad_tipo?: string };
type AmbitosResp = { persona: Ambito[]; grupos: Ambito[]; paginas: Ambito[] };

function badgeColor(v: string) {
  if (v === "publico") return "text-emerald-300 border-emerald-500/30";
  if (v === "miembros") return "text-amber-300 border-amber-500/30";
  return "text-zinc-400 border-zinc-600/40";
}

export function SelectorAmbito() {
  const [data, setData] = useState<AmbitosResp | null>(null);
  const params = useSearchParams();
  const actual = params.get("ambito") || "local";
  const habilitado = process.env.NEXT_PUBLIC_STARSEED_MANDO_TODOS === "1";

  useEffect(() => {
    if (!habilitado) return;
    fetch("/api/mando/ambitos", { cache: "no-store" })
      .then(r => r.json())
      .then(setData);
  }, [habilitado]);

  if (!habilitado || !data) return null;
  const normalized = Array.isArray(data)
    ? { persona: data, grupos: [], paginas: [] }
    : data;
  const total = normalized.persona.length + normalized.grupos.length + normalized.paginas.length;
  if (total <= 1) return null;

  const renderGrupo = (titulo: string, items: Ambito[]) => items.length ? (
    <div key={titulo} className="mb-3">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500">{titulo}</div>
      <ul role="listbox" aria-label={titulo} className="space-y-0.5">
        {items.map(a => (
          <li key={a.id}>
            <a
              role="option"
              aria-selected={a.id === actual}
              href={`/mando?ambito=${encodeURIComponent(a.id)}`}
              className={`cursor-pointer block rounded px-2 py-1 text-xs flex items-center justify-between hover:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-violet-400/60 ${a.id===actual?"bg-zinc-800":""}`}
            >
              <span>{a.nombre}</span>
              <span className={`ml-2 rounded border px-1 py-0.5 text-[9px] ${badgeColor(a.visibilidad)}`}>{a.visibilidad}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  return (
    <div className="rounded-lg border border-violet-500/20 bg-zinc-900 p-2" data-testid="selector-ambito">
      {renderGrupo("Mi Genesis", normalized.persona)}
      {renderGrupo("Mis grupos", normalized.grupos)}
      {renderGrupo("Mis páginas", normalized.paginas)}
    </div>
  );
}
