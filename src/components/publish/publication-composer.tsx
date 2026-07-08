"use client";

// src/components/publish/publication-composer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// COMPOSER UNIVERSAL DE PUBLICACIONES de StarSeed OS · alineado al MÓDULO 5
// (El Lienzo Universal de Creación — flujo guiado por INTENCIÓN).
//
// El acto creador sigue el orden del Módulo 5:
//   Paso 1 · Área         → Política · Educación · Cultura · General (AREAS).
//   Paso 2 · Sub-Área      → si el área la define (carga plantilla de campos).
//   Paso 3 · Desde         → multi-selección de los perfiles del usuario.
//   Paso 4 · Destino+Tipo  → Publicación Principal / Historia (POST_KINDS) +
//                            multi-selección de destinos (DESTINATION_KINDS).
//   Paso 5 · Formato+cont. → formato + editor (incluye campos de la plantilla).
//   Paso 6 · Config+Ámbito → visibilidad, votación (toggle + umbral), alcance.
//   Paso 7 · Vista previa   → preview + ALCANCE (reachOf) + "Abrir completo" +
//                            "Abrir en el Lienzo" (/pizarra) → Publicar.
//
// SSR-safe: "use client"; toda lectura de Supabase ocurre en efectos/handlers.
// Permite `initial` para prerellenar (p. ej. desde el lienzo). Español, limpio.
// Aditivo: conserva el editor, destinos, preview y la lógica de `publish`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
    Scale,
    Gavel,
    GraduationCap,
    BookOpen,
    Palette,
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
    Compass,
    Eye,
    EyeOff,
    Upload,
    Images,
    Code2,
    Radio,
    FolderKanban,
    Server,
    ArrowUp,
    ArrowDown,
    Trash2,
    Bold,
    Italic,
    Heading2,
    List as ListIcon,
    Quote,
    Music,
    Video,
    WandSparkles,
    Square,
    RectangleVertical,
    RectangleHorizontal,
    Wand2,
    Pencil,
} from "lucide-react";
import {
    PUBLICATION_TYPES,
    DESTINATION_KINDS,
    AREAS,
    POST_KINDS,
    DEFAULT_VOTING,
    listProfiles,
    listDestinations,
    publish,
    previewOf,
    reachOf,
    subAreaById,
    RATIOS,
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
    type Area,
    type AreaId,
    type SubArea,
    type PostKindId,
    type VotingConfig,
    type PostContentAttachment,
    type MainRatio,
} from "@/lib/publish/publish";
import EgoContextOption from "@/components/aurora/ego-context-option";
import { createEgoForContext, type EgoContextKind } from "@/lib/aurora/ego";
import ReachSelector from "@/components/reach/reach-selector";
import {
    defaultReach,
    reachFromDestinations,
    reachToDestinations,
    type Reach,
} from "@/lib/reach/reach";
import MentionInput, { type MentionInputHandle } from "@/components/mentions/mention-input";
import { MentionChip } from "@/components/mentions/entity-chip";
import {
    parseMentions,
    persistMentions,
    type Mention,
} from "@/lib/mentions/mentions";
// Subida universal de archivos (Adenda 64 §9): adjuntar imagen/archivo real
// (storage `os-files`) en vez de depender solo de pegar una URL externa.
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";
// Vista previa EN VIVO (paso 7): la MISMA tarjeta que se ve en el feed.
import { RichPostCard } from "@/components/network/feed/rich-post-card";
import type { FeedPost } from "@/lib/feed/network-feed";
// Contenido vivo en publicaciones (Adenda "Cultura social"): selector de modo
// por adjunto (estático/edición en vivo/canal en vivo) + aprovisionamiento.
import { LiveModePicker, provisionLiveBacking } from "@/components/posts/live-attachment";
// ── Adenda "Lienzo de Creación Universal" (aditivo, modos/paneles opcionales) ──
// Creador de Layouts ilimitados (modo "Diseño": bloques + código libre).
import LayoutBuilder, {
    defaultLayoutDoc,
    layoutHasContent,
    layoutDocToHtml,
    type LayoutDoc,
} from "@/components/publish/layout-builder";
// Editor ligero de imagen (recorte/rotación/filtros) para adjuntos de imagen.
import ImageEditorDialog from "@/components/publish/image-editor-dialog";
// "Compartir como" mensaje/correo (tarjeta-referencia, sin duplicar el post).
import SharePostActions from "@/components/publish/share-post-actions";
// Botón global "Generar con Aurora" (texto del cuerpo, modo clásico).
import AuroraGenerateButton from "@/components/publish/aurora-generate-button";

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
    Scale,
    Gavel,
    GraduationCap,
    BookOpen,
    Palette,
    Images,
    Code2,
    Radio,
    FolderKanban,
    Server,
    Square,
    RectangleVertical,
    RectangleHorizontal,
    Wand2,
    Maximize2,
};

function Icon({ name, className }: { name: string; className?: string }) {
    const C = ICONS[name] || Sparkles;
    return <C className={className} />;
}

// ── Aditivo · mapea un destino de publicación al tipo de contexto del ego ──
const DEST_TO_EGO_KIND: Record<string, EgoContextKind> = {
    pagina: "pagina",
    perfil: "perfil",
    grupo: "grupo",
    comunidad: "comunidad",
    entidad_federativa: "entidad_federativa",
    mensaje: "mensaje",
    chat_ia: "mensaje",
    red: "publicacion",
    biblioteca: "publicacion",
    carpeta: "publicacion",
};

/**
 * Crea un Agente Aurora (ego.md) por cada destino entregado, adjunto a ese
 * contexto (página, grupo, comunidad, publicación…). Tolerante a fallos.
 */
async function createEgosForDelivered(
    results: DestinationResult[],
    name: string,
    content: PublishContent,
): Promise<void> {
    const delivered = results.filter((r) => r.ok);
    if (delivered.length === 0) return;
    const baseName =
        (name || "").trim() ||
        (content?.title || "").trim() ||
        "Aurora";
    let created = 0;
    for (const r of delivered) {
        const kind = DEST_TO_EGO_KIND[r.kind] ?? "publicacion";
        const ref = r.recordId || r.id;
        const label = r.label || r.kind;
        const ego = await createEgoForContext({
            name: `Agente · ${baseName}`,
            summary: `Agente Aurora (ego.md) para ${label}. Integración Aurora <-> Astraura.`,
            attachment: { kind, ref, label },
        });
        if (ego) created += 1;
    }
    if (created > 0) {
        toast.success(
            created === 1
                ? "Agente Aurora (ego.md) creado para el contexto."
                : `${created} agentes Aurora (ego.md) creados para los contextos.`,
        );
    }
}

// ── Props del componente ──

export interface PublicationComposerInitial {
    type?: PublicationTypeId;
    format?: string;
    fromProfiles?: string[];
    destinations?: SelectedDestination[];
    content?: PublishContent;
    // ── Módulo 5 (opcionales) ──
    area?: AreaId;
    subArea?: string;
    postKind?: PostKindId;
    scope?: string;
}

export interface PublicationComposerProps {
    /** Prerelleno (p. ej. desde el lienzo: tipo `lienzo` + url de snapshot). */
    initial?: PublicationComposerInitial;
    /** Callback tras publicar con éxito (al menos un destino entregado). */
    onPublished?: (results: DestinationResult[]) => void;
}

// ── Constantes de UI ──

const STEPS = [
    "Área",
    "Sub-Área",
    "Desde",
    "Destino + Tipo",
    "Formato",
    "Ámbito",
    "Vista previa",
] as const;

const ACCENT = "#E9C46A";

const VISIBILITIES: { id: string; label: string; hint: string }[] = [
    { id: "public", label: "Pública", hint: "Visible para cualquiera en la red." },
    { id: "members", label: "Miembros", hint: "Sólo miembros del destino." },
    { id: "private", label: "Privada", hint: "Sólo tú y los destinatarios directos." },
];

// Estado del contenido editable (campos crudos de la UI).
interface DraftContent {
    title: string;
    body: string;
    url: string;
    urls: string[];
    options: string[];
    /** Campos de la plantilla de Sub-Área (id → valor). */
    template: Record<string, string>;
    /** NUEVO · Adjuntos multi-formato (carrusel + ventana incrustada), en orden. */
    attachments: PostContentAttachment[];
    /** NUEVO · Proporción de la vista principal. */
    ratio: MainRatio;
    /** NUEVO · Si se muestra la vista previa de adjuntos (publicaciones "silenciosas" opcionales). */
    showPreview: boolean;
    /** NUEVO (Adenda "Creador de Layouts") · modo "Diseño" activo para esta publicación. */
    designMode: boolean;
    /** NUEVO (Adenda "Creador de Layouts") · documento del Creador de Layouts. */
    layout: LayoutDoc;
}

const EMPTY_DRAFT: DraftContent = {
    title: "",
    body: "",
    url: "",
    urls: [],
    options: ["", ""],
    template: {},
    attachments: [],
    ratio: "auto",
    showPreview: true,
    designMode: false,
    layout: defaultLayoutDoc(),
};

/** Genera un id corto y único para un adjunto nuevo del compositor. */
function newAttId(): string {
    return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Nombre legible desde una URL (para adjuntos añadidos por URL, sin subida). */
function hostOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

/** Plantillas rápidas por tipo: jumpstart de título/cuerpo, nunca destructivo
 *  (se ANEXAN al cuerpo existente en vez de sobrescribirlo). */
const QUICK_TEMPLATES: Partial<Record<PublicationTypeId, { label: string; title?: string; body: string }[]>> = {
    texto: [
        { label: "Anuncio breve", body: "Tengo una noticia rápida que compartir con la comunidad:\n\n" },
        { label: "Pregunta abierta", body: "Me gustaría conocer vuestra opinión sobre…\n\n" },
    ],
    articulo: [
        { label: "Tutorial", title: "Cómo…", body: "## Introducción\n\n## Pasos\n\n1. \n2. \n3. \n\n## Conclusión\n" },
        { label: "Análisis", title: "Análisis: ", body: "## Contexto\n\n## Hallazgos\n\n## Conclusión\n" },
    ],
    propuesta: [
        { label: "Propuesta estándar", body: "**Problema:** \n\n**Propuesta:** \n\n**Impacto esperado:** \n" },
    ],
    codigo: [
        { label: "Snippet documentado", body: "Descripción del código:\n\n```\n// pega tu código aquí\n```\n" },
        { label: "Demo de proyecto", body: "Qué hace este programa y cómo probarlo:\n\n" },
    ],
    proyecto: [
        { label: "Resumen de proyecto", body: "**Objetivo:** \n\n**Estado actual:** \n\n**Cómo colaborar:** \n" },
    ],
    transmision: [
        { label: "Aviso de directo", body: "Empezamos transmisión en directo sobre… ¡Únete!\n\n" },
    ],
    servidor: [
        { label: "Invitación al servidor", body: "Nuevo nodo/servidor disponible para la comunidad:\n\n" },
    ],
    mixto: [
        { label: "Historia rápida", body: "Hoy quiero compartir…\n\n" },
    ],
};

/** Construye una `FeedPost` simulada a partir del borrador actual, para que la
 *  vista previa del paso 7 use LITERALMENTE el mismo componente de tarjeta que
 *  el feed real (`RichPostCard`). Id estable (no cambia en cada tecla) para que
 *  `useLikes` no repita peticiones de red en cada render. */
function buildPreviewPost(draft: DraftContent, content: PublishContent): FeedPost {
    const attachments = (content.attachments ?? []).map((a, i) => ({
        id: a.id || `preview-${i}`,
        kind: a.kind,
        url: a.url ?? null,
        href: a.url ?? null,
        name: a.name ?? null,
        title: a.title ?? a.name ?? null,
        description: a.description ?? null,
        thumbnail: a.thumbnail ?? null,
        mime: a.mime ?? null,
        content: a.content ?? null,
        language: a.language ?? null,
        // Contenido vivo: la vista previa exercita LiveAttachment igual que el feed real.
        liveMode: a.liveMode ?? null,
        livePermission: a.livePermission ?? null,
        liveSpaceId: a.liveSpaceId ?? null,
        liveServerId: a.liveServerId ?? null,
        liveServerSlug: a.liveServerSlug ?? null,
        liveGroupSlug: a.liveGroupSlug ?? null,
    }));
    return {
        id: "__composer_preview__",
        postId: "__composer_preview__",
        author: { id: "yo", name: "Tú", handle: "", avatar: "" },
        content: [draft.title, draft.body].filter(Boolean).join("\n\n"),
        media: [],
        type: attachments.length > 0 ? "mixed" : "text",
        likes: 0,
        commentsCount: 0,
        shares: 0,
        createdAt: new Date().toISOString(),
        likedByMe: false,
        tags: [],
        attachment: null,
        attachments,
        mainRatio: draft.ratio,
        showPreview: draft.showPreview,
        area: null,
        isReal: true,
    };
}

// Cómo cada Área/Sub-Área sugiere un tipo de publicación de base.
function suggestTypeFor(areaId: AreaId | null, subId: string | null): PublicationTypeId {
    if (areaId === "politica") return subId === "caso_judicial" ? "articulo" : "propuesta";
    if (areaId === "educacion") return subId === "articulo" ? "articulo" : "mixto";
    if (areaId === "cultura") {
        if (subId === "evento") return "mixto";
        if (subId === "publicacion") return "imagen";
        return "articulo";
    }
    return "texto";
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function PublicationComposer({ initial, onPublished }: PublicationComposerProps = {}) {
    const [step, setStep] = useState(0);

    // Paso 1: Área principal (Módulo 5).
    const [areaId, setAreaId] = useState<AreaId | null>(initial?.area ?? null);
    // Paso 2: Sub-Área (si aplica).
    const [subAreaId, setSubAreaId] = useState<string | null>(initial?.subArea ?? null);

    // Tipo de publicación (derivado de la intención; editable en Formato).
    const [typeId, setTypeId] = useState<PublicationTypeId | null>(initial?.type ?? null);

    // Paso 3: perfiles.
    const [profiles, setProfiles] = useState<PublishProfile[]>([]);
    const [profilesLoading, setProfilesLoading] = useState(false);
    const [selectedProfiles, setSelectedProfiles] = useState<string[]>(initial?.fromProfiles ?? []);

    // Paso 4: Tipo de publicación (Principal/Historia) + destinos.
    const [postKind, setPostKind] = useState<PostKindId>(initial?.postKind ?? "principal");
    const [openKinds, setOpenKinds] = useState<Record<string, boolean>>({});
    const [optionsByKind, setOptionsByKind] = useState<Record<string, DestinationOption[]>>({});
    const [loadingKinds, setLoadingKinds] = useState<Record<string, boolean>>({});
    const [selectedDestinations, setSelectedDestinations] = useState<SelectedDestination[]>(
        initial?.destinations ?? [],
    );

    // ── Alcance unificado (Reach) · "publicar a todo StarSeed o a comunidades" ──
    // Fuente de verdad de alto nivel; se sincroniza con `selectedDestinations`.
    const [reach, setReach] = useState<Reach>(() =>
        initial?.destinations && initial.destinations.length > 0
            ? reachFromDestinations(initial.destinations)
            : defaultReach(),
    );

    // ── Menciones estructuradas #/@ presentes en el cuerpo ──
    const [mentions, setMentions] = useState<Mention[]>(
        initial?.content?.body ? parseMentions(initial.content.body) : [],
    );

    // Paso 5: formato + contenido.
    const [format, setFormat] = useState<string>(initial?.format ?? "");
    const [draft, setDraft] = useState<DraftContent>(() => ({
        ...EMPTY_DRAFT,
        title: initial?.content?.title ?? "",
        body: initial?.content?.body ?? "",
        url: initial?.content?.url ?? "",
        urls: initial?.content?.urls ?? [],
        options: initial?.content?.options ?? ["", ""],
        template: {},
    }));

    // Paso 6: configuración contextual + ámbito (Módulo 5).
    const [visibility, setVisibility] = useState<string>("public");
    const [voting, setVoting] = useState<VotingConfig>({ ...DEFAULT_VOTING });
    const [scope, setScope] = useState<string>(initial?.scope ?? "");

    // Paso 7: publicación.
    const [publishing, setPublishing] = useState(false);
    const [results, setResults] = useState<DestinationResult[] | null>(null);
    const [fullOpen, setFullOpen] = useState(false);

    // ── Aditivo · Agente Aurora (ego.md) para este contexto ──
    // Si se activa, tras publicar se crea un ego.md adjunto a cada destino.
    const [egoForContext, setEgoForContext] = useState(false);
    const [egoName, setEgoName] = useState("");

    const area: Area | null = useMemo(
        () => (areaId ? AREAS.find((a) => a.id === areaId) ?? null : null),
        [areaId],
    );
    const subArea: SubArea | null = useMemo(
        () => (areaId && subAreaId ? subAreaById(areaId, subAreaId) ?? null : null),
        [areaId, subAreaId],
    );
    const hasSubAreas = (area?.sub.length ?? 0) > 0;

    const selectedType: PublicationType | null = useMemo(
        () => (typeId ? PUBLICATION_TYPES.find((t) => t.id === typeId) ?? null : null),
        [typeId],
    );

    // Al elegir Área (o Sub-Área), sugiere un tipo de publicación de base si no
    // hay uno ya fijado por `initial`. No pisa una elección explícita posterior.
    useEffect(() => {
        if (!areaId) return;
        if (initial?.type) return;
        setTypeId(suggestTypeFor(areaId, subAreaId));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [areaId, subAreaId]);

    // Cuando se elige un tipo, fija un formato por defecto si no hay uno válido.
    useEffect(() => {
        if (selectedType && !selectedType.formats.includes(format)) {
            setFormat(selectedType.formats[0] ?? "");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedType]);

    // Carga de perfiles al entrar al paso "Desde" (índice 2), una vez.
    useEffect(() => {
        if (step !== 2 || profiles.length > 0 || profilesLoading) return;
        let alive = true;
        setProfilesLoading(true);
        listProfiles()
            .then((rows) => {
                if (!alive) return;
                setProfiles(rows);
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
        // Campos de la plantilla de Sub-Área → content.meta.template (+ área/sub).
        const tmpl: Record<string, string> = {};
        for (const [k, v] of Object.entries(draft.template)) {
            if (v && v.trim()) tmpl[k] = v.trim();
        }
        // Menciones estructuradas #/@ detectadas en el cuerpo (Lienzo Universal:
        // la entidad conserva a quién menciona / qué adjunta).
        const bodyMentions = parseMentions(draft.body);
        if (Object.keys(tmpl).length || areaId || bodyMentions.length) {
            c.meta = {
                ...(areaId ? { area: areaId } : {}),
                ...(subAreaId ? { subArea: subAreaId } : {}),
                ...(Object.keys(tmpl).length ? { template: tmpl } : {}),
                ...(bodyMentions.length ? { mentions: bodyMentions } : {}),
            };
        }
        // NUEVO · Adjuntos multi-formato + proporción + vista previa opcional.
        const attachments = [...draft.attachments];
        // Adenda "Creador de Layouts": en modo Diseño, el layout ES el contenido
        // principal — se serializa a UN adjunto ejecutable (kind:"programa", sin
        // url, con `content` = HTML autocontenido) que `EmbeddedContentWindow` ya
        // sabe ejecutar en un iframe sandbox (ver Adenda en ese componente).
        if (draft.designMode && layoutHasContent(draft.layout)) {
            attachments.unshift({
                id: "layout-main",
                kind: "programa",
                content: layoutDocToHtml(draft.layout),
                name: draft.title || "Diseño",
                title: draft.title || "Diseño",
            });
        }
        if (attachments.length > 0) c.attachments = attachments;
        c.mainRatio = draft.ratio;
        c.showPreview = draft.showPreview;
        return c;
    }, [draft, areaId, subAreaId]);

    // Vista previa EN VIVO (paso 7 + diálogo "Abrir completo"): misma tarjeta que el feed real.
    const previewPost: FeedPost = useMemo(() => buildPreviewPost(draft, content), [draft, content]);

    const preview: PreviewModel | null = useMemo(
        () => (typeId ? previewOf(typeId, content, format) : null),
        [typeId, content, format],
    );

    // Texto legible del alcance efectivo (resumen de destinos), para pasos 5 y 6.
    const reachText = useMemo(() => reachOf(selectedDestinations), [selectedDestinations]);

    // ── Toggles de selección ──

    function pickArea(id: AreaId) {
        setAreaId(id);
        setSubAreaId(null); // resetea la sub-área al cambiar de área
    }

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
            const next = exists
                ? prev.filter((d) => !(d.kind === opt.kind && d.id === opt.id))
                : [...prev, { kind: opt.kind, id: opt.id, label: opt.label }];
            // Mantén el pill de alcance en sincronía con la edición manual.
            setReach(reachFromDestinations(next));
            return next;
        });
    }

    // El ReachSelector es el control unificado: al cambiar el alcance, deriva los
    // destinos reales del composer (reachToDestinations) manteniendo el flujo de
    // publicación existente. Si el alcance apunta a "profile", usa el primer perfil.
    function handleReachChange(next: Reach) {
        setReach(next);
        const derived = reachToDestinations(next, {
            profileId: selectedProfiles[0],
            resolveLabel: (id) =>
                selectedDestinations.find((d) => d.id === id)?.label,
        });
        setSelectedDestinations(derived);
    }

    async function toggleKind(kind: DestinationKind) {
        const willOpen = !openKinds[kind.id];
        setOpenKinds((prev) => ({ ...prev, [kind.id]: willOpen }));
        if (willOpen && !optionsByKind[kind.id] && !loadingKinds[kind.id]) {
            setLoadingKinds((prev) => ({ ...prev, [kind.id]: true }));
            try {
                // Adenda "Lienzo de Creación Universal": pagina/grupo/comunidad/
                // entidad_federativa/evento arrancan mostrando sólo destinos "donde
                // tengo permiso" (dueño o miembro) — el buscador de ese kind ofrece
                // un botón "Todas" para ver la lista completa de siempre.
                const onlyMine = PERMISSIONED_KIND_IDS.has(kind.id);
                const opts = await listDestinations(kind.id, onlyMine ? { onlyMine: true } : undefined);
                setOptionsByKind((prev) => ({ ...prev, [kind.id]: opts }));
            } catch {
                setOptionsByKind((prev) => ({ ...prev, [kind.id]: [] }));
            } finally {
                setLoadingKinds((prev) => ({ ...prev, [kind.id]: false }));
            }
        }
    }

    /** Re-busca las opciones de un kind con texto/permiso (caja de búsqueda del
     *  "Ajuste avanzado"). Siempre refresca (a diferencia de `toggleKind`, que
     *  sólo carga la primera vez). */
    async function searchKind(kind: DestinationKind, opts: { query?: string; onlyMine?: boolean }) {
        setLoadingKinds((prev) => ({ ...prev, [kind.id]: true }));
        try {
            const res = await listDestinations(kind.id, opts);
            setOptionsByKind((prev) => ({ ...prev, [kind.id]: res }));
        } catch {
            setOptionsByKind((prev) => ({ ...prev, [kind.id]: [] }));
        } finally {
            setLoadingKinds((prev) => ({ ...prev, [kind.id]: false }));
        }
    }

    // ── Navegación: salta el paso Sub-Área si el área no tiene sub-áreas ──
    function nextStepFrom(s: number): number {
        let n = s + 1;
        if (n === 1 && !hasSubAreas) n = 2; // sin sub-áreas → directo a "Desde"
        return Math.min(n, STEPS.length - 1);
    }
    function prevStepFrom(s: number): number {
        let n = s - 1;
        if (n === 1 && !hasSubAreas) n = 0; // sin sub-áreas → vuelve a "Área"
        return Math.max(n, 0);
    }

    // ── Validación por paso para habilitar "Siguiente" ──
    const canNext = useMemo(() => {
        switch (step) {
            case 0:
                return Boolean(areaId);
            case 1:
                // Sub-área: si hay sub-áreas, exige elegir una; si no, libre.
                return !hasSubAreas || Boolean(subAreaId);
            case 2:
                return true; // perfiles opcionales (autor por defecto)
            case 3:
                return selectedDestinations.length > 0;
            case 4: {
                if (!typeId) return false;
                const hasText = Boolean(content.title || content.body);
                const hasUrl = Boolean(content.url || (content.urls && content.urls.length));
                const hasOpts = Boolean(content.options && content.options.length >= 2);
                const hasTemplate = Boolean(content.meta && (content.meta as any).template);
                const hasAttachments = Boolean(content.attachments && content.attachments.length > 0);
                if (typeId === "imagen" || typeId === "enlace" || typeId === "archivo" || typeId === "app")
                    return hasUrl || hasTemplate || hasAttachments;
                if (typeId === "encuesta") return Boolean(content.title) && hasOpts;
                if (typeId === "lienzo") return hasUrl || hasText || hasTemplate || hasAttachments;
                // ── Adenda "Publicaciones ricas" (aditivo) ──
                if (typeId === "galeria" || typeId === "transmision" || typeId === "servidor")
                    return hasUrl || hasAttachments || hasText;
                if (typeId === "codigo" || typeId === "proyecto")
                    return hasText || hasAttachments;
                return hasText || hasTemplate || hasAttachments;
            }
            case 5:
                return Boolean(visibility);
            default:
                return true;
        }
    }, [step, areaId, subAreaId, hasSubAreas, typeId, selectedDestinations, content, visibility]);

    function goNext() {
        setStep((s) => nextStepFrom(s));
    }
    function goBack() {
        setStep((s) => prevStepFrom(s));
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
                // ── Módulo 5: intención + configuración contextual ──
                area: areaId ?? undefined,
                subArea: subAreaId ?? undefined,
                postKind,
                voting,
                scope: scope.trim() || undefined,
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
                // Aditivo: persistir menciones #/@ por cada publicación entregada.
                // DEFENSIVO: si la tabla `entity_mentions` no existe todavía, no
                // lanza — las menciones ya viajan dentro de post_references.mentions.
                if (mentions.length > 0) {
                    for (const r of res.results) {
                        if (r.ok && r.recordId) {
                            await persistMentions({
                                sourceType: "post",
                                sourceId: r.recordId,
                                mentions,
                            });
                        }
                    }
                }
                // Aditivo: crear un Agente Aurora (ego.md) para el contexto.
                if (egoForContext) {
                    await createEgosForDelivered(res.results, egoName, content);
                }
            } else {
                toast.error("No se pudo publicar en ningún destino.");
            }
        } catch (e: any) {
            toast.error(e?.message || "Error al publicar.");
        } finally {
            setPublishing(false);
        }
    }

    const isLast = step === STEPS.length - 1;

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
                    const skipped = i === 1 && !hasSubAreas;
                    if (skipped) return null;
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
                {step === 0 && <StepArea areaId={areaId} onPick={pickArea} />}
                {step === 1 && area && (
                    <StepSubArea area={area} subAreaId={subAreaId} onPick={setSubAreaId} />
                )}
                {step === 2 && (
                    <StepFrom
                        profiles={profiles}
                        loading={profilesLoading}
                        selected={selectedProfiles}
                        onToggle={toggleProfile}
                    />
                )}
                {step === 3 && (
                    <StepDestinationAndKind
                        postKind={postKind}
                        onPostKind={setPostKind}
                        openKinds={openKinds}
                        optionsByKind={optionsByKind}
                        loadingKinds={loadingKinds}
                        selected={selectedDestinations}
                        onToggleKind={toggleKind}
                        onToggleOption={toggleDestination}
                        isSelected={isDestSelected}
                        onSearchKind={searchKind}
                        reach={reach}
                        onReachChange={handleReachChange}
                    />
                )}
                {step === 4 && selectedType && (
                    <StepFormatContent
                        type={selectedType}
                        subArea={subArea}
                        area={area}
                        format={format}
                        onFormat={setFormat}
                        draft={draft}
                        onDraft={setDraft}
                        onMentions={setMentions}
                        onChangeType={setTypeId}
                    />
                )}
                {step === 5 && (
                    <StepConfigScope
                        visibility={visibility}
                        onVisibility={setVisibility}
                        voting={voting}
                        onVoting={setVoting}
                        scope={scope}
                        onScope={setScope}
                        reach={reachText}
                    />
                )}
                {step === 6 && preview && (
                    <StepPreview
                        preview={preview}
                        previewPost={previewPost}
                        area={area}
                        subArea={subArea}
                        postKind={postKind}
                        profiles={profiles}
                        selectedProfiles={selectedProfiles}
                        destinations={selectedDestinations}
                        reach={reachText}
                        mentions={mentions}
                        results={results}
                        onOpenFull={() => setFullOpen(true)}
                    />
                )}
            </div>

            {/* Aditivo · Agente Aurora (ego.md) para este contexto */}
            {isLast && (
                <div className="mt-6">
                    <EgoContextOption
                        contextLabel="esta publicación / contexto"
                        kind="publicacion"
                        value={egoForContext}
                        onChange={setEgoForContext}
                        egoName={egoName}
                        onEgoName={setEgoName}
                    />
                </div>
            )}

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

                {!isLast ? (
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

            {/* Modal "Abrir completo" — la MISMA tarjeta de publicación, a tamaño de página */}
            <Dialog open={fullOpen} onOpenChange={setFullOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-amber-50">Vista completa</DialogTitle>
                        <DialogDescription className="text-white/50">
                            Así se verá tu publicación completa en el feed.
                        </DialogDescription>
                    </DialogHeader>
                    <RichPostCard post={previewPost} preview />
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 1 · ÁREA PRINCIPAL (Módulo 5)
// ─────────────────────────────────────────────────────────────────────────────

function StepArea({
    areaId,
    onPick,
}: {
    areaId: AreaId | null;
    onPick: (id: AreaId) => void;
}) {
    return (
        <div>
            <h3 className="mb-1 text-lg font-semibold text-amber-50">¿Cuál es tu intención?</h3>
            <p className="mb-4 text-sm text-white/50">
                Elige el <span className="text-amber-200">Área Principal</span> de tu creación. El
                acto creador se guía por la intención.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {AREAS.map((a) => {
                    const active = a.id === areaId;
                    return (
                        <button
                            key={a.id}
                            type="button"
                            onClick={() => onPick(a.id)}
                            className={cn(
                                "group flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                                active
                                    ? "border-amber-400/60 bg-amber-400/10 shadow-[0_0_0_1px_rgba(233,196,106,0.3)]"
                                    : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]",
                            )}
                        >
                            <span
                                className={cn(
                                    "flex h-10 w-10 items-center justify-center rounded-lg",
                                    active ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-white/60",
                                )}
                            >
                                <Icon name={a.icon} className="h-5 w-5" />
                            </span>
                            <span className="text-sm font-medium text-amber-50">{a.label}</span>
                            <span className="text-[11px] leading-snug text-white/45">{a.blurb}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 2 · SUB-ÁREA (si aplica)
// ─────────────────────────────────────────────────────────────────────────────

function StepSubArea({
    area,
    subAreaId,
    onPick,
}: {
    area: Area;
    subAreaId: string | null;
    onPick: (id: string) => void;
}) {
    return (
        <div>
            <h3 className="mb-1 text-lg font-semibold text-amber-50">
                {area.label} · elige el tipo de creación
            </h3>
            <p className="mb-4 text-sm text-white/50">
                Cada sub-área carga una <span className="text-amber-200">plantilla</span> y
                herramientas específicas para tu contenido.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {area.sub.map((s) => {
                    const active = s.id === subAreaId;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => onPick(s.id)}
                            className={cn(
                                "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
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
                                <Icon name={s.icon || "Sparkles"} className="h-5 w-5" />
                            </span>
                            <span className="text-sm font-medium text-amber-50">{s.label}</span>
                            {s.blurb && (
                                <span className="text-[11px] leading-snug text-white/45">{s.blurb}</span>
                            )}
                            {s.template && s.template.length > 0 && (
                                <span className="mt-1 rounded-full bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-white/50">
                                    {s.template.length} campos
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 3 · DESDE (perfiles)
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
// PASO 4 · DESTINO + TIPO (Principal/Historia + destinos)
// ─────────────────────────────────────────────────────────────────────────────

function StepDestinationAndKind({
    postKind,
    onPostKind,
    openKinds,
    optionsByKind,
    loadingKinds,
    selected,
    onToggleKind,
    onToggleOption,
    isSelected,
    onSearchKind,
    reach,
    onReachChange,
}: {
    postKind: PostKindId;
    onPostKind: (k: PostKindId) => void;
    openKinds: Record<string, boolean>;
    optionsByKind: Record<string, DestinationOption[]>;
    loadingKinds: Record<string, boolean>;
    selected: SelectedDestination[];
    onToggleKind: (kind: DestinationKind) => void;
    onToggleOption: (opt: DestinationOption) => void;
    isSelected: (kind: DestinationKindId, id: string) => boolean;
    onSearchKind: (kind: DestinationKind, opts: { query?: string; onlyMine?: boolean }) => void;
    reach: Reach;
    onReachChange: (r: Reach) => void;
}) {
    const selectedCount = (kindId: string) => selected.filter((d) => d.kind === kindId).length;
    const [advancedOpen, setAdvancedOpen] = useState(false);

    return (
        <div className="space-y-5">
            <div>
                <h3 className="mb-1 text-lg font-semibold text-amber-50">Alcance y tipo</h3>
                <p className="text-sm text-white/50">
                    Elige si será <span className="text-amber-200">Publicación Principal</span> o{" "}
                    <span className="text-amber-200">Historia</span>, y su{" "}
                    <span className="text-amber-200">alcance</span>: todo StarSeed o comunidades
                    específicas.
                </p>
            </div>

            {/* Control UNIFICADO de alcance (Reach) */}
            <ReachSelector value={reach} onChange={onReachChange} />

            {/* Ajuste avanzado: multi-destino granular (aditivo) */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02]">
                <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03]"
                >
                    <span className="text-sm font-medium text-amber-50/90">
                        Ajuste avanzado de destinos
                    </span>
                    <span className="flex items-center gap-2">
                        {selected.length > 0 && (
                            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                                {selected.length} destino(s)
                            </span>
                        )}
                        <ChevronRight
                            className={cn(
                                "h-4 w-4 shrink-0 text-white/40 transition-transform",
                                advancedOpen && "rotate-90",
                            )}
                        />
                    </span>
                </button>
                {advancedOpen && (
                    <div className="border-t border-white/10 p-3">
                        <AdvancedDestinations
                            openKinds={openKinds}
                            optionsByKind={optionsByKind}
                            loadingKinds={loadingKinds}
                            selected={selected}
                            onToggleKind={onToggleKind}
                            onToggleOption={onToggleOption}
                            isSelected={isSelected}
                            selectedCount={selectedCount}
                            onSearchKind={onSearchKind}
                        />
                    </div>
                )}
            </div>

            {/* Tipo de publicación: Principal / Historia */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {POST_KINDS.map((k) => {
                    const active = k.id === postKind;
                    return (
                        <button
                            key={k.id}
                            type="button"
                            onClick={() => onPostKind(k.id)}
                            className={cn(
                                "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                                active
                                    ? "border-amber-400/60 bg-amber-400/10 shadow-[0_0_0_1px_rgba(233,196,106,0.3)]"
                                    : "border-white/10 bg-white/[0.02] hover:border-white/25",
                            )}
                        >
                            <span
                                className={cn(
                                    "flex h-9 w-9 items-center justify-center rounded-lg",
                                    active ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-white/60",
                                )}
                            >
                                <Icon name={k.icon} className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-medium text-amber-50">{k.label}</span>
                                <span className="block text-[11px] leading-snug text-white/45">
                                    {k.blurb}
                                </span>
                            </span>
                            {active && <Check className="ml-auto h-4 w-4 shrink-0 text-amber-300" />}
                        </button>
                    );
                })}
            </div>

        </div>
    );
}

// ── Multi-destino granular (ajuste avanzado del alcance) ──
/** Kinds donde "permiso" tiene sentido (dueño/miembro) — ver `listDestinations`. */
const PERMISSIONED_KIND_IDS = new Set<DestinationKindId>(["pagina", "grupo", "comunidad", "entidad_federativa", "evento"]);

/** Caja de búsqueda + "con permiso / todas" para UN kind de destino (Adenda
 *  "Lienzo de Creación Universal"). Componente propio para poder usar sus
 *  propios hooks de debounce sin violar las reglas de hooks dentro de un map(). */
function KindSearchBox({
    kind,
    onSearch,
}: {
    kind: DestinationKind;
    onSearch: (opts: { query?: string; onlyMine?: boolean }) => void;
}) {
    const [query, setQuery] = useState("");
    const [onlyMine, setOnlyMine] = useState(true);
    const firstRun = useRef(true);

    useEffect(() => {
        if (firstRun.current) {
            firstRun.current = false;
            return;
        }
        const t = window.setTimeout(() => onSearch({ query, onlyMine }), 300);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, onlyMine]);

    return (
        <div className="mb-2 flex items-center gap-1.5">
            <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar ${kind.label.toLowerCase()}…`}
                className="h-7 flex-1 bg-white/[0.03] text-xs text-amber-50"
            />
            <button
                type="button"
                onClick={() => setOnlyMine((v) => !v)}
                title={onlyMine ? "Mostrando sólo donde tengo permiso — pulsa para ver todas" : "Mostrando todas — pulsa para ver sólo donde tengo permiso"}
                className={cn(
                    "shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors",
                    onlyMine
                        ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                        : "border-white/15 text-white/45 hover:border-white/30",
                )}
            >
                {onlyMine ? "Con permiso" : "Todas"}
            </button>
        </div>
    );
}

function AdvancedDestinations({
    openKinds,
    optionsByKind,
    loadingKinds,
    selected,
    onToggleKind,
    onToggleOption,
    isSelected,
    selectedCount,
    onSearchKind,
}: {
    openKinds: Record<string, boolean>;
    optionsByKind: Record<string, DestinationOption[]>;
    loadingKinds: Record<string, boolean>;
    selected: SelectedDestination[];
    onToggleKind: (kind: DestinationKind) => void;
    onToggleOption: (opt: DestinationOption) => void;
    isSelected: (kind: DestinationKindId, id: string) => boolean;
    selectedCount: (kindId: string) => number;
    onSearchKind: (kind: DestinationKind, opts: { query?: string; onlyMine?: boolean }) => void;
}) {
    return (
        <div>
            <p className="mb-2 text-xs text-white/50">
                Afina el alcance eligiendo destinos concretos (páginas, chats, bibliotecas…). Se
                combinan con el alcance elegido arriba.
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
                                    {PERMISSIONED_KIND_IDS.has(kind.id) && (
                                        <KindSearchBox kind={kind} onSearch={(opts) => onSearchKind(kind, opts)} />
                                    )}
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
// PASO 5 · FORMATO + CONTENIDO (incluye campos de la plantilla de Sub-Área)
// ─────────────────────────────────────────────────────────────────────────────

function StepFormatContent({
    type,
    subArea,
    area,
    format,
    onFormat,
    draft,
    onDraft,
    onMentions,
    onChangeType,
}: {
    type: PublicationType;
    subArea: SubArea | null;
    /** Área principal (sólo para dar contexto a Aurora al generar contenido). */
    area?: Area | null;
    format: string;
    onFormat: (f: string) => void;
    draft: DraftContent;
    onDraft: (d: DraftContent) => void;
    onMentions?: (m: Mention[]) => void;
    /** Permite anular el tipo sugerido por Área/Sub-Área (p. ej. elegir Galería,
     *  Código/Programa, Transmisión, Proyecto o Servidor). */
    onChangeType?: (id: PublicationTypeId) => void;
}) {
    const bodyRef = useRef<MentionInputHandle>(null);
    const [imgEditOpen, setImgEditOpen] = useState(false);
    const set = (patch: Partial<DraftContent>) => onDraft({ ...draft, ...patch });
    const setTemplate = (id: string, value: string) =>
        onDraft({ ...draft, template: { ...draft.template, [id]: value } });

    // Encuesta no ofrece el modo Diseño (sus opciones son un requisito
    // estructurado propio) — si se cambia a Encuesta con Diseño ya activo, se
    // sale de él para no dejar el paso sin forma de completar el requisito.
    useEffect(() => {
        if (type.id === "encuesta" && draft.designMode) {
            onDraft({ ...draft, designMode: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type.id]);

    const templates = QUICK_TEMPLATES[type.id] ?? [];
    const applyTemplate = (tpl: { label: string; title?: string; body: string }) => {
        onDraft({
            ...draft,
            title: draft.title || tpl.title || draft.title,
            body: draft.body ? draft.body + "\n\n" + tpl.body : tpl.body,
        });
    };

    return (
        <div className="space-y-5">
            <div>
                <h3 className="mb-1 text-lg font-semibold text-amber-50">Formato y contenido</h3>
                <p className="text-sm text-white/50">
                    Elige el formato de <span className="text-amber-200">{type.label}</span> y completa
                    el contenido.
                </p>
            </div>

            {/* Tipo de publicación: anula la sugerencia automática si hace falta */}
            {onChangeType && (
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/55">Tipo de publicación</label>
                    <div className="flex flex-wrap gap-1.5">
                        {PUBLICATION_TYPES.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => onChangeType(t.id)}
                                className={cn(
                                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                                    t.id === type.id
                                        ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
                                        : "border-white/15 text-white/55 hover:border-white/30 hover:text-white/80",
                                )}
                            >
                                <Icon name={t.icon} className="h-3.5 w-3.5" /> {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* NUEVO (Adenda "Creador de Layouts") · modo de creación: Clásico
                (editor de siempre, intacto) o Diseño (bloques/código libre).
                No se ofrece para Encuesta: sus opciones son un requisito
                estructurado propio que el modo Diseño no sustituye. */}
            {type.id !== "encuesta" && (
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/55">Modo de creación</label>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => set({ designMode: false })}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                                !draft.designMode
                                    ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
                                    : "border-white/15 text-white/55 hover:border-white/30 hover:text-white/80",
                            )}
                        >
                            <Type className="h-3.5 w-3.5" /> Clásico
                        </button>
                        <button
                            type="button"
                            onClick={() => set({ designMode: true })}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                                draft.designMode
                                    ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                                    : "border-white/15 text-white/55 hover:border-white/30 hover:text-white/80",
                            )}
                        >
                            <LayoutDashboard className="h-3.5 w-3.5" /> Diseño (layouts + código)
                        </button>
                    </div>
                </div>
            )}

            {draft.designMode && type.id !== "encuesta" ? (
                <LayoutBuilder value={draft.layout} onChange={(layout) => set({ layout })} />
            ) : (
                <>
            {/* Plantilla de la Sub-Área (Módulo 5): campos específicos primero */}
            {subArea && subArea.template && subArea.template.length > 0 && (
                <div className="space-y-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                        <ScrollText className="h-4 w-4" /> Plantilla · {subArea.label}
                    </div>
                    {subArea.template.map((f) => (
                        <div key={f.id} className="space-y-1">
                            <label className="text-xs font-medium text-amber-50/90">{f.label}</label>
                            {f.kind === "textarea" ? (
                                <Textarea
                                    placeholder={f.placeholder}
                                    value={draft.template[f.id] || ""}
                                    onChange={(e) => setTemplate(f.id, e.target.value)}
                                    className="min-h-[110px] bg-white/[0.03] text-amber-50"
                                />
                            ) : (
                                <Input
                                    placeholder={f.placeholder}
                                    value={draft.template[f.id] || ""}
                                    onChange={(e) => setTemplate(f.id, e.target.value)}
                                    className="bg-white/[0.03] text-amber-50"
                                />
                            )}
                            {f.hint && <p className="text-[11px] text-white/35">{f.hint}</p>}
                        </div>
                    ))}
                </div>
            )}

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
                {(type.id === "articulo" ||
                    type.id === "propuesta" ||
                    type.id === "encuesta" ||
                    type.id === "enlace" ||
                    type.id === "codigo" ||
                    type.id === "proyecto" ||
                    type.id === "servidor" ||
                    type.id === "transmision" ||
                    type.id === "galeria" ||
                    type.id === "mixto") && (
                    <Input
                        placeholder={type.id === "encuesta" ? "Pregunta de la encuesta" : "Título"}
                        value={draft.title}
                        onChange={(e) => set({ title: e.target.value })}
                        className="bg-white/[0.03] text-amber-50"
                    />
                )}

                {/* Plantillas rápidas por tipo (jumpstart, nunca destructivo) */}
                {templates.length > 0 && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-white/55">Plantillas rápidas</label>
                        <div className="flex flex-wrap gap-1.5">
                            {templates.map((tpl) => (
                                <button
                                    key={tpl.label}
                                    type="button"
                                    onClick={() => applyTemplate(tpl)}
                                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs text-white/60 transition-colors hover:border-amber-400/40 hover:text-amber-200"
                                >
                                    <WandSparkles className="h-3 w-3" /> {tpl.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {(type.id === "texto" ||
                    type.id === "articulo" ||
                    type.id === "propuesta" ||
                    type.id === "codigo" ||
                    type.id === "proyecto" ||
                    type.id === "servidor" ||
                    type.id === "transmision" ||
                    type.id === "mixto") && (
                    <div className="space-y-1.5">
                        {/* Barra básica de formato (negrita/cursiva/título/lista/cita/código) */}
                        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1.5">
                            <ToolbarBtn title="Negrita" icon={Bold} onClick={() => bodyRef.current?.wrapSelection("**", "**", "texto en negrita")} />
                            <ToolbarBtn title="Cursiva" icon={Italic} onClick={() => bodyRef.current?.wrapSelection("*", "*", "texto en cursiva")} />
                            <ToolbarBtn title="Título" icon={Heading2} onClick={() => bodyRef.current?.wrapSelection("\n## ", "", "Título")} />
                            <ToolbarBtn title="Lista" icon={ListIcon} onClick={() => bodyRef.current?.wrapSelection("\n- ", "", "elemento")} />
                            <ToolbarBtn title="Cita" icon={Quote} onClick={() => bodyRef.current?.wrapSelection("\n> ", "", "cita")} />
                            <ToolbarBtn title="Código" icon={Code2} onClick={() => bodyRef.current?.wrapSelection("`", "`", "código")} />
                            <span className="mx-1 h-4 w-px bg-white/10" />
                            <AuroraGenerateButton
                                kind="texto"
                                context={`Publicación de tipo "${type.label}"${area ? " · área " + area.label : ""}${subArea ? " · " + subArea.label : ""}.`}
                                currentText={draft.body}
                                onResult={(text) => set({ body: draft.body ? draft.body + "\n\n" + text : text })}
                                size="xs"
                            />
                        </div>
                        <MentionInput
                            ref={bodyRef}
                            value={draft.body}
                            onChange={(body) => set({ body })}
                            onMentionsChange={onMentions}
                            placeholder={
                                format === "markdown"
                                    ? "Escribe en Markdown… Usa @ para mencionar y # para etiquetar."
                                    : "Escribe tu contenido… Usa @ para mencionar y # para etiquetar entidades."
                            }
                        />
                    </div>
                )}

                {(type.id === "imagen" ||
                    type.id === "archivo" ||
                    type.id === "enlace" ||
                    type.id === "app" ||
                    type.id === "lienzo" ||
                    type.id === "mixto") && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
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
                                <AttachFilePickerButton
                                    onPick={(picked: UniversalAttachment[]) => {
                                        const first = picked[0];
                                        if (first?.url) set({ url: first.url });
                                    }}
                                    accept={type.id === "imagen" ? "image/*" : undefined}
                                    folder="publicaciones"
                                    title={type.id === "imagen" ? "Subir imagen" : "Subir archivo"}
                                    hideTabs={["neuronas"]}
                                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 text-xs font-medium text-amber-100 hover:bg-amber-400/15"
                                >
                                    <Upload className="h-3.5 w-3.5" /> Subir
                                </AttachFilePickerButton>
                            )}
                            {type.id === "imagen" && draft.url && (
                                <button
                                    type="button"
                                    title="Editar imagen (recorte, rotación, filtros)"
                                    onClick={() => setImgEditOpen(true)}
                                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-medium text-white/60 hover:border-white/30 hover:text-white/90"
                                >
                                    <Pencil className="h-3.5 w-3.5" /> Editar
                                </button>
                            )}
                        </div>
                        {(type.id === "imagen" || type.id === "archivo") && (
                            <p className="text-[11px] text-white/35">
                                Sube un archivo real (queda alojado en tu cuenta) o pega una URL pública.
                            </p>
                        )}
                        {type.id === "imagen" && (
                            <ImageEditorDialog open={imgEditOpen} onOpenChange={setImgEditOpen} srcUrl={draft.url} onApply={(url) => set({ url })} />
                        )}
                    </div>
                )}

                {(type.id === "imagen" || type.id === "galeria") && format === "galeria" && (
                    <UrlList
                        label="Imágenes de la galería"
                        items={draft.urls}
                        onChange={(urls) => set({ urls })}
                        placeholder="URL de imagen"
                    />
                )}

                {(type.id === "imagen" || type.id === "galeria") && (
                    <Input
                        placeholder="Pie de foto (opcional)"
                        value={draft.body}
                        onChange={(e) => set({ body: e.target.value })}
                        className="bg-white/[0.03] text-amber-50"
                    />
                )}

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

            {/* Adjuntos multi-formato (opcional, cualquier tipo): carrusel + ventana
                incrustada, proporción de la vista principal y su visibilidad. */}
            <AttachmentsManager
                attachments={draft.attachments}
                onChange={(attachments) => set({ attachments })}
                ratio={draft.ratio}
                onRatio={(ratio) => set({ ratio })}
                showPreview={draft.showPreview}
                onShowPreview={(showPreview) => set({ showPreview })}
            />
                </>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADJUNTOS MULTI-FORMATO (Adenda "Publicaciones ricas") — gestor universal
// ─────────────────────────────────────────────────────────────────────────────

const ATTACHMENT_KIND_OPTIONS: { id: string; label: string }[] = [
    { id: "enlace", label: "Enlace" },
    { id: "imagen", label: "Imagen" },
    { id: "video", label: "Vídeo" },
    { id: "audio", label: "Audio" },
    { id: "pagina", label: "Página interna" },
    { id: "app", label: "App / programa" },
    { id: "pizarra", label: "Pizarra" },
    { id: "servidor", label: "Servidor" },
    { id: "archivo", label: "Archivo" },
];

const ATTACHMENT_KIND_ICON: Record<string, ComponentType<{ className?: string }>> = {
    imagen: ImageIcon,
    video: Video,
    audio: Music,
    archivo: FileIcon,
    enlace: LinkIcon,
    pagina: FileText,
    app: AppWindow,
    programa: AppWindow,
    widget: LayoutDashboard,
    pizarra: LayoutDashboard,
    servidor: Server,
    codigo: Code2,
    markdown: FileText,
};

function AttKindIcon({ kind, className }: { kind: string; className?: string }) {
    const C = ATTACHMENT_KIND_ICON[kind] || FileIcon;
    return <C className={className} />;
}

function IconBtn({
    title, onClick, disabled, children, className,
}: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent",
                className,
            )}
        >
            {children}
        </button>
    );
}

function ToolbarBtn({
    title, onClick, icon: IconCmp,
}: { title: string; onClick: () => void; icon: ComponentType<{ className?: string }> }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md border border-white/10 bg-white/[0.03] text-white/60 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
        >
            <IconCmp className="h-3.5 w-3.5" />
        </button>
    );
}

function AttachmentsManager({
    attachments, onChange, ratio, onRatio, showPreview, onShowPreview,
}: {
    attachments: PostContentAttachment[];
    onChange: (next: PostContentAttachment[]) => void;
    ratio: MainRatio;
    onRatio: (r: MainRatio) => void;
    showPreview: boolean;
    onShowPreview: (v: boolean) => void;
}) {
    const [urlDraft, setUrlDraft] = useState("");
    const [kindDraft, setKindDraft] = useState<string>("enlace");
    // Motor de la pizarra al adjuntar (Adenda tldraw): "starseed" (por defecto,
    // sin cambios) o "tldraw" — sólo relevante cuando kindDraft === "pizarra".
    const [pizarraEngineDraft, setPizarraEngineDraft] = useState<"starseed" | "tldraw">("starseed");

    const addFromPicker = (picked: UniversalAttachment[]) => {
        const next: PostContentAttachment[] = picked.map((p) => ({
            id: newAttId(),
            kind: p.kind === "image" ? "imagen" : p.kind === "video" ? "video" : p.kind === "audio" ? "audio" : "archivo",
            url: p.url,
            name: p.name,
            mime: p.mime,
        }));
        onChange([...attachments, ...next]);
    };

    const addFromUrl = () => {
        let url = urlDraft.trim();
        // Pizarra sin URL pegada: adjunta el Lienzo universal por defecto.
        if (!url && kindDraft === "pizarra") url = "/pizarra";
        if (!url) return;
        // Motor tldraw elegido para el adjunto pizarra: añade `?engine=tldraw`
        // (se fusiona con cualquier query ya presente en la URL). El resto del
        // sistema (EmbeddedContentWindow, modos vivos de live-attachment.tsx)
        // ya respeta cualquier query string existente sin cambios.
        if (kindDraft === "pizarra" && pizarraEngineDraft === "tldraw") {
            const [path, query = ""] = url.split("?");
            const params = new URLSearchParams(query);
            params.set("engine", "tldraw");
            url = `${path}?${params.toString()}`;
        }
        onChange([...attachments, { id: newAttId(), kind: kindDraft, url, name: hostOf(url) }]);
        setUrlDraft("");
    };

    const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= attachments.length) return;
        const next = [...attachments];
        const tmp = next[i];
        next[i] = next[j];
        next[j] = tmp;
        onChange(next);
    };
    const makeMain = (i: number) => {
        if (i <= 0) return;
        const next = [...attachments];
        const [it] = next.splice(i, 1);
        next.unshift(it);
        onChange(next);
    };
    const removeAt = (i: number) => onChange(attachments.filter((_, idx) => idx !== i));

    // ── Contenido vivo (Adenda "Cultura social"): modo por adjunto ──────────
    const [liveOpenFor, setLiveOpenFor] = useState<Record<string, boolean>>({});
    const [provisioningFor, setProvisioningFor] = useState<Record<string, boolean>>({});
    // ── Editor de imagen (Adenda "Lienzo de Creación Universal") ────────────
    const [editingImgId, setEditingImgId] = useState<string | null>(null);
    const editingImg = attachments.find((a) => a.id === editingImgId) || null;

    const patchAttachment = (id: string, patch: Partial<PostContentAttachment>) => {
        onChange(attachments.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    };

    const handleProvision = async (a: PostContentAttachment) => {
        if (!a.liveMode || a.liveMode === "estatico") return;
        setProvisioningFor((p) => ({ ...p, [a.id]: true }));
        try {
            const res = await provisionLiveBacking({
                mode: a.liveMode,
                permission: a.livePermission ?? undefined,
                title: a.title || a.name || hostOf(a.url || "") || "Adjunto en vivo",
                groupSlug: a.liveGroupSlug ?? undefined,
            });
            if (!res.ok) {
                toast.error(res.needsAuth ? "Inicia sesión para activar el modo en vivo." : res.error || "No se pudo activar el modo en vivo.");
                return;
            }
            patchAttachment(a.id, res.patch || {});
            toast.success("Modo en vivo activado para este adjunto.");
        } finally {
            setProvisioningFor((p) => ({ ...p, [a.id]: false }));
        }
    };

    return (
        <div className="space-y-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
                    <Images className="h-4 w-4" /> Adjuntos (opcional, cualquier formato — puedes añadir varios)
                </div>
                <button
                    type="button"
                    onClick={() => onShowPreview(!showPreview)}
                    title={showPreview ? "Ocultar vista previa" : "Mostrar vista previa"}
                    className="flex cursor-pointer items-center gap-2 text-xs text-white/60 hover:text-white/85"
                >
                    <span className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", showPreview ? "bg-cyan-400/70" : "bg-white/15")}>
                        <span className={cn("h-4 w-4 rounded-full bg-white transition-transform", showPreview && "translate-x-4")} />
                    </span>
                    {showPreview ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    Mostrar vista previa
                </button>
            </div>

            {/* Añadir: picker universal (multi-archivo de golpe) + URL manual */}
            <div className="flex flex-wrap items-center gap-2">
                <AttachFilePickerButton
                    onPick={addFromPicker}
                    folder="publicaciones"
                    title="Adjuntar archivos"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 text-xs font-medium text-cyan-100 hover:bg-cyan-400/15"
                >
                    <Upload className="h-3.5 w-3.5" /> Añadir archivos
                </AttachFilePickerButton>
                <div className="flex min-w-[240px] flex-1 items-center gap-1.5">
                    <select
                        value={kindDraft}
                        onChange={(e) => setKindDraft(e.target.value)}
                        className="h-9 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-white/[0.03] px-2 text-xs text-amber-50"
                    >
                        {ATTACHMENT_KIND_OPTIONS.map((k) => (
                            <option key={k.id} value={k.id} className="bg-[#0d0f14]">
                                {k.label}
                            </option>
                        ))}
                    </select>
                    {kindDraft === "pizarra" && (
                        <select
                            value={pizarraEngineDraft}
                            onChange={(e) => setPizarraEngineDraft(e.target.value === "tldraw" ? "tldraw" : "starseed")}
                            title="Motor de la pizarra adjunta"
                            className="h-9 shrink-0 cursor-pointer rounded-lg border border-cyan-400/25 bg-cyan-400/5 px-2 text-xs text-cyan-100"
                        >
                            <option value="starseed" className="bg-[#0d0f14]">Motor: StarSeed</option>
                            <option value="tldraw" className="bg-[#0d0f14]">Motor: tldraw (pro)</option>
                        </select>
                    )}
                    <Input
                        placeholder={kindDraft === "pizarra" ? "URL de la pizarra (vacío = nueva)" : "Pegar URL (página, app, pizarra, servidor, vídeo…)"}
                        value={urlDraft}
                        onChange={(e) => setUrlDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                addFromUrl();
                            }
                        }}
                        className="h-9 flex-1 bg-white/[0.03] text-amber-50"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={addFromUrl} className="h-9 shrink-0 px-2.5">
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Lista reordenable (flechas) */}
            {attachments.length > 0 && (
                <div className="space-y-1.5">
                    {attachments.map((a, i) => {
                        const live = Boolean(a.liveMode && a.liveMode !== "estatico");
                        const liveOpen = Boolean(liveOpenFor[a.id]);
                        return (
                            <div key={a.id} className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
                                <div className="flex items-center gap-2 px-2.5 py-2">
                                    <AttKindIcon kind={a.kind} className="h-4 w-4 shrink-0 text-white/50" />
                                    <span className="min-w-0 flex-1 truncate text-xs text-amber-50">
                                        {a.name || a.title || a.url || "Adjunto"}
                                    </span>
                                    {i === 0 && (
                                        <span className="shrink-0 rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-200">
                                            Principal
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setLiveOpenFor((p) => ({ ...p, [a.id]: !p[a.id] }))}
                                        title="Modo del adjunto: estático o en vivo (edición/canal)"
                                        className={cn(
                                            "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors",
                                            live
                                                ? "border-rose-400/40 bg-rose-400/10 text-rose-200"
                                                : "border-white/10 text-white/40 hover:border-white/25",
                                        )}
                                    >
                                        <Radio className="h-3 w-3" />
                                        {live ? (a.liveMode === "canal" ? "Canal" : "Edición viva") : "Estático"}
                                    </button>
                                    <div className="flex shrink-0 items-center gap-0.5">
                                        {a.kind === "imagen" && a.url && (
                                            <IconBtn title="Editar imagen" onClick={() => setEditingImgId(a.id)}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </IconBtn>
                                        )}
                                        <IconBtn title="Subir" onClick={() => move(i, -1)} disabled={i === 0}>
                                            <ArrowUp className="h-3.5 w-3.5" />
                                        </IconBtn>
                                        <IconBtn title="Bajar" onClick={() => move(i, 1)} disabled={i === attachments.length - 1}>
                                            <ArrowDown className="h-3.5 w-3.5" />
                                        </IconBtn>
                                        {i !== 0 && (
                                            <IconBtn title="Hacer principal" onClick={() => makeMain(i)}>
                                                <Maximize2 className="h-3.5 w-3.5" />
                                            </IconBtn>
                                        )}
                                        <IconBtn title="Quitar" onClick={() => removeAt(i)} className="hover:text-red-300">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </IconBtn>
                                    </div>
                                </div>
                                {liveOpen && (
                                    <div className="border-t border-white/10 bg-white/[0.02] p-2.5">
                                        <LiveModePicker
                                            mode={a.liveMode ?? "estatico"}
                                            permission={a.livePermission}
                                            groupSlug={a.liveGroupSlug}
                                            provisioned={Boolean(a.liveSpaceId || a.liveServerId)}
                                            busy={Boolean(provisioningFor[a.id])}
                                            onModeChange={(mode) =>
                                                patchAttachment(
                                                    a.id,
                                                    mode === "estatico"
                                                        ? { liveMode: "estatico", livePermission: null, liveSpaceId: null, liveServerId: null, liveServerSlug: null, liveGroupSlug: null }
                                                        : { liveMode: mode },
                                                )
                                            }
                                            onPermissionChange={(permission) => patchAttachment(a.id, { livePermission: permission })}
                                            onGroupSlugChange={(slug) => patchAttachment(a.id, { liveGroupSlug: slug })}
                                            onProvision={() => void handleProvision(a)}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Proporción de la vista principal */}
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/55">Proporción de la vista principal</label>
                <div className="flex flex-wrap gap-1.5">
                    {RATIOS.map((r) => (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => onRatio(r.id)}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                                ratio === r.id
                                    ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                                    : "border-white/15 text-white/55 hover:border-white/30",
                            )}
                        >
                            <Icon name={r.icon} className="h-3.5 w-3.5" /> {r.label}
                        </button>
                    ))}
                </div>
                <p className="text-[11px] text-white/35">
                    "Auto" conserva la proporción natural con un tamaño máximo según el contexto (feed
                    compacto o página de publicación más amplia).
                </p>
            </div>

            <ImageEditorDialog
                open={Boolean(editingImg)}
                onOpenChange={(open) => !open && setEditingImgId(null)}
                srcUrl={editingImg?.url || ""}
                onApply={(url) => {
                    if (editingImg) patchAttachment(editingImg.id, { url });
                }}
            />
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
// PASO 6 · CONFIGURACIÓN CONTEXTUAL + ÁMBITO (Módulo 5)
// ─────────────────────────────────────────────────────────────────────────────

function StepConfigScope({
    visibility,
    onVisibility,
    voting,
    onVoting,
    scope,
    onScope,
    reach,
}: {
    visibility: string;
    onVisibility: (v: string) => void;
    voting: VotingConfig;
    onVoting: (v: VotingConfig) => void;
    scope: string;
    onScope: (s: string) => void;
    reach: string;
}) {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="mb-1 text-lg font-semibold text-amber-50">Configuración y ámbito</h3>
                <p className="text-sm text-white/50">
                    Define la visibilidad, la votación y el ámbito de tu publicación.
                </p>
            </div>

            {/* Visibilidad */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-amber-50">
                    <Eye className="h-4 w-4 text-amber-300" /> Visibilidad
                </label>
                <div className="flex flex-wrap gap-2">
                    {VISIBILITIES.map((v) => {
                        const active = v.id === visibility;
                        return (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => onVisibility(v.id)}
                                title={v.hint}
                                className={cn(
                                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                    active
                                        ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
                                        : "border-white/15 text-white/55 hover:border-white/30 hover:text-white/80",
                                )}
                            >
                                {v.label}
                            </button>
                        );
                    })}
                </div>
                <p className="text-[11px] text-white/35">
                    {VISIBILITIES.find((v) => v.id === visibility)?.hint}
                </p>
            </div>

            {/* Votación (Módulo 5 · Votación Avanzada) */}
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <button
                    type="button"
                    onClick={() => onVoting({ ...voting, enabled: !voting.enabled })}
                    className="flex w-full items-center gap-3 text-left"
                >
                    <span
                        className={cn(
                            "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
                            voting.enabled ? "bg-amber-400/70" : "bg-white/15",
                        )}
                    >
                        <span
                            className={cn(
                                "h-4 w-4 rounded-full bg-white transition-transform",
                                voting.enabled && "translate-x-4",
                            )}
                        />
                    </span>
                    <span className="flex items-center gap-2 text-sm font-medium text-amber-50">
                        <Vote className="h-4 w-4 text-amber-300" /> Habilitar votación
                    </span>
                </button>

                {voting.enabled && (
                    <div className="space-y-3 pl-1">
                        <div className="flex flex-wrap gap-2">
                            {(["simple", "ponderada", "cuadratica"] as const).map((m) => {
                                const active = (voting.mode ?? "simple") === m;
                                return (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => onVoting({ ...voting, mode: m })}
                                        className={cn(
                                            "rounded-full border px-3 py-1 text-xs capitalize transition-colors",
                                            active
                                                ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
                                                : "border-white/15 text-white/55 hover:border-white/30",
                                        )}
                                    >
                                        {m}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-white/55">
                                Umbral de aprobación: {voting.threshold ?? 50}%
                            </label>
                            <input
                                type="range"
                                min={1}
                                max={100}
                                value={voting.threshold ?? 50}
                                onChange={(e) =>
                                    onVoting({ ...voting, threshold: Number(e.target.value) })
                                }
                                className="w-full accent-amber-400"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Ámbito / scope */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-amber-50">
                    <Compass className="h-4 w-4 text-amber-300" /> Ámbito
                </label>
                <Input
                    placeholder="Ámbito de la publicación (p. ej. local, regional, global, una comunidad…)"
                    value={scope}
                    onChange={(e) => onScope(e.target.value)}
                    className="bg-white/[0.03] text-amber-50"
                />
                <p className="text-[11px] text-white/35">
                    El ámbito declara el alcance previsto. {reach}
                </p>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 7 · VISTA PREVIA + ALCANCE + LIENZO + RESULTADOS
// ─────────────────────────────────────────────────────────────────────────────

function StepPreview({
    preview,
    previewPost,
    area,
    subArea,
    postKind,
    profiles,
    selectedProfiles,
    destinations,
    reach,
    mentions,
    results,
    onOpenFull,
}: {
    preview: PreviewModel;
    previewPost: FeedPost;
    area: Area | null;
    subArea: SubArea | null;
    postKind: PostKindId;
    profiles: PublishProfile[];
    selectedProfiles: string[];
    destinations: SelectedDestination[];
    reach: string;
    mentions: Mention[];
    results: DestinationResult[] | null;
    onOpenFull: () => void;
}) {
    const fromLabels =
        selectedProfiles
            .map((id) => profiles.find((p) => p.id === id)?.displayName)
            .filter(Boolean)
            .join(", ") || "Perfil por defecto";

    const postKindLabel = POST_KINDS.find((k) => k.id === postKind)?.label || postKind;

    // ── Adenda "Lienzo de Creación Universal" · "Compartir como" ──
    // Referencia al destino ya ENTREGADO más representativo (feed/perfil si lo
    // hay, si no el primero) para compartir SIN duplicar (tarjeta-ref, no copia
    // de contenido). Null hasta que se publica — los botones se deshabilitan.
    const sharePost = useMemo(() => {
        if (!results) return null;
        const ok = results.filter((r) => r.ok && r.recordId);
        if (!ok.length) return null;
        return ok.find((r) => r.kind === "red" || r.kind === "perfil") || ok[0];
    }, [results]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-amber-50">Vista previa</h3>
                <div className="flex items-center gap-2">
                    <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="text-white/60 hover:text-amber-200"
                    >
                        <Link href="/pizarra">
                            <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" /> Abrir en el Lienzo
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onOpenFull}
                        className="text-white/60 hover:text-amber-200"
                    >
                        <Maximize2 className="mr-1.5 h-3.5 w-3.5" /> Abrir completo
                    </Button>
                </div>
            </div>

            {/* Resumen de intención + envío */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
                {area && (
                    <Badge variant="secondary" className="bg-amber-400/15 text-amber-100">
                        {area.label}
                        {subArea ? " · " + subArea.label : ""}
                    </Badge>
                )}
                <Badge variant="secondary" className="bg-white/10 text-white/70">
                    {postKindLabel}
                </Badge>
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

            {/* Alcance (Módulo 5 · alcance transparente) */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-3 text-sm text-amber-50/90">
                <Compass className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <span>
                    <span className="font-semibold text-amber-100">Alcance: </span>
                    {reach}
                </span>
            </div>

            {/* Menciones #/@ adjuntas a la publicación */}
            {mentions.length > 0 && (
                <div className="space-y-1.5">
                    <span className="text-xs font-medium text-white/55">
                        Menciones y etiquetas ({mentions.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {mentions.map((m) => (
                            <MentionChip
                                key={m.kind + ":" + m.type + ":" + m.id}
                                mention={m}
                                linked
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Vista previa EN VIVO — la MISMA tarjeta que verás en el feed */}
            <div className="space-y-1.5">
                <span className="text-xs font-medium text-white/55">Así se verá en el feed</span>
                <RichPostCard post={previewPost} preview />
            </div>

            {/* Llamada al Lienzo de Creación (editor híbrido) */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-3">
                <span className="text-xs text-white/55">
                    ¿Necesitas el editor híbrido (Insertar · Capas · Propiedades)? Abre el Lienzo de
                    Creación ilimitado.
                </span>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href="/pizarra">
                        <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" /> Lienzo
                    </Link>
                </Button>
            </div>

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

            {/* "Compartir como" (Adenda "Lienzo de Creación Universal"): mensaje o
                correo con una tarjeta-referencia — nunca duplica la publicación. */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <SharePostActions
                    postId={sharePost?.recordId}
                    title={preview.title}
                    description={preview.body}
                />
                {!sharePost && (
                    <p className="mt-1.5 text-[11px] text-white/35">
                        Publica primero (botón "Publicar" abajo) para poder compartir una referencia.
                    </p>
                )}
            </div>
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
