"use client";

/**
 * StarSeed OS — AiAppGenerator (Astraura · Estudio de Apps con IA)
 *
 * Un generador de apps con IA dentro del navegador, en la línea de Cursor /
 * Claude Code / Antigravity, pero con la libertad y las integraciones de
 * StarSeed: proyecto virtual multi-archivo (árbol de folders/archivos),
 * editor por archivo, vista previa en vivo (iframe srcdoc), guardar/cargar en
 * Supabase, exportar, compartir y declarar plugins/conexiones.
 *
 * Honestidad: el preview corre 100% en el cliente (HTML/CSS/JS + React vía CDN).
 * No es un IDE de servidor ni un deploy real — exporta para ejecutar donde sea.
 *
 * SSR-safe: "use client", sin window a nivel de módulo; el iframe usa srcdoc.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Wand2,
  RefreshCcw,
  Loader2,
  FolderTree,
  FilePlus2,
  FolderPlus,
  Trash2,
  Pencil,
  Save,
  Download,
  Share2,
  Plus,
  Play,
  Maximize2,
  Plug,
  X,
  FileCode2,
  ChevronRight,
  ChevronDown,
  Info,
  Code2,
  Rocket,
  ExternalLink,
  Copy,
  Link2,
  BrainCircuit,
  Server,
} from "lucide-react";
import { toast } from "sonner";

import { loadConfigs } from "@/ai/client/providerStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

import {
  type AppFile,
  type GeneratedApp,
  newApp,
  generate,
  editFile,
  addFile,
  removeFile,
  renameFile,
  buildPreview,
  listApps,
  getApp,
  saveApp,
  deleteApp,
  exportApp,
  basename,
  languageForPath,
  deployApp,
  runOnBrain,
  appShareRef,
} from "@/lib/appgen/appgen";

import { createClient } from "@/utils/supabase/client";
import { listBrains, type Brain, type BrainServer } from "@/lib/brains/brains";
import { serversForBrain, listServers } from "@/lib/brains/servers";

// ────────────────────────────────────────────────────────────────────────────
// Árbol de archivos (deriva folders a partir de las rutas planas)
// ────────────────────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string; // ruta completa (para archivos)
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(files: AppFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    let cur = root;
    let acc = "";
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isLeaf = i === parts.length - 1;
      let node = cur.children.find((c) => c.name === part && c.isDir === !isLeaf);
      if (!node) {
        node = { name: part, path: acc, isDir: !isLeaf, children: [] };
        cur.children.push(node);
      }
      cur = node;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) =>
      a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
    );
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

// ────────────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────────────

export default function AiAppGenerator() {
  const [app, setApp] = useState<GeneratedApp>(() => newApp("Mi primera app"));
  const [activePath, setActivePath] = useState<string>("index.html");
  const [spec, setSpec] = useState<string>("");
  const [busy, setBusy] = useState<"gen" | "refine" | null>(null);
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [appList, setAppList] = useState<GeneratedApp[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newPath, setNewPath] = useState("");
  const [pluginDraft, setPluginDraft] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  // Despliegue en la red (ruta /app/{id} donde la app se EJECUTA).
  const [deploying, setDeploying] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);

  // Ejecutar en cerebro: id de cuenta + selector de cerebro/servidor.
  const [userId, setUserId] = useState<string | null>(null);
  const [brainPickerOpen, setBrainPickerOpen] = useState(false);
  const [brains, setBrains] = useState<Brain[]>([]);
  const [pickBrainId, setPickBrainId] = useState<string>("");
  const [brainServers, setBrainServers] = useState<BrainServer[]>([]);
  const [loadingBrains, setLoadingBrains] = useState(false);
  const [runningServerId, setRunningServerId] = useState<string | null>(null);

  // Proveedor de IA listo? (mismo patrón que memory-mesh-3d)
  useEffect(() => {
    try {
      const configs = loadConfigs();
      setHasProvider(configs.some((c) => c.enabled));
    } catch {
      setHasProvider(false);
    }
  }, []);

  // Id de cuenta (para enrutar la ejecución en cerebro). Mismo patrón que brains-panel.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (alive) setUserId(data?.user?.id ?? null);
      } catch {
        if (alive) setUserId(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const activeFile = useMemo(
    () => app.files.find((f) => f.path === activePath) ?? app.files[0],
    [app.files, activePath],
  );

  const tree = useMemo(() => buildTree(app.files), [app.files]);
  const srcDoc = useMemo(() => buildPreview(app.files), [app.files, previewKey]);
  const plugins = (app.meta.plugins ?? []) as string[];

  // ──────────────────────────────────────────────────────────────────────────
  // Mutadores de archivos
  // ──────────────────────────────────────────────────────────────────────────

  const updateFiles = useCallback((next: AppFile[]) => {
    setApp((prev) => ({ ...prev, files: next }));
  }, []);

  const onEdit = useCallback(
    (content: string) => {
      if (!activeFile) return;
      updateFiles(editFile(app.files, activeFile.path, content));
    },
    [activeFile, app.files, updateFiles],
  );

  const onAddFile = useCallback(() => {
    const path = newPath.trim();
    if (!path) {
      toast.error("Escribe una ruta, p.ej. css/app.css");
      return;
    }
    if (app.files.some((f) => f.path === path.replace(/^\/+/, ""))) {
      toast.error("Ya existe un archivo con esa ruta");
      return;
    }
    const next = addFile(app.files, path);
    updateFiles(next);
    setActivePath(path.replace(/^\/+/, ""));
    setNewPath("");
  }, [app.files, newPath, updateFiles]);

  const onRename = useCallback(
    (from: string) => {
      const to = window.prompt("Nueva ruta para el archivo:", from);
      if (!to || to.trim() === from) return;
      const next = renameFile(app.files, from, to.trim());
      updateFiles(next);
      if (activePath === from) setActivePath(to.trim().replace(/^\/+/, ""));
    },
    [app.files, activePath, updateFiles],
  );

  const onDelete = useCallback(
    (path: string) => {
      if (app.files.length <= 1) {
        toast.error("El proyecto necesita al menos un archivo");
        return;
      }
      if (!window.confirm(`¿Eliminar ${path}?`)) return;
      const next = removeFile(app.files, path);
      updateFiles(next);
      if (activePath === path) setActivePath(next[0]?.path ?? "");
    },
    [app.files, activePath, updateFiles],
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Generar / Refinar con IA
  // ──────────────────────────────────────────────────────────────────────────

  const runGenerate = useCallback(
    async (mode: "gen" | "refine") => {
      if (busy) return;
      const idea = spec.trim();
      if (!idea && mode === "gen") {
        toast.error("Describe la app que quieres generar");
        return;
      }
      if (!hasProvider) {
        toast.error("Configura un proveedor de IA en Ajustes → IA & Modelos");
        return;
      }

      setBusy(mode);
      abortRef.current = new AbortController();
      const t = toast.loading(
        mode === "gen" ? "Astraura está generando tu app…" : "Astraura está refinando el proyecto…",
      );

      try {
        const ctxFiles = mode === "refine" ? app.files : [];
        const { files, notes } = await generate(idea, ctxFiles, {
          signal: abortRef.current.signal,
        });

        setApp((prev) => ({
          ...prev,
          files,
          meta: { ...prev.meta, spec: idea || prev.meta.spec, notes },
        }));
        // abrir un archivo razonable
        const open =
          files.find((f) => f.path === "index.html") ||
          files.find((f) => f.path.toLowerCase().endsWith(".html")) ||
          files[0];
        if (open) setActivePath(open.path);
        setPreviewKey((k) => k + 1);

        toast.success(
          mode === "gen" ? "App generada ✦" : "Proyecto refinado ✦",
          { id: t, description: notes ? notes.slice(0, 140) : undefined },
        );
      } catch (err) {
        const msg = (err as Error)?.message || "Error desconocido";
        toast.error("No pude completar la generación", { id: t, description: msg });
      } finally {
        setBusy(null);
        abortRef.current = null;
      }
    },
    [busy, spec, hasProvider, app.files],
  );

  const cancelGen = useCallback(() => {
    abortRef.current?.abort();
    setBusy(null);
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Persistencia (Supabase)
  // ──────────────────────────────────────────────────────────────────────────

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await saveApp(app);
      setApp(saved);
      toast.success("Guardado en tus apps");
    } catch (err) {
      toast.error("No se pudo guardar", { description: (err as Error)?.message });
    } finally {
      setSaving(false);
    }
  }, [app]);

  const refreshList = useCallback(async () => {
    try {
      const apps = await listApps();
      setAppList(apps);
    } catch (err) {
      toast.error("No se pudo cargar la lista", { description: (err as Error)?.message });
    }
  }, []);

  const openList = useCallback(async () => {
    setListOpen((v) => !v);
    if (!listOpen) await refreshList();
  }, [listOpen, refreshList]);

  const onLoad = useCallback(async (id: string) => {
    try {
      const loaded = await getApp(id);
      if (!loaded) {
        toast.error("App no encontrada");
        return;
      }
      setApp(loaded);
      setActivePath(loaded.files[0]?.path ?? "");
      setSpec(loaded.meta?.spec ?? "");
      setPreviewKey((k) => k + 1);
      setListOpen(false);
      toast.success(`Cargada: ${loaded.name}`);
    } catch (err) {
      toast.error("No se pudo abrir", { description: (err as Error)?.message });
    }
  }, []);

  const onDeleteApp = useCallback(
    async (id: string) => {
      if (!window.confirm("¿Eliminar esta app de tus guardados?")) return;
      try {
        await deleteApp(id);
        toast.success("Eliminada");
        await refreshList();
      } catch (err) {
        toast.error("No se pudo eliminar", { description: (err as Error)?.message });
      }
    },
    [refreshList],
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Compartir / Exportar / Plugins
  // ──────────────────────────────────────────────────────────────────────────

  const toggleShared = useCallback((value: boolean) => {
    setApp((prev) => ({ ...prev, shared: value }));
  }, []);

  const onExport = useCallback(() => {
    try {
      exportApp(app);
      toast.success("Exportando descargas…");
    } catch (err) {
      toast.error("No se pudo exportar", { description: (err as Error)?.message });
    }
  }, [app]);

  // Copia texto al portapapeles (con fallback). SSR-guard incluido.
  const copyText = useCallback(async (text: string, ok = "Copiado") => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(ok);
        return;
      } catch {
        /* cae al fallback */
      }
    }
    if (typeof document !== "undefined") {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast.success(ok);
        return;
      } catch {
        /* */
      }
    }
    toast.message(text);
  }, []);

  // Construye la URL absoluta de la app desplegada (/app/{id}).
  const appUrlFor = useCallback((id: string) => {
    const path = `/app/${id}`;
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }, []);

  // Desplegar EN LA RED: guarda si hace falta, marca shared y muestra el enlace /app/{id}.
  const onDeploy = useCallback(async () => {
    if (deploying) return;
    setDeploying(true);
    const t = toast.loading("Desplegando app en la red…");
    try {
      // Asegura que la app está guardada (necesita una fila en generated_apps).
      let current = app;
      if (!current.shared || current.updated_at == null) {
        current = await saveApp({ ...current, shared: true });
        setApp(current);
      }
      const r = await deployApp(current.id);
      if (!r.ok) {
        toast.error("No se pudo desplegar", { id: t, description: r.error });
        return;
      }
      setApp((prev) => ({ ...prev, shared: true }));
      setDeployUrl(r.url ?? `/app/${current.id}`);
      toast.success("App desplegada en la red", {
        id: t,
        description: "Disponible en " + (r.url ?? `/app/${current.id}`),
      });
    } catch (err) {
      toast.error("No se pudo desplegar", { id: t, description: (err as Error)?.message });
    } finally {
      setDeploying(false);
    }
  }, [app, deploying]);

  // Abre el selector de cerebro y carga los cerebros del usuario.
  const openBrainPicker = useCallback(async () => {
    const willOpen = !brainPickerOpen;
    setBrainPickerOpen(willOpen);
    if (!willOpen) return;
    setLoadingBrains(true);
    try {
      const list = await listBrains();
      setBrains(list);
      // Preselecciona el primer cerebro y carga sus servidores.
      const first = list[0]?.id ?? "";
      setPickBrainId(first);
    } catch (err) {
      toast.error("No se pudieron cargar los cerebros", { description: (err as Error)?.message });
    } finally {
      setLoadingBrains(false);
    }
  }, [brainPickerOpen]);

  // Cuando cambia el cerebro elegido, reúne sus servidores (propios + enlazados del registro).
  useEffect(() => {
    if (!brainPickerOpen) return;
    let alive = true;
    (async () => {
      try {
        const brain = brains.find((b) => b.id === pickBrainId);
        const own: BrainServer[] = Array.isArray(brain?.servers) ? (brain!.servers as BrainServer[]) : [];
        let linked: BrainServer[] = [];
        if (pickBrainId) {
          const ls = await serversForBrain(pickBrainId);
          linked = ls.map((s) => ({
            id: s.id,
            kind: s.kind,
            name: s.name,
            endpoint: s.endpoint,
            keyRef: s.keyRef,
            status: s.status,
          })) as BrainServer[];
        }
        // Si no hay cerebro/servidores, ofrece el registro completo del usuario.
        let registry: BrainServer[] = [];
        if (own.length === 0 && linked.length === 0) {
          const all = await listServers();
          registry = all.map((s) => ({
            id: s.id,
            kind: s.kind,
            name: s.name,
            endpoint: s.endpoint,
            keyRef: s.keyRef,
            status: s.status,
          })) as BrainServer[];
        }
        // Deduplica por id (propios primero).
        const byId = new Map<string, BrainServer>();
        [...own, ...linked, ...registry].forEach((s) => {
          if (s && s.id && !byId.has(s.id)) byId.set(s.id, s);
        });
        if (alive) setBrainServers(Array.from(byId.values()));
      } catch {
        if (alive) setBrainServers([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [brainPickerOpen, pickBrainId, brains]);

  // Ejecuta la app en un servidor de cerebro concreto.
  const onRunOnBrain = useCallback(
    async (server: BrainServer) => {
      if (runningServerId) return;
      setRunningServerId(server.id);
      const t = toast.loading(`Enviando «${app.name}» a ${server.name}…`);
      try {
        const r = await runOnBrain(app, server, userId);
        if (r.ok) {
          const text =
            typeof r.result === "string" ? r.result : JSON.stringify(r.result ?? { ok: true });
          toast.success("Ejecutado en el cerebro", { id: t, description: text.slice(0, 160) });
        } else {
          toast.error("El cerebro no pudo ejecutar la app", { id: t, description: r.error });
        }
      } catch (err) {
        toast.error("No se pudo ejecutar en el cerebro", {
          id: t,
          description: (err as Error)?.message,
        });
      } finally {
        setRunningServerId(null);
      }
    },
    [app, userId, runningServerId],
  );

  // Adjuntar: copia la referencia de la app (para pegarla en una pizarra/publicación).
  const onAttach = useCallback(async () => {
    const ref = appShareRef(app);
    await copyText(JSON.stringify(ref), "Referencia de la app copiada");
  }, [app, copyText]);

  const addPlugin = useCallback(() => {
    const p = pluginDraft.trim();
    if (!p) return;
    setApp((prev) => ({
      ...prev,
      meta: { ...prev.meta, plugins: [...((prev.meta.plugins ?? []) as string[]), p] },
    }));
    setPluginDraft("");
  }, [pluginDraft]);

  const removePlugin = useCallback((idx: number) => {
    setApp((prev) => {
      const list = [...((prev.meta.plugins ?? []) as string[])];
      list.splice(idx, 1);
      return { ...prev, meta: { ...prev.meta, plugins: list } };
    });
  }, []);

  const openFullscreen = useCallback(() => {
    if (typeof window === "undefined") return;
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("El navegador bloqueó la ventana emergente");
      return;
    }
    w.document.open();
    w.document.write(srcDoc);
    w.document.close();
  }, [srcDoc]);

  const newProject = useCallback(() => {
    if (!window.confirm("¿Empezar un proyecto nuevo? Se perderán los cambios no guardados.")) return;
    const fresh = newApp("Nueva app");
    setApp(fresh);
    setActivePath(fresh.files[0]?.path ?? "");
    setSpec("");
    setPreviewKey((k) => k + 1);
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Render del árbol
  // ──────────────────────────────────────────────────────────────────────────

  const renderTree = (node: TreeNode, depth = 0): JSX.Element[] => {
    return node.children.flatMap((child) => {
      const pad = { paddingLeft: `${depth * 12 + 8}px` } as const;
      if (child.isDir) {
        const isOpen = !collapsed[child.path];
        return [
          <button
            key={`d:${child.path}`}
            onClick={() => setCollapsed((c) => ({ ...c, [child.path]: isOpen }))}
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-xs text-white/70 hover:bg-white/5"
            style={pad}
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <FolderTree className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
            <span className="truncate">{child.name}</span>
          </button>,
          ...(isOpen ? renderTree(child, depth + 1) : []),
        ];
      }
      const active = child.path === activePath;
      return [
        <div
          key={`f:${child.path}`}
          className={cn(
            "group flex items-center gap-1 rounded px-1 py-1 text-xs",
            active ? "bg-indigo-500/20 text-indigo-100" : "text-white/70 hover:bg-white/5",
          )}
          style={pad}
        >
          <button
            onClick={() => setActivePath(child.path)}
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
          >
            <FileCode2 className="h-3.5 w-3.5 shrink-0 text-sky-300/80" />
            <span className="truncate">{child.name}</span>
          </button>
          <button
            onClick={() => onRename(child.path)}
            title="Renombrar"
            className="opacity-0 transition group-hover:opacity-100 hover:text-amber-200"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => onDelete(child.path)}
            title="Eliminar"
            className="opacity-0 transition group-hover:opacity-100 hover:text-rose-300"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>,
      ];
    });
  };

  // ──────────────────────────────────────────────────────────────────────────
  // UI
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      {/* Barra de prompt (Astraura programa contigo) */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-50">
            <Sparkles className="h-4 w-4 text-amber-300" />
            Astraura programa contigo
          </div>
          <Badge variant="outline" className="border-white/15 text-[10px] text-white/60">
            {app.files.length} archivo{app.files.length === 1 ? "" : "s"}
          </Badge>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Input
              value={app.name}
              onChange={(e) => setApp((p) => ({ ...p, name: e.target.value }))}
              className="h-8 w-44 bg-black/30 text-xs"
              placeholder="Nombre de la app"
            />
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={newProject}>
              <Plus className="h-3.5 w-3.5" /> Nuevo
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={openList}>
              <FolderTree className="h-3.5 w-3.5" /> Mis apps
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="Describe tu app: «una calculadora de propinas con tema oscuro», «un to-do list en React con filtros», «una landing con formulario de contacto»…"
            className="min-h-[60px] flex-1 resize-y bg-black/30 text-sm"
          />
          <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
            {busy ? (
              <Button
                onClick={cancelGen}
                variant="outline"
                className="h-full min-h-[44px] flex-1 gap-2 border-rose-400/30 text-rose-200"
              >
                <X className="h-4 w-4" /> Cancelar
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => runGenerate("gen")}
                  className="h-full min-h-[44px] flex-1 gap-2 bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white hover:opacity-90"
                  disabled={!!busy}
                >
                  <Wand2 className="h-4 w-4" /> Generar
                </Button>
                <Button
                  onClick={() => runGenerate("refine")}
                  variant="outline"
                  className="h-full min-h-[44px] flex-1 gap-2 border-white/15 text-white/80"
                  disabled={!!busy}
                >
                  <RefreshCcw className="h-4 w-4" /> Refinar
                </Button>
              </>
            )}
          </div>
        </div>

        {hasProvider === false && (
          <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <Info className="mr-1 inline h-3.5 w-3.5" />
            No hay ningún proveedor de IA activado. Ve a{" "}
            <span className="font-semibold">Ajustes → IA &amp; Modelos</span> (Astraura AI) y activa
            uno (Ollama local o tu API). Mientras tanto puedes editar archivos y ver la vista previa.
          </div>
        )}
      </div>

      {/* Panel "Mis apps" */}
      {listOpen && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-white/70">Tus apps guardadas</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={refreshList}>
              <RefreshCcw className="mr-1 h-3 w-3" /> Recargar
            </Button>
          </div>
          {appList.length === 0 ? (
            <p className="py-3 text-center text-xs text-white/40">
              Aún no tienes apps guardadas. Genera una y pulsa <b>Guardar</b>.
            </p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {appList.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5"
                >
                  <button
                    onClick={() => onLoad(a.id)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-xs font-medium text-white/85">{a.name}</span>
                    <span className="truncate text-[10px] text-white/40">
                      {a.files.length} archivos {a.shared ? "· compartida" : ""}
                    </span>
                  </button>
                  <button
                    onClick={() => onDeleteApp(a.id)}
                    title="Eliminar"
                    className="text-white/40 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Cuerpo: árbol | editor | preview */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[210px_1fr_minmax(320px,42%)]">
        {/* Árbol de archivos */}
        <aside className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-white/70">
              <FolderTree className="h-3.5 w-3.5" /> Archivos
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-1">{renderTree(tree)}</div>
          <div className="border-t border-white/10 p-2">
            <div className="flex items-center gap-1">
              <Input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddFile()}
                placeholder="ruta/archivo.ext"
                className="h-7 bg-black/40 text-[11px]"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={onAddFile}
                title="Añadir archivo"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-white/35">
              <FolderPlus className="h-3 w-3" /> Usa «/» para crear folders.
            </p>
          </div>
        </aside>

        {/* Editor */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/40">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="flex items-center gap-2 truncate text-xs font-semibold text-white/80">
              <Code2 className="h-3.5 w-3.5 text-sky-300" />
              {activeFile ? activeFile.path : "—"}
            </span>
            {activeFile && (
              <Badge variant="outline" className="border-white/15 text-[10px] text-white/55">
                {activeFile.language || languageForPath(activeFile.path)}
              </Badge>
            )}
          </div>
          {activeFile ? (
            <textarea
              value={activeFile.content}
              onChange={(e) => onEdit(e.target.value)}
              spellCheck={false}
              wrap="off"
              className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[12.5px] leading-relaxed text-emerald-50/90 outline-none"
              placeholder="// El contenido del archivo aparecerá aquí"
            />
          ) : (
            <div className="grid flex-1 place-items-center text-xs text-white/40">
              Selecciona o crea un archivo
            </div>
          )}
        </section>

        {/* Preview */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Play className="h-3.5 w-3.5 text-emerald-300" /> Vista previa
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setPreviewKey((k) => k + 1)}
                title="Refrescar"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={openFullscreen}
                title="Abrir completo"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-b-2xl bg-white">
            <iframe
              key={previewKey}
              title="preview"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-modals allow-popups"
              className="h-full w-full border-0"
            />
          </div>
        </section>
      </div>

      {/* Barra inferior: acciones + plugins + honestidad */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-white/15 text-xs" onClick={onExport}>
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>

          <Button
            size="sm"
            className="h-8 gap-1.5 bg-gradient-to-br from-emerald-500 to-cyan-500 text-xs text-white hover:opacity-90"
            onClick={onDeploy}
            disabled={deploying}
            title="Desplegar la app en la red de StarSeed (/app/{id})"
          >
            {deploying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            Desplegar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-fuchsia-400/30 text-xs text-fuchsia-100"
            onClick={openBrainPicker}
            title="Ejecutar la app en un servidor de cerebro"
          >
            <BrainCircuit className="h-3.5 w-3.5" /> Ejecutar en cerebro
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-white/80"
            onClick={onAttach}
            title="Copiar referencia de la app para adjuntar a una pizarra o publicación"
          >
            <Link2 className="h-3.5 w-3.5" /> Adjuntar
          </Button>

          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1">
            <Share2 className="h-3.5 w-3.5 text-fuchsia-300" />
            <span className="text-[11px] text-white/70">Compartir</span>
            <Switch checked={!!app.shared} onCheckedChange={toggleShared} />
          </div>

          <Separator orientation="vertical" className="hidden h-6 bg-white/10 sm:block" />

          {/* Plugins / conexiones */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[11px] text-white/55">
              <Plug className="h-3.5 w-3.5 text-amber-300" /> Plugins / conexiones:
            </span>
            {plugins.length === 0 && (
              <span className="text-[11px] text-white/35">ninguno aún</span>
            )}
            {plugins.map((p, i) => (
              <Badge
                key={`${p}-${i}`}
                variant="outline"
                className="gap-1 border-white/15 text-[10px] text-white/75"
              >
                {p}
                <button onClick={() => removePlugin(i)} className="hover:text-rose-300">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            <Input
              value={pluginDraft}
              onChange={(e) => setPluginDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlugin()}
              placeholder="añadir (ej. supabase, stripe, mcp:filesystem)"
              className="h-7 w-52 bg-black/30 text-[11px]"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={addPlugin} title="Añadir plugin">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Enlace de la app desplegada (/app/{id}) */}
        {deployUrl && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
            <Rocket className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
            <span className="text-[11px] text-emerald-100">Desplegada en la red:</span>
            <code className="max-w-full truncate rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-emerald-50">
              {deployUrl}
            </code>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-[11px] text-emerald-100"
                onClick={() => copyText(appUrlFor(app.id), "Enlace copiado")}
              >
                <Copy className="h-3 w-3" /> Copiar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 border-emerald-400/30 text-[11px] text-emerald-100"
                onClick={() => {
                  if (typeof window !== "undefined") window.open(deployUrl, "_blank");
                }}
              >
                <ExternalLink className="h-3 w-3" /> Abrir app
              </Button>
            </div>
          </div>
        )}

        {/* Selector: ejecutar en cerebro */}
        {brainPickerOpen && (
          <div className="mt-2 rounded-xl border border-fuchsia-400/20 bg-black/30 p-3">
            <div className="mb-2 flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-fuchsia-300" />
              <span className="text-xs font-semibold text-white/80">Ejecutar en cerebro</span>
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto h-6 w-6 text-white/50"
                onClick={() => setBrainPickerOpen(false)}
                title="Cerrar"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {loadingBrains ? (
              <p className="flex items-center gap-2 py-2 text-xs text-white/50">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando cerebros…
              </p>
            ) : brains.length === 0 ? (
              <p className="py-2 text-xs text-white/40">
                No tienes cerebros aún. Crea uno en <b>Cerebros</b> y enlázale un servidor para poder
                ejecutar apps en él.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-white/55">Cerebro:</span>
                  {brains.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setPickBrainId(b.id)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px] transition",
                        b.id === pickBrainId
                          ? "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-50"
                          : "border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/5",
                      )}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-white/55">Servidor del cerebro:</span>
                  {brainServers.length === 0 ? (
                    <p className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-100">
                      Este cerebro no tiene servidores enlazados todavía. Añade o enlaza un servidor
                      (p.ej. tu servidor de cerebro local) en <b>Cerebros</b> para ejecutar la app.
                    </p>
                  ) : (
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {brainServers.map((srv) => (
                        <li
                          key={srv.id}
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5"
                        >
                          <Server className="h-3.5 w-3.5 shrink-0 text-cyan-300/80" />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-xs font-medium text-white/85">
                              {srv.name}
                            </span>
                            <span className="truncate text-[10px] text-white/40">
                              {String(srv.kind)}
                              {srv.endpoint ? ` · ${srv.endpoint}` : ""}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            className="h-7 gap-1 bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-[11px] text-white hover:opacity-90"
                            onClick={() => onRunOnBrain(srv)}
                            disabled={runningServerId != null}
                          >
                            {runningServerId === srv.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                            Ejecutar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-white/40">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  Honestidad: el servidor del cerebro decide qué hacer con la app (el servidor de
                  referencia simplemente la registra). El hospedaje ejecutable dentro de la red es la
                  ruta <code className="font-mono">/app/{app.id}</code> («Desplegar»).
                </p>
              </div>
            )}
          </div>
        )}

        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-white/40">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Honestidad: la vista previa se ejecuta en tu navegador (HTML/CSS/JS y React vía CDN). No
          es un IDE de servidor ni un deploy real — exporta el proyecto para ejecutarlo donde
          quieras. Los plugins/conexiones son la base para integraciones futuras de StarSeed.
        </p>
      </div>
    </div>
  );
}
