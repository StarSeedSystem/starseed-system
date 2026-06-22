"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Archive, Plus, Trash2, Download, Upload, Link2, Check, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Vault = { id: string; name: string; scope: string; scope_ref: string | null; connections: Record<string, unknown>; preferences: Record<string, unknown>; created_at: string };
type Mem = { id: string; name: string; kinds: string[]; vault_id: string | null };

const KICON: Record<string, string> = { soul: "🪷", memory: "🧠", dream: "🌙", md: "📝", "3d": "🌐", skills: "✨", apis: "🔌", mcp: "🧩", plugins: "🧱", tokens: "🔐", connections: "🔗" };
const CONNS: [string, string, string][] = [
  ["syncthing", "Syncthing", "/sincronizacion"],
  ["vps", "Agente VPS", "/agent"],
  ["drive", "Google Drive", "https://starseed-neurocortex.vercel.app/api/drive_oauth?action=authorize"],
  ["vpn", "VPN / no-local", ""],
];

export function VaultsPanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [mems, setMems] = useState<Mem[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const sb = createClient();
      const { data: au } = await sb.auth.getUser(); const uid = au?.user?.id ?? null; setUserId(uid);
      if (uid) {
        const { data: v } = await sb.from("vaults").select("*").eq("owner", uid).order("created_at", { ascending: false });
        setVaults((v as Vault[]) ?? []);
        const { data: m } = await sb.from("memories").select("id,name,kinds,vault_id").eq("owner", uid).order("created_at", { ascending: false });
        setMems((m as Mem[]) ?? []);
      }
    } catch { /* */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  function toggleSel(id: string) { setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  async function createVault() {
    if (!userId || !newName.trim()) return; setBusy(true);
    try { const sb = createClient(); await sb.from("vaults").insert({ owner: userId, name: newName.trim() }); setNewName(""); await load(); } catch { /* */ }
    setBusy(false);
  }
  async function removeVault(id: string) {
    try { const sb = createClient(); await sb.from("memories").update({ vault_id: null }).eq("vault_id", id); await sb.from("vaults").delete().eq("id", id); await load(); } catch { /* */ }
  }
  async function assign(memId: string, vaultId: string | null) {
    try { const sb = createClient(); await sb.from("memories").update({ vault_id: vaultId }).eq("id", memId); await load(); } catch { /* */ }
  }
  async function saveConn(v: Vault, key: string, val: boolean | string) {
    try { const sb = createClient(); const c = { ...(v.connections || {}), [key]: val }; await sb.from("vaults").update({ connections: c }).eq("id", v.id); await load(); } catch { /* */ }
  }
  async function exportSel() {
    const ids = sel.size ? [...sel] : vaults.map((v) => v.id);
    const sb = createClient();
    const bundle: { exported: string; vaults: unknown[] } = { exported: new Date().toISOString(), vaults: [] };
    for (const v of vaults.filter((x) => ids.includes(x.id))) {
      const { data } = await sb.from("memories").select("name,kinds,format,storage,content,config,scope").eq("vault_id", v.id);
      bundle.vaults.push({ name: v.name, scope: v.scope, connections: v.connections, preferences: v.preferences, memories: data || [] });
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "starseed-baules.json"; a.click();
  }
  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f || !userId) return;
    try {
      const bundle = JSON.parse(await f.text());
      const sb = createClient();
      for (const v of (bundle.vaults || [])) {
        const { data: nv } = await sb.from("vaults").insert({ owner: userId, name: v.name || "Baúl importado", connections: v.connections || {}, preferences: v.preferences || {} }).select("id").single();
        const vid = (nv as { id: string } | null)?.id;
        for (const m of (v.memories || [])) {
          await sb.from("memories").insert({ owner: userId, vault_id: vid, name: m.name || "Memoria", kinds: m.kinds || [], format: m.format || "markdown", storage: m.storage || ["account"], content: m.content || "", config: m.config || {}, scope: m.scope || "account" });
        }
      }
      await load();
    } catch { /* */ }
    e.target.value = "";
  }

  if (!userId) return <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 m-1">Inicia sesión para administrar tus baúles de memorias.</div>;

  const unassigned = mems.filter((m) => !m.vault_id);

  return (
    <div className="space-y-5 p-1">
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-fuchsia-500 flex items-center justify-center"><Archive className="w-5 h-5 text-white" /></div>
        <div>
          <div className="text-sm font-semibold text-amber-50">Baúles · bundles de memorias y conexiones</div>
          <div className="text-[11px] text-amber-300/60">Agrupa memorias de todo tipo (soul/memory/dream/skills…) + conexiones (Syncthing, VPS, Drive, VPN) y ajustes. Selecciona uno o varios.</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-2 border-amber-500/30 text-amber-100" onClick={exportSel}><Download className="w-4 h-4" /> Exportar{sel.size ? ` (${sel.size})` : " todo"}</Button>
          <label><input type="file" accept="application/json" className="hidden" onChange={importFile} /><span className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 text-amber-100 text-sm px-3 py-1.5 cursor-pointer hover:bg-amber-500/10"><Upload className="w-4 h-4" /> Importar</span></label>
        </div>
      </div>

      <div className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createVault()} placeholder="Nombre del baúl (p. ej. Trabajo, Personal, Proyecto X)" className="bg-white/5" />
        <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-500 text-white shrink-0" disabled={busy || !newName.trim()} onClick={createVault}><Plus className="w-4 h-4" /> Crear baúl</Button>
      </div>

      {vaults.length === 0 ? (
        <div className="text-sm text-white/40 px-1">Aún no tienes baúles. Crea uno y agrupa en él tus memorias y conexiones.</div>
      ) : (
        <div className="space-y-2">
          {vaults.map((v) => {
            const vmems = mems.filter((m) => m.vault_id === v.id);
            const open = openId === v.id;
            const conns = (v.connections || {}) as Record<string, unknown>;
            return (
              <div key={v.id} className={cn("rounded-xl border bg-white/5 p-3", sel.has(v.id) ? "border-amber-400/50" : "border-white/10")}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={sel.has(v.id)} onChange={() => toggleSel(v.id)} className="accent-amber-500" />
                  <button onClick={() => setOpenId(open ? null : v.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    {open ? <ChevronDown className="w-4 h-4 text-amber-300/60" /> : <ChevronRight className="w-4 h-4 text-amber-300/60" />}
                    <Archive className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium text-amber-50 truncate">{v.name}</span>
                    <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-200/70">{vmems.length} mem.</Badge>
                  </button>
                  <button onClick={() => removeVault(v.id)} className="text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>

                {open && (
                  <div className="mt-3 pl-6 space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-amber-300/50 mb-1">Memorias del baúl</div>
                      {vmems.length === 0 ? <div className="text-[11px] text-white/40">Vacío. Agrupa memorias abajo.</div> : (
                        <div className="flex flex-wrap gap-1.5">{vmems.map((m) => (
                          <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white/80">
                            {(m.kinds || []).slice(0, 3).map((k) => KICON[k] || "•").join("")} {m.name}
                            <button onClick={() => assign(m.id, null)} className="text-white/30 hover:text-red-400 ml-1">×</button>
                          </span>
                        ))}</div>
                      )}
                    </div>
                    {unassigned.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-amber-300/50 mb-1">Agrupar (sin baúl)</div>
                        <div className="flex flex-wrap gap-1.5">{unassigned.map((m) => (
                          <button key={m.id} onClick={() => assign(m.id, v.id)} className="inline-flex items-center gap-1 rounded-full bg-amber-600/15 border border-amber-500/20 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-600/30">
                            <Plus className="w-3 h-3" />{(m.kinds || []).slice(0, 2).map((k) => KICON[k] || "•").join("")} {m.name}
                          </button>
                        ))}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-amber-300/50 mb-1">Conexiones & ajustes</div>
                      <div className="flex flex-wrap gap-1.5">
                        {CONNS.map(([key, label, href]) => {
                          const on = !!conns[key];
                          return (
                            <div key={key} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                              <button onClick={() => saveConn(v, key, !on)} className={cn("inline-flex items-center gap-1 text-[11px]", on ? "text-emerald-300" : "text-white/50")}>
                                {on ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 inline-block rounded-full border border-white/30" />} {label}
                              </button>
                              {href && <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400/60 hover:text-cyan-300" title="Conectar"><Link2 className="w-3 h-3" /></a>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-white/35 mt-1">Activa una conexión y pulsa el enlace para configurarla. Las claves van cifradas a tu bóveda.</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default VaultsPanel;
