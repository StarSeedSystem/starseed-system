/**
 * ════════════════════════════════════════════════════════════════════════════
 * (ACT1108B · 2026-11-08) Leer un JSON de un Release de GitHub con reintentos y ruta alternativa.
 * Contrato: architecture/centro-versiones-1105.md §9. Espejo en Rust: native/src-tauri/src/canal_actualizacion_red.rs
 * y en Kotlin: ActualizadorApk.kt (`conRutas`).
 *
 * `releases/download/…` es el camino más flaky de GitHub (504 el 08/11); `api.github.com` respondía bien.
 * Orden: directa → API → directa → API, con pausas 0, 0, 15 s y 40 s (~1 min) y SOLO con fallos de red o
 * 5xx/429. Un 404 no se reintenta por la misma ruta: la API confirma si el archivo de verdad no existe.
 * La ruta API: `releases/tags/<etiqueta>` (o `releases/latest`) → id del asset → `releases/assets/<id>`
 * con `Accept: application/octet-stream`. Repositorio público: sin token.
 *
 * Hueco tipado de F7 (red-sin-dependencias.md): `espejos` — una neurona que ya tiene el archivo lo sirve a
 * las demás. HOY nadie lo rellena; el reintento ya sabe usarlo (primero los espejos).
 * ════════════════════════════════════════════════════════════════════════════
 */

export const PAUSAS_MS: readonly number[] = [0, 0, 15_000, 40_000];

export type TipoRuta = "directa" | "api" | "espejo";

export interface ArchivoRelease {
  propietario: string;
  repo: string;
  /** null = `releases/latest/download/…` */
  etiqueta: string | null;
  nombre: string;
}

/** Pausa antes del intento `i` (la última se repite). Pura. */
export function pausaAntes(i: number): number {
  return PAUSAS_MS[Math.min(Math.max(0, i), PAUSAS_MS.length - 1)];
}

/** `https://github.com/<o>/<r>/releases/download/<tag>/<archivo>` o `…/releases/latest/download/<archivo>`. Pura. */
export function analizarUrlRelease(url: string): ArchivoRelease | null {
  const t = String(url ?? "").trim();
  if (!t.startsWith("https://github.com/")) return null;
  const p = t.slice("https://github.com/".length).split(/[?#]/)[0].split("/");
  const ok = (s: string) => s !== "" && s !== "." && s !== ".." && !s.includes("\\");
  if (p.length !== 6 || !p.every(ok) || p[2] !== "releases") return null;
  if (p[3] === "download") return { propietario: p[0], repo: p[1], etiqueta: p[4], nombre: p[5] };
  if (p[3] === "latest" && p[4] === "download") return { propietario: p[0], repo: p[1], etiqueta: null, nombre: p[5] };
  return null;
}

/** La URL de la API que lista los archivos de ese Release. Pura. */
export function urlListaApi(a: ArchivoRelease): string {
  const base = `https://api.github.com/repos/${a.propietario}/${a.repo}/releases`;
  return a.etiqueta ? `${base}/tags/${a.etiqueta}` : `${base}/latest`;
}

/** De la respuesta de la API, la URL del asset por su nombre (solo `…/releases/assets/<id numérico>`). Pura. */
export function urlApiDelArchivo(release: unknown, a: ArchivoRelease): string | null {
  const assets = (release as { assets?: unknown } | null)?.assets;
  if (!Array.isArray(assets)) return null;
  const esperado = `https://api.github.com/repos/${a.propietario}/${a.repo}/releases/assets/`;
  for (const x of assets) {
    const o = x as { name?: unknown; id?: unknown; url?: unknown } | null;
    if (!o || o.name !== a.nombre) continue;
    if (typeof o.id === "number" && Number.isInteger(o.id) && o.id > 0) return `${esperado}${o.id}`;
    if (typeof o.url === "string" && o.url.startsWith(esperado) && /^\d+$/.test(o.url.slice(esperado.length))) return o.url;
  }
  return null;
}

/** ¿Un fallo que merece otro intento (y otra ruta)? 5xx, 429, red, tiempo. 404 y 4xx no. Pura. */
export function esReintentable(fallo: { estado?: number | null; red?: boolean }): boolean {
  if (fallo.red) return true;
  const s = fallo.estado ?? 0;
  return s >= 500 || s === 429;
}

/** Secuencia de rutas de los intentos: espejos, directa, API, directa, API. Pura. */
export function secuenciaRutas(espejos: readonly string[] = []): Array<{ tipo: TipoRuta; url?: string }> {
  return [
    ...espejos.map((url) => ({ tipo: "espejo" as const, url })),
    { tipo: "directa" as const },
    { tipo: "api" as const },
    { tipo: "directa" as const },
    { tipo: "api" as const },
  ];
}

export type ResultadoJson =
  | { ok: true; valor: unknown; ruta: TipoRuta; intentos: number }
  /** `noExiste`: la API respondió y el archivo no está en el Release (p. ej. aún no hay ninguna prueba). */
  | { ok: false; noExiste: boolean; motivo: string; intentos: number };

export interface OpcionesLeer {
  fetch?: typeof fetch;
  /** Para probar sin esperar de verdad. */
  esperar?: (ms: number) => Promise<void>;
  /** Cuenta a la persona el cambio de ruta («GitHub no respondió (504)…»). */
  aviso?: (texto: string, siguiente: TipoRuta) => void;
  /** F7: URLs de neuronas cercanas que ya tienen este archivo (hoy nadie las da). */
  espejos?: readonly string[];
  /** Máximo de intentos (por defecto, todos). */
  maxIntentos?: number;
}

const esperarReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Fallo {
  estado: number | null;
  red: boolean;
  motivo: string;
}

async function pedirJson(f: typeof fetch, url: string, accept: string): Promise<{ ok: true; valor: unknown } | ({ ok: false } & Fallo)> {
  try {
    const r = await f(url, { headers: { Accept: accept }, cache: "no-store" });
    if (!r.ok) return { ok: false, estado: r.status, red: false, motivo: `HTTP ${r.status}` };
    return { ok: true, valor: await r.json() };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, estado: null, red: true, motivo: m || "sin conexión" };
  }
}

/**
 * Lee un JSON publicado en un Release de GitHub: directa y, si GitHub falla, por la API; con reintentos.
 * Nunca lanza. El texto de `motivo` incluye el estado HTTP para que `describirError` lo entienda.
 */
export async function leerJsonConRutas(urlDirecta: string, o: OpcionesLeer = {}): Promise<ResultadoJson> {
  const f = o.fetch ?? fetch;
  const esperar = o.esperar ?? esperarReal;
  const archivo = analizarUrlRelease(urlDirecta);
  const rutas = secuenciaRutas(o.espejos);
  const total = Math.min(rutas.length, Math.max(1, o.maxIntentos ?? rutas.length));
  let ultimo: Fallo = { estado: null, red: true, motivo: "sin respuesta" };
  let intentos = 0;
  for (let i = 0; i < total; i++) {
    const ruta = rutas[i];
    // La pausa cuenta desde el primer intento de la ruta directa (los espejos no la gastan).
    await esperar(pausaAntes(Math.max(0, i - (o.espejos?.length ?? 0))));
    intentos++;
    let r: Awaited<ReturnType<typeof pedirJson>>;
    if (ruta.tipo === "espejo") {
      r = await pedirJson(f, ruta.url as string, "application/json");
    } else if (ruta.tipo === "directa") {
      r = await pedirJson(f, urlDirecta, "application/json, application/octet-stream");
      // Un 404 directo no es fallo de GitHub: se confirma por la API en el siguiente intento.
      if (!r.ok && r.estado === 404) r = { ...r, red: false };
    } else {
      if (!archivo) {
        ultimo = { estado: null, red: false, motivo: "Esta ruta no es un archivo de un Release de GitHub." };
        continue;
      }
      const lista = await pedirJson(f, urlListaApi(archivo), "application/vnd.github+json");
      if (!lista.ok) {
        if (lista.estado === 404) return { ok: false, noExiste: true, motivo: "El Release no existe.", intentos };
        r = lista;
      } else {
        const url = urlApiDelArchivo(lista.valor, archivo);
        if (!url) return { ok: false, noExiste: true, motivo: `El archivo ${archivo.nombre} no está en el Release.`, intentos };
        r = await pedirJson(f, url, "application/octet-stream");
      }
    }
    if (r.ok) return { ok: true, valor: r.valor, ruta: ruta.tipo, intentos };
    ultimo = r;
    if (r.estado === 404 && ruta.tipo === "directa") continue; // pasa a confirmarlo por la API
    if (!esReintentable(r)) return { ok: false, noExiste: false, motivo: r.motivo, intentos };
    const sig = rutas[i + 1];
    if (sig && i + 1 < total) o.aviso?.(textoSiguiente(r, sig.tipo), sig.tipo);
  }
  return { ok: false, noExiste: false, motivo: ultimo.motivo, intentos };
}

function textoSiguiente(f: Fallo, siguiente: TipoRuta): string {
  const causa = f.estado !== null && f.estado >= 500 ? `GitHub no respondió (${f.estado})` : f.red ? "No hubo conexión con GitHub" : `GitHub respondió ${f.estado}`;
  const donde = siguiente === "api" ? "por otra ruta (la API de GitHub)" : siguiente === "espejo" ? "desde otra neurona cercana" : "de nuevo por la ruta directa";
  return `${causa}. Lo intento ${donde}…`;
}
