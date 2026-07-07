"use client";

// StarSeed · Ontocracia — OPCIONES DINÁMICAS: cualquier participante puede
// proponer una alternativa; al superar el umbral de "promover" (configurable,
// por defecto simple), se añade como opción OFICIAL de la votación (pasa a
// `proposal.options` y entra en el recuento normal). Aditivo: vive sobre
// `params.political.pendingOptions` — ver src/lib/governance/political.ts.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Loader2, Plus, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { proposeDynamicOption, promoteOption, type PendingOption } from "@/lib/governance/political";

export function DynamicOptionsPanel({
  proposalId,
  pendingOptions,
  promoteThreshold,
  isClosed,
  onChange,
}: {
  proposalId: string;
  pendingOptions: PendingOption[];
  promoteThreshold: number;
  isClosed: boolean;
  onChange?: () => void;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function submit() {
    if (!label.trim()) {
      toast.error("Escribe la alternativa que propones.");
      return;
    }
    setBusy("new");
    const res = await proposeDynamicOption(proposalId, label);
    if (res.ok) {
      toast.success("Alternativa propuesta — puede promoverse a opción oficial");
      setLabel("");
      onChange?.();
    } else {
      toast.error(res.error ?? "No se pudo proponer la alternativa.");
    }
    setBusy(null);
  }

  async function promote(id: string) {
    setBusy(id);
    const res = await promoteOption(proposalId, id);
    if (res.ok) {
      toast.success(res.promoted ? "¡Alternativa promovida a opción oficial!" : "Voto de promoción registrado");
      onChange?.();
    } else {
      toast.error(res.error ?? "No se pudo registrar la promoción.");
    }
    setBusy(null);
  }

  if (isClosed && pendingOptions.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-950/10 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-violet-200/80">
        <Lightbulb className="h-3.5 w-3.5" /> Opciones dinámicas
        <Badge variant="outline" className="ml-auto text-[9px] border-violet-400/30 text-violet-200/70">
          umbral: {promoteThreshold} promoción{promoteThreshold === 1 ? "" : "es"}
        </Badge>
      </div>

      {pendingOptions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {pendingOptions.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px]"
            >
              <span className="text-white/80">{p.label}</span>
              <span className="text-white/35">propuesta por {p.proposedByLabel ?? "alguien"}</span>
              <span className="ml-auto flex items-center gap-1.5">
                <Badge variant="outline" className="text-[9px] border-violet-400/30 text-violet-200/70">
                  {p.promotedBy.length}/{promoteThreshold}
                </Badge>
                {!isClosed && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 border-violet-400/30 px-2 text-[10px] text-violet-200 hover:bg-violet-900/20"
                    disabled={busy === p.id}
                    onClick={() => promote(p.id)}
                  >
                    {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                    Promover
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {!isClosed && (
        <div className="mt-2 flex gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Propón una alternativa a votar…"
            className="h-8 bg-white/5 text-xs"
          />
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-violet-600 text-white hover:bg-violet-500"
            disabled={busy === "new"}
            onClick={submit}
          >
            {busy === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Proponer
          </Button>
        </div>
      )}
    </div>
  );
}

export default DynamicOptionsPanel;
