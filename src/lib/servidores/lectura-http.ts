/**
 * Conectores de SOLO LECTURA · núcleo común (Ola 1025U · tarea REP1026). Es el mismo contrato que `coolify.ts`
 * (Ola 1020U) pensado para que cada servicio nuevo (WeKnora, OpenProject…) sea una capa fina de rutas y mapeos:
 *
 *  · la URL y la clave se leen por el NOMBRE de su variable de entorno (`credencialesDeEntorno`): ni claves en el
 *    código, ni en un error, ni en un registro (todo valor secreto se tapa con «•••» antes de salir);
 *  · `fetch` y el reloj INYECTADOS (las pruebas no tocan la red ni esperan de verdad);
 *  · `redirect: "manual"`: un 3xx no saca la llamada de la instancia ni lleva la clave a otro sitio;
 *  · tope de tiempo con `AbortController` y tope de tamaño de respuesta;
 *  · fallos honestos y tipados (`credenciales` · `peticion` · `tiempo` · `red` · `http` · `datos`), nunca una excepción.
 *
 * Módulo PURO: sin `node:*`, sin `process.env` (el entorno entra como argumento) y sin «use client».
 */

export interface PeticionLectura {
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  redirect: "manual";
  signal: AbortSignal;
}
export interface RespuestaLectura {
  ok: boolean;
  status: number;
  headers: { get(nombre: string): string | null };
  text(): Promise<string>;
}
export type FetchLectura = (url: string, init: PeticionLectura) => Promise<RespuestaLectura>;
export interface RelojLectura {
  ahora(): number;
  tras(ms: number): { promesa: Promise<void>; cancelar(): void };
}
/** `registrar` recibe una línea que JAMÁS contiene la clave ni el texto que se busca. */
export interface OpcionesLectura {
  reloj?: RelojLectura;
  registrar?: (linea: string) => void;
}

/** Credenciales de una instancia: `url` base y `token` (la clave de API) solo en memoria. */
export interface CredencialesLectura {
  url: string;
  token: string;
}

export type FalloLectura = "credenciales" | "peticion" | "tiempo" | "red" | "http" | "datos";
export type ResultadoLectura<T> =
  | { ok: true; estado: number; datos: T; ms: number }
  | { ok: false; fallo: FalloLectura; motivo: string; estado: number | null; ms: number };
export type FalloDeLectura = Extract<ResultadoLectura<unknown>, { ok: false }>;

/** Cómo habla un servicio concreto: su nombre, sus variables, su cabecera de autenticación y sus motivos por estado. */
export interface PerfilServicio {
  /** Nombre para los textos: «WeKnora». */
  nombre: string;
  /** NOMBRE de la variable de entorno con la URL (nunca su valor). */
  variableUrl: string;
  /** NOMBRE de la variable de entorno con la clave de API (nunca su valor). */
  variableClave: string;
  /** Cabeceras que llevan la clave. */
  autenticacion(token: string): Record<string, string>;
  /** Valores derivados de la clave que también hay que tapar (p. ej. la cabecera Basic en base64). */
  secretosDerivados?(token: string): string[];
  /** Fin de la ruta base de la API (`/api/v1`): si la URL ya lo trae, no se duplica. */
  sufijoApi: string;
  /** Motivo en español de cada estado, tal como se comprobó en la documentación del servicio. */
  motivoEstado: Readonly<Record<number, string>>;
}

export const TIEMPO_MS = 15_000;
export const TIEMPO_SONDEO_MS = 6_000;
/** Una respuesta mayor que esto se descarta: un conector de lectura no debe tragarse una base entera. */
export const MAX_RESPUESTA_CHARS = 2_000_000;

export const RELOJ: RelojLectura = {
  ahora: () => Date.now(),
  tras: (ms) => {
    let id: ReturnType<typeof setTimeout> | undefined;
    return { promesa: new Promise<void>((r) => (id = setTimeout(r, ms))), cancelar: () => clearTimeout(id) };
  },
};

const ASCII_VISIBLE = /^[\x21-\x7e]+$/;

/** Motivo en español si las credenciales no valen; `null` si valen. Nunca repite el valor de la clave. */
export function validarCredenciales(c: CredencialesLectura, perfil: PerfilServicio): string | null {
  let base: URL;
  try {
    base = new URL(c.url);
  } catch {
    return `La URL de ${perfil.nombre} (${perfil.variableUrl}) no es una URL válida.`;
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") return `La URL de ${perfil.nombre} (${perfil.variableUrl}) debe empezar por http(s).`;
  if (!base.hostname) return `La URL de ${perfil.nombre} (${perfil.variableUrl}) no tiene un servidor (dominio o IP).`;
  if (base.username || base.password) {
    return `La URL de ${perfil.nombre} no debe llevar usuario ni clave: la clave va aparte, en ${perfil.variableClave}.`;
  }
  if (!c.token) return `Falta la clave de ${perfil.nombre}: ponla en la variable de entorno ${perfil.variableClave} del servidor que llama.`;
  if (c.token.length > 4096 || !ASCII_VISIBLE.test(c.token)) {
    return `La clave de ${perfil.nombre} (${perfil.variableClave}) no es válida: debe ser texto ASCII sin espacios ni saltos de línea.`;
  }
  return null;
}

export type CredencialesDeEntorno =
  | { ok: true; credenciales: CredencialesLectura }
  | { ok: false; motivo: string; faltan: string[] };

/**
 * Lee la URL y la clave por el NOMBRE de su variable en el entorno que le pasa quien llama (p. ej. `process.env`
 * de la ruta de servidor). Si falta alguna, dice cuál por su nombre; jamás devuelve ni repite un valor en un motivo.
 */
export function credencialesDeEntorno(env: Readonly<Record<string, string | undefined>>, perfil: PerfilServicio): CredencialesDeEntorno {
  const url = (env[perfil.variableUrl] ?? "").trim();
  const token = (env[perfil.variableClave] ?? "").trim();
  const faltan = [url ? null : perfil.variableUrl, token ? null : perfil.variableClave].filter((x): x is string => x !== null);
  if (faltan.length > 0) {
    return {
      ok: false,
      faltan,
      motivo: `${perfil.nombre} no está configurado: falta${faltan.length > 1 ? "n las variables" : " la variable"} de entorno ${faltan.join(" y ")} en el servidor que llama.`,
    };
  }
  const malo = validarCredenciales({ url, token }, perfil);
  return malo ? { ok: false, motivo: malo, faltan: [] } : { ok: true, credenciales: { url, token } };
}

export interface LlamadaLectura {
  /** Ruta bajo la base de la API, empezando por «/». */
  ruta: string;
  metodo?: "GET" | "POST";
  /** Parámetros de la consulta (se codifican solos). */
  consulta?: Readonly<Record<string, string>>;
  /** Cuerpo JSON de un POST de búsqueda. */
  cuerpo?: unknown;
  /** Rutas públicas (p. ej. `/health`) que no llevan la clave ni cuelgan de la ruta de la API. */
  publica?: boolean;
  tiempoMs?: number;
}

/** Une la ruta base de la URL, el sufijo de la API (sin duplicarlo) y la ruta pedida. */
export function urlDeLlamada(c: CredencialesLectura, perfil: PerfilServicio, llamada: LlamadaLectura): URL {
  const base = new URL(c.url);
  let prefijo = base.pathname.replace(/\/+$/, "");
  if (prefijo.toLowerCase().endsWith(perfil.sufijoApi)) prefijo = prefijo.slice(0, prefijo.length - perfil.sufijoApi.length);
  const api = llamada.publica ? "" : perfil.sufijoApi;
  const url = new URL(`${base.origin}${prefijo}${api}${llamada.ruta}`);
  for (const [clave, valor] of Object.entries(llamada.consulta ?? {})) url.searchParams.set(clave, valor);
  return url;
}

/** La clave y lo que se derive de ella (sin vacíos): todo lo que no debe salir jamás en un texto. */
function secretosDe(token: string, perfil: PerfilServicio): string[] {
  if (!token) return [];
  let derivados: string[] = [];
  try {
    derivados = perfil.secretosDerivados?.(token) ?? [];
  } catch {
    // Una clave con caracteres raros no se puede derivar; la validación de credenciales la rechaza igualmente.
  }
  return [token, ...derivados].filter(Boolean);
}

/**
 * Una llamada de lectura con todas las guardas. Devuelve el JSON ya leído o un fallo honesto; no lanza.
 * Un 3xx NO se sigue: se dice y se pide la URL final.
 */
export async function pedirJson(
  c: CredencialesLectura,
  perfil: PerfilServicio,
  llamada: LlamadaLectura,
  f: FetchLectura,
  o: OpcionesLectura = {},
): Promise<{ ok: true; estado: number; datos: unknown; ms: number } | FalloDeLectura> {
  const reloj = o.reloj ?? RELOJ;
  const t0 = reloj.ahora();
  const tiempoMs = llamada.tiempoMs ?? TIEMPO_MS;
  const secretos = secretosDe(c.token, perfil);
  const tapar = (s: string): string => secretos.reduce((texto, secreto) => texto.split(secreto).join("•••"), s);
  const metodo = llamada.metodo ?? "GET";
  const etiqueta = llamada.ruta || "/";
  const fallo = (tipo: FalloLectura, motivo: string, estado: number | null): FalloDeLectura => {
    o.registrar?.(tapar(`${perfil.nombre} ${metodo} ${etiqueta} · ${estado ?? "—"} · ${tipo}: ${motivo}`));
    return { ok: false, fallo: tipo, motivo: tapar(motivo), estado, ms: reloj.ahora() - t0 };
  };

  const malo = validarCredenciales(c, perfil);
  if (malo) return fallo("credenciales", malo, null);

  let url: URL;
  try {
    url = urlDeLlamada(c, perfil, llamada);
  } catch {
    return fallo("credenciales", `No se pudo formar la dirección de ${perfil.nombre}: revisa ${perfil.variableUrl}.`, null);
  }
  const headers: Record<string, string> = { accept: "application/json", ...(llamada.publica ? {} : perfil.autenticacion(c.token)) };
  if (metodo === "POST") headers["content-type"] = "application/json";

  const ctl = new AbortController();
  const plazo = reloj.tras(tiempoMs);
  const tiempo = plazo.promesa.then(() => {
    ctl.abort();
    return "tiempo" as const;
  });
  try {
    const init: PeticionLectura = { method: metodo, headers, redirect: "manual", signal: ctl.signal };
    if (metodo === "POST") init.body = JSON.stringify(llamada.cuerpo ?? {});
    const r = await Promise.race([f(url.toString(), init), tiempo]);
    if (r === "tiempo") return fallo("tiempo", `${perfil.nombre} no respondió en ${tiempoMs / 1000} s.`, null);
    const estado = r.status;
    if ((estado >= 300 && estado < 400) || estado === 0) {
      return fallo(
        "http",
        `${perfil.nombre} redirige a otra dirección (${estado || "redirección"}). Por seguridad no se sigue: pon en ${perfil.variableUrl} la URL final, sin redirección.`,
        estado || null,
      );
    }
    const predefinido = perfil.motivoEstado[estado];
    if (predefinido) return fallo("http", predefinido, estado);
    const declarado = Number(r.headers.get("content-length"));
    if (Number.isFinite(declarado) && declarado > MAX_RESPUESTA_CHARS) {
      return fallo("datos", `La respuesta de ${perfil.nombre} es demasiado grande (${declarado} bytes): pide menos elementos.`, estado);
    }
    const leido = await Promise.race([r.text(), tiempo]);
    if (leido === "tiempo") return fallo("tiempo", `${perfil.nombre} no terminó de responder en ${tiempoMs / 1000} s.`, estado);
    if (estado < 200 || estado >= 300) return fallo("http", `${perfil.nombre} respondió ${estado}: ${tapar(leido).slice(0, 160)}`, estado);
    if (leido.length > MAX_RESPUESTA_CHARS) {
      return fallo("datos", `La respuesta de ${perfil.nombre} es demasiado grande: pide menos elementos.`, estado);
    }
    let datos: unknown;
    try {
      datos = JSON.parse(leido);
    } catch {
      return fallo("datos", `La respuesta no es JSON válido (¿es de verdad ${perfil.nombre} lo que hay en esa dirección?).`, estado);
    }
    o.registrar?.(tapar(`${perfil.nombre} ${metodo} ${etiqueta} · ${estado} · ok en ${reloj.ahora() - t0} ms`));
    return { ok: true, estado, datos, ms: reloj.ahora() - t0 };
  } catch {
    return ctl.signal.aborted
      ? fallo("tiempo", `${perfil.nombre} no respondió en ${tiempoMs / 1000} s.`, null)
      : fallo("red", `${perfil.nombre} no contesta (¿está apagado el servidor o caído el túnel?).`, null);
  } finally {
    plazo.cancelar();
  }
}

/* ── Lectura defensiva de lo que devuelve la API: lo que no viene es «sin dato» (null), nunca un invento ── */

export const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
export const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
export const numero = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
export const booleano = (x: unknown): boolean | null => (typeof x === "boolean" ? x : null);
export const identificador = (x: unknown): string | null => {
  if (typeof x === "number" && Number.isFinite(x)) return String(x);
  return texto(x);
};

/** Recorta un texto largo sin cortar a media palabra de forma fea; dice si recortó. */
export function recortar(valor: string | null, maximo: number): { texto: string | null; recortado: boolean } {
  if (valor === null) return { texto: null, recortado: false };
  if (valor.length <= maximo) return { texto: valor, recortado: false };
  return { texto: `${valor.slice(0, maximo).trimEnd()}…`, recortado: true };
}

/** Número entero entre dos límites; un valor ausente o roto cae al valor por defecto. */
export function acotar(valor: unknown, minimo: number, maximo: number, defecto: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return defecto;
  return Math.min(maximo, Math.max(minimo, Math.trunc(valor)));
}
