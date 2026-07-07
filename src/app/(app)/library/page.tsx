"use client";

// Evita el bailout de prerender estatico por useSearchParams (build de Vercel).
export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════════
// Biblioteca — TIENDA VIVA del OS (estilo Cydia) + colección de siempre
// ------------------------------------------------------------------
// Desde aquí se instala CUALQUIER COSA directamente al sistema: repos
// (fuentes de paquetes), apps, widgets, páginas, publicaciones, pizarras,
// investigaciones, proyectos, diseños/temas, animaciones, funciones/skills
// y FUENTES DE IA por contexto. Todo open source y gratis-primero.
//
// Pestañas de nivel superior:
//   • Destacado    → paquetes curados + catálogo completo instalable.
//   • Categorías   → grid por tipo de paquete (12 kinds) con contadores.
//   • Repos        → fuentes de paquetes (núcleo + añadidas por URL).
//   • Mi colección → TODO lo que la Biblioteca era antes, intacto:
//                    Explorar · Mi Biblioteca · Fuentes · Actualizaciones
//                    (catálogo unificado, intercambio, conocimiento,
//                    archivos, fuentes conectadas y updates inteligentes).
//   • Instalado    → registro real de paquetes con desinstalación.
//
// El motor de paquetes vive en src/lib/library/packages.ts (efectos REALES:
// activa fuentes IA en Astraura, clases de material/animación, skills,
// rutas del OS). La UI de tienda en components/library/package-store.tsx.
//
// Al TOPE: franja de descarga de la ÚLTIMA versión de StarSeed OS con
// «Ver ficha» rica. Compat de enlaces antiguos: ?tab=explorar|personal|
// fuentes|updates aterrizan dentro de «Mi colección»; ?tab=store|tienda
// aterrizan en Destacado (la tienda vuelve, ahora de verdad).
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
  Download,
  Sparkles,
  Store,
  Shapes,
  GitBranch,
  PackageCheck,
  Rocket,
  Landmark,
  Sprout,
  CalendarDays,
  Loader2,
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
import { InstallButton } from "@/components/welcome/install-button";
import { AppFilePage, type LibraryDetailItem } from "@/components/library/app-file-page";
import { LibraryCatalog, starseedAppToDetail } from "@/components/library/library-catalog";
import { InstalledServicesPanel } from "@/components/library/installed-services-panel";
// ── Tienda viva de paquetes (estilo Cydia) — motor en lib/library/packages ──
import { PackageStore, type StoreSection } from "@/components/library/package-store";
// ── Sección de INSTALACIÓN OFICIAL (OS + compañero de Aurora + modelos locales) ──
import { InstallOfficialSection } from "@/components/library/install-official-section";
import { STARSEED_APP_LISTINGS } from "@/data/starseed-apps-listings";
import { articles, courses, files } from "@/lib/data";
import { samplePages } from "@/data/sample-entities";

// ── Interconexión aditiva (Módulo 8) ──
import { useSavedLibrary, type SavedResource } from "@/lib/library-store";
import { emitAttach, openComposer } from "@/lib/share/bridge";
import { FilePreview, type FileLike } from "@/components/files/file-preview";
import { toast } from "sonner";

// ── Biblioteca por entidad (Adenda 64): área NUEVA y separada de la Librería.
// Conmutador superior "Librería | Biblioteca" — ver architecture/libreria-biblioteca-sync.md
import { EntityLibraryPanel } from "@/components/library/entity-library-panel";
import {
  useMyLibraryDestinations,
  libraryRef,
  type LibraryDestination,
} from "@/lib/library/entity-library";
import { createClient } from "@/utils/supabase/client";
// ── Catálogo público de la Librería — sección "Comunidad" (Adenda 64 §7) ──
import { PublicCatalogSection } from "@/components/library/finder/public-catalog-section";

// --- Types ---

type ViewMode = "GRID" | "LIST";
type AssetType = "FILE" | "FOLDER" | "LIBRARY" | "PROGRAM" | "PAGE" | "CONCEPT";
type ResourceType = "todos" | "articulos" | "cursos" | "documentos" | "comunidades";
type SortMode = "recientes" | "valorados" | "populares";
/** Pestañas de nivel superior (la tienda viva + la colección de siempre). */
type LibraryTab = "instalar-starseed" | "destacado" | "categorias" | "repos" | "comunidad" | "coleccion" | "instalado";
/** Pestañas internas de «Mi colección» (la Biblioteca anterior, intacta). */
type CollectionTab = "explorar" | "personal" | "fuentes" | "updates";

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

// ── Tipado LOCAL de las colecciones de @/lib/data ──
// Hoy `articles/courses/files` son arrays vacíos (inferidos como never[]),
// lo que rompía el acceso a propiedades. Les damos forma estable aquí sin
// tocar lib/data: si algún día traen datos, esta forma es la esperada.
interface KnownArticle {
  id: string;
  title: string;
  author?: string;
  excerpt?: string;
  tags?: string[];
  href?: string;
  rating?: number;
  likes?: number;
}
interface KnownCourse {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  href?: string;
}
interface KnownFile {
  id: string | number;
  name: string;
  type?: string;
  date?: string;
}

const KNOWN_ARTICLES = articles as unknown as KnownArticle[];
const KNOWN_COURSES = courses as unknown as KnownCourse[];
const KNOWN_FILES = files as unknown as KnownFile[];

function buildUnifiedResources(): UnifiedResource[] {
  const result: UnifiedResource[] = [];

  for (const a of KNOWN_ARTICLES) {
    result.push({
      id: a.id,
      kind: "articulos",
      title: a.title,
      author: a.author,
      description: a.excerpt,
      tags: a.tags ?? [],
      href: a.href ?? "#",
      rating: a.rating,
      likes: a.likes,
      modified: "reciente",
    });
  }
  for (const c of KNOWN_COURSES) {
    result.push({
      id: c.id,
      kind: "cursos",
      title: c.title,
      description: c.description,
      tags: c.tags ?? [],
      href: c.href ?? "#",
      modified: "reciente",
    });
  }
  for (const f of KNOWN_FILES) {
    result.push({
      id: String(f.id),
      kind: "documentos",
      title: f.name,
      tags: f.type ? [f.type] : [],
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
// Lo que se instala desde Explorar (apps, cursores, gestos, comandos,
// recursos del intercambio…) aterriza aquí.
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
  cursor: "Cursor",
  gesto: "Gesto táctil",
  comando: "Lista de comandos",
  layout: "Layout",
  widget: "Widget",
  servicio: "Servicio / Integración",
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
          className="flex items-center justify-center h-10 w-10 -m-1.5 rounded-full text-muted-foreground hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
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

function SavedResourcesPanel({ onGoExplore }: { onGoExplore: () => void }) {
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
              Tus recursos soberanos (guardados o instalados desde Explorar). Invócalos en un lienzo,
              adjúntalos a una publicación o envíalos por mensaje.
            </p>
          </div>
        </div>
        <Button variant="outline" className="gap-2 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10 cursor-pointer shrink-0" onClick={onGoExplore}>
          <Compass className="w-4 h-4" /> Explorar la Librería
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground border border-dashed border-white/10 rounded-3xl bg-white/5">
          <Bookmark className="w-10 h-10 mb-3 opacity-25" />
          <p className="text-sm">Aún no has guardado recursos.</p>
          <p className="text-xs mt-1">Guarda o instala desde Explorar (apps, cursores, gestos, comandos…): aterrizarán aquí.</p>
          <Button variant="outline" size="sm" className="mt-4 gap-2 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10 cursor-pointer" onClick={onGoExplore}>
            <Compass className="w-3.5 h-3.5" /> Ir a Explorar
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground overflow-x-auto scrollbar-hide">
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
                <div className="absolute top-2 right-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-10 w-10 sm:h-6 sm:w-6 rounded-full bg-black/50 hover:bg-white hover:text-black cursor-pointer">
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
          <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[640px] text-sm text-left">
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
                    <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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

      <div className="flex gap-2 flex-nowrap sm:flex-wrap ss-hscroll ss-hscroll-fade -mx-1 px-1 sm:mx-0 sm:px-0">
        {(Object.keys(KIND_CONFIG) as ResourceType[]).map((k) => (
          <button
            key={k}
            onClick={() => setActiveKind(k)}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200 cursor-pointer shrink-0",
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
// Franja de descarga del OS — versión de build REAL y accionable
// ------------------------------------------------------------------
// · Versión legible derivada de la fecha de build (constante actualizada por
//   release, o NEXT_PUBLIC_BUILD_DATE si el pipeline la inyecta en build).
// · «Instalar como app (PWA)» → InstallButton (flujo real: beforeinstallprompt
//   guardado + prompt(); fallback con instrucciones iOS/escritorio).
// · «Código fuente / releases» → repositorio oficial en GitHub.
// · Targets nativos (dmg/apk/exe) aún no publicados → nota honesta, sin
//   enlaces muertos.
// ══════════════════════════════════════════════════════════════════

/** URL oficial del despliegue de StarSeed OS (fuente: CLAUDE.md §1). */
const OS_WEB_URL = "https://starseed-os.vercel.app";
/** Código fuente y releases oficiales del sistema. */
const OS_REPO_URL = "https://github.com/StarSeedSystem/starseed-system";
/**
 * Fecha de build (AAAA.MM.DD). Si el pipeline define NEXT_PUBLIC_BUILD_DATE
 * (Next la inserta inline en el bundle), se usa esa; si no, esta constante se
 * actualiza en cada release.
 */
const OS_BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || "2026.07.01";
const OS_BUILD_LABEL = `StarSeed OS · build ${OS_BUILD_DATE}`;

/** "2026.07.01" → "1 de julio de 2026" (defensivo: si no parsea, crudo). */
function formatBuildDate(build: string): string {
  const [y, m, d] = build.split(/[./-]/).map((n) => Number(n));
  if (!y || !m || !d) return build;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return build;
  try {
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return build;
  }
}

/** Listado oficial del OS (para la ficha rica de la franja de descarga). */
const OS_APP_LISTING = STARSEED_APP_LISTINGS.find((a) => a.id === "starseed-os");

function OsDownloadStrip({ onOpenDetail }: { onOpenDetail: (item: LibraryDetailItem) => void }) {
  return (
    <GlassCard
      variant="hover"
      className="relative overflow-hidden p-6 border-emerald-400/20 bg-gradient-to-br from-emerald-900/30 via-teal-900/20 to-transparent"
    >
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3">
            <Download className="h-7 w-7 text-emerald-300" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold font-headline text-emerald-100">Descarga StarSeed OS</h2>
              <Badge variant="outline" className="gap-1 border-emerald-400/40 text-emerald-300 text-[10px]">
                <Sparkles className="h-3 w-3" /> {OS_BUILD_LABEL}
              </Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Última versión publicada el {formatBuildDate(OS_BUILD_DATE)}. Instálala como app en tu
              dispositivo (Android, iOS, escritorio) o ábrela en la web oficial.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {OS_APP_LISTING && (
                <button
                  type="button"
                  onClick={() => onOpenDetail(starseedAppToDetail(OS_APP_LISTING))}
                  className="inline-flex items-center gap-1 font-semibold text-emerald-200 hover:text-emerald-100 hover:underline cursor-pointer"
                  title="Ficha completa del OS: versiones, enlaces y apps relacionadas"
                >
                  <Sparkles className="h-3 w-3" /> Ver ficha
                </button>
              )}
              <a
                href={OS_WEB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-emerald-300 hover:text-emerald-200 hover:underline cursor-pointer"
              >
                starseed-os.vercel.app <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={OS_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-emerald-300 hover:text-emerald-200 hover:underline cursor-pointer"
              >
                Código fuente / releases <ExternalLink className="h-3 w-3" />
              </a>
              <span
                className="inline-flex items-center gap-1 text-muted-foreground"
                title="Los instaladores nativos aún no están publicados; en cuanto existan aparecerán aquí."
              >
                <Package className="h-3 w-3" /> Versiones nativas (dmg · apk · exe): en preparación
              </span>
            </div>
          </div>
        </div>

        {/* Acciones: instalación PWA real + web oficial */}
        <div className="flex w-full flex-col gap-2 md:w-64 shrink-0">
          <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-emerald-200/70">
            Instalar como app (PWA)
          </p>
          <InstallButton />
          <a
            href={OS_WEB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[13px] border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.08] cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" /> Abrir en la web
          </a>
        </div>
      </div>
    </GlassCard>
  );
}

// ══════════════════════════════════════════════════════════════════
// Área BIBLIOTECA — lo GUARDADO por una entidad (Adenda 64)
// ------------------------------------------------------------------
// Distinta de la Librería (catálogo en línea, arriba): aquí se elige la
// entidad (Mi biblioteca + páginas/grupos donde soy dueño/miembro) y se
// muestra su EntityLibraryPanel (carpetas + guardados propios).
// SOP: architecture/libreria-biblioteca-sync.md (§5)
// ══════════════════════════════════════════════════════════════════

/** Icono por tipo de entidad de biblioteca (coherente con entity-kinds.ts). */
function destinationIcon(kind: LibraryDestination["ref"]["kind"]) {
  switch (kind) {
    case "user":
      return Lock;
    case "group":
      return Users;
    case "page":
      return Globe;
    case "community":
      return Sprout;
    case "event":
      return CalendarDays;
    case "ef":
      return Landmark;
    case "party":
      return Store;
    default:
      return BookMarked;
  }
}

function EntityLibraryArea() {
  const { destinations, loading } = useMyLibraryDestinations();
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let alive = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (alive) {
          setHasSession(!!data.user);
          setAuthChecked(true);
        }
      })
      .catch(() => {
        if (alive) setAuthChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedKey && destinations.length > 0) {
      setSelectedKey(`${destinations[0].ref.kind}:${destinations[0].ref.id}`);
    }
  }, [destinations, selectedKey]);

  const selected = useMemo(
    () => destinations.find((d) => `${d.ref.kind}:${d.ref.id}` === selectedKey) ?? destinations[0] ?? null,
    [destinations, selectedKey],
  );

  if (authChecked && !hasSession) {
    return (
      <GlassCard className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <BookMarked className="h-10 w-10 text-muted-foreground opacity-30" />
        <h2 className="text-lg font-bold">Tu Biblioteca te espera</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Inicia sesión para ver y organizar lo que has guardado — personal o de tus
          comunidades, grupos y páginas.
        </p>
        <Button asChild className="mt-2 gap-2 cursor-pointer">
          <Link href="/login">
            <Lock className="h-4 w-4" /> Iniciar sesión
          </Link>
        </Button>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de entidad: Mi biblioteca + entidades donde soy dueño/miembro */}
      <GlassCard className="flex flex-wrap items-center gap-2 p-3">
        <span className="flex items-center gap-1.5 pl-1 pr-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <BookMarked className="h-3.5 w-3.5" /> Biblioteca de
        </span>
        {loading ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando tus bibliotecas…
          </span>
        ) : destinations.length === 0 ? (
          <span className="text-xs text-muted-foreground">Sin bibliotecas disponibles todavía.</span>
        ) : (
          destinations.map((d) => {
            const Icon = destinationIcon(d.ref.kind);
            const key = `${d.ref.kind}:${d.ref.id}`;
            const active = key === selectedKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {d.label}
                {d.hint && <span className="opacity-60">· {d.hint}</span>}
              </button>
            );
          })
        )}
      </GlassCard>

      <EntityLibraryPanel
        ref={selected ? selected.ref : null}
        title={selected ? `Biblioteca · ${selected.label}` : "Biblioteca"}
        subtitle="Tus referencias guardadas, organizadas en carpetas propias. Se guardan enlaces (Entidad Única), no copias."
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Página unificada
// ══════════════════════════════════════════════════════════════════

// Mapea `?view=` (compat) y `?tab=` a las pestañas nuevas SIN romper enlaces:
//   · valores nuevos (destacado|categorias|repos|instalado) → nivel superior.
//   · store|tienda → Destacado (la tienda vuelve, ahora instala de verdad).
//   · valores antiguos (explorar|personal|fuentes|updates) → dentro de
//     «Mi colección», que conserva la Biblioteca anterior intacta.
function resolveInitialTab(
  view: string | null,
  tab: string | null,
): { top: LibraryTab; inner: CollectionTab } {
  const t = (tab ?? "").toLowerCase();
  // Instalación oficial: acepta varios alias de enlace hacia la nueva sección.
  if (t === "instalar-starseed" || t === "instalar" || t === "install") {
    return { top: "instalar-starseed", inner: "explorar" };
  }
  if (t === "destacado" || t === "categorias" || t === "repos" || t === "instalado" || t === "comunidad") {
    return { top: t as LibraryTab, inner: "explorar" };
  }
  if (t === "store" || t === "tienda") return { top: "destacado", inner: "explorar" };
  if (t === "coleccion" || t === "colección") return { top: "coleccion", inner: "explorar" };
  if (t === "explorar" || t === "personal" || t === "fuentes" || t === "updates") {
    return { top: "coleccion", inner: t as CollectionTab };
  }
  const v = (view ?? "").toLowerCase();
  if (v === "personal") return { top: "coleccion", inner: "personal" };
  if (v === "fuentes" || v === "sources") return { top: "coleccion", inner: "fuentes" };
  if (v === "updates" || v === "actualizaciones") return { top: "coleccion", inner: "updates" };
  return { top: "destacado", inner: "explorar" };
}

/** Área de nivel superior de /library: catálogo en línea vs. lo guardado por una entidad. */
type LibraryArea = "libreria" | "biblioteca";

function resolveInitialArea(area: string | null): LibraryArea {
  return (area ?? "").toLowerCase() === "biblioteca" ? "biblioteca" : "libreria";
}

function LibraryContent() {
  const searchParams = useSearchParams();
  const initial = resolveInitialTab(searchParams.get("view"), searchParams.get("tab"));
  const [area, setArea] = useState<LibraryArea>(() => resolveInitialArea(searchParams.get("area")));
  const [tab, setTab] = useState<LibraryTab>(initial.top);
  const [collectionTab, setCollectionTab] = useState<CollectionTab>(initial.inner);
  // Buscador grande del hero: filtra los paquetes instalables en vivo.
  const [storeQuery, setStoreQuery] = useState("");

  // Ficha detallada (App Store / Play Store) — modal.
  const [detailItem, setDetailItem] = useState<LibraryDetailItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = (item: LibraryDetailItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  };

  // Reacciona a cambios de query (?view / ?tab / ?area) sin recargar.
  useEffect(() => {
    const next = resolveInitialTab(searchParams.get("view"), searchParams.get("tab"));
    setTab(next.top);
    setCollectionTab(next.inner);
    setArea(resolveInitialArea(searchParams.get("area")));
  }, [searchParams]);

  // Navegación interna de la colección (usada por los paneles conservados).
  const goExplore = () => { setTab("coleccion"); setCollectionTab("explorar"); };
  const goFuentes = () => { setTab("coleccion"); setCollectionTab("fuentes"); };
  const goPersonal = () => { setTab("coleccion"); setCollectionTab("personal"); };

  return (
    <div className="flex flex-col gap-[clamp(1.5rem,3vw,2.5rem)] min-h-screen pb-24 px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] w-full mx-auto">
      {/* ── HERO de la tienda viva: gradiente cristal + buscador grande ── */}
      <GlassCard className="relative overflow-hidden border-white/10 p-[clamp(1.25rem,3vw,2.5rem)]">
        {/* Auroras de fondo (decorativas, sin interacción) */}
        <div className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute right-0 -bottom-32 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 items-center md:items-start text-center md:text-left">
          <h1 className="text-[clamp(2rem,4vw,3rem)] font-bold font-headline leading-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-400">
            Biblioteca · instala cualquier cosa en tu OS
          </h1>
          <p className="text-[clamp(0.9rem,1.2vw,1.1rem)] text-muted-foreground max-w-3xl text-balance">
            La tienda viva de StarSeed: fuentes de IA, temas, animaciones, apps, widgets, pizarras,
            investigaciones, funciones y repos de la comunidad — todo open source y gratis-primero.
            Lo que ves instalable actúa de verdad sobre tu sistema; lo que aún no existe se marca
            honesto como «próximamente».
          </p>

          {/* Buscador grande de paquetes (filtra en vivo por nombre/tags/tipo) */}
          <div className="relative w-full max-w-2xl group">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Buscar paquetes: IA, temas, widgets, pizarras, skills…"
              value={storeQuery}
              onChange={(e) => setStoreQuery(e.target.value)}
              className="h-12 rounded-2xl border-white/10 bg-black/30 pl-12 pr-10 text-base focus-visible:ring-indigo-500/50"
            />
            {storeQuery && (
              <button
                onClick={() => setStoreQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* ── Conmutador superior: Librería (catálogo en línea) | Biblioteca (lo guardado) ──
          Dos áreas claramente separadas dentro de la MISMA sección /library.
          SOP: architecture/libreria-biblioteca-sync.md */}
      <div className="flex w-full justify-center sm:justify-start">
        <div className="inline-flex gap-1 rounded-2xl border border-white/10 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => setArea("libreria")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors cursor-pointer",
              area === "libreria" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white",
            )}
          >
            <Store className="h-4 w-4" /> Librería
          </button>
          <button
            type="button"
            onClick={() => setArea("biblioteca")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors cursor-pointer",
              area === "biblioteca" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white",
            )}
          >
            <BookMarked className="h-4 w-4" /> Biblioteca
          </button>
        </div>
      </div>

      {/* ── Área BIBLIOTECA: lo guardado por una entidad (usuario/página/grupo…) ── */}
      {area === "biblioteca" && <EntityLibraryArea />}

      {/* ── Área LIBRERÍA: el catálogo en línea de siempre, intacto ── */}
      {area === "libreria" && (
      <>
      {/* Descarga del OS — SIEMPRE arriba (build real, PWA, código y ficha) */}
      <OsDownloadStrip onOpenDetail={openDetail} />

      {/* Resultados del buscador: sustituyen a las pestañas mientras se escribe */}
      {storeQuery.trim() && <PackageStore section="destacado" query={storeQuery} />}

      {/* Pestañas de la tienda (ocultas mientras hay búsqueda activa) */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as LibraryTab)}
        className={cn("w-full", storeQuery.trim() && "hidden")}
      >
        <TabsList className="flex flex-wrap h-auto gap-1 bg-black/30 border border-white/10 p-1 rounded-2xl">
          <TabsTrigger
            value="instalar-starseed"
            className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-200 cursor-pointer"
          >
            <Rocket className="w-4 h-4" /> Instalar StarSeed
          </TabsTrigger>
          <TabsTrigger value="destacado" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
            <Store className="w-4 h-4" /> Destacado
          </TabsTrigger>
          <TabsTrigger value="categorias" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
            <Shapes className="w-4 h-4" /> Categorías
          </TabsTrigger>
          <TabsTrigger value="repos" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
            <GitBranch className="w-4 h-4" /> Repos
          </TabsTrigger>
          <TabsTrigger value="comunidad" className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-200 cursor-pointer">
            <Users className="w-4 h-4" /> Comunidad
          </TabsTrigger>
          <TabsTrigger value="coleccion" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
            <BookMarked className="w-4 h-4" /> Mi colección
          </TabsTrigger>
          <TabsTrigger value="instalado" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
            <PackageCheck className="w-4 h-4" /> Instalado
          </TabsTrigger>
        </TabsList>

        {/* ── INSTALACIÓN OFICIAL: OS + compañero de Aurora + modelos locales ── */}
        <TabsContent value="instalar-starseed" className="mt-6">
          <InstallOfficialSection />
        </TabsContent>

        {/* ── TIENDA: Destacado · Categorías · Repos · Instalado ── */}
        {(["destacado", "categorias", "repos", "instalado"] as StoreSection[]).map((section) => (
          <TabsContent key={section} value={section} className="mt-6">
            <PackageStore section={section} />
          </TabsContent>
        ))}

        {/* ── COMUNIDAD: catálogo público (library_public_items) — Adenda 64 §7 ── */}
        <TabsContent value="comunidad" className="mt-6">
          <PublicCatalogSection />
        </TabsContent>

        {/* ── MI COLECCIÓN: la Biblioteca de siempre, intacta ── */}
        <TabsContent value="coleccion" className="mt-6">
          <Tabs value={collectionTab} onValueChange={(v) => setCollectionTab(v as CollectionTab)} className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-black/30 border border-white/10 p-1 rounded-2xl">
              <TabsTrigger value="explorar" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
                <Compass className="w-4 h-4" /> Explorar
              </TabsTrigger>
              <TabsTrigger value="personal" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
                <Lock className="w-4 h-4" /> Mi Biblioteca
              </TabsTrigger>
              <TabsTrigger value="fuentes" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
                <BookMarked className="w-4 h-4" /> Fuentes
              </TabsTrigger>
              <TabsTrigger value="updates" className="gap-1.5 data-[state=active]:bg-white/10 cursor-pointer">
                <RefreshCw className="w-4 h-4" /> Actualizaciones
              </TabsTrigger>
            </TabsList>

            {/* EXPLORAR — catálogo unificado + intercambio + conocimiento */}
            <TabsContent value="explorar" className="mt-6 flex flex-col gap-[clamp(1.5rem,3vw,2.5rem)]">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="w-4 h-4 text-indigo-300" />
            Librería Global — apps, recursos y conocimiento compartidos por toda la red StarSeed.
          </div>

          {/* Jerarquía: buscador → chips de categorías → destacados → grid */}
          <LibraryCatalog onOpenDetail={openDetail} onGoFuentes={goFuentes} onGoPersonal={goPersonal} />

          {/* Intercambio de recursos de la comunidad (publicar/instalar/valorar) */}
          <LibraryStorePanel onOpenDetail={openDetail} />

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
          <SavedResourcesPanel onGoExplore={goExplore} />
          <InstalledServicesPanel />
          <FileSystemExplorer mode="PERSONAL" />
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
        </TabsContent>
      </Tabs>
      </>
      )}

      {/* Ficha detallada tipo App Store / Play Store (visible en ambas áreas) */}
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
