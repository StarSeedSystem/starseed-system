"use client";

/**
 * STUDIO 1.58 · Memoria — recuerdos (preferencias del usuario y memorias
 * fijadas), grafo de conocimiento, ramas del memory root de StarSeed
 * (soul/ego/style/skills/memory/dream/accounts/tasks/logs) y mem0
 * (búsqueda + alta). La memoria del OS (Supabase) no se mezcla: esto es lo que
 * el backend soberano recuerda por su cuenta y comparte con todos los cerebros.
 */

import { useCallback, useState } from "react";
import { Database, GitBranch, Network, Pin, Plus, RefreshCw, Save, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addAstraura158Memory, fetchAstraura158MemoryGraph, fetchAstraura158Recuerdos, fetchAstraura158StarseedManifest, saveAstraura158Recuerdos, searchAstraura158Memory,
  type Astraura158Memory,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, Field, INPUT, MONO, SELECT, SUB, TEXTAREA, SectionTitle, Stat, runS158, useBusy, useS158Load, type S158TabProps } from "./shared";

const PREF_FIELDS: { key: string; label: string }[] = [
  { key: "preferred_name", label: "Cómo quieres que te llame" },
  { key: "nickname", label: "Apodo" },
  { key: "role_title", label: "Tu rol" },
  { key: "communication_tone", label: "Tono de comunicación" },
  { key: "language", label: "Idioma" },
  { key: "hardware_device", label: "Dispositivo" },
];

export function MemoriaTab({ target }: S158TabProps) {
  const rec = useS158Load(fetchAstraura158Recuerdos, target);
  const graph = useS158Load(fetchAstraura158MemoryGraph, target);
  const root = useS158Load(fetchAstraura158StarseedManifest, target);
  const { busy, wrap } = useBusy();
  const [prefs, setPrefs] = useState<Record<string, string> | null>(null);
  const [pin, setPin] = useState({ title: "", content: "" });
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Astraura158Memory[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [newMem, setNewMem] = useState({ memory: "", category: "general" });

  const reloadRec = useCallback(async () => { await rec.reload(true); setPrefs(null); }, [rec]);
  const r = rec.data;
  const current: Record<string, string> = prefs ?? Object.fromEntries(PREF_FIELDS.map((f) => [f.key, String(r?.user_preferences?.[f.key] ?? "")]));
  const pinned = r?.pinned_core_memories ?? [];
  const g = graph.data;
  const nodes = (g?.nodes ?? []).length;
  const edges = (g?.edges ?? g?.links ?? []).length;
  const branches = root.data?.branches;
  const branchList = Array.isArray(branches) ? branches.map((b, i) => ({ id: String((b as { id?: string; name?: string })?.id ?? (b as { name?: string })?.name ?? i), info: b })) : branches && typeof branches === "object" ? Object.entries(branches).map(([id, info]) => ({ id, info })) : [];

  async function search() {
    if (!q.trim()) return;
    setSearching(true);
    const res = await searchAstraura158Memory(target, q.trim(), 10);
    setSearching(false);
    setResults(res.ok ? (res.data.results ?? []) : []);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Database} title="Recuerdos · quién eres para el backend" tone="text-violet-300" hint="Preferencias que todas las personalidades y cerebros tienen presentes en cada turno."
            right={<button type="button" className={BTN} onClick={() => { void rec.reload(); }} aria-label="Recargar recuerdos"><RefreshCw className={cn("h-3 w-3", rec.loading && "animate-spin")} aria-hidden="true" /></button>} />
          {!r && <Empty loading={rec.loading} error={rec.error} text="Sin recuerdos." />}
          {r && (
            <>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {PREF_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}><input className={INPUT} value={current[f.key] ?? ""} onChange={(e) => setPrefs({ ...current, [f.key]: e.target.value })} aria-label={f.label} /></Field>
                ))}
              </div>
              <button type="button" className={cn(BTN_PRIMARY, "mt-2")} disabled={busy !== "" || !prefs} aria-label="Guardar preferencias"
                onClick={() => { void wrap("prefs", () => runS158("Preferencias guardadas", () => saveAstraura158Recuerdos(target, { user_preferences: { ...(r.user_preferences ?? {}), ...current } }), { after: reloadRec })); }}>
                <BusyIcon busy={busy === "prefs"} icon={Save} /> Guardar
              </button>
              {r.host_identity != null && <p className={cn(MONO, "mt-1")}>host: {String(r.host_identity)}</p>}
            </>
          )}
        </div>

        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Pin} title={`Memorias fijadas (${pinned.length})`} tone="text-amber-300" hint="Hechos que nunca se reciclan y viajan a todos los cerebros." />
          <div className="mt-2 space-y-1.5">
            {pinned.length === 0 && <Empty text="Nada fijado todavía." />}
            {pinned.map((m, i) => (
              <div key={m.id ?? i} className={cn(SUB, "px-3 py-1.5")}>
                <div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90">{m.title ?? "(sin título)"}</p>{m.priority && <Badge tone="border-amber-400/30 text-amber-200">{m.priority}</Badge>}</div>
                {m.content && <p className="line-clamp-2 text-[10px] text-white/60">{m.content}</p>}
              </div>
            ))}
          </div>
          <div className="mt-2 grid gap-2">
            <input className={INPUT} placeholder="Título" value={pin.title} onChange={(e) => setPin({ ...pin, title: e.target.value })} aria-label="Título de la memoria fijada" />
            <textarea className={TEXTAREA} placeholder="Contenido" value={pin.content} onChange={(e) => setPin({ ...pin, content: e.target.value })} aria-label="Contenido de la memoria fijada" />
            <button type="button" className={BTN} disabled={busy !== "" || !pin.content.trim() || !r} aria-label="Fijar memoria"
              onClick={() => { void wrap("pin", () => runS158("Memoria fijada", () => saveAstraura158Recuerdos(target, { pinned_core_memories: [...pinned, { id: `pin-${Date.now()}`, title: pin.title.trim() || pin.content.trim().slice(0, 40), content: pin.content.trim(), priority: "high", created_at: new Date().toISOString() }] }), { after: async () => { setPin({ title: "", content: "" }); await reloadRec(); } })); }}>
              <BusyIcon busy={busy === "pin"} icon={Pin} /> Fijar
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Network} title="Grafo de conocimiento" tone="text-cyan-300" hint="Nodos y aristas que el backend asocia mientras habla, imagina y sueña." />
          {!g && <Empty loading={graph.loading} error={graph.error} text="Sin grafo." />}
          {g && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Nodos" value={g.stats?.nodes ?? nodes} />
              <Stat label="Aristas" value={g.stats?.edges ?? edges} />
              {Object.entries(g.stats ?? {}).filter(([k]) => !["nodes", "edges"].includes(k)).slice(0, 4).map(([k, v]) => <Stat key={k} label={k} value={v} />)}
            </div>
          )}
        </div>
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={GitBranch} title={`Memory root de StarSeed (${branchList.length} ramas)`} tone="text-emerald-300" hint="soul · ego · style · skills · memory · dream · accounts · tasks · logs — el mismo contrato de ramas que los cerebros del OS." />
          {branchList.length === 0 && <Empty loading={root.loading} error={root.error} text="Sin manifiesto del memory root." />}
          <div className="mt-2 flex flex-wrap gap-1">
            {branchList.map((b) => {
              const info = b.info as Record<string, unknown> | null;
              const count = info && typeof info === "object" ? (info.documents ?? info.count ?? info.files ?? info.entries) : undefined;
              return <Badge key={b.id} tone="border-emerald-400/25 text-emerald-100/90">{b.id}{typeof count === "number" ? ` · ${count}` : ""}</Badge>;
            })}
          </div>
        </div>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Search} title="mem0 · buscar y añadir" tone="text-fuchsia-300" hint="Memoria semántica del backend (TF-IDF local). Lo que añadas lo recordarán todas las personalidades." />
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Buscar" className="min-w-[220px] flex-1"><input className={INPUT} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }} aria-label="Buscar en mem0" placeholder="¿qué recuerda el backend sobre…?" /></Field>
          <button type="button" className={BTN} disabled={searching || !q.trim()} onClick={() => { void search(); }} aria-label="Buscar"><BusyIcon busy={searching} icon={Search} /> Buscar</button>
        </div>
        {results && (
          <div className="mt-2 space-y-1">
            {results.length === 0 && <Empty text="Sin resultados." />}
            {results.map((m, i) => <div key={m.id ?? i} className={cn(SUB, "px-3 py-1.5")}><p className="text-[11px] text-white/85">{m.memory}</p><p className={MONO}>{m.category ?? ""}{typeof m.score === "number" ? ` · ${m.score.toFixed(2)}` : ""}{m.created_at ? ` · ${m.created_at}` : ""}</p></div>)}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Nueva memoria" className="min-w-[220px] flex-1"><input className={INPUT} value={newMem.memory} onChange={(e) => setNewMem({ ...newMem, memory: e.target.value })} aria-label="Nueva memoria" placeholder="p. ej. Prefiero respuestas breves por la mañana" /></Field>
          <Field label="Categoría"><select className={SELECT} value={newMem.category} onChange={(e) => setNewMem({ ...newMem, category: e.target.value })} aria-label="Categoría">{["general", "preferencia", "proyecto", "persona", "hecho", "tarea"].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || !newMem.memory.trim()} aria-label="Añadir memoria"
            onClick={() => { void wrap("add", () => runS158("Memoria añadida", () => addAstraura158Memory(target, newMem.memory.trim(), newMem.category), { after: async () => { setNewMem({ memory: "", category: newMem.category }); await graph.reload(true); } })); }}>
            <BusyIcon busy={busy === "add"} icon={Plus} /> Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

export default MemoriaTab;
