"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
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
  Share2
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

type LibraryMode = 'PUBLIC' | 'PRIVATE';
type ViewMode = 'GRID' | 'LIST';
type SortOption = 'NAME' | 'DATE' | 'SIZE' | 'RELEVANCE';
type AssetType = 'FILE' | 'FOLDER' | 'PROGRAM' | 'PAGE' | 'CONCEPT';

interface AssetItem {
  id: string;
  name: string;
  type: AssetType;
  subType?: string; // e.g. 'VIDEO', 'PDF'
  size?: string;
  modified: string;
  preview?: string;
  visibility: LibraryMode;
  aiTags: string[];
}

// --- Mock Data ---

const mockAssets: AssetItem[] = [
  // Public Assets
  { id: "p1", name: "StarSeed Core v1.0", type: "PROGRAM", subType: "SYSTEM", size: "2.4 GB", modified: "2024-03-20", visibility: "PUBLIC", aiTags: ["kernel", "os"] },
  { id: "p2", name: "Manifiesto Ontocrático", type: "PAGE", subType: "DOC", size: "12 KB", modified: "2024-03-15", visibility: "PUBLIC", aiTags: ["philosophy", "governance"] },
  { id: "p3", name: "Shaders Cuánticos", type: "FOLDER", size: "15 items", modified: "2024-03-18", visibility: "PUBLIC", aiTags: ["graphics", "3d"] },

  // Private Assets
  { id: "pr1", name: "Mi Diario Neural", type: "CONCEPT", subType: "THOUGHT", size: "Unknown", modified: "Just now", visibility: "PRIVATE", aiTags: ["personal", "reflection"] },
  { id: "pr2", name: "Proyecto Génesis", type: "FOLDER", size: "3 items", modified: "2024-03-19", visibility: "PRIVATE", aiTags: ["work", "top-secret"] },
  { id: "pr3", name: "Backup Consciencia", type: "FILE", subType: "ARCHIVE", size: "450 TB", modified: "2024-03-01", visibility: "PRIVATE", aiTags: ["backup", "identity"] },
];

export default function LibraryPage() {
  // State
  const [mode, setMode] = useState<LibraryMode>('PUBLIC');
  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTypeFilter, setActiveTypeFilter] = useState<AssetType | 'ALL'>('ALL');
  const [currentPath, setCurrentPath] = useState(["Root"]);

  // Derived State
  const filteredAssets = mockAssets.filter(asset => {
    const matchesMode = asset.visibility === mode;
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = activeTypeFilter === 'ALL' || asset.type === activeTypeFilter;
    return matchesMode && matchesSearch && matchesType;
  });

  // Helpers
  const getIconForType = (item: AssetItem) => {
    switch (item.type) {
      case 'FOLDER': return <Folder className="w-10 h-10 text-amber-200/80" />;
      case 'PROGRAM': return <Cpu className="w-10 h-10 text-emerald-400/80" />;
      case 'CONCEPT': return <Lightbulb className="w-10 h-10 text-purple-400/80" />;
      case 'PAGE': return <Book className="w-10 h-10 text-blue-300/80" />;
      default: return <FileIcon className="w-10 h-10 text-cyan-200/80" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 min-h-screen pb-20 p-4 md:p-8 max-w-[1600px] mx-auto">

      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl font-bold font-headline text-primary bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
            Librería Universal
          </h1>
          <p className="text-muted-foreground text-sm max-w-md">
            Gestiona tus recursos digitales, programas y conceptos en el nexo unificado.
          </p>
        </div>

        {/* Zone Switcher */}
        <div className="bg-black/40 p-1 rounded-full border border-white/10 flex items-center">
          <button
            onClick={() => setMode('PUBLIC')}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-300",
              mode === 'PUBLIC'
                ? "bg-indigo-500/20 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-500/30"
                : "text-muted-foreground hover:text-white"
            )}
          >
            <Globe className="w-4 h-4" /> Red Pública
          </button>
          <button
            onClick={() => setMode('PRIVATE')}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-300",
              mode === 'PRIVATE'
                ? "bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-emerald-500/30"
                : "text-muted-foreground hover:text-white"
            )}
          >
            <Lock className="w-4 h-4" /> Bóveda Privada
          </button>
        </div>
      </div>

      {/* Control OS Bar */}
      <div className="flex flex-col gap-4 bg-background/20 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl">

        {/* Top: Path & Search */}
        <div className="flex flex-col md:flex-row justify-between gap-4">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground overflow-x-auto">
            <HardDrive className="w-4 h-4 text-primary" />
            {currentPath.map((folder, index) => (
              <div key={folder} className="flex items-center gap-1 whitespace-nowrap">
                {index > 0 && <ChevronRight className="w-3 h-3 opacity-50" />}
                <span className={cn("hover:text-white cursor-pointer transition-colors", index === currentPath.length - 1 && "text-white font-bold")}>
                  {folder}
                </span>
              </div>
            ))}
          </div>

          {/* AI Search */}
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder={mode === 'PUBLIC' ? "Explorar la red global..." : "Buscar en mi bóveda..."}
              className="pl-10 bg-black/20 border-white/5 focus-visible:ring-indigo-500/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="h-px bg-white/5 w-full" />

        {/* Bottom: Filters & Tools */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">

          {/* Type Filters */}
          <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg border border-white/5 overflow-x-auto w-full md:w-auto text-xs">
            {(['ALL', 'FOLDER', 'PROGRAM', 'CONCEPT', 'PAGE', 'FILE'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setActiveTypeFilter(type)} // Simplified for this example
                className={cn(
                  "px-3 py-1.5 rounded-md font-medium transition-all capitalize",
                  activeTypeFilter === type
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}
              >
                {type.toLowerCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">

            {/* View Settings */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="hover:bg-white/10"><Settings2 className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-black/90 border-white/10 backdrop-blur-xl">
                <DropdownMenuLabel>Ajustes de Vista</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem>Densidad: Cómoda</DropdownMenuItem>
                <DropdownMenuItem>Estilo: Holográfico</DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem>Ordenar Inteligente (IA)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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

            {mode === 'PRIVATE' && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 ml-2">
                <Upload className="w-3 h-3" /> Subir
              </Button>
            )}
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
              className="group cursor-pointer p-0 aspect-[1/1] flex flex-col border-white/5 bg-gradient-to-br from-white/5 to-transparent hover:border-primary/50 transition-all duration-300"
            >
              {/* Asset Icon Area */}
              <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                <div className="group-hover:scale-110 transition-transform duration-500 p-6 rounded-full bg-white/5 group-hover:bg-white/10">
                  {getIconForType(asset)}
                </div>

                {/* Action Overlay */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full bg-black/50 hover:bg-white hover:text-black"><MoreVertical className="w-3 h-3" /></Button>
                </div>
              </div>

              {/* Metadata Footer */}
              <div className="p-3 bg-black/20 border-t border-white/5 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate text-gray-200 group-hover:text-primary transition-colors">{asset.name}</p>
                    <p className="text-[10px] text-muted-foreground flex gap-2">
                      <span>{asset.type}</span>
                      {asset.size && <span>• {asset.size}</span>}
                    </p>
                  </div>
                </div>
                {/* Tags */}
                {asset.aiTags.length > 0 && (
                  <div className="flex gap-1 mt-2 overflow-hidden">
                    {asset.aiTags.map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </GlassCard>
          ))}

          {/* Empty State */}
          {filteredAssets.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center p-20 text-muted-foreground border border-dashed border-white/10 rounded-3xl">
              <p>No se encontraron items en este sector.</p>
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
                <th className="px-6 py-3">Contexto (IA)</th>
                <th className="px-6 py-3">Modificado</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredAssets.map((asset) => (
                <tr key={asset.id} className="group hover:bg-white/5 transition-colors cursor-pointer">
                  <td className="px-6 py-4 font-medium flex items-center gap-3">
                    {getIconForType(asset)}
                    <span className="group-hover:text-primary transition-colors">{asset.name}</span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs"><Badge variant="outline" className="border-white/10">{asset.type}</Badge></td>
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
