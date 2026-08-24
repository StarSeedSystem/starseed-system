"use client";

/**
 * STUDIO 1.58 · Memoria — recuerdos (preferencias del usuario y memorias
 * fijadas), grafo de conocimiento, ramas del memory root de StarSeed
 * (soul/ego/style/skills/memory/dream/accounts/tasks/logs) y mem0
 * (búsqueda + alta). La memoria del OS (Supabase) no se mezcla: esto es lo que
 * el backend soberano recuerda por su cuenta y comparte con todos los cerebros.
 *
 * (Ola 6 · Adenda 158) Paridad con `StarSeedMemoriesView.jsx` (sub-pestañas
 * `vault`/`recuerdos`/`openviking` del original): se añaden los «Documentos
 * StarSeed» (bóveda editable) y «OpenViking» (memoria de trabajo jerárquica en
 * 4 tiers), y se puede QUITAR una memoria fijada (antes solo se añadía). Todo
 * organizado en sub-pestañas para no amontonar las cinco tarjetas en un muro.
 */

import { useCallback, useState } from "react";
import {
  Database, Edit3, FileText, GitBranch, MessagesSquare, Network, Pin, Plus, RefreshCw, Save, Search,
  Sparkles, Trash2, Workflow, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  addAstraura158Memory, deleteAstraura158Document, fetchAstraura158Documents, fetchAstraura158MemoryGraph,
  fetchAstraura158OpenViking, fetchAstraura158Recuerdos, fetchAstraura158StarseedManifest, saveAstraura158Document,
  saveAstraura158Recuerdos, searchAstraura158Memory,
  type Astraura158Document, type Astraura158Memory, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, Field, INPUT, MONO, PILL, PILL_ON, PILL_OFF,
  SELECT, SUB, SectionTitle, Stat, TEXTAREA, fmtTs, levelTone, runS158, useBusy, useS158Load, type S158TabProps,
} from "./shared";

const PREF_FIELDS: { key: string; label: string }[] = [
  { key: "preferred_name", label: "Cómo quieres que te llame" },
  { key: "nickname", label: "Apodo" },
  { key: "role_title", label: "Tu rol" },
  { key: "communication_tone", label: "Tono de comunicación" },
  { key: "language", label: "Idioma" },
  { key: "hardware_device", label: "Dispositivo" },
];

/** Mismas ramas que el memory root de StarSeed (§ CLAUDE.md) + «general». */
const DOC_CATEGORIES = ["general", "soul", "ego", "style", "skills", "memory", "dream", "accounts", "tasks", "logs"];

type MemSubTab = "recuerdos" | "documentos" | "openviking";
const SUB_TABS: { id: MemSubTab; label: string }[] = [
  { id: "recuerdos", label: "Recuerdos" },
  { id: "documentos", label: "Documentos StarSeed" },
  { id: "openviking", label: "OpenViking" },
];

export function MemoriaTab({ target }: S158TabProps) {
  const [sub, setSub] = useState<MemSubTab>("recuerdos");
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

  function unpin(idOrRef: { id?: string; title?: string; content?: string }, key: string) {
    void wrap(`unpin:${key}`, () => runS158("Memoria quitada", () => saveAstraura158Recuerdos(target, {
      pinned_core_memories: pinned.filter((x) => x !== idOrRef),
    }), { after: reloadRec }));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {SUB_TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={sub === t.id} aria-label={`Sub-pestaña: ${t.label}`}
            className={cn(PILL, sub === t.id ? PILL_ON : PILL_OFF)} onClick={() => setSub(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === "recuerdos" && (
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
                {pinned.map((m, i) => {
                  const key = m.id ?? `${m.title ?? ""}:${i}`;
                  return (
                    <div key={key} className={cn(SUB, "px-3 py-1.5")}>
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90">{m.title ?? "(sin título)"}</p>
                        {m.priority && <Badge tone="border-amber-400/30 text-amber-200">{m.priority}</Badge>}
                        <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label={`Quitar memoria fijada: ${m.title ?? "sin título"}`} onClick={() => unpin(m, key)}>
                          <BusyIcon busy={busy === `unpin:${key}`} icon={X} />
                        </button>
                      </div>
                      {m.content && <p className="line-clamp-2 text-[10px] text-white/60">{m.content}</p>}
                    </div>
                  );
                })}
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
      )}

      {sub === "documentos" && <DocumentosSection target={target} />}
      {sub === "openviking" && <OpenVikingSection target={target} />}
    </div>
  );
}

/* ── Documentos StarSeed: bóveda editable (crear · editar · eliminar) ──────── */

function DocumentosSection({ target }: { target: Astraura158Target }) {
  const docs = useS158Load((t) => fetchAstraura158Documents(t, { limit: 200 }), target);
  const confirm = useConfirm();
  const { busy, wrap } = useBusy();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Campos REALES del backend soberano (verificados contra `SaveMemoryDocRequest`
  // en `app/main.py`): el título es `name`, el cuerpo es `markdown` y `branch` es
  // obligatorio. `category` es opcional y decorativa.
  const [form, setForm] = useState({ name: "", markdown: "", branch: "general", tags: "" });

  // `/api/memory/starseed/documents` devuelve un ARRAY pelado, no `{documents}`.
  const list = docs.data ?? [];
  const selected = list.find((d) => d.id === selectedId) ?? null;
  const reload = () => docs.reload(true);

  function startNew() {
    setSelectedId(null);
    setForm({ name: "", markdown: "", branch: "general", tags: "" });
    setEditing(true);
  }
  function startEdit(doc: Astraura158Document) {
    setSelectedId(doc.id ?? null);
    setForm({ name: doc.name ?? "", markdown: doc.markdown ?? "", branch: doc.branch ?? "general", tags: (doc.tags ?? []).join(", ") });
    setEditing(true);
  }
  async function save() {
    if (!form.name.trim()) { toast.error("El documento necesita un título."); return; }
    await wrap("save", () => runS158("Documento guardado", () => saveAstraura158Document(target, {
      id: selectedId ?? undefined,
      name: form.name.trim(),
      branch: form.branch || "general",
      markdown: form.markdown,
      category: form.branch,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    }), { after: async () => { setEditing(false); await reload(); } }));
  }
  async function removeDoc(doc: Astraura158Document) {
    if (!doc.id) return;
    const id = doc.id;
    const ok = await confirm({
      title: `¿Eliminar «${doc.name ?? id}»?`,
      description: "Se borra del backend soberano de esta neurona. No se puede deshacer desde aquí.",
      confirmText: "Eliminar", cancelText: "Cancelar", destructive: true,
    });
    if (!ok) return;
    await wrap(`del:${id}`, () => runS158("Documento eliminado", () => deleteAstraura158Document(target, id), {
      after: async () => { if (selectedId === id) { setSelectedId(null); setEditing(false); } await reload(); },
    }));
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,240px)_1fr]">
      <div className={cn(CARD, "flex flex-col p-3")}>
        <SectionTitle icon={FileText} title={`Documentos (${list.length})`} tone="text-cyan-300" hint="Notas de largo plazo que el backend indexa junto al resto de su memoria."
          right={<button type="button" className={BTN} onClick={reload} aria-label="Recargar documentos"><RefreshCw className={cn("h-3 w-3", docs.loading && "animate-spin")} aria-hidden="true" /></button>} />
        <button type="button" className={cn(BTN_PRIMARY, "mt-2 w-full justify-center")} onClick={startNew} aria-label="Nuevo documento"><Plus className="h-3 w-3" aria-hidden="true" /> Nuevo documento</button>
        <div className="mt-2 space-y-1">
          {list.length === 0 && <Empty loading={docs.loading} error={docs.error} text="Sin documentos." />}
          {list.map((d) => (
            <button key={d.id ?? d.name} type="button" onClick={() => { setSelectedId(d.id ?? null); setEditing(false); }}
              aria-pressed={selectedId === d.id && !editing}
              className={cn("block w-full cursor-pointer rounded-lg border px-2.5 py-1.5 text-left transition-colors", selectedId === d.id && !editing ? "border-cyan-400/40 bg-cyan-500/[0.08]" : "border-white/10 bg-black/20 hover:border-white/25")}>
              <p className="truncate text-[11px] font-medium text-white/90">{d.name || "(sin título)"}</p>
              <p className="truncate text-[10px] text-white/50">{d.branch ?? d.category ?? "general"}{typeof d.updated_at === "string" ? ` · ${fmtTs(d.updated_at)}` : ""}</p>
            </button>
          ))}
        </div>
      </div>

      <div className={cn(CARD, "flex min-h-[220px] flex-col p-3")}>
        {editing ? (
          <div className="flex flex-1 flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Título"><input className={INPUT} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Título del documento" /></Field>
              <Field label="Categoría / rama">
                <select className={SELECT} value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} aria-label="Categoría del documento">
                  {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Etiquetas (separadas por comas)"><input className={INPUT} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} aria-label="Etiquetas del documento" placeholder="ontocracia, soberanía, hardware" /></Field>
            <Field label="Contenido" className="flex flex-1 flex-col">
              <textarea className={cn(TEXTAREA, "flex-1")} value={form.markdown} onChange={(e) => setForm({ ...form, markdown: e.target.value })} aria-label="Contenido del documento" />
            </Field>
            <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-2">
              <button type="button" className={BTN} onClick={() => setEditing(false)} aria-label="Cancelar edición del documento">Cancelar</button>
              <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || !form.name.trim()} aria-label="Guardar documento" onClick={() => { void save(); }}>
                <BusyIcon busy={busy === "save"} icon={Save} /> Guardar
              </button>
            </div>
          </div>
        ) : selected ? (
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-white/90">{selected.name}</p>
                <p className={MONO}>{selected.branch ?? selected.category ?? "general"}{selected.tags?.length ? ` · ${selected.tags.join(", ")}` : ""}{typeof selected.updated_at === "string" ? ` · ${fmtTs(selected.updated_at)}` : ""}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" className={BTN} onClick={() => startEdit(selected)} aria-label="Editar documento"><Edit3 className="h-3 w-3" aria-hidden="true" /> Editar</button>
                <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label="Eliminar documento" onClick={() => { void removeDoc(selected); }}>
                  <BusyIcon busy={busy === `del:${selected.id}`} icon={Trash2} />
                </button>
              </div>
            </div>
            <p className="flex-1 whitespace-pre-wrap text-[11px] leading-relaxed text-white/75">{selected.markdown || "(sin contenido)"}</p>
          </div>
        ) : (
          <Empty loading={docs.loading} error={docs.error} text="Selecciona un documento de la lista o crea uno nuevo." />
        )}
      </div>
    </div>
  );
}

/* ── OpenViking: memoria de trabajo jerárquica (4 tiers) ────────────────────── */

function OpenVikingSection({ target }: { target: Astraura158Target }) {
  const ov = useS158Load(fetchAstraura158OpenViking, target);
  const d = ov.data;
  const buffer = d?.session_buffer ?? [];
  const events = d?.events ?? [];
  const concepts = d?.concept_propagation ?? [];
  const pipelines = d?.pipelines ?? [];
  const empty = buffer.length === 0 && events.length === 0 && concepts.length === 0 && pipelines.length === 0;

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Network} title="OpenViking · memoria de trabajo jerárquica" tone="text-fuchsia-300"
          hint="Buffer de sesión activa, eventos y experiencia, propagación de conceptos y pipelines de ejecución — tal cual los publica el backend."
          right={<button type="button" className={BTN} onClick={() => { void ov.reload(); }} aria-label="Recargar OpenViking"><RefreshCw className={cn("h-3 w-3", ov.loading && "animate-spin")} aria-hidden="true" /></button>} />
        {!d && <Empty loading={ov.loading} error={ov.error} text="El backend no expone /api/memory/openviking en esta versión." />}
        {d && empty && <p className="mt-2 text-[11px] text-white/55">El backend respondió sin tiers de OpenViking activos todavía.</p>}
      </div>

      {d && !empty && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={MessagesSquare} title={`Buffer de Sesión Activa (${buffer.length})`} tone="text-cyan-300" />
            <div className="mt-2 space-y-1">
              {buffer.length === 0 && <Empty text="Buffer vacío." />}
              {buffer.slice(0, 12).map((m, i) => (
                <div key={m.id ?? i} className={cn(SUB, "px-2.5 py-1.5")}>
                  <div className="flex items-center gap-1.5">
                    <Badge tone="border-white/10 text-white/60">{m.role ?? "—"}</Badge>
                    {typeof m.tokens === "number" && <span className={MONO}>{m.tokens} tok</span>}
                  </div>
                  {m.content && <p className="mt-0.5 line-clamp-2 text-[10px] text-white/70">{m.content}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={Sparkles} title={`Eventos & Experiencia (${events.length})`} tone="text-amber-300" />
            <div className="mt-2 space-y-1">
              {events.length === 0 && <Empty text="Sin eventos." />}
              {events.slice(0, 12).map((ev, i) => (
                <div key={ev.id ?? i} className={cn(SUB, "px-2.5 py-1.5")}>
                  <div className="flex items-center gap-1.5">
                    <Badge tone="border-amber-400/25 text-amber-200">{ev.kind ?? "evento"}</Badge>
                    {typeof ev.valence === "number" && <span className={MONO}>valencia {ev.valence.toFixed(2)}</span>}
                  </div>
                  {ev.summary && <p className="mt-0.5 line-clamp-2 text-[10px] text-white/70">{ev.summary}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={Network} title={`Propagación de Conceptos (${concepts.length})`} tone="text-violet-300" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {concepts.length === 0 && <Empty text="Sin conceptos propagados." />}
              {concepts.slice(0, 24).map((c, i) => (
                <Badge key={c.concept ?? i} tone="border-violet-400/25 text-violet-100/90">
                  {c.concept ?? "?"}{typeof c.strength === "number" ? ` · ${c.strength.toFixed(2)}` : ""}{c.linked?.length ? ` → ${c.linked.length}` : ""}
                </Badge>
              ))}
            </div>
          </div>

          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={Workflow} title={`Pipelines de Ejecución (${pipelines.length})`} tone="text-emerald-300" />
            <div className="mt-2 space-y-1.5">
              {pipelines.length === 0 && <Empty text="Sin pipelines." />}
              {pipelines.map((p, i) => (
                <div key={p.id ?? i} className={cn(SUB, "px-2.5 py-1.5")}>
                  <div className="flex items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate text-[11px] text-white/85">{p.name ?? p.id}</p>
                    {p.status && <Badge tone={levelTone(p.status)}>{p.status}</Badge>}
                  </div>
                  {p.stage && <p className={MONO}>{p.stage}</p>}
                  {typeof p.progress === "number" && <Bar value={p.progress} className="mt-1" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MemoriaTab;
