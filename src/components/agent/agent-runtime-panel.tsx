"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check, X, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Runtime = { id: string; name: string; mode: string; devices: { name: string }[]; vps: Record<string, string>; agents: string[]; enabled: boolean; created_at: string };

const MODES: [string, string, string][] = [
  ["local", "💻 Este dispositivo", "El agente corre aquí, en tu equipo/navegador"],
  ["local_multi", "🖧 Multi-dispositivo", "Varios equipos tuyos sincronizados"],
  ["vps", "☁️ VPS / Servidor", "Hostinger u otro, siempre activo"],
];
const AGENTS: [string, string][] = [["hermes", "Hermes"], ["astraura", "Astraura"], ["custom", "Personalizado"]];
const PROVIDERS: [string, string][] = [["hostinger", "Hostinger"], ["other", "Otro / genérico"]];

export function AgentRuntimePanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Runtime[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("local");
  const [devices, setDevices] = useState<{ name: string }[]>([]);
  const [deviceName, setDeviceName] = useState("");
  const [vps, setVps] = useState<Record<string, string>>({ provider: "hostinger", host: "", port: "22", endpoint: "", auth_method: "ssh_key" });
  const [agents, setAgents] = useState<string[]>(["hermes"]);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null; setUserId(uid);
      if (uid) { const { data } = await supabase.from("agent_runtimes").select("*").eq("owner", uid).order("created_at", { ascending: false }); setItems((data as Runtime[]) ?? []); }
    } catch { /* */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  function toggleAgent(v: string) { setAgents((a) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v])); }
  async function create() {
    if (!userId || !name.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.from("agent_runtimes").insert({ owner: userId, name: name.trim(), mode, devices: mode === "local_multi" ? devices : [], vps: mode === "vps" ? vps : {}, agents, enabled });
      setCreating(false); setName(""); setMode("local"); setDevices([]); setAgents(["hermes"]); setEnabled(true);
      await load();
    } catch { /* */ }
    setSaving(false);
  }
  async function remove(id: string) { try { const supabase = createClient(); await supabase.from("agent_runtimes").delete().eq("id", id); await load(); } catch { /* */ } }

  if (!userId) return <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 m-1">Inicia sesión para configurar tus agentes y servidores.</div>;

  return (
    <div className="space-y-5 p-1">
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-4 flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-white text-lg">🤖</div>
        <div>
          <div className="text-sm font-semibold text-emerald-50">Agentes & servidores</div>
          <div className="text-[11px] text-emerald-300/60">Ejecuta Hermes y tus agentes en local, multi-dispositivo o en un VPS (Hostinger u otro). Interconectado con tu cuenta y memorias.</div>
        </div>
        <Button size="sm" className="ml-auto gap-2 bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => setCreating((c) => !c)}><Plus className="w-4 h-4" /> Nuevo runtime</Button>
      </div>

      {creating && (
        <div className="rounded-xl border border-emerald-500/20 bg-black/30 p-4 space-y-3">
          <div className="flex items-center justify-between"><div className="text-sm font-semibold text-emerald-50">Nuevo runtime de agente</div><button onClick={() => setCreating(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button></div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (p. ej. Mi PC, Servidor Hostinger)" className="bg-white/5" />
          <div>
            <div className="text-[11px] text-white/50 mb-1 flex items-center gap-1"><Wand2 className="w-3 h-3" /> Dónde corre el agente</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MODES.map(([v, l, h]) => (
                <button key={v} onClick={() => setMode(v)} className={cn("text-left rounded-lg border p-2.5 transition", mode === v ? "bg-emerald-600/25 border-emerald-400/50" : "bg-white/5 border-white/10 hover:border-emerald-400/30")}>
                  <div className="text-sm text-white">{l}</div><div className="text-[10px] text-white/45">{h}</div>
                </button>
              ))}
            </div>
          </div>
          {mode === "local_multi" && (
            <div>
              <div className="text-[11px] text-white/50 mb-1">Dispositivos sincronizados</div>
              <div className="flex gap-1 mb-1">
                <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Nombre del dispositivo" className="bg-white/5 h-8 text-xs" />
                <Button size="sm" variant="outline" className="h-8" onClick={() => { if (deviceName.trim()) { setDevices((d) => [...d, { name: deviceName.trim() }]); setDeviceName(""); } }}>Añadir</Button>
              </div>
              <div className="flex flex-wrap gap-1">{devices.map((d, i) => <Badge key={i} variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-100 gap-1">{d.name}<button onClick={() => setDevices((x) => x.filter((_, j) => j !== i))}>×</button></Badge>)}</div>
            </div>
          )}
          {mode === "vps" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-[11px] text-white/50">Proveedor<select value={vps.provider} onChange={(e) => setVps((v) => ({ ...v, provider: e.target.value }))} className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">{PROVIDERS.map(([v, l]) => <option key={v} value={v} className="bg-zinc-900">{l}</option>)}</select></label>
              <label className="text-[11px] text-white/50">Host / IP<Input value={vps.host} onChange={(e) => setVps((v) => ({ ...v, host: e.target.value }))} placeholder="123.45.67.89" className="bg-white/5 h-8 text-xs mt-1" /></label>
              <label className="text-[11px] text-white/50">Puerto<Input value={vps.port} onChange={(e) => setVps((v) => ({ ...v, port: e.target.value }))} placeholder="22" className="bg-white/5 h-8 text-xs mt-1" /></label>
              <label className="text-[11px] text-white/50">Endpoint del agente (URL)<Input value={vps.endpoint} onChange={(e) => setVps((v) => ({ ...v, endpoint: e.target.value }))} placeholder="https://mi-vps:8080/agent" className="bg-white/5 h-8 text-xs mt-1" /></label>
              <div className="sm:col-span-2 text-[10px] text-amber-300/70">🔐 Las claves SSH / tokens se añaden en la bóveda segura (no se guardan en texto plano aquí).</div>
            </div>
          )}
          <div>
            <div className="text-[11px] text-white/50 mb-1">Agentes</div>
            <div className="flex flex-wrap gap-1.5">{AGENTS.map(([v, l]) => <button key={v} onClick={() => toggleAgent(v)} className={cn("text-[11px] rounded-full px-2.5 py-1 border transition", agents.includes(v) ? "bg-emerald-600/30 border-emerald-400/50 text-white" : "bg-white/5 border-white/10 text-white/60")}>{l}</button>)}</div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={enabled} onCheckedChange={setEnabled} /><span className="text-xs text-white/70">Activo</span></div>
          <div className="flex gap-2 pt-1"><Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-500" disabled={saving || !name.trim()} onClick={create}><Check className="w-4 h-4" /> Crear</Button><Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button></div>
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-widest text-emerald-300/50 mb-2">Tus runtimes</div>
        {items.length === 0 ? <div className="text-sm text-white/40 px-1">Aún no tienes runtimes. Crea uno — empieza con &quot;Este dispositivo&quot; (lo más simple) y añade un VPS cuando quieras.</div> : (
          <div className="space-y-2">{items.map((r) => (
            <div key={r.id} className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{r.name} {!r.enabled && <span className="text-[10px] text-white/40">(inactivo)</span>}</div>
                <div className="text-[10px] text-white/45 mt-0.5">{(MODES.find((x) => x[0] === r.mode) || ["", "", ""])[1]} · agentes: {(r.agents || []).join(", ")}{r.mode === "vps" && r.vps?.host ? ` · ${r.vps.host}` : ""}{r.mode === "local_multi" ? ` · ${(r.devices || []).length} disp.` : ""}</div>
              </div>
              <button onClick={() => remove(r.id)} className="text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}

export default AgentRuntimePanel;
