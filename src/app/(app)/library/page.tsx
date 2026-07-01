"use client";

// Evita el bailout de prerender estatico por useSearchParams (build de Vercel).
export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════════
// Librería / Biblioteca UNIFICADA (#129 + parte de #130)
// ------------------------------------------------------------------
// Un único destino que fusiona:
//   • Explorar  → Librería global (conocimiento + archivos de la red).
//   • Mi Biblioteca → espacio personal (archivos + recursos guardados).
//   • Tienda   → la antigua Tienda ABSORBIDA (publicar/instalar/valorar).
//   • Fuentes  → catálogo de fuentes (GitHub, Dribbble, 21st.dev, v0.app,
//               mcpmarket…) + selector de servidor/almacenamiento/cerebros.
//   • Actualizaciones → novedades + alternativas/recomendaciones por cerebro.
//
// Al TOPE: tarjeta de descarga de la ÚLTIMA versión de StarSeed OS.
// Cada tarjeta de app/archivo abre una ficha tipo App Store (AppFilePage).
// La ruta /store se retira (redirige a /library?tab=store).
//
// Aditivo/defensivo: se conserva TODA la data existente; localStorage y
// Supabase van guardados; estética glass, responsive, español.
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, Suspense } from "react";
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
  X,
  ExternalLink,
  Package,
  Send,
  PenSquare,
  LayoutTemplate,
  Trash2,
  Bookmark,
  Compass,
  BookMarked,
  RefreshCw,
  Server,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StarSeedKnowledgePanel } from "@/components/library/StarSeedKnowledgePanel";
import { DesignAssetsPanel } from "@/components/library/DesignAssetsPanel";
import { LibrarySourcesPanel } from "@/components/library/library-sources-panel";
import { LibraryStorageSelector } from "@/components/library/library-storage-selector";
import { LibraryStorePanel } from "@/components/library/library-store-panel";
import { LibraryUpdatesPanel } from "@/components/library/library-updates-panel";
import { OsDownloadCard } from "@/components/library/os-download-card";
import { AppFilePage, type LibraryDetailItem } from "@/components/library/app-file-page";
import { articles, courses, files } from "@/lib/data";
import { samplePages } from "@/data/sample-entities";

// ── Interconexión aditiva (Módulo 8) ──
import { useSavedLibrary, type SavedResource } from "@/lib/library-store";
import { emitAttach, openComposer } from "@/lib/share/bridge";
import { FilePreview, type FileLike } from "@/components/files/file-preview";
import { toast } from "sonner";

// --- Types ---

type ViewMode = "GRID" | "LIST";
type AssetType = "FILE" | "FOLDER" | "LIBRARY" | "PROGRAM" | "PAGE" | "CONCEPT";
type ResourceType = "todos" | "articulos" | "cursos" | "documentos" | "comunidades";
type SortMode = "recientes" | "valorados" | "populares";
type LibraryTab = "explorar" | "personal" | "store" | "fuentes" | "updates";

interface AssetItem {
  id: string;
  parentId: string | null;
  name: string;
  type: AssetType;
  subType?: string;
  size?: string;
  modified: string;
  preview?: string;
  mode: "GLOBAL" | "PERSONAL";
  aiTags: string[];
  author?: string;
}

// --- Mock Data (conservada) ---

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
      kind: "articulos",
      title: a.title,
      author: a.author,
      description: a.excerpt,
      tags: a.tags,
      href: a.href,
      rating: a.rating,
      likes: a.likes,
      modified: "reciente",
    });
  }
  for (const c of courses) {
    result.push({
      id: c.id,
      kind: "cursos",
      title: c.title,
      description: c.description,
      tags: c.tags,
      href: c.href,
      modified: "reciente",
    });
  }
  for (const f of files) {
    result.push({
      id: String(f.id),
      kind: "documentos",
      title: f.name,
      tags: [f.type],
      href: "#",
      modified: f.date,
    });
  }
  for (const p of samplePages) {
    result.push({
      id: p.id,
      kind: "comunidades",
      title: p.title,
      description: p.description,
      tags: p.tags,
      href: `/pagina/${p.id}`,
      members: p.members,
      status: p.status,
      modified: "reciente",
    });
  }
  return result;
}

const ALL_RESOURCES = buildUnifiedResources();

// ── Config per kind ──
const KIND_CONFIG: Record<ResourceType, { label: string; color: string; icon: React.ReactNode }> = {
  todos: { label: "Todos", color: "bg-white/10 text-white border-white/20", icon: <Book className="w-3 h-3" /> },
  articulos: { label: "Artículos", color: "bg-blue-500/15 text-blue-300 border-blue-500/30", icon: <BookOpen className="w-3 h-3" /> },
  cursos: { label: "Cursos", color: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: <GraduationCap className="w-3 h-3" /> },
  documentos: { label: "Documentos", color: "bg-violet-500/15 text-violet-300 border-violet-500/30", icon: <FileText className="w-3 h-3" /> },
  comunidades: { label: "Comunidades", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: <Users className="w-3 h-3" /> },
};

function KindBadge({ kind }: { kind: ResourceType }) {
  const cfg = KIND_CONFIG[kind];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", cfg.color)}>
      {cfg.icon}
      {cfg.label}
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

/** Convierte un recurso unificado en la ficha tipo App Store. */
function resourceToDetail(r: UnifiedResource): LibraryDetailItem {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.kind,
    categoryLabel: KIND_CONFIG[r.kind].label,
    author: r.author,
    rating: r.rating,
    tags: r.tags,
    fileKind: r.kind,
    sourceLabel: "Librería StarSeed",
    openUrl: r.href && r.href !== "#" ? r.href : undefined,
    sourceUrl: r.href && r.href.startsWith("http") ? r.href : undefined,
    origin: "saved",
  };
}

function ResourceCard({
  resource,
  view,
  onOpenDetail,
}: {
  resource: UnifiedResource;
  view: ViewMode;
  onOpenDetail: (item: LibraryDetailItem) => void;
}) {
  const openDetail = (e: React.MouseEvent) => {
    e.preventDefault();
    onOpenDetail(resourceToDetail(resource));
  };

  if (view === "LIST") {
    return (
      <button
        onClick={openDetail}
        className="group flex w-full items-center gap-4 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer text-left"
      >
        <div className="shrink-0">{KIND_CONFIG[resource.kind].icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-200 group-hover:text-primary transition-colors truncate">{resource.title}</p>
          {resource.author && <p className="text-xs text-muted-foreground">{resource.author}</p>}
        </div>
        <KindBadge kind={resource.kind} />
        <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
          {resource.rating !== undefined && <StarRating rating={resource.rating} />}
          {resource.likes !== undefined && (
            <span className="flex items-center gap-0.5">
              <Heart className="w-3 h-3" />
              {resource.likes}
            </span>
          )}
          {resource.members !== undefined && (
            <span className="flex items-center gap-0.5">
              <Users className="w-3 h-3" />
              {resource.members.toLocaleString()}
            </span>
          )}
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
    );
  }

  return (
    <button onClick={openDetail} className="group cursor-pointer block text-left w-full">
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
          {resource.description && <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{resource.description}</p>}
          <div className="flex gap-1 flex-wrap mt-auto pt-1">
            {resource.tags.slice(0, 3).map((t) => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        </div>
        <div className="px-4 pb-3 flex items-center justify-between border-t border-white/5 pt-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {resource.rating !== undefined && <StarRating rating={resource.rating} />}
            {resource.likes !== undefined && (
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {resource.likes}
              </span>
            )}
            {resource.members !== undefined && (
              <span className="flex items-center gap-0.5">
                <Users className="w-3 h-3" />
                {resource.members.toLocaleString()}
              </span>
            )}
          </div>
          <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </GlassCard>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════
// MIS RECURSOS GUARDADOS — interconexión aditiva (Módulo 8)
// Lo que se instala desde la Tienda (ahora dentro de la Librería) aterriza aquí.
// ══════════════════════════════════════════════════════════════════

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

  const handleUseInCanvas = () => {
    emitAttach({ kind: "file", url, title });
    toast.success("Enviado al lienzo", { description: `«${title}» se adjuntará a la pizarra abierta.` });
  };

  const handleAttachToPost = () => {
    openComposer({ type: "archivo", content: { url, title } });
    toast.success("Compositor abierto", { description: `«${title}» listo para tu publicación.` });
  };

  const handleSendToMessage = async () => {
    const ref = buildShareRef(resource);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(ref);
        toast.success("Referencia copiada", { description: "Pégala en un mensaje para compartir este recurso." });
      } else {
        toast.message("Referencia del recurso", { description: ref });
      }
    } catch {
      toast.message("Referencia del recurso", { description: ref });
    }
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

      {url && <FilePreview file={{ url, name: title, type: resource.kind } as FileLike} context="library" actions={false} compact />}

      <div className="flex flex-wrap items-center gap-2 mt-auto">
        <Button size="sm" className="gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer" onClick={handleUseInCanvas}>
          <LayoutTemplate className="w-3.5 h-3.5" /> Usar en lienzo
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs border-white/15 hover:bg-white/10 cursor-pointer" onClick={handleAttachToPost}>
          <PenSquare className="w-3.5 h-3.5" /> Adjuntar a publicación
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs border-white/15 hover:bg-white/10 cursor-pointer" onClick={handleSendToMessage}>
          <Send className="w-3.5 h-3.5" /> Enviar a mensaje
        </Button>
        {url && (
          <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground hover:text-white cursor-pointer" asChild>
            <Link href={url}>
              <ExternalLink className="w-3.5 h-3.5" /> Abrir
            </Link>
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

function SavedResourcesPanel({ onGoStore }: { onGoStore: () => void }) {
  const { items, remove } = useSavedLibrary();

  return (
    <section className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/20">
            <Bookmark className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold font-headline text-indigo-200">Mis recursos guardados</h2>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Tus recursos soberanos (guardados o instalados desde la Tienda de la Librería). Invócalos en un lienzo,
              adjúntalos a una publicación o envíalos por mensaje.
            </p>
          </div>
        </div>
        <Button variant="outline" className="gap-2 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10 cursor-pointer shrink-0" onClick={onGoStore}>
          <Package className="w-4 h-4" /> Explorar la Tienda
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground border border-dashed border-white/10 rounded-3xl bg-white/5">
          <Bookmark className="w-10 h-10 mb-3 opacity-25" />
          <p className="text-sm">Aún no has guardado recursos.</p>
          <p className="text-xs mt-1">Guarda recursos del explorador o instala desde la Tienda: aterrizarán aquí.</p>
          <Button variant="outline" size="sm" className="mt-4 gap-2 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10 cursor-pointer" onClick={onGoStore}>
            <Package className="w-3.5 h-3.5" /> Ir a la Tienda
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

// ══════════════════════════════════════════════════════════════════
// Explorador de archivos (compartido entre "Explorar" y "Mi Biblioteca")
// ══════════════════════════════════════════════════════════════════

function FileSystemExplorer({ mode }: { mode: "GLOBAL" | "PERSONAL" }) {
  const [viewMode, setViewMode] = useState<ViewMode>("GRID");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: "Inicio" }]);

  // Reset cuando cambia el modo (al cambiar de pestaña).
  useEffect(() => {
    setCurrentFolderId(null);
    setBreadcrumbs([{ id: null, name: "Inicio" }]);
    setSearchQuery("");
  }, [mode]);

  const filteredAssets = mockAssets.filter((asset) => {
    const matchesMode = asset.mode === mode;
    const matchesFolder = asset.parentId === currentFolderId;
    const matchesSearch = searchQuery ? asset.name.toLowerCase().includes(searchQuery.toLowerCase()) : matchesFolder;
    if (searchQuery) return matchesMode && matchesSearch;
    return matchesMode && matchesFolder;
  });

  const handleFolderClick = (folder: AssetItem) => {
    if (folder.type === "FOLDER" || folder.type === "LIBRARY") {
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

  const getIconForType = (item: AssetItem) => {
    switch (item.type) {
      case "LIBRARY":
        return <Book className="w-10 h-10 text-indigo-400" />;
      case "FOLDER":
        return <Folder className="w-10 h-10 text-amber-200/80" />;
      case "PROGRAM":
        return <Cpu className="w-10 h-10 text-emerald-400/80" />;
      case "CONCEPT":
        return <Lightbulb className="w-10 h-10 text-purple-400/80" />;
      case "PAGE":
        return <Globe className="w-10 h-10 text-blue-300/80" />;
      default:
        return <FileIcon className="w-10 h-10 text-cyan-200/80" />;
    }
  };

  return (
    <>
      {/* CONTROL BAR */}
      <div className="flex flex-col gap-4 bg-background/20 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-white">{mode === "GLOBAL" ? "Archivos de la Red" : "Mis Archivos"}</span>
        </div>

        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground overflow-x-auto">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id || "root"} className="flex items-center gap-1 whitespace-nowrap">
                {index > 0 && <ChevronRight className="w-3 h-3 opacity-50" />}
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className={cn("hover:text-white cursor-pointer transition-colors", index === breadcrumbs.length - 1 && "text-white font-bold pointer-events-none")}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>

          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder={mode === "GLOBAL" ? "Buscar en toda la red..." : "Buscar en tus archivos..."}
              className="pl-10 bg-black/20 border-white/5 focus-visible:ring-indigo-500/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="h-px bg-white/5 w-full" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full md:w-auto">
            {mode === "GLOBAL" ? (
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

          <div className="flex items-center gap-3">
            {breadcrumbs.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => handleBreadcrumbClick(breadcrumbs.length - 2)} className="gap-2 cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> Atrás
              </Button>
            )}
            <div className="w-px h-4 bg-white/10" />
            <div className="flex bg-black/20 rounded-lg p-1 border border-white/5">
              <button onClick={() => setViewMode("GRID")} className={cn("p-1.5 rounded transition-all cursor-pointer", viewMode === "GRID" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode("LIST")} className={cn("p-1.5 rounded transition-all cursor-pointer", viewMode === "LIST" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}>
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT GRID */}
      {viewMode === "GRID" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-[clamp(1rem,2vw,2rem)] w-full">
          {filteredAssets.map((asset) => (
            <GlassCard
              key={asset.id}
              variant="hover"
              onClick={() => handleFolderClick(asset)}
              className={cn(
                "group cursor-pointer p-0 aspect-[1/1] flex flex-col border-white/5 bg-gradient-to-br from-white/5 to-transparent hover:border-primary/50 transition-all duration-300",
                asset.type === "FOLDER" || asset.type === "LIBRARY" ? "hover:scale-[1.02]" : "",
              )}
            >
              <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                <div className="group-hover:scale-110 transition-transform duration-500 p-6 rounded-full bg-white/5 group-hover:bg-white/10">{getIconForType(asset)}</div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full bg-black/50 hover:bg-white hover:text-black cursor-pointer">
                    <MoreVertical className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="p-3 bg-black/20 border-t border-white/5 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate text-gray-200 group-hover:text-primary transition-colors">{asset.name}</p>
                    <p className="text-[10px] text-muted-foreground flex gap-2">
                      {asset.type === "LIBRARY" || asset.type === "FOLDER" ? <span>{asset.size}</span> : <span>{asset.type} • {asset.size}</span>}
                    </p>
                  </div>
                </div>
                {asset.aiTags.length > 0 && (
                  <div className="flex gap-1 mt-2 overflow-hidden">
                    {asset.aiTags.slice(0, 2).map((tag) => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
                        #{tag}
                      </span>
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
        <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20 backdrop-blur-md">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-white/5 border-b border-white/5">
              <tr>
                <th className="px-6 py-3">Nombre</th>
                <th className="px-6 py-3">Tipo</th>
                {mode === "GLOBAL" && <th className="px-6 py-3">Autor</th>}
                <th className="px-6 py-3">Etiquetas</th>
                <th className="px-6 py-3">Modificado</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredAssets.map((asset) => (
                <tr key={asset.id} onClick={() => handleFolderClick(asset)} className="group hover:bg-white/5 transition-colors cursor-pointer">
                  <td className="px-6 py-4 font-medium flex items-center gap-3">
                    {getIconForType(asset)}
                    <span className="group-hover:text-primary transition-colors">{asset.name}</span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    <Badge variant="outline" className="border-white/10">{asset.type}</Badge>
                  </td>
                  {mode === "GLOBAL" && <td className="px-6 py-4 text-muted-foreground text-xs">{asset.author || "Sistema"}</td>}
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
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// Explorador de conocimiento (Librería global)
// ══════════════════════════════════════════════════════════════════

function KnowledgeExplorer({ onOpenDetail }: { onOpenDetail: (item: LibraryDetailItem) => void }) {
  const [activeKind, setActiveKind] = useState<ResourceType>("todos");
  const [sortMode, setSortMode] = useState<SortMode>("recientes");
  const [explorerSearch, setExplorerSearch] = useState("");
  const [explorerViewMode, setExplorerViewMode] = useState<ViewMode>("GRID");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("library_sort");
      if (saved === "recientes" || saved === "valorados" || saved === "populares") {
        setSortMode(saved as SortMode);
      }
    }
  }, []);

  const filteredResources = useMemo(() => {
    let items = ALL_RESOURCES;
    if (activeKind !== "todos") items = items.filter((r) => r.kind === activeKind);
    if (explorerSearch.trim()) {
      const q = explorerSearch.toLowerCase();
      items = items.filter(
        (r) => r.title.toLowerCase().includes(q) || (r.author ?? "").toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (sortMode === "valorados") {
      items = [...items].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortMode === "populares") {
      items = [...items].sort((a, b) => {
        const bScore = (b.likes ?? 0) + (b.members ?? 0);
        const aScore = (a.likes ?? 0) + (a.members ?? 0);
        return bScore - aScore;
      });
    }
    return items;
  }, [activeKind, explorerSearch, sortMode]);

  const handleSortChange = (s: SortMode) => {
    setSortMode(s);
    if (typeof window !== "undefined") window.localStorage.setItem("library_sort", s);
  };

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <BookOpen className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-white">Explorador de Conocimiento</h2>
        <span className="text-xs text-muted-foreground bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{filteredResources.length} recursos</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-background/20 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3">
        <div className="relative flex-1 min-w-0 w-full sm:w-auto group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Buscar por título, autor o etiqueta..."
            className="pl-10 bg-black/20 border-white/5 focus-visible:ring-indigo-500/50 w-full"
            value={explorerSearch}
            onChange={(e) => setExplorerSearch(e.target.value)}
          />
          {explorerSearch && (
            <button onClick={() => setExplorerSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white cursor-pointer transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
              {(["recientes", "valorados", "populares"] as SortMode[]).map((s) => (
                <DropdownMenuItem key={s} onClick={() => handleSortChange(s)} className={cn("cursor-pointer capitalize", sortMode === s && "text-primary")}>
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex bg-black/20 rounded-lg p-1 border border-white/5">
            <button onClick={() => setExplorerViewMode("GRID")} className={cn("p-1.5 rounded transition-all cursor-pointer", explorerViewMode === "GRID" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setExplorerViewMode("LIST")} className={cn("p-1.5 rounded transition-all cursor-pointer", explorerViewMode === "LIST" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}>
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(Object.keys(KIND_CONFIG) as ResourceType[]).map((k) => (
          <button
            key={k}
            onClick={() => setActiveKind(k)}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200 cursor-pointer",
              activeKind === k ? KIND_CONFIG[k].color + " shadow-sm" : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-white",
            )}
          >
            {KIND_CONFIG[k].icon}
            {KIND_CONFIG[k].label}
            <span className="opacity-60 text-[10px]">{k === "todos" ? ALL_RESOURCES.length : ALL_RESOURCES.filter((r) => r.kind === k).length}</span>
          </button>
        ))}
      </div>

      {explorerViewMode === "GRID" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredResources.map((r) => (
            <ResourceCard key={r.id} resource={r} view="GRID" onOpenDetail={onOpenDetail} />
          ))}
          {filteredResources.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center p-16 text-muted-foreground border border-dashed border-white/10 rounded-3xl bg-white/5">
              <Search className="w-10 h-10 mb-3 opacity-25" />
              <p className="text-sm">Sin resultados para tu búsqueda.</p>
              <button onClick={() => { setExplorerSearch(""); setActiveKind("todos"); }} className="mt-2 text-xs text-primary hover:underline cursor-pointer">
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
            filteredResources.map((r) => <ResourceCard key={r.id} resource={r} view="LIST" onOpenDetail={onOpenDetail} />)
          )}
        </div>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
// Página unificada
// ══════════════════════════════════════════════════════════════════

// Mapea `?view=` (compat) y `?tab=` a una pestaña.
function resolveInitialTab(view: string | null, tab: string | null): LibraryTab {
  const t = (tab ?? "").toLowerCase();
  if (t === "explorar" || t === "personal" || t === "store" || t === "fuentes" || t === "updates") {
    return t as LibraryTab;
  }
  // Compat con la Tienda antigua: /library?tab=tienda o ?view=store/tienda.
  if (t === "tienda" || t === "tienda-store") return "store";
  const v = (view ?? "").toLowerCase();
  if (v === "personal") return "personal";
  if (v === "store" || v === "tienda") return "store";
  if (v === "fuentes" || v === "sources") return "fuentes";
  if (v === "updates" || v === "actualizaciones") return "updates";
  return "explorar";
}

function LibraryContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<LibraryTab>(() => resolveInitialTab(searchParams.get("view"), searchParams.get("tab")));

  // Ficha detallada (App Store / Play Store) — modal.
  const [detailItem, setDetailItem] = useState<LibraryDetailItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = (item: LibraryDetailItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  };

  // Reacciona a cambios de query (?view / ?tab) sin recargar.
  useEffect(() => {
    setTab(resolveInitialTab(searchParams.get("view"), searchParams.get("tab")));
  }, [searchParams]);

  const goStore = () => setTab("store");

  return (
    <div className="flex flex-col gap-[clamp(1.5rem,3vw,2.5rem)] min-h-screen pb-24 px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-2 items-center md:items-start w-full text-center md:text-left">
        <h1 className="text-[clamp(2rem,4vw,3rem)] font-bold font-headline text-primary bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 w-full text-center md:text-left">
          Librería · Biblioteca
        </h1>
        <p className="text-[clamp(0.9rem,1.2vw,1.1rem)] text-muted-foreground max-w-3xl text-balance w-full text-center md:text-left">
          Un solo lugar para el conocimiento de la red, tu espacio personal, la Tienda de recursos,
          las fuentes conectadas y las actualizaciones inteligentes.
        </p>
      </div>

      {/* Descarga del OS — SIEMPRE arriba */}
      <OsDownloadCard />

      {/* Pestañas */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as LibraryTab)} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-black/30 border border-white/10 p-1 rounded-2xl">
          <TabsTrigger value="explorar" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
            <Compass className="w-4 h-4" /> Explorar
          </TabsTrigger>
          <TabsTrigger value="personal" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
            <Lock className="w-4 h-4" /> Mi Biblioteca
          </TabsTrigger>
          <TabsTrigger value="store" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
            <Package className="w-4 h-4" /> Tienda
          </TabsTrigger>
          <TabsTrigger value="fuentes" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
            <BookMarked className="w-4 h-4" /> Fuentes
          </TabsTrigger>
          <TabsTrigger value="updates" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
            <RefreshCw className="w-4 h-4" /> Actualizaciones
          </TabsTrigger>
        </TabsList>

        {/* EXPLORAR — Librería global */}
        <TabsContent value="explorar" className="mt-6 flex flex-col gap-[clamp(1.5rem,3vw,2.5rem)]">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="w-4 h-4 text-indigo-300" />
            Librería Global — conocimiento y recursos compartidos por toda la red StarSeed.
          </div>
          <KnowledgeExplorer onOpenDetail={openDetail} />
          <FileSystemExplorer mode="GLOBAL" />
          <div className="w-full mt-2">
            <StarSeedKnowledgePanel />
          </div>
          <div className="w-full mt-2">
            <DesignAssetsPanel />
          </div>
        </TabsContent>

        {/* MI BIBLIOTECA — personal */}
        <TabsContent value="personal" className="mt-6 flex flex-col gap-[clamp(1.5rem,3vw,2.5rem)]">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="w-4 h-4 text-emerald-300" />
            Tu espacio personal seguro para archivos, ideas y proyectos.
          </div>
          <SavedResourcesPanel onGoStore={goStore} />
          <FileSystemExplorer mode="PERSONAL" />
        </TabsContent>

        {/* TIENDA — absorbida */}
        <TabsContent value="store" className="mt-6">
          <LibraryStorePanel onOpenDetail={openDetail} />
        </TabsContent>

        {/* FUENTES + servidor/almacenamiento/cerebros */}
        <TabsContent value="fuentes" className="mt-6 flex flex-col gap-6">
          <GlassCard className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Server className="w-5 h-5 text-cyan-300" />
              <h2 className="text-lg font-bold">Servidor, almacenamiento y cerebro de contexto</h2>
            </div>
            <LibraryStorageSelector />
          </GlassCard>

          <GlassCard className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-cyan-300" />
              <h2 className="text-lg font-bold">Catálogo de fuentes</h2>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              GitHub, Dribbble, 21st.dev, v0.app, mcpmarket y cualquier servicio/tienda compatible —
              de cualquier tipo, para cualquier área o servicio de todos los sistemas.
            </p>
            <LibrarySourcesPanel />
          </GlassCard>
        </TabsContent>

        {/* ACTUALIZACIONES inteligentes */}
        <TabsContent value="updates" className="mt-6">
          <LibraryUpdatesPanel />
        </TabsContent>
      </Tabs>

      {/* Ficha detallada tipo App Store / Play Store */}
      <AppFilePage item={detailItem} open={detailOpen} onOpenChange={setDetailOpen} />
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
