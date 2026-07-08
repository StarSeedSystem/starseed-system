"use client";

/*
 * AuroraDesignerPanel — "Diseñar con Aurora": pide un prompt + objetivo
 * seleccionado, llama a `astrauraChat` (el MISMO router gratis-primero con
 * failover que usa el resto del sistema) con un system prompt que exige un
 * bloque ```json con el esquema de ElementOverride/ThemeTokens, parsea con
 * tolerancia TOTAL (nunca lanza, nunca aplica campos desconocidos — ver
 * `sanitizeOverridePatch`), muestra un DIFF antes de aplicar, y permite
 * deshacer. También puede pedir 3 variaciones de una vez.
 */

import React, { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Undo2, Check, X, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { astrauraChat } from "@/ai/astraura/router";
import type { ChatMessage } from "@/ai/providers/types";
import type { ElementFamily, ElementOverride } from "./types";
import { cloneOverride, diffVars, isDiffEmpty, mergeOverride, sanitizeOverridePatch } from "./property-defaults";

export interface AuroraDesignerPanelProps {
    family: ElementFamily;
    value: ElementOverride;
    onChange: (next: ElementOverride) => void;
}

interface PendingChange {
    patch: Partial<ElementOverride>;
    name?: string;
}

const THEME_SCHEMA = `{
  "vars": { "primary-hsl": "H S% L%", "secondary-hsl": "H S% L%", "accent-hsl": "H S% L%", "card-hsl": "H S% L%", "border-hsl": "H S% L%", "destructive-hsl": "H S% L%", "radius": "1.25rem" },
  "materialClass": "ss-crystal | ss-metal | ss-wood | none",
  "motion": 0
}`;

const ELEMENT_SCHEMA = `{
  "name": "nombre corto de esta propuesta",
  "vars": { "primary-hsl": "H S% L%", "accent-hsl": "H S% L%" },
  "materialClass": "ss-crystal | ss-metal | ss-wood | none",
  "radiusPx": 20,
  "shadow": [{ "x": 0, "y": 12, "blur": 30, "spread": -10, "color": "rgba(0,0,0,0.35)" }],
  "blurPx": 20,
  "opacity": 1,
  "border": { "widthPx": 1, "color": "rgba(255,255,255,0.16)", "glow": 0.2 },
  "typography": { "sizePx": 14, "weight": 600, "trackingEm": 0 },
  "padding": { "xPx": 24, "yPx": 12 },
  "animation": { "durationMs": 220, "easing": "ease-in-out | linear | ease | glide | spring", "hover": "none | sheen | lift | pulse | glow", "entry": "none | fade | scale | slide" }
}`;

function buildSystemPrompt(family: ElementFamily, current: ElementOverride, wantVariations: boolean): string {
    const schema = family === "theme" ? THEME_SCHEMA : ELEMENT_SCHEMA;
    const wrapped = wantVariations
        ? `{ "variations": [ ${schema}, ${schema}, ${schema} ] }  (EXACTAMENTE 3 propuestas distintas y con nombre)`
        : schema;
    return [
        "Eres la Diseñadora del Estudio Universal de Diseño de StarSeed OS (Aurora), estética 'Crystal Liquid Glass'.",
        `Elemento objetivo: "${family}".`,
        "Responde ÚNICAMENTE con un bloque ```json que contenga un objeto con este esquema (usa solo las claves que quieras cambiar — parcial está bien, NUNCA inventes claves nuevas ni escribas texto fuera del bloque):",
        "```json",
        wrapped,
        "```",
        "Colores SIEMPRE en formato HSL \"H S% L%\" (sin la función hsl(), sin #). Sé coherente con una estética cyberdelic/cristal elegante, nunca recargada.",
        `Estado actual del elemento (para refinar, no para repetir): ${JSON.stringify({
            vars: current.tokens.vars, materialClass: current.tokens.materialClass, radiusPx: current.radiusPx,
            shadow: current.shadow, blurPx: current.blurPx, border: current.border, typography: current.typography,
            padding: current.padding, animation: current.animation,
        })}`,
    ].join("\n");
}

function extractJson(text: string): unknown | null {
    const fence = /```json\s*([\s\S]*?)```/i.exec(text) ?? /```\s*([\s\S]*?)```/i.exec(text);
    const raw = fence ? fence[1] : text;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
        return JSON.parse(raw.slice(start, end + 1));
    } catch {
        return null;
    }
}

export function AuroraDesignerPanel({ family, value: o, onChange }: AuroraDesignerPanelProps) {
    const [prompt, setPrompt] = useState("");
    const [loading, setLoading] = useState<"" | "generate" | "variations">("");
    const [status, setStatus] = useState("");
    const [pending, setPending] = useState<PendingChange | null>(null);
    const [variations, setVariations] = useState<PendingChange[]>([]);
    const [history, setHistory] = useState<ElementOverride[]>([]);
    const [conversation, setConversation] = useState<ChatMessage[]>([]);
    const [rawError, setRawError] = useState("");

    async function ask(userPrompt: string, wantVariations: boolean) {
        if (!userPrompt.trim()) {
            toast.error("Escribe qué quieres que diseñe Aurora.");
            return;
        }
        setLoading(wantVariations ? "variations" : "generate");
        setStatus("");
        setRawError("");
        const sys = buildSystemPrompt(family, o, wantVariations);
        const messages: ChatMessage[] = [
            { role: "system", content: sys },
            ...conversation,
            { role: "user", content: userPrompt },
        ];
        const res = await astrauraChat({ messages, taskHint: "creative", onStatus: setStatus });
        setLoading("");
        setStatus("");
        const text = res.text ?? "";
        const parsed = extractJson(text);
        if (!parsed) {
            setRawError(text.slice(0, 600));
            toast.error("No se pudo interpretar la respuesta de Aurora como JSON.");
            return;
        }
        setConversation((prev) => [...prev, { role: "user", content: userPrompt } as ChatMessage, { role: "assistant", content: text } as ChatMessage].slice(-8));
        if (wantVariations) {
            const arr = Array.isArray((parsed as Record<string, unknown>)?.variations) ? (parsed as { variations: unknown[] }).variations : [];
            const vs: PendingChange[] = arr.slice(0, 3).map((v) => {
                const patch = sanitizeOverridePatch(v);
                return { patch, name: patch.name || "Variación" };
            });
            if (!vs.length) {
                toast.error("Aurora no devolvió variaciones válidas.");
                return;
            }
            setVariations(vs);
            setPending(null);
        } else {
            const patch = sanitizeOverridePatch(parsed);
            setPending({ patch, name: patch.name });
            setVariations([]);
        }
    }

    function applyPending(patch: Partial<ElementOverride>) {
        setHistory((h) => [...h, cloneOverride(o)].slice(-10));
        onChange(mergeOverride(o, patch));
        setPending(null);
        setVariations([]);
        toast.success("Aplicado — puedes deshacerlo con «Deshacer».");
    }

    function undo() {
        setHistory((h) => {
            if (!h.length) return h;
            const prev = h[h.length - 1];
            onChange(prev);
            return h.slice(0, -1);
        });
    }

    const diff = pending ? diffVars(o.tokens.vars, { ...o.tokens.vars, ...(pending.patch.tokens?.vars ?? {}) }) : null;
    const otherChanges: string[] = [];
    if (pending) {
        const p = pending.patch;
        if (p.radiusPx !== undefined) otherChanges.push(`radio ${p.radiusPx}px`);
        if (p.blurPx !== undefined) otherChanges.push(`blur ${p.blurPx}px`);
        if (p.opacity !== undefined) otherChanges.push(`opacidad ${p.opacity}`);
        if (p.border) otherChanges.push("borde/resplandor");
        if (p.typography) otherChanges.push("tipografía");
        if (p.padding) otherChanges.push("padding");
        if (p.animation) otherChanges.push("animación");
        if (p.shadow) otherChanges.push(`sombra (${p.shadow.length} capa/s)`);
        if (p.tokens?.materialClass !== undefined) otherChanges.push(`material: ${p.tokens.materialClass || "ninguno"}`);
    }

    return (
        <div className="space-y-3">
            <p className="text-xs text-white/40">
                Describe qué quieres para «{family}» — Aurora propone tokens/propiedades concretas (mismo router
                gratis-primero con failover del resto del sistema). Verás el cambio antes de aplicarlo.
            </p>
            <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="p.ej. «hazlo más cyberpunk, acentos magenta, bordes más afilados»"
                className="min-h-[70px] bg-white/[0.04] text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void ask(prompt, false)} disabled={loading !== ""} className="h-8 gap-1.5 bg-fuchsia-500/80 text-xs text-white hover:bg-fuchsia-500">
                    {loading === "generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Diseñar
                </Button>
                <Button size="sm" variant="outline" onClick={() => void ask(prompt || "propón variaciones interesantes", true)} disabled={loading !== ""} className="h-8 gap-1.5 text-xs">
                    {loading === "variations" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} 3 variaciones
                </Button>
                {history.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={undo} className="h-8 gap-1.5 text-xs text-white/50 hover:text-white/80">
                        <Undo2 className="h-3.5 w-3.5" /> Deshacer
                    </Button>
                )}
            </div>
            {loading && status && (
                <p className="flex items-center gap-1.5 text-[11px] text-fuchsia-200/80"><Loader2 className="h-3 w-3 animate-spin" /> {status}</p>
            )}

            {rawError && (
                <div className="space-y-1 rounded-lg border border-amber-400/25 bg-amber-400/10 p-2 text-[11px] text-amber-100/80">
                    <p>Aurora no devolvió JSON válido. Respuesta recibida:</p>
                    <p className="text-white/50">{rawError || "(vacío)"}</p>
                </div>
            )}

            {pending && diff && (
                <div className="space-y-2 rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3">
                    <p className="text-xs font-semibold text-cyan-100">Cambios propuestos{pending.name ? ` — ${pending.name}` : ""}</p>
                    {!isDiffEmpty(diff) && (
                        <ul className="space-y-0.5 text-[11px]">
                            {diff.added.map((d) => <li key={d.key} className="text-emerald-300">+ {d.key}: {d.after}</li>)}
                            {diff.changed.map((d) => <li key={d.key} className="text-amber-300">~ {d.key}: {d.before} → {d.after}</li>)}
                            {diff.removed.map((d) => <li key={`${d.key}-rm`} className="text-red-300">- {d.key}</li>)}
                        </ul>
                    )}
                    {otherChanges.length > 0 && <p className="text-[11px] text-white/50">También cambia: {otherChanges.join(", ")}.</p>}
                    {isDiffEmpty(diff) && otherChanges.length === 0 && <p className="text-[11px] text-white/40">Sin cambios detectables en esta propuesta.</p>}
                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => applyPending(pending.patch)} className="h-7 gap-1.5 bg-emerald-600 text-[11px] text-white hover:bg-emerald-500">
                            <Check className="h-3 w-3" /> Aplicar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setPending(null)} className="h-7 gap-1.5 text-[11px] text-white/50">
                            <X className="h-3 w-3" /> Descartar
                        </Button>
                    </div>
                </div>
            )}

            {variations.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                    {variations.map((v, i) => {
                        const swatches = Object.values(v.patch.tokens?.vars ?? {}).slice(0, 3);
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => applyPending(v.patch)}
                                className="rounded-lg border border-white/10 p-2 text-left transition-colors hover:border-fuchsia-400/40 hover:bg-fuchsia-400/5"
                            >
                                <div className="mb-1.5 flex h-8 overflow-hidden rounded">
                                    {swatches.length ? swatches.map((val, j) => <span key={j} className="flex-1" style={{ background: `hsl(${val})` }} />) : <span className="flex-1 bg-white/10" />}
                                </div>
                                <p className="truncate text-[10px] text-white/60">{v.name || `Variación ${i + 1}`}</p>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default AuroraDesignerPanel;
