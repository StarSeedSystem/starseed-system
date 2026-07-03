"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Panel "Documentos y Diseño" (AppFlowy + Penpot)
// ----------------------------------------------------------------------------
// Conectores app-embed para dos servicios open-source:
//   • AppFlowy (docs/notas — alternativa a Notion)
//   • Penpot   (diseño/prototipado — alternativa a Figma)
//
// Modelo honesto: NO instalamos nada. Guardamos la URL de la instancia (self-host
// o nube) y ofrecemos:
//   1) EMBEBER la instancia (iframe defensivo con sandbox), o
//   2) ABRIR en pestaña / navegador interno de la red.
//   3) "GUARDAR diseño/documento" = registrar el enlace del recurso en la
//      Biblioteca del usuario (saveResource de library-store) → aparece en
//      Mi Biblioteca como Entidad Única.
//
// La URL de la instancia se toma, por defecto, de la CONEXIÓN OSS de la función
// correspondiente (resolveServiceFor('docs') / ('design')); el usuario puede
// sobrescribirla localmente aquí. Persistencia: `starseed.integrations.designdocs.v1`.
//
// Todo SSR-safe y defensivo. El iframe va con sandbox restrictivo; algunas
// instancias bloquean el empotrado (X-Frame-Options): se avisa y se ofrece abrir.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FileText,
  Palette,
  ExternalLink,
  BookmarkPlus,
  Save,
  Maximize2,
  Minimize2,
  Link as LinkIcon,
  RefreshCw,
} from "lucide-react";
import { resolveServiceFor } from "@/lib/services/oss-connections";
import { saveResource } from "@/lib/library-store";

// ── Persistencia local (sobrescribe/complementa la conexión OSS) ─────────────

const CFG_KEY = "starseed.integrations.designdocs.v1";

interface DesignDocsCfg {
  appflowyUrl: string;
  penpotUrl: string;
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadCfg(): Partial<DesignDocsCfg> {
  if (!isClient()) return {};
  try {
    const raw = window.localStorage.getItem(CFG_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return {
      appflowyUrl: typeof p?.appflowyUrl === "string" ? p.appflowyUrl : undefined,
      penpotUrl: typeof p?.penpotUrl === "string" ? p.penpotUrl : undefined,
    };
  } catch {
    return {};
  }
}

function saveCfg(cfg: DesignDocsCfg): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* noop */
  }
}

/** Valida y normaliza una URL http(s); devuelve "" si no es válida. */
function normUrl(v: string): string {
  const s = (v || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

// ── Sub-componente de un conector app-embed genérico ─────────────────────────

interface EmbedConnectorProps {
  kind: "docs" | "design";
  serviceName: string;
  accent: string; // color hex del acento
  Icon: React.ComponentType<{ className?: string }>;
  url: string;
  onUrlChange: (v: string) => void;
  placeholder: string;
  /** Etiqueta del botón "guardar en biblioteca". */
  saveLabel: string;
  /** kind con el que se guarda el recurso en la Biblioteca. */
  resourceKind: string;
  hint: string;
}

function EmbedConnector({
  kind,
  serviceName,
  accent,
  Icon,
  url,
  onUrlChange,
  placeholder,
  saveLabel,
  resourceKind,
  hint,
}: EmbedConnectorProps) {
  const [embedded, setEmbedded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const validUrl = normUrl(url);

  const open = useCallback(() => {
    if (!validUrl) {
      toast.error(`Configura la URL de ${serviceName} (http:// o https://).`);
      return;
    }
    try {
      window.open(validUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("No se pudo abrir la instancia.");
    }
  }, [validUrl, serviceName]);

  // Guarda la instancia en la Biblioteca como acceso.
  const saveInstance = useCallback(() => {
    if (!validUrl) {
      toast.error(`Configura primero la URL de ${serviceName}.`);
      return;
    }
    saveResource({
      kind: resourceKind,
      title: `${serviceName} · instancia`,
      url: validUrl,
      origin: serviceName,
    });
    toast.success(`Instancia de ${serviceName} guardada en Mi Biblioteca.`);
  }, [validUrl, serviceName, resourceKind]);

  // Guarda un enlace concreto de diseño/documento en la Biblioteca.
  const saveLink = useCallback(() => {
    const u = normUrl(linkUrl);
    if (!u) {
      toast.error("Pega un enlace válido del diseño/documento (http:// o https://).");
      return;
    }
    saveResource({
      kind: resourceKind,
      title: linkTitle.trim() || `${serviceName} · ${kind === "design" ? "diseño" : "documento"}`,
      url: u,
      origin: serviceName,
    });
    toast.success(`${saveLabel} — guardado en Mi Biblioteca.`);
    setLinkTitle("");
    setLinkUrl("");
  }, [linkUrl, linkTitle, serviceName, kind, resourceKind, saveLabel]);

  return (
    <div className="space-y-3">
      {/* Config de la URL de instancia */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-white/5 shrink-0" style={{ color: accent }}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: accent }}>
                {serviceName}
              </span>
              {validUrl ? (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[9px] px-1">
                  Conectado
                </Badge>
              ) : (
                <Badge variant="outline" className="border-white/10 text-muted-foreground text-[9px] px-1">
                  Sin URL
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">{hint}</p>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">URL de la instancia</Label>
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder={placeholder}
              className="h-7 text-[11px] font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] shrink-0"
              onClick={saveInstance}
              disabled={!validUrl}
              title="Guardar la instancia en Mi Biblioteca"
            >
              <BookmarkPlus className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => setEmbedded((v) => !v)}
            disabled={!validUrl}
          >
            {embedded ? (
              <>
                <Minimize2 className="w-3 h-3 mr-1" />
                Ocultar empotrado
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3 mr-1" />
                Empotrar aquí
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={open}
            disabled={!validUrl}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Abrir en pestaña
          </Button>
          {validUrl && (
            <a
              href={`/navegador?url=${encodeURIComponent(validUrl)}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 hover:bg-white/5 text-[10px] text-muted-foreground"
              title="Abrir en el navegador interno de la red"
            >
              <LinkIcon className="w-3 h-3" />
              Navegador interno
            </a>
          )}
        </div>
      </div>

      {/* Empotrado (iframe defensivo con sandbox) */}
      {embedded && validUrl && (
        <div
          className={cn(
            "rounded-xl border border-white/10 overflow-hidden bg-black/30 relative",
            expanded ? "h-[70vh]" : "h-[420px]",
          )}
        >
          <div className="absolute top-1 right-1 z-10">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1 rounded-md bg-black/40 border border-white/10 hover:bg-black/60 text-white/80"
              title={expanded ? "Reducir" : "Ampliar"}
            >
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
          <iframe
            src={validUrl}
            title={`${serviceName} embed`}
            className="w-full h-full border-0"
            // Sandbox restrictivo pero funcional para una app web colaborativa.
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <p className="absolute bottom-0 inset-x-0 text-[9px] text-white/50 bg-black/40 px-2 py-0.5">
            Si {serviceName} no carga aquí, su servidor puede bloquear el empotrado
            (X-Frame-Options). Usa “Abrir en pestaña”.
          </p>
        </div>
      )}

      {/* Guardar un enlace concreto de diseño/documento en la Biblioteca */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
        <h5 className="text-[11px] font-semibold text-foreground/80 flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />
          {saveLabel}
        </h5>
        <div className="grid sm:grid-cols-[1fr,auto] gap-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <Input
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              placeholder="Título (opcional)"
              className="h-7 text-[11px]"
            />
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder={`Enlace del ${kind === "design" ? "diseño" : "documento"}`}
              className="h-7 text-[11px] font-mono"
            />
          </div>
          <Button size="sm" className="h-7 text-[10px]" onClick={saveLink}>
            <BookmarkPlus className="w-3 h-3 mr-1" />
            Guardar
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground/70">
          El enlace se registra como Entidad Única en Mi Biblioteca; se referencia, no se
          duplica.
        </p>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export function DesignDocsPanel() {
  // URL efectiva por defecto: la conexión OSS de cada función.
  const resolvedDocs = useMemo(() => {
    try {
      return resolveServiceFor("docs");
    } catch {
      return null;
    }
  }, []);
  const resolvedDesign = useMemo(() => {
    try {
      return resolveServiceFor("design");
    } catch {
      return null;
    }
  }, []);

  const [appflowyUrl, setAppflowyUrl] = useState("");
  const [penpotUrl, setPenpotUrl] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Hidratación: config local > conexión OSS (endpoint/instanceUrl) > default.
  useEffect(() => {
    const cfg = loadCfg();
    const docEndpoint =
      resolvedDocs?.connection?.extra?.instanceUrl ||
      resolvedDocs?.connection?.endpoint ||
      resolvedDocs?.endpoint ||
      "";
    const designEndpoint =
      resolvedDesign?.connection?.extra?.instanceUrl ||
      resolvedDesign?.connection?.endpoint ||
      resolvedDesign?.endpoint ||
      "";
    setAppflowyUrl(cfg.appflowyUrl ?? docEndpoint ?? "");
    setPenpotUrl(cfg.penpotUrl ?? designEndpoint ?? "");
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistir cambios de URL localmente.
  useEffect(() => {
    if (!hydrated) return;
    saveCfg({ appflowyUrl, penpotUrl });
  }, [appflowyUrl, penpotUrl, hydrated]);

  return (
    <Card className="liquid-glass-panel border-white/10">
      <CardContent className="p-4 space-y-4">
        {/* Cabecera */}
        <div className="flex items-start gap-2">
          <div className="p-2 rounded-lg bg-fuchsia-500/10 text-fuchsia-300 shrink-0">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Documentos y Diseño
            </h3>
            <p className="text-[11px] text-muted-foreground max-w-xl">
              Conecta tu espacio de <strong>AppFlowy</strong> (docs/notas) y tu instancia de{" "}
              <strong>Penpot</strong> (diseño). Empótralos aquí o ábrelos; guarda diseños y
              documentos en tu Biblioteca como Entidades Únicas.
            </p>
          </div>
        </div>

        <Tabs defaultValue="appflowy" className="w-full">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="appflowy" className="text-xs">
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              AppFlowy · Docs
            </TabsTrigger>
            <TabsTrigger value="penpot" className="text-xs">
              <Palette className="w-3.5 h-3.5 mr-1.5" />
              Penpot · Diseño
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appflowy" className="pt-3">
            <EmbedConnector
              kind="docs"
              serviceName="AppFlowy"
              accent="#00BCF0"
              Icon={FileText}
              url={appflowyUrl}
              onUrlChange={setAppflowyUrl}
              placeholder="https://mi-appflowy.ejemplo"
              saveLabel="Guardar documento en la Biblioteca"
              resourceKind="appflowy-doc"
              hint="Alternativa abierta a Notion. Auto-hospeda AppFlowy Cloud o usa la app y enlaza su URL."
            />
          </TabsContent>

          <TabsContent value="penpot" className="pt-3">
            <EmbedConnector
              kind="design"
              serviceName="Penpot"
              accent="#FF6F61"
              Icon={Palette}
              url={penpotUrl}
              onUrlChange={setPenpotUrl}
              placeholder="https://design.penpot.app"
              saveLabel="Guardar diseño en la Biblioteca"
              resourceKind="penpot-design"
              hint="Diseño y prototipado open source (SVG). Usa la nube de Penpot o auto-hospéjalo."
            />
          </TabsContent>
        </Tabs>

        {/* Pie honesto */}
        <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 pt-1 border-t border-white/5">
          <RefreshCw className="w-3 h-3 shrink-0" />
          Ambos son open source y se auto-hospedan. StarSeed guarda la URL de tu instancia y
          referencia tus diseños/documentos; no aloja tu contenido.
        </p>
      </CardContent>
    </Card>
  );
}

export default DesignDocsPanel;
