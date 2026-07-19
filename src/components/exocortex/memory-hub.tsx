"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRealtime } from "@/lib/realtime/realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Plus, Trash2, Wand2, Check, X, FileText, Download, Upload, Github, Save, Loader2, RefreshCw, Cloud, Link2, Link2Off, BookOpen, Boxes, HardDrive, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseWikilinks } from "@/lib/okf";
import Link from "next/link";
import { routeAndStore } from "@/lib/storage/route-memory";
import { getPolicy } from "@/lib/storage/backends";
import type { StoragePolicy } from "@/lib/storage/backends";
// NUEVO (aditivo): conectar un folder de memorias (memory root) en modo
// vista previa, sin tocar la cuenta. Ver architecture/memoria-cerebros-sync.md.
import { MemoryFolderConnect } from "@/components/exocortex/memory-folder-connect";
// Exocórtex × Aurora: lanzador compacto que abre la Aurora GLOBAL con el
// contexto de las memorias del usuario (sin instanciar una segunda Aurora).
import { AuroraMemoryPanel } from "@/components/exocortex/aurora-memory-panel";
// Subida universal de archivos (Adenda 64 §9): "Adjuntar archivo" en el editor
// de contenido de una memoria inserta un enlace markdown al archivo subido
// (coherente con el editor de texto — no hay una lista de adjuntos separada).
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";
// Cerebro-scope: cuando el Hub vive DENTRO de un cerebro, filtra por cerebro y
// permite adoptar memorias de la cuenta. Mismo componente para /memorias y para
// el pilar Memoria de /cerebro (sin duplicar código).
import {
  listBrainMemories,
  adoptMemoryToBrain,
  releaseMemoryFromBrain,
} from "@/lib/cerebro/brain-memories";
// Taxonomía cognitiva (filtro extra) + gestión inteligente (Organizar con IA).
import {
  COGNITIVE_KINDS,
  COGNITIVE_KIND_IDS,
  cognitiveKindOfKinds,
  type CognitiveKind,
} from "@/lib/brains/memory-types";
import {
  summarizeToMemory,
  classifyCognitiveKind,
  detectDuplicates,
  type DuplicateCluster,
} from "@/lib/cerebro/ai-organize";
import { Sparkles as SparklesIcon, Copy, Tag, Layers } from "lucide-react";

// El PAT ya NO se guarda en config: vive cifrado en la bóveda (api/vault).
type GithubConfig = { repo?: string; branch?: string; path?: string };
type MemoryConfig = { github?: GithubConfig } & Record<string, unknown>;

type Memory = {
  id: string; name: string; scope: string; scope_ref: string | null;
  kinds: string[]; format: string; storage: string[]; sync: boolean;
  config: MemoryConfig | null; content: string | null; created_at: string;
};

const BOT_ENDPOINT = "https://starseed-neurocortex.vercel.app/api/memory_github";
const VAULT_ENDPOINT = "https://starseed-neurocortex.vercel.app/api/vault";
const DRIVE_OAUTH_ENDPOINT = "https://starseed-neurocortex.vercel.app/api/drive_oauth";

const SCOPES: [string, string][] = [["account","Toda la cuenta"],["profile","Un perfil"],["page","Una página"],["group","Un grupo"],["chat","Un chat"],["message","Un mensaje"],["library","Biblioteca"],["database","Base de datos"]];
const KINDS: [string, string][] = [["soul","🪷 Alma"],["memory","🧠 Memoria"],["dream","🌙 Sueños"],["md","📝 Markdown"],["3d","🌐 3D"],["skills","✨ Skills"],["apis","🔌 APIs"],["mcp","🧩 MCP"],["plugins","🧱 Plugins"],["tokens","🔐 Tokens"],["connections","🔗 Conexiones"]];
const FORMATS: [string, string][] = [["markdown","Markdown (.md)"],["json","JSON"],["3d","Memoria 3D"],["mixed","Mixto"]];
const STORES: [string, string][] = [["account","Cuenta StarSeed"],["drive","Google Drive"],["obsidian","Obsidian"],["local","Local"],["github","GitHub (repo-memoria)"]];

// Etiquetas legibles para los backends de almacenamiento. Cubre el naming antiguo
// del Memory Hub (account/drive) y el del router multi-fuente (starseed/gdrive…).
const STORAGE_LABELS: Record<string, string> = {
  account: "StarSeed", starseed: "StarSeed",
  drive: "Drive", gdrive: "Drive",
  local: "Local", github: "GitHub", obsidian: "Obsidian",
  webdav: "WebDAV", s3: "S3", custom: "Personalizada",
};
function storageLabel(id: string): string { return STORAGE_LABELS[id] ?? id; }

type Preset = { key: string; icon: string; label: string; hint: string; kinds: string[]; format: string };
const PRESETS: Preset[] = [
  { key:"soul", icon:"🪷", label:"Alma", hint:"Quién eres, tu tono y valores", kinds:["soul"], format:"markdown" },
  { key:"memory", icon:"🧠", label:"Memoria", hint:"Hechos, preferencias, vínculos", kinds:["memory"], format:"markdown" },
  { key:"dream", icon:"🌙", label:"Sueños", hint:"Visión, objetivos, sueños", kinds:["dream"], format:"markdown" },
  { key:"caps", icon:"🧩", label:"Habilidades & conexiones", hint:"Skills, APIs, MCP, plugins, tokens, conexiones", kinds:["skills","apis","mcp","plugins","tokens","connections"], format:"json" },
  { key:"3d", icon:"🌐", label:"Memoria 3D", hint:"Grafo 3D de tu consciencia", kinds:["3d"], format:"3d" },
  { key:"custom", icon:"⚙️", label:"Personalizada", hint:"Tú eliges todo", kinds:[], format:"markdown" },
];

function slugify(s: string) {
  return (s || "memoria")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "memoria";
}

export function MemoryHub({
  brainId = null,
  brainName,
  focusMemoryId,
}: {
  /** Si se pasa, el Hub trabaja DENTRO de este cerebro (scope='brain'). */
  brainId?: string | null;
  brainName?: string;
  /** Abre automáticamente esta memoria al montar (clic en nodo 2D/3D). */
  focusMemoryId?: string | null;
} = {}) {
  const inBrain = brainId != null;
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Memory[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState(inBrain ? "brain" : "account");
  const [kinds, setKinds] = useState<string[]>([]);
  const [format, setFormat] = useState("markdown");
  const [storage, setStorage] = useState<string[]>(["account"]);
  const [sync, setSync] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filtro por categoría cognitiva (taxonomía de 8) — filtro extra del Hub.
  const [cogFilter, setCogFilter] = useState<CognitiveKind | null>(null);
  // "Organizar con IA": estado de las acciones inteligentes.
  const [organizing, setOrganizing] = useState<null | "resumir" | "clasificar" | "duplicados">(null);
  const [dupes, setDupes] = useState<DuplicateCluster[] | null>(null);
  // Adoptar de la cuenta (solo en modo cerebro).
  const [showAdopt, setShowAdopt] = useState(false);
  const [adoptable, setAdoptable] = useState<Memory[]>([]);

  // editor de contenido / sincronización
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingContent, setSavingContent] = useState(false);
  const [gh, setGh] = useState<GithubConfig>({ repo: "", branch: "main", path: "" });
  const [pat, setPat] = useState("");           // PAT en memoria (se guarda cifrado en la bóveda)
  const [savingGh, setSavingGh] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Enrutado a almacén (router multi-fuente): política + estado del botón "Guardar en almacén".
  const [policy, setPolicy] = useState<StoragePolicy>({});
  const [routing, setRouting] = useState(false);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null; setUserId(uid);
      if (uid) {
        if (inBrain) {
          // Modo cerebro: memorias con scope='brain'&scope_ref=brainId UNIÓN las
          // enlazadas en includes.memories[] del cerebro.
          const rows = await listBrainMemories(brainId);
          setItems(rows as unknown as Memory[]);
        } else {
          // Modo cuenta: memorias que NO están adoptadas por un cerebro.
          const { data } = await supabase.from("memories").select("*").eq("owner", uid).order("created_at", { ascending: false });
          setItems(((data as Memory[]) ?? []).filter((m) => m.scope !== "brain"));
        }
      }
    } catch { /* sin sesión */ }
  }, [inBrain, brainId]);
  useEffect(() => { load(); }, [load]);
  // TIEMPO REAL: la lista de memorias se actualiza en vivo entre dispositivos
  // cuando cambia la tabla `memories` del propietario actual (RLS aplica).
  useRealtime(
    "memories",
    { filter: userId ? `owner=eq.${userId}` : undefined },
    () => load(),
  );
  // Carga la política de almacenamiento (umbral starseedMaxMb, destino preferido…).
  useEffect(() => { getPolicy().then(setPolicy).catch(() => setPolicy({})); }, [userId]);

  // Abre automáticamente una memoria concreta (clic en nodo del grafo 2D/3D).
  useEffect(() => {
    if (!focusMemoryId) return;
    const m = items.find((x) => x.id === focusMemoryId);
    if (m && openId !== m.id) void openMemory(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMemoryId, items]);

  // Carga las memorias de cuenta ADOPTABLES cuando se abre el selector (modo cerebro).
  useEffect(() => {
    if (!showAdopt || !inBrain || !userId) return;
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("memories").select("*").eq("owner", userId).order("created_at", { ascending: false });
      if (!alive) return;
      const brainMemIds = new Set(items.map((m) => m.id));
      setAdoptable(((data as Memory[]) ?? []).filter((m) => !brainMemIds.has(m.id) && m.scope !== "brain"));
    })();
    return () => { alive = false; };
  }, [showAdopt, inBrain, userId, items]);

  // Contexto compacto de las memorias reales del usuario para pasárselo a la
  // Aurora global (para que pueda buscar/leer/actuar sobre ellas).
  const memoryContext = useMemo(() => {
    try {
      if (!items.length) return undefined;
      const lines = items
        .slice(0, 30)
        .map((m) => `- ${m.name} (${(m.kinds || []).join(", ") || "memoria"}) · ${(m.storage || []).map(storageLabel).join("/") || "StarSeed"}`)
        .join("\n");
      return `Mis memorias en StarSeed (${items.length}):\n${lines}`;
    } catch {
      return undefined;
    }
  }, [items]);

  // ── enrutar y guardar una memoria en el mejor almacén (router multi-fuente) ──
  async function storeToBackend(m: Memory, contentOverride?: string) {
    setRouting(true); setStatus(null);
    try {
      const res = await routeAndStore(
        {
          id: m.id,
          name: m.name,
          content: typeof contentOverride === "string" ? contentOverride : (m.id === openId ? draft : m.content),
          kinds: m.kinds,
          config: m.config ?? {},
          storage: m.storage ?? [],
        },
        { uid: userId, policy },
      );
      const where = res.backend ? storageLabel(res.backend) : "almacén";
      const msg = res.ok
        ? `Guardado en ${where}${res.link ? ` · ${res.link}` : ""}. ${res.detail}`
        : res.detail;
      setStatus({ kind: res.ok ? "ok" : "err", msg });
      await load();
      return res;
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "No se pudo enrutar la memoria." });
      return null;
    } finally {
      setRouting(false);
    }
  }

  // ── bóveda cifrada: helpers (api/vault) ──
  async function vaultGet(secretName: string): Promise<string> {
    try {
      const res = await fetch(VAULT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: userId, action: "get", name: secretName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && typeof data.value === "string") return data.value;
    } catch { /* sin secreto o bóveda no disponible */ }
    return "";
  }
  async function vaultSet(secretName: string, value: string): Promise<boolean> {
    try {
      const res = await fetch(VAULT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: userId, action: "set", name: secretName, value }),
      });
      const data = await res.json().catch(() => ({}));
      return res.ok && Boolean(data.ok);
    } catch { return false; }
  }

  function applyPreset(p: Preset) {
    setName(p.label); setKinds(p.kinds); setFormat(p.format);
    if (p.key !== "custom") { setScope("account"); setStorage(["account"]); setSync(true); }
    setCreating(true);
  }
  function toggle(arr: string[], v: string, set: (x: string[]) => void) {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }
  async function create() {
    if (!userId || !name.trim() || kinds.length === 0) return;
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.from("memories").insert({
        owner: userId,
        name: name.trim(),
        scope: inBrain ? "brain" : scope,
        scope_ref: inBrain ? brainId : null,
        kinds, format, storage, sync, content: "", config: {},
      });
      setCreating(false); setName(""); setKinds([]); setFormat("markdown"); setScope(inBrain ? "brain" : "account"); setStorage(["account"]); setSync(true);
      await load();
    } catch { /* error */ }
    setSaving(false);
  }
  async function remove(id: string) {
    try { const supabase = createClient(); await supabase.from("memories").delete().eq("id", id); if (openId === id) setOpenId(null); await load(); } catch { /* */ }
  }

  // ── abrir/cerrar el editor de una memoria ──
  async function openMemory(m: Memory) {
    if (openId === m.id) { setOpenId(null); return; }
    setOpenId(m.id);
    setDraft(m.content ?? "");
    setStatus(null);
    const cfg = (m.config?.github ?? {}) as GithubConfig;
    setGh({
      repo: cfg.repo ?? "",
      branch: cfg.branch ?? "main",
      path: cfg.path ?? `memorias/${slugify(m.name)}.md`,
    });
    // El PAT se recupera de la bóveda cifrada (si existe; si no, queda en blanco).
    setPat("");
    const stored = await vaultGet(`github:${m.id}`);
    if (stored) setPat(stored);
  }

  // ── guardar contenido markdown (sync real entre dispositivos vía la cuenta) ──
  async function saveContent(m: Memory) {
    setSavingContent(true); setStatus(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("memories").update({ content: draft }).eq("id", m.id);
      if (error) { setStatus({ kind: "err", msg: error.message }); setSavingContent(false); return; }
      setStatus({ kind: "ok", msg: "Contenido guardado y sincronizado en tu cuenta." });
      await load();
      // Si la memoria supera el umbral del servidor StarSeed, enruta automáticamente
      // al mejor almacén (p. ej. tu Google Drive) e informa dónde quedó.
      const maxMb = typeof policy.starseedMaxMb === "number" ? policy.starseedMaxMb : 5;
      const sizeMb = (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(draft ?? "").length : (draft ?? "").length) / (1024 * 1024);
      if (sizeMb > maxMb) {
        setSavingContent(false);
        setStatus({ kind: "ok", msg: `Memoria grande (${sizeMb.toFixed(2)} MB > ${maxMb} MB): enrutando al mejor almacén…` });
        await storeToBackend({ ...m, content: draft }, draft);
        return;
      }
    } catch (e) { setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Error al guardar" }); }
    setSavingContent(false);
  }

  // ── exportar el contenido como archivo .md ──
  function exportMd(m: Memory) {
    try {
      const blob = new Blob([draft ?? ""], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${slugify(m.name)}.md`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setStatus({ kind: "err", msg: e instanceof Error ? e.message : "No se pudo exportar" }); }
  }

  // ── importar un .md y volcarlo al editor ──
  function importMd(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDraft(String(reader.result ?? ""));
      setStatus({ kind: "ok", msg: `Importado "${file.name}". Pulsa "Guardar" para sincronizar.` });
    };
    reader.onerror = () => setStatus({ kind: "err", msg: "No se pudo leer el archivo." });
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── guardar config GitHub: repo/branch/path en memories.config; PAT cifrado en la bóveda ──
  async function saveGithubConfig(m: Memory) {
    setSavingGh(true); setStatus(null);
    try {
      const supabase = createClient();
      // Sólo se persisten repo/branch/path en config (nunca el token).
      const cleanGh: GithubConfig = { repo: gh.repo ?? "", branch: gh.branch ?? "main", path: gh.path ?? "" };
      const nextConfig: MemoryConfig = { ...(m.config ?? {}), github: cleanGh };
      const { error } = await supabase.from("memories").update({ config: nextConfig }).eq("id", m.id);
      if (error) { setStatus({ kind: "err", msg: error.message }); setSavingGh(false); return; }

      // El PAT se cifra en la bóveda (si se introdujo uno).
      let vaultMsg = "";
      if (pat.trim()) {
        const ok = await vaultSet(`github:${m.id}`, pat.trim());
        vaultMsg = ok ? " PAT cifrado en la bóveda." : " (No se pudo guardar el PAT en la bóveda.)";
      }
      setStatus({ kind: "ok", msg: `Configuración de GitHub guardada.${vaultMsg}` });
      await load();
    } catch (e) { setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Error al guardar config" }); }
    setSavingGh(false);
  }

  // ── sincronizar a GitHub vía el bot (action: push) — PAT desde la bóveda ──
  async function syncGithub(m: Memory) {
    if (!gh.repo) { setStatus({ kind: "err", msg: "Indica el repo (owner/repo)." }); return; }
    setSyncing(true); setStatus(null);
    try {
      // Recupera el PAT: usa el que esté en pantalla, o cae a la bóveda.
      let token = pat.trim();
      if (!token) token = await vaultGet(`github:${m.id}`);
      if (!token) {
        setStatus({ kind: "err", msg: "No hay PAT guardado. Introduce uno y pulsa \"Guardar config\"." });
        setSyncing(false); return;
      }
      const res = await fetch(BOT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: userId,
          repo: gh.repo,
          token,
          branch: gh.branch || "main",
          path: gh.path || `memorias/${slugify(m.name)}.md`,
          content: draft ?? "",
          action: "push",
        }),
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* respuesta no-JSON */ }
      if (res.ok && data.ok) {
        const url = typeof data.html_url === "string" ? data.html_url : "";
        setStatus({ kind: "ok", msg: `Sincronizado a GitHub${url ? ` · ${url}` : ""}` });
      } else {
        setStatus({ kind: "err", msg: `GitHub: ${String(data.error ?? `HTTP ${res.status}`)}` });
      }
    } catch (e) { setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Fallo al contactar el bot" }); }
    setSyncing(false);
  }

  // ── conectar Google Drive (abre el flujo OAuth del bot en otra pestaña) ──
  function connectDrive() {
    if (!userId) return;
    const url = `${DRIVE_OAUTH_ENDPOINT}?action=authorize&account_id=${encodeURIComponent(userId)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // ── Categoría cognitiva efectiva de una memoria (config.cognitiveKind gana) ──
  const cogOf = useCallback((m: Memory): CognitiveKind => {
    const c = (m.config as Record<string, unknown> | null)?.cognitiveKind;
    if (typeof c === "string" && (COGNITIVE_KIND_IDS as string[]).includes(c)) return c as CognitiveKind;
    return cognitiveKindOfKinds(m.kinds);
  }, []);

  const visibleItems = useMemo(
    () => (cogFilter ? items.filter((m) => cogOf(m) === cogFilter) : items),
    [items, cogFilter, cogOf],
  );

  // ── Organizar con IA (gestión inteligente · Adenda I2) ──
  async function aiSummarize() {
    setOrganizing("resumir");
    try {
      let text = "";
      try { text = await navigator.clipboard.readText(); } catch { /* sin permiso de portapapeles */ }
      if (!text.trim()) {
        const open = items.find((x) => x.id === openId);
        text = (openId ? draft : open?.content) ?? "";
      }
      if (!text.trim()) {
        setStatus({ kind: "err", msg: "Copia un chat/texto al portapapeles o abre una memoria, y vuelve a intentarlo." });
        setOrganizing(null); return;
      }
      const res = await summarizeToMemory(text);
      if (!res.ok) { setStatus({ kind: "err", msg: res.error || "No se pudo resumir." }); setOrganizing(null); return; }
      const supabase = createClient();
      await supabase.from("memories").insert({
        owner: userId, name: (res.title || "Resumen").slice(0, 120),
        scope: inBrain ? "brain" : "account", scope_ref: inBrain ? brainId : null,
        kinds: ["memory"], format: "markdown", storage: ["account"], sync: true,
        content: res.content, config: { aiSummary: true },
      });
      await load();
      setStatus({ kind: "ok", msg: res.usedAi ? `Resumen creado: «${res.title}».` : `Resumen LOCAL creado (sin IA): «${res.title}».` });
    } catch (e) { setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Error al resumir." }); }
    setOrganizing(null);
  }

  async function aiClassify() {
    setOrganizing("clasificar");
    try {
      const untyped = items.filter((m) => (!m.kinds || m.kinds.length === 0) && !(m.config as Record<string, unknown> | null)?.cognitiveKind);
      if (untyped.length === 0) { setStatus({ kind: "ok", msg: "Todas tus memorias ya están tipificadas." }); setOrganizing(null); return; }
      let done = 0;
      const supabase = createClient();
      for (const m of untyped.slice(0, 12)) {
        const { kind } = await classifyCognitiveKind(m.name, m.content ?? "");
        const nextConfig = { ...(m.config ?? {}), cognitiveKind: kind };
        await supabase.from("memories").update({ config: nextConfig }).eq("id", m.id);
        done++;
      }
      await load();
      setStatus({ kind: "ok", msg: `Clasificadas ${done} memoria(s) por categoría cognitiva.` });
    } catch (e) { setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Error al clasificar." }); }
    setOrganizing(null);
  }

  function aiDedupe() {
    setOrganizing("duplicados");
    try {
      const clusters = detectDuplicates(items.map((m) => ({ id: m.id, title: m.name, content: m.content })));
      setDupes(clusters);
      setStatus(
        clusters.length
          ? { kind: "ok", msg: `Detectados ${clusters.length} grupo(s) de posibles duplicados.` }
          : { kind: "ok", msg: "No se detectaron duplicados por título/enlaces." },
      );
    } catch { setDupes([]); }
    setOrganizing(null);
  }

  async function adopt(memoryId: string, move: boolean) {
    if (!brainId) return;
    const ok = await adoptMemoryToBrain(brainId, memoryId, { move });
    if (ok) { await load(); setStatus({ kind: "ok", msg: move ? "Memoria MOVIDA a este cerebro." : "Memoria ENLAZADA a este cerebro." }); }
    else setStatus({ kind: "err", msg: "No se pudo adoptar la memoria." });
  }
  async function release(memoryId: string) {
    if (!brainId) return;
    const ok = await releaseMemoryFromBrain(brainId, memoryId);
    if (ok) { await load(); setStatus({ kind: "ok", msg: "Memoria devuelta a la cuenta." }); }
  }

  if (!userId) {
    return <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 m-1">Inicia sesión para crear y sincronizar tus memorias de StarSeed.</div>;
  }

  return (
    <div className="space-y-5 p-1">
      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/15 p-4 flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center"><Brain className="w-5 h-5 text-white" /></div>
        <div>
          <div className="text-sm font-semibold text-fuchsia-50">
            {inBrain ? `Memory Hub · ${brainName || "cerebro"}` : "Memory Hub · memorias de StarSeed"}
          </div>
          <div className="text-[11px] text-fuchsia-300/60">
            {inBrain
              ? "Memorias de este cerebro (scope=cerebro + enlazadas). Crea, sincroniza y organiza con IA."
              : "Crea, configura y sincroniza tus memorias por contexto. Astraura te guía."}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <AuroraMemoryPanel compact memoryContext={memoryContext} />
          <Link href="/wiki" className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-500/20" title="Abrir la wiki OKF de tus baúles"><BookOpen className="w-3.5 h-3.5" /> Abrir wiki (OKF)</Link>
          <Button size="sm" className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white" onClick={() => setCreating((c) => !c)}><Plus className="w-4 h-4" /> Crear memoria</Button>
        </div>
      </div>

      {/* Organizar con IA (gestión inteligente) + adoptar de la cuenta (modo cerebro). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-fuchsia-300/50 flex items-center gap-1"><SparklesIcon className="w-3 h-3" /> Organizar con IA</span>
        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs border-fuchsia-400/30 text-fuchsia-100 hover:bg-fuchsia-900/20" disabled={organizing !== null} onClick={aiSummarize} title="Resume el texto del portapapeles (o la memoria abierta) en una memoria nueva.">
          {organizing === "resumir" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SparklesIcon className="w-3.5 h-3.5" />} Resumir a memoria
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs border-cyan-400/30 text-cyan-100 hover:bg-cyan-900/20" disabled={organizing !== null} onClick={aiClassify} title="Sugiere una categoría cognitiva para las memorias sin tipo.">
          {organizing === "clasificar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />} Clasificar sin tipo
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs border-amber-400/30 text-amber-100 hover:bg-amber-900/20" disabled={organizing !== null} onClick={aiDedupe} title="Detecta memorias posiblemente duplicadas por título y enlaces [[wiki]].">
          {organizing === "duplicados" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />} Detectar duplicados
        </Button>
        {inBrain && (
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs border-emerald-400/30 text-emerald-100 hover:bg-emerald-900/20 ml-auto" onClick={() => setShowAdopt((s) => !s)}>
            <Layers className="w-3.5 h-3.5" /> Adoptar de la cuenta
          </Button>
        )}
      </div>

      {/* Duplicados detectados */}
      {dupes && dupes.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-950/10 p-3 space-y-2">
          <div className="text-[11px] text-amber-200/90 flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> Posibles duplicados ({dupes.length} grupo/s) — revisa y fusiona a mano</div>
          {dupes.map((c, i) => (
            <div key={i} className="text-[11px] text-white/70 rounded-lg border border-white/10 bg-black/20 p-2">
              <span className="text-white/45">motivo: {c.reason} · similitud {(c.score * 100).toFixed(0)}%</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.titles.map((t, j) => (
                  <Badge key={j} variant="outline" className="text-[9px] border-amber-400/30 text-amber-100">{t}</Badge>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => setDupes(null)} className="text-[10px] text-white/40 hover:text-white/70">ocultar</button>
        </div>
      )}

      {/* Adoptar memorias de la cuenta al cerebro */}
      {inBrain && showAdopt && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/10 p-3 space-y-2">
          <div className="text-[11px] text-emerald-200/90 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Memorias de la cuenta ({adoptable.length}) — enlázalas o muévelas a este cerebro</div>
          {adoptable.length === 0 ? (
            <p className="text-[11px] text-white/40">No hay memorias de cuenta libres para adoptar.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {adoptable.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
                  <FileText className="w-3.5 h-3.5 text-fuchsia-300/70 shrink-0" />
                  <span className="text-xs text-white/80 truncate flex-1">{m.name}</span>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-cyan-400/30 text-cyan-100" onClick={() => adopt(m.id, false)} title="Enlazar (se referencia; sigue en la cuenta)">Enlazar</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-emerald-400/30 text-emerald-100" onClick={() => adopt(m.id, true)} title="Mover al cerebro (scope=cerebro)">Mover</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filtro por categoría cognitiva (taxonomía de 8) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-white/40 flex items-center gap-1"><Layers className="w-3 h-3" /> Cognitiva:</span>
        <button onClick={() => setCogFilter(null)} className={cn("text-[10px] rounded-full px-2 py-0.5 border transition", cogFilter === null ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/55 hover:border-white/20")}>Todas</button>
        {COGNITIVE_KIND_IDS.map((k) => (
          <button
            key={k}
            onClick={() => setCogFilter((cur) => (cur === k ? null : k))}
            className={cn("text-[10px] rounded-full px-2 py-0.5 border transition", cogFilter === k ? "text-white" : "text-white/55 hover:text-white/80")}
            style={cogFilter === k ? { background: COGNITIVE_KINDS[k].color + "33", borderColor: COGNITIVE_KINDS[k].color + "88" } : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}
            title={COGNITIVE_KINDS[k].blurb}
          >
            {COGNITIVE_KINDS[k].label}
          </button>
        ))}
      </div>

      {/* Conectar folder de memorias (memory root → cerebro), con importación real
          a brain_memory_files cuando hay cerebro (Adenda I2 · tarea 5). */}
      <MemoryFolderConnect brainId={brainId} brainName={brainName} onImported={load} />

      <div>
        <div className="text-[11px] uppercase tracking-widest text-fuchsia-300/50 mb-2 flex items-center gap-1"><Wand2 className="w-3 h-3" /> Empieza fácil — elige un tipo</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => applyPreset(p)} className="text-left rounded-lg border border-white/10 bg-white/5 hover:border-fuchsia-400/40 hover:bg-fuchsia-900/15 p-3 transition">
              <div className="text-base">{p.icon} <span className="text-sm font-medium text-white">{p.label}</span></div>
              <div className="text-[10px] text-white/45 mt-0.5">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {creating && (
        <div className="rounded-xl border border-fuchsia-500/20 bg-black/30 p-4 space-y-3">
          <div className="flex items-center justify-between"><div className="text-sm font-semibold text-fuchsia-50">Nueva memoria</div><button onClick={() => setCreating(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button></div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la memoria" className="bg-white/5" />
          <div>
            <div className="text-[11px] text-white/50 mb-1">Contenido (qué guarda)</div>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map(([v, l]) => <button key={v} onClick={() => toggle(kinds, v, setKinds)} className={cn("text-[11px] rounded-full px-2.5 py-1 border transition", kinds.includes(v) ? "bg-fuchsia-600/30 border-fuchsia-400/50 text-white" : "bg-white/5 border-white/10 text-white/60 hover:border-fuchsia-400/30")}>{l}</button>)}
            </div>
            {kinds.includes("tokens") && <div className="text-[10px] text-amber-300/70 mt-1">🔐 Los tokens se guardarán cifrados (bóveda segura), nunca en texto plano.</div>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[11px] text-white/50">Contexto
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">{SCOPES.map(([v, l]) => <option key={v} value={v} className="bg-zinc-900">{l}</option>)}</select>
            </label>
            <label className="text-[11px] text-white/50">Formato
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">{FORMATS.map(([v, l]) => <option key={v} value={v} className="bg-zinc-900">{l}</option>)}</select>
            </label>
          </div>
          <div>
            <div className="text-[11px] text-white/50 mb-1">Almacenamiento (multi · auto-sync entre dispositivos)</div>
            <div className="flex flex-wrap gap-1.5">
              {STORES.map(([v, l]) => <button key={v} onClick={() => toggle(storage, v, setStorage)} className={cn("text-[11px] rounded-full px-2.5 py-1 border transition", storage.includes(v) ? "bg-cyan-600/25 border-cyan-400/50 text-white" : "bg-white/5 border-white/10 text-white/60 hover:border-cyan-400/30")}>{l}</button>)}
            </div>
            {storage.some((s) => s !== "account") && <div className="text-[10px] text-cyan-300/60 mt-1">GitHub ya se puede sincronizar desde cada memoria; Google Drive se conecta por OAuth; Obsidian se sincroniza apuntando un repo de GitHub a tu bóveda. Por ahora se guarda tu preferencia.</div>}
          </div>
          <div className="flex items-center gap-2"><Switch checked={sync} onCheckedChange={setSync} /><span className="text-xs text-white/70">Sincronización automática en toda la cuenta y dispositivos</span></div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-500" disabled={saving || !name.trim() || kinds.length === 0} onClick={create}><Check className="w-4 h-4" /> Crear</Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-widest text-fuchsia-300/50 mb-2">
          {inBrain ? "Memorias del cerebro" : "Tus memorias"}
          {cogFilter && <span className="ml-2 text-white/40 normal-case tracking-normal">· filtro: {COGNITIVE_KINDS[cogFilter].label} ({visibleItems.length})</span>}
        </div>
        {items.length === 0 ? (
          <div className="text-sm text-white/40 px-1">Aún no tienes memorias{inBrain ? " en este cerebro" : ""}. Elige un tipo arriba para empezar — Astraura sugiere la configuración más simple.</div>
        ) : visibleItems.length === 0 ? (
          <div className="text-sm text-white/40 px-1">Ninguna memoria en la categoría «{cogFilter ? COGNITIVE_KINDS[cogFilter].label : ""}». <button onClick={() => setCogFilter(null)} className="text-fuchsia-300 hover:underline">Ver todas</button>.</div>
        ) : (
          <div className="space-y-2">
            {visibleItems.map((m) => (
              <div key={m.id} className="rounded-lg border border-white/10 bg-white/5">
                <div className="p-3 flex items-start gap-3">
                  <button onClick={() => openMemory(m)} className="flex-1 min-w-0 text-left group">
                    <div className="text-sm font-medium text-white group-hover:text-fuchsia-200 transition flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-fuchsia-300/70" /> {m.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {m.kinds.map((k) => <Badge key={k} variant="outline" className="text-[9px] border-fuchsia-500/30 text-fuchsia-200/80">{(KINDS.find((x) => x[0] === k) || [k, k])[1]}</Badge>)}
                      <Badge variant="outline" className="text-[9px]" style={{ borderColor: COGNITIVE_KINDS[cogOf(m)].color + "66", color: COGNITIVE_KINDS[cogOf(m)].color }} title={COGNITIVE_KINDS[cogOf(m)].blurb}>{COGNITIVE_KINDS[cogOf(m)].label}</Badge>
                      {inBrain && (m.scope === "brain"
                        ? <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-200/80">cerebro</Badge>
                        : <Badge variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-200/80">enlazada</Badge>)}
                    </div>
                    <div className="text-[10px] text-white/40 mt-1">{(SCOPES.find((x) => x[0] === m.scope) || ["", m.scope])[1]} · {m.format} · {m.sync ? "sync ✓" : "sin sync"}</div>
                    {/* Insignias de almacén: dónde vive realmente esta memoria + enlace a Drive si existe. */}
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {(m.storage && m.storage.length ? m.storage : ["account"]).map((s) => (
                        <Badge key={s} variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-200/80 inline-flex items-center gap-1">
                          {s === "drive" || s === "gdrive" ? <Cloud className="w-2.5 h-2.5" /> : s === "local" ? <HardDrive className="w-2.5 h-2.5" /> : s === "github" ? <Github className="w-2.5 h-2.5" /> : <Boxes className="w-2.5 h-2.5" />}
                          {storageLabel(s)}
                        </Badge>
                      ))}
                      {(() => {
                        const link = (m.config?.drive as { link?: string } | undefined)?.link;
                        return link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[9px] inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200 hover:bg-emerald-500/20" title="Abrir en Google Drive">
                            <ExternalLink className="w-2.5 h-2.5" /> Abrir en Drive
                          </a>
                        ) : null;
                      })()}
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {inBrain && (
                      <button onClick={() => release(m.id)} className="text-white/30 hover:text-emerald-300" title="Soltar del cerebro (vuelve a la cuenta)"><Link2Off className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => remove(m.id)} className="text-white/30 hover:text-red-400" title="Eliminar memoria"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                {openId === m.id && (
                  <div className="border-t border-white/10 p-3 space-y-3">
                    {/* Editor de contenido markdown (sincroniza entre dispositivos vía la cuenta) */}
                    <div>
                      <div className="text-[11px] text-white/50 mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Contenido (markdown · sincroniza entre dispositivos vía tu cuenta)</div>
                      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`# ${m.name}\n\nEscribe aquí el contenido de esta memoria…`} className="bg-black/40 border-white/10 text-xs font-mono min-h-[160px]" />
                      {/* Enlaces [[…]] vivos: conexiones neuronales hacia otras memorias por nombre */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-white/40 flex items-center gap-1"><Link2 className="w-3 h-3" /> Enlaces [[…]]:</span>
                        {parseWikilinks(draft).length === 0 ? (
                          <span className="text-[10px] text-white/30">sin enlaces — usa [[Nombre]] para conectar memorias</span>
                        ) : (
                          parseWikilinks(draft).map((nm) => {
                            const exists = items.some((it) => (it.name || "").trim().toLowerCase() === nm.trim().toLowerCase());
                            return (
                              <span key={nm} className={cn("text-[10px] rounded-full px-2 py-0.5 border flex items-center gap-1", exists ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-amber-400/40 bg-amber-500/10 text-amber-200")} title={exists ? "Existe una memoria con ese nombre" : "Aún no existe esa memoria"}>
                                {exists ? <Link2 className="w-2.5 h-2.5" /> : <Link2Off className="w-2.5 h-2.5" />}[[{nm}]]
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500" disabled={savingContent} onClick={() => saveContent(m)}>{savingContent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 border-emerald-400/30 text-emerald-100 hover:bg-emerald-900/20" disabled={routing || savingContent} onClick={() => storeToBackend(m)} title="Enruta esta memoria al mejor almacén (StarSeed, Google Drive, GitHub o local) según su tamaño y tu política.">{routing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Boxes className="w-3.5 h-3.5" />} Guardar en almacén</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 border-cyan-400/30 text-cyan-100 hover:bg-cyan-900/20" onClick={() => exportMd(m)}><Download className="w-3.5 h-3.5" /> Exportar .md</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 border-cyan-400/30 text-cyan-100 hover:bg-cyan-900/20" onClick={() => fileRef.current?.click()}><Upload className="w-3.5 h-3.5" /> Importar .md</Button>
                      <input ref={fileRef} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={(e) => importMd(e.target.files?.[0] ?? null)} />
                      <AttachFilePickerButton
                        onPick={(picked: UniversalAttachment[]) => {
                          const links = picked
                            .filter((a) => !!a.url)
                            .map((a) => (a.kind === "image" ? `![${a.name || "imagen"}](${a.url})` : `[${a.name || "archivo"}](${a.url})`))
                            .join("\n");
                          if (links) setDraft((d) => (d ? `${d}\n\n${links}\n` : `${links}\n`));
                        }}
                        folder="memorias"
                        title="Adjuntar archivo a esta memoria"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-400/30 bg-transparent px-3 text-xs font-medium text-violet-100 hover:bg-violet-900/20"
                      >
                        <Upload className="w-3.5 h-3.5" /> Adjuntar archivo
                      </AttachFilePickerButton>
                    </div>

                    {/* Sincronización a GitHub (solo si storage incluye github) */}
                    {(m.storage || []).includes("github") && (
                      <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
                        <div className="text-[11px] text-white/60 flex items-center gap-1.5"><Github className="w-3.5 h-3.5" /> Sincronizar con GitHub (repo-memoria)</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="text-[10px] text-white/50">Repositorio (owner/repo)
                            <Input value={gh.repo ?? ""} onChange={(e) => setGh((g) => ({ ...g, repo: e.target.value }))} placeholder="usuario/mi-repo-memoria" className="mt-1 bg-white/5 text-xs h-8" />
                          </label>
                          <label className="text-[10px] text-white/50">Rama
                            <Input value={gh.branch ?? ""} onChange={(e) => setGh((g) => ({ ...g, branch: e.target.value }))} placeholder="main" className="mt-1 bg-white/5 text-xs h-8" />
                          </label>
                          <label className="text-[10px] text-white/50">Ruta del archivo
                            <Input value={gh.path ?? ""} onChange={(e) => setGh((g) => ({ ...g, path: e.target.value }))} placeholder={`memorias/${slugify(m.name)}.md`} className="mt-1 bg-white/5 text-xs h-8" />
                          </label>
                          <label className="text-[10px] text-white/50">PAT de GitHub
                            <Input type="password" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="ghp_…" className="mt-1 bg-white/5 text-xs h-8" />
                          </label>
                        </div>
                        <div className="text-[10px] text-emerald-300/70">🔐 El PAT se cifra y se guarda en tu bóveda segura (no en texto plano).</div>
                        <div className="flex flex-wrap gap-2 pt-0.5">
                          <Button size="sm" variant="outline" className="gap-1.5 border-white/15 text-white/80 hover:bg-white/10" disabled={savingGh} onClick={() => saveGithubConfig(m)}>{savingGh ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar config</Button>
                          <Button size="sm" className="gap-1.5 bg-cyan-600 hover:bg-cyan-500" disabled={syncing} onClick={() => syncGithub(m)}>{syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sincronizar a GitHub</Button>
                        </div>
                      </div>
                    )}

                    {/* Google Drive: conexión OAuth vía el bot */}
                    {(m.storage || []).includes("drive") && (
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
                        <div className="text-[11px] text-white/60 flex items-center gap-1.5"><Cloud className="w-3.5 h-3.5 text-cyan-300/70" /> Google Drive</div>
                        <Button size="sm" variant="outline" className="gap-1.5 border-cyan-400/30 text-cyan-100 hover:bg-cyan-900/20" onClick={connectDrive}><Cloud className="w-3.5 h-3.5" /> Conectar Google Drive</Button>
                        <div className="text-[10px] text-amber-300/70">Requiere configurar la app OAuth de Google (GOOGLE_OAUTH_CLIENT_ID/SECRET en el bot). Se abrirá en otra pestaña.</div>
                      </div>
                    )}

                    {/* Obsidian: vía repo de GitHub o exportación .md */}
                    {(m.storage || []).includes("obsidian") && (
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-[11px] text-white/55 flex items-start gap-2">
                        <Cloud className="w-3.5 h-3.5 mt-0.5 text-cyan-300/70 shrink-0" />
                        <span>Obsidian: apunta un repo de GitHub a tu bóveda Obsidian (usa el almacenamiento GitHub) o usa Exportar .md.</span>
                      </div>
                    )}

                    {status && (
                      <div className={cn("text-[11px] rounded px-2 py-1.5 break-words", status.kind === "ok" ? "bg-emerald-900/30 text-emerald-200 border border-emerald-500/30" : "bg-red-900/30 text-red-200 border border-red-500/30")}>{status.msg}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MemoryHub;
