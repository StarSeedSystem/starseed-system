/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RUNTIME DE CÓDIGO EN EL CHAT (Ola 4 · Adenda 156) — capa PURA, SSR-safe.
 * ---------------------------------------------------------------------------
 * SOP: `architecture/astraura-158-ola4-runtime-y-pestanas.md` §1.
 *
 * Todo programa que la IA (o tú) escriba en CUALQUIER chat del OS debe poder
 * ejecutarse ahí mismo. Este módulo NO pinta nada: decide QUÉ es ejecutable,
 * lee las directivas escritas en el propio bloque y construye el documento que
 * se mete en el iframe aislado, con su puente de consola.
 *
 * Aislamiento: el documento se sirve por `srcdoc` en un iframe
 * `sandbox="allow-scripts allow-modals allow-popups"` — SIN `allow-same-origin`
 * ⇒ origen opaco: no puede leer cookies, `localStorage`, ni el DOM del OS.
 * La única comunicación es `postMessage` de vuelta (consola, errores, tamaño).
 *
 * Personalizable «desde el propio código»:
 *   · directivas en el fence:  ```html run autorun mode=split height=520 title="Panel"
 *   · directiva en la 1ª línea: // @starseed run mode=consola size=l
 *   · preferencias del sistema: `starseed.aurora.code-runtime.v1` (sincronizada).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

/* ───────────────────────── Tipos ───────────────────────── */

/** Qué clase de programa es el bloque (y por tanto cómo se ejecuta). */
export type RunnableKind =
  | "pagina"    // html · svg → documento completo
  | "script"    // js · mjs → script en página mínima
  | "estilo"    // css → muestra tipográfica con el estilo aplicado
  | "shader"    // glsl · frag → WebGL2 a pantalla completa
  | "react"     // jsx · tsx → React + Babel desde CDN
  | "backend"   // py · sh → NO corre en el navegador (backend soberano)
  | "inerte";   // json · md · texto → sin ejecución

/** Modo de uso del panel dentro del chat. */
export type CodeViewMode = "vista" | "codigo" | "dividido" | "consola";

/** Tamaño del panel (altura). `full` = superposición a pantalla completa. */
export type CodeSize = "s" | "m" | "l" | "full";

export const CODE_SIZE_PX: Record<Exclude<CodeSize, "full">, number> = { s: 240, m: 400, l: 620 };

/** Directivas declaradas en el propio bloque (fence o primera línea). */
export interface CodeDirectives {
  /** `run` fuerza mostrar el ejecutor; `norun` lo desactiva aunque sea ejecutable. */
  run?: boolean;
  norun?: boolean;
  /** Ejecuta al montar (sin pulsar «Ejecutar»). */
  autorun?: boolean;
  mode?: CodeViewMode;
  size?: CodeSize;
  /** Altura libre en px (gana a `size`). */
  height?: number;
  title?: string;
  /** Herramientas a mostrar (subconjunto de: consola, guardar, descargar, ventana, pestaña). */
  tools?: string[];
}

export interface CodeRuntimePrefs {
  /** Ejecutar automáticamente los bloques ejecutables (por defecto NO). */
  autorun: boolean;
  mode: CodeViewMode;
  size: Exclude<CodeSize, "full">;
  /** Mostrar el panel de consola siempre que se ejecute. */
  alwaysConsole: boolean;
  /** Permitir cargar librerías desde los CDNs ya permitidos por la CSP. */
  allowCdn: boolean;
  /** Ofrecer «enviar al backend soberano» para python/bash. */
  allowBackend: boolean;
}

export const CODE_RUNTIME_KEY = "starseed.aurora.code-runtime.v1";

export const DEFAULT_CODE_RUNTIME_PREFS: CodeRuntimePrefs = {
  autorun: false,
  mode: "vista",
  size: "m",
  alwaysConsole: false,
  allowCdn: true,
  allowBackend: true,
};

/* ───────────────────── Clasificación del bloque ───────────────────── */

const PAGINA = new Set(["html", "htm", "xhtml", "svg", "vue", "svelte"]);
const SCRIPT = new Set(["js", "javascript", "mjs", "ecmascript", "node"]);
const ESTILO = new Set(["css", "scss", "less"]);
const SHADER = new Set(["glsl", "frag", "fragment", "shader", "shaderlab", "fs"]);
const REACT = new Set(["jsx", "tsx", "react"]);
const BACKEND = new Set(["py", "python", "sh", "bash", "zsh", "shell", "console"]);

export interface RunnableInfo {
  kind: RunnableKind;
  /** Etiqueta humana del modo de ejecución (para la UI). */
  label: string;
  /** ¿Se puede ejecutar dentro del navegador, aquí mismo? */
  inBrowser: boolean;
  /** Explicación honesta cuando NO se puede ejecutar aquí. */
  note?: string;
}

/**
 * Decide qué es el bloque a partir del lenguaje del fence y, si no lo hay, del
 * propio contenido (heurística conservadora: ante la duda, «inerte»).
 */
export function detectRunnable(lang: string | undefined, code: string): RunnableInfo {
  const l = String(lang ?? "").trim().toLowerCase();
  const src = String(code ?? "");

  if (PAGINA.has(l)) return { kind: "pagina", label: "página", inBrowser: true };
  if (REACT.has(l)) return { kind: "react", label: "React", inBrowser: true };
  if (SCRIPT.has(l)) return { kind: "script", label: "script", inBrowser: true };
  if (ESTILO.has(l)) return { kind: "estilo", label: "estilo", inBrowser: true };
  if (SHADER.has(l)) return { kind: "shader", label: "shader", inBrowser: true };
  if (BACKEND.has(l)) {
    return {
      kind: "backend",
      label: l.startsWith("p") ? "Python" : "shell",
      inBrowser: false,
      note: "No se ejecuta en el navegador: necesita el backend soberano 1.58 de una neurona tuya.",
    };
  }

  // Sin lenguaje declarado: detección por contenido (solo casos claros).
  if (!l) {
    if (/^\s*<(!doctype|html|svg|body|div|canvas)\b/i.test(src)) return { kind: "pagina", label: "página", inBrowser: true };
    if (/^\s*(precision\s+(highp|mediump|lowp)\s+float|#version\s+300\s+es)\b/m.test(src) || /void\s+main\s*\(\s*\)\s*\{[\s\S]*gl_FragColor|fragColor/.test(src)) {
      return { kind: "shader", label: "shader", inBrowser: true };
    }
  }
  return { kind: "inerte", label: l || "texto", inBrowser: false };
}

/* ───────────────────── Directivas del propio código ───────────────────── */

const MODE_ALIASES: Record<string, CodeViewMode> = {
  vista: "vista", preview: "vista", view: "vista", render: "vista",
  codigo: "codigo", "código": "codigo", code: "codigo", source: "codigo",
  dividido: "dividido", split: "dividido", ambos: "dividido",
  consola: "consola", console: "consola", logs: "consola",
};

const SIZE_ALIASES: Record<string, CodeSize> = {
  s: "s", sm: "s", small: "s", pequeno: "s", "pequeño": "s",
  m: "m", md: "m", medium: "m", medio: "m",
  l: "l", lg: "l", large: "l", grande: "l",
  full: "full", completa: "full", fullscreen: "full", pantalla: "full",
};

/** Parte el `info string` del fence (`html run mode=split height=520`) en directivas. */
export function parseFenceDirectives(info: string | undefined): CodeDirectives {
  const out: CodeDirectives = {};
  const raw = String(info ?? "").trim();
  if (!raw) return out;
  // Tokeniza respetando comillas: title="Panel de sensores"
  const tokens = raw.match(/[^\s"']+="[^"]*"|[^\s"']+='[^']*'|[^\s"']+/g) ?? [];
  for (const token of tokens.slice(0, 24)) {
    const eq = token.indexOf("=");
    const key = (eq >= 0 ? token.slice(0, eq) : token).toLowerCase();
    const value = eq >= 0 ? token.slice(eq + 1).replace(/^["']|["']$/g, "") : "";
    switch (key) {
      case "run": case "ejecutar": out.run = true; break;
      case "norun": case "sinejecutar": out.norun = true; break;
      case "autorun": case "auto": out.autorun = true; out.run = true; break;
      case "mode": case "modo": { const m = MODE_ALIASES[value.toLowerCase()]; if (m) out.mode = m; break; }
      case "size": case "tamano": case "tamaño": { const s = SIZE_ALIASES[value.toLowerCase()]; if (s) out.size = s; break; }
      case "height": case "alto": case "altura": { const n = Number.parseInt(value, 10); if (Number.isFinite(n)) out.height = Math.max(120, Math.min(2000, n)); break; }
      case "title": case "titulo": case "título": if (value) out.title = value.slice(0, 120); break;
      case "tools": case "herramientas": if (value) out.tools = value.split(/[,+|]/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8); break;
      default: break;
    }
  }
  return out;
}

/** Lee `// @starseed run mode=split` (o `# @starseed …`, `<!-- @starseed … -->`) de las primeras líneas. */
export function parseInlineDirectives(code: string): CodeDirectives {
  const head = String(code ?? "").split("\n", 3).join("\n");
  const m = head.match(/(?:\/\/|#|\/\*|<!--)\s*@starseed\s+([^\n*>-]+)/i);
  return m ? parseFenceDirectives(m[1]) : {};
}

/** Directivas efectivas: fence + primera línea (la primera línea gana). */
export function directivesFor(info: string | undefined, code: string): CodeDirectives {
  return { ...parseFenceDirectives(info), ...parseInlineDirectives(code) };
}

/* ───────────────────── Preferencias del sistema ───────────────────── */

export function readCodeRuntimePrefs(): CodeRuntimePrefs {
  try {
    const raw = safeGet(CODE_RUNTIME_KEY);
    if (!raw) return { ...DEFAULT_CODE_RUNTIME_PREFS };
    const parsed = JSON.parse(raw) as Partial<CodeRuntimePrefs>;
    return {
      autorun: parsed.autorun === true,
      mode: MODE_ALIASES[String(parsed.mode ?? "")] ?? DEFAULT_CODE_RUNTIME_PREFS.mode,
      size: (["s", "m", "l"] as const).includes(parsed.size as "s") ? (parsed.size as Exclude<CodeSize, "full">) : DEFAULT_CODE_RUNTIME_PREFS.size,
      alwaysConsole: parsed.alwaysConsole === true,
      allowCdn: parsed.allowCdn !== false,
      allowBackend: parsed.allowBackend !== false,
    };
  } catch {
    return { ...DEFAULT_CODE_RUNTIME_PREFS };
  }
}

export function writeCodeRuntimePrefs(patch: Partial<CodeRuntimePrefs>): CodeRuntimePrefs {
  const next = { ...readCodeRuntimePrefs(), ...patch };
  try {
    safeSet(CODE_RUNTIME_KEY, JSON.stringify(next));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CODE_RUNTIME_EVENT));
  } catch { /* best-effort */ }
  return next;
}

export const CODE_RUNTIME_EVENT = "starseed:code-runtime-prefs";

/* ───────────────────── Puente de consola (dentro del iframe) ───────────────────── */

/** Script que se inyecta en el documento aislado: consola + errores + alto real. */
const BRIDGE = `<script>(function(){
  var send=function(level,args){try{parent.postMessage({__starseed_runtime:1,type:"console",level:level,
    args:Array.prototype.slice.call(args).map(function(a){try{
      if(a instanceof Error)return a.name+": "+a.message;
      if(typeof a==="object"&&a!==null)return JSON.stringify(a,null,1).slice(0,4000);
      return String(a);}catch(e){return "[no serializable]";}})},"*");}catch(e){}};
  ["log","info","warn","error","debug"].forEach(function(k){var orig=console[k];
    console[k]=function(){send(k==="debug"?"log":k,arguments);try{orig&&orig.apply(console,arguments);}catch(e){}};});
  window.addEventListener("error",function(e){send("error",[String(e.message)+(e.filename?" ("+e.lineno+":"+e.colno+")":"")]);});
  window.addEventListener("unhandledrejection",function(e){send("error",["Promesa rechazada: "+String(e.reason&&e.reason.message||e.reason)]);});
  var post=function(){try{parent.postMessage({__starseed_runtime:1,type:"ready",height:Math.min(2000,Math.ceil(document.documentElement.scrollHeight||0))},"*");}catch(e){}};
  window.addEventListener("load",post);setTimeout(post,400);setTimeout(post,1500);
})();<\/script>`;

const BASE_CSS = `<style>
  :root{color-scheme:dark}
  html,body{margin:0;min-height:100%;background:#05070f;color:#e2e8f0;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  body{padding:12px;box-sizing:border-box}
  a{color:#67e8f9}
  canvas{display:block;max-width:100%}
  ::selection{background:#22d3ee40}
</style>`;

const CDN_REACT = [
  "https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js",
  "https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js",
  "https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js",
];

/** Boilerplate WebGL2 para shaders de fragmento (u_time · u_resolution · u_mouse). */
function shaderDoc(fragment: string): string {
  const frag = fragment.includes("#version") ? fragment : `#version 300 es\nprecision highp float;\n${fragment.includes("out ") ? "" : "out vec4 fragColor;\n"}${fragment}`;
  const normalized = frag
    .replace(/gl_FragColor/g, "fragColor")
    .replace(/\bvarying\b/g, "in")
    .replace(/\btexture2D\b/g, "texture");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">${BASE_CSS}
<style>html,body{padding:0;overflow:hidden}canvas{width:100%;height:100vh}</style></head>
<body><canvas id="c"></canvas>${BRIDGE}
<script>
(function(){
  var canvas=document.getElementById("c");
  var gl=canvas.getContext("webgl2");
  if(!gl){console.error("Este navegador no expone WebGL2: el shader no puede ejecutarse.");return;}
  var vs="#version 300 es\\nin vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";
  var fs=${JSON.stringify(normalized)};
  function compile(type,src){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.error("Error de compilación del shader:\\n"+gl.getShaderInfoLog(s));return null;}return s;}
  var v=compile(gl.VERTEX_SHADER,vs),f=compile(gl.FRAGMENT_SHADER,fs);
  if(!v||!f)return;
  var prog=gl.createProgram();gl.attachShader(prog,v);gl.attachShader(prog,f);gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){console.error("Error al enlazar el programa: "+gl.getProgramInfoLog(prog));return;}
  gl.useProgram(prog);
  var buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  var loc=gl.getAttribLocation(prog,"p");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  var uT=gl.getUniformLocation(prog,"u_time")||gl.getUniformLocation(prog,"iTime");
  var uR=gl.getUniformLocation(prog,"u_resolution")||gl.getUniformLocation(prog,"iResolution");
  var uM=gl.getUniformLocation(prog,"u_mouse")||gl.getUniformLocation(prog,"iMouse");
  var mouse=[0,0];
  addEventListener("pointermove",function(e){mouse=[e.clientX,canvas.height-e.clientY];});
  function resize(){var d=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.floor(canvas.clientWidth*d);canvas.height=Math.floor(canvas.clientHeight*d);
    gl.viewport(0,0,canvas.width,canvas.height);}
  addEventListener("resize",resize);resize();
  var t0=performance.now();
  console.log("Shader compilado — WebGL2 listo (u_time · u_resolution · u_mouse).");
  (function loop(){var t=(performance.now()-t0)/1000;
    if(uT)gl.uniform1f(uT,t);
    if(uR)gl.uniform2f(uR,canvas.width,canvas.height);
    if(uM)gl.uniform2f(uM,mouse[0],mouse[1]);
    gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(loop);})();
})();
<\/script></body></html>`;
}

/**
 * Construye el documento COMPLETO que se inyecta en el iframe aislado.
 * `allowCdn=false` ⇒ no se añaden scripts de CDN (React quedaría sin ejecutar y
 * se avisa por consola, en vez de fallar en silencio).
 */
export function buildSandboxDoc(kind: RunnableKind, code: string, opts?: { allowCdn?: boolean }): string {
  const allowCdn = opts?.allowCdn !== false;
  const src = String(code ?? "");

  if (kind === "shader") return shaderDoc(src);

  if (kind === "pagina") {
    const hasHtmlShell = /<html[\s>]/i.test(src) || /<!doctype/i.test(src);
    if (hasHtmlShell) {
      // Inyecta el puente justo antes de cerrar el body (o al final si no hay).
      return /<\/body>/i.test(src) ? src.replace(/<\/body>/i, `${BRIDGE}</body>`) : src + BRIDGE;
    }
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${BASE_CSS}</head><body>${src}${BRIDGE}</body></html>`;
  }

  if (kind === "estilo") {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">${BASE_CSS}<style>\n${src}\n</style></head>
<body><h1>Título de muestra</h1><p>Párrafo de muestra para ver el estilo aplicado. <a href="#">Un enlace</a>, <strong>negrita</strong> y <em>cursiva</em>.</p>
<button>Botón</button> <input placeholder="Campo de texto"> <ul><li>Elemento uno</li><li>Elemento dos</li></ul>
<div class="demo card box container">Contenedor con las clases <code>demo card box container</code>.</div>${BRIDGE}</body></html>`;
  }

  if (kind === "react") {
    const cdn = allowCdn ? CDN_REACT.map((u) => `<script crossorigin src="${u}"><\/script>`).join("") : "";
    const warn = allowCdn ? "" : `<script>console.warn("CDNs desactivados en las preferencias: React no se ha cargado.");<\/script>`;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">${BASE_CSS}</head><body><div id="root"></div>
${BRIDGE}${cdn}${warn}
<script type="text/babel" data-presets="react,typescript">
${src}
try {
  var __c = (typeof App !== "undefined" && App) || (typeof Component !== "undefined" && Component) || null;
  if (__c && window.ReactDOM && window.ReactDOM.createRoot) {
    window.ReactDOM.createRoot(document.getElementById("root")).render(window.React.createElement(__c));
  } else if (!__c) {
    console.warn("Define un componente llamado App para verlo montado (o llama tú a createRoot).");
  }
} catch (e) { console.error(e); }
<\/script></body></html>`;
  }

  // script
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">${BASE_CSS}</head><body><div id="root"></div>${BRIDGE}
<script>
try {
${src}
} catch (e) { console.error(e); }
<\/script></body></html>`;
}

/* ───────────────────── Utilidades para la UI ───────────────────── */

export interface ConsoleEntry {
  id: number;
  level: "log" | "info" | "warn" | "error";
  text: string;
  at: number;
}

/** ¿Este mensaje `postMessage` viene de nuestro sandbox? (type-guard puro). */
export function isRuntimeMessage(data: unknown): data is { __starseed_runtime: 1; type: "console" | "ready"; level?: string; args?: unknown[]; height?: number } {
  return !!data && typeof data === "object" && (data as { __starseed_runtime?: unknown }).__starseed_runtime === 1;
}

/** Extensión de archivo sugerida al descargar el bloque. */
export function extensionFor(kind: RunnableKind, lang: string | undefined): string {
  const l = String(lang ?? "").toLowerCase();
  if (kind === "pagina") return l === "svg" ? "svg" : "html";
  if (kind === "estilo") return "css";
  if (kind === "shader") return "frag";
  if (kind === "react") return l === "tsx" ? "tsx" : "jsx";
  if (kind === "script") return "js";
  if (kind === "backend") return l.startsWith("p") ? "py" : "sh";
  return l || "txt";
}

/** Altura efectiva en px a partir de directivas + preferencias. */
export function heightFor(directives: CodeDirectives, prefs: CodeRuntimePrefs, size: CodeSize): number {
  if (directives.height) return directives.height;
  if (size === "full") return 0; // lo gestiona la superposición
  return CODE_SIZE_PX[size] ?? CODE_SIZE_PX[prefs.size];
}
