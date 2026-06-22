"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Plus, Trash2, Wand2, Check, X, FileText, Download, Upload, Github, Save, Loader2, RefreshCw, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function MemoryHub() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Memory[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("account");
  const [kinds, setKinds] = useState<string[]>([]);
  const [format, setFormat] = useState("markdown");
  const [storage, setStorage] = useState<string[]>(["account"]);
  const [sync, setSync] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null; setUserId(uid);
      if (uid) {
        const { data } = await supabase.from("memories").select("*").eq("owner", uid).order("created_at", { ascending: false });
        setItems((data as Memory[]) ?? []);
      }
    } catch { /* sin sesión */ }
  }, []);
  useEffect(() => { load(); }, [load]);

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
      await supabase.from("memories").insert({ owner: userId, name: name.trim(), scope, kinds, format, storage, sync, content: "", config: {} });
      setCreating(false); setName(""); setKinds([]); setFormat("markdown"); setScope("account"); setStorage(["account"]); setSync(true);
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
      if (error) { setStatus({ kind: "err", msg: error.message }); }
      else { setStatus({ kind: "ok", msg: "Contenido guardado y sincronizado en tu cuenta." }); await load(); }
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

  if (!userId) {
    return <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 m-1">Inicia sesión para crear y sincronizar tus memorias de StarSeed.</div>;
  }

  return (
    <div className="space-y-5 p-1">
      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/15 p-4 flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center"><Brain className="w-5 h-5 text-white" /></div>
        <div>
          <div className="text-sm font-semibold text-fuchsia-50">Memory Hub · memorias de StarSeed</div>
          <div className="text-[11px] text-fuchsia-300/60">Crea, configura y sincroniza tus memorias por contexto. Astraura te guía.</div>
        </div>
        <Button size="sm" className="ml-auto gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white" onClick={() => setCreating((c) => !c)}><Plus className="w-4 h-4" /> Crear memoria</Button>
      </div>

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
        <div className="text-[11px] uppercase tracking-widest text-fuchsia-300/50 mb-2">Tus memorias</div>
        {items.length === 0 ? (
          <div className="text-sm text-white/40 px-1">Aún no tienes memorias. Elige un tipo arriba para empezar — Astraura sugiere la configuración más simple.</div>
        ) : (
          <div className="space-y-2">
            {items.map((m) => (
              <div key={m.id} className="rounded-lg border border-white/10 bg-white/5">
                <div className="p-3 flex items-start gap-3">
                  <button onClick={() => openMemory(m)} className="flex-1 min-w-0 text-left group">
                    <div className="text-sm font-medium text-white group-hover:text-fuchsia-200 transition flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-fuchsia-300/70" /> {m.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1">{m.kinds.map((k) => <Badge key={k} variant="outline" className="text-[9px] border-fuchsia-500/30 text-fuchsia-200/80">{(KINDS.find((x) => x[0] === k) || [k, k])[1]}</Badge>)}</div>
                    <div className="text-[10px] text-white/40 mt-1">{(SCOPES.find((x) => x[0] === m.scope) || ["", m.scope])[1]} · {m.format} · {(m.storage || []).join(", ")} · {m.sync ? "sync ✓" : "sin sync"}</div>
                  </button>
                  <button onClick={() => remove(m.id)} className="text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>

                {openId === m.id && (
                  <div className="border-t border-white/10 p-3 space-y-3">
                    {/* Editor de contenido markdown (sincroniza entre dispositivos vía la cuenta) */}
                    <div>
                      <div className="text-[11px] text-white/50 mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Contenido (markdown · sincroniza entre dispositivos vía tu cuenta)</div>
                      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`# ${m.name}\n\nEscribe aquí el contenido de esta memoria…`} className="bg-black/40 border-white/10 text-xs font-mono min-h-[160px]" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500" disabled={savingContent} onClick={() => saveContent(m)}>{savingContent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 border-cyan-400/30 text-cyan-100 hover:bg-cyan-900/20" onClick={() => exportMd(m)}><Download className="w-3.5 h-3.5" /> Exportar .md</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 border-cyan-400/30 text-cyan-100 hover:bg-cyan-900/20" onClick={() => fileRef.current?.click()}><Upload className="w-3.5 h-3.5" /> Importar .md</Button>
                      <input ref={fileRef} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={(e) => importMd(e.target.files?.[0] ?? null)} />
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
