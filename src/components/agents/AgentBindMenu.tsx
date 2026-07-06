"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Agentes · AgentBindMenu  [P4]
 * ---------------------------------------------------------------------------
 * Menú para ATAR un agente Aurora+Astraura al "cerebro" de una ubicación
 * concreta del OS (page · group · post · message · widget · app · profile), en
 * ámbito público o privado. Muestra los vínculos existentes de ese target y
 * permite añadir/quitar. Persistencia vía el store de agentes (localStorage +
 * espejo de cuenta).
 *
 * Uso típico (desde la superficie que quiere un cerebro):
 *   <AgentBindMenu targetType="page" targetId={page.id} />
 *
 * Estética shadcn + Crystal Liquid Glass. SSR-safe y defensivo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as React from "react";
import { toast } from "sonner";
import { Bot, Link2, Unlink, Globe, Lock, ChevronDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Agent, AgentBinding, BindingScope, BindingTargetType } from "@/lib/agents/model";
import {
  listAgents,
  listBindings,
  bindAgent,
  unbindAgent,
  subscribeAgents,
} from "@/lib/agents/store";

const TARGET_LABELS: Record<BindingTargetType, string> = {
  page: "página",
  group: "grupo",
  post: "publicación",
  message: "mensaje",
  widget: "widget",
  app: "app",
  profile: "perfil",
};

export interface AgentBindMenuProps {
  targetType: BindingTargetType;
  targetId: string;
  /** Ámbito por defecto al abrir el menú. */
  defaultScope?: BindingScope;
  /** Variante del botón disparador. */
  buttonVariant?: "default" | "outline" | "secondary" | "ghost";
  /** Etiqueta corta opcional para el disparador. */
  label?: string;
  className?: string;
  /** Notifica cambios (bind/unbind) por si el padre quiere refrescar. */
  onChange?: () => void;
}

export function AgentBindMenu({
  targetType,
  targetId,
  defaultScope = "private",
  buttonVariant = "outline",
  label,
  className,
  onChange,
}: AgentBindMenuProps) {
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [bindings, setBindings] = React.useState<AgentBinding[]>([]);
  const [selectedAgent, setSelectedAgent] = React.useState<string>("");
  const [scope, setScope] = React.useState<BindingScope>(defaultScope);

  const refresh = React.useCallback(() => {
    setAgents(listAgents());
    setBindings(listBindings({ targetType, targetId }));
  }, [targetType, targetId]);

  React.useEffect(() => {
    refresh();
    const unsub = subscribeAgents(refresh);
    return unsub;
  }, [refresh]);

  const handleBind = () => {
    if (!selectedAgent) {
      toast.message("Elige un agente para atar.");
      return;
    }
    const created = bindAgent(selectedAgent, targetType, targetId, scope);
    if (created) {
      const a = agents.find((x) => x.id === selectedAgent);
      toast.success(`«${a?.name ?? "Agente"}» atado a este ${TARGET_LABELS[targetType]} (${scope}).`);
      setSelectedAgent("");
      refresh();
      onChange?.();
    } else {
      toast.error("No pude atar el agente.");
    }
  };

  const handleUnbind = (b: AgentBinding) => {
    const ok = unbindAgent(b.agentId, b.targetType, b.targetId, b.scope);
    if (ok) {
      toast.success("Vínculo retirado.");
      refresh();
      onChange?.();
    }
  };

  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const count = bindings.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={buttonVariant} size="sm" className={cn("gap-1.5", className)}>
          <Bot className="h-4 w-4" />
          {label ?? "Cerebro"}
          {count > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
              {count}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 p-3 space-y-3 border-foreground/10 bg-background/95 backdrop-blur-xl"
      >
        <div>
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Link2 className="h-4 w-4 text-primary" />
            Cerebro de {TARGET_LABELS[targetType]}
          </p>
          <p className="text-xs text-muted-foreground break-all">{targetId}</p>
        </div>

        {/* Vínculos existentes */}
        {bindings.length > 0 ? (
          <div className="space-y-1.5">
            {bindings.map((b) => (
              <div
                key={`${b.agentId}-${b.scope}`}
                className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background/40 px-2.5 py-1.5"
              >
                {b.scope === "public" ? (
                  <Globe className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{nameOf(b.agentId)}</span>
                <Badge variant="outline" className="text-[10px]">{b.scope}</Badge>
                <button
                  type="button"
                  onClick={() => handleUnbind(b)}
                  className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  aria-label="Desatar"
                  title="Desatar"
                >
                  <Unlink className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Ningún agente atado todavía. Elige uno abajo para que anime este {TARGET_LABELS[targetType]}.
          </p>
        )}

        {/* Añadir vínculo */}
        <div className="space-y-2 pt-1 border-t border-foreground/10">
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Elegir agente…" />
            </SelectTrigger>
            <SelectContent>
              {agents.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No hay agentes aún.</div>
              )}
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-foreground/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setScope("private")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 text-xs cursor-pointer transition-colors",
                  scope === "private" ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-foreground/5",
                )}
              >
                <Lock className="h-3 w-3" /> Privado
              </button>
              <button
                type="button"
                onClick={() => setScope("public")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 text-xs cursor-pointer transition-colors",
                  scope === "public" ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-foreground/5",
                )}
              >
                <Globe className="h-3 w-3" /> Público
              </button>
            </div>
            <Button size="sm" className="ml-auto gap-1" onClick={handleBind} disabled={!selectedAgent}>
              <Plus className="h-3.5 w-3.5" />
              Atar
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AgentBindMenu;
