"use client";

// src/components/mentions/mention-input.tsx
// ─────────────────────────────────────────────────────────────────────────────
// MentionInput · textarea con menciones universales #/@ SIN dependencias.
//
// Envuelve el <Textarea> del sistema y añade, encima del input existente:
//   · Detección del disparador activo (@ mención / # etiqueta) bajo el cursor.
//   · Un popover de autocompletado con entidades REALES (searchEntities), con
//     navegación por teclado (↑/↓, Enter, Esc, Tab) y clic.
//   · Inserción de un TOKEN estructurado `@{type:id|label}` / `#{type:id|label}`.
//   · Una tira de chips (EntityChip) con las menciones ya presentes en el texto.
//
// El valor que emite (`onChange`) es el cuerpo CON tokens: quien lo consuma usa
// `parseMentions` para la lista estructurada y `toPlainText` para difundir a
// destinos que no entienden tokens. Defensivo: si la búsqueda falla, el input
// sigue funcionando como un textarea normal.
// ─────────────────────────────────────────────────────────────────────────────

import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    type ComponentType,
    type ForwardedRef,
    type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
    User,
    IdCard,
    Users,
    Users2,
    Flag,
    FileText,
    MessageSquare,
    LayoutDashboard,
    CalendarDays,
    Award,
    ScrollText,
    BookOpen,
    Library,
    Cpu,
    Sparkles,
    Loader2,
    AtSign,
    Hash,
} from "lucide-react";
import {
    detectActiveTrigger,
    insertMention,
    searchEntities,
    parseMentions,
    ENTITY_META,
    type ActiveTrigger,
    type EntityHit,
    type EntityType,
    type Mention,
} from "@/lib/mentions/mentions";
import { MentionChip } from "@/components/mentions/entity-chip";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
    User,
    IdCard,
    Users,
    Users2,
    Flag,
    FileText,
    MessageSquare,
    LayoutDashboard,
    CalendarDays,
    Award,
    ScrollText,
    BookOpen,
    Library,
    Cpu,
    Sparkles,
};

function HitIcon({ type, className }: { type: EntityType; className?: string }) {
    const name = ENTITY_META[type]?.icon ?? "Sparkles";
    const C = ICONS[name] ?? Sparkles;
    return <C className={className} />;
}

export interface MentionInputProps {
    /** Valor del cuerpo, CON tokens de mención. */
    value: string;
    /** Emite el nuevo valor (con tokens). */
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    /** Emite la lista estructurada de menciones cada vez que cambia. */
    onMentionsChange?: (mentions: Mention[]) => void;
    /** Filas mínimas del textarea. */
    rows?: number;
    id?: string;
    /** Nombre accesible (Adenda 142) — sólo hay `placeholder`, que no basta
     *  como etiqueta para lectores de pantalla. Opcional y aditivo: si no se
     *  pasa, el textarea queda igual que antes. */
    ariaLabel?: string;
}

/** API imperativa opcional (barra de formato del compositor): envolver la
 *  selección con marcas markdown o insertar texto en el cursor. Aditivo — los
 *  consumidores que no pasan `ref` siguen funcionando exactamente igual. */
export interface MentionInputHandle {
    /** Envuelve la selección actual con `before`/`after` (markdown); si no hay
     *  selección, inserta `placeholder` envuelto y lo deja seleccionado. */
    wrapSelection: (before: string, after?: string, placeholder?: string) => void;
    /** Inserta texto en la posición del cursor (o al final si no hay foco). */
    insertAtCursor: (text: string) => void;
    focus: () => void;
}

// Debounce simple para no saturar la búsqueda al teclear.
function useDebounced<T>(value: T, ms: number): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

/**
 * Textarea con menciones universales #/@. Dependency-free: usa el propio
 * textarea + un popover absoluto propio (sin cmdk ni editores).
 */
function MentionInputInner(
    {
        value,
        onChange,
        placeholder,
        className,
        onMentionsChange,
        rows = 5,
        id,
        ariaLabel,
    }: MentionInputProps,
    ref: ForwardedRef<MentionInputHandle>,
) {
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    const [active, setActive] = useState<ActiveTrigger | null>(null);
    const [hits, setHits] = useState<EntityHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const reqId = useRef(0);

    const debouncedQuery = useDebounced(active?.query ?? "", 180);

    // Menciones estructuradas presentes en el texto (para la tira de chips).
    const mentions = useMemo(() => parseMentions(value), [value]);

    // Notifica hacia arriba cuando cambian las menciones.
    useEffect(() => {
        onMentionsChange?.(mentions);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // API imperativa (barra de formato del compositor). No afecta a los
    // consumidores que no pasan `ref` (comment-thread, red, etc.).
    useImperativeHandle(
        ref,
        () => ({
            wrapSelection(before: string, after = before, placeholder = "") {
                const ta = taRef.current;
                const start = ta?.selectionStart ?? value.length;
                const end = ta?.selectionEnd ?? value.length;
                const selected = value.slice(start, end) || placeholder;
                const next = value.slice(0, start) + before + selected + after + value.slice(end);
                onChange(next);
                requestAnimationFrame(() => {
                    if (!ta) return;
                    ta.focus();
                    const caretStart = start + before.length;
                    const caretEnd = caretStart + selected.length;
                    try {
                        ta.setSelectionRange(caretStart, caretEnd);
                    } catch {
                        /* noop */
                    }
                });
            },
            insertAtCursor(text: string) {
                const ta = taRef.current;
                const start = ta?.selectionStart ?? value.length;
                const end = ta?.selectionEnd ?? value.length;
                const next = value.slice(0, start) + text + value.slice(end);
                onChange(next);
                requestAnimationFrame(() => {
                    if (!ta) return;
                    ta.focus();
                    const caret = start + text.length;
                    try {
                        ta.setSelectionRange(caret, caret);
                    } catch {
                        /* noop */
                    }
                });
            },
            focus() {
                taRef.current?.focus();
            },
        }),
        [value, onChange],
    );

    // Recalcula el disparador activo a partir del cursor.
    const refreshTrigger = useCallback(() => {
        const ta = taRef.current;
        if (!ta) return;
        const caret = ta.selectionStart ?? value.length;
        const found = detectActiveTrigger(value, caret);
        setActive(found);
        if (!found) {
            setHits([]);
            setHighlight(0);
        }
    }, [value]);

    // Lanza la búsqueda al cambiar la consulta debounced / el disparador.
    useEffect(() => {
        if (!active) return;
        let alive = true;
        const myReq = ++reqId.current;
        setLoading(true);
        searchEntities(debouncedQuery, active.trigger)
            .then((res) => {
                if (!alive || myReq !== reqId.current) return;
                setHits(res);
                setHighlight(0);
            })
            .catch(() => {
                if (alive && myReq === reqId.current) setHits([]);
            })
            .finally(() => {
                if (alive && myReq === reqId.current) setLoading(false);
            });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQuery, active?.trigger, active?.start]);

    function choose(hit: EntityHit) {
        const ta = taRef.current;
        if (!active) return;
        const { text, caret } = insertMention(value, active, hit);
        onChange(text);
        setActive(null);
        setHits([]);
        // Reposiciona el cursor tras el token insertado.
        requestAnimationFrame(() => {
            if (ta) {
                ta.focus();
                try {
                    ta.setSelectionRange(caret, caret);
                } catch {
                    /* noop */
                }
            }
        });
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (!active || hits.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % hits.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + hits.length) % hits.length);
        } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            const hit = hits[highlight] ?? hits[0];
            if (hit) choose(hit);
        } else if (e.key === "Escape") {
            e.preventDefault();
            setActive(null);
            setHits([]);
        }
    }

    // Quita una mención del texto (elimina su token; tolera espacios sobrantes).
    function removeMention(m: Mention) {
        const re = new RegExp(
            `${m.kind === "#" ? "#" : "@"}\\{${m.type}:${escapeRe(m.id)}\\|[^{}]*\\}\\s?`,
            "g",
        );
        onChange(value.replace(re, ""));
    }

    const showPopover = Boolean(active) && (loading || hits.length > 0);
    const resolvedPlaceholder =
        placeholder ?? "Escribe tu contenido… Usa @ para mencionar y # para etiquetar entidades.";

    return (
        <div className={cn("relative", className)}>
            <Textarea
                id={id}
                ref={taRef}
                value={value}
                placeholder={resolvedPlaceholder}
                aria-label={ariaLabel ?? resolvedPlaceholder}
                onChange={(e) => onChange(e.target.value)}
                onKeyUp={refreshTrigger}
                onClick={refreshTrigger}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                    // Cierra el popover al perder foco (con margen para el clic).
                    setTimeout(() => setActive(null), 120);
                }}
                rows={rows}
                className="min-h-[140px] bg-white/[0.03] text-amber-50"
            />

            {/* Pista de disparadores */}
            <div className="mt-1 flex items-center gap-3 text-[11px] text-white/35">
                <span className="inline-flex items-center gap-1">
                    <AtSign className="h-3 w-3" /> mencionar / notificar
                </span>
                <span className="inline-flex items-center gap-1">
                    <Hash className="h-3 w-3" /> etiquetar / adjuntar
                </span>
            </div>

            {/* Popover de autocompletado (absoluto, dependency-free) */}
            {showPopover && (
                <div className="absolute left-0 right-0 top-[calc(100%-1.5rem)] z-50 mt-1 max-h-72 overflow-auto rounded-lg border border-white/15 bg-[#0d0f14]/95 p-1 shadow-xl backdrop-blur-md">
                    <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wide text-white/40">
                        <span>
                            {active?.trigger === "#" ? "Etiquetar / adjuntar" : "Mencionar / notificar"}
                        </span>
                        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                    </div>
                    {hits.length === 0 && !loading ? (
                        <div className="px-2 py-2 text-xs text-white/40">
                            Sin coincidencias.
                        </div>
                    ) : (
                        hits.map((hit, i) => {
                            const isOn = i === highlight;
                            return (
                                <button
                                    key={`${hit.type}:${hit.id}`}
                                    type="button"
                                    // onMouseDown (no onClick): evita el blur previo del textarea.
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        choose(hit);
                                    }}
                                    onMouseEnter={() => setHighlight(i)}
                                    className={cn(
                                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                                        isOn ? "bg-amber-400/15" : "hover:bg-white/5",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                                            isOn ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-white/60",
                                        )}
                                    >
                                        <HitIcon type={hit.type} className="h-3.5 w-3.5" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm text-amber-50">
                                            {hit.label}
                                        </span>
                                        <span className="block truncate text-[11px] text-white/40">
                                            {hit.sub || ENTITY_META[hit.type]?.label}
                                        </span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/45">
                                        {ENTITY_META[hit.type]?.label}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}

            {/* Tira de menciones presentes en el texto */}
            {mentions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {mentions.map((m) => (
                        <MentionChip
                            key={`${m.kind}:${m.type}:${m.id}`}
                            mention={m}
                            onRemove={() => removeMention(m)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MentionInput = forwardRef(MentionInputInner);
MentionInput.displayName = "MentionInput";

export default MentionInput;
