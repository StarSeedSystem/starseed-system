"use client";

// src/components/publish/publication-composer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// COMPOSER UNIVERSAL DE PUBLICACIONES de StarSeed OS.
//
// Un asistente (wizard) de 5 pasos que arranca preguntando QUÉ se publica, DESDE
// qué perfil(es), HACIA qué destinos, con qué FORMATO y CONTENIDO, y finalmente
// muestra una VISTA PREVIA antes de PUBLICAR (con resultados por destino).
//
//   Paso 1 · Tipo      → rejilla de PUBLICATION_TYPES.
//   Paso 2 · Desde     → multi-selección de los perfiles del usuario.
//   Paso 3 · Destinos  → multi-selección agrupada por DESTINATION_KINDS, cargando
//                         opciones reales por cada tipo de destino.
//   Paso 4 · Formato + contenido → selector de formato + editor según el tipo.
//   Paso 5 · Vista previa → render del preview ("Abrir completo" en modal) →
//                         botón Publicar (llama a `publish`) + resultados.
//
// SSR-safe: "use client"; toda lectura de Supabase ocurre en efectos/handlers.
// Permite `initial` para prerellenar (p. ej. desde el lienzo). Español, limpio.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
    Type,
    Newspaper,
    Image as ImageIcon,
    File as FileIcon,
    Link as LinkIcon,
    Vote,
    ScrollText,
    LayoutDashboard,
    AppWindow,
    Sparkles,
    Globe,
    FileText,
    UserCheck,
    Users,
    Users2,
    Flag,
    Send,
    BrainCircuit,
    LibraryBig,
    Box,
    Check,
    ChevronLeft,
    ChevronRight,
    Maximize2,
    Loader2,
    Plus,
    X,
    CheckCircle2,
    AlertTriangle,
    Archive,
} from "lucide-react";
import {
    PUBLICATION_TYPES,
    DESTINATION_KINDS,
    listProfiles,
    listDestinations,
    publish,
    previewOf,
    type PublicationType,
    type PublicationTypeId,
    type DestinationKind,
    type DestinationKindId,
    type DestinationOption,
    type PublishProfile,
    type PublishContent,
    type SelectedDestination,
    type DestinationResult,
    type PreviewModel,
} from "@/lib/publish/publish";

// ── Resolución de iconos (string → componente de lucide) ──

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
    Type,
    Newspaper,
    Image: ImageIcon,
    File: FileIcon,
    Link: LinkIcon,
    Vote,
    ScrollText,
    LayoutDashboard,
    AppWindow,
    Sparkles,
    Globe,
    FileText,
    UserCheck,
    Users,
    Users2,
    Flag,
    Send,
    BrainCircuit,
    LibraryBig,
    Box,
};

function Icon({ name, className }: { name: string; className?: string }) {
    const C = ICONS[name] || Sparkles;
    return <C className={className} />;
}

// ── Props del componente ──

export interface PublicationComposerInitial {
    type?: PublicationTypeId;
    format?: string;
    fromProfiles?: string[];
    destinations?: SelectedDestination[];
    content?: PublishContent;
}

export interface PublicationComposerProps {
    /** Prerelleno (p. ej. desde el lienzo: tipo `lienzo` + url de snapshot). */
    initial?: PublicationComposerInitial;
    /** Callback tras publicar con éxito (al menos un destino entregado). */
    onPublished?: (results: DestinationResult[]) => void;
}

// ── Constantes de UI ──

const STEPS = ["Tipo", "Desde", "Destinos", "Formato", "Vista previa"] as const;

const ACCENT = "#E9C46A";

// Estado del contenido editable (campos crudos de la UI).
interface DraftContent {
    title: string;
    body: string;
    url: string;
    urls: string[];
    options: string[];
}

const EMPTY_DRAFT: DraftContent = {
    title: "",
    body: "",
    url: "",
    urls: [],
    options: ["", ""],
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function PublicationComposer({ initial, onPublished }: PublicationComposerProps = {}) {
    const [step, setStep] = useState(0);

    // Paso 1: tipo.
    const [typeId, setTypeId] = useState<PublicationTypeId | null>(initial?.type ?? null);

    // Paso 2: perfiles.
    const [profiles, setProfiles] = useState<PublishProfile[]>([]);
    const [profilesLoading, setProfilesLoading] = useState(false);
    const [selectedProfiles, setSelectedProfiles] = useState<string[]>(initial?.fromProfiles ?? []);

    // Paso 3: destinos (opciones cargadas por tipo + selección).
    const [openKinds, setOpenKinds] = useState<Record<string, boolean>>({});
    const [optionsByKind, setOptionsByKind] = useState<Record<string, DestinationOption[]>>({});
    const [loadingKinds, setLoadingKinds] = useState<Record<string, boolean>>({});
    const [selectedDestinations, setSelectedDestinations] = useState<SelectedDestination[]>(
        initial?.destinations ?? [],
    );

    // Paso 4: formato + contenido.
    const [format, setFormat] = useState<string>(initial?.format ?? "");
    const [draft, setDraft] = useState<DraftContent>(() => ({
        ...EMPTY_DRAFT,
        title: initial?.content?.title ?? "",
        body: initial?.content?.body ?? "",
        url: initial?.content?.url ?? "",
        urls: initial?.content?.urls ?? [],
        options: initial?.content?.options ?? ["", ""],
    }));

    // Paso 5: publicación.
    const [publishing, setPublishing] = useState(false);
    const [results, setResults] = useState<DestinationResult[] | null>(null);
    const [fullOpen, setFullOpen] = useState(false);

    const selectedType: PublicationType | null = useMemo(
        () => (typeId ? PUBLICATION_TYPES.find((t) => t.id === typeId) ?? null : null),
        [typeId],
    );

    // Cuando se elige un tipo, fija un formato por defecto si no hay uno válido.
    useEffect(() => {
        if (selectedType && !selectedType.formats.includes(format)) {
            setFormat(selectedType.formats[0] ?? "");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedType]);

    // Carga de perfiles al entrar al paso 2 (una vez).
    useEffect(() => {
        if (step !== 1 || profiles.length > 0 || profilesLoading) return;
        let alive = true;
        setProfilesLoading(true);
        listProfiles()
            .then((rows) => {
                if (!alive) return;
                setProfiles(rows);
                // Autoselecciona el primer perfil si no hay ninguno elegido.
                if (rows.length > 0 && selectedProfiles.length === 0) {
                    setSelectedProfiles([rows[0].id]);
                }
            })
            .finally(() => alive && setProfilesLoading(false));
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    // ── Construcción del contenido normalizado a partir del borrador ──
    const content: PublishContent = useMemo(() => {
        const c: PublishContent = {};
        if (draft.title.trim()) c.title = draft.title.trim();
        if (draft.body.trim()) c.body = draft.body.trim();
        if (draft.url.trim()) c.url = draft.url.trim();
        const urls = draft.urls.map((u) => u.trim()).filter(Boolean);
        if (urls.length) c.urls = urls;
        const opts = draft.options.map((o) => o.trim()).filter(Boolean);
        if (opts.length) c.options = opts;
        return c;
    }, [draft]);

    const preview: PreviewModel | null = useMemo(
        () => (typeId ? previewOf(typeId, content, format) : null),
        [typeId, content, format],
    );

    // ── Toggles de selección ──

    function toggleProfile(id: string) {
        setSelectedProfiles((prev) =>
            prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
        );
    }

    function isDestSelected(kind: DestinationKindId, id: string) {
        return selectedDestinations.some((d) => d.kind === kind && d.id === id);
    }

    function toggleDestination(opt: DestinationOption) {
        setSelectedDestinations((prev) => {
            const exists = prev.some((d) => d.kind === opt.kind && d.id === opt.id);
            if (exists) return prev.filter((d) => !(d.kind === opt.kind && d.id === opt.id));
            return [...prev, { kind: opt.kind, id: opt.id, label: opt.label }];
        });
    }

    async function toggleKind(kind: DestinationKind) {
        const willOpen = !openKinds[kind.id];
        setOpenKinds((prev) => ({ ...prev, [kind.id]: willOpen }));
        if (willOpen && !optionsByKind[kind.id] && !loadingKinds[kind.id]) {
            setLoadingKinds((prev) => ({ ...prev, [kind.id]: true }));
            try {
                const opts = await listDestinations(kind.id);
                setOptionsByKind((prev) => ({ ...prev, [kind.id]: opts }));
            } catch {
                setOptionsByKind((prev) => ({ ...prev, [kind.id]: [] }));
            } finally {
                setLoadingKinds((prev) => ({ ...prev, [kind.id]: false }));
            }
        }
    }

    // ── Validación por paso para habilitar "Siguiente" ──
    const canNext = useMemo(() => {
        switch (step) {
            case 0:
                return Boolean(typeId);
            case 1:
                // Permitir avanzar incluso sin perfiles (se publicará como autor por defecto).
                return true;
            case 2:
                return selectedDestinations.length > 0;
            case 3: {
                // Requiere algo de contenido coherente con el tipo.
                if (!typeId) return false;
                const hasText = Boolean(content.title || content.body);
                const hasUrl = Boolean(content.url || (content.urls && content.urls.length));
                const hasOpts = Boolean(content.options && content.options.length >= 2);
                if (typeId === "imagen" || typeId === "enlace" || typeId === "archivo" || typeId === "app")
                    return hasUrl;
                if (typeId === "encuesta") return Boolean(content.title) && hasOpts;
                if (typeId === "lienzo") return hasUrl || hasText;
                return hasText;
            }
            default:
                return true;
        }
    }, [step, typeId, selectedDestinations, content]);

    function goNext() {
        if (step < STEPS.length - 1) setStep((s) => s + 1);
    }
    function goBack() {
        if (step > 0) setStep((s) => s - 1);
    }

    // ── Publicar ──
    async function handlePublish() {
        if (!typeId) return;
        setPublishing(true);
        setResults(null);
        try {
            const res = await publish({
                type: typeId,
                format,
                fromProfiles: selectedProfiles,
                destinations: selectedDestinations,
                content,
            });
            if (res.needsAuth) {
                toast.error("Inicia sesión para publicar.");
                setPublishing(false);
                return;
            }
            setResults(res.results);
            const delivered = res.results.filter((r) => r.ok).length;
            if (delivered > 0) {
                toast.success(
                    delivered === 1
                        ? "Publicado en 1 destino."
                        : "Publicado en " + delivered + " destinos.",
                );
                onPublished?.(res.results);
            } else {
                toast.error("No se pudo publicar en ningún destino.");
            }
        } catch (e: any) {
            toast.error(e?.message || "Error al publicar.");
        } finally {
            setPublishing(false);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="w-full">
            {/* Stepper */}
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-6 text-xs">
                {STEPS.map((label, i) => {
                    const done = i < step;
                    const active = i === step;
                    return (
                        <li key={label} className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => i <= step && setStep(i)}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
                                    active && "bg-amber-400/15 text-amber-200",
                                    done && "text-amber-300/80 hover:text-amber-200",
                                    !active && !done && "text-white/40",
                                )}
                            >
                                <span
                                    className={cn(
                                        "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold",
                                        active && "border-amber-400 text-amber-200",
                                        done && "border-amber-400/60 bg-amber-400/20 text-amber-200",
                                        !active && !done && "border-white/20 text-white/40",
                                    )}
                                >
                                    {done ? <Check className="h-3 w-3" /> : i + 1}
                                </span>
                                {label}
                            </button>
                            {i < STEPS.length - 1 && (
                                <ChevronRight className="h-3 w-3 text-white/20" />
                            )}
                        </li>
                    );
                })}
            </ol>

            {/* Cuerpo del paso */}
            <div className="min-h-[280px]">
                {step === 0 && (
                    <StepType typeId={typeId} onPick={setTypeId} />
                )}
                {step === 1 && (
                    <StepFrom
                        profiles={profiles}
                        loading={profilesLoading}
                        selected={selectedProfiles}
                        onToggle={toggleProfile}
                    />
                )}
                {step === 2 && (
                    <StepDestinations
                        openKinds={openKinds}
                        optionsByKind={optionsByKind}
                        loadingKinds={loadingKinds}
                        selected={selectedDestinations}
                        onToggleKind={toggleKind}
                        onToggleOption={toggleDestination}
                        isSelected={isDestSelected}
                    />
                )}
                {step === 3 && selectedType && (
                    <StepFormatContent
                        type={selectedType}
                        format={format}
                        onFormat={setFormat}
                        draft={draft}
                        onDraft={setDraft}
                    />
                )}
                {step === 4 && preview && (
                    <StepPreview
                        preview={preview}
                        profiles={profiles}
                        selectedProfiles={selectedProfiles}
                        destinations={selectedDestinations}
                        results={results}
                        onOpenFull={() => setFullOpen(true)}
                    />
                )}
            </div>

            {/* Barra de navegación */}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <Button
                    variant="ghost"
                    onClick={goBack}
                    disabled={step === 0 || publishing}
                    className="text-white/70 hover:text-white"
                >
                    <ChevronLeft className="mr-1 h-4 w-4" /> Atrás
                </Button>

                {step < STEPS.length - 1 ? (
                    <Button
                        onClick={goNext}
                        disabled={!canNext}
                        style={{ backgroundColor: ACCENT }}
                        className="text-black hover:opacity-90"
                    >
                        Siguiente <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                ) : (
                    <Button
                        onClick={handlePublish}
                        disabled={publishing || selectedDestinations.length === 0}
                        style={{ backgroundColor: ACCENT }}
                        className="text-black hover:opacity-90"
                    >
                        {publishing ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publicando…
                            </>
                        ) : (
                            <>
                                <Send className="mr-2 h-4 w-4" /> Publicar
                            </>
                        )}
                    </Button>
                )}
            </div>

            {/* Modal "Abrir completo" */}
            <Dialog open={fullOpen} onOpenChange={setFullOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-amber-50">Vista completa</DialogTitle>
                        <DialogDescription className="text-white/50">
                            Previsualización a pantalla completa de tu publicación.
                        </DialogDescription>
                    </DialogHeader>
                    {preview && <PreviewBody preview={preview} expanded />}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 1 · TIPO
// ─────────────────────────────────────────────────────────────────────────────

function StepType({
    typeId,
    onPick,
}: {
    typeId: PublicationTypeId | null;
    onPick: (id: PublicationTypeId) => void;
}) {
    return (
        <div>
            <h3 className="mb-1 text-lg font-semibold text-amber-50">¿Qué quieres publicar?</h3>
            <p className="mb-4 text-sm text-white/50">
                Elige el tipo de publicación. Cada tipo ofrece sus propios formatos y editor.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {PUBLICATION_TYPES.map((t) => {
                    const active = t.id === typeId;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => onPick(t.id)}
                            className={cn(
                                "group flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all",
                                active
                                    ? "border-amber-400/60 bg-amber-400/10 shadow-[0_0_0_1px_rgba(233,196,106,0.3)]"
                                    : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]",
                            )}
                        >
                            <span
                                className={cn(
                                    "flex h-9 w-9 items-center justify-center rounded-lg",
                                    active ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-white/60",
                                )}
                            >
                                <Icon name={t.icon} className="h-5 w-5" />
                            </span>
                            <span className="text-sm font-medium text-amber-50">{t.label}</span>
                            <span className="text-[11px] leading-snug text-white/45">{t.blurb}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 2 · DESDE (perfiles)
// ─────────────────────────────────────────────────────────────────────────────

function StepFrom({
    profiles,
    loading,
    selected,
    onToggle,
}: {
    profiles: PublishProfile[];
    loading: boolean;
    selected: string[];
    onToggle: (id: string) => void;
}) {
    return (
        <div>
            <h3 className="mb-1 text-lg font-semibold text-amber-50">¿Desde qué perfil(es)?</h3>
            <p className="mb-4 text-sm text-white/50">
                Selecciona uno o varios perfiles desde los que publicar. Puedes publicar en
                paralelo desde varias identidades.
            </p>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-white/50">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando perfiles…
                </div>
            ) : profiles.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/50">
                    No se encontraron perfiles para tu cuenta. Se publicará usando tu identidad de
                    usuario por defecto.
                </div>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {profiles.map((p) => {
                        const active = selected.includes(p.id);
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => onToggle(p.id)}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                                    active
                                        ? "border-amber-400/60 bg-amber-400/10"
                                        : "border-white/10 bg-white/[0.02] hover:border-white/25",
                                )}
                            >
                                <span
                                    className={cn(
                                        "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
                                        active ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-white/50",
                                    )}
                                >
                                    {(p.displayName || "P").slice(0, 1).toUpperCase()}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-amber-50">
                                        {p.displayName}
                                    </span>
                                    <span className="block truncate text-xs text-white/45">
                                        {p.handle ? "@" + p.handle : p.type}
                                    </span>
                                </span>
                                {active && <Check className="h-4 w-4 shrink-0 text-amber-300" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 3 · DESTINOS
// ─────────────────────────────────────────────────────────────────────────────

function StepDestinations({
    openKinds,
    optionsByKind,
    loadingKinds,
    selected,
    onToggleKind,
    onToggleOption,
    isSelected,
}: {
    openKinds: Record<string, boolean>;
    optionsByKind: Record<string, DestinationOption[]>;
    loadingKinds: Record<string, boolean>;
    selected: SelectedDestination[];
    onToggleKind: (kind: DestinationKind) => void;
    onToggleOption: (opt: DestinationOption) => void;
    isSelected: (kind: DestinationKindId, id: string) => boolean;
}) {
    const selectedCount = (kindId: string) => selected.filter((d) => d.kind === kindId).length;

    return (
        <div>
            <h3 className="mb-1 text-lg font-semibold text-amber-50">¿A dónde lo publicamos?</h3>
            <p className="mb-2 text-sm text-white/50">
                Elige uno o varios destinos. Despliega cada tipo para cargar sus opciones.
            </p>
            {selected.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                    {selected.map((d) => (
                        <Badge
                            key={d.kind + ":" + d.id}
                            variant="secondary"
                            className="gap-1 bg-amber-400/15 text-amber-100"
                        >
                            {d.label || d.id}
                        </Badge>
                    ))}
                </div>
            )}

            <div className="space-y-2">
                {DESTINATION_KINDS.map((kind) => {
                    const open = openKinds[kind.id];
                    const opts = optionsByKind[kind.id];
                    const loading = loadingKinds[kind.id];
                    const count = selectedCount(kind.id);
                    return (
                        <div
                            key={kind.id}
                            className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]"
                        >
                            <button
                                type="button"
                                onClick={() => onToggleKind(kind)}
                                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]"
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/60">
                                    <Icon name={kind.icon} className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2 text-sm font-medium text-amber-50">
                                        {kind.label}
                                        {kind.fulfillment === "registered" && (
                                            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/50">
                                                registrado
                                            </span>
                                        )}
                                    </span>
                                    <span className="block truncate text-[11px] text-white/40">
                                        {kind.blurb}
                                    </span>
                                </span>
                                {count > 0 && (
                                    <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                                        {count}
                                    </span>
                                )}
                                <ChevronRight
                                    className={cn(
                                        "h-4 w-4 shrink-0 text-white/40 transition-transform",
                                        open && "rotate-90",
                                    )}
                                />
                            </button>

                            {open && (
                                <div className="border-t border-white/10 p-2">
                                    {loading ? (
                                        <div className="flex items-center gap-2 px-2 py-2 text-xs text-white/50">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando opciones…
                                        </div>
                                    ) : !opts || opts.length === 0 ? (
                                        <div className="px-2 py-2 text-xs text-white/40">
                                            No hay opciones disponibles para este destino todavía.
                                        </div>
                                    ) : (
                                        <div className="grid gap-1.5 sm:grid-cols-2">
                                            {opts.map((opt) => {
                                                const active = isSelected(kind.id, opt.id);
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => onToggleOption(opt)}
                                                        className={cn(
                                                            "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                                                            active
                                                                ? "border-amber-400/60 bg-amber-400/10"
                                                                : "border-white/10 hover:border-white/25",
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                                                active
                                                                    ? "border-amber-400 bg-amber-400/30 text-amber-100"
                                                                    : "border-white/25",
                                                            )}
                                                        >
                                                            {active && <Check className="h-3 w-3" />}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-sm text-amber-50">
                                                                {opt.label}
                                                            </span>
                                                            {opt.sub && (
                                                                <span className="block truncate text-[11px] text-white/40">
                                                                    {opt.sub}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 4 · FORMATO + CONTENIDO
// ─────────────────────────────────────────────────────────────────────────────

function StepFormatContent({
    type,
    format,
    onFormat,
    draft,
    onDraft,
}: {
    type: PublicationType;
    format: string;
    onFormat: (f: string) => void;
    draft: DraftContent;
    onDraft: (d: DraftContent) => void;
}) {
    const set = (patch: Partial<DraftContent>) => onDraft({ ...draft, ...patch });

    return (
        <div className="space-y-5">
            <div>
                <h3 className="mb-1 text-lg font-semibold text-amber-50">Formato y contenido</h3>
                <p className="text-sm text-white/50">
                    Elige el formato de <span className="text-amber-200">{type.label}</span> y completa
                    el contenido.
                </p>
            </div>

            {/* Selector de formato */}
            <div className="flex flex-wrap gap-2">
                {type.formats.map((f) => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => onFormat(f)}
                        className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            f === format
                                ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
                                : "border-white/15 text-white/55 hover:border-white/30 hover:text-white/80",
                        )}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Editor según el tipo */}
            <div className="space-y-3">
                {/* Título: para tipos que lo usan */}
                {(type.id === "articulo" ||
                    type.id === "propuesta" ||
                    type.id === "encuesta" ||
                    type.id === "enlace" ||
                    type.id === "mixto") && (
                    <Input
                        placeholder={type.id === "encuesta" ? "Pregunta de la encuesta" : "Título"}
                        value={draft.title}
                        onChange={(e) => set({ title: e.target.value })}
                        className="bg-white/[0.03] text-amber-50"
                    />
                )}

                {/* Cuerpo de texto / markdown */}
                {(type.id === "texto" ||
                    type.id === "articulo" ||
                    type.id === "propuesta" ||
                    type.id === "mixto") && (
                    <Textarea
                        placeholder={
                            format === "markdown"
                                ? "Escribe en Markdown… (**negrita**, # títulos, listas)"
                                : "Escribe tu contenido…"
                        }
                        value={draft.body}
                        onChange={(e) => set({ body: e.target.value })}
                        className="min-h-[160px] bg-white/[0.03] text-amber-50"
                    />
                )}

                {/* URL: imagen / archivo / enlace / app / lienzo / mixto */}
                {(type.id === "imagen" ||
                    type.id === "archivo" ||
                    type.id === "enlace" ||
                    type.id === "app" ||
                    type.id === "lienzo" ||
                    type.id === "mixto") && (
                    <div className="space-y-1.5">
                        <Input
                            placeholder={
                                type.id === "enlace"
                                    ? "https://… (URL del enlace)"
                                    : type.id === "imagen"
                                      ? "URL de la imagen (https://…)"
                                      : type.id === "archivo"
                                        ? "URL del archivo (https://…)"
                                        : type.id === "app"
                                          ? "URL del embed / app"
                                          : "URL (snapshot, embed o recurso)"
                            }
                            value={draft.url}
                            onChange={(e) => set({ url: e.target.value })}
                            className="bg-white/[0.03] text-amber-50"
                        />
                        {(type.id === "imagen" || type.id === "archivo") && (
                            <p className="text-[11px] text-white/35">
                                Pega una URL pública. La subida de archivos a Storage se integra desde
                                el almacén (bucket os-media).
                            </p>
                        )}
                    </div>
                )}

                {/* Galería de imágenes (urls múltiples) */}
                {type.id === "imagen" && format === "galeria" && (
                    <UrlList
                        label="Imágenes de la galería"
                        items={draft.urls}
                        onChange={(urls) => set({ urls })}
                        placeholder="URL de imagen"
                    />
                )}

                {/* Pie de foto para imagen */}
                {type.id === "imagen" && (
                    <Input
                        placeholder="Pie de foto (opcional)"
                        value={draft.body}
                        onChange={(e) => set({ body: e.target.value })}
                        className="bg-white/[0.03] text-amber-50"
                    />
                )}

                {/* Opciones de encuesta */}
                {type.id === "encuesta" && (
                    <UrlList
                        label="Opciones"
                        items={draft.options}
                        onChange={(options) => set({ options })}
                        placeholder="Opción"
                        minItems={2}
                    />
                )}
            </div>
        </div>
    );
}

/** Editor de lista dinámica de strings (urls/opciones), con añadir/quitar. */
function UrlList({
    label,
    items,
    onChange,
    placeholder,
    minItems = 1,
}: {
    label: string;
    items: string[];
    onChange: (items: string[]) => void;
    placeholder: string;
    minItems?: number;
}) {
    const list = items.length ? items : Array(minItems).fill("");
    const setAt = (i: number, v: string) => {
        const next = [...list];
        next[i] = v;
        onChange(next);
    };
    const add = () => onChange([...list, ""]);
    const removeAt = (i: number) => {
        const next = list.filter((_, idx) => idx !== i);
        onChange(next.length ? next : Array(minItems).fill(""));
    };

    return (
        <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/55">{label}</label>
            {list.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                    <Input
                        placeholder={placeholder + " " + (i + 1)}
                        value={v}
                        onChange={(e) => setAt(i, e.target.value)}
                        className="bg-white/[0.03] text-amber-50"
                    />
                    {list.length > minItems && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeAt(i)}
                            className="h-9 w-9 shrink-0 text-white/40 hover:text-red-300"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            ))}
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={add}
                className="text-white/55 hover:text-amber-200"
            >
                <Plus className="mr-1 h-3.5 w-3.5" /> Añadir
            </Button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 5 · VISTA PREVIA + RESULTADOS
// ─────────────────────────────────────────────────────────────────────────────

function StepPreview({
    preview,
    profiles,
    selectedProfiles,
    destinations,
    results,
    onOpenFull,
}: {
    preview: PreviewModel;
    profiles: PublishProfile[];
    selectedProfiles: string[];
    destinations: SelectedDestination[];
    results: DestinationResult[] | null;
    onOpenFull: () => void;
}) {
    const fromLabels =
        selectedProfiles
            .map((id) => profiles.find((p) => p.id === id)?.displayName)
            .filter(Boolean)
            .join(", ") || "Perfil por defecto";

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-amber-50">Vista previa</h3>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenFull}
                    className="text-white/60 hover:text-amber-200"
                >
                    <Maximize2 className="mr-1.5 h-3.5 w-3.5" /> Abrir completo
                </Button>
            </div>

            {/* Resumen de envío */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
                <span className="text-white/40">Desde:</span>
                <span className="text-amber-200">{fromLabels}</span>
                <span className="text-white/20">·</span>
                <span className="text-white/40">Hacia:</span>
                <span className="text-amber-200">{destinations.length} destino(s)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {destinations.map((d) => (
                    <Badge
                        key={d.kind + ":" + d.id}
                        variant="secondary"
                        className="bg-white/10 text-white/70"
                    >
                        {d.label || d.id}
                    </Badge>
                ))}
            </div>

            {/* Cuerpo del preview */}
            <Card className="border-white/10 bg-white/[0.02]">
                <CardContent className="p-4">
                    <PreviewBody preview={preview} />
                </CardContent>
            </Card>

            {/* Resultados por destino tras publicar */}
            {results && (
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-amber-50">Resultados</h4>
                    <ul className="space-y-1.5">
                        {results.map((r) => (
                            <li
                                key={r.kind + ":" + r.id}
                                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
                            >
                                {r.ok && r.status === "delivered" ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                ) : r.ok && r.status === "registered" ? (
                                    <Archive className="h-4 w-4 shrink-0 text-amber-300" />
                                ) : (
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                                )}
                                <span className="min-w-0 flex-1 truncate text-amber-50">
                                    {r.label || r.id}
                                </span>
                                <span
                                    className={cn(
                                        "text-[11px] uppercase tracking-wide",
                                        r.ok && r.status === "delivered" && "text-emerald-300/80",
                                        r.ok && r.status === "registered" && "text-amber-300/80",
                                        !r.ok && "text-red-300/80",
                                    )}
                                >
                                    {r.status === "delivered"
                                        ? "entregado"
                                        : r.status === "registered"
                                          ? "registrado"
                                          : "fallido"}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-[11px] text-white/35">
                        "Entregado" se escribió en una tabla de entrega real; "registrado" guarda una
                        referencia (el destino aún no difunde automáticamente).
                    </p>
                </div>
            )}
        </div>
    );
}

/** Render del cuerpo de la previsualización según el `kind` del modelo. */
function PreviewBody({ preview, expanded }: { preview: PreviewModel; expanded?: boolean }) {
    const { kind, title, body, url, urls, options, domain } = preview;

    return (
        <div className="space-y-3">
            {title && <div className="text-base font-semibold text-amber-50">{title}</div>}

            {(kind === "text" || kind === "markdown") && body && (
                <p
                    className={cn(
                        "whitespace-pre-wrap text-sm leading-relaxed text-white/75",
                        !expanded && "line-clamp-[12]",
                    )}
                >
                    {body}
                </p>
            )}

            {kind === "image" && url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={url}
                    alt={title || "imagen"}
                    className="max-h-[420px] w-full rounded-lg object-cover"
                />
            )}

            {kind === "gallery" && urls && urls.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {urls.slice(0, expanded ? urls.length : 4).map((u, i) => (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            key={i}
                            src={u}
                            alt={"imagen " + (i + 1)}
                            className="h-40 w-full rounded-md object-cover"
                        />
                    ))}
                </div>
            )}

            {kind === "file" && url && (
                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:border-white/25"
                >
                    <FileIcon className="h-5 w-5 text-amber-300" />
                    <span className="min-w-0 flex-1 truncate text-sm text-amber-50">
                        {decodeURIComponent(url.split("/").pop() || "archivo")}
                    </span>
                </a>
            )}

            {kind === "link" && url && (
                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:border-white/25"
                >
                    <div className="flex items-center gap-2 text-xs text-white/45">
                        <LinkIcon className="h-3.5 w-3.5" /> {domain || url}
                    </div>
                    {body && <p className="mt-1 text-sm text-white/70">{body}</p>}
                </a>
            )}

            {kind === "poll" && (
                <div className="space-y-1.5">
                    {(options || []).map((o, i) => (
                        <div
                            key={i}
                            className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-amber-50"
                        >
                            {o}
                        </div>
                    ))}
                </div>
            )}

            {kind === "embed" && url && (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">
                    <div className="mb-1 flex items-center gap-2 text-xs text-white/45">
                        <AppWindow className="h-3.5 w-3.5" /> Embed
                    </div>
                    <span className="break-all text-amber-200">{url}</span>
                </div>
            )}

            {kind === "canvas" && (
                <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-4 text-sm text-white/55">
                    <div className="mb-1 flex items-center gap-2 text-amber-200">
                        <LayoutDashboard className="h-4 w-4" /> Lienzo / Pizarra
                    </div>
                    {body || url || "Snapshot del lienzo listo para publicar."}
                </div>
            )}

            {/* Mixto: si hay imagen + texto, mostramos ambos */}
            {kind === "markdown" && url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={url} alt="adjunto" className="max-h-72 w-full rounded-lg object-cover" />
            )}
        </div>
    );
}
