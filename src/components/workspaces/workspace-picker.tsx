"use client";

/**
 * WorkspacePicker — "Añadir a espacio de trabajo…" (Adenda 76 · Agente G2).
 * Modal ligero: elige un espacio existente (o crea uno) y adjunta el recurso.
 * Usado por el menú contextual de chats/carpetas y por otras superficies.
 */

import { useState } from "react";
import { Boxes, Plus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWorkspaces } from "@/lib/workspaces/workspaces";

export interface WorkspaceAttach {
  chatIds?: string[];
  folderIds?: string[];
  fileRefs?: string[];
  memoryIds?: string[];
}

export function WorkspacePicker({
  open, onClose, attach, label, onDone,
}: {
  open: boolean;
  onClose: () => void;
  attach: WorkspaceAttach;
  /** Texto de lo que se adjunta (para el toast). */
  label?: string;
  onDone?: (wsId: string) => void;
}) {
  const { workspaces, create, attach: attachTo } = useWorkspaces();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const doAttach = async (wsId: string) => {
    setBusy(true);
    try {
      await attachTo(wsId, attach);
      toast.success(`Añadido${label ? ` «${label}»` : ""} al espacio`);
      onDone?.(wsId);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const doCreate = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const ws = await create({ name: n, ...attach });
      toast.success(`Espacio «${n}» creado`);
      onDone?.(ws.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm border-white/10 bg-black/90 text-white backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-light">
            <Boxes className="h-4 w-4 text-violet-300" /> Añadir a espacio de trabajo
          </DialogTitle>
          <DialogDescription className="text-[11px] text-white/50">
            Elige un espacio o crea uno nuevo. El recurso se vincula (no se duplica).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-56 space-y-1 overflow-y-auto">
          {workspaces.length === 0 && !creating && (
            <p className="rounded-lg border border-white/5 px-3 py-3 text-center text-[11px] text-white/35">
              Aún no tienes espacios. Crea el primero.
            </p>
          )}
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => void doAttach(w.id)}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:bg-white/10 cursor-pointer"
            >
              <span className="text-base leading-none">{w.icon || "🗂️"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-white/90">{w.name}</span>
                <span className="block truncate text-[10px] text-white/40">
                  {w.chatIds.length} chats · {w.folderIds.length} folders · {w.fileRefs.length} archivos
                </span>
              </span>
              <Check className="h-3.5 w-3.5 shrink-0 text-white/20" />
            </button>
          ))}
        </div>

        {creating ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void doCreate();
                if (e.key === "Escape") setCreating(false);
              }}
              placeholder="Nombre del espacio…"
              className="h-8 border-white/10 bg-black/40 text-xs"
            />
            <Button size="sm" className="h-8 text-[11px]" onClick={() => void doCreate()} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Crear"}
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/20 px-3 py-2 text-[11px] text-white/50",
              "hover:border-violet-400/40 hover:text-violet-200 cursor-pointer",
            )}
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo espacio
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default WorkspacePicker;
