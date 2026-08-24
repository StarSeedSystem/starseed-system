"use client";

/**
 * STUDIO 1.58 · Terminal & Sandbox — HONESTA.
 * ----------------------------------------------------------------------------
 * El proxy del OS NUNCA expone ejecución remota de comandos (ver ALLOWLIST de
 * `route.ts`) y esta pestaña no lo pretende: la terminal REAL (shell, Python,
 * procesos del sistema) vive en la interfaz LOCAL del backend soberano (la
 * neurona), fuera de este proxy. Aquí se ofrecen dos cosas honestas:
 *
 *   1) Un enlace directo a esa interfaz local (`astraura158Endpoint`).
 *   2) Un SANDBOX que SÍ corre aquí mismo, en el navegador: un editor
 *      (html/js/css/glsl) que se ejecuta en un iframe `sandbox="allow-scripts
 *      allow-modals allow-popups"` (SIN `allow-same-origin`: origen opaco,
 *      cero acceso a la sesión del OS) con una consola que recoge
 *      `console.*` y errores por `postMessage`.
 *
 * NOTA: `src/lib/aurora/code-runtime.ts` (la capa compartida del runtime de
 * código del chat, Adenda 156 §1) no existía cuando se escribió este archivo
 * — por eso el sandbox de abajo es una versión mínima y LOCAL, sin crear
 * módulos nuevos en `src/lib/`. Si ese archivo aparece más adelante, esta
 * pestaña debería migrar a reutilizarlo en vez de este código local.
 *
 * Además: lista de solo lectura de `/api/projects` (bóveda de proyectos), a
 * modo de "archivos del sandbox de proyectos" — el backend no expone
 * escritura de esos archivos por este proxy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Code2, Eraser, ExternalLink, FolderOpen, Play, Square, SquareTerminal, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { astraura158Endpoint, fetchAstraura158Projects, type Astraura158Project } from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, Badge, CARD, Empty, LABEL, MONO, SELECT, SUB, SectionTitle, TEXTAREA, useS158Load, type S158TabProps } from "./shared";

type SandboxLang = "html" | "js" | "css" | "glsl";

const LANG_LABEL: Record<SandboxLang, string> = { html: "HTML", js: "JavaScript", css: "CSS", glsl: "GLSL (shader)" };
const LANG_ORDER: SandboxLang[] = ["html", "js", "css", "glsl"];

const DEFAULT_CODE: Record<SandboxLang, string> = {
  html: '<h1>Hola, StarSeed 🌌</h1>\n<p>Edita este HTML y pulsa «Ejecutar aquí».</p>\n<script>console.log("hola desde el sandbox");</script>',
  js: 'console.log("hola desde el sandbox");\nconst app = document.getElementById("app");\nif (app) app.textContent = "Hola, StarSeed";',
  css: "body { background: radial-gradient(circle at top, #22d3ee22, #0b0b12); }\nh1 { font-family: system-ui, sans-serif; color: #a5f3fc; }",
  glsl: "#version 300 es\nprecision highp float;\nout vec4 outColor;\nuniform vec2 u_resolution;\nuniform float u_time;\nvoid main(){\n  vec2 uv = gl_FragCoord.xy / u_resolution;\n  vec3 col = 0.5 + 0.5*cos(u_time + uv.xyx*6.283 + vec3(0.0,2.0,4.0));\n  outColor = vec4(col, 1.0);\n}",
};

/* ── construcción del documento aislado (versión local mínima) ─────────────── */

const BASE_CSS = "*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;height:100%}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e7e7ee;background:#0b0b12;padding:12px;line-height:1.5}a{color:#7cc4ff}button{cursor:pointer}";

/** Escapa el cierre de `</script>` para incrustar código de usuario sin romper el documento anfitrión. */
function escClose(code: string): string {
  return (code || "").replace(/<\/(script)/gi, "<\\/$1");
}

/** Puente de consola: intercepta console.*, errores y promesas rechazadas y los reenvía al padre por `postMessage` (el iframe no tiene `allow-same-origin`: no puede leer nada del OS). */
const CONSOLE_BRIDGE = `
(function () {
  function send(payload) {
    try { parent.postMessage(Object.assign({ __starseedSandbox: true }, payload), "*"); } catch (e) { /* noop */ }
  }
  ["log", "info", "warn", "error", "debug"].forEach(function (level) {
    var orig = console[level] ? console[level].bind(console) : function () {};
    console[level] = function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        try { parts.push(typeof a === "string" ? a : JSON.stringify(a)); } catch (e) { parts.push(String(a)); }
      }
      send({ kind: "console", level: level, text: parts.join(" ") });
      orig.apply(console, arguments);
    };
  });
  window.addEventListener("error", function (e) {
    send({ kind: "error", level: "error", text: e && e.message ? e.message : "Error desconocido" });
  });
  window.addEventListener("unhandledrejection", function (e) {
    var reason = e ? e.reason : undefined;
    var text = reason && reason.message ? reason.message : String(reason);
    send({ kind: "error", level: "error", text: "Promesa rechazada: " + text });
  });
})();
`.trim();

/** Boilerplate WebGL2: quad a pantalla completa + u_time/u_resolution/u_mouse. */
const GLSL_DRIVER_JS = `
(function () {
  var canvas = document.getElementById("ss-canvas");
  function resize() {
    var r = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }
  window.addEventListener("resize", resize);
  resize();
  var gl = canvas.getContext("webgl2");
  if (!gl) { console.error("WebGL2 no disponible en este sandbox."); return; }
  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("Error al compilar el shader: " + gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }
  var vs = compile(gl.VERTEX_SHADER, document.getElementById("ss-vert").textContent);
  var fs = compile(gl.FRAGMENT_SHADER, document.getElementById("ss-frag").textContent);
  if (!vs || !fs) return;
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Error al enlazar el programa: " + gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uRes = gl.getUniformLocation(prog, "u_resolution");
  var uTime = gl.getUniformLocation(prog, "u_time");
  var uMouse = gl.getUniformLocation(prog, "u_mouse");
  var mouse = [0, 0];
  canvas.addEventListener("mousemove", function (e) {
    var r = canvas.getBoundingClientRect();
    mouse = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
  });
  var start = performance.now();
  function frame() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
    if (uTime) gl.uniform1f(uTime, (performance.now() - start) / 1000);
    if (uMouse) gl.uniform2f(uMouse, mouse[0], mouse[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }
  frame();
  console.log("shader compilado y en marcha.");
})();
`.trim();

function glslBody(frag: string): string {
  const fragSrc = frag && frag.trim() ? frag : DEFAULT_CODE.glsl;
  const vertSrc = "#version 300 es\nin vec2 a_pos;\nvoid main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }";
  return (
    `<script id="ss-vert" type="x-shader/x-vertex">${escClose(vertSrc)}</script>` +
    `<script id="ss-frag" type="x-shader/x-fragment">${escClose(fragSrc)}</script>` +
    '<canvas id="ss-canvas"></canvas>' +
    `<script>${GLSL_DRIVER_JS}</script>`
  );
}

function buildDoc(code: string, lang: SandboxLang): string {
  const head = `<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${BASE_CSS}</style><script>${CONSOLE_BRIDGE}</script>`;
  if (lang === "css") {
    return `<!doctype html><html><head>${head}<style>${escClose(code)}</style></head><body><div class="ss-preview"><h1>Aa Bb Cc</h1><p>Vista previa de estilos: párrafo de muestra con <a href="#">enlace</a>.</p><button type="button">Botón</button></div></body></html>`;
  }
  if (lang === "js") {
    return `<!doctype html><html><head>${head}</head><body><div id="app"></div><script>${escClose(code)}</script></body></html>`;
  }
  if (lang === "glsl") {
    return `<!doctype html><html><head>${head}<style>html,body{height:100%}#ss-canvas{width:100%;height:100%}</style></head><body>${glslBody(code)}</body></html>`;
  }
  // html
  if (/<head[\s>]/i.test(code)) return code.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${head}`);
  if (/<html[\s>]/i.test(code)) return code.replace(/<html(\s[^>]*)?>/i, (m) => `${m}<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head><body>${code}</body></html>`;
}

interface ConsoleEntry { id: number; level: string; text: string }

function ConsoleLine({ entry }: { entry: ConsoleEntry }) {
  const tone = entry.level === "error" ? "text-rose-300" : entry.level === "warn" ? "text-amber-300" : "text-white/70";
  return (
    <p className={cn("truncate font-code text-[10px]", tone)} title={entry.text}>
      <span className="text-white/30">[{entry.level}]</span> {entry.text}
    </p>
  );
}

function ProjectRow({ project }: { project: Astraura158Project }) {
  const filesRaw: unknown = project.files;
  const files = Array.isArray(filesRaw) ? filesRaw.filter((f): f is string => typeof f === "string") : [];
  return (
    <div className={cn(SUB, "px-3 py-2")}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{project.name ?? project.id}</p>
        {project.status && <Badge tone="border-white/10 text-white/60">{project.status}</Badge>}
      </div>
      {project.description && <p className="line-clamp-2 text-[10px] text-white/55">{project.description}</p>}
      {files.length > 0 ? (
        <p className={MONO}>{files.slice(0, 6).join(" · ")}{files.length > 6 ? ` · +${files.length - 6}` : ""}</p>
      ) : (
        <p className={MONO}>sin lista de archivos en esta respuesta</p>
      )}
    </div>
  );
}

export function TerminalTab({ target }: S158TabProps) {
  const [lang, setLang] = useState<SandboxLang>("html");
  const [code, setCode] = useState<string>(DEFAULT_CODE.html);
  const [ran, setRan] = useState(false);
  const [runId, setRunId] = useState(0);
  const [doc, setDoc] = useState("");
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const counterRef = useRef(0);
  const projects = useS158Load(fetchAstraura158Projects, target);

  const endpoint = useMemo(() => {
    try { return astraura158Endpoint(target); } catch { return "http://127.0.0.1:8000"; }
  }, [target]);

  const changeLang = useCallback((next: SandboxLang) => {
    setLang(next);
    setCode((cur) => (cur.trim() === "" || Object.values(DEFAULT_CODE).includes(cur) ? DEFAULT_CODE[next] : cur));
  }, []);

  const run = useCallback(() => {
    setDoc(buildDoc(code, lang));
    setLogs([]);
    setRan(true);
    setRunId((n) => n + 1);
  }, [code, lang]);

  const stop = useCallback(() => {
    setRan(false);
    setDoc("");
  }, []);

  const clearConsole = useCallback(() => setLogs([]), []);

  useEffect(() => {
    if (!ran) return;
    function onMessage(ev: MessageEvent) {
      const win = iframeRef.current?.contentWindow;
      if (!win || ev.source !== win) return; // solo mensajes de NUESTRO iframe
      const data = ev.data as { __starseedSandbox?: boolean; kind?: string; level?: string; text?: string } | null;
      if (!data || data.__starseedSandbox !== true) return;
      counterRef.current += 1;
      setLogs((prev) => [...prev.slice(-199), { id: counterRef.current, level: String(data.level ?? data.kind ?? "log"), text: String(data.text ?? "") }]);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [ran]);

  const projectList = projects.data?.projects ?? [];

  return (
    <div className="space-y-3">
      {/* Aviso honesto */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={Terminal}
          title="Ejecución de comandos: HONESTA"
          tone="text-amber-300"
          hint="El proxy del OS NUNCA expone ejecución remota de comandos — por diseño, no por descuido. La terminal real (shell, Python, procesos del sistema) vive en la interfaz LOCAL del backend soberano (la neurona), no aquí."
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className={MONO}>destino «{target}» → {endpoint}</p>
          <a href={endpoint} target="_blank" rel="noopener noreferrer" className={BTN} aria-label="Abrir la interfaz local de la neurona">
            <ExternalLink className="h-3 w-3" aria-hidden="true" /> Abrir la interfaz de la neurona
          </a>
        </div>
        {target === "nube" && (
          <p className="mt-2 text-[10px] text-white/50">Destino «nube»: puede que este servidor solo sirva la API (sin interfaz de terminal navegable). Cambia el destino a «local» en los ajustes de esta neurona para una terminal real en tu propia máquina.</p>
        )}
      </div>

      {/* Sandbox del navegador */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Code2} title="Sandbox del navegador" tone="text-cyan-300" hint="Esto SÍ se ejecuta aquí mismo, aislado: iframe sandbox sin acceso a la sesión del OS (sin allow-same-origin). Nada se ejecuta solo: hay que pulsar «Ejecutar aquí»." />
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Lenguaje</span>
            <select className={SELECT} value={lang} onChange={(e) => changeLang(e.target.value as SandboxLang)} aria-label="Lenguaje del sandbox">
              {LANG_ORDER.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
            </select>
          </label>
          <button type="button" className={BTN_PRIMARY} onClick={run} aria-label="Ejecutar aquí"><Play className="h-3.5 w-3.5" aria-hidden="true" /> Ejecutar aquí</button>
          {ran && <button type="button" className={BTN} onClick={stop} aria-label="Detener"><Square className="h-3.5 w-3.5" aria-hidden="true" /> Detener</button>}
          <button type="button" className={BTN} onClick={clearConsole} disabled={logs.length === 0} aria-label="Limpiar consola"><Eraser className="h-3.5 w-3.5" aria-hidden="true" /> Limpiar consola</button>
        </div>
        <textarea className={cn(TEXTAREA, "mt-2 font-code")} rows={8} value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} aria-label="Código del sandbox" />

        {ran && (
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black">
              <iframe
                key={runId}
                ref={iframeRef}
                title="Sandbox del navegador"
                sandbox="allow-scripts allow-modals allow-popups"
                referrerPolicy="no-referrer"
                srcDoc={doc}
                className="h-64 w-full bg-white/0"
              />
            </div>
            <div className={cn(SUB, "flex h-64 flex-col overflow-hidden")}>
              <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1">
                <SquareTerminal className="h-3 w-3 text-white/45" aria-hidden="true" />
                <span className={LABEL}>Consola ({logs.length})</span>
              </div>
              <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1.5">
                {logs.length === 0 && <p className="text-[10px] text-white/40">Sin salida todavía.</p>}
                {logs.map((l) => <ConsoleLine key={l.id} entry={l} />)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Proyectos (solo lectura) */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={FolderOpen} title={`Sandbox de proyectos (${projectList.length})`} tone="text-violet-300" hint="Solo lectura de /api/projects. La escritura de archivos de proyecto no pasa por este proxy." />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {projectList.length === 0 && <Empty loading={projects.loading} error={projects.error} text="Sin proyectos." />}
          {projectList.slice(0, 12).map((p) => <ProjectRow key={p.id} project={p} />)}
        </div>
      </div>
    </div>
  );
}

export default TerminalTab;
