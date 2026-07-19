"use client";

// src/components/creation/creation-center.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CENTRO DE CREACIÓN (/crear) — página completa de la cortina Trinity Horizon
// (SOP: architecture/centro-creacion-sync-permisos.md §2). Cuatro áreas:
//
//   · Lienzo Universal  (?area=lienzo)   → publicaciones específicas por bloques
//   · Fragua de Widgets (?area=fragua)   → widgets IA ('starseed:open-forge',
//                                          responde el GlobalForgeHost del root)
//   · Pizarras          (?area=pizarras) → espacio de trabajo ilimitado
//   · Zona de Publicación (?area=publicar&dest=…) → publicar por contexto
//
// + fila de accesos para CREAR ENTIDADES (grupo, página, partido, E.F.,
//   asamblea, comunidad, evento) reutilizando los flujos existentes
//   (?createEntity=… → GlobalEntityCreator del layout (app)).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LienzoComposer } from "@/components/creation/lienzo-composer";
import { QuickPublisher } from "@/components/creation/quick-publisher";
import { PizarrasPanel } from "@/components/creation/pizarras-panel";
import {
    parseDestParam,
    type CreationDest,
} from "@/components/creation/creation-config";
import {
    Sparkles,
    Hammer,
    Presentation,
    Send,
    Users2,
    FileText,
    Flag,
    Landmark,
    Vote,
    Sprout,
    CalendarDays,
    LayoutDashboard,
    Layers,
    Eye,
    Cpu,
    Pencil,
    type LucideIcon,
} from "lucide-react";

// ── Áreas ────────────────────────────────────────────────────────────────────

type AreaId = "lienzo" | "editor" | "fragua" | "pizarras" | "publicar";

const AREAS: Array<{ id: AreaId; label: string; desc: string; icon: LucideIcon }> = [
    { id: "lienzo", label: "Lienzo Universal", desc: "Publicaciones por bloques", icon: Sparkles },
    // Editor Universal ENTRE «Lienzo Universal» y «Fragua de Widgets» (Adenda
    // 71-ter · I3): mismo evento global que la cortina Trinity ('starseed:open-editor').
    { id: "editor", label: "Editor Universal", desc: "Edita cualquier sección del OS", icon: Pencil },
    { id: "fragua", label: "Fragua de Widgets", desc: "Widgets generados con IA", icon: Hammer },
    { id: "pizarras", label: "Pizarras", desc: "Espacio de trabajo ilimitado", icon: Presentation },
    { id: "publicar", label: "Zona de Publicación", desc: "Publicar por contexto", icon: Send },
];

function parseAreaParam(raw: string | null): AreaId {
    const k = (raw ?? "").trim().toLowerCase();
    if (k === "fragua" || k === "pizarras" || k === "publicar" || k === "lienzo" || k === "editor") return k;
    return "lienzo";
}

/**
 * Parsea ?geo=<lat>,<lng> (Mapa del Hub, SOP §12): el Lienzo adjunta esa
 * geolocalización a la metadata ss:meta del post para que aparezca como
 * marcador en la capa "Publicaciones" de /hub/mapa.
 */
function parseGeoParam(raw: string | null): { lat: number; lng: number } | null {
    const parts = (raw ?? "").split(",");
    if (parts.length !== 2) return null;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
}

// ── Fragua (panel explicativo; el diálogo lo abre el GlobalForgeHost) ────────

function FraguaPanel() {
    const openForge = useCallback(() => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(new CustomEvent("starseed:open-forge"));
    }, []);

    const phases = [
        { icon: Layers, title: "Estructura", desc: "Elige la topología base del widget." },
        { icon: Eye, title: "Variaciones", desc: "La IA forja 3 prototipos visuales." },
        { icon: Cpu, title: "Metamorfosis", desc: "Ajusta aspecto, código e inteligencia." },
    ];

    return (
        <div className="mx-auto w-full max-w-3xl">
            <div className="rounded-3xl border border-indigo-500/25 bg-white/[0.04] backdrop-blur-xl p-5 sm:p-8 text-center space-y-5">
                <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-600/30 border border-indigo-400/30 flex items-center justify-center shadow-[0_0_25px_rgba(99,102,241,0.25)]">
                    <Hammer className="w-7 h-7 text-indigo-200" />
                </div>
                <div>
                    <h3 className="text-xl font-light text-white">La Fragua de Interfaces</h3>
                    <p className="text-sm text-white/45 mt-1 max-w-md mx-auto">
                        Describe el widget que imaginas y la IA forjará su estructura, su
                        aspecto y su código en tres fases. El resultado se añade a tu
                        Dashboard automáticamente.
                    </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    {phases.map((p) => {
                        const Icon = p.icon;
                        return (
                            <div
                                key={p.title}
                                className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left space-y-1.5"
                            >
                                <Icon className="w-4 h-4 text-indigo-300" />
                                <p className="text-xs font-semibold text-white/85">{p.title}</p>
                                <p className="text-[11px] text-white/40 leading-snug">{p.desc}</p>
                            </div>
                        );
                    })}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                    <Button
                        size="lg"
                        onClick={openForge}
                        className="cursor-pointer gap-2 rounded-2xl bg-indigo-500/25 border border-indigo-400/40 text-indigo-100 hover:bg-indigo-500/35 transition-all duration-200 shadow-[0_0_20px_rgba(99,102,241,0.15)] w-full sm:w-auto"
                    >
                        <Sparkles className="w-4 h-4" />
                        Abrir la Fragua
                    </Button>
                    <Link href="/dashboard" className="w-full sm:w-auto">
                        <Button
                            size="lg"
                            variant="outline"
                            className="cursor-pointer gap-2 rounded-2xl border-white/15 bg-white/[0.03] hover:bg-white/[0.08] transition-colors duration-200 w-full"
                        >
                            <LayoutDashboard className="w-4 h-4" />
                            Ver mis widgets en el Dashboard
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}

// ── Editor Universal (dispara el host global 'starseed:open-editor') ──────────

function EditorPanel() {
    const openEditor = useCallback(() => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(new CustomEvent("starseed:open-editor"));
    }, []);

    return (
        <div className="mx-auto w-full max-w-3xl">
            <div className="rounded-3xl border border-violet-500/25 bg-white/[0.04] backdrop-blur-xl p-5 sm:p-8 text-center space-y-5">
                <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-600/30 border border-violet-400/30 flex items-center justify-center shadow-[0_0_25px_rgba(139,92,246,0.25)]">
                    <Pencil className="w-7 h-7 text-violet-200" />
                </div>
                <div>
                    <h3 className="text-xl font-light text-white">Editor Universal</h3>
                    <p className="text-sm text-white/45 mt-1 max-w-md mx-auto">
                        La puerta única para editar cualquier sección del OS: diseño y
                        estilos, disposición, funcionamiento, con IA o con código, e
                        importar desde la Biblioteca.
                    </p>
                </div>
                <Button
                    size="lg"
                    onClick={openEditor}
                    className="cursor-pointer gap-2 rounded-2xl bg-violet-500/25 border border-violet-400/40 text-violet-100 hover:bg-violet-500/35 transition-all duration-200 shadow-[0_0_20px_rgba(139,92,246,0.15)] w-full sm:w-auto min-h-[44px]"
                >
                    <Pencil className="w-4 h-4" />
                    Abrir el Editor Universal
                </Button>
            </div>
        </div>
    );
}

// ── Fila de creación de entidades ────────────────────────────────────────────

interface EntityLink {
    label: string;
    icon: LucideIcon;
    /** Query ?createEntity= (flujo real EntityEditorDialog) o ruta destino. */
    createEntity?: "page" | "group" | "event";
    href?: string;
    hint: string;
}

const ENTITY_LINKS: EntityLink[] = [
    { label: "Grupo", icon: Users2, createEntity: "group", hint: "Círculo, colectivo o asamblea" },
    { label: "Página", icon: FileText, createEntity: "page", hint: "Pública o privada" },
    { label: "Partido político", icon: Flag, href: "/network/politics", hint: "Coaliciones en el ecosistema político" },
    { label: "E.F.", icon: Landmark, createEntity: "page", hint: "Entidad Federativa (crear como página)" },
    { label: "Asamblea", icon: Vote, createEntity: "group", hint: "Grupo con categoría asamblea" },
    { label: "Comunidad", icon: Sprout, createEntity: "page", hint: "Página con categoría comunidad" },
    { label: "Evento", icon: CalendarDays, createEntity: "event", hint: "Encuentro físico o del Multiverso" },
];

function EntityCreationRow({ area }: { area: AreaId }) {
    return (
        <section className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Crear entidades
            </h4>
            <div className="flex flex-wrap gap-1.5">
                {ENTITY_LINKS.map((e) => {
                    const Icon = e.icon;
                    const href = e.createEntity
                        ? `/crear?area=${area}&createEntity=${e.createEntity}`
                        : (e.href ?? "/hub");
                    return (
                        <Link
                            key={e.label}
                            href={href}
                            title={e.hint}
                            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.05] px-3 py-1.5 text-xs font-medium text-emerald-300/90 hover:bg-emerald-500/15 hover:text-emerald-200 transition-all duration-150 cursor-pointer"
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {e.label}
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}

// ── Centro de Creación ───────────────────────────────────────────────────────

export function CreationCenter() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [area, setArea] = useState<AreaId>(() => parseAreaParam(searchParams.get("area")));
    const dest: CreationDest | null = parseDestParam(searchParams.get("dest"));
    // Geo opcional (?geo=lat,lng) enviada por el Mapa del Hub ("Crear aquí").
    const initialGeo = parseGeoParam(searchParams.get("geo"));

    // Sincroniza el área activa cuando cambia la URL (navegación de la cortina).
    useEffect(() => {
        setArea(parseAreaParam(searchParams.get("area")));
    }, [searchParams]);

    const switchArea = useCallback(
        (next: AreaId) => {
            setArea(next);
            const q = new URLSearchParams();
            q.set("area", next);
            const d = parseDestParam(searchParams.get("dest"));
            if (next === "publicar" && d) q.set("dest", d);
            router.replace(`/crear?${q.toString()}`, { scroll: false });
        },
        [router, searchParams],
    );

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6">
            {/* Cabecera */}
            <header className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-bold font-headline flex items-center gap-2.5">
                    <span className="inline-flex w-9 h-9 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 items-center justify-center shadow-[0_0_18px_rgba(16,185,129,0.15)]">
                        <Sparkles className="w-5 h-5 text-emerald-300" />
                    </span>
                    Centro de Creación
                </h1>
                <p className="text-sm text-white/45">
                    El eje Horizon del sistema Trinity: crea publicaciones, widgets,
                    pizarras y entidades desde un solo lugar.
                </p>
            </header>

            {/* Pestañas de áreas */}
            <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {AREAS.map((a) => {
                    const Icon = a.icon;
                    const active = area === a.id;
                    return (
                        <button
                            key={a.id}
                            type="button"
                            onClick={() => switchArea(a.id)}
                            className={cn(
                                "flex flex-col items-start gap-1 rounded-2xl border p-3 sm:p-4 text-left transition-all duration-200 cursor-pointer",
                                active
                                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100 shadow-[0_0_22px_rgba(16,185,129,0.12)]"
                                    : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white/85",
                            )}
                        >
                            <Icon className={cn("w-4 h-4", active ? "text-emerald-300" : "text-white/40")} />
                            <span className="text-xs sm:text-sm font-medium leading-tight">{a.label}</span>
                            <span className="text-[10px] text-white/35 leading-tight hidden sm:block">
                                {a.desc}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {/* Área activa */}
            <div className="min-h-[320px]">
                {area === "lienzo" && <LienzoComposer initialDest={dest ?? undefined} initialGeo={initialGeo ?? undefined} />}
                {area === "editor" && <EditorPanel />}
                {area === "fragua" && <FraguaPanel />}
                {area === "pizarras" && <PizarrasPanel />}
                {area === "publicar" && <QuickPublisher initialDest={dest ?? undefined} />}
            </div>

            {/* Crear entidades (siempre visible) */}
            <EntityCreationRow area={area} />
        </div>
    );
}
