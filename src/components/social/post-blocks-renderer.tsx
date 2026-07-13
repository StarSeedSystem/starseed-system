"use client";

// src/components/social/post-blocks-renderer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// RENDER de los BLOQUES RICOS de una publicación del Lienzo Universal
// (Adenda 66 §6) + sus ETIQUETAS. Es el MISMO render en toda la red (PostCard,
// feeds de sección, perfil…): se engancha una sola vez en PostCard.
//
// Adaptación inteligente (§6): rejilla responsive, imágenes lazy, código en
// <iframe> AISLADO de altura acotada, gráficas responsive (recharts), y respeto
// de `prefers-reduced-motion` + modo de rendimiento (device-tier): el código
// pesado y los mini-mapas se cargan BAJO DEMANDA (no se auto-ejecutan en el feed).
//
// Aislamiento del código: sandbox="allow-scripts" SIN allow-same-origin → origen
// opaco, sin acceso a cookies/localStorage/sesión de Supabase de la app.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import {
    buildSandboxDoc,
    type PostBlock,
    type ChartDatum,
} from "@/lib/creation/post-blocks";
import { astrauraChat } from "@/ai/astraura/router";
import type { ChatMessage } from "@/ai/providers/types";
import { loadLeaflet, type LeafletNS } from "@/lib/map/leaflet-loader";
import {
    Play,
    GitBranch,
    ExternalLink,
    PencilRuler,
    MapPin,
    Bot,
    Loader2,
    Send,
    ShieldAlert,
    Library,
    FolderTree,
    FileText,
    Film,
    BrainCircuit,
    Cpu,
    Link2,
    Building2,
    User as UserIcon,
    Users2,
    CalendarDays,
    Tag,
    type LucideIcon,
} from "lucide-react";

const CHART_COLORS = ["#39FF14", "#007FFF", "#FFBF00", "#DC143C", "#B24BF3", "#10B981", "#F472B6", "#38BDF8"];

/** Detecta reduced-motion + tier eco (SSR-safe). */
function useReducedFx(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        try {
            const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
            const perfEco = document.documentElement.getAttribute("data-perf") === "eco";
            setReduced(mq.matches || perfEco);
            const onChange = () => setReduced(mq.matches || document.documentElement.getAttribute("data-perf") === "eco");
            mq.addEventListener?.("change", onChange);
            return () => mq.removeEventListener?.("change", onChange);
        } catch {
            /* noop */
        }
    }, []);
    return reduced;
}

// ── Componente raíz ──────────────────────────────────────────────────────────

export function PostBlocksRenderer({
    blocks,
    accent,
    className,
}: {
    blocks?: PostBlock[];
    accent?: string;
    className?: string;
}) {
    const reduced = useReducedFx();
    if (!blocks || blocks.length === 0) return null;
    return (
        <div className={cn("mt-3 space-y-3 min-w-0", className)}>
            {blocks.map((b) => (
                <BlockRender key={b.id} block={b} accent={accent} reduced={reduced} />
            ))}
        </div>
    );
}

function BlockRender({ block, accent, reduced }: { block: PostBlock; accent?: string; reduced: boolean }) {
    switch (block.type) {
        case "portada":
            return <PortadaBlock block={block} />;
        case "codigo":
        case "pagina":
            return <CodeBlock block={block} />;
        case "repo":
            return <RepoBlock block={block} />;
        case "pizarra":
            return <PizarraBlock block={block} />;
        case "agente":
            return <AgentBlock block={block} />;
        case "mapa":
            return <MapaBlock block={block} />;
        case "grafica":
            return <GraficaBlock block={block} reduced={reduced} />;
        case "referencia":
        case "entidad":
            return <RefBlock block={block} />;
        // ── Adenda 67 · P4 (aditivos) ──
        case "penpot":
            return <PenpotBlock block={block} />;
        case "video":
            return <VideoBlock block={block} />;
        default:
            return null;
    }
}

// ── Diseño Penpot (P4-2) ─────────────────────────────────────────────────────
//
// HONESTIDAD RADICAL: la instancia oficial de Penpot (design.penpot.app) manda
// `X-Frame-Options: SAMEORIGIN` — VERIFICADO con `curl -I`. Incrustarla en un
// iframe desde starseed-os.vercel.app produciría un recuadro EN BLANCO. Por eso:
//   · por defecto → TARJETA con enlace («Abrir en Penpot»), que sí funciona;
//   · el iframe SOLO se ofrece si el autor marcó el bloque como incrustable
//     (`system === "embed"`, que el editor solo deja activar para instancias
//     propias), y aun así avisamos de que puede quedarse en blanco.
// Nunca fingimos una incrustación que el navegador va a bloquear.

function PenpotBlock({ block }: { block: PostBlock }) {
    const url = block.url?.trim();
    const [embedded, setEmbedded] = useState(false);
    if (!url) return null;

    const official = /(^|\/\/)(design\.)?penpot\.app/i.test(url);
    const canEmbed = block.system === "embed" && !official;
    const title = block.text?.trim() || "Diseño de Penpot";

    return (
        <div className="overflow-hidden rounded-xl border border-violet-400/25 bg-violet-500/[0.05]">
            <div className="flex items-center gap-2 border-b border-violet-400/15 px-3 py-2">
                <PencilRuler className="h-4 w-4 shrink-0 text-violet-300" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/85">{title}</span>
                <span className="hidden shrink-0 text-[9px] uppercase tracking-wider text-white/30 sm:inline">
                    Penpot · open source
                </span>
            </div>

            {canEmbed && embedded ? (
                <iframe
                    title={title}
                    src={url}
                    sandbox="allow-scripts allow-same-origin allow-popups"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="h-96 w-full bg-black/20"
                />
            ) : (
                <div className="space-y-2 p-3">
                    <p className="truncate text-xs text-muted-foreground">{url}</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-violet-400/40 bg-violet-500/15 px-2.5 py-1.5 text-xs text-violet-100 transition-colors hover:bg-violet-500/25"
                        >
                            <ExternalLink className="h-3.5 w-3.5" /> Abrir en Penpot
                        </a>
                        {canEmbed && (
                            <button
                                type="button"
                                onClick={() => setEmbedded(true)}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/[0.08]"
                            >
                                <Play className="h-3.5 w-3.5" /> Incrustar aquí
                            </button>
                        )}
                    </div>
                    {official && (
                        <p className="text-[10px] leading-relaxed text-white/35">
                            La instancia oficial de Penpot no permite incrustarse en otras webs
                            (<code className="text-white/50">X-Frame-Options: SAMEORIGIN</code>), así que se abre en una
                            pestaña nueva. En una instancia propia que lo permita, este bloque sí puede incrustarse.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Vídeo (P4-3) ─────────────────────────────────────────────────────────────
// Reproduce el vídeo REAL ya exportado (por ejemplo, editado en OpenCut) desde
// su URL en la Biblioteca del OS. Carga bajo demanda (`preload="none"`) para no
// pesar en el feed.

function VideoBlock({ block }: { block: PostBlock }) {
    const url = block.url?.trim();
    if (!url) return null;
    return (
        <figure className="overflow-hidden rounded-xl border border-border/50 bg-black/40">
            <video
                src={url}
                controls
                preload="none"
                playsInline
                className="max-h-96 w-full bg-black"
            />
            {(block.text?.trim() || block.name?.trim()) && (
                <figcaption className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
                    <Film className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    <span className="min-w-0 truncate">{block.text?.trim() || block.name?.trim()}</span>
                </figcaption>
            )}
        </figure>
    );
}

// ── Portada ──────────────────────────────────────────────────────────────────

function PortadaBlock({ block }: { block: PostBlock }) {
    if (!block.url) return null;
    return (
        <figure className="relative w-full overflow-hidden rounded-xl border border-border/50 bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={block.url}
                alt={block.text || block.name || "Portada"}
                loading="lazy"
                className="max-h-72 w-full object-cover"
            />
            {block.text && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-sm font-semibold text-white">
                    {block.text}
                </figcaption>
            )}
        </figure>
    );
}

// ── Código ejecutable / página interactiva (AISLADO) ─────────────────────────

function CodeBlock({ block }: { block: PostBlock }) {
    const [ran, setRan] = useState(false);
    const doc = useMemo(() => (ran ? buildSandboxDoc(block) : ""), [ran, block]);
    const isPage = block.type === "pagina";

    return (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/45">
                {isPage ? <Play className="h-3 w-3 text-indigo-300" /> : <Play className="h-3 w-3 text-emerald-300" />}
                {isPage ? "Página interactiva" : "Programa"} · {block.language || "html"}
                <span className="ml-auto inline-flex items-center gap-1 text-[9px] text-white/30">
                    <ShieldAlert className="h-3 w-3" /> aislado
                </span>
            </div>
            {ran ? (
                <iframe
                    title="Programa de la publicación"
                    // AISLAMIENTO: allow-scripts sin allow-same-origin → sin acceso a la sesión.
                    sandbox="allow-scripts allow-popups allow-modals"
                    referrerPolicy="no-referrer"
                    srcDoc={doc}
                    loading="lazy"
                    className="h-72 w-full bg-white/0"
                />
            ) : (
                <button
                    type="button"
                    onClick={() => setRan(true)}
                    className="flex w-full items-center justify-center gap-2 px-3 py-8 text-sm text-white/60 hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                    <Play className="h-4 w-4 text-emerald-300" />
                    Ejecutar {isPage ? "la página" : "el programa"} (entorno aislado)
                </button>
            )}
        </div>
    );
}

// ── Repo ─────────────────────────────────────────────────────────────────────

function RepoBlock({ block }: { block: PostBlock }) {
    const url = block.url?.trim();
    if (!url) return null;
    const name = block.text?.trim() || url.replace(/^https?:\/\/(www\.)?github\.com\//i, "") || url;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3 transition-colors hover:bg-muted/50 min-w-0 cursor-pointer"
        >
            <div className="shrink-0 rounded-lg bg-white/10 p-2.5 text-white/80">
                <GitBranch className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{url}</p>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
        </a>
    );
}

// ── Pizarra ──────────────────────────────────────────────────────────────────

function PizarraBlock({ block }: { block: PostBlock }) {
    const url = block.url?.trim();
    if (!url) return null;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3 transition-colors hover:bg-muted/50 min-w-0 cursor-pointer"
        >
            <div className="shrink-0 rounded-lg bg-amber-500/15 p-2.5 text-amber-300">
                <PencilRuler className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{block.text?.trim() || "Pizarra"}</p>
                <p className="truncate text-xs text-muted-foreground">{url}</p>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
        </a>
    );
}

// ── Gráfica (recharts, responsive) ───────────────────────────────────────────

function GraficaBlock({ block, reduced }: { block: PostBlock; reduced: boolean }) {
    const data: ChartDatum[] = (block.data || []).filter((d) => Number.isFinite(d.value));
    if (data.length === 0) return null;
    const kind = block.chartType || "bar";
    const animate = !reduced;

    return (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            {block.text && <p className="mb-2 text-xs font-semibold text-foreground/80">{block.text}</p>}
            <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    {kind === "line" ? (
                        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Line type="monotone" dataKey="value" stroke={CHART_COLORS[1]} strokeWidth={2} dot isAnimationActive={animate} />
                        </LineChart>
                    ) : kind === "area" ? (
                        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Area type="monotone" dataKey="value" stroke={CHART_COLORS[0]} fill={`${CHART_COLORS[0]}33`} strokeWidth={2} isAnimationActive={animate} />
                        </AreaChart>
                    ) : kind === "pie" ? (
                        <PieChart>
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius="80%" isAnimationActive={animate}>
                                {data.map((_, i) => (
                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                            </Pie>
                        </PieChart>
                    ) : (
                        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={animate}>
                                {data.map((_, i) => (
                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}

const TOOLTIP_STYLE = {
    background: "#0b0b12",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    fontSize: 12,
    color: "#fff",
};

// ── Mapa (Leaflet bajo demanda + enlace a /hub/mapa) ─────────────────────────

function MapaBlock({ block }: { block: PostBlock }) {
    const hasCoords = typeof block.lat === "number" && typeof block.lng === "number";
    const mapRef = useRef<HTMLDivElement | null>(null);
    const [showMap, setShowMap] = useState(false);
    const instRef = useRef<any>(null);

    useEffect(() => {
        if (!showMap || !hasCoords || !mapRef.current) return;
        let cancelled = false;
        loadLeaflet()
            .then((L: LeafletNS) => {
                if (cancelled || !mapRef.current || instRef.current) return;
                const map = L.map(mapRef.current, { attributionControl: false, zoomControl: true }).setView(
                    [block.lat, block.lng],
                    13,
                );
                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
                L.marker([block.lat, block.lng]).addTo(map);
                instRef.current = map;
            })
            .catch(() => {});
        return () => {
            cancelled = true;
            try {
                instRef.current?.remove?.();
                instRef.current = null;
            } catch {
                /* noop */
            }
        };
    }, [showMap, hasCoords, block.lat, block.lng]);

    const href = hasCoords ? `/hub/mapa?lat=${block.lat}&lng=${block.lng}` : "/hub/mapa";

    return (
        <div className="overflow-hidden rounded-xl border border-border/50 bg-muted/20">
            <div className="flex items-center gap-2 px-3 py-2">
                <MapPin className="h-4 w-4 shrink-0 text-sky-300" />
                <span className="min-w-0 flex-1 truncate text-sm">
                    {block.place || (hasCoords ? `${block.lat!.toFixed(4)}, ${block.lng!.toFixed(4)}` : "Ubicación")}
                </span>
                <Link href={href} className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline cursor-pointer">
                    Ver en el mapa <ExternalLink className="h-3 w-3" />
                </Link>
            </div>
            {hasCoords &&
                (showMap ? (
                    <div ref={mapRef} className="h-56 w-full" />
                ) : (
                    <button
                        type="button"
                        onClick={() => setShowMap(true)}
                        className="flex w-full items-center justify-center gap-2 border-t border-white/10 py-6 text-xs text-white/55 hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                        <MapPin className="h-4 w-4 text-sky-300" /> Cargar mini-mapa
                    </button>
                ))}
        </div>
    );
}

// ── Agente / bot (chat embebido con Aurora/Astraura, AISLADO) ────────────────

function AgentBlock({ block }: { block: PostBlock }) {
    const system = (block.system || "").trim();
    const name = block.name?.trim() || "Agente";
    const [msgs, setMsgs] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
    }, [msgs]);

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || busy) return;
        setInput("");
        const nextMsgs = [...msgs, { role: "user" as const, content: text }];
        setMsgs(nextMsgs);
        setBusy(true);
        try {
            const history: ChatMessage[] = [];
            if (system) history.push({ role: "system", content: system });
            if (block.persona?.trim()) history.push({ role: "system", content: `Personalidad: ${block.persona.trim()}` });
            for (const m of nextMsgs) history.push({ role: m.role, content: m.content });
            const res = await astrauraChat({ messages: history, temperature: 0.7 });
            setMsgs((prev) => [...prev, { role: "assistant", content: res.text || "…" }]);
        } catch {
            setMsgs((prev) => [...prev, { role: "assistant", content: "No pude responder ahora mismo." }]);
        } finally {
            setBusy(false);
        }
    }, [input, busy, msgs, system, block.persona]);

    return (
        <div className="overflow-hidden rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04]">
            <div className="flex items-center gap-2 border-b border-fuchsia-400/15 px-3 py-2">
                <Bot className="h-4 w-4 shrink-0 text-fuchsia-300" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/85">{name}</span>
                <span className="inline-flex items-center gap-1 text-[9px] uppercase text-white/35">
                    <ShieldAlert className="h-3 w-3" /> aislado · Aurora
                </span>
            </div>
            <div ref={scrollRef} className="max-h-56 space-y-2 overflow-y-auto p-3">
                {msgs.length === 0 ? (
                    <p className="text-xs text-white/40">
                        Mini-agente configurado por el autor. Tus mensajes usan Aurora/Astraura y no salen de esta tarjeta.
                    </p>
                ) : (
                    msgs.map((m, i) => (
                        <div
                            key={i}
                            className={cn(
                                "max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm whitespace-pre-wrap break-words",
                                m.role === "user"
                                    ? "ml-auto bg-white/10 text-white/90"
                                    : "bg-fuchsia-500/10 text-fuchsia-50",
                            )}
                        >
                            {m.content}
                        </div>
                    ))
                )}
                {busy && (
                    <p className="flex items-center gap-1.5 text-xs text-white/40">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> pensando…
                    </p>
                )}
            </div>
            <div className="flex items-end gap-2 border-t border-fuchsia-400/15 p-2">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            void send();
                        }
                    }}
                    rows={1}
                    placeholder="Escribe al agente…"
                    className="min-h-[36px] flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white/90 outline-none focus:border-fuchsia-400/40"
                />
                <button
                    type="button"
                    onClick={() => void send()}
                    disabled={busy || !input.trim()}
                    className="shrink-0 rounded-lg bg-fuchsia-500/25 p-2 text-fuchsia-100 hover:bg-fuchsia-500/35 disabled:opacity-40 cursor-pointer transition-colors"
                    aria-label="Enviar"
                >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
}

// ── Referencia / entidad (tarjeta enlazada) ──────────────────────────────────

const REF_ICON: Record<string, LucideIcon> = {
    brain: BrainCircuit,
    neuron: Cpu,
    library: Library,
    folder: FolderTree,
    file: FileText,
    url: Link2,
    page: FileText,
    profile: UserIcon,
    group: Users2,
    community: Building2,
    event: CalendarDays,
};

const REF_LABEL: Record<string, string> = {
    brain: "Cerebro",
    neuron: "Neurona",
    library: "Biblioteca",
    folder: "Folder",
    file: "Archivo",
    url: "Enlace",
    page: "Página",
    profile: "Perfil",
    group: "Grupo",
    community: "Comunidad",
    event: "Evento",
};

/** Ruta razonable para una referencia (usa ref.route si viene, si no la construye). */
function refHref(block: PostBlock): { href: string; external: boolean } {
    const r = block.ref;
    if (!r) return { href: "#", external: false };
    if (r.url && (r.kind === "url" || r.kind === "file")) return { href: r.url, external: true };
    if (r.route) return { href: r.route, external: false };
    switch (r.kind) {
        case "library":
        case "folder":
        case "file":
            return { href: "/library", external: false };
        case "brain":
        case "neuron":
            return { href: "/cerebro", external: false };
        case "profile":
            return { href: `/profile/${r.id}`, external: false };
        case "group":
            return { href: `/grupo/${r.id}`, external: false };
        case "event":
            return { href: `/evento/${r.id}`, external: false };
        case "page":
        case "community":
            return { href: `/pagina/${r.id}`, external: false };
        default:
            return { href: "#", external: false };
    }
}

function RefBlock({ block }: { block: PostBlock }) {
    const r = block.ref;
    if (!r || !r.id) return null;
    const Icon = REF_ICON[r.kind] || Link2;
    const kindLabel = REF_LABEL[r.kind] || "Recurso";
    const label = r.label || block.text || r.id;
    const { href, external } = refHref(block);

    const inner = (
        <>
            <div className="shrink-0 rounded-lg bg-white/10 p-2.5 text-white/80">
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{kindLabel}</p>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
        </>
    );

    const cls =
        "flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3 transition-colors hover:bg-muted/50 min-w-0 cursor-pointer";

    return external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
            {inner}
        </a>
    ) : (
        <Link href={href} className={cls}>
            {inner}
        </Link>
    );
}

// ── Etiquetas de la publicación (chips) ──────────────────────────────────────

export function PostTagChips({ tags, className }: { tags?: string[]; className?: string }) {
    if (!tags || tags.length === 0) return null;
    return (
        <div className={cn("mt-2 flex flex-wrap gap-1.5", className)}>
            {tags.map((t) => (
                <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium capitalize text-primary"
                >
                    <Tag className="h-2.5 w-2.5" aria-hidden />
                    {t.replace(/-/g, " ")}
                </span>
            ))}
        </div>
    );
}
