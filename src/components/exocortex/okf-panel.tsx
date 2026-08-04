"use client";

/**
 * StarSeed OS — OKFPanel
 *
 * Panel de la wiki OKF ("LLM Wiki" de Karpathy) sobre el sistema de memoria.
 *
 *   • Cada baúl = una wiki. Sus memorias = páginas (markdown en content).
 *   • Los [[Nombre]] dentro del contenido enlazan páginas → conexiones neuronales.
 *   • Páginas especiales por baúl: index (catálogo), log (registro), schema.
 *   • Astraura realiza: Ingesta · Consulta · Revisión (lint).
 *
 * Autónomo: carga baúles + memorias del usuario con el cliente de Supabase y
 * usa el MISMO cliente de IA que el resto del Exocórtex (@/ai/client/chat).
 * Degrada con elegancia si no hay IA configurada o si una llamada falla.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { chat } from "@/ai/client/chat";
import { loadConfigs } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { usePrompt } from "@/components/ui/confirm-dialog";
import {
  BookOpen,
  Boxes,
  Sparkles,
  Loader2,
  FileText,
  Link2,
  Link2Off,
  ListTree,
  ScrollText,
  Settings2,
  Stethoscope,
  Download,
  Check,
  Save,
  Archive,
  Search,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  parseWikilinks,
  buildLinkGraph,
  findMemoryByName,
  logLine,
  OKF_SCHEMA_TEMPLATE,
  INDEX_TEMPLATE,
  LOG_TEMPLATE,
  ingestPrompt,
  queryPrompt,
  lintPrompt,
  OKF_SPECIAL_PAGES,
  type OKFPage,
} from "@/lib/okf";

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

interface VaultRow {
  id: string;
  owner: string;
  name: string | null;
  scope?: string | null;
}

interface MemoryRow {
  id: string;
  owner: string;
  name: string;
  content: string | null;
  vault_id: string | null;
}

type StatusKind = "ok" | "err" | "info";
interface StatusMsg {
  kind: StatusKind;
  msg: string;
}

interface IngestProposal {
  summaryPage: { name: string; content: string };
  updates: { name: string; content: string }[];
  indexEntry?: string;
  logTitle?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const SPECIAL = new Set<string>(OKF_SPECIAL_PAGES as readonly string[]);
function isSpecial(name: string): boolean {
  return SPECIAL.has((name ?? "").trim().toLowerCase());
}

/** Intenta extraer un objeto JSON de un texto de IA (tolerante a ruido / fences). */
function tryParseIngest(text: string): IngestProposal | null {
  if (!text) return null;
  const candidates: string[] = [];
  candidates.push(text);
  // Bloque entre fences ```...```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1]);
  // Primer { … último }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim());
      if (obj && typeof obj === "object" && obj.summaryPage && typeof obj.summaryPage.name === "string") {
        return {
          summaryPage: {
            name: String(obj.summaryPage.name),
            content: String(obj.summaryPage.content ?? ""),
          },
          updates: Array.isArray(obj.updates)
            ? obj.updates
                .filter((u: unknown) => u && typeof (u as OKFPage).name === "string")
                .map((u: OKFPage) => ({ name: String(u.name), content: String(u.content ?? "") }))
            : [],
          indexEntry: typeof obj.indexEntry === "string" ? obj.indexEntry : undefined,
          logTitle: typeof obj.logTitle === "string" ? obj.logTitle : undefined,
        };
      }
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

/** Una sola llamada (no-streaming) al cliente de IA del Exocórtex. */
async function runAI(prompt: string): Promise<string> {
  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  const res = await chat({ messages, temperature: 0.5 });
  return (res.text ?? "").trim();
}

function hasProviderEnabled(): boolean {
  try {
    return loadConfigs().some((c) => c.enabled);
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Componente
// ────────────────────────────────────────────────────────────────────────────

export default function OKFPanel() {
  const prompt = usePrompt();
  const [userId, setUserId] = useState<string | null>(null);
  const [vaults, setVaults] = useState<VaultRow[]>([]);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVault, setSelectedVault] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState<boolean>(false);
  const [busy, setBusy] = useState<null | "ingest" | "query" | "lint" | "seed">(null);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  // Ingesta
  const [source, setSource] = useState("");
  const [rawIngest, setRawIngest] = useState<string | null>(null);
  const [proposal, setProposal] = useState<IngestProposal | null>(null);

  // Consulta
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  // Lint
  const [lintReport, setLintReport] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setVaults([]);
        setMemories([]);
        return;
      }
      const [{ data: v }, { data: m }] = await Promise.all([
        supabase.from("vaults").select("id,owner,name,scope").eq("owner", uid),
        supabase.from("memories").select("id,owner,name,content,vault_id").eq("owner", uid).limit(1000),
      ]);
      const vlist = (v as VaultRow[]) ?? [];
      const mlist = (m as MemoryRow[]) ?? [];
      setVaults(vlist);
      setMemories(mlist);
      setSelectedVault((prev) => prev ?? vlist[0]?.id ?? null);
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "No se pudo cargar la wiki." });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setAiReady(hasProviderEnabled());
  }, []);

  // Páginas del baúl seleccionado
  const pages = useMemo(
    () => memories.filter((m) => m.vault_id === selectedVault),
    [memories, selectedVault],
  );
  const pagesForAI: OKFPage[] = useMemo(
    () => pages.map((p) => ({ name: p.name, content: p.content ?? "" })),
    [pages],
  );

  const hasIndex = useMemo(() => !!findMemoryByName(pages, "index"), [pages]);
  const hasLog = useMemo(() => !!findMemoryByName(pages, "log"), [pages]);
  const hasSchema = useMemo(() => !!findMemoryByName(pages, "schema"), [pages]);
  const wikiStarted = hasIndex && hasLog && hasSchema;

  // Páginas huérfanas (sin enlaces entrantes), excluyendo las especiales.
  const orphanNames = useMemo(() => {
    const graph = buildLinkGraph(pages.map((p) => ({ id: p.id, name: p.name, content: p.content })));
    const inbound = new Set(graph.edges.map((e) => e.target));
    return pages
      .filter((p) => !inbound.has(p.id) && !isSpecial(p.name))
      .map((p) => p.name);
  }, [pages]);

  const linkCount = useMemo(
    () => buildLinkGraph(pages.map((p) => ({ id: p.id, name: p.name, content: p.content }))).edges.length,
    [pages],
  );

  // ── Escrituras en Supabase ───────────────────────────────────────────────
  async function upsertPage(name: string, content: string): Promise<void> {
    if (!userId || !selectedVault) return;
    const existing = findMemoryByName(pages, name);
    if (existing) {
      await supabase.from("memories").update({ content }).eq("id", existing.id);
    } else {
      await supabase.from("memories").insert({
        owner: userId,
        name,
        scope: "library",
        kinds: ["md"],
        format: "markdown",
        storage: ["account"],
        sync: true,
        content,
        config: {},
        vault_id: selectedVault,
      });
    }
  }

  async function appendToLog(line: string): Promise<void> {
    const logMem = findMemoryByName(pages, "log");
    if (!logMem) return;
    const base = (logMem.content ?? "").replace(/\s+$/, "");
    await supabase.from("memories").update({ content: `${base}\n\n${line}\n` }).eq("id", logMem.id);
  }

  async function upsertIndexEntry(entry: string): Promise<void> {
    if (!entry || !entry.trim()) return;
    const idxMem = findMemoryByName(pages, "index");
    if (!idxMem) return;
    const current = idxMem.content ?? "";
    if (current.includes(entry.trim())) return; // ya está
    // Inserta tras "## Páginas" si existe; si no, al final.
    const marker = "## Páginas";
    let next: string;
    if (current.includes(marker)) {
      next = current.replace(marker, `${marker}\n${entry.trim()}`);
    } else {
      next = `${current.replace(/\s+$/, "")}\n${entry.trim()}\n`;
    }
    await supabase.from("memories").update({ content: next }).eq("id", idxMem.id);
  }

  // ── Iniciar wiki: crea index/log/schema si faltan ────────────────────────
  async function seedWiki() {
    if (!userId || !selectedVault) {
      setStatus({ kind: "err", msg: "Elige un baúl primero." });
      return;
    }
    setBusy("seed");
    setStatus(null);
    try {
      const toCreate: { name: string; content: string }[] = [];
      if (!hasIndex) toCreate.push({ name: "index", content: INDEX_TEMPLATE });
      if (!hasLog) toCreate.push({ name: "log", content: LOG_TEMPLATE });
      if (!hasSchema) toCreate.push({ name: "schema", content: OKF_SCHEMA_TEMPLATE });
      if (toCreate.length === 0) {
        setStatus({ kind: "info", msg: "La wiki ya tiene index, log y schema." });
      } else {
        for (const p of toCreate) {
          await supabase.from("memories").insert({
            owner: userId,
            name: p.name,
            scope: "library",
            kinds: ["md"],
            format: "markdown",
            storage: ["account"],
            sync: true,
            content: p.content,
            config: {},
            vault_id: selectedVault,
          });
        }
        setStatus({ kind: "ok", msg: `Wiki iniciada: creadas ${toCreate.map((p) => p.name).join(", ")}.` });
      }
      await load();
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "No se pudo iniciar la wiki." });
    } finally {
      setBusy(null);
    }
  }

  // ── Ingesta ──────────────────────────────────────────────────────────────
  async function doIngest() {
    if (!source.trim()) {
      setStatus({ kind: "err", msg: "Escribe una fuente o nota para ingerir." });
      return;
    }
    if (!aiReady) {
      setStatus({ kind: "err", msg: "Configura tu IA en Astraura AI (Ajustes → IA & Modelos) para que Astraura redacte." });
      return;
    }
    setBusy("ingest");
    setStatus(null);
    setProposal(null);
    setRawIngest(null);
    try {
      const text = await runAI(ingestPrompt(source, pagesForAI));
      const parsed = tryParseIngest(text);
      if (parsed) {
        setProposal(parsed);
        setStatus({ kind: "info", msg: "Astraura propone esta página. Revísala y pulsa Aceptar para archivarla." });
      } else {
        setRawIngest(text);
        setStatus({ kind: "info", msg: "Astraura respondió texto libre. Puedes guardarlo como página manualmente." });
      }
    } catch (e) {
      setStatus({ kind: "err", msg: `No pude ingerir: ${e instanceof Error ? e.message : "error de IA"}` });
    } finally {
      setBusy(null);
    }
  }

  async function acceptProposal() {
    if (!proposal) return;
    setBusy("ingest");
    setStatus(null);
    try {
      await upsertPage(proposal.summaryPage.name, proposal.summaryPage.content);
      for (const u of proposal.updates) {
        if (isSpecial(u.name)) continue; // no pisar index/log/schema desde aquí
        await upsertPage(u.name, u.content);
      }
      // Recargar para tener ids/contenidos frescos de index/log antes de tocarlos.
      await load();
      const entry = proposal.indexEntry || `- [[${proposal.summaryPage.name}]]`;
      await upsertIndexEntry(entry);
      await appendToLog(logLine("ingesta", proposal.logTitle || proposal.summaryPage.name));
      await load();
      setProposal(null);
      setSource("");
      setStatus({ kind: "ok", msg: "Página archivada, índice y registro actualizados." });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "No se pudo archivar la propuesta." });
    } finally {
      setBusy(null);
    }
  }

  async function saveRawAsPage() {
    if (!rawIngest) return;
    const name = await prompt({ title: "Nueva página", label: "Nombre de la nueva página:", defaultValue: "nota" });
    if (!name || !name.trim()) return;
    if (isSpecial(name)) {
      setStatus({ kind: "err", msg: "Ese nombre está reservado (index/log/schema)." });
      return;
    }
    setBusy("ingest");
    try {
      await upsertPage(name.trim(), rawIngest);
      await load();
      await upsertIndexEntry(`- [[${name.trim()}]]`);
      await appendToLog(logLine("ingesta", name.trim()));
      await load();
      setRawIngest(null);
      setSource("");
      setStatus({ kind: "ok", msg: `Página "${name.trim()}" guardada.` });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "No se pudo guardar." });
    } finally {
      setBusy(null);
    }
  }

  // ── Consulta ─────────────────────────────────────────────────────────────
  async function doQuery() {
    if (!question.trim()) {
      setStatus({ kind: "err", msg: "Escribe una pregunta." });
      return;
    }
    if (!aiReady) {
      setStatus({ kind: "err", msg: "Configura tu IA en Astraura AI para consultar la wiki." });
      return;
    }
    setBusy("query");
    setStatus(null);
    setAnswer(null);
    try {
      const text = await runAI(queryPrompt(question, pagesForAI));
      setAnswer(text || "(sin respuesta)");
    } catch (e) {
      setStatus({ kind: "err", msg: `No pude consultar: ${e instanceof Error ? e.message : "error de IA"}` });
    } finally {
      setBusy(null);
    }
  }

  async function archiveAnswer() {
    if (!answer) return;
    const name = await prompt({
      title: "Archivar respuesta",
      label: "Archivar respuesta como página llamada:",
      defaultValue: question.slice(0, 40) || "respuesta",
    });
    if (!name || !name.trim()) return;
    if (isSpecial(name)) {
      setStatus({ kind: "err", msg: "Ese nombre está reservado (index/log/schema)." });
      return;
    }
    setBusy("query");
    try {
      const body = `# ${name.trim()}\n\n> Respuesta archivada a: ${question.trim()}\n\n${answer}`;
      await upsertPage(name.trim(), body);
      await load();
      await upsertIndexEntry(`- [[${name.trim()}]] — respuesta archivada`);
      await appendToLog(logLine("consulta", name.trim()));
      await load();
      setStatus({ kind: "ok", msg: `Respuesta archivada como "${name.trim()}".` });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "No se pudo archivar." });
    } finally {
      setBusy(null);
    }
  }

  // ── Lint ─────────────────────────────────────────────────────────────────
  async function doLint() {
    if (!aiReady) {
      setStatus({ kind: "err", msg: "Configura tu IA en Astraura AI para la revisión." });
      return;
    }
    setBusy("lint");
    setStatus(null);
    setLintReport(null);
    try {
      const text = await runAI(lintPrompt(pagesForAI));
      setLintReport(text || "(sin informe)");
    } catch (e) {
      setStatus({ kind: "err", msg: `No pude revisar: ${e instanceof Error ? e.message : "error de IA"}` });
    } finally {
      setBusy(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!loading && !userId) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 m-1">
        Inicia sesión para abrir tu wiki OKF (cada baúl es una wiki que Astraura mantiene por ti).
      </div>
    );
  }

  return (
    <div className="space-y-5 p-1">
      {/* Cabecera */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-4 flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-500 to-fuchsia-500 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-cyan-50">Wiki OKF · conocimiento que compone</div>
          <div className="text-[11px] text-cyan-300/60">
            Astraura mantiene tu wiki: redacta, enlaza y archiva por ti.
          </div>
        </div>
        {!aiReady && (
          <Badge variant="outline" className="ml-auto text-[10px] border-amber-400/40 text-amber-200">
            sin IA configurada
          </Badge>
        )}
      </div>

      {/* Selector de baúl */}
      <div>
        <div className="text-[11px] uppercase tracking-widest text-cyan-300/50 mb-2 flex items-center gap-1">
          <Boxes className="w-3 h-3" /> Elige la wiki (baúl)
        </div>
        {vaults.length === 0 ? (
          <div className="text-sm text-white/40 px-1">
            Aún no tienes baúles. Crea uno en{" "}
            <a href="/baules" className="text-cyan-300 underline">
              Baúles
            </a>{" "}
            para empezar tu wiki.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {vaults.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setSelectedVault(v.id);
                  setProposal(null);
                  setRawIngest(null);
                  setAnswer(null);
                  setLintReport(null);
                  setStatus(null);
                }}
                className={cn(
                  "text-[12px] rounded-full px-3 py-1.5 border transition flex items-center gap-1.5",
                  selectedVault === v.id
                    ? "bg-cyan-600/30 border-cyan-400/50 text-white"
                    : "bg-white/5 border-white/10 text-white/60 hover:border-cyan-400/30",
                )}
              >
                <Boxes className="w-3 h-3" /> {v.name?.trim() || "Baúl"}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-white/50 text-sm px-1">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando tu wiki…
        </div>
      ) : selectedVault ? (
        <>
          {/* Estado de la wiki / Iniciar */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-widest text-cyan-300/50">Estado de la wiki</span>
              <Badge variant="outline" className={cn("text-[10px]", hasIndex ? "border-emerald-400/40 text-emerald-200" : "border-amber-400/40 text-amber-200")}>
                <ListTree className="w-3 h-3 mr-1" /> index {hasIndex ? "✓" : "falta"}
              </Badge>
              <Badge variant="outline" className={cn("text-[10px]", hasLog ? "border-emerald-400/40 text-emerald-200" : "border-amber-400/40 text-amber-200")}>
                <ScrollText className="w-3 h-3 mr-1" /> log {hasLog ? "✓" : "falta"}
              </Badge>
              <Badge variant="outline" className={cn("text-[10px]", hasSchema ? "border-emerald-400/40 text-emerald-200" : "border-amber-400/40 text-amber-200")}>
                <Settings2 className="w-3 h-3 mr-1" /> schema {hasSchema ? "✓" : "falta"}
              </Badge>
              <span className="text-[10px] text-white/40 ml-1">
                {pages.length} páginas · {linkCount} enlaces [[wiki]]
              </span>
              {!wikiStarted && (
                <Button
                  size="sm"
                  className="ml-auto gap-1.5 bg-cyan-600 hover:bg-cyan-500"
                  disabled={busy === "seed"}
                  onClick={seedWiki}
                >
                  {busy === "seed" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  Iniciar wiki
                </Button>
              )}
            </div>
            {!wikiStarted && (
              <div className="text-[11px] text-amber-300/70">
                Pulsa <strong>Iniciar wiki</strong> para crear las páginas base (index, log, schema) con las
                convenciones de Astraura.
              </div>
            )}
          </div>

          {/* Ingesta */}
          <div className="rounded-xl border border-cyan-500/20 bg-black/30 p-4 space-y-3">
            <div className="text-sm font-semibold text-cyan-50 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-cyan-300/80" /> Ingesta — añadir una fuente a la wiki
            </div>
            <Textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Pega aquí una nota, un artículo, una idea… Astraura la destilará en una página enlazada."
              className="bg-black/40 border-white/10 text-xs min-h-[120px]"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-1.5 bg-cyan-600 hover:bg-cyan-500"
                disabled={busy === "ingest" || !source.trim()}
                onClick={doIngest}
              >
                {busy === "ingest" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Ingerir con Astraura
              </Button>
            </div>

            {/* Propuesta parseada */}
            {proposal && (
              <div className="rounded-lg border border-cyan-400/30 bg-cyan-950/20 p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-widest text-cyan-300/60">Propuesta de Astraura</div>
                <div className="text-sm font-medium text-white flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-cyan-300/70" /> {proposal.summaryPage.name}
                </div>
                <pre className="text-[11px] text-white/80 whitespace-pre-wrap font-mono bg-black/40 rounded p-2 max-h-64 overflow-auto">
                  {proposal.summaryPage.content}
                </pre>
                {proposal.updates.length > 0 && (
                  <div className="text-[11px] text-white/60">
                    También actualizará: {proposal.updates.map((u) => u.name).join(", ")}
                  </div>
                )}
                {proposal.indexEntry && (
                  <div className="text-[10px] text-cyan-300/60">Índice: {proposal.indexEntry}</div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-500" disabled={busy === "ingest"} onClick={acceptProposal}>
                    {busy === "ingest" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aceptar y archivar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
                    Descartar
                  </Button>
                </div>
              </div>
            )}

            {/* Texto libre (no parseable) */}
            {rawIngest && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-950/15 p-3 space-y-2">
                <div className="text-[11px] text-amber-200/80 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Respuesta libre de Astraura (no estructurada)
                </div>
                <pre className="text-[11px] text-white/80 whitespace-pre-wrap font-mono bg-black/40 rounded p-2 max-h-64 overflow-auto">
                  {rawIngest}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="gap-1.5 bg-cyan-600 hover:bg-cyan-500" disabled={busy === "ingest"} onClick={saveRawAsPage}>
                    <Save className="w-3.5 h-3.5" /> Guardar como página
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRawIngest(null)}>
                    Descartar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Consulta */}
          <div className="rounded-xl border border-fuchsia-500/20 bg-black/30 p-4 space-y-3">
            <div className="text-sm font-semibold text-fuchsia-50 flex items-center gap-1.5">
              <Search className="w-4 h-4 text-fuchsia-300/80" /> Consulta — pregunta a tu wiki
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    doQuery();
                  }
                }}
                placeholder="¿Qué quieres saber de lo que ya sabe tu wiki?"
                className="bg-white/5 text-sm flex-1 min-w-[200px]"
              />
              <Button size="sm" className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500" disabled={busy === "query" || !question.trim()} onClick={doQuery}>
                {busy === "query" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Consultar
              </Button>
            </div>
            {answer && (
              <div className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-950/20 p-3 space-y-2">
                <pre className="text-[12px] text-white/85 whitespace-pre-wrap font-sans max-h-72 overflow-auto">{answer}</pre>
                <Button size="sm" variant="outline" className="gap-1.5 border-cyan-400/30 text-cyan-100 hover:bg-cyan-900/20" disabled={busy === "query"} onClick={archiveAnswer}>
                  <Archive className="w-3.5 h-3.5" /> Archivar como página
                </Button>
              </div>
            )}
          </div>

          {/* Lint */}
          <div className="rounded-xl border border-emerald-500/20 bg-black/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-emerald-50 flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-emerald-300/80" /> Revisión (lint) — salud de la wiki
              </div>
              <Button size="sm" className="ml-auto gap-1.5 bg-emerald-600 hover:bg-emerald-500" disabled={busy === "lint"} onClick={doLint}>
                {busy === "lint" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Revisar wiki
              </Button>
            </div>
            {/* Huérfanas calculadas localmente */}
            <div className="text-[11px] text-white/60">
              <span className="text-white/40">Huérfanas (sin enlaces entrantes): </span>
              {orphanNames.length === 0 ? (
                <span className="text-emerald-300/80">ninguna ✓</span>
              ) : (
                <span className="text-amber-200">{orphanNames.join(", ")}</span>
              )}
            </div>
            {lintReport && (
              <div className="rounded-lg border border-emerald-400/30 bg-emerald-950/20 p-3">
                <pre className="text-[12px] text-white/85 whitespace-pre-wrap font-sans max-h-80 overflow-auto">{lintReport}</pre>
              </div>
            )}
          </div>

          {/* Páginas + conexiones visibles */}
          <div>
            <div className="text-[11px] uppercase tracking-widest text-cyan-300/50 mb-2 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Páginas de esta wiki · conexiones [[…]]
            </div>
            {pages.length === 0 ? (
              <div className="text-sm text-white/40 px-1">
                Este baúl aún no tiene páginas. Inicia la wiki e ingiere tu primera fuente.
              </div>
            ) : (
              <div className="space-y-2">
                {pages.map((p) => {
                  const links = parseWikilinks(p.content ?? "");
                  const special = isSpecial(p.name);
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "rounded-lg border bg-white/5 p-3",
                        special ? "border-cyan-400/30" : "border-white/10",
                      )}
                    >
                      <div className="text-sm font-medium text-white flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-cyan-300/70" /> {p.name}
                        {special && (
                          <Badge variant="outline" className="text-[9px] border-cyan-400/40 text-cyan-200">
                            especial
                          </Badge>
                        )}
                        {!special && orphanNames.includes(p.name) && (
                          <Badge variant="outline" className="text-[9px] border-amber-400/40 text-amber-200">
                            huérfana
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-white/40 flex items-center gap-1">
                          <Link2 className="w-3 h-3" /> Enlaces [[…]]:
                        </span>
                        {links.length === 0 ? (
                          <span className="text-[10px] text-white/30">sin enlaces</span>
                        ) : (
                          links.map((nm) => {
                            const exists = !!findMemoryByName(pages, nm);
                            return (
                              <span
                                key={nm}
                                className={cn(
                                  "text-[10px] rounded-full px-2 py-0.5 border flex items-center gap-1",
                                  exists
                                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                                    : "border-amber-400/40 bg-amber-500/10 text-amber-200",
                                )}
                                title={exists ? "La página existe" : "Aún no existe esa página"}
                              >
                                {exists ? <Link2 className="w-2.5 h-2.5" /> : <Link2Off className="w-2.5 h-2.5" />}
                                [[{nm}]]
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-sm text-white/40 px-1">Selecciona un baúl para ver su wiki.</div>
      )}

      {/* Estado global */}
      {status && (
        <div
          className={cn(
            "text-[11px] rounded px-2 py-1.5 break-words border",
            status.kind === "ok"
              ? "bg-emerald-900/30 text-emerald-200 border-emerald-500/30"
              : status.kind === "err"
                ? "bg-red-900/30 text-red-200 border-red-500/30"
                : "bg-cyan-900/30 text-cyan-100 border-cyan-500/30",
          )}
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}
