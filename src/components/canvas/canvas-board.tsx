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
import { FilePreview, type FileLike } from "@/components/files/file-preview";
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
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ArrowUp,
  ArrowDown,
  ImagePlus,
  Sparkles,
  Wand2,
  Settings2,
  MousePointer2,
  Palette,
  ListTree,
  PanelRight,
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
  getCover,
  setCover,
  hasCover,
  BLOCK_CATEGORY_LABELS,
  BLOCK_CATEGORY_ORDER,
  type Canvas,
  type CanvasBlock,
  type BlockKind,
  type BlockCategory,
  type CanvasCover,
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

// Ítem genérico de menú desplegable (menú superior: Herramientas / IA / Guardar).
function MenuItem({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-2.5 py-1.5 rounded-md text-[12px] hover:bg-white/5 flex items-center gap-2",
        active ? "text-amber-200" : "text-white/80",
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 text-fuchsia-300" />
      <span className="truncate">{label}</span>
    </button>
  );
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

  // ---- Módulo 5: editor híbrido (menú Insertar + paneles + portada) -------
  const [selectedId, setSelectedId] = useState<string | null>(null); // elemento seleccionado (Propiedades)
  const [showInsert, setShowInsert] = useState(false); // menú "Insertar"
  const [showTools, setShowTools] = useState(false); // menú "Herramientas"
  const [showAI, setShowAI] = useState(false); // menú "IA"
  const [showSave, setShowSave] = useState(false); // menú "Guardar"
  const [showLayers, setShowLayers] = useState(false); // panel lateral "Capas"
  const [showProps, setShowProps] = useState(true); // panel lateral "Propiedades del Elemento"
  const [coverOpen, setCoverOpen] = useState(false); // editor de la Tarjeta de Previsualización (portada)
  const [coverDraft, setCoverDraft] = useState<CanvasCover>({ title: "", subtitle: "", image: "", accent: "#d946ef" });
  // Cuando la publicación se intentó sin portada, recordamos QUÉ acción
  // re-disparar (por clave); se reanuda en un efecto cuando la portada existe,
  // garantizando que el handler vea el lienzo ya actualizado.
  const pendingPublish = useRef<null | "now" | "compositor" | "democratic">(null);

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
    setSelectedId(null);
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
    setShowInsert(false);
    if (kind === "vault" || kind === "memory") ensureRefData();
    // Creamos el bloque aquí (con id estable) para poder seleccionarlo después.
    const blk = defaultBlock(kind, contentBlocks.length);
    mutate((c) => ({ ...c, blocks: [...c.blocks, blk] }));
    setSelectedId(blk.id);
    setShowProps(true);
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
    if (selectedId === id) setSelectedId(null);
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

  // ===========================================================================
  // Módulo 5 · editor híbrido — derivados + operaciones de Capas / Propiedades
  // ===========================================================================

  // Bloques de CONTENIDO (excluye la portada `cover`, que no se dibuja en la
  // superficie ni aparece como capa). El orden del array es el z-order.
  const contentBlocks = useMemo(
    () => canvas.blocks.filter((b) => b.kind !== "cover"),
    [canvas.blocks],
  );

  // Bloques VISIBLES en la superficie: contenido que no esté oculto.
  const visibleBlocks = useMemo(
    () => contentBlocks.filter((b) => !b.hidden),
    [contentBlocks],
  );

  // Catálogo de "Insertar" agrupado por categoría (texto / medios / red / herramientas).
  const groupedKinds = useMemo(() => {
    return BLOCK_CATEGORY_ORDER.map((cat) => ({
      category: cat,
      label: BLOCK_CATEGORY_LABELS[cat],
      kinds: BLOCK_KINDS.filter((k) => k.kind !== "cover" && (k.category ?? "herramientas") === cat),
    })).filter((g) => g.kinds.length > 0);
  }, []);

  // Bloque seleccionado (para el panel Propiedades del Elemento).
  const selectedBlock = useMemo(
    () => (selectedId ? canvas.blocks.find((b) => b.id === selectedId) ?? null : null),
    [selectedId, canvas.blocks],
  );

  function selectBlock(id: string | null) {
    setSelectedId(id);
    if (id) setShowProps(true);
  }

  // ---- Capas: visibilidad / bloqueo / renombrar / reordenar (z-order) -----
  function toggleHidden(id: string) {
    const cur = canvas.blocks.find((b) => b.id === id);
    updateBlock(id, { hidden: !cur?.hidden } as Partial<CanvasBlock>);
  }

  function toggleLocked(id: string) {
    const cur = canvas.blocks.find((b) => b.id === id);
    updateBlock(id, { locked: !cur?.locked } as Partial<CanvasBlock>);
  }

  function renameLayer(id: string) {
    const cur = canvas.blocks.find((b) => b.id === id);
    const next =
      typeof window !== "undefined"
        ? window.prompt("Nombre de la capa", cur?.title ?? blockKindDef(cur?.kind ?? "text")?.label ?? "")
        : null;
    if (next === null) return;
    updateBlock(id, { title: next });
  }

  // Reordena una capa en el z-order (array de `blocks`). Se mueve dentro del
  // subconjunto de CONTENIDO, preservando la posición del bloque `cover`.
  function moveLayer(id: string, dir: -1 | 1) {
    mutate((c) => {
      const arr = [...c.blocks];
      const content = arr.filter((b) => b.kind !== "cover");
      const idx = content.findIndex((b) => b.id === id);
      if (idx < 0) return c;
      const target = idx + dir;
      if (target < 0 || target >= content.length) return c;
      [content[idx], content[target]] = [content[target], content[idx]];
      // Reconstruye el array conservando el cover al frente si lo hubiera.
      const cover = arr.filter((b) => b.kind === "cover");
      return { ...c, blocks: [...cover, ...content] };
    });
  }

  // ---- Tarjeta de Previsualización (portada) ------------------------------
  function openCoverEditor() {
    const cur = getCover(canvas);
    setCoverDraft({
      title: cur?.title ?? canvas.title ?? "",
      subtitle: cur?.subtitle ?? "",
      image: cur?.image ?? "",
      accent: cur?.accent || "#d946ef",
    });
    setCoverOpen(true);
  }

  function saveCover() {
    const title = (coverDraft.title || "").trim();
    if (!title) {
      toast.error("La portada necesita un título.");
      return;
    }
    mutate((c) => setCover(c, { ...coverDraft, title }));
    setCoverOpen(false);
    toast.success("Tarjeta de Previsualización guardada");
    // La publicación en espera (si la hay) se reanuda en un efecto cuando el
    // lienzo ya refleja la portada (ver useEffect de pendingPublish).
  }

  // Gate de publicación: exige portada. Si falta, avisa y abre el editor de
  // portada, recordando la acción (por clave) para re-disparar al guardar.
  function requireCover(key: "now" | "compositor" | "democratic"): boolean {
    if (hasCover(canvas)) {
      runPublish(key);
      return true;
    }
    pendingPublish.current = key;
    toast.error("Define la Tarjeta de Previsualización (portada) antes de publicar");
    openCoverEditor();
    return false;
  }

  // Reanuda una publicación que estaba esperando portada, una vez que el lienzo
  // ya tiene una Tarjeta de Previsualización válida.
  useEffect(() => {
    const key = pendingPublish.current;
    if (key && hasCover(canvas)) {
      pendingPublish.current = null;
      runPublish(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.blocks]);

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
    // Seleccionamos el elemento (panel Propiedades) al interactuar con él.
    setSelectedId(b.id);
    // Las capas bloqueadas no se arrastran ni redimensionan.
    if (b.locked) return;
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

  // ---- Gate de portada para publicar (Tarjeta de Previsualización OBLIGATORIA)
  // Cada acción de publicación pasa por requireCover(): si no hay portada,
  // avisa, recuerda la acción y abre el editor; al guardar la portada un efecto
  // reanuda la acción (ya con el lienzo actualizado).
  function runPublish(key: "now" | "compositor" | "democratic") {
    if (key === "now") void publishNow();
    else if (key === "compositor") openPublishCanvas();
    else publishDemocratic();
  }
  function publishNowGated() {
    requireCover("now");
  }
  function openPublishCanvasGated() {
    requireCover("compositor");
  }
  function publishDemocraticGated() {
    requireCover("democratic");
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
      {/* ===================================================================
          MENÚ SUPERIOR (Módulo 5): Insertar · Herramientas · IA · Guardar
          + portada (Tarjeta de Previsualización) + toggles de paneles
          (Capas · Propiedades). Es ADITIVO: reorganiza accesos a acciones que
          siguen existiendo en las barras de abajo.
          =================================================================== */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-fuchsia-500/25 bg-gradient-to-r from-fuchsia-950/30 to-amber-950/10 p-1.5 mb-2">
        {/* Insertar (catálogo agrupado por categoría) */}
        <div className="relative">
          <Button
            size="sm"
            className="gap-1.5 h-8 bg-fuchsia-600 hover:bg-fuchsia-500 text-white"
            onClick={() => { setShowInsert((v) => !v); setShowTools(false); setShowAI(false); setShowSave(false); }}
            title="Insertar elementos en el lienzo"
          >
            <Plus className="w-3.5 h-3.5" /> Insertar <ChevronDown className="w-3 h-3" />
          </Button>
          {showInsert && (
            <div className="absolute left-0 top-9 z-40 w-80 rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur p-2 shadow-2xl max-h-[70vh] overflow-auto">
              <div className="px-1 pb-1 text-[9px] uppercase tracking-widest text-fuchsia-300/50">Insertar en el lienzo</div>
              {groupedKinds.map((group) => (
                <div key={group.category} className="mb-1.5">
                  <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200/60">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {group.kinds.map((k) => (
                      <button
                        key={k.kind}
                        onClick={() => addBlock(k.kind)}
                        className="text-left px-2 py-1.5 rounded-md hover:bg-white/5 flex items-start gap-2"
                        title={k.blurb}
                      >
                        <KindIcon kind={k.kind} className="w-4 h-4 text-fuchsia-300 mt-0.5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-[11px] text-white/90 truncate">{k.label}</span>
                          <span className="block text-[9px] text-white/40 truncate">{k.blurb}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Herramientas de Creación / Edición */}
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 border-white/15 text-white/80"
            onClick={() => { setShowTools((v) => !v); setShowInsert(false); setShowAI(false); setShowSave(false); }}
            title="Herramientas de creación y edición"
          >
            <Wand2 className="w-3.5 h-3.5 text-fuchsia-300" /> Herramientas <ChevronDown className="w-3 h-3" />
          </Button>
          {showTools && (
            <div className="absolute left-0 top-9 z-40 w-64 rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur p-1 shadow-2xl">
              <MenuItem icon={ViewIcon} label={`Vista: ${VIEW_MODE_LABELS[viewMode]}`} onClick={() => { cycleViewMode(); setShowTools(false); }} />
              <MenuItem icon={Spline} label={connectMode ? "Conectando… (desactivar)" : "Conectar bloques"} active={connectMode} onClick={() => { toggleConnectMode(); setShowTools(false); }} />
              <MenuItem icon={Network} label="Reorganizar (radial)" onClick={() => { applyRadialLayout(); setShowTools(false); }} />
              <div className="my-1 border-t border-white/10" />
              <MenuItem icon={ZoomIn} label="Acercar" onClick={() => zoomBy(1.2)} />
              <MenuItem icon={ZoomOut} label="Alejar" onClick={() => zoomBy(1 / 1.2)} />
              <MenuItem icon={Maximize2} label="Centrar vista" onClick={() => { resetView(); setShowTools(false); }} />
              <div className="my-1 border-t border-white/10" />
              <MenuItem icon={Glasses} label="Lienzo inmersivo (VR/AR)" onClick={() => { enterImmersive(); setShowTools(false); }} />
            </div>
          )}
        </div>

        {/* IA */}
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 border-fuchsia-500/30 text-fuchsia-100"
            onClick={() => { setShowAI((v) => !v); setShowInsert(false); setShowTools(false); setShowSave(false); }}
            title="Asistencia de IA"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" /> IA <ChevronDown className="w-3 h-3" />
          </Button>
          {showAI && (
            <div className="absolute left-0 top-9 z-40 w-72 rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur p-2 shadow-2xl">
              <div className="px-1 pb-1 text-[9px] uppercase tracking-widest text-fuchsia-300/50">Asistencia de IA</div>
              <MenuItem icon={Brain} label="Apps con IA (/apps-ia)" onClick={() => { setShowAI(false); if (typeof window !== "undefined") window.location.href = "/apps-ia"; }} />
              <MenuItem icon={Sparkles} label="Sugerir bloque de texto" onClick={() => { addBlock("text"); setShowAI(false); toast.message("Bloque de texto listo", { description: "Conéctalo a una app de IA para generar contenido." }); }} />
              <p className="px-1.5 pt-1 text-[10px] text-white/35">La generación con IA se integra desde las apps de IA del sistema.</p>
            </div>
          )}
        </div>

        {/* Guardar (guardado / nuevo / publicar) */}
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 border-white/15 text-white/80"
            onClick={() => { setShowSave((v) => !v); setShowInsert(false); setShowTools(false); setShowAI(false); }}
            title="Guardar y publicar"
          >
            <Save className="w-3.5 h-3.5" /> Guardar <ChevronDown className="w-3 h-3" />
          </Button>
          {showSave && (
            <div className="absolute left-0 top-9 z-40 w-64 rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur p-1 shadow-2xl">
              <MenuItem icon={Save} label="Guardar ahora" onClick={() => { setShowSave(false); void handleSaveNow(); }} />
              <MenuItem icon={Plus} label="Nuevo lienzo" onClick={() => { setShowSave(false); void handleNew(); }} />
              <div className="my-1 border-t border-white/10" />
              <MenuItem icon={Send} label="Publicar" onClick={() => { setShowSave(false); publishNowGated(); }} />
              <MenuItem icon={Send} label="Publicar lienzo (compositor)" onClick={() => { setShowSave(false); openPublishCanvasGated(); }} />
              <MenuItem icon={Vote} label="Publicar (democrático)" onClick={() => { setShowSave(false); publishDemocraticGated(); }} />
              <div className="my-1 border-t border-white/10" />
              <MenuItem icon={Share2} label="Adjuntar (copiar referencia)" onClick={() => { setShowSave(false); void copyAttach(); }} />
            </div>
          )}
        </div>

        <div className="mx-1 h-5 w-px bg-white/10" />

        {/* Tarjeta de Previsualización (portada obligatoria) */}
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "gap-1.5 h-8",
            hasCover(canvas) ? "border-emerald-500/40 text-emerald-100" : "border-amber-500/50 text-amber-100",
          )}
          onClick={openCoverEditor}
          title="Tarjeta de Previsualización (portada del Lienzo Universal)"
        >
          <ImagePlus className="w-3.5 h-3.5" /> Portada {hasCover(canvas) ? "✓" : "·"}
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Toggles de paneles laterales: Capas · Propiedades */}
          <Button
            size="sm"
            variant={showLayers ? "default" : "outline"}
            className={cn("gap-1.5 h-8", showLayers ? "bg-fuchsia-600 hover:bg-fuchsia-500 text-white" : "border-white/15 text-white/80")}
            onClick={() => setShowLayers((v) => !v)}
            title="Panel de Capas"
          >
            <ListTree className="w-3.5 h-3.5" /> Capas
          </Button>
          <Button
            size="sm"
            variant={showProps ? "default" : "outline"}
            className={cn("gap-1.5 h-8", showProps ? "bg-fuchsia-600 hover:bg-fuchsia-500 text-white" : "border-white/15 text-white/80")}
            onClick={() => setShowProps((v) => !v)}
            title="Panel de Propiedades del Elemento"
          >
            <Settings2 className="w-3.5 h-3.5" /> Propiedades
          </Button>
        </div>
      </div>

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
            {contentBlocks.length} bloque{contentBlocks.length === 1 ? "" : "s"}
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
                      <span className="text-[9px] text-white/30">{(c.blocks ?? []).filter((b) => b.kind !== "cover").length}</span>
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

          <Button size="sm" className="gap-1.5 h-8 bg-amber-600 hover:bg-amber-500 text-white" onClick={publishNowGated}>
            <Send className="w-3.5 h-3.5" /> Publicar
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-amber-500/30 text-amber-100" onClick={openPublishCanvasGated} title="Publicar el lienzo con el compositor (instantánea)">
            <Send className="w-3.5 h-3.5" /> Publicar lienzo
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-amber-500/30 text-amber-100" onClick={publishDemocraticGated}>
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

      {/* ===================================================================
          ÁREA CENTRAL: panel Capas (izq) · superficie · panel Propiedades (der)
          =================================================================== */}
      <div className="flex-1 min-h-0 flex gap-2">
        {/* Panel lateral · CAPAS (z-order, visibilidad, bloqueo, reordenar) */}
        {showLayers && (
          <aside className="w-60 shrink-0 rounded-2xl border border-fuchsia-500/20 bg-zinc-950/50 flex flex-col overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10 bg-white/5">
              <ListTree className="w-4 h-4 text-fuchsia-300" />
              <span className="text-xs font-semibold text-amber-50">Capas</span>
              <Badge variant="outline" className="ml-auto text-[9px] border-fuchsia-500/30 text-fuchsia-200/70">
                {contentBlocks.length}
              </Badge>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-1.5 space-y-1">
              {contentBlocks.length === 0 ? (
                <p className="px-2 py-3 text-[11px] text-white/35">Sin capas. Usa «Insertar» para añadir elementos.</p>
              ) : (
                // El orden visual va de arriba (z mayor) a abajo: invertimos el array.
                [...contentBlocks].reverse().map((b) => (
                  <div
                    key={b.id}
                    onClick={() => selectBlock(b.id)}
                    className={cn(
                      "group flex items-center gap-1 rounded-md px-1.5 py-1 cursor-pointer border",
                      selectedId === b.id
                        ? "bg-fuchsia-600/20 border-fuchsia-400/40"
                        : "border-transparent hover:bg-white/5",
                      b.hidden ? "opacity-50" : "",
                    )}
                  >
                    <KindIcon kind={b.kind} className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" />
                    <span className="flex-1 min-w-0 text-[11px] text-white/85 truncate">
                      {b.title || blockKindDef(b.kind)?.label || b.kind}
                    </span>
                    {b.locked && <Lock className="w-3 h-3 text-amber-300/70 shrink-0" />}
                    {/* Acciones de capa */}
                    <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveLayer(b.id, 1); }}
                        className="p-0.5 text-white/40 hover:text-fuchsia-300"
                        title="Subir (z-order)"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveLayer(b.id, -1); }}
                        className="p-0.5 text-white/40 hover:text-fuchsia-300"
                        title="Bajar (z-order)"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleHidden(b.id); }}
                        className="p-0.5 text-white/40 hover:text-fuchsia-300"
                        title={b.hidden ? "Mostrar" : "Ocultar"}
                      >
                        {b.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLocked(b.id); }}
                        className="p-0.5 text-white/40 hover:text-amber-300"
                        title={b.locked ? "Desbloquear" : "Bloquear"}
                      >
                        {b.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); renameLayer(b.id); }}
                        className="p-0.5 text-white/40 hover:text-fuchsia-300"
                        title="Renombrar"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="px-2.5 py-1.5 text-[9px] text-white/30 border-t border-white/10">
              Arriba = primer plano. Bloqueadas no se mueven ni redimensionan.
            </p>
          </aside>
        )}

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
        {contentBlocks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
            <Layers className="w-10 h-10 text-fuchsia-400/40 mb-3" />
            <p className="text-sm text-white/50">Lienzo vacío. Pulsa <span className="text-fuchsia-200">Insertar</span> para conectar archivos, baúles, memorias, apps, enlaces, widgets o el navegador.</p>
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

          {visibleBlocks.map((b) => (
            <BlockCard
              key={b.id}
              block={b}
              editing={editingId === b.id}
              selected={selectedId === b.id}
              vaults={vaults}
              memories={memories}
              connectMode={connectMode}
              connectActive={connectFrom === b.id}
              memoryView={isMemoryView}
              onSelect={() => selectBlock(b.id)}
              onConnectClick={() => onBlockConnectClick(b.id)}
              onEditToggle={() => {
                const opening = editingId !== b.id;
                setEditingId(opening ? b.id : null);
                selectBlock(b.id);
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

        {/* Panel lateral · PROPIEDADES DEL ELEMENTO (cuando hay selección) */}
        {showProps && (
          <aside className="w-72 shrink-0 rounded-2xl border border-fuchsia-500/20 bg-zinc-950/50 flex flex-col overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10 bg-white/5">
              <Settings2 className="w-4 h-4 text-fuchsia-300" />
              <span className="text-xs font-semibold text-amber-50">Propiedades del Elemento</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-3">
              {selectedBlock ? (
                <PropertiesPanel
                  block={selectedBlock}
                  onPatch={(patch) => updateBlock(selectedBlock.id, patch)}
                  onData={(dataPatch) => updateBlockData(selectedBlock.id, dataPatch)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center h-full px-3 text-white/35">
                  <MousePointer2 className="w-7 h-7 mb-2 text-fuchsia-400/40" />
                  <p className="text-[11px]">Selecciona un elemento del lienzo o una capa para editar sus propiedades.</p>
                </div>
              )}
            </div>
          </aside>
        )}
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

      {/* Dialog · Tarjeta de Previsualización (PORTADA obligatoria del Lienzo) */}
      <Dialog open={coverOpen} onOpenChange={setCoverOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tarjeta de Previsualización</DialogTitle>
            <DialogDescription>
              Portada obligatoria del Lienzo Universal. Es lo que se muestra al compartir la publicación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Previsualización en vivo */}
            <div
              className="rounded-xl border border-white/10 overflow-hidden bg-zinc-900/60"
              style={{ boxShadow: `inset 0 -3px 0 0 ${coverDraft.accent || "#d946ef"}` }}
            >
              {coverDraft.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverDraft.image} alt="portada" className="w-full h-32 object-cover" />
              ) : (
                <div
                  className="w-full h-32 flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${coverDraft.accent || "#d946ef"}33, transparent)` }}
                >
                  <ImagePlus className="w-7 h-7 text-white/30" />
                </div>
              )}
              <div className="p-3">
                <div className="text-sm font-semibold text-amber-50 truncate">
                  {coverDraft.title || "Título de la portada"}
                </div>
                {coverDraft.subtitle && (
                  <div className="text-[11px] text-white/55 truncate">{coverDraft.subtitle}</div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-white/60">Título *</label>
              <Input
                value={coverDraft.title}
                onChange={(e) => setCoverDraft((c) => ({ ...c, title: e.target.value }))}
                placeholder="Título de la publicación"
                className="bg-white/5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-white/60">Subtítulo</label>
              <Input
                value={coverDraft.subtitle ?? ""}
                onChange={(e) => setCoverDraft((c) => ({ ...c, subtitle: e.target.value }))}
                placeholder="Una línea descriptiva (opcional)"
                className="bg-white/5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-white/60">Imagen (URL)</label>
              <Input
                value={coverDraft.image ?? ""}
                onChange={(e) => setCoverDraft((c) => ({ ...c, image: e.target.value }))}
                placeholder="https://…/portada.jpg"
                className="bg-white/5 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-white/60">Acento</label>
              <input
                type="color"
                value={coverDraft.accent || "#d946ef"}
                onChange={(e) => setCoverDraft((c) => ({ ...c, accent: e.target.value }))}
                className="h-8 w-12 rounded border border-white/10 bg-transparent cursor-pointer"
                title="Color de acento"
              />
              <Input
                value={coverDraft.accent || ""}
                onChange={(e) => setCoverDraft((c) => ({ ...c, accent: e.target.value }))}
                placeholder="#d946ef"
                className="bg-white/5 text-xs flex-1"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="border-white/15 text-white/70" onClick={() => setCoverOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white" onClick={saveCover}>
                <ImagePlus className="w-3.5 h-3.5" /> Guardar portada
              </Button>
            </div>
          </div>
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
  selected,
  vaults,
  memories,
  connectMode,
  connectActive,
  memoryView,
  onSelect,
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
  selected: boolean;
  vaults: VaultRef[];
  memories: MemoryRef[];
  connectMode: boolean;
  connectActive: boolean;
  memoryView: boolean;
  onSelect: () => void;
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
  const locked = !!block.locked;
  return (
    <div
      data-block={block.id}
      onClick={connectMode ? onConnectClick : onSelect}
      className={cn(
        "absolute rounded-xl border bg-zinc-900/80 backdrop-blur shadow-lg flex flex-col overflow-hidden",
        connectActive
          ? "border-amber-400 ring-2 ring-amber-400/40"
          : connectMode
            ? "border-amber-500/40 hover:border-amber-400 cursor-pointer"
            : selected
              ? "border-fuchsia-400 ring-2 ring-fuchsia-400/50"
              : memoryView
                ? "border-fuchsia-500/30 shadow-[0_0_24px_-6px_rgba(217,70,239,0.45)]"
                : "border-white/12",
      )}
      style={{
        left: block.x,
        top: block.y,
        width: block.w,
        height: block.h,
        ...(block.accent ? { boxShadow: `inset 4px 0 0 0 ${block.accent}` } : {}),
      }}
    >
      {/* Cabecera arrastrable (bloqueada si la capa está locked) */}
      <div
        onPointerDown={connectMode || locked ? undefined : onPointerDownMove}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 bg-white/5 border-b border-white/10 select-none",
          connectMode ? "cursor-pointer" : locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        )}
      >
        {locked ? (
          <Lock className="w-3.5 h-3.5 text-amber-300/70 shrink-0" />
        ) : (
          <GripVertical className="w-3.5 h-3.5 text-white/25 shrink-0" />
        )}
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

      {/* Manija de redimensión (oculta si la capa está locked) */}
      {!locked && (
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
      )}
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
        <FilePreview file={{ url: d.url, name: block.title ?? d.fileName, type: "imagen" } as FileLike} context="pizarra" />
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
        <FilePreview file={{ url: d.url, name: block.title, type: "enlace" } as FileLike} context="pizarra" />
      ) : (
        <Empty label="Pega un enlace." />
      );
    case "file":
      return d.fileName || d.url ? (
        <FilePreview file={{ url: d.url, name: d.fileName ?? block.title, size: d.size } as FileLike} context="pizarra" />
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

// =============================================================================
// Panel · Propiedades del Elemento (Módulo 5)
// Edita posición/tamaño, título, datos según el tipo, acento y grupo del bloque
// seleccionado. Las mutaciones son en vivo y se persisten (debounce) vía las
// callbacks onPatch / onData que llegan del tablero.
// =============================================================================
function PropertiesPanel({
  block,
  onPatch,
  onData,
}: {
  block: CanvasBlock;
  onPatch: (patch: Partial<CanvasBlock>) => void;
  onData: (dataPatch: Record<string, any>) => void;
}) {
  const def = blockKindDef(block.kind);
  const d = block.data || {};

  // Campo numérico controlado para x/y/w/h.
  function NumField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (n: number) => void }) {
    return (
      <label className="flex-1 min-w-0">
        <span className="block text-[10px] text-white/50 mb-0.5">{label}</span>
        <Input
          type="number"
          value={Math.round(value)}
          min={min}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(min != null ? Math.max(min, n) : n);
          }}
          className="h-8 bg-white/5 text-xs"
        />
      </label>
    );
  }

  return (
    <div className="space-y-3">
      {/* Identidad del elemento */}
      <div className="flex items-center gap-1.5">
        <KindIcon kind={block.kind} className="w-4 h-4 text-fuchsia-300 shrink-0" />
        <span className="text-[11px] text-white/55">{def?.label ?? block.kind}</span>
      </div>

      {/* Título */}
      <div className="space-y-1">
        <label className="text-[10px] text-white/50">Título</label>
        <Input
          value={block.title ?? ""}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder={def?.label ?? "Título"}
          className="h-8 bg-white/5 text-xs"
        />
      </div>

      {/* Posición y tamaño */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-amber-200/60">Posición y tamaño</label>
        <div className="flex gap-2">
          <NumField label="X" value={block.x} min={0} onChange={(n) => onPatch({ x: n })} />
          <NumField label="Y" value={block.y} min={0} onChange={(n) => onPatch({ y: n })} />
        </div>
        <div className="flex gap-2">
          <NumField label="Ancho" value={block.w} min={160} onChange={(n) => onPatch({ w: n })} />
          <NumField label="Alto" value={block.h} min={120} onChange={(n) => onPatch({ h: n })} />
        </div>
      </div>

      {/* Datos según el tipo */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-amber-200/60">Contenido</label>
        <PropertiesData block={block} onData={onData} />
      </div>

      {/* Acento (color) */}
      <div className="space-y-1">
        <label className="text-[10px] text-white/50">Acento</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={block.accent || "#d946ef"}
            onChange={(e) => onPatch({ accent: e.target.value } as Partial<CanvasBlock>)}
            className="h-8 w-12 rounded border border-white/10 bg-transparent cursor-pointer"
            title="Color de acento del elemento"
          />
          <Input
            value={block.accent ?? ""}
            onChange={(e) => onPatch({ accent: e.target.value } as Partial<CanvasBlock>)}
            placeholder="(sin acento)"
            className="h-8 bg-white/5 text-xs flex-1"
          />
          {block.accent && (
            <button
              onClick={() => onPatch({ accent: undefined } as Partial<CanvasBlock>)}
              className="text-white/40 hover:text-red-400"
              title="Quitar acento"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Grupo / carpeta */}
      <div className="space-y-1">
        <label className="text-[10px] text-white/50">Grupo / carpeta</label>
        <Input
          value={block.group ?? ""}
          onChange={(e) => onPatch({ group: e.target.value.trim() || undefined } as Partial<CanvasBlock>)}
          placeholder="(sin grupo)"
          className="h-8 bg-white/5 text-xs"
        />
      </div>
    </div>
  );
}

// Editor de datos del bloque dentro de Propiedades, según su tipo.
function PropertiesData({
  block,
  onData,
}: {
  block: CanvasBlock;
  onData: (dataPatch: Record<string, any>) => void;
}) {
  const d = block.data || {};
  switch (block.kind) {
    case "text":
      return (
        <Textarea
          value={d.text ?? ""}
          onChange={(e) => onData({ text: e.target.value })}
          placeholder="Texto / nota / markdown…"
          className="bg-white/5 text-xs min-h-[90px] resize-none"
        />
      );
    case "image":
    case "link":
    case "browser":
      return (
        <Input
          value={d.url ?? ""}
          onChange={(e) => onData({ url: e.target.value })}
          placeholder="https://…"
          className="h-8 bg-white/5 text-xs"
        />
      );
    case "file":
      return (
        <div className="space-y-1.5">
          <Input
            value={d.fileName ?? ""}
            onChange={(e) => onData({ fileName: e.target.value })}
            placeholder="Nombre del archivo"
            className="h-8 bg-white/5 text-xs"
          />
          <Input
            value={d.url ?? ""}
            onChange={(e) => onData({ url: e.target.value })}
            placeholder="URL del archivo"
            className="h-8 bg-white/5 text-xs"
          />
        </div>
      );
    case "vault":
    case "memory":
      return (
        <Input
          value={d.name ?? ""}
          onChange={(e) => onData({ name: e.target.value })}
          placeholder={block.kind === "vault" ? "Nombre del baúl" : "Nombre de la memoria"}
          className="h-8 bg-white/5 text-xs"
        />
      );
    case "app":
    case "widget":
      return (
        <div className="space-y-1.5">
          <Input
            value={d.name ?? ""}
            onChange={(e) => onData({ name: e.target.value })}
            placeholder={block.kind === "app" ? "Nombre del app/programa" : "Nombre del widget"}
            className="h-8 bg-white/5 text-xs"
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
      return <p className="text-[11px] text-white/35 italic">Sin datos editables para este tipo.</p>;
  }
}
