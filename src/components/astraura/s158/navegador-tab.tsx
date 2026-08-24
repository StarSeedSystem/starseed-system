"use client";

/**
 * STUDIO 1.58 · Navegador Autónomo — el agente de navegación del backend
 * soberano: URL directa, búsqueda web, catálogo de acciones que ofrece el OS
 * (el backend puede rechazar las que no soporte), «Indexar en memoria» del
 * resultado actual, historial de la sesión (estado local del componente, sin
 * persistencia) y aviso honesto de air-gap.
 *
 * NUNCA se pinta HTML remoto: solo texto/extractos ya saneados por el
 * backend — sin `dangerouslySetInnerHTML` en ningún punto de este archivo.
 */

import { useRef, useState } from "react";
import { BookmarkPlus, Compass, ExternalLink, Globe, History, Link2, Route, Search, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchAstraura158Privacy, indexAstraura158BrowserMemory, navigateAstraura158Browser, runAstraura158BrowserAction, searchAstraura158Browser,
  type Astraura158BrowserPage, type Astraura158BrowserSearch, type Astraura158BrowserSearchItem, type Astraura158Response,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, INPUT, MONO, SELECT, SUB, SectionTitle, fmtAgo, runS158, useBusy, useS158Load, type S158TabProps } from "./shared";

/** Captura el `data` de una respuesta con éxito para poder usarlo en `after` (que `runS158` no expone). */
function withCapture<T>(fn: () => Promise<Astraura158Response<T>>) {
  let captured: T | undefined;
  return {
    call: async () => {
      const r = await fn();
      if (r.ok) captured = r.data;
      return r;
    },
    get: () => captured,
  };
}

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  return `https://${v}`;
}

const AGENT_ACTIONS: { id: string; label: string; hint: string }[] = [
  { id: "extract_text", label: "Extraer texto", hint: "Extrae el texto principal de la página actual." },
  { id: "screenshot", label: "Captura", hint: "Pide una captura de la página actual." },
  { id: "scroll", label: "Bajar", hint: "Baja en la página actual." },
  { id: "go_back", label: "Atrás", hint: "Vuelve a la página anterior del agente." },
  { id: "go_forward", label: "Adelante", hint: "Avanza a la página siguiente del agente." },
  { id: "click", label: "Clic en selector", hint: "Usa el selector (CSS) del campo de abajo." },
];

interface HistoryItem { id: number; kind: "navegación" | "búsqueda" | "acción"; label: string; at: number }

export function NavegadorTab({ target, onNavigate }: S158TabProps) {
  const priv = useS158Load(fetchAstraura158Privacy, target);
  const { busy, wrap } = useBusy();
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [selector, setSelector] = useState("");
  const [selectedAction, setSelectedAction] = useState(AGENT_ACTIONS[0].id);
  const [page, setPage] = useState<Astraura158BrowserPage | null>(null);
  const [results, setResults] = useState<Astraura158BrowserSearchItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const histIdRef = useRef(0);

  const airGap = priv.data?.air_gap_active === true;
  const disabled = busy !== "" || airGap;

  const pushHistory = (kind: HistoryItem["kind"], label: string) => {
    histIdRef.current += 1;
    setHistory((prev) => [{ id: histIdRef.current, kind, label, at: Date.now() }, ...prev].slice(0, 30));
  };

  const doNavigate = (rawUrl?: string) => {
    const u = normalizeUrl(rawUrl ?? url);
    if (!u || disabled) return;
    setUrl(u);
    const cap = withCapture<Astraura158BrowserPage>(() => navigateAstraura158Browser(target, u));
    void wrap("navigate", () => runS158("Navegación completada", cap.call, {
      description: (d) => d.title ?? d.final_url ?? d.url,
      after: () => {
        const d = cap.get();
        if (d) { setPage(d); pushHistory("navegación", d.title ?? d.final_url ?? d.url ?? u); }
      },
    }));
  };

  const doSearch = () => {
    const q = query.trim();
    if (!q || disabled) return;
    const cap = withCapture<Astraura158BrowserSearch>(() => searchAstraura158Browser(target, q, 8));
    void wrap("search", () => runS158("Búsqueda completada", cap.call, {
      description: (d) => `${(d.results ?? []).length} resultado(s)`,
      after: () => {
        const d = cap.get();
        setResults(d?.results ?? []);
        pushHistory("búsqueda", q);
      },
    }));
  };

  const doAction = () => {
    if (disabled) return;
    const params: Record<string, unknown> = selector.trim() ? { selector: selector.trim() } : {};
    const actionLabel = AGENT_ACTIONS.find((a) => a.id === selectedAction)?.label ?? selectedAction;
    void wrap("action", () => runS158(`Acción «${actionLabel}» enviada`, () => runAstraura158BrowserAction(target, selectedAction, params), {
      description: (d) => (typeof d.message === "string" && d.message) || undefined,
      after: () => pushHistory("acción", actionLabel),
    }));
  };

  const doIndexMemory = () => {
    if (!page || disabled) return;
    const label = page.title ?? page.final_url ?? page.url ?? "página actual";
    void wrap("index", () => runS158("Resultado indexado en memoria", () => indexAstraura158BrowserMemory(target, {
      url: page.final_url ?? page.url,
      title: page.title,
      content: (page.excerpt ?? page.text ?? "").slice(0, 4000),
      category: "navegador",
    }), {
      after: () => pushHistory("acción", `indexado: ${label}`),
    }));
  };

  return (
    <div className="space-y-3">
      {airGap && (
        <div className={cn(CARD, "border-rose-400/30 p-3")}>
          <SectionTitle
            icon={ShieldOff}
            title="Navegador deshabilitado: air-gap ACTIVO"
            tone="text-rose-300"
            hint="Con el air-gap soberano activo el backend no toca la web externa por diseño: navegar, buscar, ejecutar acciones e indexar quedan deshabilitados aquí."
            right={onNavigate ? <button type="button" className={BTN} onClick={() => onNavigate("sentidos")} aria-label="Ir a Sentidos y Privacidad">Ir a Sentidos y Privacidad</button> : undefined}
          />
        </div>
      )}

      {/* Navegar */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Globe} title="Navegar" tone="text-cyan-300" hint="POST /api/browser/navigate — el backend visita la URL y devuelve texto/extracto ya saneado." />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className={cn(INPUT, "min-w-64 flex-1")} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ejemplo.org o https://ejemplo.org" aria-label="URL a navegar" disabled={disabled}
            onKeyDown={(e) => { if (e.key === "Enter") doNavigate(); }} />
          <button type="button" className={BTN_PRIMARY} disabled={disabled || !url.trim()} aria-label="Navegar" onClick={() => doNavigate()}>
            <BusyIcon busy={busy === "navigate"} icon={Compass} /> Navegar
          </button>
        </div>
        {!page && <p className="mt-2 text-[11px] text-white/50">Sin página cargada todavía.</p>}
        {page && (
          <div className={cn(SUB, "mt-2 flex flex-col gap-1 px-3 py-2")}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{page.title ?? "(sin título)"}</p>
              {page.status_code != null && <Badge tone="border-white/10 text-white/60">HTTP {page.status_code}</Badge>}
            </div>
            <p className="truncate text-[10px] text-white/50" title={page.final_url ?? page.url}>{page.final_url ?? page.url}</p>
            {(page.excerpt ?? page.text) && <p className="line-clamp-4 text-[11px] leading-snug text-white/70">{page.excerpt ?? page.text}</p>}
            <button type="button" className={cn(BTN, "mt-1 self-start")} disabled={disabled} aria-label="Indexar en memoria" onClick={doIndexMemory}>
              <BusyIcon busy={busy === "index"} icon={BookmarkPlus} /> Indexar en memoria
            </button>
          </div>
        )}
      </div>

      {/* Buscar */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Search} title="Buscar" tone="text-emerald-300" hint="POST /api/browser/search — resultados con título, enlace y extracto (texto, nunca HTML crudo)." />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className={cn(INPUT, "min-w-64 flex-1")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Qué buscar…" aria-label="Búsqueda" disabled={disabled}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }} />
          <button type="button" className={BTN_PRIMARY} disabled={disabled || !query.trim()} aria-label="Buscar" onClick={doSearch}>
            <BusyIcon busy={busy === "search"} icon={Search} /> Buscar
          </button>
        </div>
        <div className="mt-2 space-y-1.5">
          {results.length === 0 && <p className="text-[11px] text-white/50">Sin resultados todavía.</p>}
          {results.slice(0, 10).map((r, i) => {
            const link = r.url ?? r.link ?? "";
            return (
              <div key={link || i} className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
                <div className="flex items-center gap-2">
                  <Link2 className="h-3 w-3 shrink-0 text-white/40" aria-hidden="true" />
                  <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/85">{r.title ?? link ?? "(sin título)"}</p>
                  {link && (
                    <button type="button" className={cn(BTN, "px-1.5 py-0.5 text-[10px]")} disabled={disabled} aria-label={`Abrir ${r.title ?? link}`} onClick={() => doNavigate(link)}>
                      <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" /> Abrir
                    </button>
                  )}
                </div>
                {link && <p className="truncate text-[10px] text-white/45">{link}</p>}
                {(r.excerpt ?? r.snippet) && <p className="line-clamp-2 text-[10px] leading-snug text-white/60">{r.excerpt ?? r.snippet}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Acciones del agente */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Route} title="Acciones del agente" tone="text-violet-300" hint="Catálogo que ofrece el OS (no hay endpoint de catálogo en el backend): el backend puede rechazar la que no soporte." />
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-code text-[10px] uppercase tracking-wide text-white/45">Acción</span>
            <select className={SELECT} value={selectedAction} onChange={(e) => setSelectedAction(e.target.value)} aria-label="Acción del agente" disabled={disabled}>
              {AGENT_ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className="flex flex-1 min-w-40 flex-col gap-1">
            <span className="font-code text-[10px] uppercase tracking-wide text-white/45">Selector (opcional, para «Clic en selector»)</span>
            <input className={INPUT} value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="#id, .clase, button…" aria-label="Selector CSS" disabled={disabled} />
          </label>
          <button type="button" className={BTN} disabled={disabled} aria-label="Ejecutar acción" onClick={doAction}>
            <BusyIcon busy={busy === "action"} icon={Route} /> Ejecutar acción
          </button>
        </div>
        <p className="mt-1 text-[10px] text-white/45">{AGENT_ACTIONS.find((a) => a.id === selectedAction)?.hint}</p>
      </div>

      {/* Historial de la sesión */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={History} title={`Historial de la sesión (${history.length})`} tone="text-white/70" hint="Solo en este navegador y esta sesión: no se guarda en el backend." />
        {history.length === 0 && <Empty text="Sin actividad todavía." />}
        {history.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {history.map((h) => (
              <li key={h.id} className="truncate text-[10px] text-white/55">
                <span className={MONO}>{fmtAgo(Math.floor(h.at / 1000))}</span> · {h.kind} · {h.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default NavegadorTab;
