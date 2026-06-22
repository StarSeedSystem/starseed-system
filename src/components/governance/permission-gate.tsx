"use client";

// StarSeed · PermissionGate — puerta de gobernanza para cambios reales.
// Si el contexto es jerárquico y el usuario es admin/owner → renderiza el
// control directo (children) con un sello "modo jerárquico". En cualquier otro
// caso (democrático, o sin rol de admin) → ofrece "Proponer cambio", que abre
// el ProposalComposer prefigurado para que el cambio se decida por votación.
//
// La opción democrática SIEMPRE está disponible: incluso un admin en modo
// jerárquico ve un enlace secundario "Proponerlo a votación".

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Crown, Scale, Vote, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import ProposalComposer from "@/components/governance/proposal-composer";
import {
  useGovernanceContext,
  proposalForChange,
  type ChangeRequest,
} from "@/lib/governance/permissions";
import { getConfig } from "@/lib/governance/config";
import type { GovernanceMode } from "@/lib/governance/types";

// Chip pequeño: ⚖️ Democrático / 👑 Jerárquico (lee config del contexto).
export function GovernanceModeBadge({
  scope,
  scopeRef,
  className,
}: {
  scope: string;
  scopeRef?: string;
  className?: string;
}) {
  const [mode, setMode] = useState<GovernanceMode | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;
    (async () => {
      try {
        const cfg = await getConfig(scope, scopeRef || null);
        if (alive) setMode(cfg.mode);
      } catch {
        /* SSR-guard */
      }
    })();
    return () => {
      alive = false;
    };
  }, [scope, scopeRef]);

  if (mode === null) {
    return (
      <Badge
        variant="outline"
        className={cn("text-[9px] border-white/15 text-white/40", className)}
      >
        gobernanza…
      </Badge>
    );
  }

  const hierarchical = mode === "hierarchical";
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[9px] gap-1",
        hierarchical
          ? "border-amber-400/40 text-amber-200 bg-amber-500/10"
          : "border-emerald-400/40 text-emerald-200 bg-emerald-500/10",
        className,
      )}
      title={
        hierarchical
          ? "Modo jerárquico — un admin puede decidir, pero cualquiera puede proponer a votación"
          : "Modo democrático — los cambios se deciden por votación"
      }
    >
      {hierarchical ? (
        <>
          <Crown className="w-2.5 h-2.5" /> Jerárquico
        </>
      ) : (
        <>
          <Scale className="w-2.5 h-2.5" /> Democrático
        </>
      )}
    </Badge>
  );
}

export function PermissionGate({
  scope,
  scopeRef,
  action,
  label,
  children,
  change,
  className,
}: {
  scope: string;
  scopeRef?: string;
  action?: string; // identificador del cambio (informativo)
  label?: string; // etiqueta legible del cambio
  children?: React.ReactNode; // control directo (modo jerárquico + admin)
  change: ChangeRequest; // descripción del cambio → propuesta
  className?: string;
}) {
  const { canActDirectly, mode, loading } = useGovernanceContext(scope, scopeRef);
  const [open, setOpen] = useState(false);

  const draft = useMemo(
    () => proposalForChange(scope, scopeRef || null, change),
    [scope, scopeRef, change],
  );

  // Borrador listo para sembrar el compositor: título, descripción y el comando
  // (con su payload ya serializado a strings por proposalForChange). Así el
  // cambio queda totalmente prefigurado, sin copiar/pegar manual.
  const composerInitial = useMemo(
    () => ({
      title: draft.title,
      description: draft.description,
      command: {
        type: draft.command.type,
        payload: { ...draft.command.payload, ...draft.payload },
      },
    }),
    [draft],
  );

  const actionLabel = label || change.label || action || "este cambio";

  function ProposeButton({
    variant = "solid",
    text,
  }: {
    variant?: "solid" | "link";
    text: string;
  }) {
    if (variant === "link") {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[10px] text-emerald-300/80 hover:text-emerald-200 underline underline-offset-2 inline-flex items-center gap-1"
        >
          <Vote className="w-3 h-3" /> {text}
        </button>
      );
    }
    return (
      <Button
        size="sm"
        className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-500"
        onClick={() => setOpen(true)}
      >
        <Vote className="w-3.5 h-3.5" /> {text}
      </Button>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {canActDirectly ? (
        // Jerárquico + admin: control directo + sello, y SIEMPRE la vía democrática.
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <GovernanceModeBadge scope={scope} scopeRef={scopeRef} />
            <Badge
              variant="outline"
              className="text-[9px] gap-1 border-amber-400/40 text-amber-200 bg-amber-500/10"
            >
              <Crown className="w-2.5 h-2.5" /> modo jerárquico · acción directa
            </Badge>
          </div>
          {children}
          <div className="flex items-center gap-1.5 text-[10px] text-white/40">
            <Sparkles className="w-3 h-3 text-emerald-300/70" />
            <span>La opción democrática siempre está disponible:</span>
            <ProposeButton variant="link" text="Proponerlo a votación" />
          </div>
        </div>
      ) : (
        // Democrático, o sin rol de admin: el cambio va a propuesta.
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <GovernanceModeBadge scope={scope} scopeRef={scopeRef} />
            {mode === "hierarchical" && !loading && (
              <Badge
                variant="outline"
                className="text-[9px] gap-1 border-white/15 text-white/50"
              >
                <Info className="w-2.5 h-2.5" /> no eres admin — propón a votación
              </Badge>
            )}
          </div>
          <ProposeButton text={"Proponer cambio: " + actionLabel} />
          <p className="text-[10px] text-white/40">
            En este contexto, {actionLabel} se decide por votación. Tu propuesta se
            aplicará automáticamente si la mayoría la aprueba.
          </p>
        </div>
      )}

      {/* Diálogo del compositor de propuestas, prefigurado para el cambio. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-100">
              <Vote className="w-4 h-4 text-emerald-300" /> Proponer a votación
            </DialogTitle>
            <DialogDescription className="text-white/60">
              {draft.title}
            </DialogDescription>
          </DialogHeader>

          {/* Aviso: el compositor ya viene prefigurado con el cambio (título,
              descripción y el comando con sus valores). Sólo hay que revisarlo
              y publicar; al aprobarse, el cambio se aplica solo. */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-200/80">
              <Sparkles className="w-3.5 h-3.5" /> Cambio prefigurado
            </div>
            <p className="mt-1 text-[10px] text-emerald-300/70">
              La propuesta ya viene rellenada con este cambio y el comando «
              {draft.command.type}» que se ejecutará al aprobarse. Revísala y
              publícala; puedes ajustar cualquier campo antes de enviar.
            </p>
          </div>

          <ProposalComposer
            key={draft.title + "|" + draft.command.type}
            scope={scope}
            scopeRef={scopeRef}
            initial={composerInitial}
            onCreated={() => {
              setOpen(false);
              toast.success("Propuesta creada");
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PermissionGate;
