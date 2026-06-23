"use client";

// src/components/canvas/canvas-board.tsx
// StarSeed · Pizarra — Lienzo universal. Tablero con bloques arrastrables y
// redimensionables que conectan archivos, baúles, memorias, apps, enlaces,
// widgets y ventanas del navegador. Persiste en `canvases.blocks` (guardado
// con debounce). Publica como post (inmediato) o vía propuesta democrática.
// SSR-safe: nada de window en el cuerpo del módulo.
//
// AMPLIADO (centros de trabajo): pan/zoom infinito sobre una superficie
// transformada; conexiones (aristas) entre bloques persistidas en
// `canvases.edges`; modos de vista libre / mapa-mental / cerebro; metadatos de
// grupo en cada bloque (`block.group`); y un botón VR/AR (modo inmersivo
// experimental con WebXR, honesto si no está soportado). Todo es ADITIVO:
// se preservan añadir/arrastrar/persistir/publicar.
//
// INTERCONEXIÓN (puente): la pizarra escucha el bus `@/lib/share/bridge`:
//   · onAttach({kind:'window',url}) → añade un bloque `browser` con esa URL.
//   · onOpenComposer(initial)       → hospeda un Dialog con <PublicationComposer/>.
// Además, «Publicar lienzo» abre el compositor universal prerellenado (tipo
// `lienzo`, formato `snapshot`) en un Dialog, y el botón VR/AR monta el lienzo
// inmersivo REAL <XRView/> (WebXR) en un overlay.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import PublicationComposer from "@/components/publish/publication-composer";
import { onAttach, onOpenComposer, type ComposerInitial } from "@/lib/share/bridge";
import XRView from "@/components/canvas/xr-view";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus,
  Save,
  Trash2,
  Share2,
  Send,
  Vote,
  Pencil,
  X,
  Type,
  FileText,
  Archive,
  Brain,
  AppWindow,
  Link2,
  LayoutGrid,
  Globe,
  Image as ImageIcon,
  GripVertical,
  Layers,
  ChevronDown,
  Upload,
  Spline,
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Glasses,
  Move,
} from "lucide-react";
import {
  BLOCK_KINDS,
  blockKindDef,
  defaultBlock,
  summarizeCanvas,
  listCanvases,
  getCanvas,
  saveCanvas,
  deleteCanvas,
  newCanvas,
  publishCanvasAsPost,
  attachTo,
  listVaults,
  listMemories,
  type Canvas,
  type CanvasBlock,
  type BlockKind,
  type VaultRef,
  type MemoryRef,
} from "@/lib/canvas/canvas";
import {
  getEdges,
  addEdge as addEdgeToCanvas,
  removeEdge as removeEdgeFromCanvas,
  pruneEdges,
  saveCanvasWithEdges,
  VIEW_MODES,
  VIEW_MODE_LABELS,
  type CanvasEdge,
  type ViewMode,
} from "@/lib/canvas/workcenters";
import { buildProposalLink } from "@/lib/governance/links";

// Mapa de iconos lucide por nombre (declarado en el catálogo del lib).
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Type,
  FileText,
  Archive,
  Brain,
  AppWindow,
  Link2,
  LayoutGrid,
  Globe,
  Image: ImageIcon,
};

function KindIcon({ kind, className }: { kind: BlockKind; className?: string }) {
  const name = blockKindDef(kind)?.icon ?? "LayoutGrid";
  const Cmp = ICONS[name] ?? LayoutGrid;
  return <Cmp className={className} />;
}

// Metadatos de grupo/carpeta de un bloque (campo opcional `group`). Se modela
// de forma aditiva aquí para no tocar el tipo base CanvasBlock del lib.
type GroupedBlock = CanvasBlock & { group?: string };
function blockGroup(b: CanvasBlock): string | undefined {
  return (b as GroupedBlock).group;
}

// Iconos por modo de vista.
const VIEW_ICONS: Record<ViewMode, React.ComponentType<{ className?: string }>> = {
  libre: LayoutGrid,
  "mapa-mental": Network,
  cerebro: Brain,
};

// Límites de zoom.
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;

export default function CanvasBoard({ canvasId }: { canvasId?: string } = {}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<Canvas>(() => newCanvas("Lienzo sin título"));
  const [list, setList] = useState<Canvas[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // bloque en edición
  const [showAdd, setShowAdd] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // ---- pan/zoom + vista + conexiones (estado de la ampliación) ------------
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("libre");
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);

  // ---- interconexión (puente) + inmersivo + publicar lienzo ---------------
  const [showXR, setShowXR] = useState(false); // overlay WebXR (lienzo inmersivo)
  const [publishCanvasOpen, setPublishCanvasOpen] = useState(false); // Dialog «Publicar lienzo»
  const [composerInitial, setComposerInitial] = useState<ComposerInitial | null>(null); // Dialog del compositor (peticiones externas)

  // Datos de referencia (cargados perezosamente para selectores).
  const [vaults, setVaults] = useState<VaultRef[]>([]);
  const [memories, setMemories] = useState<MemoryRef[]>([]);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragState = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);
  // Estado del paneo (arrastrar el vacío del lienzo).
  const panState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  // Espejo del zoom para que los handlers de puntero (que no recrean closures)
  // lean siempre el valor actual sin re-suscribirse.
  const zoomRef = useRef(1);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // ---- carga inicial -------------------------------------------------------
  const refreshList = useCallback(async () => {
    const cs = await listCanvases();
    setList(cs);
    return cs;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (!alive) return;
        setUserId(data?.user?.id ?? null);
      } catch {
        /* */
      }
      const cs = await refreshList();
      if (!alive) return;
      if (canvasId) {
        const found = await getCanvas(canvasId);
        if (alive && found) {
          setCanvas(found);
          return;
        }
      }
      if (alive && cs.length) setCanvas(cs[0]);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId]);

  // Al cambiar de lienzo, reseteamos vista/conexión y saneamos aristas.
  useEffect(() => {
    setConnectMode(false);
    setConnectFrom(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.id]);

  // Carga perezosa de baúles/memorias la primera vez que se necesitan.
  const ensureRefData = useCallback(async () => {
    if (!vaults.length) listVaults().then(setVaults).catch(() => {});
    if (!memories.length) listMemories().then(setMemories).catch(() => {});
  }, [vaults.length, memories.length]);

  // ---- guardado con debounce ----------------------------------------------
  // Persistimos también la columna `edges` (degrada con elegancia si no existe).
  const scheduleSave = useCallback((next: Canvas) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!next.title) return;
      const persisted = await saveCanvasWithEdges(next);
      if (persisted) {
        setCanvas((cur) => (cur.id === persisted.id || !cur.id ? { ...cur, id: persisted.id, updated_at: persisted.updated_at } : cur));
        setSavedAt(new Date().toLocaleTimeString());
        refreshList();
      }
    }, 900);
  }, [refreshList]);

  // Aplica una mutación al lienzo y agenda el guardado.
  const mutate = useCallback((fn: (c: Canvas) => Canvas) => {
    setCanvas((cur) => {
      const next = fn(cur);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ---- bloques -------------------------------------------------------------
  function addBlock(kind: BlockKind) {
    setShowAdd(false);
    if (kind === "vault" || kind === "memory") ensureRefData();
    mutate((c) => ({ ...c, blocks: [...c.blocks, defaultBlock(kind, c.blocks.length)] }));
  }

  // Añade un bloque `browser` con una URL ya conocida (usado por adjuntos del
  // puente: una ventana del navegador llega y se materializa en la pizarra).
  const addBrowserBlockWithUrl = useCallback(
    (url: string, title?: string) => {
      if (!url) return;
      mutate((c) => {
        const base = defaultBlock("browser", c.blocks.length);
        const blk: CanvasBlock = {
          ...base,
          title: title || base.title,
          data: { url },
        };
        return { ...c, blocks: [...c.blocks, blk] };
      });
    },
    [mutate],
  );

  function removeBlock(id: string) {
    // Al borrar un bloque, eliminamos también sus aristas.
    mutate((c) => pruneEdges({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
    if (editingId === id) setEditingId(null);
    if (connectFrom === id) setConnectFrom(null);
  }

  function updateBlock(id: string, patch: Partial<CanvasBlock>) {
    mutate((c) => ({
      ...c,
      blocks: c.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }

  function updateBlockData(id: string, dataPatch: Record<string, any>) {
    mutate((c) => ({
      ...c,
      blocks: c.blocks.map((b) => (b.id === id ? { ...b, data: { ...b.data, ...dataPatch } } : b)),
    }));
  }

  // Asigna/limpia el grupo (carpeta) de un bloque.
  function setBlockGroup(id: string) {
    const cur = canvas.blocks.find((b) => b.id === id);
    const next = typeof window !== "undefined" ? window.prompt("Grupo del bloque", (cur ? blockGroup(cur) : "") ?? "") : null;
    if (next === null) return;
    const group = next.trim() || undefined;
    updateBlock(id, { group } as Partial<CanvasBlock>);
  }

  // ---- conexiones (aristas) -----------------------------------------------
  const edges = useMemo(() => getEdges(canvas), [canvas]);

  // Click sobre un bloque en modo conectar: primer click marca origen, segundo
  // crea la arista.
  function onBlockConnectClick(id: string) {
    if (!connectFrom) {
      setConnectFrom(id);
      toast.message("Conectar", { description: "Elige el bloque destino." });
      return;
    }
    if (connectFrom === id) {
      setConnectFrom(null);
      return;
    }
    const from = connectFrom;
    mutate((c) => addEdgeToCanvas(c, from, id));
    setConnectFrom(null);
    toast.success("Bloques conectados");
  }

  function deleteEdge(edgeId: string) {
    mutate((c) => removeEdgeFromCanvas(c, edgeId));
  }

  function toggleConnectMode() {
    setConnectMode((m) => {
      const next = !m;
      if (!next) setConnectFrom(null);
      else toast.message("Modo conectar", { description: "Pulsa dos bloques para unirlos." });
      return next;
    });
  }

  // ---- vista (libre / mapa-mental / cerebro) ------------------------------
  function cycleViewMode() {
    const idx = VIEW_MODES.indexOf(viewMode);
    const next = VIEW_MODES[(idx + 1) % VIEW_MODES.length];
    setViewMode(next);
    if (next === "mapa-mental") applyRadialLayout();
    toast.message(`Vista: ${VIEW_MODE_LABELS[next]}`);
  }

  // Disposición radial automática (mapa mental): el primer bloque al centro y
  // el resto en un anillo. Persiste posiciones.
  function applyRadialLayout() {
    mutate((c) => {
      const bs = c.blocks;
      if (bs.length === 0) return c;
      const cx = 520;
      const cy = 380;
      const ring = bs.slice(1);
      const R = Math.max(220, 90 + ring.length * 26);
      const next = bs.map((b, i) => {
        if (i === 0) return { ...b, x: cx - b.w / 2, y: cy - b.h / 2 };
        const k = i - 1;
        const angle = (k / Math.max(1, ring.length)) * Math.PI * 2;
        return {
          ...b,
          x: cx + Math.cos(angle) * R - b.w / 2,
          y: cy + Math.sin(angle) * R - b.h / 2,
        };
      });
      return { ...c, blocks: next };
    });
  }

  // ---- pan / zoom ----------------------------------------------------------
  function clampZoom(z: number) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  }

  function onWheel(e: React.WheelEvent) {
    // Zoom con rueda (con Ctrl/Cmd o siempre): centrado en el cursor.
    if (!surfaceRef.current) return;
    e.preventDefault();
    const rect = surfaceRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setZoom((z0) => {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const z1 = clampZoom(z0 * factor);
      // Mantener el punto bajo el cursor estable al hacer zoom.
      setPan((p0) => {
        const wx = (px - p0.x) / z0;
        const wy = (py - p0.y) / z0;
        return { x: px - wx * z1, y: py - wy * z1 };
      });
      return z1;
    });
  }

  function zoomBy(factor: number) {
    if (!surfaceRef.current) {
      setZoom((z) => clampZoom(z * factor));
      return;
    }
    const rect = surfaceRef.current.getBoundingClientRect();
    const px = rect.width / 2;
    const py = rect.height / 2;
    setZoom((z0) => {
      const z1 = clampZoom(z0 * factor);
      setPan((p0) => {
        const wx = (px - p0.x) / z0;
        const wy = (py - p0.y) / z0;
        return { x: px - wx * z1, y: py - wy * z1 };
      });
      return z1;
    });
  }

  function resetView() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  // ---- drag & resize (pointer events) -------------------------------------
  function onPointerDownBlock(e: React.PointerEvent, b: CanvasBlock, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = {
      id: b.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: b.x,
      origY: b.y,
      origW: b.w,
      origH: b.h,
    };
  }

  // Paneo: pointer-down sobre el vacío de la superficie.
  function onSurfacePointerDown(e: React.PointerEvent) {
    if (dragState.current) return;
    // Solo si el target es la propia superficie/inner (no un bloque).
    const t = e.target as HTMLElement;
    if (t.closest("[data-block]")) return;
    panState.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const ds = dragState.current;
    if (ds) {
      const z = zoomRef.current || 1;
      const dx = (e.clientX - ds.startX) / z;
      const dy = (e.clientY - ds.startY) / z;
      if (ds.mode === "move") {
        const nx = Math.max(0, ds.origX + dx);
        const ny = Math.max(0, ds.origY + dy);
        setCanvas((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === ds.id ? { ...b, x: nx, y: ny } : b)) }));
      } else {
        const nw = Math.max(160, ds.origW + dx);
        const nh = Math.max(120, ds.origH + dy);
        setCanvas((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === ds.id ? { ...b, w: nw, h: nh } : b)) }));
      }
      return;
    }
    const ps = panState.current;
    if (ps) {
      setPan({ x: ps.origX + (e.clientX - ps.startX), y: ps.origY + (e.clientY - ps.startY) });
    }
  }

  function onPointerUp() {
    if (dragState.current) {
      dragState.current = null;
      // persistimos el estado tras soltar
      setCanvas((cur) => {
        scheduleSave(cur);
        return cur;
      });
    }
    if (panState.current) panState.current = null;
  }

  // ---- toolbar: lienzo -----------------------------------------------------
  async function handleNew() {
    const c = newCanvas("Lienzo sin título");
    const persisted = await saveCanvas(c);
    if (persisted) {
      setCanvas(persisted);
      toast.success("Nuevo lienzo creado");
      refreshList();
    } else {
      setCanvas(c);
      toast.message("Lienzo en memoria", { description: "Inicia sesión para guardarlo." });
    }
  }

  async function handleSaveNow() {
    setSaving(true);
    const persisted = await saveCanvasWithEdges(canvas);
    setSaving(false);
    if (persisted) {
      setCanvas(persisted);
      setSavedAt(new Date().toLocaleTimeString());
      toast.success("Lienzo guardado");
      refreshList();
    } else {
      toast.error("No se pudo guardar (¿sesión iniciada?)");
    }
  }

  function startRename() {
    setTitleDraft(canvas.title);
    setRenaming(true);
  }
  function commitRename() {
    const t = titleDraft.trim() || "Lienzo sin título";
    setRenaming(false);
    mutate((c) => ({ ...c, title: t }));
  }

  async function handleDelete() {
    if (!canvas.id) {
      setCanvas(newCanvas("Lienzo sin título"));
      return;
    }
    const ok = await deleteCanvas(canvas.id);
    if (ok) {
      toast.success("Lienzo eliminado");
      const cs = await refreshList();
      setCanvas(cs[0] ?? newCanvas("Lienzo sin título"));
    } else {
      toast.error("No se pudo eliminar");
    }
  }

  async function switchTo(c: Canvas) {
    setShowSwitcher(false);
    const fresh = (await getCanvas(c.id)) ?? c;
    setCanvas(fresh);
  }

  function toggleShared(v: boolean) {
    mutate((c) => ({ ...c, shared: v }));
    toast.message(v ? "Lienzo compartible activado" : "Compartir desactivado");
  }

  // ---- VR / AR real (lienzo inmersivo, WebXR) -----------------------------
  // Monta <XRView/> en un overlay a pantalla completa. La detección de soporte
  // y el fallback honesto (no soportado) los gestiona el propio XRView.
  function enterImmersive() {
    setShowXR(true);
  }

  // ---- interconexión: recibir adjuntos del puente -------------------------
  // Cuando llega un adjunto de tipo `window` (desde el Navegador), lo
  // materializamos como un bloque `browser` en el lienzo actual.
  useEffect(() => {
    const off = onAttach((payload) => {
      if (payload.kind === "window" && payload.url) {
        addBrowserBlockWithUrl(payload.url, payload.title);
        toast.success("Ventana añadida a la pizarra");
      }
    });
    return off;
  }, [addBrowserBlockWithUrl]);

  // La pizarra también HOSPEDA el compositor: si alguien pide abrirlo (p. ej. el
  // Navegador con «adjuntar a publicación»), montamos el Dialog con su `initial`.
  useEffect(() => {
    const off = onOpenComposer((initial) => {
      setComposerInitial(initial);
    });
    return off;
  }, []);

  // ---- publicar ------------------------------------------------------------
  async function publishNow() {
    const res = await publishCanvasAsPost(canvas, { visibility: "public" });
    if (res.ok) toast.success("Publicado en el lienzo universal");
    else toast.error(res.detail);
  }

  // Abre el compositor universal prerellenado para publicar ESTE lienzo
  // (tipo `lienzo`, formato `snapshot`). Convive con el publicado inmediato.
  function openPublishCanvas() {
    setPublishCanvasOpen(true);
  }

  // `initial` para el compositor al publicar el lienzo. `PublishContent` es
  // estricto (title/body/url/urls/options/meta), así que `canvasId` y el
  // resumen viajan en `title`/`body`/`meta`.
  const canvasComposerInitial: ComposerInitial = useMemo(
    () => ({
      type: "lienzo",
      format: "snapshot",
      content: {
        title: canvas.title,
        body: summarizeCanvas(canvas),
        meta: {
          canvasId: canvas.id,
          title: canvas.title,
          summary: summarizeCanvas(canvas),
        },
      },
    }),
    [canvas],
  );

  function publishDemocratic() {
    // Deep-link a /decisiones con una propuesta `publish` prefilled.
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const summary = summarizeCanvas(canvas);
    const url = buildProposalLink(base, {
      scope: canvas.scope || "account",
      scopeRef: canvas.scope_ref ?? undefined,
      title: `Publicar lienzo: ${canvas.title}`,
      description: `Propuesta para publicar democráticamente el lienzo «${canvas.title}». ${summary}.`,
      command: {
        type: "publish",
        payload: {
          postType: "canvas",
          content: { title: canvas.title, blocks: canvas.blocks, summary },
          visibility: "public",
        },
      },
    });
    if (typeof window !== "undefined") window.location.href = url;
  }

  async function copyAttach() {
    const ref = attachTo(canvas);
    const text = JSON.stringify(ref);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast.success("Referencia copiada para adjuntar");
      } else {
        toast.message("Referencia de adjunto", { description: text });
      }
    } catch {
      toast.message("Referencia de adjunto", { description: text });
    }
  }

  // ---- archivo (bloque file) ----------------------------------------------
  function onPickFile(blockId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    // Subida real requeriría storage; aquí guardamos nombre + objectURL temporal.
    let url = "";
    try {
      url = URL.createObjectURL(f);
    } catch {
      /* */
    }
    updateBlockData(blockId, { fileName: f.name, size: f.size, url });
    e.target.value = "";
  }

  const summary = useMemo(() => summarizeCanvas(canvas), [canvas]);
  const ViewIcon = VIEW_ICONS[viewMode] ?? LayoutGrid;
  const isMemoryView = viewMode === "cerebro";

  // Centros de los bloques (en coordenadas del lienzo) para dibujar aristas.
  const blockCenter = useCallback(
    (id: string) => {
      const b = canvas.blocks.find((x) => x.id === id);
      if (!b) return null;
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    },
    [canvas.blocks],
  );

  // ---- render --------------------------------------------------------------
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-2.5 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-fuchsia-500 to-amber-500 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 text-white" />
          </div>
          {renaming ? (
            <Input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={commitRename}
              className="h-8 w-52 bg-white/5"
            />
          ) : (
            <button onClick={startRename} className="group flex items-center gap-1.5 min-w-0 text-left">
              <span className="text-sm font-semibold text-amber-50 truncate max-w-[12rem]">{canvas.title}</span>
              <Pencil className="w-3.5 h-3.5 text-white/30 group-hover:text-fuchsia-300 shrink-0" />
            </button>
          )}
          <Badge variant="outline" className="text-[9px] border-fuchsia-500/30 text-fuchsia-200/70 shrink-0">
            {canvas.blocks.length} bloque{canvas.blocks.length === 1 ? "" : "s"}
          </Badge>
          {edges.length > 0 && (
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-200/70 shrink-0">
              {edges.length} conexi{edges.length === 1 ? "ón" : "ones"}
            </Badge>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {/* Centros de trabajo (/pizarras) */}
          <Link href="/pizarras">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 border-fuchsia-500/30 text-fuchsia-100">
              <LayoutGrid className="w-3.5 h-3.5" /> Centros
            </Button>
          </Link>

          {/* Switcher de lienzos */}
          <div className="relative">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 border-white/15 text-white/80" onClick={() => { setShowSwitcher((s) => !s); refreshList(); }}>
              <Layers className="w-3.5 h-3.5" /> Mis lienzos <ChevronDown className="w-3 h-3" />
            </Button>
            {showSwitcher && (
              <div className="absolute right-0 top-9 z-30 w-64 rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur p-1 shadow-xl">
                {list.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-white/40">Aún no tienes lienzos guardados.</div>
                ) : (
                  list.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => switchTo(c)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md text-xs hover:bg-white/5 flex items-center gap-2",
                        c.id === canvas.id ? "text-fuchsia-200" : "text-white/70",
                      )}
                    >
                      <Layers className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate flex-1">{c.title}</span>
                      <span className="text-[9px] text-white/30">{c.blocks?.length ?? 0}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Añadir bloque */}
          <div className="relative">
            <Button size="sm" className="gap-1.5 h-8 bg-fuchsia-600 hover:bg-fuchsia-500 text-white" onClick={() => setShowAdd((s) => !s)}>
              <Plus className="w-3.5 h-3.5" /> Añadir bloque
            </Button>
            {showAdd && (
              <div className="absolute right-0 top-9 z-30 w-72 rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur p-1.5 shadow-xl">
                <div className="px-2 py-1 text-[9px] uppercase tracking-widest text-fuchsia-300/50">Conecta cualquier cosa</div>
                {BLOCK_KINDS.map((k) => (
                  <button
                    key={k.kind}
                    onClick={() => addBlock(k.kind)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white/5 flex items-start gap-2"
                  >
                    <KindIcon kind={k.kind} className="w-4 h-4 text-fuchsia-300 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs text-white/90">{k.label}</span>
                      <span className="block text-[10px] text-white/40 truncate">{k.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-white/15 text-white/80" onClick={handleNew}>
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-white/15 text-white/80" onClick={handleSaveNow} disabled={saving}>
            <Save className="w-3.5 h-3.5" /> Guardar
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-red-500/25 text-red-200/80 hover:bg-red-500/10" onClick={handleDelete}>
            <Trash2 className="w-3.5 h-3.5" /> Borrar
          </Button>

          <span className="flex items-center gap-1.5 rounded-md border border-white/10 px-2 h-8">
            <Share2 className="w-3.5 h-3.5 text-amber-300/70" />
            <span className="text-[10px] text-white/60">Compartir</span>
            <Switch checked={canvas.shared} onCheckedChange={toggleShared} />
          </span>

          <Button size="sm" className="gap-1.5 h-8 bg-amber-600 hover:bg-amber-500 text-white" onClick={publishNow}>
            <Send className="w-3.5 h-3.5" /> Publicar
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-amber-500/30 text-amber-100" onClick={openPublishCanvas} title="Publicar el lienzo con el compositor (instantánea)">
            <Send className="w-3.5 h-3.5" /> Publicar lienzo
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-amber-500/30 text-amber-100" onClick={publishDemocratic}>
            <Vote className="w-3.5 h-3.5" /> Publicar (democrático)
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-fuchsia-500/30 text-fuchsia-100" onClick={copyAttach}>
            <Share2 className="w-3.5 h-3.5" /> Adjuntar
          </Button>
        </div>
      </div>

      {/* Barra de vista: modo, conectar, zoom, VR */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-950/40 p-1.5 mb-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8 border-white/15 text-white/80"
          onClick={cycleViewMode}
          title="Cambiar modo de vista"
        >
          <ViewIcon className="w-3.5 h-3.5 text-fuchsia-300" /> {VIEW_MODE_LABELS[viewMode]}
        </Button>
        {viewMode === "mapa-mental" && (
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-white/15 text-white/70" onClick={applyRadialLayout} title="Reorganizar en radial">
            <Network className="w-3.5 h-3.5" /> Reorganizar
          </Button>
        )}

        <Button
          size="sm"
          variant={connectMode ? "default" : "outline"}
          className={cn("gap-1.5 h-8", connectMode ? "bg-amber-600 hover:bg-amber-500 text-white" : "border-white/15 text-white/80")}
          onClick={toggleConnectMode}
          title="Conectar bloques"
        >
          <Spline className="w-3.5 h-3.5" /> {connectMode ? "Conectando…" : "Conectar"}
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-white/15 text-white/70" onClick={() => zoomBy(1 / 1.2)} title="Alejar">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[10px] text-white/50 w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-white/15 text-white/70" onClick={() => zoomBy(1.2)} title="Acercar">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-white/15 text-white/70" onClick={resetView} title="Restablecer vista">
            <Maximize2 className="w-3.5 h-3.5" /> Centrar
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-fuchsia-500/30 text-fuchsia-100" onClick={enterImmersive} title="Lienzo inmersivo (VR/AR · WebXR)">
            <Glasses className="w-3.5 h-3.5" /> VR/AR
          </Button>
        </div>
      </div>

      {/* Sub-cabecera: resumen + estado de guardado */}
      <div className="flex items-center gap-2 px-1 mb-2 text-[11px] text-white/40">
        <span>{summary}</span>
        {savedAt && <span className="text-emerald-300/50">· guardado {savedAt}</span>}
        {!userId && <span className="text-amber-300/60">· inicia sesión para persistir</span>}
        {connectMode && <span className="text-amber-300/70">· {connectFrom ? "elige destino" : "elige origen"}</span>}
      </div>

      {/* Superficie del lienzo (con pan/zoom infinito) */}
      <div
        ref={surfaceRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerDown={onSurfacePointerDown}
        onWheel={onWheel}
        className={cn(
          "relative flex-1 min-h-0 overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:22px_22px]",
          isMemoryView ? "border-fuchsia-500/25 bg-[#0a0612]" : "border-white/10 bg-zinc-950/40",
          panState.current ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {canvas.blocks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
            <Layers className="w-10 h-10 text-fuchsia-400/40 mb-3" />
            <p className="text-sm text-white/50">Lienzo vacío. Pulsa <span className="text-fuchsia-200">Añadir bloque</span> para conectar archivos, baúles, memorias, apps, enlaces, widgets o el navegador.</p>
            <p className="text-[11px] text-white/30 mt-2">Rueda para zoom · arrastra el vacío para mover · «Conectar» para unir bloques.</p>
          </div>
        )}

        {/* Superficie interna transformada (pan + zoom) */}
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {/* Capa de aristas (SVG) por debajo de los bloques */}
          <svg
            className="absolute top-0 left-0 overflow-visible pointer-events-none"
            width={1}
            height={1}
          >
            {edges.map((edge) => {
              const a = blockCenter(edge.from);
              const b = blockCenter(edge.to);
              if (!a || !b) return null;
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              return (
                <g key={edge.id}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={isMemoryView ? "rgba(217,70,239,0.5)" : "rgba(245,158,11,0.55)"}
                    strokeWidth={isMemoryView ? 2 : 1.5}
                    strokeDasharray={isMemoryView ? "4 4" : undefined}
                  />
                  {/* Punto medio: borrar la arista (clickable) */}
                  <g
                    className="pointer-events-auto cursor-pointer"
                    onClick={() => deleteEdge(edge.id)}
                  >
                    <circle cx={mx} cy={my} r={8} fill="rgba(9,9,11,0.9)" stroke="rgba(245,158,11,0.6)" strokeWidth={1} />
                    <path d={`M${mx - 3} ${my - 3} L${mx + 3} ${my + 3} M${mx + 3} ${my - 3} L${mx - 3} ${my + 3}`} stroke="rgba(248,113,113,0.9)" strokeWidth={1.4} />
                  </g>
                </g>
              );
            })}
          </svg>

          {canvas.blocks.map((b) => (
            <BlockCard
              key={b.id}
              block={b}
              editing={editingId === b.id}
              vaults={vaults}
              memories={memories}
              connectMode={connectMode}
              connectActive={connectFrom === b.id}
              memoryView={isMemoryView}
              onConnectClick={() => onBlockConnectClick(b.id)}
              onEditToggle={() => {
                const opening = editingId !== b.id;
                setEditingId(opening ? b.id : null);
                if (opening && (b.kind === "vault" || b.kind === "memory")) ensureRefData();
              }}
              onRemove={() => removeBlock(b.id)}
              onGroup={() => setBlockGroup(b.id)}
              onPointerDownMove={(e) => onPointerDownBlock(e, b, "move")}
              onPointerDownResize={(e) => onPointerDownBlock(e, b, "resize")}
              onData={(patch) => updateBlockData(b.id, patch)}
              onTitle={(t) => updateBlock(b.id, { title: t })}
              onPickFile={(e) => onPickFile(b.id, e)}
            />
          ))}
        </div>
      </div>

      {/* Nota de seguridad de iframes */}
      <p className="px-1 pt-2 text-[10px] text-white/30">
        Los bloques de navegador se incrustan con <code className="text-white/40">sandbox</code>. Algunos sitios bloquean el embebido (X-Frame-Options / CSP).
      </p>

      {/* Overlay del lienzo inmersivo (WebXR real) */}
      {showXR && <XRView blocks={canvas.blocks} onExit={() => setShowXR(false)} />}

      {/* Dialog · Publicar lienzo (compositor universal prerellenado) */}
      <Dialog open={publishCanvasOpen} onOpenChange={setPublishCanvasOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Publicar lienzo</DialogTitle>
            <DialogDescription>
              Publica una instantánea de «{canvas.title}» con el compositor universal.
            </DialogDescription>
          </DialogHeader>
          <PublicationComposer
            initial={canvasComposerInitial as any}
            onPublished={() => {
              setPublishCanvasOpen(false);
              toast.success("Lienzo publicado");
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog · Compositor hospedado para peticiones externas (p. ej. Navegador
          → «adjuntar a publicación»: openComposer del puente). */}
      <Dialog open={!!composerInitial} onOpenChange={(o) => !o && setComposerInitial(null)}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva publicación</DialogTitle>
            <DialogDescription>Compositor universal de publicaciones.</DialogDescription>
          </DialogHeader>
          {composerInitial && (
            <PublicationComposer
              initial={composerInitial as any}
              onPublished={() => {
                setComposerInitial(null);
                toast.success("Publicado");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// Tarjeta de bloque individual
// =============================================================================

function BlockCard({
  block,
  editing,
  vaults,
  memories,
  connectMode,
  connectActive,
  memoryView,
  onConnectClick,
  onEditToggle,
  onRemove,
  onGroup,
  onPointerDownMove,
  onPointerDownResize,
  onData,
  onTitle,
  onPickFile,
}: {
  block: CanvasBlock;
  editing: boolean;
  vaults: VaultRef[];
  memories: MemoryRef[];
  connectMode: boolean;
  connectActive: boolean;
  memoryView: boolean;
  onConnectClick: () => void;
  onEditToggle: () => void;
  onRemove: () => void;
  onGroup: () => void;
  onPointerDownMove: (e: React.PointerEvent) => void;
  onPointerDownResize: (e: React.PointerEvent) => void;
  onData: (patch: Record<string, any>) => void;
  onTitle: (t: string) => void;
  onPickFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const def = blockKindDef(block.kind);
  return (
    <div
      data-block={block.id}
      onClick={connectMode ? onConnectClick : undefined}
      className={cn(
        "absolute rounded-xl border bg-zinc-900/80 backdrop-blur shadow-lg flex flex-col overflow-hidden",
        connectActive
          ? "border-amber-400 ring-2 ring-amber-400/40"
          : connectMode
            ? "border-amber-500/40 hover:border-amber-400 cursor-pointer"
            : memoryView
              ? "border-fuchsia-500/30 shadow-[0_0_24px_-6px_rgba(217,70,239,0.45)]"
              : "border-white/12",
      )}
      style={{ left: block.x, top: block.y, width: block.w, height: block.h }}
    >
      {/* Cabecera arrastrable */}
      <div
        onPointerDown={connectMode ? undefined : onPointerDownMove}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 bg-white/5 border-b border-white/10 select-none",
          connectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        )}
      >
        <GripVertical className="w-3.5 h-3.5 text-white/25 shrink-0" />
        <KindIcon kind={block.kind} className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" />
        <input
          value={block.title ?? def?.label ?? ""}
          onChange={(e) => onTitle(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-transparent text-[11px] text-amber-50 outline-none truncate"
        />
        {blockGroup(block) && (
          <Badge variant="outline" className="text-[8px] border-fuchsia-500/30 text-fuchsia-200/70 shrink-0 px-1 py-0">
            {blockGroup(block)}
          </Badge>
        )}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onGroup();
          }}
          className="text-white/30 hover:text-fuchsia-300"
          title="Grupo / carpeta del bloque"
        >
          <Move className="w-3.5 h-3.5" />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEditToggle();
          }}
          className="text-white/30 hover:text-fuchsia-300"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-white/30 hover:text-red-400"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 min-h-0 overflow-auto p-2 text-xs text-white/80">
        {editing ? (
          <BlockEditor block={block} vaults={vaults} memories={memories} onData={onData} onPickFile={onPickFile} />
        ) : (
          <BlockPreview block={block} />
        )}
      </div>

      {/* Manija de redimensión */}
      <div
        onPointerDown={connectMode ? undefined : onPointerDownResize}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize text-white/30 hover:text-fuchsia-300"
        title="Redimensionar"
      >
        <svg viewBox="0 0 10 10" className="w-full h-full">
          <path d="M9 1 L1 9 M9 5 L5 9" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      </div>
    </div>
  );
}

// ---- Vista (no edición) ----------------------------------------------------
function BlockPreview({ block }: { block: CanvasBlock }) {
  const d = block.data || {};
  switch (block.kind) {
    case "text":
      return d.text ? (
        <div className="whitespace-pre-wrap text-white/85">{d.text}</div>
      ) : (
        <Empty label="Nota vacía — pulsa el lápiz para escribir." />
      );
    case "image":
      return d.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.url} alt={block.title ?? "imagen"} className="max-w-full rounded-md" />
      ) : (
        <Empty label="Pega una URL de imagen." />
      );
    case "browser":
      return d.url ? (
        <iframe
          src={d.url}
          title={block.title ?? "navegador"}
          className="w-full h-full min-h-[120px] rounded-md border border-white/10 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
        />
      ) : (
        <Empty label="Pega una URL embebible." />
      );
    case "link":
      return d.url ? (
        <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-fuchsia-300 hover:underline break-all">
          <Link2 className="w-3.5 h-3.5 shrink-0" /> {d.url}
        </a>
      ) : (
        <Empty label="Pega un enlace." />
      );
    case "file":
      return d.fileName || d.url ? (
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-white/85">
            <FileText className="w-3.5 h-3.5 text-amber-300" /> {d.fileName || "archivo"}
          </div>
          {d.url && (
            <a href={d.url} target="_blank" rel="noreferrer" className="block text-[10px] text-fuchsia-300 hover:underline break-all">
              {d.url}
            </a>
          )}
        </div>
      ) : (
        <Empty label="Sube un archivo o pega su URL." />
      );
    case "vault":
      return d.name ? (
        <div className="inline-flex items-center gap-1.5 text-white/85">
          <Archive className="w-3.5 h-3.5 text-amber-300" /> {d.name}
        </div>
      ) : (
        <Empty label="Selecciona un baúl." />
      );
    case "memory":
      return d.name ? (
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-white/85">
            <Brain className="w-3.5 h-3.5 text-fuchsia-300" /> {d.name}
          </div>
          {d.content && <div className="text-[10px] text-white/50 line-clamp-4 whitespace-pre-wrap">{d.content}</div>}
        </div>
      ) : (
        <Empty label="Selecciona una memoria." />
      );
    case "app":
    case "widget":
      return d.name ? (
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-white/85">
            {block.kind === "app" ? <AppWindow className="w-3.5 h-3.5 text-amber-300" /> : <LayoutGrid className="w-3.5 h-3.5 text-fuchsia-300" />}
            {d.name}
          </div>
          {d.config && <pre className="text-[10px] text-white/45 whitespace-pre-wrap break-all">{d.config}</pre>}
        </div>
      ) : (
        <Empty label={`Indica el nombre del ${block.kind === "app" ? "app/programa" : "widget"}.`} />
      );
    default:
      return <Empty label="Sin contenido." />;
  }
}

function Empty({ label }: { label: string }) {
  return <div className="text-[11px] text-white/30 italic">{label}</div>;
}

// ---- Editor de un bloque ---------------------------------------------------
function BlockEditor({
  block,
  vaults,
  memories,
  onData,
  onPickFile,
}: {
  block: CanvasBlock;
  vaults: VaultRef[];
  memories: MemoryRef[];
  onData: (patch: Record<string, any>) => void;
  onPickFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const d = block.data || {};
  switch (block.kind) {
    case "text":
      return (
        <Textarea
          autoFocus
          value={d.text ?? ""}
          onChange={(e) => onData({ text: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          placeholder="Escribe tu nota, idea o markdown…"
          className="w-full h-full min-h-[100px] bg-white/5 text-xs resize-none"
        />
      );
    case "image":
      return (
        <Input
          autoFocus
          value={d.url ?? ""}
          onChange={(e) => onData({ url: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          placeholder="https://…/imagen.png"
          className="bg-white/5 text-xs"
        />
      );
    case "link":
      return (
        <Input
          autoFocus
          value={d.url ?? ""}
          onChange={(e) => onData({ url: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          placeholder="https://… (interno o externo)"
          className="bg-white/5 text-xs"
        />
      );
    case "browser":
      return (
        <div className="space-y-1.5" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Input
            autoFocus
            value={d.url ?? ""}
            onChange={(e) => onData({ url: e.target.value })}
            placeholder="https://… (URL embebible)"
            className="bg-white/5 text-xs"
          />
          <p className="text-[10px] text-white/35">Se incrusta con sandbox. Algunos sitios bloquean el embebido.</p>
        </div>
      );
    case "file":
      return (
        <div className="space-y-2" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <label className="block">
            <input type="file" className="hidden" onChange={onPickFile} />
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 text-amber-100 text-[11px] px-2.5 py-1.5 cursor-pointer hover:bg-amber-500/10">
              <Upload className="w-3.5 h-3.5" /> Subir archivo
            </span>
          </label>
          <Input
            value={d.url ?? ""}
            onChange={(e) => onData({ url: e.target.value })}
            placeholder="…o pega una URL de archivo"
            className="bg-white/5 text-xs"
          />
          {d.fileName && <div className="text-[10px] text-white/50">Seleccionado: {d.fileName}</div>}
        </div>
      );
    case "vault":
      return (
        <Picker
          items={vaults.map((v) => ({ id: v.id, name: v.name }))}
          selectedId={d.vaultId}
          emptyLabel="Sin baúles. Crea uno en Baúles."
          onPick={(it) => onData({ vaultId: it.id, name: it.name })}
        />
      );
    case "memory":
      return (
        <Picker
          items={memories.map((m) => ({ id: m.id, name: m.name, content: m.content }))}
          selectedId={d.memoryId}
          emptyLabel="Sin memorias disponibles."
          onPick={(it) => onData({ memoryId: it.id, name: it.name, content: (it as any).content ?? "" })}
        />
      );
    case "app":
    case "widget":
      return (
        <div className="space-y-1.5" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Input
            autoFocus
            value={d.name ?? ""}
            onChange={(e) => onData({ name: e.target.value })}
            placeholder={block.kind === "app" ? "Nombre del app/programa" : "Nombre del widget"}
            className="bg-white/5 text-xs"
          />
          <Textarea
            value={d.config ?? ""}
            onChange={(e) => onData({ config: e.target.value })}
            placeholder="Configuración (ruta, comando, params, JSON…)"
            className="bg-white/5 text-xs min-h-[60px] resize-none"
          />
        </div>
      );
    default:
      return <Empty label="Sin editor para este tipo." />;
  }
}

// ---- Selector genérico (baúl/memoria) -------------------------------------
function Picker({
  items,
  selectedId,
  emptyLabel,
  onPick,
}: {
  items: { id: string; name: string; content?: string }[];
  selectedId?: string;
  emptyLabel: string;
  onPick: (it: { id: string; name: string; content?: string }) => void;
}) {
  if (!items.length) return <Empty label={emptyLabel} />;
  return (
    <div className="space-y-1 max-h-full overflow-auto" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onPick(it)}
          className={cn(
            "w-full text-left px-2 py-1 rounded-md text-[11px] hover:bg-white/5 truncate",
            it.id === selectedId ? "bg-fuchsia-600/20 text-fuchsia-100" : "text-white/75",
          )}
        >
          {it.name}
        </button>
      ))}
    </div>
  );
}
