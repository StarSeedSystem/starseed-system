"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Agentes · AgentConfigPanel  [P5]
 * ---------------------------------------------------------------------------
 * Panel para CREAR / EDITAR un agente Aurora+Astraura: nombre, icono, persona
 * (system-prompt), CAPACIDADES (elegidas del manifiesto vivo de skills.ts),
 * preferencias de modelo y visibilidad (privado ↔ público). Acciones de ciclo
 * de vida: Guardar (crear/actualizar), Actualizar versión, Replicar, Ramificar
 * y Compartir a lo público.
 *
 * Estética: shadcn + Crystal Liquid Glass (Card líquida, botones redondeados,
 * transiciones suaves, iconos Lucide — nunca emojis como iconos, CLAUDE.md §8).
 *
 * Solo LEE el manifiesto de capacidades (SKILL_CAPABILITIES) de skills.ts; no
 * lo modifica. Toda la persistencia va por el store de agentes (localStorage +
 * espejo de cuenta). SSR-safe y defensivo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as React from "react";
import { toast } from "sonner";
import {
  Bot,
  Save,
  Copy,
  GitBranch,
  ArrowUpCircle,
  Share2,
  Globe,
  Lock,
  Sparkles,
  Check,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

import { SKILL_CAPABILITIES } from "@/ai/astraura/skills";
import type { Agent, AgentVisibility } from "@/lib/agents/model";
import {
  createAgent,
  updateAgent,
  updateAgentVersion,
  replicateAgent,
  branchAgent,
  shareAgentPublic,
  isBuiltinAgent,
  type AgentDraft,
} from "@/lib/agents/store";

/* ── Estado editable local del formulario ── */
interface FormState {
  name: string;
  description: string;
  persona: string;
  icon: string;
  capabilities: string[];
  visibility: AgentVisibility;
  preferStrong: boolean;
  temperature: number;
}

function agentToForm(a?: Agent | null): FormState {
  return {
    name: a?.name ?? "",
    description: a?.description ?? "",
    persona: a?.persona ?? "",
    icon: a?.icon ?? "Bot",
    capabilities: a ? [...a.capabilities] : [],
    visibility: a?.visibility ?? "private",
    preferStrong: a?.model?.preferStrong ?? false,
    temperature: typeof a?.model?.temperature === "number" ? a.model.temperature : 0.7,
  };
}

function formToDraft(f: FormState): AgentDraft {
  return {
    name: f.name.trim() || "Agente sin nombre",
    description: f.description.trim(),
    persona: f.persona.trim(),
    icon: f.icon.trim() || "Bot",
    capabilities: f.capabilities,
    visibility: f.visibility,
    model: {
      preferStrong: f.preferStrong,
      temperature: f.temperature,
    },
  };
}

export interface AgentConfigPanelProps {
  /** Agente a editar; omite para CREAR uno nuevo. */
  agent?: Agent | null;
  /** Llamado tras guardar/replicar/ramificar con el agente resultante. */
  onSaved?: (agent: Agent) => void;
  /** Llamado al cancelar (opcional). */
  onCancel?: () => void;
  className?: string;
}

export function AgentConfigPanel({ agent, onSaved, onCancel, className }: AgentConfigPanelProps) {
  const editingBuiltin = !!agent && isBuiltinAgent(agent.id);
  const isNew = !agent;
  const [form, setForm] = React.useState<FormState>(() => agentToForm(agent));

  // Re-hidrata si cambia el agente entrante.
  React.useEffect(() => {
    setForm(agentToForm(agent));
  }, [agent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleCapability = (id: string) =>
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(id)
        ? f.capabilities.filter((c) => c !== id)
        : [...f.capabilities, id],
    }));

  /* ── Acciones ── */
  const handleSave = () => {
    try {
      if (isNew) {
        const created = createAgent(formToDraft(form));
        toast.success(`Agente «${created.name}» creado.`);
        onSaved?.(created);
        return;
      }
      if (editingBuiltin) {
        // Los builtins no se editan in situ: se replican con los cambios.
        const copy = replicateAgent(agent!, formToDraft(form));
        if (copy) {
          toast.success(`Copia editable «${copy.name}» guardada en tu biblioteca.`);
          onSaved?.(copy);
        }
        return;
      }
      const updated = updateAgent(agent!.id, {
        name: form.name.trim() || "Agente sin nombre",
        description: form.description.trim(),
        persona: form.persona.trim(),
        icon: form.icon.trim() || "Bot",
        capabilities: form.capabilities,
        visibility: form.visibility,
        model: { preferStrong: form.preferStrong, temperature: form.temperature },
      });
      if (updated) {
        toast.success(`Agente «${updated.name}» actualizado.`);
        onSaved?.(updated);
      }
    } catch {
      toast.error("No pude guardar el agente.");
    }
  };

  const handleBumpVersion = () => {
    if (!agent || editingBuiltin) return;
    const updated = updateAgentVersion(agent.id);
    if (updated) {
      toast.success(`Versión subida a ${updated.version}.`);
      onSaved?.(updated);
    }
  };

  const handleReplicate = () => {
    if (!agent) return;
    const copy = replicateAgent(agent, formToDraft(form));
    if (copy) {
      toast.success(`«${agent.name}» replicado como copia editable.`);
      onSaved?.(copy);
    }
  };

  const handleBranch = () => {
    if (!agent) return;
    const branch = branchAgent(agent, formToDraft(form));
    if (branch) {
      toast.success(`Rama de «${agent.name}» creada (parentId enlazado).`);
      onSaved?.(branch);
    }
  };

  const handleShare = () => {
    if (!agent) {
      toast.message("Guarda el agente antes de compartirlo.");
      return;
    }
    const rec = shareAgentPublic(agent.id);
    if (rec) {
      toast.success("Agente compartido a lo público (registro local; la red real llegará pronto).");
      set("visibility", "public");
      onSaved?.(rec.agent);
    }
  };

  return (
    <Card liquid crystalTheme="cosmic" className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Bot className="h-5 w-5 text-primary" />
          {isNew ? "Nuevo agente" : editingBuiltin ? "Personalizar agente de fábrica" : "Editar agente"}
        </CardTitle>
        <CardDescription>
          {editingBuiltin
            ? "Este es un agente de fábrica: al guardar se creará una copia editable en tu biblioteca."
            : "Define la persona, las capacidades y las preferencias del cerebro Aurora+Astraura."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Identidad */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="agent-name">Nombre</Label>
            <Input
              id="agent-name"
              value={form.name}
              placeholder="Aurora · Guía"
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-icon">Icono (Lucide)</Label>
            <Input
              id="agent-icon"
              value={form.icon}
              placeholder="Sparkles"
              onChange={(e) => set("icon", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-desc">Descripción</Label>
          <Input
            id="agent-desc"
            value={form.description}
            placeholder="Qué hace este agente en una línea."
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        {/* Persona (system-prompt) */}
        <div className="space-y-2">
          <Label htmlFor="agent-persona" className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Persona (system-prompt)
          </Label>
          <Textarea
            id="agent-persona"
            value={form.persona}
            rows={6}
            placeholder="Eres Aurora, la guía contextual de StarSeed. Tu lealtad es con la persona usuaria…"
            onChange={(e) => set("persona", e.target.value)}
            className="resize-y min-h-[140px] font-medium leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            Este texto se antepone al cerebro antes de llamar al modelo. Define voz, rol y límites.
          </p>
        </div>

        {/* Capacidades (del manifiesto vivo de skills.ts) */}
        <div className="space-y-2">
          <Label>Capacidades de Aurora</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SKILL_CAPABILITIES.map((cap) => {
              const active = form.capabilities.includes(cap.id);
              return (
                <button
                  key={cap.id}
                  type="button"
                  onClick={() => toggleCapability(cap.id)}
                  className={cn(
                    "flex items-start gap-2 rounded-xl border p-3 text-left cursor-pointer transition-all duration-200",
                    active
                      ? "border-primary/60 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
                      : "border-foreground/10 hover:border-foreground/25 bg-background/40",
                  )}
                  aria-pressed={active}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30",
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{cap.label}</span>
                    <span className="block text-xs text-muted-foreground line-clamp-2">{cap.systemPrompt}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {form.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {form.capabilities.map((id) => (
                <Badge key={id} variant="secondary" className="text-[11px]">
                  {id}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Preferencias de modelo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between rounded-xl border border-foreground/10 p-3 bg-background/40">
            <div className="space-y-0.5">
              <Label htmlFor="agent-strong" className="cursor-pointer">Preferir modelos fuertes</Label>
              <p className="text-xs text-muted-foreground">Para tareas difíciles (Astraura sigue gratis-primero).</p>
            </div>
            <Switch
              id="agent-strong"
              checked={form.preferStrong}
              onCheckedChange={(v) => set("preferStrong", v)}
            />
          </div>
          <div className="space-y-2 rounded-xl border border-foreground/10 p-3 bg-background/40">
            <div className="flex items-center justify-between">
              <Label htmlFor="agent-temp" className="cursor-pointer">Creatividad</Label>
              <span className="text-xs font-mono text-muted-foreground">{form.temperature.toFixed(2)}</span>
            </div>
            <input
              id="agent-temp"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={form.temperature}
              onChange={(e) => set("temperature", Number(e.target.value))}
              className="w-full accent-primary cursor-pointer"
            />
          </div>
        </div>

        {/* Visibilidad */}
        <div className="flex items-center justify-between rounded-xl border border-foreground/10 p-3 bg-background/40">
          <div className="flex items-center gap-2">
            {form.visibility === "public" ? (
              <Globe className="h-4 w-4 text-emerald-400" />
            ) : (
              <Lock className="h-4 w-4 text-muted-foreground" />
            )}
            <div className="space-y-0.5">
              <Label htmlFor="agent-visibility" className="cursor-pointer">
                {form.visibility === "public" ? "Público" : "Privado"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {form.visibility === "public"
                  ? "Visible como agente compartido a la red social."
                  : "Solo en tu biblioteca soberana."}
              </p>
            </div>
          </div>
          <Switch
            id="agent-visibility"
            checked={form.visibility === "public"}
            onCheckedChange={(v) => set("visibility", v ? "public" : "private")}
          />
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button onClick={handleSave} className="gap-1.5">
            <Save className="h-4 w-4" />
            {isNew ? "Crear agente" : editingBuiltin ? "Guardar como copia" : "Guardar"}
          </Button>

          {!isNew && !editingBuiltin && (
            <Button variant="outline" onClick={handleBumpVersion} className="gap-1.5">
              <ArrowUpCircle className="h-4 w-4" />
              Subir versión
            </Button>
          )}

          {!isNew && (
            <>
              <Button variant="outline" onClick={handleReplicate} className="gap-1.5">
                <Copy className="h-4 w-4" />
                Replicar
              </Button>
              <Button variant="outline" onClick={handleBranch} className="gap-1.5">
                <GitBranch className="h-4 w-4" />
                Ramificar
              </Button>
              <Button variant="secondary" onClick={handleShare} className="gap-1.5">
                <Share2 className="h-4 w-4" />
                Compartir
              </Button>
            </>
          )}

          {onCancel && (
            <Button variant="ghost" onClick={onCancel} className="ml-auto">
              Cancelar
            </Button>
          )}
        </div>

        {agent?.version && (
          <p className="text-[11px] text-muted-foreground">
            Versión actual: {agent.version}
            {agent.parentId ? ` · rama de ${agent.parentId}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default AgentConfigPanel;
