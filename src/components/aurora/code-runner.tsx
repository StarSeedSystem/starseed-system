"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EJECUTOR DE CÓDIGO DEL CHAT (Ola 4 · Adenda 156)
 * ---------------------------------------------------------------------------
 * La tarjeta que convierte un bloque de código de CUALQUIER chat (orbe,
 * Exocórtex, /agent, consejo, Astraura IA) en un programa vivo:
 *   · Ejecutar · Detener · Cerrar (vuelve al bloque de código normal)
 *   · Modo de uso: vista · código · dividido · consola
 *   · Tamaño: S · M · L · pantalla completa (+ arrastre del borde inferior)
 *   · Abrir en ventana nueva y en pestaña nueva del OS
 *   · Consola integrada (log/info/warn/error + errores no capturados)
 *   · Copiar y descargar
 *
 * Aislamiento REAL: iframe `sandbox="allow-scripts allow-modals allow-popups"`
 * SIN `allow-same-origin` ⇒ origen opaco. El programa no puede tocar la sesión,
 * el almacenamiento ni el DOM del OS; solo habla por `postMessage` (consola).
 *
 * Lo que NO se ejecuta aquí (honestidad): Python y shell. Se ofrece copiarlos y,
 * si hay backend soberano en la neurona, abrir su Terminal & Sandbox.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Square, X, Columns2, Code2, Terminal as TerminalIcon, Eye, Maximize2, Minimize2,
  ExternalLink, PanelRightOpen, Copy, Check, Download, AlertTriangle, Binary,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CODE_RUNTIME_EVENT, CODE_SIZE_PX, buildSandboxDoc, detectRunnable, directivesFor, extensionFor,
  isRuntimeMessage, readCodeRuntimePrefs, type CodeSize, type CodeViewMode, type ConsoleEntry,
} from "@/lib/aurora/code-runtime";

export interface CodeRunnerProps {
  lang: string;
  code: string;
  /** `info string` completo del fence (para leer directivas: run, mode, height…). */
  info?: string;
  className?: string;
  /** Render del bloque plano cuando el usuario cierra el ejecutor. */
  fallback?: React.ReactNode;
}

const BTN = "inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/85 transition-colors hover:border-cyan-400/40 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_ON = "border-cyan-400/40 bg-cyan-500/15 text-cyan-100";
const LEVEL_TONE: Record<ConsoleEntry["level"], string> = {
  log: "text-white/75",
  info: "text-cyan-200",
  warn: "text-amber-200",
  error: "text-rose-200",
};

const MODES: { id: CodeViewMode; label: string; icon: typeof Eye }[] = [
  { id: "vista", label: "Vista", icon: Eye },
  { id: "codigo", label: "Código", icon: Code2 },
  { id: "dividido", label: "Dividido", icon: Columns2 },
  { id: "consola", label: "Consola", icon: TerminalIcon },
];

export function CodeRunner({ lang, code, info, className, fallback }: CodeRunnerProps) {
  const prefs = useCodeRuntimePrefs();
  const directives = useMemo(() => directivesFor(info ?? lang, code), [info, lang, code]);
  const runnable = useMemo(() => detectRunnable(lang, code), [lang, code]);

  const [closed, setClosed] = useState(false);
  const [running, setRunning] = useState(false);
  const [doc, setDoc] = useState<string>("");
  const [mode, setMode] = useState<CodeViewMode>(directives.mode ?? prefs.mode);
  const [size, setSize] = useState<CodeSize>(directives.size ?? prefs.size);
  const [height, setHeight] = useState<number>(directives.height ?? CODE_SIZE_PX[prefs.size]);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [nonce, setNonce] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const logId = useRef(0);

  const tools = directives.tools;
  const showTool = useCallback((id: string) => !tools || tools.includes(id), [tools]);

  /* Consola: escucha SOLO los mensajes de nuestro iframe. */
  useEffect(() => {
    if (!running) return;
    const onMessage = (e: MessageEvent) => {
      if (frameRef.current && e.source !== frameRef.current.contentWindow) return;
      if (!isRuntimeMessage(e.data)) return;
      if (e.data.type !== "console") return;
      const level = (["log", "info", "warn", "error"] as const).includes(e.data.level as "log") ? (e.data.level as ConsoleEntry["level"]) : "log";
      const text = (e.data.args ?? []).map((a) => String(a)).join(" ").slice(0, 4000);
      setLogs((prev) => [...prev.slice(-199), { id: ++logId.current, level, text, at: Date.now() }]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [running]);

  const run = useCallback(() => {
    try {
      setLogs([]);
      setDoc(buildSandboxDoc(runnable.kind, code, { allowCdn: prefs.allowCdn }));
      setNonce((n) => n + 1);
      setRunning(true);
      if (prefs.alwaysConsole && mode === "vista") setMode("dividido");
    } catch {
      setLogs([{ id: ++logId.current, level: "error", text: "No se pudo preparar el entorno aislado.", at: Date.now() }]);
    }
  }, [runnable.kind, code, prefs.allowCdn, prefs.alwaysConsole, mode]);

  const stop = useCallback(() => { setRunning(false); setDoc(""); }, []);

  /* Autorun: por directiva del propio bloque o por preferencia global. */
  useEffect(() => {
    if (!runnable.inBrowser || closed) return;
    if (directives.norun) return;
    if (directives.autorun || prefs.autorun) run();
    // Solo al montar / cambiar el bloque: no re-ejecuta con cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, runnable.inBrowser]);

  const openWindow = useCallback(() => {
    try {
      const html = doc || buildSandboxDoc(runnable.kind, code, { allowCdn: prefs.allowCdn });
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer,width=1100,height=760");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { /* el navegador puede bloquear ventanas emergentes */ }
  }, [doc, runnable.kind, code, prefs.allowCdn]);

  const openTab = useCallback(() => {
    try {
      const html = doc || buildSandboxDoc(runnable.kind, code, { allowCdn: prefs.allowCdn });
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { /* */ }
  }, [doc, runnable.kind, code, prefs.allowCdn]);

  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* */ }
  }, [code]);

  const download = useCallback(() => {
    try {
      const ext = extensionFor(runnable.kind, lang);
      const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(directives.title || "starseed-bloque").replace(/[^\w.-]+/g, "-").toLowerCase()}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { /* */ }
  }, [code, lang, runnable.kind, directives.title]);

  /* Arrastre del borde inferior para altura libre. */
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const next = Math.max(160, Math.min(1400, dragRef.current.h + (e.clientY - dragRef.current.y)));
      setHeight(next);
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  useEffect(() => { if (size !== "full") setHeight(directives.height ?? CODE_SIZE_PX[size as "s" | "m" | "l"]); }, [size, directives.height]);

  /* Escape sale de pantalla completa. */
  useEffect(() => {
    if (size !== "full") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSize(prefs.size); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [size, prefs.size]);

  // Bloque no ejecutable o cerrado por el usuario: el render de siempre.
  if (closed || (runnable.kind === "inerte" && !directives.run)) return <>{fallback}</>;

  const errors = logs.filter((l) => l.level === "error").length;
  const title = directives.title || `${runnable.label}${lang ? ` · ${lang}` : ""}`;

  const body = (
    <div className={cn("overflow-hidden rounded-xl border border-cyan-400/20 bg-black/50 backdrop-blur-md", size === "full" && "flex h-full flex-col", className)}>
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 bg-white/[0.03] px-2 py-1.5">
        <Binary className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
        <span className="mr-1 min-w-0 truncate font-code text-[10px] uppercase tracking-wide text-white/55">{title}</span>

        {runnable.inBrowser && (
          running ? (
            <button type="button" className={BTN} onClick={stop} aria-label="Detener la ejecución"><Square className="h-3 w-3" aria-hidden="true" /> Detener</button>
          ) : (
            <button type="button" className={cn(BTN, "border-cyan-400/40 bg-cyan-500/10 text-cyan-100")} onClick={run} aria-label="Ejecutar el programa"><Play className="h-3 w-3" aria-hidden="true" /> Ejecutar</button>
          )
        )}

        {running && (
          <div className="flex items-center gap-0.5" role="tablist" aria-label="Modo de uso del código">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} aria-label={`Modo ${m.label}`}
                  className={cn(BTN, "px-1.5", mode === m.id && BTN_ON)} onClick={() => setMode(m.id)}>
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  <span className="hidden sm:inline">{m.label}</span>
                  {m.id === "consola" && logs.length > 0 && (
                    <span className={cn("ml-0.5 rounded-full px-1 text-[9px]", errors ? "bg-rose-500/20 text-rose-100" : "bg-white/10 text-white/70")}>{logs.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {running && (["s", "m", "l"] as const).map((s) => (
            <button key={s} type="button" aria-label={`Tamaño ${s.toUpperCase()}`} aria-pressed={size === s}
              className={cn(BTN, "px-1.5 uppercase", size === s && BTN_ON)} onClick={() => setSize(s)}>{s}</button>
          ))}
          {running && (
            <button type="button" className={cn(BTN, "px-1.5", size === "full" && BTN_ON)} aria-label={size === "full" ? "Salir de pantalla completa" : "Pantalla completa"}
              onClick={() => setSize(size === "full" ? prefs.size : "full")}>
              {size === "full" ? <Minimize2 className="h-3 w-3" aria-hidden="true" /> : <Maximize2 className="h-3 w-3" aria-hidden="true" />}
            </button>
          )}
          {runnable.inBrowser && showTool("ventana") && (
            <button type="button" className={BTN} onClick={openWindow} aria-label="Abrir en una ventana nueva"><PanelRightOpen className="h-3 w-3" aria-hidden="true" /><span className="hidden md:inline">Ventana</span></button>
          )}
          {runnable.inBrowser && showTool("pestana") && (
            <button type="button" className={BTN} onClick={openTab} aria-label="Abrir en una pestaña nueva"><ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="hidden md:inline">Pestaña</span></button>
          )}
          {showTool("descargar") && (
            <button type="button" className={BTN} onClick={download} aria-label="Descargar el archivo"><Download className="h-3 w-3" aria-hidden="true" /></button>
          )}
          <button type="button" className={BTN} onClick={() => { void copy(); }} aria-label="Copiar el código">
            {copied ? <Check className="h-3 w-3 text-emerald-300" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
          </button>
          <button type="button" className={BTN} onClick={() => { stop(); setClosed(true); }} aria-label="Cerrar el ejecutor y ver solo el código"><X className="h-3 w-3" aria-hidden="true" /></button>
        </div>
      </div>

      {/* Aviso honesto para lo que no corre en el navegador */}
      {!runnable.inBrowser && (
        <div className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-snug text-amber-100/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {runnable.note ?? "Este bloque no se ejecuta en el navegador."}{" "}
            {prefs.allowBackend && (
              <a className="underline underline-offset-2 hover:text-amber-50" href="/agent?tab=astraura-158&sub=terminal">Abrir Terminal &amp; Sandbox del backend soberano</a>
            )}
          </span>
        </div>
      )}

      {/* Cuerpo: vista / código / dividido / consola */}
      {running ? (
        <div className={cn("flex", mode === "dividido" ? "flex-col lg:flex-row" : "flex-col", size === "full" && "min-h-0 flex-1")}
          style={size === "full" ? undefined : { height }}>
          {(mode === "vista" || mode === "dividido") && (
            <iframe
              key={nonce}
              ref={frameRef}
              title={`Ejecución aislada: ${title}`}
              srcDoc={doc}
              sandbox="allow-scripts allow-modals allow-popups"
              referrerPolicy="no-referrer"
              className={cn("min-h-0 w-full flex-1 border-0 bg-black", mode === "dividido" && "lg:w-1/2")}
            />
          )}
          {(mode === "codigo" || mode === "dividido") && (
            <pre className={cn("min-h-0 flex-1 overflow-auto border-white/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/80",
              mode === "dividido" && "border-t lg:w-1/2 lg:border-l lg:border-t-0")}>{code}</pre>
          )}
          {mode === "consola" && <ConsolePane logs={logs} onClear={() => setLogs([])} />}
        </div>
      ) : (
        <div className="max-h-80 overflow-auto">
          <pre className="px-3 py-2 font-mono text-[11px] leading-relaxed text-white/80">{code}</pre>
        </div>
      )}

      {/* Consola compacta bajo la vista (cuando no es el modo principal) */}
      {running && mode !== "consola" && logs.length > 0 && (
        <ConsolePane logs={logs.slice(-4)} compact onClear={() => setLogs([])} />
      )}

      {/* Tirador para altura libre */}
      {running && size !== "full" && (
        <div
          role="separator"
          aria-label="Arrastra para cambiar la altura"
          className="h-1.5 cursor-ns-resize bg-white/[0.06] transition-colors hover:bg-cyan-400/30"
          onPointerDown={(e) => { dragRef.current = { y: e.clientY, h: height }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        />
      )}
    </div>
  );

  if (size === "full" && running) {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col bg-black/85 p-3 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label={`Ejecución a pantalla completa: ${title}`}>
        {body}
      </div>
    );
  }
  return <div className="my-1.5">{body}</div>;
}

/* ───────────────────── Consola ───────────────────── */

function ConsolePane({ logs, compact, onClear }: { logs: ConsoleEntry[]; compact?: boolean; onClear: () => void }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [logs.length]);
  return (
    <div className={cn("min-h-0 flex-1 border-t border-white/10 bg-black/60", compact && "max-h-24")}>
      <div className="flex items-center justify-between border-b border-white/5 px-2 py-1">
        <span className="font-code text-[10px] uppercase tracking-wide text-white/40">Consola</span>
        <button type="button" className="cursor-pointer text-[10px] text-white/50 transition-colors hover:text-white/80" onClick={onClear} aria-label="Limpiar la consola">limpiar</button>
      </div>
      <div className="max-h-full overflow-auto px-2 py-1">
        {logs.length === 0 && <p className="py-1 text-[10px] text-white/35">Sin salida todavía.</p>}
        {logs.map((l) => (
          <p key={l.id} className={cn("whitespace-pre-wrap break-words font-mono text-[10.5px] leading-snug", LEVEL_TONE[l.level])}>
            <span className="mr-1 text-white/25">{l.level === "log" ? "›" : l.level === "error" ? "✕" : l.level === "warn" ? "!" : "i"}</span>{l.text}
          </p>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/* ───────────────────── Preferencias vivas ───────────────────── */

function useCodeRuntimePrefs() {
  const [prefs, setPrefs] = useState(() => readCodeRuntimePrefs());
  useEffect(() => {
    const h = () => setPrefs(readCodeRuntimePrefs());
    window.addEventListener(CODE_RUNTIME_EVENT, h);
    return () => window.removeEventListener(CODE_RUNTIME_EVENT, h);
  }, []);
  return prefs;
}

export default CodeRunner;
