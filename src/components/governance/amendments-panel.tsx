"use client";

// StarSeed · Ontocracia — EDICIÓN DEMOCRÁTICA: cambios a una propuesta se
// plantean como ENMIENDAS VOTABLES, con historial de versiones anteriores.
// Aditivo: vive sobre `params.political.amendments` / `.editHistory` — ver
// src/lib/governance/political.ts.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2, FilePenLine, History, Loader2, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { proposeAmendment, voteAmendment, type Amendment, type EditHistoryEntry } from "@/lib/governance/political";

export function AmendmentsPanel({
  proposalId,
  amendments,
  editHistory,
  isOpen,
  onChange,
}: {
  proposalId: string;
  amendments: Amendment[];
  editHistory: EditHistoryEntry[];
  isOpen: boolean;
  onChange?: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const pending = amendments.filter((a) => a.status === "pending");
  const resolved = amendments.filter((a) => a.status !== "pending");

  async function submit() {
    setBusy("new");
    const res = await proposeAmendment(proposalId, { title, description });
    if (res.ok) {
      toast.success("Enmienda propuesta — queda a votación");
      setTitle("");
      setDescription("");
      setShowForm(false);
      onChange?.();
    } else {
      toast.error(res.error ?? "No se pudo proponer la enmienda.");
    }
    setBusy(null);
  }

  async function vote(id: string, support: boolean) {
    setBusy(id + (support ? "-for" : "-against"));
    const res = await voteAmendment(proposalId, id, support);
    if (res.ok) {
      toast.success(res.applied ? "Enmienda aprobada y aplicada" : "Voto de enmienda registrado");
      onChange?.();
    } else {
      toast.error(res.error ?? "No se pudo votar la enmienda.");
    }
    setBusy(null);
  }

  if (amendments.length === 0 && editHistory.length === 0 && !isOpen) return null;

  return (
    <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-950/10 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-sky-200/80">
        <FilePenLine className="h-3.5 w-3.5" /> Edición democrática (enmiendas)
        {isOpen && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 px-2 text-[10px] text-sky-300"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancelar" : "Proponer enmienda"}
          </Button>
        )}
      </div>

      {showForm && (
        <div className="mt-2 space-y-1.5 rounded-md border border-white/10 bg-black/20 p-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nuevo título (opcional)"
            className="h-8 bg-white/5 text-xs"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Nueva descripción (opcional)"
            className="min-h-[56px] border-white/10 bg-black/30 text-xs"
          />
          <div className="flex justify-end">
            <Button size="sm" className="h-7 gap-1.5 bg-sky-600 text-white hover:bg-sky-500" disabled={busy === "new"} onClick={submit}>
              {busy === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Publicar enmienda
            </Button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {pending.map((a) => (
            <div key={a.id} className="rounded-md border border-white/10 bg-white/[0.03] p-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-white/70">Propuesta por {a.proposedByLabel ?? "alguien"}</span>
                <Badge variant="outline" className="text-[9px] border-sky-400/30 text-sky-200/70">
                  {a.votesFor.length} a favor · {a.votesAgainst.length} en contra
                </Badge>
              </div>
              {a.changes.title && (
                <p className="mt-1 text-white/80">
                  <span className="text-white/40">Nuevo título:</span> {a.changes.title}
                </p>
              )}
              {a.changes.description && (
                <p className="mt-0.5 text-white/60">
                  <span className="text-white/40">Nueva descripción:</span> {a.changes.description}
                </p>
              )}
              {isOpen && (
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 border-emerald-400/30 px-2 text-[10px] text-emerald-200 hover:bg-emerald-900/20"
                    disabled={busy === a.id + "-for"}
                    onClick={() => vote(a.id, true)}
                  >
                    <ThumbsUp className="h-3 w-3" /> A favor
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 border-red-400/30 px-2 text-[10px] text-red-200 hover:bg-red-900/20"
                    disabled={busy === a.id + "-against"}
                    onClick={() => vote(a.id, false)}
                  >
                    <ThumbsDown className="h-3 w-3" /> En contra
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(resolved.length > 0 || editHistory.length > 0) && (
        <details className="mt-2">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[10px] text-white/40 hover:text-white/60">
            <History className="h-3 w-3" /> Historial de enmiendas ({editHistory.length})
          </summary>
          <div className="mt-1.5 space-y-1.5">
            {resolved.map((a) => (
              <div key={a.id} className="flex items-start gap-1.5 rounded-md border border-white/5 bg-black/10 p-1.5 text-[10px]">
                {a.status === "approved" ? (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300" />
                ) : (
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-300" />
                )}
                <span className={cn("text-white/50", a.status === "approved" && "text-emerald-200/70")}>
                  {a.status === "approved" ? "Aprobada" : "Rechazada"} · {a.changes.title || a.changes.description || "cambio"} ·{" "}
                  {a.resolvedAt ? new Date(a.resolvedAt).toLocaleString("es-ES") : ""}
                </span>
              </div>
            ))}
            {editHistory.map((h, i) => (
              <div key={i} className="rounded-md border border-white/5 bg-black/10 p-1.5 text-[10px] text-white/40">
                Versión anterior ({new Date(h.editedAt).toLocaleString("es-ES")}): «{h.title}»
                {h.description ? ` — ${h.description.slice(0, 80)}` : ""}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default AmendmentsPanel;
