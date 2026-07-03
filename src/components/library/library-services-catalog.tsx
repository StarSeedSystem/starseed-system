"use client";

// ════════════════════════════════════════════════════════════════
// LibraryServicesCatalog — Servicios / Integraciones (Conectores)
// ----------------------------------------------------------------
// Sección de la Librería que lista los SERVICIOS open-source del
// catálogo unificado (`oss-services.ts`) como INSTALABLES/integrables,
// agrupados por función (IA · Voz · Imagen · Vídeo · Workflows ·
// Calendarios · Documentos · Diseño · Web).
//
// Cada servicio es una ficha:
//   • Estado: Conectado (el usuario tiene conexión) · Predeterminado
//     (preintegrado por StarSeed) · Disponible.
//   • "Instalar / Conectar" → arranque rápido: crea una conexión por
//     defecto + lo guarda en Mi Biblioteca (installService del puente).
//   • "Configurar" → abre el panel completo /servicios embebido en un
//     diálogo (endpoint/clave/webhook, varias conexiones, por defecto).
//   • Enlace al repositorio (código abierto).
//   • "Ver ficha" → AppFilePage (ficha rica del servicio).
//
// Aditivo, SSR-safe (usa useOssConnections, hidrata en cliente),
// defensivo. Crystal Liquid Glass · responsive · español.
// ════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Boxes,
  Plug,
  Settings2,
  Github,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Brain,
  Mic2,
  Image as ImageIcon,
  Clapperboard,
  Workflow,
  CalendarDays,
  FileText,
  PenTool,
  Globe2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useOssConnections } from "@/lib/services/oss-connections";
import type { OssServiceCategory } from "@/lib/services/oss-services";
import { OssServicesPanel } from "@/components/services/oss-services-panel";
import type { LibraryDetailItem } from "@/components/library/app-file-page";
import {
  listOssLibraryGroups,
  installService,
  OSS_LIBRARY_CATEGORY_LABEL,
  type OssLibraryItem,
  type OssInstallStatus,
} from "@/lib/library/oss-catalog-bridge";

// ── Iconografía por función ──────────────────────────────────────

const FUNCTION_ICON: Record<OssServiceCategory, LucideIcon> = {
  llm: Brain,
  stt: Mic2,
  tts: Mic2,
  image: ImageIcon,
  video: Clapperboard,
  workflow: Workflow,
  calendar: CalendarDays,
  docs: FileText,
  design: PenTool,
  website: Globe2,
};

// ── Estado (badge) ───────────────────────────────────────────────

const STATUS_META: Record<
  OssInstallStatus,
  { label: string; className: string }
> = {
  connected: {
    label: "Conectado",
    className: "border-emerald-400/40 text-emerald-300 bg-emerald-500/10",
  },
  default: {
    label: "Predeterminado",
    className: "border-sky-400/40 text-sky-300 bg-sky-500/10",
  },
  available: {
    label: "Disponible",
    className: "border-white/15 text-muted-foreground bg-white/5",
  },
};

function StatusBadge({ status }: { status: OssInstallStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("gap-1 text-[10px]", meta.className)}>
      {status === "connected" && <CheckCircle2 className="h-3 w-3" />}
      {status === "default" && <Sparkles className="h-3 w-3" />}
      {meta.label}
    </Badge>
  );
}

// ── Tarjeta de un servicio ───────────────────────────────────────

function ServiceCard({
  item,
  onOpenDetail,
  onInstall,
  onConfigure,
}: {
  item: OssLibraryItem;
  onOpenDetail: (d: LibraryDetailItem) => void;
  onInstall: (item: OssLibraryItem) => void;
  onConfigure: (item: OssLibraryItem) => void;
}) {
  const Icon = FUNCTION_ICON[item.serviceCategory] ?? Boxes;
  const connected = item.installStatus === "connected";

  return (
    <GlassCard
      variant="hover"
      className="flex h-full flex-col gap-3 border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="shrink-0 rounded-xl border border-white/10 bg-black/30 p-2.5 text-indigo-300">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpenDetail(item)}
            className="block text-left text-sm font-bold text-white hover:text-primary transition-colors cursor-pointer truncate w-full"
            title="Ver ficha del servicio"
          >
            {item.title}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={item.installStatus} />
            <span className="text-[10px] text-muted-foreground">{item.functionLabel}</span>
            {item.connectionCount > 0 && (
              <span className="text-[10px] text-emerald-300/80">
                · {item.connectionCount} conexión{item.connectionCount === 1 ? "" : "es"}
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
        {item.description?.split("\n")[0]}
      </p>

      {item.runsInBrowser && (
        <p className="text-[10px] text-cyan-300/80">Corre en el navegador · sin servidor.</p>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => onInstall(item)}
          className={cn(
            "h-8 gap-1.5 text-xs font-semibold text-white cursor-pointer",
            connected
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-indigo-600 hover:bg-indigo-500",
          )}
          title={connected ? "Ya conectado · guardar en Mi Biblioteca" : "Conectar con valores por defecto"}
        >
          {connected ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
            </>
          ) : (
            <>
              <Plug className="h-3.5 w-3.5" /> Instalar / Conectar
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onConfigure(item)}
          className="h-8 gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer"
          title="Configurar endpoint, clave o webhook"
        >
          <Settings2 className="h-3.5 w-3.5" /> Configurar
        </Button>
        {item.sourceUrl && (
          <Button
            size="sm"
            variant="ghost"
            asChild
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-white cursor-pointer"
          >
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" title="Repositorio de código abierto">
              <Github className="h-3.5 w-3.5" /> Repo
            </a>
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

// ── Componente principal ─────────────────────────────────────────

export interface LibraryServicesCatalogProps {
  /** Abre la ficha rica (AppFilePage) del servicio. */
  onOpenDetail: (item: LibraryDetailItem) => void;
  /** Texto de búsqueda del catálogo (para filtrar servicios). */
  query?: string;
}

/**
 * Sección "Servicios / Integraciones" de la Librería. Se apoya en
 * `useOssConnections()` para reflejar el estado en vivo (instalado /
 * predeterminado) y en el puente `oss-catalog-bridge` para proyectar y
 * "instalar" servicios.
 */
export function LibraryServicesCatalog({ onOpenDetail, query }: LibraryServicesCatalogProps) {
  const { connections } = useOssConnections();
  const [configService, setConfigService] = useState<OssLibraryItem | null>(null);

  const q = (query ?? "").trim().toLowerCase();

  // Grupos por función, resueltos con las conexiones vivas.
  const groups = useMemo(() => {
    const all = listOssLibraryGroups(connections);
    if (!q) return all;
    // Filtrado defensivo por nombre / propósito / etiquetas / función.
    return all
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => {
          const hay = [
            it.title,
            it.description ?? "",
            it.functionLabel,
            (it.tags ?? []).join(" "),
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [connections, q]);

  const totalItems = useMemo(
    () => groups.reduce((n, g) => n + g.items.length, 0),
    [groups],
  );

  const handleInstall = (item: OssLibraryItem) => {
    const res = installService(item.serviceId);
    if (res.ok) {
      toast.success(
        item.installStatus === "connected" ? "Añadido a Mi Biblioteca" : "Servicio conectado",
        {
          description: res.message,
          action:
            item.installStatus === "connected"
              ? undefined
              : { label: "Configurar", onClick: () => setConfigService(item) },
        },
      );
    } else {
      toast.error("No se pudo conectar", { description: res.message });
    }
  };

  const handleConfigure = (item: OssLibraryItem) => {
    setConfigService(item);
  };

  return (
    <section className="flex flex-col gap-4 w-full min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-2 text-indigo-300">
          <Boxes className="h-4 w-4" />
        </div>
        <h3 className="text-base font-bold text-white">{OSS_LIBRARY_CATEGORY_LABEL}</h3>
        <Badge variant="outline" className="border-indigo-400/30 text-indigo-300 text-[10px]">
          Conectores OSS
        </Badge>
        {totalItems > 0 && (
          <span className="text-xs text-muted-foreground bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
            {totalItems} servicio{totalItems === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
        Servicios de código abierto preintegrados por StarSeed. Una web no instala servidores: los
        <span className="text-white/85"> conecta</span> por endpoint, clave o webhook. Instálalos con
        valores por defecto y ajusta la conexión cuando quieras (o abre la
        {" "}
        <a href="/servicios" className="text-indigo-300 hover:underline cursor-pointer">página de Servicios</a>).
      </p>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-muted-foreground">
          <Boxes className="h-10 w-10 opacity-25" />
          <p className="text-sm">Sin servicios para tu búsqueda.</p>
        </div>
      ) : (
        groups.map((group) => {
          const Icon = FUNCTION_ICON[group.category] ?? Boxes;
          return (
            <div key={group.category} className="flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-indigo-300/90" />
                <h4 className="text-sm font-bold text-white/90">{group.label}</h4>
                {group.blurb && (
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">· {group.blurb}</span>
                )}
              </div>
              <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3">
                {group.items.map((item) => (
                  <ServiceCard
                    key={item.serviceId}
                    item={item}
                    onOpenDetail={onOpenDetail}
                    onInstall={handleInstall}
                    onConfigure={handleConfigure}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Diálogo de configuración: panel completo de /servicios embebido */}
      <Dialog open={configService !== null} onOpenChange={(o) => !o && setConfigService(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-indigo-300" />
              Configurar servicios e integraciones
            </DialogTitle>
            <DialogDescription>
              {configService
                ? `Conecta y ajusta «${configService.title}» (endpoint, clave o webhook). También puedes gestionar el resto de servicios aquí.`
                : "Conecta y ajusta tus servicios open-source."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              variant="outline"
              asChild
              className="gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer"
            >
              <a href="/servicios">
                Abrir en Servicios <ChevronRight className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
          <OssServicesPanel scope="user" />
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default LibraryServicesCatalog;
