"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Astraura — Sugerencias proactivas para tu dashboard (Módulo 1)
//
// Affordance aditiva: un botón/tarjeta que invoca a Astraura (vía `chat()`) con
// el contexto de los widgets actuales del tablero y propone widgets concretos del
// catálogo real o una plantilla (p. ej. "Dashboard del Estudiante"). Las
// propuestas se validan contra el catálogo (`WIDGET_CATEGORY_MAP` /
// `ALL_DASHBOARD_TEMPLATES`) antes de ofrecerlas, de modo que un clic siempre
// añade un widget válido o crea un tablero a partir de una plantilla existente.
//
// Degradación elegante: si no hay ningún proveedor de IA activado (`loadConfigs`),
// se ofrece una heurística local (widgets populares aún no presentes) para que la
// función siga siendo útil sin IA. Cualquier fallo de red/proveedor cae también a
// la heurística sin romper el dashboard.
//
// 100% client-side · SSR-safe · NO toca el motor del workspace.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from "react";
import { Sparkles, Wand2, Plus, LayoutTemplate, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import type { DashboardWidget, WidgetType } from "./dashboard-types";
import { WIDGET_CATEGORY_MAP, ALL_DASHBOARD_TEMPLATES } from "./dashboard-defaults";
import { WIDGET_MANIFEST } from "./widget-manifest";
import { getCategoryById, type WidgetCategory } from "./widget-categories";

// La importación de la IA es perezosa (dynamic import) para no acoplar el bundle
// del dashboard al cliente de IA ni a su almacén de proveedores.

// ── Tipos de propuesta ───────────────────────────────────────────
interface WidgetSuggestion {
    kind: "widget";
    type: WidgetType;
    label: string;
    reason: string;
}
interface TemplateSuggestion {
    kind: "template";
    categoryId: WidgetCategory;
    name: string;
    reason: string;
}
type Suggestion = WidgetSuggestion | TemplateSuggestion;

interface AiSuggestionsProps {
    /** Widgets del tablero activo (para construir el contexto). */
    widgets: DashboardWidget[];
    /** Nombre del tablero activo (contexto humano para Astraura). */
    dashboardName?: string;
    /** Añade un widget al tablero activo. */
    onAddWidget: (type: WidgetType) => void;
    /** Crea un tablero nuevo a partir de una categoría/plantilla. */
    onCreateFromTemplate?: (categoryId: WidgetCategory, name: string) => void;
    /** Estilo del disparador: tarjeta (por defecto) o botón compacto. */
    variant?: "card" | "button";
    className?: string;
}

// Mapa rápido tipo→etiqueta legible (del manifest, con respaldo).
function labelFor(type: WidgetType): string {
    return WIDGET_MANIFEST[type]?.label || String(type).replace(/_/g, " ");
}

// Heurística local: widgets populares del catálogo que aún no están presentes.
function localFallbackSuggestions(present: Set<WidgetType>): WidgetSuggestion[] {
    return WIDGET_CATEGORY_MAP
        .filter((w) => w.isPopular && !present.has(w.type))
        .slice(0, 6)
        .map((w) => ({
            kind: "widget" as const,
            type: w.type,
            label: labelFor(w.type),
            reason: `Popular en ${getCategoryById(w.primaryCategory)?.label ?? w.primaryCategory}`,
        }));
}

// Validación estricta de la respuesta de la IA contra el catálogo real.
function parseAiSuggestions(raw: string, present: Set<WidgetType>): Suggestion[] {
    if (!raw) return [];
    // Intentamos extraer el primer bloque JSON del texto (la IA a veces lo envuelve).
    let jsonText = raw.trim();
    const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) jsonText = fenced[1].trim();
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) jsonText = jsonText.slice(start, end + 1);

    let data: any;
    try {
        data = JSON.parse(jsonText);
    } catch {
        return [];
    }

    const validTypes = new Set(WIDGET_CATEGORY_MAP.map((w) => w.type));
    const validCats = new Set(ALL_DASHBOARD_TEMPLATES.map((t) => t.categoryId));
    const out: Suggestion[] = [];

    if (Array.isArray(data?.widgets)) {
        for (const w of data.widgets) {
            const type = String(w?.type || "").toUpperCase() as WidgetType;
            if (validTypes.has(type) && !present.has(type)) {
                out.push({
                    kind: "widget",
                    type,
                    label: labelFor(type),
                    reason: String(w?.reason || "Sugerido por Astraura").slice(0, 140),
                });
            }
        }
    }
    if (Array.isArray(data?.templates)) {
        for (const t of data.templates) {
            const categoryId = String(t?.categoryId || "") as WidgetCategory;
            if (validCats.has(categoryId)) {
                const tpl = ALL_DASHBOARD_TEMPLATES.find((x) => x.categoryId === categoryId);
                out.push({
                    kind: "template",
                    categoryId,
                    name: String(t?.name || tpl?.name || categoryId).slice(0, 60),
                    reason: String(t?.reason || "Plantilla sugerida por Astraura").slice(0, 140),
                });
            }
        }
    }
    // Eliminamos duplicados de widgets por tipo.
    const seen = new Set<string>();
    return out.filter((s) => {
        const key = s.kind === "widget" ? `w:${s.type}` : `t:${s.categoryId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function DashboardAiSuggestions({
    widgets,
    dashboardName,
    onAddWidget,
    onCreateFromTemplate,
    variant = "card",
    className,
}: AiSuggestionsProps) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [usedAi, setUsedAi] = useState(false);
    const [added, setAdded] = useState<Set<string>>(new Set());
    const [note, setNote] = useState<string | null>(null);

    const presentTypes = useMemo(
        () => new Set(widgets.map((w) => w.widget_type)),
        [widgets],
    );

    const runSuggestions = useCallback(async () => {
        setLoading(true);
        setNote(null);
        setAdded(new Set());
        try {
            // ¿Hay proveedor de IA activado? (degradación elegante)
            const { loadConfigs } = await import("@/ai/client/providerStore");
            const configs = loadConfigs();
            const hasProvider = Array.isArray(configs) && configs.some((c) => c.enabled);

            if (!hasProvider) {
                setUsedAi(false);
                setNote(
                    "No hay un proveedor de IA activado. Mostrando sugerencias locales basadas en widgets populares. Actívalo en Ajustes → IA & Modelos para sugerencias personalizadas de Astraura.",
                );
                setSuggestions(localFallbackSuggestions(presentTypes));
                return;
            }

            // Catálogo compacto para el prompt (tipo + etiqueta + categoría + tags).
            const catalog = WIDGET_CATEGORY_MAP.map((w) => ({
                type: w.type,
                label: labelFor(w.type),
                category: w.primaryCategory,
                tags: w.tags.slice(0, 5),
            }));
            const templates = ALL_DASHBOARD_TEMPLATES.map((t) => ({
                categoryId: t.categoryId,
                name: t.name,
            }));
            const current = Array.from(presentTypes).map((t) => labelFor(t));

            const system =
                "Eres Astraura, la inteligencia exocórtex de StarSeed OS. Propones de forma proactiva widgets y plantillas para el dashboard del usuario. " +
                "Responde EXCLUSIVAMENTE con un objeto JSON válido (sin texto adicional, sin markdown) con esta forma: " +
                '{"widgets":[{"type":"WIDGET_TYPE","reason":"breve motivo en español"}],"templates":[{"categoryId":"categoria","name":"Nombre del tablero","reason":"motivo"}]}. ' +
                "Usa SOLO valores de `type` que existan en el catálogo proporcionado y SOLO `categoryId` que existan en las plantillas. " +
                "Sugiere 4-6 widgets que el usuario aún NO tenga y, opcionalmente, 1 plantilla coherente (p. ej. un 'Dashboard del Estudiante' usando la categoría 'educacion'). Sé breve y útil.";

            const userMsg =
                `Tablero actual: "${dashboardName ?? "Dashboard"}".\n` +
                `Widgets ya presentes: ${current.length ? current.join(", ") : "(ninguno)"}.\n\n` +
                `Catálogo de widgets disponibles (JSON): ${JSON.stringify(catalog)}\n\n` +
                `Plantillas disponibles (JSON): ${JSON.stringify(templates)}\n\n` +
                "Devuelve el JSON de sugerencias.";

            const { chat } = await import("@/ai/client/chat");
            const res = await chat({
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: userMsg },
                ],
                temperature: 0.4,
                maxTokens: 700,
            });

            const parsed = parseAiSuggestions(res?.text ?? "", presentTypes);
            if (parsed.length === 0) {
                setUsedAi(false);
                setNote(
                    "Astraura respondió, pero no pudimos interpretar sugerencias válidas. Mostrando una selección local.",
                );
                setSuggestions(localFallbackSuggestions(presentTypes));
            } else {
                setUsedAi(true);
                setSuggestions(parsed);
            }
        } catch (err) {
            // Degradación: cualquier error → heurística local, sin romper nada.
            setUsedAi(false);
            setNote(
                "No se pudo contactar al proveedor de IA. Mostrando sugerencias locales basadas en widgets populares.",
            );
            setSuggestions(localFallbackSuggestions(presentTypes));
        } finally {
            setLoading(false);
        }
    }, [presentTypes, dashboardName]);

    const handleOpen = useCallback(() => {
        setOpen(true);
        // Lanza la generación al abrir si aún no hay nada.
        if (suggestions.length === 0 && !loading) void runSuggestions();
    }, [suggestions.length, loading, runSuggestions]);

    const handleAddWidget = useCallback(
        (s: WidgetSuggestion) => {
            onAddWidget(s.type);
            setAdded((prev) => new Set(prev).add(`w:${s.type}`));
            toast({ title: "Widget añadido", description: `"${s.label}" se añadió a tu dashboard.` });
        },
        [onAddWidget, toast],
    );

    const handleAddTemplate = useCallback(
        (s: TemplateSuggestion) => {
            if (!onCreateFromTemplate) return;
            onCreateFromTemplate(s.categoryId, s.name);
            setAdded((prev) => new Set(prev).add(`t:${s.categoryId}`));
            setOpen(false);
        },
        [onCreateFromTemplate],
    );

    return (
        <>
            {variant === "card" ? (
                <button
                    type="button"
                    onClick={handleOpen}
                    className={cn(
                        "group relative w-full overflow-hidden rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 via-purple-500/5 to-cyan-500/10 p-4 text-left transition-all hover:border-fuchsia-400/40 hover:shadow-[0_0_25px_-5px_rgba(217,70,239,0.4)]",
                        className,
                    )}
                >
                    <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-fuchsia-500/10 blur-2xl transition-opacity group-hover:opacity-100" />
                    <div className="relative flex items-center gap-3">
                        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-300">
                            <Sparkles className="size-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-white/90">Sugerencias para tu dashboard</p>
                            <p className="truncate text-xs text-white/50">
                                Astraura propone widgets y plantillas según tu contexto.
                            </p>
                        </div>
                        <Wand2 className="ml-auto size-4 shrink-0 text-fuchsia-300/70 transition-transform group-hover:rotate-12" />
                    </div>
                </button>
            ) : (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpen}
                    className={cn(
                        "h-9 gap-1.5 rounded-xl border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20 hover:text-fuchsia-100",
                        className,
                    )}
                >
                    <Sparkles className="size-3.5" />
                    Sugerencias de Astraura
                </Button>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg border-white/10 bg-black/90 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Sparkles className="size-5 text-fuchsia-400" />
                            Sugerencias de Astraura
                        </DialogTitle>
                        <DialogDescription className="text-white/50">
                            {usedAi
                                ? "Propuestas personalizadas según los widgets de este tablero."
                                : "Propuestas para enriquecer tu tablero."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        {loading && (
                            <div className="flex flex-col items-center justify-center gap-3 py-10 text-white/50">
                                <Loader2 className="size-6 animate-spin text-fuchsia-400" />
                                <p className="text-sm">Astraura está analizando tu dashboard…</p>
                            </div>
                        )}

                        {!loading && note && (
                            <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200/80">
                                {note}
                            </div>
                        )}

                        {!loading && suggestions.length > 0 && (
                            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                                {suggestions.map((s) => {
                                    const key = s.kind === "widget" ? `w:${s.type}` : `t:${s.categoryId}`;
                                    const isAdded = added.has(key);
                                    return (
                                        <div
                                            key={key}
                                            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-white/20"
                                        >
                                            <div
                                                className={cn(
                                                    "grid size-9 shrink-0 place-items-center rounded-lg border",
                                                    s.kind === "template"
                                                        ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-300"
                                                        : "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-300",
                                                )}
                                            >
                                                {s.kind === "template" ? (
                                                    <LayoutTemplate className="size-4" />
                                                ) : (
                                                    <Sparkles className="size-4" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-white/90">
                                                    {s.kind === "template" ? `Plantilla: ${s.name}` : s.label}
                                                </p>
                                                <p className="truncate text-xs text-white/45">{s.reason}</p>
                                            </div>
                                            {s.kind === "widget" ? (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={isAdded}
                                                    onClick={() => handleAddWidget(s)}
                                                    className="h-8 shrink-0 gap-1 rounded-lg text-xs text-fuchsia-300 hover:bg-fuchsia-500/10 disabled:opacity-40"
                                                >
                                                    {isAdded ? "Añadido" : (<><Plus className="size-3.5" /> Añadir</>)}
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={isAdded || !onCreateFromTemplate}
                                                    onClick={() => handleAddTemplate(s)}
                                                    className="h-8 shrink-0 gap-1 rounded-lg text-xs text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
                                                >
                                                    <Plus className="size-3.5" /> Crear
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {!loading && suggestions.length === 0 && !note && (
                            <p className="py-8 text-center text-sm text-white/40">
                                No hay sugerencias por ahora. Tu dashboard ya está bien surtido.
                            </p>
                        )}

                        <div className="flex items-center justify-between pt-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void runSuggestions()}
                                disabled={loading}
                                className="h-8 gap-1.5 rounded-lg text-xs text-white/50 hover:text-white/80"
                            >
                                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                                Regenerar
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setOpen(false)}
                                className="h-8 gap-1.5 rounded-lg text-xs text-white/50 hover:text-white/80"
                            >
                                <X className="size-3.5" />
                                Cerrar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default DashboardAiSuggestions;
