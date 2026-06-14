"use client";

import { useState } from "react";
import {
  KNOWLEDGE_FOLDERS,
  type KnowledgeItem,
  type KnowledgeKind,
} from "@/data/starseed-knowledge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import {
  FileText,
  FileType2,
  Folder,
  Globe,
  ExternalLink,
  Eye,
  ChevronDown,
  X,
  Sparkles,
  Image as ImageIcon,
  AlertTriangle,
} from "lucide-react";

const GOLD = "#E9C46A";

function iconForKind(kind: KnowledgeKind) {
  switch (kind) {
    case "doc":
      return <FileText className="w-7 h-7" style={{ color: GOLD }} />;
    case "pdf":
      return <FileType2 className="w-7 h-7 text-rose-300/90" />;
    case "folder":
      return <Folder className="w-7 h-7 text-amber-200/90" />;
    case "web":
      return <Globe className="w-7 h-7 text-cyan-300/90" />;
    case "asset":
      return <ImageIcon className="w-7 h-7 text-purple-300/90" />;
    default:
      return <FileText className="w-7 h-7" style={{ color: GOLD }} />;
  }
}

/* -------- Visor embebido (modal) -------- */
function EmbeddedViewer({
  item,
  onClose,
}: {
  item: KnowledgeItem;
  onClose: () => void;
}) {
  // Para webs externas avisamos del posible bloqueo por X-Frame-Options.
  const [iframeError, setIframeError] = useState(false);
  const showWarning = item.embedRisk || iframeError;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-[clamp(0.5rem,2vw,2rem)] bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex flex-col w-full max-w-6xl h-[88vh] rounded-2xl overflow-hidden border shadow-2xl bg-[#0b0d14]/95"
        style={{ borderColor: "rgba(233,196,106,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3 min-w-0">
            {iconForKind(item.kind)}
            <div className="min-w-0">
              <p className="text-sm font-bold truncate text-white font-headline">
                {item.title}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {item.desc}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="border-white/15 hover:bg-white/10 gap-1.5 text-xs cursor-pointer"
              onClick={() => window.open(item.url, "_blank", "noopener")}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Externo
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
              aria-label="Cerrar visor"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Aviso para sitios que podrían bloquear el iframe */}
        {showWarning && (
          <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 text-xs">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Este destino puede impedir su visualización embebida. Si no se
              carga, usa el botón{" "}
              <button
                onClick={() => window.open(item.url, "_blank", "noopener")}
                className="underline font-semibold hover:text-white cursor-pointer"
              >
                Abrir externo
              </button>
              .
            </span>
          </div>
        )}

        {/* Iframe */}
        <div className="flex-1 relative bg-black/30">
          {item.embedUrl ? (
            <iframe
              src={item.embedUrl}
              title={item.title}
              className="absolute inset-0 w-full h-full border-0"
              allow="autoplay; fullscreen"
              referrerPolicy="no-referrer-when-downgrade"
              onError={() => setIframeError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground p-8 text-center">
              <Globe className="w-10 h-10 opacity-40" />
              <p>Este recurso solo está disponible como enlace externo.</p>
              <Button
                className="gap-2 cursor-pointer"
                style={{ background: GOLD, color: "#1a1206" }}
                onClick={() => window.open(item.url, "_blank", "noopener")}
              >
                <ExternalLink className="w-4 h-4" /> Abrir en pestaña nueva
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------- Tarjeta de item -------- */
function ItemCard({
  item,
  onOpen,
}: {
  item: KnowledgeItem;
  onOpen: (item: KnowledgeItem) => void;
}) {
  return (
    <GlassCard
      variant="hover"
      intensity="low"
      className="flex flex-col gap-3 p-4 border-white/5"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="p-2.5 rounded-xl bg-white/5 shrink-0">
          {iconForKind(item.kind)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100 truncate">
            {item.title}
          </p>
          <p className="text-[11px] text-muted-foreground line-clamp-2">
            {item.desc}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-auto">
        <Button
          size="sm"
          className="flex-1 gap-1.5 text-xs font-semibold cursor-pointer"
          style={{ background: GOLD, color: "#1a1206" }}
          onClick={() => onOpen(item)}
        >
          <Eye className="w-3.5 h-3.5" /> Abrir aquí
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs border-white/15 hover:bg-white/10 cursor-pointer"
          onClick={() => window.open(item.url, "_blank", "noopener")}
        >
          <ExternalLink className="w-3.5 h-3.5" /> Externo
        </Button>
      </div>
    </GlassCard>
  );
}

/* -------- Panel principal (acordeón de carpetas) -------- */
export function StarSeedKnowledgePanel() {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    constituciones: true,
  });
  const [viewer, setViewer] = useState<KnowledgeItem | null>(null);

  const toggle = (id: string) =>
    setOpenFolders((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Cabecera de la sección */}
      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-xl"
          style={{ background: "rgba(233,196,106,0.12)" }}
        >
          <Sparkles className="w-5 h-5" style={{ color: GOLD }} />
        </div>
        <div>
          <h2
            className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold font-headline"
            style={{ color: GOLD }}
          >
            StarSeed · Nexus &amp; Drive
          </h2>
          <p className="text-xs text-muted-foreground">
            Carpetas con todo StarSeed: documentos del Nexus y de Google Drive,
            con visor embebido y enlace externo.
          </p>
        </div>
      </div>

      {/* Acordeón de carpetas */}
      <div className="flex flex-col gap-3">
        {KNOWLEDGE_FOLDERS.map((folder) => {
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
                  <Folder
                    className="w-5 h-5 shrink-0"
                    style={{ color: GOLD }}
                  />
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
                    {folder.items.length} elementos
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
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3 mt-3">
                    {folder.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onOpen={setViewer}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewer && (
        <EmbeddedViewer item={viewer} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}
