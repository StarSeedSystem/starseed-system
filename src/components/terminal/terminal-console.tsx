"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Terminal integrada (consola sandbox sobre el propio OS)
// ----------------------------------------------------------------
// Una terminal DENTRO del OS: NO es una shell real. No ejecuta comandos
// del sistema; es una interfaz de comandos SANDBOX sobre los datos y las
// acciones del propio StarSeed (memorias conectadas, cerebros, dispositivos
// online, navegación por rutas…). El despachador (`COMMANDS`) está diseñado
// para EXTENDERSE más tarde y enrutar a un runtime de cerebro.
//
// • Historial de líneas + prompt + comandos integrados seguros:
//     help · echo · clear · whoami · mem ls · brains ls · devices ls ·
//     open <ruta> · history · about
// • Persistencia del historial de comandos en localStorage.
// • SSR-safe ("use client"), defensivo (guards / try-catch en todo I/O).
//
// Estética: terminal de cristal StarSeed (glass, mono, acento esmeralda).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import {
  TerminalSquare,
  CornerDownLeft,
  Eraser,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { readRoots, type ConnectedRoot } from "@/lib/memory-sync/connect";
import { listBrains, type Brain } from "@/lib/brains/brains";
import { listDevices, type DeviceServer } from "@/lib/terminal/devices";

/** Clave de localStorage del historial de comandos de la terminal. */
const HISTORY_KEY = "starseed.terminal.history.v1";
/** Máximo de comandos recordados (anti-crecimiento de localStorage). */
const HISTORY_MAX = 200;

/** Tipo de línea renderizada en la consola. */
type LineKind = "in" | "out" | "err" | "sys";

interface ConsoleLine {
  id: string;
  kind: LineKind;
  text: string;
}

/** Contexto que recibe cada comando para acceder a datos / acciones del OS. */
export interface CommandContext {
  /** Sesión: identidad ligera del usuario (whoami). */
  session: { userId: string | null; handle: string | null };
  /** Navegación por rutas del OS (open <ruta>). */
  navigate: (path: string) => void;
  /** Imprime líneas de salida (out/err/sys). */
  print: (text: string, kind?: LineKind) => void;
  /** Limpia la consola. */
  clear: () => void;
  /** Historial de comandos (más reciente al final). */
  history: string[];
  /** Dispositivos online vistos por el panel (presencia), si se inyectan. */
  devices?: DeviceServer[];
}

/** Definición de un comando del despachador (extensible a runtime de cerebro). */
export interface CommandDef {
  name: string;
  usage: string;
  blurb: string;
  /** Ejecuta el comando. Puede ser async (p.ej. consultas a Supabase). */
  run: (args: string[], ctx: CommandContext) => void | Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Persistencia del historial (localStorage, SSR-safe + defensivo)     */
/* ------------------------------------------------------------------ */

function readHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY) ?? "";
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeHistory(items: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = items.slice(-HISTORY_MAX);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

/* ------------------------------------------------------------------ */
/* Despachador de comandos (SANDBOX — sólo datos/acciones del OS)       */
/* ------------------------------------------------------------------ */

/**
 * Tabla de comandos. Está pensada para EXTENDERSE: añadir aquí un comando
 * que enrute a un runtime de cerebro (p.ej. `run <cerebro> <tarea>`) sin
 * tocar el resto de la consola.
 */
function buildCommands(): Record<string, CommandDef> {
  const defs: CommandDef[] = [
    {
      name: "help",
      usage: "help",
      blurb: "Lista los comandos disponibles.",
      run: (_args, ctx) => {
        ctx.print("Comandos disponibles (consola sandbox del OS):", "sys");
        for (const c of Object.values(COMMANDS)) {
          ctx.print(`  ${c.usage.padEnd(18)} ${c.blurb}`, "out");
        }
        ctx.print("Esta terminal NO ejecuta órdenes del sistema: opera sobre los datos del OS.", "sys");
      },
    },
    {
      name: "about",
      usage: "about",
      blurb: "Qué es esta terminal.",
      run: (_args, ctx) => {
        ctx.print("StarSeed Terminal — consola integrada y sandbox.", "sys");
        ctx.print("Interfaz de comandos sobre las memorias, cerebros y dispositivos del OS.", "out");
        ctx.print("Diseñada para enrutar, más adelante, a un runtime de cerebro.", "out");
      },
    },
    {
      name: "echo",
      usage: "echo <texto>",
      blurb: "Imprime el texto recibido.",
      run: (args, ctx) => {
        ctx.print(args.join(" "), "out");
      },
    },
    {
      name: "clear",
      usage: "clear",
      blurb: "Limpia la consola.",
      run: (_args, ctx) => {
        ctx.clear();
      },
    },
    {
      name: "whoami",
      usage: "whoami",
      blurb: "Muestra tu identidad de sesión.",
      run: (_args, ctx) => {
        const { userId, handle } = ctx.session;
        if (!userId) {
          ctx.print("Sin sesión. Inicia sesión para identificarte.", "err");
          return;
        }
        ctx.print(`${handle ? "@" + handle : "(sin handle)"}  ·  uid: ${userId}`, "out");
      },
    },
    {
      name: "history",
      usage: "history",
      blurb: "Lista los últimos comandos ejecutados.",
      run: (_args, ctx) => {
        if (ctx.history.length === 0) {
          ctx.print("(historial vacío)", "sys");
          return;
        }
        ctx.history.slice(-30).forEach((h, i) => ctx.print(`  ${String(i + 1).padStart(3)}  ${h}`, "out"));
      },
    },
    {
      name: "mem",
      usage: "mem ls",
      blurb: "Lista las raíces de memoria conectadas.",
      run: (args, ctx) => {
        const sub = (args[0] || "").toLowerCase();
        if (sub !== "ls") {
          ctx.print("Uso: mem ls", "err");
          return;
        }
        let roots: ConnectedRoot[] = [];
        try {
          roots = readRoots();
        } catch {
          roots = [];
        }
        if (roots.length === 0) {
          ctx.print("No hay raíces de memoria conectadas (starseed.memory.roots.v1).", "sys");
          return;
        }
        ctx.print(`Raíces de memoria conectadas (${roots.length}):`, "sys");
        for (const r of roots) {
          const branches = Array.isArray(r.branches) ? r.branches.length : 0;
          const src = r.url ? r.url : "texto pegado";
          ctx.print(`  • ${r.name}  ·  ${branches} rama(s)  ·  ${src}`, "out");
        }
      },
    },
    {
      name: "brains",
      usage: "brains ls",
      blurb: "Lista tus cerebros.",
      run: async (args, ctx) => {
        const sub = (args[0] || "").toLowerCase();
        if (sub !== "ls") {
          ctx.print("Uso: brains ls", "err");
          return;
        }
        let brains: Brain[] = [];
        try {
          brains = await listBrains();
        } catch {
          brains = [];
        }
        if (brains.length === 0) {
          ctx.print("No tienes cerebros (o no hay sesión). Crea uno en /agent.", "sys");
          return;
        }
        ctx.print(`Cerebros (${brains.length}):`, "sys");
        for (const b of brains) {
          const servers = Array.isArray(b.servers) ? b.servers.length : 0;
          ctx.print(`  • ${b.name}  ·  alcance ${b.scope}  ·  ${servers} servidor(es)`, "out");
        }
      },
    },
    {
      name: "devices",
      usage: "devices ls",
      blurb: "Lista los dispositivos online (servidores).",
      run: async (args, ctx) => {
        const sub = (args[0] || "").toLowerCase();
        if (sub !== "ls") {
          ctx.print("Uso: devices ls", "err");
          return;
        }
        // Prefiere los dispositivos en vivo del panel (presencia) si se inyectan;
        // si no, cae al snapshot de listDevices (este dispositivo + capacidades).
        let devices: DeviceServer[] = ctx.devices ?? [];
        if (devices.length === 0) {
          try {
            devices = await listDevices();
          } catch {
            devices = [];
          }
        }
        if (devices.length === 0) {
          ctx.print("No hay dispositivos visibles ahora mismo.", "sys");
          return;
        }
        ctx.print(`Dispositivos online (${devices.length}):`, "sys");
        for (const d of devices) {
          const caps = (d.capabilities || []).join(", ") || "—";
          const dot = d.online ? "●" : "○";
          ctx.print(`  ${dot} ${d.name}  ·  ${caps}`, "out");
        }
      },
    },
    {
      name: "open",
      usage: "open <ruta>",
      blurb: "Navega a una ruta del OS (router push).",
      run: (args, ctx) => {
        const raw = (args[0] || "").trim();
        if (!raw) {
          ctx.print("Uso: open <ruta>  (p.ej. open /dashboard)", "err");
          return;
        }
        // Sólo rutas internas relativas: nada de protocolos externos.
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) {
          ctx.print("Sólo se permiten rutas internas del OS (que empiezan por «/»).", "err");
          return;
        }
        const path = raw.startsWith("/") ? raw : `/${raw}`;
        ctx.print(`Abriendo ${path}…`, "sys");
        ctx.navigate(path);
      },
    },
  ];

  const map: Record<string, CommandDef> = {};
  for (const d of defs) map[d.name] = d;
  return map;
}

/** Tabla de comandos (singleton del módulo). */
const COMMANDS: Record<string, CommandDef> = buildCommands();

/**
 * Parte una línea de comando respetando comillas simples/dobles, de forma
 * que `echo "hola mundo"` cuente como un solo argumento.
 */
function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

let LINE_SEQ = 0;
function nextLineId(): string {
  LINE_SEQ += 1;
  return `ln_${Date.now().toString(36)}_${LINE_SEQ}`;
}

export interface TerminalConsoleProps {
  /** Dispositivos online en vivo (de la presencia del panel), opcional. */
  devices?: DeviceServer[];
  /** Handle/usuario opcional para acelerar `whoami` sin round-trip. */
  handle?: string | null;
  className?: string;
}

export default function TerminalConsole({ devices, handle, className }: TerminalConsoleProps) {
  const router = useRouter();

  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number>(-1); // navegación con flechas
  const [session, setSession] = useState<{ userId: string | null; handle: string | null }>({
    userId: null,
    handle: handle ?? null,
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ---- arranque: identidad de sesión + historial persistido + bienvenida ---- */

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        const uid = data?.user?.id ?? null;
        const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const h =
          handle ??
          (typeof meta.handle === "string"
            ? meta.handle
            : typeof meta.user_name === "string"
              ? (meta.user_name as string)
              : null);
        if (active) setSession({ userId: uid, handle: h });
      } catch {
        if (active) setSession({ userId: null, handle: handle ?? null });
      }
    })();
    return () => {
      active = false;
    };
  }, [handle]);

  // Banner de bienvenida (una sola vez al montar).
  useEffect(() => {
    setLines([
      { id: nextLineId(), kind: "sys", text: "StarSeed Terminal · consola integrada (sandbox)" },
      { id: nextLineId(), kind: "out", text: "Escribe «help» para ver los comandos. No es una shell del sistema." },
    ]);
  }, []);

  // Autoscroll al final cuando llegan líneas nuevas.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  /* ---- API que reciben los comandos ---- */

  const print = useCallback((text: string, kind: LineKind = "out") => {
    // Permite imprimir bloques multilínea preservando saltos.
    const parts = String(text ?? "").split("\n");
    setLines((cur) => [...cur, ...parts.map((p) => ({ id: nextLineId(), kind, text: p }))]);
  }, []);

  const clearConsole = useCallback(() => {
    setLines([]);
  }, []);

  const navigate = useCallback(
    (path: string) => {
      try {
        router.push(path);
      } catch {
        print(`No se pudo navegar a ${path}.`, "err");
      }
    },
    [router, print],
  );

  const ctx: CommandContext = useMemo(
    () => ({ session, navigate, print, clear: clearConsole, history, devices }),
    [session, navigate, print, clearConsole, history, devices],
  );

  /* ---- ejecución de una línea ---- */

  const execute = useCallback(
    async (raw: string) => {
      const line = raw.trim();
      // Eco del prompt + comando.
      setLines((cur) => [...cur, { id: nextLineId(), kind: "in", text: line }]);
      if (!line) return;

      // Persistir en historial (evita duplicado consecutivo).
      setHistory((cur) => {
        const next = cur[cur.length - 1] === line ? cur : [...cur, line];
        writeHistory(next);
        return next;
      });
      setCursor(-1);

      const tokens = tokenize(line);
      const name = (tokens[0] || "").toLowerCase();
      const args = tokens.slice(1);
      const cmd = COMMANDS[name];
      if (!cmd) {
        print(`Comando no reconocido: «${name}». Escribe «help».`, "err");
        return;
      }
      try {
        await cmd.run(args, ctx);
      } catch {
        print(`Error ejecutando «${name}».`, "err");
      }
    },
    [ctx, print],
  );

  /* ---- input + navegación con flechas por el historial ---- */

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = input;
        setInput("");
        void execute(v);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (history.length === 0) return;
        const idx = cursor < 0 ? history.length - 1 : Math.max(0, cursor - 1);
        setCursor(idx);
        setInput(history[idx] ?? "");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (history.length === 0 || cursor < 0) return;
        const idx = cursor + 1;
        if (idx >= history.length) {
          setCursor(-1);
          setInput("");
        } else {
          setCursor(idx);
          setInput(history[idx] ?? "");
        }
        return;
      }
      if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        clearConsole();
      }
    },
    [input, execute, history, cursor, clearConsole],
  );

  const prompt = session.handle ? `${session.handle}@starseed` : "invitado@starseed";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-emerald-500/25 bg-black/50 shadow-[0_0_40px_-12px_rgba(16,185,129,0.35)] backdrop-blur-md",
        className,
      )}
    >
      {/* Barra de título estilo terminal de cristal */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-gradient-to-r from-emerald-950/40 to-transparent px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </div>
        <TerminalSquare className="ml-1 h-4 w-4 text-emerald-300" />
        <span className="text-xs font-semibold tracking-wide text-emerald-50">StarSeed Terminal</span>
        <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-emerald-400/25 px-2 py-0.5 text-[9px] text-emerald-200/80">
          <Sparkles className="h-2.5 w-2.5" /> sandbox
        </span>
        <button
          onClick={clearConsole}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/50 hover:border-emerald-400/30 hover:text-emerald-100"
          title="Limpiar consola (Ctrl/Cmd+L)"
        >
          <Eraser className="h-3 w-3" /> Limpiar
        </button>
      </div>

      {/* Salida */}
      <div
        ref={scrollRef}
        className="scrollbar-hide h-[360px] overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((l) => (
          <div
            key={l.id}
            className={cn(
              "whitespace-pre-wrap break-words",
              l.kind === "in" && "text-emerald-100",
              l.kind === "out" && "text-white/80",
              l.kind === "err" && "text-red-300",
              l.kind === "sys" && "text-emerald-300/70",
            )}
          >
            {l.kind === "in" ? (
              <span>
                <span className="text-emerald-400/80">{prompt}</span>
                <span className="text-white/30"> $ </span>
                {l.text}
              </span>
            ) : (
              l.text
            )}
          </div>
        ))}
      </div>

      {/* Prompt de entrada */}
      <div className="flex items-center gap-2 border-t border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px]">
        <span className="shrink-0 text-emerald-400/80">{prompt}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Entrada de la terminal"
          placeholder="escribe un comando… (help)"
          className="min-w-0 flex-1 bg-transparent text-emerald-50 placeholder:text-white/25 focus:outline-none"
        />
        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-white/20" />
      </div>
    </div>
  );
}
