"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chat } from "@/ai/client/chat";
import { loadConfigs } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Send,
  Loader2,
  Paperclip,
  Wand2,
  Gavel,
  Clock,
  Users,
  Percent,
  Flag,
  Zap,
  Network,
  CalendarRange,
} from "lucide-react";
import { createProposal } from "@/lib/governance/engine";
import { COMMAND_TYPES, commandTypeById } from "@/lib/governance/commands";
import type { CensusMode, ReachQuorumMode, ReachTarget } from "@/lib/governance/reach";
import {
  URGENCY,
  uid,
  type Attachment,
  type AttachmentType,
  type CommandSpec,
  type DecisionParams,
  type ProposalOption,
  type Urgency,
} from "@/lib/governance/types";
import AffectedEntitiesPicker from "@/components/governance/affected-entities-picker";
import {
  attachPoliticalMeta,
  sendAffectedNotifications,
  DURATION_PRESETS,
  MIN_POLITICAL_VOTING_MINUTES,
  type AffectedEntity,
  type DurationPreset,
} from "@/lib/governance/political";

const ATTACH_TYPES: { id: AttachmentType; label: string }[] = [
  { id: "text", label: "Texto" },
  { id: "file", label: "Archivo (URL)" },
  { id: "app", label: "App" },
  { id: "link", label: "Enlace" },
  { id: "post", label: "Publicación" },
  { id: "program", label: "Programa" },
];

// Prefill opcional: permite sembrar el compositor desde un borrador (p.ej. el
// que produce PermissionGate vía proposalForChange). Es aditivo y opcional:
// cuando no se pasa, el compositor funciona exactamente igual que antes.
export type ProposalComposerInitial = {
  title?: string;
  description?: string;
  kind?: string;
  options?: ProposalOption[];
  attachments?: Attachment[];
  command?: CommandSpec;
  params?: Partial<DecisionParams>;
};

// Normaliza un payload de comando (valores arbitrarios) a strings, tal como los
// consume el compositor (commandPayload es Record<string, string>).
function payloadToStrings(payload?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!payload) return out;
  for (const [k, v] of Object.entries(payload)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

export default function ProposalComposer({
  scope,
  scopeRef,
  initial = {},
  onCreated,
  political = false,
}: {
  scope: string;
  scopeRef?: string;
  initial?: ProposalComposerInitial;
  onCreated?: (proposalId: string) => void;
  /** Revela los campos avanzados del Área Política: duración mínima 1 día,
   *  entidades "afecta a" y umbral de promoción de opciones dinámicas.
   *  Aditivo: por defecto es `false` y el compositor se comporta EXACTAMENTE
   *  igual que antes en el resto de superficies (grupos/páginas/decisiones). */
  political?: boolean;
}) {
  const [title, setTitle] = useState(() => initial.title ?? "");
  const [description, setDescription] = useState(() => initial.description ?? "");
  const [kind, setKind] = useState(() => initial.kind ?? "decision");

  const [options, setOptions] = useState<ProposalOption[]>(() => initial.options ?? []);
  const [attachments, setAttachments] = useState<Attachment[]>(() => initial.attachments ?? []);

  const [commandType, setCommandType] = useState(() => initial.command?.type ?? "none");
  const [commandPayload, setCommandPayload] = useState<Record<string, string>>(() =>
    payloadToStrings(initial.command?.payload),
  );

  const [urgency, setUrgency] = useState<Urgency>(() => initial.params?.urgency ?? "normal");
  const [votingMinutes, setVotingMinutes] = useState<number>(
    () => initial.params?.votingMinutes ?? URGENCY[initial.params?.urgency ?? "normal"].votingMinutes,
  );
  const [minParticipants, setMinParticipants] = useState<number>(
    () => initial.params?.minParticipants ?? 1,
  );
  const [minPercent, setMinPercent] = useState<number>(() => initial.params?.minPercent ?? 0);
  const [threshold, setThreshold] = useState<number>(() => initial.params?.threshold ?? 50);

  // Campos avanzados del Área Política (sólo se muestran/usan si `political`).
  const [affects, setAffects] = useState<AffectedEntity[]>([]);
  const [durationPreset, setDurationPreset] = useState<DurationPreset | null>(null);
  const [promoteThreshold, setPromoteThreshold] = useState<number>(3);

  // Alcance SUPRA-COMUNITARIO (federación) — opcional/aditivo. Si no se añaden
  // objetivos, la propuesta es de ámbito único (comportamiento clásico).
  const [reachTargets, setReachTargets] = useState<ReachTarget[]>([]);
  const [reachCensus, setReachCensus] = useState<CensusMode>("union");
  const [reachQuorum, setReachQuorum] = useState<ReachQuorumMode>("aggregate");

  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  // Re-sembrar el formulario cuando cambia la identidad del borrador `initial`,
  // sin pisar las ediciones del usuario en re-renders normales. Construimos una
  // clave estable a partir del contenido del borrador: sólo re-sembramos si esa
  // clave cambia (montaje incluido).
  const initialKey = useMemo(
    () =>
      JSON.stringify({
        t: initial.title ?? "",
        d: initial.description ?? "",
        k: initial.kind ?? "",
        o: initial.options ?? [],
        a: initial.attachments ?? [],
        c: initial.command ?? null,
        p: initial.params ?? null,
      }),
    [initial.title, initial.description, initial.kind, initial.options, initial.attachments, initial.command, initial.params],
  );
  const seededKey = useRef<string | null>(null);

  useEffect(() => {
    // No sembrar con un borrador vacío (uso clásico sin `initial`).
    if (initialKey === seededKey.current) return;
    const empty = JSON.stringify({ t: "", d: "", k: "", o: [], a: [], c: null, p: null });
    if (initialKey === empty) {
      seededKey.current = initialKey;
      return;
    }
    setTitle(initial.title ?? "");
    setDescription(initial.description ?? "");
    setKind(initial.kind ?? "decision");
    setOptions(initial.options ?? []);
    setAttachments(initial.attachments ?? []);
    setCommandType(initial.command?.type ?? "none");
    setCommandPayload(payloadToStrings(initial.command?.payload));
    const u = initial.params?.urgency ?? "normal";
    setUrgency(u);
    setVotingMinutes(initial.params?.votingMinutes ?? URGENCY[u].votingMinutes);
    setMinParticipants(initial.params?.minParticipants ?? 1);
    setMinPercent(initial.params?.minPercent ?? 0);
    setThreshold(initial.params?.threshold ?? 50);
    seededKey.current = initialKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const cmdDef = useMemo(() => commandTypeById(commandType), [commandType]);
  const hasProvider = useMemo(() => {
    try {
      return loadConfigs().some((c) => c.enabled);
    } catch {
      return false;
    }
  }, []);

  function applyUrgency(u: Urgency) {
    setUrgency(u);
    setVotingMinutes(URGENCY[u].votingMinutes);
  }

  function applyDurationPreset(preset: DurationPreset) {
    setDurationPreset(preset);
    setVotingMinutes(DURATION_PRESETS.find((p) => p.id === preset)?.minutes ?? MIN_POLITICAL_VOTING_MINUTES);
  }

  function addOption() {
    setOptions((prev) => [...prev, { id: uid(), label: "" }]);
  }
  function updateOption(id: string, label: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, label } : o)));
  }
  function removeOption(id: string) {
    setOptions((prev) => prev.filter((o) => o.id !== id));
  }

  function addAttachment() {
    setAttachments((prev) => [...prev, { type: "text", value: "" }]);
  }
  function updateAttachment(i: number, patch: Partial<Attachment>) {
    setAttachments((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function removeAttachment(i: number) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Federación: objetivos (ámbitos) que abarca una decisión supra-comunitaria.
  function addReachTarget() {
    setReachTargets((prev) => [...prev, { scope: "community", scopeRef: "" }]);
  }
  function updateReachTarget(i: number, patch: Partial<ReachTarget>) {
    setReachTargets((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function removeReachTarget(i: number) {
    setReachTargets((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function draftWithAstraura() {
    if (!hasProvider) {
      toast.error("Activa un proveedor de IA en Ajustes → IA & Modelos para usar a Astraura.");
      return;
    }
    if (!aiPrompt.trim()) {
      toast.error("Describe brevemente qué quieres proponer.");
      return;
    }
    setDrafting(true);
    try {
      const content = `Eres Astraura, asistente de gobernanza de StarSeed OS (ontocracia: soberanía y democracia).
Redacta una propuesta democrática clara a partir de esta idea: "${aiPrompt.trim()}".
Ámbito: ${scope}${scopeRef ? ` (ref ${scopeRef})` : ""}.
Devuelve EXCLUSIVAMENTE un JSON válido con esta forma:
{"title":"...","description":"...","options":["opción A","opción B"]}
- title: breve y concreto.
- description: 2-4 frases neutrales explicando la decisión.
- options: 0 a 5 variantes; deja [] si es un simple sí/no.`;
      const messages: ChatMessage[] = [{ role: "user", content }];
      const r = await chat({ messages, temperature: 0.5 });
      const raw = r.text || "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.title) setTitle(String(parsed.title));
        if (parsed.description) setDescription(String(parsed.description));
        if (Array.isArray(parsed.options)) {
          setOptions(
            parsed.options
              .filter((o: unknown) => typeof o === "string" && o.trim())
              .map((o: string) => ({ id: uid(), label: o })),
          );
        }
        toast.success("Borrador generado por Astraura");
      } else {
        if (!title) setTitle(aiPrompt.trim().slice(0, 80));
        setDescription(raw);
        toast.message("Astraura respondió en texto libre; revísalo.");
      }
    } catch {
      toast.error("Astraura no pudo redactar. Revisa tu proveedor de IA.");
    }
    setDrafting(false);
  }

  async function submit() {
    if (!title.trim()) {
      toast.error("Pon un título a la propuesta.");
      return;
    }
    setSaving(true);
    try {
      const command =
        commandType === "none"
          ? null
          : { type: commandType, payload: { ...commandPayload } };

      // Federación: sólo se incluye si hay objetivos con referencia válida.
      const validTargets = reachTargets.filter((t) => t.scope && t.scopeRef.trim());
      const reach =
        validTargets.length > 0
          ? { targets: validTargets, census: reachCensus, quorum: reachQuorum }
          : null;

      const effectiveVotingMinutes = political ? Math.max(votingMinutes, MIN_POLITICAL_VOTING_MINUTES) : votingMinutes;

      const res = await createProposal({
        scope,
        scopeRef: scopeRef || null,
        title,
        description,
        kind,
        options,
        attachments,
        command,
        params: { votingMinutes: effectiveVotingMinutes, minParticipants, minPercent, threshold, urgency },
        reach,
      });

      if (!res.ok) {
        toast.error(res.error ?? "No se pudo crear la propuesta.");
      } else {
        toast.success("Propuesta publicada y notificada");
        // Área Política (aditivo): adjunta afecta-a/umbral/duración y notifica a
        // las entidades etiquetadas. Best-effort: nunca bloquea ni rompe el alta.
        if (political && res.id) {
          const createdTitle = title;
          const createdAffects = affects;
          void attachPoliticalMeta(res.id, { affects: createdAffects, promoteThreshold, durationPreset });
          if (createdAffects.length > 0) {
            void sendAffectedNotifications(res.id, createdTitle, createdAffects);
          }
        }
        // reset
        setTitle("");
        setDescription("");
        setKind("decision");
        setOptions([]);
        setAttachments([]);
        setCommandType("none");
        setCommandPayload({});
        applyUrgency("normal");
        setMinParticipants(1);
        setMinPercent(0);
        setThreshold(50);
        setReachTargets([]);
        setReachCensus("union");
        setReachQuorum("aggregate");
        setAiPrompt("");
        setAffects([]);
        setDurationPreset(null);
        setPromoteThreshold(3);
        // notifica al panel para recargar
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("gov:proposal-created"));
        }
        // callback para integraciones (p.ej. cerrar diálogo de PermissionGate)
        if (res.id) onCreated?.(res.id);
      }
    } catch {
      toast.error("No se pudo crear la propuesta.");
    }
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 text-emerald-300" />
        <span className="text-sm font-semibold text-emerald-50">Nueva propuesta</span>
        <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-200/80">
          {scope}
          {scopeRef ? ` · ${scopeRef.slice(0, 8)}` : ""}
        </Badge>
      </div>

      {/* Astraura helper */}
      <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/10 p-3 space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-fuchsia-200/80">
          <Wand2 className="h-3.5 w-3.5" /> Redactar propuesta con Astraura
        </div>
        <div className="flex gap-2">
          <Input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe la idea a proponer…"
            className="h-9 border-white/15 bg-black/30 text-sm text-white placeholder:text-white/30"
          />
          <Button
            size="sm"
            className="gap-1.5 bg-fuchsia-600 text-white hover:bg-fuchsia-500"
            onClick={draftWithAstraura}
            disabled={drafting}
          >
            {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Redactar
          </Button>
        </div>
        {!hasProvider && (
          <p className="text-[10px] text-fuchsia-200/50">
            Activa un proveedor de IA en Ajustes → IA & Modelos para usar a Astraura.
          </p>
        )}
      </div>

      {/* Básicos */}
      <label className="block text-[11px] text-white/50">
        Título
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Cambiar el tema de la comunidad"
          className="mt-1 h-9 bg-white/5 text-sm"
        />
      </label>
      <label className="block text-[11px] text-white/50">
        Descripción
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explica qué se decide y por qué…"
          className="mt-1 min-h-[72px] border-white/10 bg-black/40 text-xs"
        />
      </label>
      <label className="block text-[11px] text-white/50">
        Tipo
        <Input
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          placeholder="decision / config / policy…"
          className="mt-1 h-8 bg-white/5 text-xs"
        />
      </label>

      {/* Opciones / variantes */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-white/50">Opciones / variantes</span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-emerald-300" onClick={addOption}>
            <Plus className="h-3.5 w-3.5" /> Añadir opción
          </Button>
        </div>
        {options.length === 0 ? (
          <p className="text-[10px] text-white/35">Sin opciones → votación Sí / No / Abstención.</p>
        ) : (
          <div className="space-y-1.5">
            {options.map((o, i) => (
              <div key={o.id} className="flex gap-2">
                <Input
                  value={o.label}
                  onChange={(e) => updateOption(o.id, e.target.value)}
                  placeholder={`Opción ${i + 1}`}
                  className="h-8 bg-white/5 text-xs"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-white/30 hover:text-red-400"
                  onClick={() => removeOption(o.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Adjuntos */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] text-white/50">
            <Paperclip className="h-3 w-3" /> Adjuntos
          </span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-cyan-300" onClick={addAttachment}>
            <Plus className="h-3.5 w-3.5" /> Añadir adjunto
          </Button>
        </div>
        {attachments.length === 0 ? (
          <p className="text-[10px] text-white/35">Adjunta contexto: texto, archivo, app, enlace, publicación o programa.</p>
        ) : (
          <div className="space-y-1.5">
            {attachments.map((a, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <select
                  value={a.type}
                  onChange={(e) => updateAttachment(i, { type: e.target.value as AttachmentType })}
                  className="h-8 rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
                >
                  {ATTACH_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <Input
                  value={a.value}
                  onChange={(e) => updateAttachment(i, { value: e.target.value })}
                  placeholder={a.type === "text" ? "Texto…" : a.type === "post" ? "ID de publicación" : "URL / referencia"}
                  className="h-8 flex-1 bg-white/5 text-xs"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-white/30 hover:text-red-400"
                  onClick={() => removeAttachment(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comando */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-white/50">
          <Zap className="h-3.5 w-3.5 text-amber-300" /> Comando a ejecutar si se aprueba
        </div>
        <select
          value={commandType}
          onChange={(e) => {
            setCommandType(e.target.value);
            setCommandPayload({});
          }}
          className="h-8 w-full rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
        >
          {COMMAND_TYPES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {cmdDef && <p className="text-[10px] text-white/40">{cmdDef.blurb}</p>}
        {(cmdDef?.fields ?? []).map((f) => (
          <div key={f.key}>
            {f.type === "textarea" ? (
              <Textarea
                value={commandPayload[f.key] ?? ""}
                onChange={(e) => setCommandPayload((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.label + (f.placeholder ? ` (${f.placeholder})` : "")}
                className="min-h-[56px] border-white/10 bg-black/40 text-xs"
              />
            ) : f.type === "select" ? (
              <select
                value={commandPayload[f.key] ?? ""}
                onChange={(e) => setCommandPayload((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="h-8 w-full rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
              >
                <option value="">{f.label}…</option>
                {(f.options ?? []).map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type={f.type === "number" ? "number" : "text"}
                value={commandPayload[f.key] ?? ""}
                onChange={(e) => setCommandPayload((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.label + (f.placeholder ? ` (${f.placeholder})` : "")}
                className="h-8 bg-white/5 text-xs"
              />
            )}
          </div>
        ))}
      </div>

      {/* Parámetros */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
        <div className="text-[11px] text-white/50">Parámetros de la decisión</div>
        <div>
          <div className="mb-1 flex items-center gap-1 text-[10px] text-white/40">
            <Flag className="h-3 w-3" /> Urgencia (define el tiempo de votación por defecto)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(URGENCY) as Urgency[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => applyUrgency(u)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  urgency === u ? URGENCY[u].color : "border-white/10 bg-white/5 text-white/60 hover:border-white/30",
                )}
              >
                {URGENCY[u].label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] text-white/40">
              <Clock className="h-3 w-3" /> Tiempo (min)
            </span>
            <Input
              type="number"
              value={votingMinutes}
              onChange={(e) => setVotingMinutes(Number(e.target.value))}
              className="h-8 bg-white/5 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] text-white/40">
              <Users className="h-3 w-3" /> Mín. participantes
            </span>
            <Input
              type="number"
              value={minParticipants}
              onChange={(e) => setMinParticipants(Number(e.target.value))}
              className="h-8 bg-white/5 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] text-white/40">
              <Percent className="h-3 w-3" /> % mínimo
            </span>
            <Input
              type="number"
              value={minPercent}
              onChange={(e) => setMinPercent(Number(e.target.value))}
              className="h-8 bg-white/5 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] text-white/40">
              <Gavel className="h-3 w-3" /> Umbral %
            </span>
            <Input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="h-8 bg-white/5 text-xs"
            />
          </label>
        </div>
      </div>

      {/* Área Política (aditivo, sólo si `political`): duración mínima 1 día,
          entidades afectadas y umbral de opciones dinámicas. */}
      {political && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/10 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-200/80">
            <CalendarRange className="h-3.5 w-3.5" /> Duración de la votación (política · mínimo 1 día)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyDurationPreset(p.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  durationPreset === p.id
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-50"
                    : "border-white/10 bg-white/5 text-white/60 hover:border-white/30",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {votingMinutes < MIN_POLITICAL_VOTING_MINUTES && (
            <p className="text-[10px] text-amber-300/70">
              Las decisiones políticas exigen un mínimo de 1 día de votación — se ajustará automáticamente al publicar.
            </p>
          )}

          <div className="text-[11px] text-emerald-200/80">¿Afecta a alguna entidad? (comunidades, E.F., partidos…)</div>
          <AffectedEntitiesPicker value={affects} onChange={setAffects} />

          <label className="block text-[11px] text-white/50">
            Umbral de promoción de opciones dinámicas (nº de "promociones" para que una alternativa propuesta pase a
            ser opción oficial de la votación)
            <Input
              type="number"
              min={1}
              value={promoteThreshold}
              onChange={(e) => setPromoteThreshold(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 h-8 w-24 bg-white/5 text-xs"
            />
          </label>
        </div>
      )}

      {/* Alcance supra-comunitario (federación) — opcional/aditivo */}
      <div className="rounded-lg border border-violet-500/20 bg-violet-950/10 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] text-violet-200/80">
            <Network className="h-3.5 w-3.5" /> Alcance supra-comunitario (federación) · opcional
          </span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-violet-300" onClick={addReachTarget}>
            <Plus className="h-3.5 w-3.5" /> Añadir ámbito
          </Button>
        </div>
        {reachTargets.length === 0 ? (
          <p className="text-[10px] text-white/35">
            Sin ámbitos → la decisión afecta sólo a este contexto. Añade comunidades/grupos/páginas para que la
            decisión abarque varios a la vez (censo por unión o intersección de sus miembros).
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              {reachTargets.map((t, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <select
                    value={t.scope}
                    onChange={(e) => updateReachTarget(i, { scope: e.target.value })}
                    className="h-8 rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
                  >
                    <option value="community">Comunidad</option>
                    <option value="page">Página</option>
                    <option value="group">Grupo</option>
                  </select>
                  <Input
                    value={t.scopeRef}
                    onChange={(e) => updateReachTarget(i, { scopeRef: e.target.value })}
                    placeholder="ID / slug del ámbito"
                    className="h-8 flex-1 bg-white/5 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-white/30 hover:text-red-400"
                    onClick={() => removeReachTarget(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-white/40">Censo elegible</span>
                <select
                  value={reachCensus}
                  onChange={(e) => setReachCensus(e.target.value as CensusMode)}
                  className="h-8 rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
                >
                  <option value="union">Unión (miembro de al menos uno)</option>
                  <option value="intersection">Intersección (miembro de todos)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-white/40">Quórum</span>
                <select
                  value={reachQuorum}
                  onChange={(e) => setReachQuorum(e.target.value as ReachQuorumMode)}
                  className="h-8 rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
                >
                  <option value="aggregate">Agregado (censo combinado)</option>
                  <option value="per_target">Por objetivo</option>
                </select>
              </label>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
          onClick={submit}
          disabled={saving || !title.trim()}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Publicar propuesta
        </Button>
      </div>
    </div>
  );
}
