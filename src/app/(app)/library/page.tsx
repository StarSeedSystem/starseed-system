"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
  ArrowUpDown,
  Calendar,
  HardDrive,
  Globe,
  Lock,
  Cpu,
  Book,
  Lightbulb,
  Settings2,
  Share2,
  Plus,
  ArrowLeft
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

// --- Types ---

type LibraryMode = 'GLOBAL' | 'PERSONAL';
type ViewMode = 'GRID' | 'LIST';
type AssetType = 'FILE' | 'FOLDER' | 'LIBRARY' | 'PROGRAM' | 'PAGE' | 'CONCEPT';

interface AssetItem {
  id: string;
  parentId: string | null; // null for root
  name: string;
  type: AssetType;
  subType?: string; // e.g. 'VIDEO', 'PDF'
  size?: string;
  modified: string;
  preview?: string;
  mode: LibraryMode; // Belongs to Global or Personal
  aiTags: string[];
  author?: string; // For Global items
}

// --- Mock Data ---

const mockAssets: AssetItem[] = [
  // --- GLOBAL LIBRARY (ROOT) ---
  { id: "lib1", parentId: null, name: "Ciencia & Tecnología", type: "LIBRARY", size: "128 TB", modified: "2024-03-20", mode: "GLOBAL", aiTags: ["science", "tech"] },
  { id: "lib2", parentId: null, name: "Artes & Cultura", type: "LIBRARY", size: "450 TB", modified: "2024-03-18", mode: "GLOBAL", aiTags: ["art", "culture"] },
  { id: "lib3", parentId: null, name: "Gobernanza & Leyes", type: "LIBRARY", size: "12 TB", modified: "2024-03-15", mode: "GLOBAL", aiTags: ["governance", "law"] },

  // Inside "Ciencia & Tecnología"
  { id: "g_c_1", parentId: "lib1", name: "StarSeed Core v1.0", type: "PROGRAM", subType: "SYSTEM", size: "2.4 GB", modified: "2024-03-20", mode: "GLOBAL", aiTags: ["kernel", "os"], author: "Core Team" },
  { id: "g_c_2", parentId: "lib1", name: "Shaders Cuánticos", type: "FOLDER", size: "15 items", modified: "2024-03-18", mode: "GLOBAL", aiTags: ["graphics", "3d"], author: "NeoGraphics" },

  // Inside "Shaders Cuánticos"
  { id: "g_c_2_1", parentId: "g_c_2", name: "LiquidMetal.shdr", type: "FILE", subType: "SHADER", size: "24 MB", modified: "2024-03-18", mode: "GLOBAL", aiTags: ["metal", "fluid"], author: "NeoGraphics" },

  // --- PERSONAL LIBRARY (ROOT) ---
  { id: "p_1", parentId: null, name: "Mis Documentos", type: "FOLDER", size: "12 items", modified: "2024-03-19", mode: "PERSONAL", aiTags: ["work", "docs"] },
  { id: "p_2", parentId: null, name: "Proyecto Génesis", type: "FOLDER", size: "3 items", modified: "2024-03-19", mode: "PERSONAL", aiTags: ["top-secret"] },
  { id: "p_3", parentId: null, name: "Mi Diario Neural", type: "CONCEPT", subType: "THOUGHT", size: "12 KB", modified: "Just now", mode: "PERSONAL", aiTags: ["personal", "reflection"] },
  { id: "p_4", parentId: null, name: "Backup Consciencia", type: "FILE", subType: "ARCHIVE", size: "450 TB", modified: "2024-03-01", mode: "PERSONAL", aiTags: ["backup", "identity"] },

  // Inside "Mis Documentos"
  { id: "p_1_1", parentId: "p_1", name: "Borrador Constitución.pdf", type: "FILE", subType: "PDF", size: "4 MB", modified: "2024-02-28", mode: "PERSONAL", aiTags: ["draft", "law"] },
];

interface BreadcrumbItem {
  id: string | null;
  name: string;
}



import { Suspense } from "react";

// ... existing imports

function LibraryContent() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('view') === 'personal' ? 'PERSONAL' : 'GLOBAL';

  // State
  const [mode, setMode] = useState<LibraryMode>(initialMode);
  // ... rest of state

  // Update mode if URL changes
  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'personal') setMode('PERSONAL');
    else if (view === 'global') setMode('GLOBAL');
  }, [searchParams]);
  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: "Inicio" }]);

  // Filter Logic
  const filteredAssets = mockAssets.filter(asset => {
    const matchesMode = asset.mode === mode;
    const matchesFolder = asset.parentId === currentFolderId;
    const matchesSearch = searchQuery
      ? asset.name.toLowerCase().includes(searchQuery.toLowerCase())
      : matchesFolder;

    if (searchQuery) return matchesMode && matchesSearch;
    return matchesMode && matchesFolder;
  });

  // Navigation Logic
  const handleFolderClick = (folder: AssetItem) => {
    if (folder.type === 'FOLDER' || folder.type === 'LIBRARY') {
      setCurrentFolderId(folder.id);
      setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
      setSearchQuery(""); // Clear search on nav
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

  // Helpers
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

  return (
    <div className="flex flex-col gap-6 min-h-screen pb-20 p-4 md:p-8 max-w-[1600px] mx-auto">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl font-bold font-headline text-primary bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
            {mode === 'GLOBAL' ? "Librería Global" : "Mi Biblioteca"}
          </h1>
          <p className="text-muted-foreground text-sm max-w-md">
            {mode === 'GLOBAL'
              ? "Accede al conocimiento y recursos compartidos por toda la red StarSeed."
              : "Tu espacio personal seguro para archivos, ideas y proyectos."}
          </p>
        </div>

        {/* Zone Switcher */}
        <div className="bg-black/40 p-1 rounded-full border border-white/10 flex items-center">
          <button
            onClick={() => handleModeSwitch('GLOBAL')}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-300",
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
              "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-300",
              mode === 'PERSONAL'
                ? "bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-emerald-500/30"
                : "text-muted-foreground hover:text-white"
            )}
          >
            <Lock className="w-4 h-4" /> Mi Biblioteca
          </button>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col gap-4 bg-background/20 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl">

        {/* Top: Path & Search */}
        <div className="flex flex-col md:flex-row justify-between gap-4">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground overflow-x-auto">
            <HardDrive className="w-4 h-4 text-primary" />
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
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-lg shadow-indigo-500/20">
                <Upload className="w-4 h-4" /> Subir a la Red
              </Button>
            ) : (
              <>
                <Button className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 shadow-lg shadow-emerald-500/20">
                  <Plus className="w-4 h-4" /> Nuevo
                </Button>
                <Button variant="outline" className="border-white/10 hover:bg-white/5 gap-2">
                  <Folder className="w-4 h-4" /> Nueva Carpeta
                </Button>
              </>
            )}
          </div>

          {/* Right View Options */}
          <div className="flex items-center gap-3">
            {/* Back Button (only if deep) */}
            {breadcrumbs.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => handleBreadcrumbClick(breadcrumbs.length - 2)} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Atrás
              </Button>
            )}

            <div className="w-px h-4 bg-white/10" />

            {/* View Toggle */}
            <div className="flex bg-black/20 rounded-lg p-1 border border-white/5">
              <button onClick={() => setViewMode('GRID')} className={cn("p-1.5 rounded transition-all", viewMode === 'GRID' ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('LIST')} className={cn("p-1.5 rounded transition-all", viewMode === 'LIST' ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}>
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      {viewMode === 'GRID' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
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

                {/* Action Overlay */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full bg-black/50 hover:bg-white hover:text-black">
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
                {/* Tags */}
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

          {/* Empty State */}
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
                  <td className="px-6 py-4 text-muted-foreground text-xs"><Badge variant="outline" className="border-white/10">{asset.type}</Badge></td>
                  {mode === 'GLOBAL' && <td className="px-6 py-4 text-muted-foreground text-xs">{asset.author || 'Sistema'}</td>}
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {asset.aiTags.join(", ")}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{asset.modified}</td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
