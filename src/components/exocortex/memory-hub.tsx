"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Brain, Plus, Trash2, Wand2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Memory = {
  id: string; name: string; scope: string; scope_ref: string | null;
  kinds: string[]; format: string; storage: string[]; sync: boolean; created_at: string;
};

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
      await supabase.from("memories").insert({ owner: userId, name: name.trim(), scope, kinds, format, storage, sync });
      setCreating(false); setName(""); setKinds([]); setFormat("markdown"); setScope("account"); setStorage(["account"]); setSync(true);
      await load();
    } catch { /* error */ }
    setSaving(false);
  }
  async function remove(id: string) {
    try { const supabase = createClient(); await supabase.from("memories").delete().eq("id", id); await load(); } catch { /* */ }
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
            {storage.some((s) => s !== "account") && <div className="text-[10px] text-cyan-300/60 mt-1">La conexión real con Drive/Obsidian/GitHub se activa en la siguiente fase; por ahora se guarda tu preferencia.</div>}
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
              <div key={m.id} className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{m.name}</div>
                  <div className="flex flex-wrap gap-1 mt-1">{m.kinds.map((k) => <Badge key={k} variant="outline" className="text-[9px] border-fuchsia-500/30 text-fuchsia-200/80">{(KINDS.find((x) => x[0] === k) || [k, k])[1]}</Badge>)}</div>
                  <div className="text-[10px] text-white/40 mt-1">{(SCOPES.find((x) => x[0] === m.scope) || ["", m.scope])[1]} · {m.format} · {(m.storage || []).join(", ")} · {m.sync ? "sync ✓" : "sin sync"}</div>
                </div>
                <button onClick={() => remove(m.id)} className="text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MemoryHub;
