"use client";

// Evita el bailout de prerender estatico por useSearchParams (build de Vercel).
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  File as FileIcon,
  Folder,
  MoreVertical,
  Search,
  Upload,
  LayoutGrid,
  List as ListIcon,
  ChevronRight,
  HardDrive,
  Globe,
  Lock,
  Cpu,
  Book,
  Lightbulb,
  Plus,
  ArrowLeft,
  BookOpen,
  GraduationCap,
  FileText,
  Users,
  Star,
  Heart,
  ArrowUpDown,
  SlidersHorizontal,
  X,
  ExternalLink,
  Store,
  Send,
  Link2,
  PenSquare,
  LayoutTemplate,
  Trash2,
  Bookmark,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StarSeedKnowledgePanel } from "@/components/library/StarSeedKnowledgePanel";
import { DesignAssetsPanel } from "@/components/library/DesignAssetsPanel";
import { articles, courses, files, categories } from "@/lib/data";
import { samplePages } from "@/data/sample-entities";

// ── Interconexión aditiva (Módulo 8) ──
// Consumimos el store soberano (NO se modifica) y el puente de share para
// invocar recursos guardados en lienzo / publicación / mensaje.
import { useSavedLibrary, type SavedResource } from "@/lib/library-store";
import { emitAttach, openComposer } from "@/lib/share/bridge";
import { FilePreview, type FileLike } from "@/components/files/file-preview";
import { toast } from "sonner";

// --- Types ---

type LibraryMode = 'GLOBAL' | 'PERSONAL';
type ViewMode = 'GRID' | 'LIST';
type AssetType = 'FILE' | 'FOLDER' | 'LIBRARY' | 'PROGRAM' | 'PAGE' | 'CONCEPT';
type ResourceType = 'todos' | 'articulos' | 'cursos' | 'documentos' | 'comunidades';
type SortMode = 'recientes' | 'valorados' | 'populares';

interface AssetItem {
  id: string;
  parentId: string | null;
  name: string;
  type: AssetType;
  subType?: string;
  size?: string;
  modified: string;
  preview?: string;
  mode: LibraryMode;
  aiTags: string[];
  author?: string;
}

// --- Mock Data ---

const mockAssets: AssetItem[] = [
  { id: "lib1", parentId: null, name: "Ciencia & Tecnología", type: "LIBRARY", size: "128 TB", modified: "2024-03-20", mode: "GLOBAL", aiTags: ["science", "tech"] },
  { id: "lib2", parentId: null, name: "Artes & Cultura", type: "LIBRARY", size: "450 TB", modified: "2024-03-18", mode: "GLOBAL", aiTags: ["art", "culture"] },
  { id: "lib3", parentId: null, name: "Gobernanza & Leyes", type: "LIBRARY", size: "12 TB", modified: "2024-03-15", mode: "GLOBAL", aiTags: ["governance", "law"] },
  { id: "g_c_1", parentId: "lib1", name: "StarSeed Core v1.0", type: "PROGRAM", subType: "SYSTEM", size: "2.4 GB", modified: "2024-03-20", mode: "GLOBAL", aiTags: ["kernel", "os"], author: "Core Team" },
  { id: "g_c_2", parentId: "lib1", name: "Shaders Cuánticos", type: "FOLDER", size: "15 items", modified: "2024-03-18", mode: "GLOBAL", aiTags: ["graphics", "3d"], author: "NeoGraphics" },
  { id: "g_c_2_1", parentId: "g_c_2", name: "LiquidMetal.shdr", type: "FILE", subType: "SHADER", size: "24 MB", modified: "2024-03-18", mode: "GLOBAL", aiTags: ["metal", "fluid"], author: "NeoGraphics" },
  { id: "p_1", parentId: null, name: "Mis Documentos", type: "FOLDER", size: "12 items", modified: "2024-03-19", mode: "PERSONAL", aiTags: ["work", "docs"] },
  { id: "p_2", parentId: null, name: "Proyecto Génesis", type: "FOLDER", size: "3 items", modified: "2024-03-19", mode: "PERSONAL", aiTags: ["top-secret"] },
  { id: "p_3", parentId: null, name: "Mi Diario Neural", type: "CONCEPT", subType: "THOUGHT", size: "12 KB", modified: "Just now", mode: "PERSONAL", aiTags: ["personal", "reflection"] },
  { id: "p_4", parentId: null, name: "Backup Consciencia", type: "FILE", subType: "ARCHIVE", size: "450 TB", modified: "2024-03-01", mode: "PERSONAL", aiTags: ["backup", "identity"] },
  { id: "p_1_1", parentId: "p_1", name: "Borrador Constitución.pdf", type: "FILE", subType: "PDF", size: "4 MB", modified: "2024-02-28", mode: "PERSONAL", aiTags: ["draft", "law"] },
];

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

// ── Unified Resource type ──
interface UnifiedResource {
  id: string;
  kind: ResourceType;
  title: string;
  author?: string;
  description?: string;
  tags: string[];
  href: string;
  rating?: number;
  likes?: number;
  members?: number;
  modified?: string;
  status?: string;
}

function buildUnifiedResources(): UnifiedResource[] {
  const result: UnifiedResource[] = [];

  for (const a of articles) {
    result.push({
      id: a.id,
      kind: 'articulos',
      title: a.title,
      author: a.author,
      description: a.excerpt,
      tags: a.tags,
      href: a.href,
      rating: a.rating,
      likes: a.likes,
      modified: 'reciente',
    });
  }

  for (const c of courses) {
    result.push({
      id: c.id,
      kind: 'cursos',
      title: c.title,
      description: c.description,
      tags: c.tags,
      href: c.href,
      modified: 'reciente',
    });
  }

  for (const f of files) {
    result.push({
      id: String(f.id),
      kind: 'documentos',
      title: f.name,
      tags: [f.type],
      href: '#',
      modified: f.date,
    });
  }

  for (const p of samplePages) {
    result.push({
      id: p.id,
      kind: 'comunidades',
      title: p.title,
      description: p.description,
      tags: p.tags,
      href: `/pagina/${p.id}`,
      members: p.members,
      status: p.status,
      modified: 'reciente',
    });
  }

  return result;
}

const ALL_RESOURCES = buildUnifiedResources();

// ── Config per kind ──
const KIND_CONFIG: Record<ResourceType, { label: string; color: string; icon: React.ReactNode }> = {
  todos: { label: 'Todos', color: 'bg-white/10 text-white border-white/20', icon: <Book className="w-3 h-3" /> },
  articulos: { label: 'Artículos', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30', icon: <BookOpen className="w-3 h-3" /> },
  cursos: { label: 'Cursos', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: <GraduationCap className="w-3 h-3" /> },
  documentos: { label: 'Documentos', color: 'bg-violet-500/15 text-violet-300 border-violet-500/30', icon: <FileText className="w-3 h-3" /> },
  comunidades: { label: 'Comunidades', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: <Users className="w-3 h-3" /> },
};

function KindBadge({ kind }: { kind: ResourceType }) {
  const cfg = KIND_CONFIG[kind];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", cfg.color)}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400 text-xs">
      <Star className="w-3 h-3 fill-amber-400" />
      {rating.toFixed(1)}
    </span>
  );
}

function ResourceCard({ resource, view }: { resource: UnifiedResource; view: ViewMode }) {
  if (view === 'LIST') {
    return (
      <Link href={resource.href} className="group flex items-center gap-4 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
        <div className="shrink-0">{KIND_CONFIG[resource.kind].icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-200 group-hover:text-primary transition-colors truncate">{resource.title}</p>
          {resource.author && <p className="text-xs text-muted-foreground">{resource.author}</p>}
        </div>
        <KindBadge kind={resource.kind} />
        <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
          {resource.rating !== undefined && <StarRating rating={resource.rating} />}
          {resource.likes !== undefined && <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" />{resource.likes}</span>}
          {resource.members !== undefined && <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{resource.members.toLocaleString()}</span>}
        </div>
        <div className="flex gap-1 flex-wrap max-w-[200px] hidden lg:flex">
          {resource.tags.slice(0, 2).map(t => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">#{t}</span>
          ))}
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </Link>
    );
  }

  return (
    <Link href={resource.href} className="group cursor-pointer block">
      <GlassCard
        variant="hover"
        className="h-full p-0 flex flex-col border-white/5 bg-gradient-to-br from-white/5 to-transparent hover:border-primary/40 hover:scale-[1.02] transition-all duration-200"
      >
        <div className="p-4 flex flex-col gap-3 flex-1">
          <div className="flex items-start justify-between gap-2">
            <KindBadge kind={resource.kind} />
            {resource.status && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-muted-foreground border border-white/10 shrink-0">{resource.status}</span>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-100 group-hover:text-primary transition-colors leading-tight line-clamp-2">{resource.title}</p>
            {resource.author && <p className="text-[11px] text-muted-foreground mt-0.5">{resource.author}</p>}
          </div>
          {resource.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{resource.description}</p>
          )}
          <div className="flex gap-1 flex-wrap mt-auto pt-1">
            {resource.tags.slice(0, 3).map(t => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">#{t}</span>
            ))}
          </div>
        </div>
        <div className="px-4 pb-3 flex items-center justify-between border-t border-white/5 pt-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {resource.rating !== undefined && <StarRating rating={resource.rating} />}
            {resource.likes !== undefined && <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" />{resource.likes}</span>}
            {resource.members !== undefined && <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{resource.members.toLocaleString()}</span>}
          </div>
          <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </GlassCard>
    </Link>
  );
}

// ══════════════════════════════════════════════════════════════════
// MIS RECURSOS GUARDADOS — interconexión aditiva (Módulo 8)
// Consume el store soberano (useSavedLibrary) y, por cada recurso,
// ofrece acciones para INVOCARLO en la red:
//   · Usar en lienzo       → emitAttach({kind:'file', url, title})
//   · Adjuntar a publicación → openComposer({type:'archivo', content:{url,title}})
//   · Enviar a mensaje      → copia una referencia compartible al portapapeles
// Lo que se instala desde la Tienda aterriza aquí (saveResource/installApp).
// NO modifica library-store.ts ni library-sync.ts: solo los consume.
// ══════════════════════════════════════════════════════════════════

// Etiqueta legible por tipo de recurso guardado.
const SAVED_KIND_LABEL: Record<string, string> = {
  articulos: "Artículo",
  cursos: "Curso",
  documentos: "Documento",
  comunidades: "Comunidad",
  archivo: "Archivo",
  app: "App",
  diseno: "Diseño",
  pagina: "Página",
  ego: "Ego de Aurora",
};

function savedKindLabel(kind: string): string {
  return SAVED_KIND_LABEL[kind] ?? (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "Recurso");
}

// Construye una referencia compartible (deep-link) para enviar a mensajes.
function buildShareRef(r: SavedResource): string {
  if (r.url && r.url.trim() && r.url !== "#") return r.url;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/library?ref=${encodeURIComponent(r.id)}`;
  }
  return `starseed://library/${r.id}`;
}

function SavedResourceCard({
  resource,
  onRemove,
}: {
  resource: SavedResource;
  onRemove: (id: string) => void;
}) {
  const title = resource.title || "Recurso";
  const url = resource.url && resource.url !== "#" ? resource.url : undefined;

  // ── Usar en lienzo: lo adjunta a cualquier pizarra/lienzo abierto ──
  const handleUseInCanvas = () => {
    emitAttach({ kind: "file", url, title });
    toast.success("Enviado al lienzo", {
      description: `«${title}» se adjuntará a la pizarra abierta.`,
    });
  };

  // ── Adjuntar a publicación: abre el compositor prerellenado ──
  const handleAttachToPost = () => {
    openComposer({ type: "archivo", content: { url, title } });
    toast.success("Compositor abierto", {
      description: `«${title}» listo para tu publicación.`,
    });
  };

  // ── Enviar a mensaje: copia una referencia compartible al portapapeles ──
  const handleSendToMessage = async () => {
    const ref = buildShareRef(resource);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(ref);
        toast.success("Referencia copiada", {
          description: "Pégala en un mensaje para compartir este recurso.",
        });
      } else {
        toast.message("Referencia del recurso", { description: ref });
      }
    } catch {
      toast.message("Referencia del recurso", { description: ref });
    }
    // Además emitimos un evento por si la página de mensajes está escuchando.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("starseed:share-to-message", {
          detail: { id: resource.id, title, url, ref, kind: resource.kind },
        }),
      );
    }
  };

  return (
    <GlassCard
      variant="hover"
      intensity="low"
      className="group flex flex-col gap-3 p-4 border-white/5 bg-gradient-to-br from-white/5 to-transparent"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="p-2.5 rounded-xl bg-white/5 shrink-0">
          <Bookmark className="w-6 h-6 text-indigo-300/90" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-100 truncate">{title}</p>
          <p className="text-[11px] text-muted-foreground">
            {savedKindLabel(resource.kind)}
            {resource.origin ? ` · ${resource.origin}` : ""}
          </p>
        </div>
        <button
          onClick={() => onRemove(resource.id)}
          className="p-1.5 rounded-full text-muted-foreground hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
          aria-label="Quitar de guardados"
          title="Quitar de guardados"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Previsualización del recurso (imagen / vídeo / pdf / 3D / enlace / código…).
          Sin barra de acciones propia: la tarjeta ya ofrece sus acciones de
          interconexión (lienzo / publicación / mensaje) más abajo. */}
      {url && (
        <FilePreview
          file={{ url, name: title, type: resource.kind } as FileLike}
          context="library"
          actions={false}
          compact
        />
      )}

      {/* Acciones de interconexión */}
      <div className="flex flex-wrap items-center gap-2 mt-auto">
        <Button
          size="sm"
          className="gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
          onClick={handleUseInCanvas}
        >
          <LayoutTemplate className="w-3.5 h-3.5" /> Usar en lienzo
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs border-white/15 hover:bg-white/10 cursor-pointer"
          onClick={handleAttachToPost}
        >
          <PenSquare className="w-3.5 h-3.5" /> Adjuntar a publicación
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs border-white/15 hover:bg-white/10 cursor-pointer"
          onClick={handleSendToMessage}
        >
          <Send className="w-3.5 h-3.5" /> Enviar a mensaje
        </Button>
        {url && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs text-muted-foreground hover:text-white cursor-pointer"
            asChild
          >
            <Link href={url}>
              <ExternalLink className="w-3.5 h-3.5" /> Abrir
            </Link>
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

function SavedResourcesPanel() {
  const { items, remove } = useSavedLibrary();

  return (
    <section className="flex flex-col gap-4 w-full">
      {/* Cabecera de la sección */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/20">
            <Bookmark className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold font-headline text-indigo-200">
              Mis recursos guardados
            </h2>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Tus recursos soberanos (guardados o instalados desde la Tienda). Invócalos en
              un lienzo, adjúntalos a una publicación o envíalos por mensaje.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="gap-2 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10 cursor-pointer shrink-0"
          asChild
        >
          <Link href="/store">
            <Store className="w-4 h-4" /> Explorar la Tienda
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground border border-dashed border-white/10 rounded-3xl bg-white/5">
          <Bookmark className="w-10 h-10 mb-3 opacity-25" />
          <p className="text-sm">Aún no has guardado recursos.</p>
          <p className="text-xs mt-1">
            Guarda recursos del explorador o instala desde la Tienda: aterrizarán aquí.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-2 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10 cursor-pointer"
            asChild
          >
            <Link href="/store">
              <Store className="w-3.5 h-3.5" /> Ir a la Tienda
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3">
          {items.map((r) => (
            <SavedResourceCard key={r.id} resource={r} onRemove={remove} />
          ))}
        </div>
      )}
    </section>
  );
}

import { Suspense } from "react";

function LibraryContent() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('view') === 'personal' ? 'PERSONAL' : 'GLOBAL';

  // ── File-system state ──
  const [mode, setMode] = useState<LibraryMode>(initialMode);
  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: "Inicio" }]);

  // ── Explorer state ──
  const [activeKind, setActiveKind] = useState<ResourceType>('todos');
  const [sortMode, setSortMode] = useState<SortMode>('recientes');
  const [explorerSearch, setExplorerSearch] = useState("");
  const [explorerViewMode, setExplorerViewMode] = useState<ViewMode>('GRID');

  // Restore sort preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('library_sort');
      if (saved === 'recientes' || saved === 'valorados' || saved === 'populares') {
        setSortMode(saved as SortMode);
      }
    }
  }, []);

  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'personal') setMode('PERSONAL');
    else if (view === 'global') setMode('GLOBAL');
  }, [searchParams]);

  // ── File-system filter ──
  const filteredAssets = mockAssets.filter(asset => {
    const matchesMode = asset.mode === mode;
    const matchesFolder = asset.parentId === currentFolderId;
    const matchesSearch = searchQuery
      ? asset.name.toLowerCase().includes(searchQuery.toLowerCase())
      : matchesFolder;
    if (searchQuery) return matchesMode && matchesSearch;
    return matchesMode && matchesFolder;
  });

  // ── Explorer filter + sort ──
  const filteredResources = useMemo(() => {
    let items = ALL_RESOURCES;

    if (activeKind !== 'todos') {
      items = items.filter(r => r.kind === activeKind);
    }

    if (explorerSearch.trim()) {
      const q = explorerSearch.toLowerCase();
      items = items.filter(r =>
        r.title.toLowerCase().includes(q) ||
        (r.author ?? '').toLowerCase().includes(q) ||
        r.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    if (sortMode === 'valorados') {
      items = [...items].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortMode === 'populares') {
      items = [...items].sort((a, b) => {
        const bScore = (b.likes ?? 0) + (b.members ?? 0);
        const aScore = (a.likes ?? 0) + (a.members ?? 0);
        return bScore - aScore;
      });
    }

    return items;
  }, [activeKind, explorerSearch, sortMode]);

  // ── Handlers ──
  const handleFolderClick = (folder: AssetItem) => {
    if (folder.type === 'FOLDER' || folder.type === 'LIBRARY') {
      setCurrentFolderId(folder.id);
      setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
      setSearchQuery("");
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    const target = breadcrumbs[index];
    setCurrentFolderId(target.id);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
  };

  const handleModeSwitch = (newMode: LibraryMode) => {
    setMode(newMode);
    setCurrentFolderId(null);
    setBreadcrumbs([{ id: null, name: "Inicio" }]);
    setSearchQuery("");
  };

  const handleSortChange = (s: SortMode) => {
    setSortMode(s);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('library_sort', s);
    }
  };

  const getIconForType = (item: AssetItem) => {
    switch (item.type) {
      case 'LIBRARY': return <Book className="w-10 h-10 text-indigo-400" />;
      case 'FOLDER': return <Folder className="w-10 h-10 text-amber-200/80" />;
      case 'PROGRAM': return <Cpu className="w-10 h-10 text-emerald-400/80" />;
      case 'CONCEPT': return <Lightbulb className="w-10 h-10 text-purple-400/80" />;
      case 'PAGE': return <Globe className="w-10 h-10 text-blue-300/80" />;
      default: return <FileIcon className="w-10 h-10 text-cyan-200/80" />;
    }
  };

  const showExplorer = mode === 'GLOBAL' && currentFolderId === null && !searchQuery;

  return (
    <div className="flex flex-col gap-[clamp(1.5rem,3vw,3rem)] min-h-screen pb-24 px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] w-full mx-auto">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-[clamp(1rem,2vw,2rem)] w-full text-center md:text-left">
        <div className="flex flex-col gap-2 items-center md:items-start w-full md:w-auto">
          <h1 className="text-[clamp(2rem,4vw,3rem)] font-bold font-headline text-primary bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 w-full text-center md:text-left">
            {mode === 'GLOBAL' ? "Librería Global" : "Mi Biblioteca"}
          </h1>
          <p className="text-[clamp(0.9rem,1.2vw,1.1rem)] text-muted-foreground max-w-3xl text-balance w-full text-center md:text-left">
            {mode === 'GLOBAL'
              ? "Accede al conocimiento y recursos compartidos por toda la red StarSeed."
              : "Tu espacio personal seguro para archivos, ideas y proyectos."}
          </p>
          {/* Enlace a la Tienda — los recursos instalados aterrizan en «Mis recursos guardados» */}
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center md:justify-start">
            <Store className="w-3.5 h-3.5 text-indigo-300" />
            <Link href="/store" className="text-indigo-300 hover:text-indigo-200 hover:underline cursor-pointer font-medium">
              Explorar la Tienda
            </Link>
            <span className="opacity-70">— lo que instales aterriza en «Mis recursos guardados».</span>
          </p>
        </div>

        {/* Zone Switcher */}
        <div className="bg-black/40 p-1 rounded-full border border-white/10 flex items-center">
          <button
            onClick={() => handleModeSwitch('GLOBAL')}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 cursor-pointer",
              mode === 'GLOBAL'
                ? "bg-indigo-500/20 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-500/30"
                : "text-muted-foreground hover:text-white"
            )}
          >
            <Globe className="w-4 h-4" /> Librería Global
          </button>
          <button
            onClick={() => handleModeSwitch('PERSONAL')}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 cursor-pointer",
              mode === 'PERSONAL'
                ? "bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-emerald-500/30"
                : "text-muted-foreground hover:text-white"
            )}
          >
            <Lock className="w-4 h-4" /> Mi Biblioteca
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          MIS RECURSOS GUARDADOS — interconexión + enlace a Tienda
          (aditivo: consume el store soberano; siempre visible)
          ══════════════════════════════════════════════════════ */}
      <SavedResourcesPanel />

      {/* ══════════════════════════════════════════════════════
          EXPLORADOR UNIFICADO — solo en Librería Global / raíz
          ══════════════════════════════════════════════════════ */}
      {showExplorer && (
        <section className="flex flex-col gap-5">
          {/* Section title */}
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-white">Explorador de Conocimiento</h2>
            <span className="text-xs text-muted-foreground bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
              {filteredResources.length} recursos
            </span>
          </div>

          {/* Controls bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-background/20 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3">
            {/* Search */}
            <div className="relative flex-1 min-w-0 w-full sm:w-auto group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Buscar por título, autor o etiqueta..."
                className="pl-10 bg-black/20 border-white/5 focus-visible:ring-indigo-500/50 w-full"
                value={explorerSearch}
                onChange={(e) => setExplorerSearch(e.target.value)}
              />
              {explorerSearch && (
                <button
                  onClick={() => setExplorerSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Sort */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5 gap-2 cursor-pointer">
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span className="capitalize">{sortMode}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-black/80 border-white/10 backdrop-blur-xl">
                  <DropdownMenuLabel className="text-muted-foreground text-xs">Ordenar por</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/5" />
                  {(['recientes', 'valorados', 'populares'] as SortMode[]).map(s => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => handleSortChange(s)}
                      className={cn("cursor-pointer capitalize", sortMode === s && "text-primary")}
                    >
                      {s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* View toggle */}
              <div className="flex bg-black/20 rounded-lg p-1 border border-white/5">
                <button
                  onClick={() => setExplorerViewMode('GRID')}
                  className={cn("p-1.5 rounded transition-all cursor-pointer", explorerViewMode === 'GRID' ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setExplorerViewMode('LIST')}
                  className={cn("p-1.5 rounded transition-all cursor-pointer", explorerViewMode === 'LIST' ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}
                >
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(KIND_CONFIG) as ResourceType[]).map(k => (
              <button
                key={k}
                onClick={() => setActiveKind(k)}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200 cursor-pointer",
                  activeKind === k
                    ? KIND_CONFIG[k].color + " shadow-sm"
                    : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-white"
                )}
              >
                {KIND_CONFIG[k].icon}
                {KIND_CONFIG[k].label}
                <span className="opacity-60 text-[10px]">
                  {k === 'todos'
                    ? ALL_RESOURCES.length
                    : ALL_RESOURCES.filter(r => r.kind === k).length}
                </span>
              </button>
            ))}
          </div>

          {/* Resource grid / list */}
          {explorerViewMode === 'GRID' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredResources.map(r => (
                <ResourceCard key={r.id} resource={r} view="GRID" />
              ))}
              {filteredResources.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center p-16 text-muted-foreground border border-dashed border-white/10 rounded-3xl bg-white/5">
                  <Search className="w-10 h-10 mb-3 opacity-25" />
                  <p className="text-sm">Sin resultados para tu búsqueda.</p>
                  <button
                    onClick={() => { setExplorerSearch(""); setActiveKind('todos'); }}
                    className="mt-2 text-xs text-primary hover:underline cursor-pointer"
                  >
                    Limpiar filtros
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20 backdrop-blur-md">
              {filteredResources.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 text-muted-foreground">
                  <Search className="w-10 h-10 mb-3 opacity-25" />
                  <p className="text-sm">Sin resultados para tu búsqueda.</p>
                </div>
              ) : (
                filteredResources.map(r => (
                  <ResourceCard key={r.id} resource={r} view="LIST" />
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          CONTROL BAR — explorador de archivos (siempre)
          ══════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-4 bg-background/20 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-white">
            {mode === 'GLOBAL' ? 'Archivos de la Red' : 'Mis Archivos'}
          </span>
        </div>

        {/* Top: Path & Search */}
        <div className="flex flex-col md:flex-row justify-between gap-4">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground overflow-x-auto">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id || 'root'} className="flex items-center gap-1 whitespace-nowrap">
                {index > 0 && <ChevronRight className="w-3 h-3 opacity-50" />}
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className={cn(
                    "hover:text-white cursor-pointer transition-colors",
                    index === breadcrumbs.length - 1 && "text-white font-bold pointer-events-none"
                  )}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder={mode === 'GLOBAL' ? "Buscar en toda la red..." : "Buscar en tus archivos..."}
              className="pl-10 bg-black/20 border-white/5 focus-visible:ring-indigo-500/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="h-px bg-white/5 w-full" />

        {/* Bottom: Actions & View Options */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left Actions */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            {mode === 'GLOBAL' ? (
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-lg shadow-indigo-500/20 cursor-pointer">
                <Upload className="w-4 h-4" /> Subir a la Red
              </Button>
            ) : (
              <>
                <Button className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer">
                  <Plus className="w-4 h-4" /> Nuevo
                </Button>
                <Button variant="outline" className="border-white/10 hover:bg-white/5 gap-2 cursor-pointer">
                  <Folder className="w-4 h-4" /> Nueva Carpeta
                </Button>
              </>
            )}
          </div>

          {/* Right View Options */}
          <div className="flex items-center gap-3">
            {breadcrumbs.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => handleBreadcrumbClick(breadcrumbs.length - 2)} className="gap-2 cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> Atrás
              </Button>
            )}

            <div className="w-px h-4 bg-white/10" />

            {/* View Toggle */}
            <div className="flex bg-black/20 rounded-lg p-1 border border-white/5">
              <button onClick={() => setViewMode('GRID')} className={cn("p-1.5 rounded transition-all cursor-pointer", viewMode === 'GRID' ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('LIST')} className={cn("p-1.5 rounded transition-all cursor-pointer", viewMode === 'LIST' ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}>
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          FILE SYSTEM CONTENT GRID
          ══════════════════════════════════════════════ */}
      {viewMode === 'GRID' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-[clamp(1rem,2vw,2rem)] w-full">
          {filteredAssets.map(asset => (
            <GlassCard
              key={asset.id}
              variant="hover"
              onClick={() => handleFolderClick(asset)}
              className={cn(
                "group cursor-pointer p-0 aspect-[1/1] flex flex-col border-white/5 bg-gradient-to-br from-white/5 to-transparent hover:border-primary/50 transition-all duration-300",
                (asset.type === 'FOLDER' || asset.type === 'LIBRARY') ? "hover:scale-[1.02]" : ""
              )}
            >
              {/* Asset Icon Area */}
              <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                <div className="group-hover:scale-110 transition-transform duration-500 p-6 rounded-full bg-white/5 group-hover:bg-white/10">
                  {getIconForType(asset)}
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full bg-black/50 hover:bg-white hover:text-black cursor-pointer">
                    <MoreVertical className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Metadata Footer */}
              <div className="p-3 bg-black/20 border-t border-white/5 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate text-gray-200 group-hover:text-primary transition-colors">{asset.name}</p>
                    <p className="text-[10px] text-muted-foreground flex gap-2">
                      {asset.type === 'LIBRARY' || asset.type === 'FOLDER'
                        ? <span>{asset.size}</span>
                        : <span>{asset.type} • {asset.size}</span>
                      }
                    </p>
                  </div>
                </div>
                {asset.aiTags.length > 0 && (
                  <div className="flex gap-1 mt-2 overflow-hidden">
                    {asset.aiTags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </GlassCard>
          ))}

          {filteredAssets.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center p-20 text-muted-foreground border border-dashed border-white/10 rounded-3xl bg-white/5">
              <Folder className="w-12 h-12 mb-4 opacity-30" />
              <p>No hay elementos en esta ubicación.</p>
              {searchQuery && <p className="text-sm mt-2">Intenta con otra búsqueda.</p>}
            </div>
          )}
        </div>
      ) : (
        /* List View */
        <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20 backdrop-blur-md">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-white/5 border-b border-white/5">
              <tr>
                <th className="px-6 py-3">Nombre</th>
                <th className="px-6 py-3">Tipo</th>
                {mode === 'GLOBAL' && <th className="px-6 py-3">Autor</th>}
                <th className="px-6 py-3">Etiquetas</th>
                <th className="px-6 py-3">Modificado</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredAssets.map((asset) => (
                <tr
                  key={asset.id}
                  onClick={() => handleFolderClick(asset)}
                  className="group hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 font-medium flex items-center gap-3">
                    {getIconForType(asset)}
                    <span className="group-hover:text-primary transition-colors">{asset.name}</span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    <Badge variant="outline" className="border-white/10">{asset.type}</Badge>
                  </td>
                  {mode === 'GLOBAL' && <td className="px-6 py-4 text-muted-foreground text-xs">{asset.author || 'Sistema'}</td>}
                  <td className="px-6 py-4 text-muted-foreground text-xs">{asset.aiTags.join(", ")}</td>
                  <td className="px-6 py-4 text-muted-foreground">{asset.modified}</td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* StarSeed · Nexus & Drive — solo en Librería Global y raíz */}
      {showExplorer && (
        <div className="w-full mt-2">
          <StarSeedKnowledgePanel />
        </div>
      )}

      {/* Diseños · Código abierto — solo en Librería Global y raíz */}
      {showExplorer && (
        <div className="w-full mt-2">
          <DesignAssetsPanel />
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-muted-foreground">Cargando librería...</div>}>
      <LibraryContent />
    </Suspense>
  );
}
