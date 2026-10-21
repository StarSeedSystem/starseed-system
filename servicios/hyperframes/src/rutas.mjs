// Servicio «hyperframes» de una neurona (127.0.0.1:4490) · rutas PURAS (HFR1018Fb).
// Contrato: architecture/video-hyperframes.md §3. Nada de red, disco, procesos ni reloj aquí: el servidor
// inyecta `deps` (versión, presencia de navegador y FFmpeg, lint, editar, vista y la cola de render).
// La telemetría de HyperFrames va siempre apagada (HYPERFRAMES_NO_TELEMETRY=1 lo pone el servidor).

export const LIMITE_CUERPO_BYTES = 8 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TIPOS_ORDEN = new Set(["setText", "setStyle", "setTiming", "setAttribute", "setVariableValue"]);
const CLAVES_RUTA = new Set(["ruta", "archivo", "src", "path", "fuente"]);

/** Bytes que ocupa el cuerpo tal como llegó (texto) o serializado (objeto). */
export function tamanoCuerpo(cuerpo) {
  if (cuerpo == null) return 0;
  const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  return new TextEncoder().encode(texto).length;
}

/** ¿Este valor apunta al disco FUERA del proyecto? (absoluta, de usuario, de Windows o con «..»). */
export function fueraDelProyecto(valor) {
  if (typeof valor !== "string") return false;
  const v = valor.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return false; // una URL no es una ruta de disco
  return v.startsWith("/") || v.startsWith("~") || v.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(v)
    || v.split(/[\\/]+/).includes("..");
}

/** Busca, a cualquier profundidad, una clave de ruta con un valor fuera del proyecto. */
export function rutaPeligrosa(cuerpo, profundidad = 0) {
  if (cuerpo == null || typeof cuerpo !== "object" || profundidad > 12) return null;
  for (const [clave, valor] of Object.entries(cuerpo)) {
    if (CLAVES_RUTA.has(clave) && fueraDelProyecto(valor)) return clave;
    const dentro = rutaPeligrosa(valor, profundidad + 1);
    if (dentro) return dentro;
  }
  return null;
}

/** Órdenes del SDK válidas (las de src/lib/video-html/operaciones-sdk.ts) o el motivo del rechazo. */
export function validarOrdenes(ordenes) {
  if (!Array.isArray(ordenes) || ordenes.length === 0) return "faltan las órdenes";
  if (ordenes.length > 500) return "demasiadas órdenes (máximo 500)";
  for (const o of ordenes) {
    if (!o || typeof o !== "object" || !TIPOS_ORDEN.has(o.type)) return "orden desconocida";
    if (o.type === "setVariableValue" ? typeof o.id !== "string" : typeof o.target !== "string") return "orden sin destino";
    if (/gsap/i.test(JSON.stringify(o))) return "GSAP no se usa en el OS (licencia, §2)";
  }
  return null;
}

/** Quita rutas absolutas de un mensaje de error antes de devolverlo. */
export function sinRutas(texto) {
  return String(texto ?? "").replace(/(?:[A-Za-z]:)?[\\/](?:Users|home|private|var|tmp|srv|opt)[^\s"'`]*/g, "<ruta>").slice(0, 300);
}

const r = (estado, cuerpo) => ({ estado, cuerpo });
const fallo = (estado, error) => r(estado, { error });

async function seguro(fn) {
  try { return await fn(); } catch (e) { return fallo(500, sinRutas(e && e.message ? e.message : e)); }
}

/** Atiende una petición. `deps` = { version, navegador, ffmpeg, lint, editar, vista, cola: { encolar, estado } }. */
export async function manejar({ metodo, ruta, cuerpo } = {}, deps = {}) {
  const m = String(metodo || "").toUpperCase();
  const camino = String(ruta || "").split("?")[0];
  if (tamanoCuerpo(cuerpo) > LIMITE_CUERPO_BYTES) return fallo(413, "el cuerpo pasa de 8 MB");
  let decodificado = camino;
  try { decodificado = decodeURIComponent(camino); } catch { return fallo(400, "ruta mal formada"); }
  if (decodificado.includes("\\") || decodificado.split("/").includes("..")) return fallo(400, "ruta fuera del proyecto");
  const peligro = rutaPeligrosa(cuerpo);
  if (peligro) return fallo(400, `«${peligro}» apunta fuera del proyecto`);

  if (m === "GET" && (camino === "/salud" || camino === "/health")) {
    return r(200, { servicio: "hyperframes", version: deps.version ?? null, navegador: Boolean(deps.navegador),
      ffmpeg: Boolean(deps.ffmpeg), telemetria: "apagada" });
  }
  if (m === "POST" && camino === "/lint") {
    if (!cuerpo || typeof cuerpo.composicion !== "string") return fallo(400, "falta la composición (HTML)");
    if (typeof deps.lint !== "function") return fallo(503, "lint no disponible en esta neurona");
    return seguro(async () => r(200, await deps.lint(cuerpo.composicion)));
  }
  if (m === "POST" && camino === "/editar") {
    if (!cuerpo || typeof cuerpo.composicion !== "string") return fallo(400, "falta la composición (HTML)");
    const motivo = validarOrdenes(cuerpo.ordenes);
    if (motivo) return fallo(400, motivo);
    if (typeof deps.editar !== "function") return fallo(503, "edición no disponible en esta neurona");
    return seguro(async () => r(200, { composicion: await deps.editar(cuerpo.composicion, cuerpo.ordenes) }));
  }
  const vista = m === "GET" && camino.match(/^\/vista\/([^/]+)$/);
  if (vista) {
    if (!ID.test(vista[1])) return fallo(400, "id no válido");
    if (typeof deps.vista !== "function") return fallo(503, "vista no disponible en esta neurona");
    return seguro(async () => { const v = await deps.vista(vista[1]); return v ? r(200, v) : fallo(404, "composición no encontrada"); });
  }
  if (m === "POST" && camino === "/render") {
    if (!cuerpo || typeof cuerpo.composicion !== "string") return fallo(400, "falta la composición (HTML)");
    if (!deps.cola || typeof deps.cola.encolar !== "function") return fallo(503, "sin cola de render en esta neurona");
    return seguro(async () => r(202, { id: await deps.cola.encolar({ composicion: cuerpo.composicion, formato: cuerpo.formato ?? "mp4" }) }));
  }
  const trabajo = m === "GET" && camino.match(/^\/trabajos\/([^/]+)$/);
  if (trabajo) {
    if (!ID.test(trabajo[1])) return fallo(400, "id no válido");
    if (!deps.cola || typeof deps.cola.estado !== "function") return fallo(503, "sin cola de render en esta neurona");
    return seguro(async () => { const e = await deps.cola.estado(trabajo[1]); return e ? r(200, e) : fallo(404, "trabajo no encontrado"); });
  }
  return fallo(404, "ruta desconocida");
}
