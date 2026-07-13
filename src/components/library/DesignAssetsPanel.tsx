"use client";

/* ============================================================
   STARSEED · DESIGN ASSETS PANEL (Librería Global · Diseños)
   Folders/acordeón con tarjetas de assets de diseño que abren el
   AssetPreviewModal ("app-store"). Incluye:
   - Folder "Mis diseños subidos" persistida en localStorage.
   - Botón "Subir diseño" → abre el modal en modo edición (asset nuevo).
   Estilo reutilizado de StarSeedKnowledgePanel: GlassCard, oro #E9C46A,
   Fraunces (font-headline), lucide, responsive. Sin dependencias nuevas.
   ============================================================ */

import { useEffect, useState } from "react";
import {
  DESIGN_ASSET_FOLDERS,
  USER_ASSETS_STORAGE_KEY,
  emptyDesignAsset,
  type DesignAsset,
  type DesignAssetFolder,
  type AssetKind,
} from "@/data/design-assets";
import { AssetPreviewModal } from "@/components/library/AssetPreviewModal";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Folder,
  ChevronDown,
  Palette,
  Layers,
  Wand2,
  Puzzle,
  Code2,
  Globe,
  Star,
  Upload,
  GitBranch,
  Download,
  UserCircle2,
} from "lucide-react";

const GOLD = "#E9C46A";

function iconForKind(kind: AssetKind) {
  switch (kind) {
    case "theme":
      return <Palette className="w-6 h-6" style={{ color: GOLD }} />;
    case "tokens":
      return <Layers className="w-6 h-6 text-cyan-300/90" />;
    case "background":
      return <Wand2 className="w-6 h-6 text-purple-300/90" />;
    case "component":
      return <Puzzle className="w-6 h-6 text-emerald-300/90" />;
    case "snippet":
      return <Code2 className="w-6 h-6 text-amber-200/90" />;
    case "external":
      return <Globe className="w-6 h-6 text-sky-300/90" />;
    default:
      return <Puzzle className="w-6 h-6" style={{ color: GOLD }} />;
  }
}

function avg(asset: DesignAsset) {
  if (!asset.reviews.length) return 0;
  return asset.reviews.reduce((s, r) => s + r.stars, 0) / asset.reviews.length;
}

function AssetCard({
  asset,
  onOpen,
}: {
  asset: DesignAsset;
  onOpen: (a: DesignAsset) => void;
}) {
  const cover = asset.media?.images?.[0];
  const rating = avg(asset);
  return (
    <GlassCard
      variant="hover"
      intensity="low"
      className="group flex flex-col gap-0 p-0 overflow-hidden border-white/5 cursor-pointer"
      onClick={() => onOpen(asset)}
    >
      {/* Portada */}
      <div className="relative aspect-[16/9] w-full bg-black/30 overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={asset.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {iconForKind(asset.kind)}
          </div>
        )}
        <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white/90 flex items-center gap-1">
          {iconForKind(asset.kind)}
        </span>
        <span
          className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm font-semibold"
          style={{ color: GOLD }}
        >
          {asset.license}
        </span>
      </div>

      {/* Cuerpo */}
      <div className="flex flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100 truncate">
            {asset.name}
          </p>
          <p className="text-[11px] text-muted-foreground line-clamp-2">
            {asset.description}
          </p>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-auto">
          <span className="inline-flex items-center gap-1">
            <UserCircle2 className="w-3.5 h-3.5" /> {asset.author || "—"}
          </span>
          <span className="inline-flex items-center gap-2">
            {rating > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Star className="w-3.5 h-3.5 fill-current text-amber-300" />
                {rating.toFixed(1)}
              </span>
            )}
            {asset.branches.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <GitBranch className="w-3.5 h-3.5" />
                {asset.branches.length}
              </span>
            )}
            {typeof asset.downloads === "number" && asset.downloads > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Download className="w-3.5 h-3.5" />
                {asset.downloads >= 1000
                  ? `${(asset.downloads / 1000).toFixed(1)}k`
                  : asset.downloads}
              </span>
            )}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}

export function DesignAssetsPanel() {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    themes: true,
  });
  const [userAssets, setUserAssets] = useState<DesignAsset[]>([]);
  const [selected, setSelected] = useState<DesignAsset | null>(null);
  const [editingNew, setEditingNew] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Cargar assets del usuario desde localStorage.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(USER_ASSETS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setUserAssets(parsed as DesignAsset[]);
      }
    } catch {
      /* localStorage puede no estar disponible */
    }
    setHydrated(true);
  }, []);

  const persist = (next: DesignAsset[]) => {
    setUserAssets(next);
    try {
      window.localStorage.setItem(USER_ASSETS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignoramos errores de cuota/privacidad */
    }
  };

  const toggle = (id: string) =>
    setOpenFolders((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleSave = (next: DesignAsset) => {
    const exists = userAssets.some((a) => a.id === next.id);
    const updated = exists
      ? userAssets.map((a) => (a.id === next.id ? next : a))
      : [...userAssets, { ...next, userCreated: true }];
    persist(updated);
    setSelected(next);
    setEditingNew(false);
  };

  const handleDelete = (id: string) => {
    persist(userAssets.filter((a) => a.id !== id));
  };

  const handleUploadNew = () => {
    setSelected(emptyDesignAsset());
    setEditingNew(true);
  };

  // Folder dinámico con los diseños del usuario.
  const userFolder: DesignAssetFolder = {
    id: "user",
    title: "Mis diseños subidos",
    desc: "Recursos que has subido (guardados en este navegador). Editables y compartibles como ramas.",
    assets: userAssets,
  };

  const folders: DesignAssetFolder[] = [
    ...DESIGN_ASSET_FOLDERS,
    ...(hydrated && userAssets.length > 0 ? [userFolder] : []),
  ];

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-xl"
            style={{ background: "rgba(233,196,106,0.12)" }}
          >
            <Palette className="w-5 h-5" style={{ color: GOLD }} />
          </div>
          <div>
            <h2
              className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold font-headline"
              style={{ color: GOLD }}
            >
              Diseños · Código abierto
            </h2>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Temas, tokens y fondos del propio OS como recursos integrables y
              adaptables, más enlaces a fondos creativos gratuitos. Cada uno con
              su ficha tipo tienda: fotos, reseñas, versiones y ramas de la
              comunidad. Todo libre y open-source.
            </p>
          </div>
        </div>
        <Button
          className="gap-2 font-semibold cursor-pointer shrink-0"
          style={{ background: GOLD, color: "#1a1206" }}
          onClick={handleUploadNew}
        >
          <Upload className="w-4 h-4" /> Subir diseño
        </Button>
      </div>

      {/* Acordeón */}
      <div className="flex flex-col gap-3">
        {folders.map((folder) => {
          const isOpen = !!openFolders[folder.id];
          return (
            <div
              key={folder.id}
              className="rounded-2xl border border-white/10 bg-background/20 backdrop-blur-xl overflow-hidden"
            >
              <button
                onClick={() => toggle(folder.id)}
                className="flex items-center justify-between w-full gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors cursor-pointer"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Folder className="w-5 h-5 shrink-0" style={{ color: GOLD }} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-100 truncate">
                      {folder.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {folder.desc}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    {folder.assets.length} elementos
                  </span>
                  <ChevronDown
                    className={cn(
                      "w-5 h-5 text-muted-foreground transition-transform duration-300",
                      isOpen && "rotate-180"
                    )}
                  />
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-white/5">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3 mt-3">
                    {folder.assets.map((asset) => (
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        onOpen={(a) => {
                          setSelected(a);
                          setEditingNew(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <AssetPreviewModal
          asset={selected}
          startInEdit={editingNew}
          onClose={() => {
            setSelected(null);
            setEditingNew(false);
          }}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
