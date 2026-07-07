"use client";

// StarSeed · Ontocracia — Registro público VERIFICABLE de votos.
// Muestra el orden y una cadena de huellas SHA-256 (hash[i] depende de
// hash[i-1] + voto) sobre los votos públicos ya existentes: cualquier
// alteración u reordenación del historial rompe la cadena a partir de ese
// punto. Es una versión FUNCIONAL SIMPLE de "voto verificable": se calcula y
// se puede recalcular/comprobar en el cliente, pero NO está anclada todavía en
// un servidor/notario externo (ver MEJORAS PARA PRÓXIMO DESARROLLO). Honesto
// por diseño: lo decimos explícitamente en la propia UI.

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ChevronDown, ChevronRight, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeVoteChain, type VoteChainEntry } from "@/lib/governance/political";
import type { ProposalVote } from "@/lib/governance/types";

export function VerifiableVoteLog({ votes }: { votes: ProposalVote[] }) {
  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState<VoteChainEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const key = useMemo(() => votes.map((v) => `${v.voter}:${v.choice}:${v.created_at}`).join("|"), [votes]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBusy(true);
    computeVoteChain(votes).then((c) => {
      if (alive) {
        setChain(c);
        setBusy(false);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  if (votes.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-white/60 hover:text-white/85"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <ShieldCheck className="h-3 w-3 text-emerald-300/80" />
        Registro público verificable ({votes.length} voto{votes.length === 1 ? "" : "s"})
      </button>
      {open && (
        <div className="border-t border-white/10 px-2.5 py-2">
          <p className="mb-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-white/40">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Cada voto encadena una huella SHA-256 con la del voto anterior: alterar o reordenar el
            historial rompería la cadena. Se calcula aquí mismo, en tu navegador — es la versión simple
            del registro verificable (aún no ancla la cadena en un servidor externo).
          </p>
          {busy || !chain ? (
            <div className="flex items-center gap-2 py-2 text-[11px] text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando cadena…
            </div>
          ) : (
            <div className="space-y-1">
              {chain.map((entry) => (
                <div
                  key={entry.vote.voter + entry.vote.created_at}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1 text-[10px]"
                >
                  <span className="font-mono text-white/40">#{entry.index}</span>
                  <span className="text-white/70">
                    {entry.vote.display_name || (entry.vote.handle ? `@${entry.vote.handle}` : entry.vote.voter.slice(0, 8))}
                  </span>
                  <span className="text-emerald-300/80">{entry.vote.choice}</span>
                  <span className="text-white/35">{new Date(entry.vote.created_at).toLocaleString("es-ES")}</span>
                  <span className={cn("ml-auto truncate font-mono text-white/30")} title={entry.hash}>
                    {entry.hash.slice(0, 16)}…
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VerifiableVoteLog;
