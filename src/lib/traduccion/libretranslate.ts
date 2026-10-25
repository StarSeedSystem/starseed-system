/**
 * LibreTranslate — cliente puro de traducción (TRD1020A · Ola 1020U). Sin `node:*`:
 * el `fetch` se inyecta y la clave `api_key` solo va en la petición en que quien la pasa
 * (nunca se guarda). Contrato: architecture/repos-libreria-1020d.md §4.
 */
export type FnFetch = typeof fetch;
export interface OpcionesCliente { base: string; fetch?: FnFetch; limiteCaracteres?: number }

/** `{ code, name }` como devuelve `GET /languages`; `{ language, confidence }` como `/detect`. */
export interface IdiomaLibreTranslate { code: string; name: string }
export interface IdiomaDetectado { language: string; confidence: number }

/** `q` suelto o lista (se parte en lotes y respeta el orden); `source` "auto" o código. */
export interface PeticionTraduccion { q: string | string[]; source: string; target: string; format?: "text" | "html"; api_key?: string }
export interface SalidaTraduccion {
  traducido: string | string[]; // el mismo cuerpo que la entrada
  idiomaDetectado?: IdiomaDetectado; // solo cuando el servidor la devuelve (origen "auto")
}

/** Tope de caracteres por lote si no se declara otro (límite típico del servidor). */
export const LIMITE_CARACTERES_POR_LOTE = 5000;

/** Une base y ruta de la API y normaliza la base: sin protocolo http(s) completo, rechaza. */
export function urlApi(base: string, ruta: string): string {
  const b = base.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(b)) throw new Error("La base de LibreTranslate debe ser una URL http(s) completa.");
  return new URL(ruta, b).toString();
}

const FRASES_ESTADO: Record<number, string> = {
  400: "Petición inválida (400): revisa el texto, el formato y los idiomas",
  403: "La instancia rechazó la petición (403): suele indicar una clave de API ausente o inválida",
  429: "Límite de peticiones alcanzado (429): espera un momento y vuelve a intentarlo",
  500: "Fallo interno del servidor LibreTranslate (500)",
};

/** Estado → frase clara en español; el detalle del servidor, si llegó, se adjunta. */
export function mensajeErrorHttp(estado: number, detalle?: string): string {
  const base = FRASES_ESTADO[estado] ?? `El servidor respondió con el estado ${estado}`;
  return detalle?.trim() ? `${base}: ${detalle.trim()}` : `${base}.`;
}

/**
 * Parte la lista en lotes CONSECUTIVOS que no pasan del tope y respeta el orden
 * original; un texto más largo que el tope viaja solo en su lote, sin trocearlo.
 */
export function partirEnLotes(textos: string[], limite = LIMITE_CARACTERES_POR_LOTE): string[][] {
  const tope = Number.isFinite(limite) && limite > 0 ? limite : LIMITE_CARACTERES_POR_LOTE;
  const lotes: string[][] = [];
  let actual: string[] = [];
  let usado = 0;
  for (const texto of textos) {
    if (actual.length > 0 && usado + texto.length > tope) { lotes.push(actual); actual = []; usado = 0; }
    actual.push(texto);
    usado += texto.length;
  }
  if (actual.length > 0) lotes.push(actual);
  return lotes;
}
function comoIdioma(v: unknown): IdiomaDetectado | undefined {
  const o = typeof v === "object" && v !== null ? (v as { language?: unknown; confidence?: unknown }) : undefined;
  return typeof o?.language === "string" && typeof o?.confidence === "number" ? { language: o.language, confidence: o.confidence } : undefined;
}
export function crearClienteLibreTranslate(opc: OpcionesCliente): ClienteLibreTranslate {
  const transporte: FnFetch = opc.fetch ?? fetch;
  const post = (c: Record<string, unknown>): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });

  const pedir = async (ruta: string, init: RequestInit): Promise<unknown> => {
    const url = urlApi(opc.base, ruta); // fuera del try: una mala base es error del llamante
    let res: Response;
    try {
      res = await transporte(url, init);
    } catch (e) {
      throw new Error(`No se pudo contactar LibreTranslate (${opc.base}): ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
      let detalle = "";
      try { const c = (await res.json()) as { error?: unknown }; if (typeof c.error === "string") detalle = c.error; } catch { /* sin detalle */ }
      throw new Error(mensajeErrorHttp(res.status, detalle));
    }
    return (await res.json()) as unknown;
  };

  const traducir = async (p: PeticionTraduccion): Promise<SalidaTraduccion> => {
    const lotesTextos = partirEnLotes(Array.isArray(p.q) ? p.q : [p.q], opc.limiteCaracteres);
    const salidas: string[] = [];
    let idiomaDetectado: IdiomaDetectado | undefined;
    for (const lote of lotesTextos) {
      const cuerpo: Record<string, unknown> = { q: lote, source: p.source, target: p.target, format: p.format ?? "text", ...(p.api_key ? { api_key: p.api_key } : {}) };
      const r = (await pedir("/translate", post(cuerpo))) as { translatedText?: unknown; detectedLanguage?: unknown };
      if (!Array.isArray(r.translatedText)) throw new Error("La respuesta de /translate no contiene la lista translatedText.");
      salidas.push(...r.translatedText.map(String));
      idiomaDetectado ??= comoIdioma(r.detectedLanguage);
    }
    return { traducido: Array.isArray(p.q) ? salidas : (salidas[0] ?? ""), idiomaDetectado };
  };
  const idiomas = async (clave?: string): Promise<IdiomaLibreTranslate[]> => {
    const r = await pedir(`/languages${clave ? `?api_key=${encodeURIComponent(clave)}` : ""}`, { method: "GET" });
    if (!Array.isArray(r)) throw new Error("La respuesta de /languages no es una lista.");
    return r.map((v) => { const o = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined; return { code: String(o?.code ?? ""), name: String(o?.name ?? "") }; }).filter((i) => i.code !== "");
  };
  const detectar = async (q: string, clave?: string): Promise<IdiomaDetectado[]> => {
    const r = await pedir("/detect", post(clave ? { q, api_key: clave } : { q }));
    if (!Array.isArray(r)) throw new Error("La respuesta de /detect no es una lista.");
    return r.map(comoIdioma).filter((d): d is IdiomaDetectado => d !== undefined);
  };

  const salud = (): Promise<boolean> =>
    transporte(urlApi(opc.base, "/health"), { method: "GET" }).then((r) => r.ok, () => false);

  return { traducir, idiomas, detectar, salud };
}
export interface ClienteLibreTranslate {
  traducir(p: PeticionTraduccion): Promise<SalidaTraduccion>;
  idiomas(clave?: string): Promise<IdiomaLibreTranslate[]>;
  detectar(q: string, clave?: string): Promise<IdiomaDetectado[]>;
  salud(): Promise<boolean>;
}
