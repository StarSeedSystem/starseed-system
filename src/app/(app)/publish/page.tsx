// src/app/(app)/publish/page.tsx
'use client'
import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    Scale, School, Palette, Newspaper, BookOpen, Hand, Users, Target,
    BrainCircuit, FileText, Vote, PlusCircle, Settings, Library,
    Upload, Sparkles, X, Calendar as CalendarIcon, AlertTriangle,
    Link as LinkIcon, Tags, Search, AppWindow, Bold, Italic, Underline,
    Edit, Image as ImageIcon, File as FileIcon, Type, ArrowLeft,
    Megaphone, ScrollText, CalendarPlus, Lightbulb, Globe, UserCheck,
    Building2, Users2, Flag, MapPin, Eye, EyeOff, Lock, Box,
    ChevronDown, ChevronUp, Hash, ExternalLink, Music, Video, Code2,
    Sheet, AppWindowIcon, Paperclip, AtSign, LibraryBig,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { KnowledgeNetworkSelector } from "@/components/publish/knowledge-network-selector";
import type { Category } from "@/lib/data";
import { themes, categories, courses, articles } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import { useOsPosts } from "@/hooks/use-os-entities";
import type { OsEntityType } from "@/lib/os-social";
import { Separator } from "@/components/ui/separator";
import { CanvasEditor } from "@/components/canvas-editor";
import { samplePages, sampleGroups } from "@/data/sample-entities";
import { listFederativeEntities, listPartidos } from "@/data/sample-governance";

// ─── Types ───────────────────────────────────────────────────────────────────

type Area = "politics" | "education" | "culture";
type ContentType = "canvas" | "gallery" | "file" | "text";

/** Publication types driving the composer form */
type PubType = "publicacion" | "articulo" | "evento" | "propuesta";

/** Destination category */
type DestCategory = "perfil" | "pagina" | "grupo" | "ef" | "partido";

/** Attachment types */
type AttachmentKind =
    | "imagen"
    | "video"
    | "audio"
    | "documento"
    | "hoja"
    | "codigo"
    | "objeto3d"
    | "programa"
    | "enlace";

interface Attachment {
    id: string;
    kind: AttachmentKind;
    name: string;
    /** For file-based: a local object URL or filename; for URL: the actual URL */
    value: string;
}

/** Network reference (post, entity, article, course …) */
interface NetworkRef {
    id: string;
    kind: "pagina" | "grupo" | "ef" | "partido" | "articulo" | "curso";
    label: string;
    href: string;
}

interface Destination {
    id: string;
    name: string;
    type: string;
    category: DestCategory;
    slug: string;
    avatar?: string;
    href: string;
}

/** Audience / privacy */
type Audiencia = "publico" | "seguidores" | "entidad";

// ─── Static data ─────────────────────────────────────────────────────────────

const allDestinationsLegacy = [
    { id: 'dest-1', name: "Mi Perfil", type: "Perfil Oficial", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-2', name: "E.F. del Valle Central", type: "Entidad Federativa", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-3', name: "E.F. del Norte", type: "Entidad Federativa", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-4', name: "Comunidad de Permacultura", type: "Comunidad", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-5', name: "Grupo de Estudio de IA", type: "Grupo de Estudio", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-6', name: "Red de Conocimiento Global", type: "Red de Conocimiento", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-7', name: "Artistas por la Singularidad", type: "Comunidad", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-8', name: "Canal de Eventos Globales", type: "Evento", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-9', name: "Partido Transhumanista", type: "Partido Político", avatar: "https://placehold.co/40x40.png" }
];

const areaConfig = {
    politics: {
        icon: <Scale className="w-8 h-8" />,
        title: "Política",
        description: "Proponer leyes, iniciar proyectos o abrir casos judiciales.",
        color: "text-primary border-primary/50 hover:bg-primary/10",
        allowedDestinations: ["Entidad Federativa", "Partido Político", "Perfil Oficial"],
        categories: ["Propuesta Legislativa", "Proyecto Ejecutivo", "Caso Judicial"]
    },
    education: {
        icon: <School className="w-8 h-8" />,
        title: "Educación",
        description: "Compartir conocimiento creando cursos, artículos o guías.",
        color: "text-secondary border-secondary/50 hover:bg-secondary/10",
        allowedDestinations: ["Red de Conocimiento", "Comunidad", "Evento", "Grupo de Estudio", "Perfil Oficial"],
        categories: ["Curso", "Artículo", "Guía"]
    },
    culture: {
        icon: <Palette className="w-8 h-8" />,
        title: "Cultura",
        description: "Expresar ideas, arte, organizar eventos o compartir noticias.",
        color: "text-accent border-accent/50 hover:bg-accent/10",
        allowedDestinations: ["Comunidad", "Evento", "Perfil Oficial", "Red de Conocimiento"],
        categories: ["Publicación General", "Evento", "Noticia"]
    }
};

const contentTypeConfig = {
    canvas: {
        icon: <Edit className="w-8 h-8" />,
        title: 'Lienzo Universal',
        description: 'Publicaciones ricas y de formato libre. Ideal para contenido complejo y visual.'
    },
    gallery: {
        icon: <ImageIcon className="w-8 h-8" />,
        title: 'Galería de Imágenes/Videos',
        description: 'Sube múltiples imágenes o videos que se mostrarán como un carrusel interactivo.'
    },
    file: {
        icon: <FileIcon className="w-8 h-8" />,
        title: 'Archivo Único',
        description: 'Comparte un solo archivo (PDF, audio, etc) con previsualización.'
    },
    text: {
        icon: <Type className="w-8 h-8" />,
        title: 'Solo Texto',
        description: 'Una interfaz simple para texto plano o enriquecido. Ideal para anuncios rápidos.'
    }
};

// ─── Publication type definitions ────────────────────────────────────────────

const pubTypeConfig: Record<PubType, { icon: React.ReactNode; label: string; color: string; fields: string[] }> = {
    publicacion: {
        icon: <Megaphone className="w-5 h-5" />,
        label: "Publicación",
        color: "border-blue-500/60 hover:bg-blue-500/10 text-blue-400",
        fields: ["body", "tags", "adjuntos"],
    },
    articulo: {
        icon: <ScrollText className="w-5 h-5" />,
        label: "Artículo",
        color: "border-emerald-500/60 hover:bg-emerald-500/10 text-emerald-400",
        fields: ["titulo", "body", "tags", "adjuntos"],
    },
    evento: {
        icon: <CalendarPlus className="w-5 h-5" />,
        label: "Evento",
        color: "border-amber-500/60 hover:bg-amber-500/10 text-amber-400",
        fields: ["titulo", "body", "fecha", "lugar", "tags"],
    },
    propuesta: {
        icon: <Lightbulb className="w-5 h-5" />,
        label: "Propuesta",
        color: "border-purple-500/60 hover:bg-purple-500/10 text-purple-400",
        fields: ["titulo", "body", "tags", "voto"],
    },
};

// ─── Audience options ─────────────────────────────────────────────────────────

const audienciaConfig: Record<Audiencia, { icon: React.ReactNode; label: string; desc: string }> = {
    publico: {
        icon: <Globe className="w-4 h-4" />,
        label: "Público",
        desc: "Visible para toda la red",
    },
    seguidores: {
        icon: <UserCheck className="w-4 h-4" />,
        label: "Seguidores",
        desc: "Solo quienes te siguen",
    },
    entidad: {
        icon: <Lock className="w-4 h-4" />,
        label: "Entidad",
        desc: "Miembros del destino",
    },
};

// ─── Attachment config ────────────────────────────────────────────────────────

interface AttachmentCfg {
    label: string;
    icon: React.ReactNode;
    accept?: string;
    useUrl?: boolean; // if true, show URL input instead of file picker
}

const ATTACHMENT_CFG: Record<AttachmentKind, AttachmentCfg> = {
    imagen:    { label: "Imagen",          icon: <ImageIcon className="w-3.5 h-3.5" />,    accept: "image/*" },
    video:     { label: "Vídeo",           icon: <Video className="w-3.5 h-3.5" />,         accept: "video/*" },
    audio:     { label: "Audio",           icon: <Music className="w-3.5 h-3.5" />,         accept: "audio/*" },
    documento: { label: "Documento",       icon: <FileText className="w-3.5 h-3.5" />,      accept: ".pdf,.docx,.doc,.md,.txt,.odt" },
    hoja:      { label: "Hoja de cálculo", icon: <Sheet className="w-3.5 h-3.5" />,         accept: ".xlsx,.xls,.csv,.ods" },
    codigo:    { label: "Código",          icon: <Code2 className="w-3.5 h-3.5" />,         accept: ".js,.ts,.py,.rs,.go,.java,.c,.cpp,.sh,.json,.yaml,.toml,.md" },
    objeto3d:  { label: "Objeto 3D",       icon: <Box className="w-3.5 h-3.5" />,           accept: ".glb,.gltf,.obj,.fbx" },
    programa:  { label: "Programa/App",    icon: <AppWindowIcon className="w-3.5 h-3.5" />, accept: ".zip,.tar.gz,.appimage,.deb,.rpm,.apk,.wasm" },
    enlace:    { label: "Enlace/URL",      icon: <LinkIcon className="w-3.5 h-3.5" />,      useUrl: true },
};

// ─── Network reference pool ───────────────────────────────────────────────────

function buildNetworkRefs(): NetworkRef[] {
    const refs: NetworkRef[] = [];

    samplePages.forEach((p) => {
        refs.push({ id: `page-${p.id}`, kind: "pagina", label: p.title, href: `/pagina/${p.id.replace("page-", "")}` });
    });
    sampleGroups.forEach((g) => {
        refs.push({ id: `grp-${g.id}`, kind: "grupo", label: g.name, href: `/grupo/${g.id.replace("grp-", "")}` });
    });
    listFederativeEntities().forEach((ef) => {
        refs.push({ id: `ef-${ef.slug}`, kind: "ef", label: ef.name, href: `/entidad/${ef.slug}` });
    });
    listPartidos().forEach((p) => {
        refs.push({ id: `partido-${p.slug}`, kind: "partido", label: p.name, href: `/partido/${p.slug}` });
    });
    articles.forEach((a) => {
        refs.push({ id: `art-${a.id}`, kind: "articulo", label: a.title, href: a.href });
    });
    courses.forEach((c) => {
        refs.push({ id: `course-${c.id}`, kind: "curso", label: c.title, href: c.href });
    });

    return refs;
}

const ALL_NETWORK_REFS = buildNetworkRefs();

const REF_KIND_LABELS: Record<NetworkRef["kind"], string> = {
    pagina:   "Página",
    grupo:    "Grupo",
    ef:       "E.F.",
    partido:  "Partido",
    articulo: "Artículo",
    curso:    "Curso",
};

const REF_KIND_ICONS: Record<NetworkRef["kind"], React.ReactNode> = {
    pagina:   <BookOpen className="w-3 h-3" />,
    grupo:    <Users2 className="w-3 h-3" />,
    ef:       <Building2 className="w-3 h-3" />,
    partido:  <Flag className="w-3 h-3" />,
    articulo: <ScrollText className="w-3 h-3" />,
    curso:    <School className="w-3 h-3" />,
};

// ─── Library sync logic ────────────────────────────────────────────────────────

function computeLibraryTarget(destinos: Destination[]): string {
    if (destinos.length === 0) return "Tu biblioteca personal";
    const first = destinos[0];
    switch (first.category) {
        case "perfil":  return "Tu biblioteca personal";
        case "pagina":  return `Biblioteca de "${first.name}"`;
        case "grupo":   return `Biblioteca de "${first.name}"`;
        case "ef":      return `Biblioteca institucional de "${first.name}"`;
        case "partido": return `Biblioteca del partido "${first.name}"`;
        default:        return "Tu biblioteca personal";
    }
}

// ─── LegislativeVoteConfig (preserved) ────────────────────────────────────────

function LegislativeVoteConfig() {
    const [date, setDate] = useState<Date | undefined>(addDays(new Date(), 5));
    const [isUrgent, setIsUrgent] = useState(false);

    const handleUrgentChange = (checked: boolean) => {
        setIsUrgent(checked);
        setDate(addDays(new Date(), checked ? 1 : 5));
    };

    return (
        <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
                <CardTitle className="font-headline text-xl flex items-center gap-2"><Vote /> Configuración de Votación</CardTitle>
                <CardDescription>Define los parámetros de la votación para esta propuesta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="space-y-2 flex-1">
                        <Label>Fecha Límite de Votación</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn("w-full justify-start text-left font-normal cursor-pointer", !date && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    disabled={(day) => isUrgent ? day <= new Date() || day > addDays(new Date(), 1) : day < addDays(new Date(), 5)}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="flex items-center space-x-2 pt-6">
                        <Switch id="urgent-switch" onCheckedChange={handleUrgentChange} checked={isUrgent} />
                        <Label htmlFor="urgent-switch" className="flex flex-col cursor-pointer">
                            <span className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-destructive" /> Propuesta Urgente</span>
                            <span className="font-normal text-xs text-muted-foreground">Máximo 1 día para votar.</span>
                        </Label>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Opciones de Votación Iniciales</Label>
                    <p className="text-xs text-muted-foreground">Los participantes podrán proponer más opciones en los comentarios.</p>
                    <div className="space-y-2">
                        <Input defaultValue="A favor" />
                        <Input defaultValue="En contra" />
                        <Input defaultValue="Abstención" />
                        <Button variant="outline" size="sm" className="w-full cursor-pointer"><PlusCircle />Añadir Opción</Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Destination picker (new) ─────────────────────────────────────────────────

function buildDestinations(): Destination[] {
    const dests: Destination[] = [
        {
            id: "dest-perfil",
            name: "Mi Perfil",
            type: "Perfil",
            category: "perfil",
            slug: "mi-perfil",
            avatar: "https://api.dicebear.com/9.x/glass/svg?seed=miPerfil",
            href: "/profile/mi-perfil",
        },
    ];

    // Páginas / comunidades
    samplePages.forEach((p) => {
        dests.push({
            id: `page-${p.id}`,
            name: p.title,
            type: p.kind,
            category: "pagina",
            slug: p.id.replace("page-", ""),
            href: `/pagina/${p.id.replace("page-", "")}`,
        });
    });

    // Grupos / asambleas
    sampleGroups.forEach((g) => {
        dests.push({
            id: `grp-${g.id}`,
            name: g.name,
            type: g.kind,
            category: "grupo",
            slug: g.id.replace("grp-", ""),
            avatar: g.avatar,
            href: `/grupo/${g.id.replace("grp-", "")}`,
        });
    });

    // Entidades Federativas
    listFederativeEntities().forEach((ef) => {
        dests.push({
            id: `ef-${ef.slug}`,
            name: ef.name,
            type: "E.F.",
            category: "ef",
            slug: ef.slug,
            href: `/entidad/${ef.slug}`,
        });
    });

    // Partidos
    listPartidos().forEach((p) => {
        dests.push({
            id: `partido-${p.slug}`,
            name: p.name,
            type: "Partido",
            category: "partido",
            slug: p.slug,
            href: `/partido/${p.slug}`,
        });
    });

    return dests;
}

const ALL_DESTINATIONS = buildDestinations();

const DEST_CATEGORY_LABELS: Record<DestCategory, string> = {
    perfil: "Mi Perfil",
    pagina: "Página / Comunidad",
    grupo: "Grupo / Asamblea",
    ef: "Entidad Federativa",
    partido: "Partido",
};

const DEST_CATEGORY_ICONS: Record<DestCategory, React.ReactNode> = {
    perfil: <UserCheck className="w-3.5 h-3.5" />,
    pagina: <BookOpen className="w-3.5 h-3.5" />,
    grupo: <Users2 className="w-3.5 h-3.5" />,
    ef: <Building2 className="w-3.5 h-3.5" />,
    partido: <Flag className="w-3.5 h-3.5" />,
};

// ─── Preview card (new) ───────────────────────────────────────────────────────

interface PreviewCardProps {
    pubType: PubType;
    titulo: string;
    body: string;
    tags: string[];
    audiencia: Audiencia;
    destinos: Destination[];
    attachments: Attachment[];
    refs: NetworkRef[];
}

function PreviewCard({ pubType, titulo, body, tags, audiencia, destinos, attachments, refs }: PreviewCardProps) {
    const cfg = pubTypeConfig[pubType];
    const now = new Date();

    return (
        <Card className="border border-white/10 bg-card/60 backdrop-blur-sm overflow-hidden">
            {/* header strip */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/5">
                <Avatar className="h-9 w-9 ring-1 ring-white/10">
                    <AvatarImage src="https://api.dicebear.com/9.x/glass/svg?seed=miPerfil" />
                    <AvatarFallback>Yo</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-none truncate">Tu Nombre</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {format(now, "d MMM yyyy · HH:mm", { locale: es })}
                        {destinos.length > 0 && (
                            <span className="ml-1">
                                → <span className="text-foreground/80">{destinos[0].name}</span>
                                {destinos.length > 1 && ` +${destinos.length - 1}`}
                            </span>
                        )}
                    </p>
                </div>
                <Badge variant="outline" className="shrink-0 gap-1 text-xs">
                    {cfg.icon}{cfg.label}
                </Badge>
            </div>

            {/* content */}
            <div className="px-4 py-3 space-y-2">
                {titulo && <p className="font-semibold text-base leading-snug">{titulo}</p>}
                {body ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-5">{body}</p>
                ) : (
                    !titulo && <p className="text-sm text-muted-foreground/50 italic">Tu publicación aparecerá aquí…</p>
                )}
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {tags.map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs gap-1">
                                <Hash className="w-2.5 h-2.5" />{t}
                            </Badge>
                        ))}
                    </div>
                )}
                {/* Attachments preview */}
                {attachments.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1">
                        {attachments.map((a) => (
                            <span key={a.id} className="inline-flex items-center gap-1 text-[10px] bg-muted/60 rounded px-1.5 py-0.5 text-muted-foreground">
                                {ATTACHMENT_CFG[a.kind].icon}
                                <span className="max-w-[80px] truncate">{a.name}</span>
                            </span>
                        ))}
                    </div>
                )}
                {/* References preview */}
                {refs.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1">
                        {refs.map((r) => (
                            <span key={r.id} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5 text-primary/80">
                                {REF_KIND_ICONS[r.kind]}
                                <span className="max-w-[90px] truncate">{r.label}</span>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* footer */}
            <div className="flex items-center justify-between px-4 pb-3 pt-1 border-t border-white/5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                    {audienciaConfig[audiencia].icon}
                    {audienciaConfig[audiencia].label}
                </span>
                <span className="flex items-center gap-3">
                    <span>0 ❤️</span>
                    <span>0 💬</span>
                </span>
            </div>
        </Card>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PublishPage() {
    const { toast } = useToast();

    // ── New composer state (declared early so useMemo below can reference it) ──
    const [pubType, setPubType] = useState<PubType>("publicacion");
    const [titulo, setTitulo] = useState("");
    const [body, setBody] = useState("");
    const [rawTag, setRawTag] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [audiencia, setAudiencia] = useState<Audiencia>("publico");
    const [destinos, setDestinos] = useState<Destination[]>([]);
    const [destSearch, setDestSearch] = useState("");
    const [destCatFilter, setDestCatFilter] = useState<DestCategory | "todos">("todos");
    const [eventDate, setEventDate] = useState<Date | undefined>(addDays(new Date(), 7));
    const [eventPlace, setEventPlace] = useState("");
    const [showDestPicker, setShowDestPicker] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [published, setPublished] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    // ── Attachments state ──
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [activeAttachKind, setActiveAttachKind] = useState<AttachmentKind | null>(null);
    const [attachUrlInput, setAttachUrlInput] = useState("");
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // ── References state ──
    const [networkRefs, setNetworkRefs] = useState<NetworkRef[]>([]);
    const [refSearch, setRefSearch] = useState("");
    const [showRefPicker, setShowRefPicker] = useState(false);
    const [refKindFilter, setRefKindFilter] = useState<NetworkRef["kind"] | "todos">("todos");

    // ── Derive (entityType, entitySlug) from the first selected destination ──
    // Hooks cannot be called conditionally, so we always call useOsPosts with a
    // stable pair derived here and fall back to a placeholder when nothing is chosen.
    const { entityType: activeEntityType, entitySlug: activeEntitySlug } = useMemo<{
        entityType: OsEntityType;
        entitySlug: string;
    }>(() => {
        const first = destinos[0];
        if (!first) return { entityType: "page" as OsEntityType, entitySlug: "starseed" };
        switch (first.category) {
            case "grupo":
                return { entityType: "group" as OsEntityType, entitySlug: first.slug };
            case "ef":
            case "partido":
            case "pagina":
                return { entityType: "page" as OsEntityType, entitySlug: first.slug };
            case "perfil":
            default:
                return { entityType: "page" as OsEntityType, entitySlug: `perfil-${first.slug}` };
        }
    }, [destinos]);

    // ── Real persistence hook (always called at top level) ──
    const { publish: persistPost } = useOsPosts(activeEntityType, activeEntitySlug, false);

    // ── Legacy step-flow state (preserved) ──
    const [selectedArea, setSelectedArea] = useState<Area | null>(null);
    const [selectedContentType, setSelectedContentType] = useState<ContentType | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [step, setStep] = useState(1);
    const [showVoteConfig, setShowVoteConfig] = useState(false);
    const [isCategorySelectorOpen, setCategorySelectorOpen] = useState(false);
    const [isThemeSelectorOpen, setThemeSelectorOpen] = useState(false);
    const [selectedCat, setSelectedCategories] = useState<string[]>([]);
    const [selectedTh, setSelectedThemes] = useState<string[]>([]);
    const [selectedDestinations, setSelectedDestinations] = useState<any[]>([]);
    const [isEditorOpen, setEditorOpen] = useState(false);

    const fieldSet = pubTypeConfig[pubType].fields;
    const showTitulo = fieldSet.includes("titulo");
    const showFecha = fieldSet.includes("fecha");
    const showVoto = fieldSet.includes("voto");

    // ── Destination filtering ──
    const filteredDests = useMemo(() => {
        return ALL_DESTINATIONS.filter((d) => {
            const catOk = destCatFilter === "todos" || d.category === destCatFilter;
            const searchOk = !destSearch || d.name.toLowerCase().includes(destSearch.toLowerCase());
            return catOk && searchOk;
        });
    }, [destSearch, destCatFilter]);

    // ── Tag helpers ──
    function addTag(raw: string) {
        const t = raw.trim().replace(/^#+/, "").replace(/\s+/g, "-").toLowerCase();
        if (t && !tags.includes(t)) setTags([...tags, t]);
        setRawTag("");
    }
    function removeTag(t: string) {
        setTags(tags.filter((x) => x !== t));
    }

    // ── Destination helpers ──
    function toggleDest(d: Destination) {
        if (destinos.find((x) => x.id === d.id)) {
            setDestinos(destinos.filter((x) => x.id !== d.id));
        } else {
            setDestinos([...destinos, d]);
        }
    }
    function removeDest(id: string) {
        setDestinos(destinos.filter((x) => x.id !== id));
    }

    // ── Attachment helpers ──
    function addFileAttachment(kind: AttachmentKind, file: File) {
        const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setAttachments((prev) => [...prev, { id, kind, name: file.name, value: file.name }]);
    }
    function addUrlAttachment() {
        const url = attachUrlInput.trim();
        if (!url) return;
        const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const name = (() => { try { return new URL(url).hostname; } catch { return url; } })();
        setAttachments((prev) => [...prev, { id, kind: "enlace", name, value: url }]);
        setAttachUrlInput("");
        setActiveAttachKind(null);
    }
    function removeAttachment(id: string) {
        setAttachments((prev) => prev.filter((a) => a.id !== id));
    }
    function handleAttachButtonClick(kind: AttachmentKind) {
        const cfg = ATTACHMENT_CFG[kind];
        if (cfg.useUrl) {
            setActiveAttachKind((prev) => (prev === kind ? null : kind));
            return;
        }
        setActiveAttachKind(null);
        // Trigger hidden file input
        if (fileInputRef.current) {
            fileInputRef.current.accept = cfg.accept ?? "*/*";
            fileInputRef.current.dataset.kind = kind;
            fileInputRef.current.value = "";
            fileInputRef.current.click();
        }
    }
    function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        const kind = (e.target.dataset.kind ?? "documento") as AttachmentKind;
        if (file) addFileAttachment(kind, file);
    }

    // ── Reference helpers ──
    const filteredRefs = useMemo(() => {
        return ALL_NETWORK_REFS.filter((r) => {
            const kindOk = refKindFilter === "todos" || r.kind === refKindFilter;
            const searchOk = !refSearch || r.label.toLowerCase().includes(refSearch.toLowerCase());
            return kindOk && searchOk;
        });
    }, [refSearch, refKindFilter]);
    function toggleRef(r: NetworkRef) {
        if (networkRefs.find((x) => x.id === r.id)) {
            setNetworkRefs((prev) => prev.filter((x) => x.id !== r.id));
        } else {
            setNetworkRefs((prev) => [...prev, r]);
        }
    }
    function removeRef(id: string) {
        setNetworkRefs((prev) => prev.filter((x) => x.id !== id));
    }

    // ── Library sync label ──
    const libraryTarget = useMemo(() => computeLibraryTarget(destinos), [destinos]);

    // ── Legacy step helpers ──
    const handleSelectArea = (area: Area) => { setSelectedArea(area); setStep(2); };
    const handleSelectContentType = (type: ContentType) => { setSelectedContentType(type); setStep(3); };
    const handleCategoryChange = (value: string) => {
        setSelectedCategory(value);
        setShowVoteConfig(selectedArea === 'politics' && value === 'Propuesta Legislativa');
    };
    const handleSelectDestination = (dest: any) => {
        if (!selectedDestinations.find((d: any) => d.id === dest.id)) {
            setSelectedDestinations([...selectedDestinations, dest]);
        }
    };
    const handleRemoveDestination = (destId: string) => {
        setSelectedDestinations(selectedDestinations.filter((d: any) => d.id !== destId));
    };
    const openEditor = () => setEditorOpen(true);
    const resetFlow = () => {
        setSelectedArea(null);
        setSelectedContentType(null);
        setSelectedCategory(null);
        setStep(1);
        setShowVoteConfig(false);
        setSelectedDestinations([]);
        setSelectedCategories([]);
        setSelectedThemes([]);
        setPublished(false);
    };
    const goBack = () => { if (step > 1) setStep(step - 1); };

    // ── Publish handler ──
    async function handlePublish() {
        if (!body && !titulo) {
            toast({ title: "Contenido vacío", description: "Escribe algo antes de publicar.", variant: "destructive" });
            return;
        }
        setIsPublishing(true);
        try {
            // Build the full text to persist: prepend título if present
            let fullBody = titulo ? `${titulo}\n\n${body}` : body;

            // Append references as markdown links
            if (networkRefs.length > 0) {
                fullBody += "\n\n---\n**Referencias:**\n";
                networkRefs.forEach((r) => {
                    fullBody += `- [${r.label}](${r.href})\n`;
                });
            }

            // Append attachment summary
            if (attachments.length > 0) {
                fullBody += "\n\n**Adjuntos:**\n";
                attachments.forEach((a) => {
                    const kindLabel = ATTACHMENT_CFG[a.kind].label;
                    fullBody += `- [${kindLabel}] ${a.name}${a.kind === "enlace" ? ` — ${a.value}` : ""}\n`;
                });
            }

            const res = await persistPost(fullBody);
            if (res.needsAuth) {
                toast({
                    title: "Inicia sesión",
                    description: "Necesitas una cuenta para publicar en la red.",
                    variant: "destructive",
                });
                return;
            }
            if (res.ok) {
                setPublished(true);
                toast({
                    title: "¡Publicado!",
                    description: destinos.length > 0
                        ? `Tu publicación se ha enviado a ${destinos.map((d) => d.name).join(", ")}. Adjuntos archivados en: ${libraryTarget}.`
                        : `Tu publicación se ha guardado en tu perfil. Adjuntos archivados en: ${libraryTarget}.`,
                });
            } else {
                toast({ title: "Error al publicar", description: "Inténtalo de nuevo.", variant: "destructive" });
            }
        } finally {
            setIsPublishing(false);
        }
    }

    // ─── Step renderer (legacy) ───────────────────────────────────────────────

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div className="w-full max-w-4xl">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold font-headline">Paso 1: Selecciona el Área Principal</h2>
                            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
                                Comienza eligiendo el propósito de tu publicación. Esto determinará las herramientas y opciones disponibles.
                            </p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-6">
                            {(Object.keys(areaConfig) as Area[]).map(key => {
                                const config = areaConfig[key];
                                return (
                                    <Card key={key} className={cn("text-center hover:shadow-lg transition-all duration-300 cursor-pointer border-2", config.color)} onClick={() => handleSelectArea(key)}>
                                        <CardHeader className="items-center p-6">
                                            <div className="p-4 rounded-full bg-muted/80 mb-4 border-2 border-border/50">
                                                {config.icon}
                                            </div>
                                            <CardTitle className="font-headline text-xl">{config.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-6 pt-0">
                                            <p className="text-sm">{config.description}</p>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                );

            case 2:
                return (
                    <div className="w-full max-w-4xl">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold font-headline">Paso 2: Elige el Formato del Contenido</h2>
                            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
                                Selecciona cómo quieres estructurar tu publicación. Puedes empezar simple y añadir complejidad después.
                            </p>
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {(Object.keys(contentTypeConfig) as ContentType[]).map(key => {
                                const config = contentTypeConfig[key];
                                return (
                                    <Card key={key} className="text-center hover:shadow-lg transition-all duration-300 cursor-pointer bg-card/80 border-2 border-transparent hover:border-primary/50" onClick={() => handleSelectContentType(key)}>
                                        <CardHeader className="items-center p-6">
                                            <div className="p-4 rounded-full bg-muted mb-4 border">
                                                {config.icon}
                                            </div>
                                            <CardTitle className="font-headline text-lg">{config.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-6 pt-0">
                                            <p className="text-sm text-muted-foreground">{config.description}</p>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                );

            case 3: {
                if (!selectedArea) return null;
                const config = areaConfig[selectedArea];
                const isEducation = selectedArea === 'education';
                const availableDestinations = allDestinationsLegacy.filter(dest => config.allowedDestinations.includes(dest.type));

                return (
                    <div className="w-full max-w-4xl">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold font-headline">Paso 3: Define el Ámbito y Contexto</h2>
                            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">Selecciona dónde se publicará y cómo se conectará tu contenido con la red de conocimiento.</p>
                        </div>
                        <Card>
                            <CardContent className="grid md:grid-cols-2 gap-x-8 gap-y-6 p-6">
                                <div className="space-y-4">
                                    <Label className="text-base font-semibold">Destino(s) de la Publicación</Label>
                                    <p className="text-sm text-muted-foreground">Puedes seleccionar uno o varios destinos permitidos para el área de '{config.title}'.</p>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input placeholder="Buscar perfiles o páginas..." className="pl-8" />
                                    </div>
                                    <div className="p-2 border rounded-lg h-40 overflow-y-auto space-y-1 bg-muted/20">
                                        {availableDestinations.map(dest => (
                                            <div key={dest.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarImage src={dest.avatar} />
                                                        <AvatarFallback>{dest.name.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <span className="font-medium">{dest.name}</span>
                                                    <span className="text-xs text-muted-foreground">({dest.type})</span>
                                                </div>
                                                <Button variant="outline" size="sm" className="h-7 cursor-pointer" onClick={() => handleSelectDestination(dest)}>Seleccionar</Button>
                                            </div>
                                        ))}
                                    </div>
                                    <Label className="pt-2 block">Destinos Seleccionados:</Label>
                                    <div className="flex flex-wrap gap-2 p-2 border rounded-lg min-h-[48px] bg-muted/50">
                                        {selectedDestinations.map((d: any) => (
                                            <Badge key={d.id} variant="secondary" className="p-1 pr-2 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-5 w-5">
                                                        <AvatarImage src={d.avatar} />
                                                        <AvatarFallback>{d.name.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <span>{d.name}</span>
                                                    <button onClick={() => handleRemoveDestination(d.id)} className="ml-1 rounded-full hover:bg-background/50 p-0.5 cursor-pointer">
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </Badge>
                                        ))}
                                        {selectedDestinations.length === 0 && <span className="text-xs text-muted-foreground p-2">Ningún destino seleccionado...</span>}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <Label className="text-base font-semibold">Categoría Principal</Label>
                                        <p className="text-sm text-muted-foreground">Define el tipo de publicación.</p>
                                        <Select onValueChange={handleCategoryChange} value={selectedCategory || ""}>
                                            <SelectTrigger className="mt-2">
                                                <SelectValue placeholder="Selecciona una categoría..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {config.categories.map(cat => <SelectItem value={cat} key={cat}>{cat}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {isEducation && (
                                        <div className="space-y-4 pt-2">
                                            <div>
                                                <Label className="text-base font-semibold">Etiquetado (Red de Conocimiento)</Label>
                                                <p className="text-sm text-muted-foreground">Vincula tu publicación a la red de conocimiento para una mejor interconexión.</p>
                                                <div className="flex gap-2 mt-2">
                                                    <Button variant="outline" className="w-full justify-start cursor-pointer" onClick={() => setCategorySelectorOpen(true)}><LinkIcon className="mr-2" /> Añadir Categorías</Button>
                                                    <Button variant="outline" className="w-full justify-start cursor-pointer" onClick={() => setThemeSelectorOpen(true)}><Tags className="mr-2" /> Añadir Temas</Button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap gap-1 p-2 border rounded-lg min-h-[48px] bg-muted/50">
                                                    {selectedCat.length === 0 && selectedTh.length === 0 && <span className="text-xs text-muted-foreground p-2">Sin etiquetas de la Red de Conocimiento...</span>}
                                                    {selectedCat.map(c => <Badge key={c} variant="secondary">{categories.find(cat => cat.id === c)?.name}</Badge>)}
                                                    {selectedTh.map(t => <Badge key={t} className="bg-blue-900/50 text-blue-200 border-blue-500/50">{themes.find(th => th.id === t)?.name}</Badge>)}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );
            }

            case 4:
                return (
                    <div className="w-full max-w-5xl space-y-6">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold font-headline">Paso 4: El Lienzo de Creación</h2>
                            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">Aquí es donde tu idea toma forma. Utiliza el editor para construir tu contenido.</p>
                        </div>

                        {showVoteConfig && selectedArea === 'politics' && <LegislativeVoteConfig />}

                        <Card>
                            <CardContent className="p-6">
                                {selectedContentType === 'canvas' && (
                                    <div className="grid lg:grid-cols-3 gap-6">
                                        <div className="lg:col-span-2 space-y-4">
                                            <h3 className="font-semibold text-lg">Contenido Principal</h3>
                                            <div className="relative p-4 border-2 border-dashed rounded-lg min-h-[300px] flex items-center justify-center text-center bg-muted/20 hover:border-primary/80 transition-colors">
                                                <div className="space-y-2">
                                                    <p className="text-muted-foreground">Este es tu lienzo principal de contenido ilimitado.</p>
                                                    <Button onClick={openEditor} className="cursor-pointer"><Edit className="mr-2" />Abrir Editor del Lienzo</Button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-lg">Tarjeta de Previsualización</h3>
                                            <div className="relative p-4 border-2 border-dashed rounded-lg aspect-video flex items-center justify-center text-center bg-muted/20 hover:border-primary/80 transition-colors">
                                                <div className="space-y-2">
                                                    <p className="text-sm text-muted-foreground">Diseña aquí la tarjeta que se verá en los feeds.</p>
                                                    <Button variant="outline" onClick={openEditor} className="cursor-pointer"><Edit className="mr-2" />Abrir Editor de Previsualización</Button>
                                                </div>
                                            </div>
                                            <Input placeholder="Título de la Previsualización" />
                                        </div>
                                    </div>
                                )}
                                {(selectedContentType === 'gallery' || selectedContentType === 'file' || selectedContentType === 'text') && (
                                    <div className="space-y-4">
                                        <Input placeholder="Título (Opcional)" />
                                        <Textarea placeholder={selectedContentType === 'text' ? 'Escribe tu contenido aquí...' : 'Descripción (Opcional)'} rows={selectedContentType === 'text' ? 8 : 3} />
                                        {(selectedContentType === 'gallery' || selectedContentType === 'file') &&
                                            <div className="p-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center bg-muted/20">
                                                <Upload className="w-10 h-10 text-muted-foreground mb-4" />
                                                <p className="font-semibold mb-2">
                                                    {selectedContentType === 'gallery' ? 'Arrastra y suelta imágenes/videos o' : 'Arrastra y suelta un archivo o'}
                                                </p>
                                                <Button variant="outline" className="cursor-pointer">
                                                    <Library className="mr-2" />
                                                    Elegir desde la Biblioteca
                                                </Button>
                                            </div>
                                        }
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {!showVoteConfig && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="font-headline text-lg">Opciones de Publicación</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center space-x-2">
                                        <Vote className="w-5 h-5 text-primary" />
                                        <div>
                                            <Label htmlFor="add-vote" className="font-semibold">Añadir Votación</Label>
                                            <p className="text-xs text-muted-foreground">Convierte esta publicación en una propuesta formal con opciones de voto.</p>
                                        </div>
                                    </div>
                                    <Button variant="outline" onClick={() => setShowVoteConfig(true)} className="cursor-pointer"><PlusCircle className="mr-2" />Configurar Votación</Button>
                                </CardContent>
                            </Card>
                        )}
                        {showVoteConfig && selectedArea !== 'politics' && <LegislativeVoteConfig />}
                    </div>
                );

            default:
                return null;
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            {/* Legacy modals */}
            <KnowledgeNetworkSelector
                isOpen={isCategorySelectorOpen}
                onOpenChange={setCategorySelectorOpen}
                title="Seleccionar Categorías"
                data={categories}
                selectedItems={selectedCat}
                onSelectedItemsChange={setSelectedCategories}
                type="category"
            />
            <KnowledgeNetworkSelector
                isOpen={isThemeSelectorOpen}
                onOpenChange={setThemeSelectorOpen}
                title="Seleccionar Temas"
                data={themes}
                selectedItems={selectedTh}
                onSelectedItemsChange={setSelectedThemes}
                type="theme"
            />
            <CanvasEditor
                isOpen={isEditorOpen}
                onOpenChange={setEditorOpen}
                area={selectedArea}
            />

            <div className="flex flex-col gap-6">
                {/* ── Page header ── */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
                            Publicar Contenido
                        </h1>
                        <p className="text-muted-foreground">
                            {selectedArea ? `Creando en el área de ${areaConfig[selectedArea].title}` : 'Inicia el flujo de creación para contribuir a la red.'}
                        </p>
                    </div>
                    {step > 1 && (
                        <Button variant="ghost" onClick={resetFlow} className="cursor-pointer">
                            <X className="mr-2" /> Cancelar
                        </Button>
                    )}
                </div>

                <Separator />

                {/* ══════════════════════════════════════════════════════════
                    NEW ENHANCED COMPOSER — sits above the legacy step-flow
                    ══════════════════════════════════════════════════════════ */}
                <div className="w-full max-w-5xl mx-auto space-y-5">
                    {/* Section label */}
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        <h2 className="text-xl font-semibold font-headline">Compositor Rápido</h2>
                        <Badge variant="outline" className="ml-1 text-xs">Nuevo</Badge>
                    </div>

                    <div className="grid lg:grid-cols-5 gap-5">
                        {/* ── Left column: form ── */}
                        <div className="lg:col-span-3 space-y-4">

                            {/* 1. Publication type */}
                            <Card className="border border-white/8 bg-card/50 backdrop-blur-sm">
                                <CardHeader className="pb-3 pt-4 px-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tipo de publicación</CardTitle>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {(Object.keys(pubTypeConfig) as PubType[]).map((pt) => {
                                            const cfg = pubTypeConfig[pt];
                                            return (
                                                <button
                                                    key={pt}
                                                    onClick={() => setPubType(pt)}
                                                    className={cn(
                                                        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all duration-150 cursor-pointer",
                                                        cfg.color,
                                                        pubType === pt ? "ring-2 ring-offset-1 ring-offset-background" : "border-white/10 text-muted-foreground hover:border-white/20"
                                                    )}
                                                >
                                                    {cfg.icon}
                                                    {cfg.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* 2. Content fields */}
                            <Card className="border border-white/8 bg-card/50 backdrop-blur-sm">
                                <CardContent className="px-4 py-4 space-y-3">
                                    {showTitulo && (
                                        <div className="space-y-1.5">
                                            <Label htmlFor="pub-titulo" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Título</Label>
                                            <Input
                                                id="pub-titulo"
                                                placeholder={pubType === "evento" ? "Nombre del evento" : pubType === "propuesta" ? "Título de la propuesta" : "Título del artículo"}
                                                value={titulo}
                                                onChange={(e) => setTitulo(e.target.value)}
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <Label htmlFor="pub-body" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            {pubType === "publicacion" ? "Publicación" : pubType === "evento" ? "Descripción del evento" : pubType === "propuesta" ? "Argumentación" : "Cuerpo del artículo"}
                                        </Label>
                                        <Textarea
                                            id="pub-body"
                                            placeholder={
                                                pubType === "publicacion" ? "¿Qué quieres compartir con la red?"
                                                    : pubType === "articulo" ? "Desarrolla tu artículo…"
                                                        : pubType === "evento" ? "Describe el evento, el lugar y los detalles…"
                                                            : "Expón tu propuesta y su justificación…"
                                            }
                                            rows={pubType === "articulo" ? 8 : 5}
                                            value={body}
                                            onChange={(e) => setBody(e.target.value)}
                                        />
                                    </div>

                                    {/* Fecha / lugar — only for event */}
                                    {showFecha && (
                                        <div className="grid sm:grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fecha del evento</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal cursor-pointer", !eventDate && "text-muted-foreground")}>
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {eventDate ? format(eventDate, "PPP", { locale: es }) : "Elige una fecha"}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0">
                                                        <Calendar mode="single" selected={eventDate} onSelect={setEventDate} disabled={(d) => d < new Date()} initialFocus />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lugar / enlace</Label>
                                                <div className="relative">
                                                    <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                                    <Input className="pl-8" placeholder="Física o URL de Multiverso" value={eventPlace} onChange={(e) => setEventPlace(e.target.value)} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* 3. Etiquetas */}
                            <Card className="border border-white/8 bg-card/50 backdrop-blur-sm">
                                <CardHeader className="pb-2 pt-4 px-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                        <Hash className="w-3.5 h-3.5" /> Etiquetas
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="px-4 pb-4 space-y-3">
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Hash className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                className="pl-8"
                                                placeholder="Añadir etiqueta y pulsar Enter"
                                                value={rawTag}
                                                onChange={(e) => setRawTag(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === ",") {
                                                        e.preventDefault();
                                                        addTag(rawTag);
                                                    }
                                                }}
                                            />
                                        </div>
                                        <Button variant="outline" size="sm" className="cursor-pointer shrink-0" onClick={() => addTag(rawTag)}>
                                            <PlusCircle className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                                        {tags.length === 0 && <span className="text-xs text-muted-foreground/60 italic">Sin etiquetas aún…</span>}
                                        {tags.map((t) => (
                                            <Badge key={t} variant="secondary" className="gap-1 cursor-default">
                                                <Hash className="w-2.5 h-2.5" />{t}
                                                <button onClick={() => removeTag(t)} className="ml-0.5 rounded-full hover:bg-background/50 p-0.5 cursor-pointer">
                                                    <X className="h-2.5 w-2.5" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* 4. Audiencia */}
                            <Card className="border border-white/8 bg-card/50 backdrop-blur-sm">
                                <CardHeader className="pb-2 pt-4 px-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                        <Eye className="w-3.5 h-3.5" /> Audiencia y privacidad
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <div className="grid grid-cols-3 gap-2">
                                        {(Object.keys(audienciaConfig) as Audiencia[]).map((a) => {
                                            const cfg = audienciaConfig[a];
                                            return (
                                                <button
                                                    key={a}
                                                    onClick={() => setAudiencia(a)}
                                                    className={cn(
                                                        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all duration-150 cursor-pointer",
                                                        audiencia === a
                                                            ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/40"
                                                            : "border-white/10 text-muted-foreground hover:border-white/20 hover:bg-muted/20"
                                                    )}
                                                >
                                                    {cfg.icon}
                                                    <span>{cfg.label}</span>
                                                    <span className="text-[10px] text-muted-foreground font-normal leading-tight text-center">{cfg.desc}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* 5. Destination selector */}
                            <Card className="border border-white/8 bg-card/50 backdrop-blur-sm">
                                <CardHeader className="pb-2 pt-4 px-4">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                            <Globe className="w-3.5 h-3.5" /> Destino
                                        </CardTitle>
                                        <button
                                            onClick={() => setShowDestPicker(!showDestPicker)}
                                            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 cursor-pointer transition-colors"
                                        >
                                            {showDestPicker ? <><ChevronUp className="w-3.5 h-3.5" />Cerrar</> : <><ChevronDown className="w-3.5 h-3.5" />Cambiar destino</>}
                                        </button>
                                    </div>
                                </CardHeader>
                                <CardContent className="px-4 pb-4 space-y-3">
                                    {/* Selected destinations */}
                                    {destinos.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {destinos.map((d) => (
                                                <Badge key={d.id} variant="secondary" className="gap-1.5 py-1 pl-1.5 pr-2 text-sm">
                                                    <span className="text-muted-foreground">{DEST_CATEGORY_ICONS[d.category]}</span>
                                                    <Link href={d.href} className="hover:underline cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                                        {d.name}
                                                    </Link>
                                                    <button onClick={() => removeDest(d.id)} className="ml-0.5 rounded-full hover:bg-background/50 p-0.5 cursor-pointer">
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground italic">Publicarás en tu perfil por defecto.</p>
                                    )}

                                    {/* Picker panel */}
                                    {showDestPicker && (
                                        <div className="space-y-2 pt-1 border-t border-white/8">
                                            <div className="flex gap-2 flex-wrap pt-2">
                                                {(["todos", "perfil", "pagina", "grupo", "ef", "partido"] as const).map((cat) => (
                                                    <button
                                                        key={cat}
                                                        onClick={() => setDestCatFilter(cat)}
                                                        className={cn(
                                                            "px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150 cursor-pointer",
                                                            destCatFilter === cat
                                                                ? "bg-primary/20 border-primary/60 text-primary"
                                                                : "border-white/10 text-muted-foreground hover:border-white/20"
                                                        )}
                                                    >
                                                        {cat === "todos" ? "Todos" : DEST_CATEGORY_LABELS[cat]}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    className="pl-8 h-8 text-sm"
                                                    placeholder="Buscar destino…"
                                                    value={destSearch}
                                                    onChange={(e) => setDestSearch(e.target.value)}
                                                />
                                            </div>
                                            <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-white/8 bg-muted/10 p-1">
                                                {filteredDests.length === 0 && (
                                                    <p className="text-xs text-muted-foreground text-center py-4">Sin resultados</p>
                                                )}
                                                {filteredDests.map((d) => {
                                                    const selected = !!destinos.find((x) => x.id === d.id);
                                                    return (
                                                        <div
                                                            key={d.id}
                                                            onClick={() => toggleDest(d)}
                                                            className={cn(
                                                                "flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors duration-100",
                                                                selected ? "bg-primary/15 text-primary" : "hover:bg-muted/40"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                {d.avatar ? (
                                                                    <Avatar className="h-6 w-6 shrink-0">
                                                                        <AvatarImage src={d.avatar} />
                                                                        <AvatarFallback>{d.name.charAt(0)}</AvatarFallback>
                                                                    </Avatar>
                                                                ) : (
                                                                    <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full bg-muted text-muted-foreground">
                                                                        {DEST_CATEGORY_ICONS[d.category]}
                                                                    </span>
                                                                )}
                                                                <span className="truncate font-medium">{d.name}</span>
                                                                <span className="text-xs text-muted-foreground shrink-0">({d.type})</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <Link
                                                                    href={d.href}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                                                                    title="Ver página"
                                                                >
                                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                                </Link>
                                                                <Badge variant={selected ? "default" : "outline"} className="text-xs cursor-pointer">
                                                                    {selected ? "Añadido" : "Añadir"}
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Hidden file input — reused for all file-based attachment types */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                onChange={handleFileInputChange}
                            />

                            {/* 6. Rich Attachments */}
                            <Card className="border border-white/8 bg-card/50 backdrop-blur-sm">
                                <CardHeader className="pb-2 pt-4 px-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                        <Paperclip className="w-3.5 h-3.5" /> Adjuntos
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="px-4 pb-4 space-y-3">
                                    {/* Type buttons */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {(Object.keys(ATTACHMENT_CFG) as AttachmentKind[]).map((kind) => {
                                            const cfg = ATTACHMENT_CFG[kind];
                                            return (
                                                <button
                                                    key={kind}
                                                    title={`Adjuntar ${cfg.label}`}
                                                    onClick={() => handleAttachButtonClick(kind)}
                                                    className={cn(
                                                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer",
                                                        activeAttachKind === kind
                                                            ? "border-primary/60 bg-primary/10 text-primary"
                                                            : "border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground"
                                                    )}
                                                >
                                                    {cfg.icon}{cfg.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* URL input — shown when "enlace" is active */}
                                    {activeAttachKind === "enlace" && (
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <LinkIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    className="pl-8 h-8 text-sm"
                                                    placeholder="https://…"
                                                    value={attachUrlInput}
                                                    onChange={(e) => setAttachUrlInput(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrlAttachment(); } }}
                                                    autoFocus
                                                />
                                            </div>
                                            <Button size="sm" variant="outline" className="cursor-pointer shrink-0 h-8" onClick={addUrlAttachment}>
                                                <PlusCircle className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    )}

                                    {/* Chips of added attachments */}
                                    {attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {attachments.map((a) => (
                                                <span
                                                    key={a.id}
                                                    className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 border border-white/10 px-2.5 py-1 text-xs text-foreground/80"
                                                >
                                                    {ATTACHMENT_CFG[a.kind].icon}
                                                    <span
                                                        className="max-w-[140px] truncate"
                                                        title={a.kind === "enlace" ? a.value : a.name}
                                                    >
                                                        {a.name}
                                                    </span>
                                                    <button
                                                        onClick={() => removeAttachment(a.id)}
                                                        className="ml-0.5 rounded-full hover:bg-background/50 p-0.5 cursor-pointer text-muted-foreground hover:text-foreground"
                                                    >
                                                        <X className="h-2.5 w-2.5" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Library sync note */}
                                    <div className="flex items-start gap-2 rounded-lg bg-muted/30 border border-white/8 px-3 py-2 text-xs text-muted-foreground">
                                        <LibraryBig className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/60" />
                                        <span>
                                            <span className="font-medium text-foreground/70">Sincronización con biblioteca:</span>{" "}
                                            Los adjuntos se archivarán en <span className="text-primary/80 font-medium">{libraryTarget}</span>.
                                            {attachments.length === 0 && " (Añade adjuntos para sincronizarlos.)"}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* 7. Referencias en la red */}
                            <Card className="border border-white/8 bg-card/50 backdrop-blur-sm">
                                <CardHeader className="pb-2 pt-4 px-4">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                            <AtSign className="w-3.5 h-3.5" /> Referencias en la red
                                        </CardTitle>
                                        <button
                                            onClick={() => setShowRefPicker(!showRefPicker)}
                                            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 cursor-pointer transition-colors"
                                        >
                                            {showRefPicker ? <><ChevronUp className="w-3.5 h-3.5" />Cerrar</> : <><ChevronDown className="w-3.5 h-3.5" />Vincular entidad</>}
                                        </button>
                                    </div>
                                </CardHeader>
                                <CardContent className="px-4 pb-4 space-y-3">
                                    {/* Selected refs as chips */}
                                    {networkRefs.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {networkRefs.map((r) => (
                                                <span
                                                    key={r.id}
                                                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs text-primary/80"
                                                >
                                                    {REF_KIND_ICONS[r.kind]}
                                                    <Link
                                                        href={r.href}
                                                        className="hover:underline cursor-pointer max-w-[130px] truncate"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title={r.label}
                                                    >
                                                        {r.label}
                                                    </Link>
                                                    <button
                                                        onClick={() => removeRef(r.id)}
                                                        className="ml-0.5 rounded-full hover:bg-background/50 p-0.5 cursor-pointer text-primary/50 hover:text-primary"
                                                    >
                                                        <X className="h-2.5 w-2.5" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    ) : !showRefPicker && (
                                        <p className="text-xs text-muted-foreground italic">Sin referencias vinculadas.</p>
                                    )}

                                    {/* Picker panel */}
                                    {showRefPicker && (
                                        <div className="space-y-2 border-t border-white/8 pt-2">
                                            {/* Kind filter pills */}
                                            <div className="flex flex-wrap gap-1">
                                                {(["todos", "pagina", "grupo", "ef", "partido", "articulo", "curso"] as const).map((k) => (
                                                    <button
                                                        key={k}
                                                        onClick={() => setRefKindFilter(k)}
                                                        className={cn(
                                                            "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all duration-150 cursor-pointer",
                                                            refKindFilter === k
                                                                ? "bg-primary/20 border-primary/60 text-primary"
                                                                : "border-white/10 text-muted-foreground hover:border-white/20"
                                                        )}
                                                    >
                                                        {k === "todos" ? "Todos" : REF_KIND_LABELS[k]}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Search */}
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                                                <Input
                                                    className="pl-7 h-7 text-xs"
                                                    placeholder="Buscar entidad, artículo o curso…"
                                                    value={refSearch}
                                                    onChange={(e) => setRefSearch(e.target.value)}
                                                />
                                            </div>
                                            {/* List */}
                                            <div className="max-h-44 overflow-y-auto space-y-0.5 rounded-lg border border-white/8 bg-muted/10 p-1">
                                                {filteredRefs.length === 0 && (
                                                    <p className="text-xs text-muted-foreground text-center py-4">Sin resultados</p>
                                                )}
                                                {filteredRefs.map((r) => {
                                                    const selected = !!networkRefs.find((x) => x.id === r.id);
                                                    return (
                                                        <div
                                                            key={r.id}
                                                            onClick={() => toggleRef(r)}
                                                            className={cn(
                                                                "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors duration-100",
                                                                selected ? "bg-primary/15 text-primary" : "hover:bg-muted/40"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className="text-muted-foreground shrink-0">{REF_KIND_ICONS[r.kind]}</span>
                                                                <span className="truncate font-medium">{r.label}</span>
                                                                <span className="text-muted-foreground shrink-0">({REF_KIND_LABELS[r.kind]})</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <Link
                                                                    href={r.href}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                                                                    title="Ver"
                                                                >
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </Link>
                                                                <Badge variant={selected ? "default" : "outline"} className="text-[10px] cursor-pointer py-0">
                                                                    {selected ? "Vinculado" : "Vincular"}
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* 8. Vote config for "propuesta" type */}
                            {showVoto && <LegislativeVoteConfig />}

                            {/* Publish actions */}
                            <div className="flex gap-3 justify-end pt-1">
                                <Button variant="outline" size="lg" className="cursor-pointer" onClick={() => {
                                    toast({ title: "Borrador guardado", description: "Puedes retomarlo cuando quieras." });
                                }}>
                                    Guardar Borrador
                                </Button>
                                <Button
                                    size="lg"
                                    className="cursor-pointer gap-2"
                                    onClick={handlePublish}
                                    disabled={published || isPublishing}
                                >
                                    <Sparkles className="w-4 h-4" />
                                    {isPublishing ? "Publicando…" : published ? "Publicado" : "Publicar"}
                                </Button>
                            </div>
                        </div>

                        {/* ── Right column: live preview ── */}
                        <div className="lg:col-span-2 space-y-3">
                            <button
                                onClick={() => setShowPreview(!showPreview)}
                                className="w-full flex items-center justify-between text-sm font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors"
                            >
                                <span className="flex items-center gap-2"><Eye className="w-4 h-4" /> Vista previa</span>
                                {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <div className={cn("transition-all duration-200", showPreview ? "opacity-100" : "opacity-60 pointer-events-none")}>
                                <PreviewCard
                                    pubType={pubType}
                                    titulo={titulo}
                                    body={body}
                                    tags={tags}
                                    audiencia={audiencia}
                                    destinos={destinos}
                                    attachments={attachments}
                                    refs={networkRefs}
                                />
                            </div>

                            {/* Tips */}
                            <Card className="border border-white/8 bg-card/40 text-xs text-muted-foreground space-y-2">
                                <CardContent className="p-4 space-y-2">
                                    <p className="font-semibold text-foreground/70">Consejos</p>
                                    <ul className="space-y-1 list-disc list-inside">
                                        <li>Las <strong>Propuestas</strong> con votación activan delegación líquida.</li>
                                        <li>Los <strong>Artículos</strong> se indexan en la Biblioteca Universal.</li>
                                        <li>Los <strong>Eventos</strong> aparecen en el mapa de la red.</li>
                                        <li>Usa <strong>#etiquetas</strong> para conectar tu contenido a la red de conocimiento.</li>
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>

                <Separator />

                {/* ═══════════════════════════════════════════════════════
                    LEGACY STEP FLOW (preserved intact)
                    ═══════════════════════════════════════════════════════ */}
                <div className="w-full max-w-5xl mx-auto space-y-4">
                    <div className="flex items-center gap-2">
                        <Settings className="w-5 h-5 text-muted-foreground" />
                        <h2 className="text-xl font-semibold font-headline text-muted-foreground">Compositor Avanzado</h2>
                    </div>

                    <div className="flex flex-col items-center text-center gap-8 mt-4">
                        {renderStepContent()}
                    </div>

                    <div className="flex justify-between gap-4 mt-8">
                        <Button variant="outline" size="lg" onClick={goBack} disabled={step === 1} className="cursor-pointer">
                            <ArrowLeft className="mr-2" />
                            Atrás
                        </Button>
                        {step < 4 ? (
                            <Button
                                size="lg"
                                onClick={() => setStep(step + 1)}
                                disabled={(step === 2 && !selectedContentType) || (step === 3 && selectedDestinations.length === 0)}
                                className="cursor-pointer"
                            >
                                Siguiente
                            </Button>
                        ) : (
                            <div className="flex justify-end gap-4">
                                <Button variant="outline" size="lg" className="cursor-pointer">Guardar Borrador</Button>
                                <Button size="lg" className="cursor-pointer">Publicar</Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
