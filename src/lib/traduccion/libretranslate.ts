// Cliente puro de LibreTranslate (TRD1020A). Sin `node:*`: `fetch` inyectable y pruebas sin red.
// Contrato: architecture/repos-libreria-1020d.md §4. La clave, si quien llama la pasa, viaja
// solo en el cuerpo de su petición y no se guarda en ningún sitio.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type FormatoTraduccion = "text" | "html";
export const LIMITE_CARACTERES_DEFECTO = 4000;
export interface OpcionesLibreTranslate { base: string; fetch?: FetchLike; apiKey?: string | null; limiteCaracteres?: number }
export interface PeticionTraduccion { q: string | string[]; source?: string; target: string; format?: FormatoTraduccion }
export interface IdiomaLibreTranslate { code: string; name: string; targets?: string[] }
export interface DeteccionLibreTranslate { language: string; confidence: number }
export interface ResultadoTraduccion { translatedText: string | string[]; detectedLanguage?: DeteccionLibreTranslate }
export class ErrorLibreTranslate extends Error {
  constructor(readonly estado: number, mensaje: string) { super(mensaje); this.name = "ErrorLibreTranslate"; }
}

const MENSAJES: Record<number, string> = {
  400: "Solicitud rechazada (400): revisa los idiomas de origen y destino y el texto.",
  403: "Acceso denegado (403): la instancia pide una clave válida o no expone este servicio.",
  429: "Demasiadas peticiones (429): espera un momento o usa otra capa de traducción.",
  500: "La instancia de LibreTranslate falló (500). Vuelve a intentarlo o usa otra capa.",
};

async function pedir(f: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  let r: Response;
  try { r = await f(url, init); }
  catch { throw new ErrorLibreTranslate(0, "No se pudo llegar a LibreTranslate: sin conexión o el servicio está apagado."); }
  if (!r.ok) throw new ErrorLibreTranslate(r.status, MENSAJES[r.status] ?? `LibreTranslate respondió ${r.status}.`);
  try { return await r.json(); }
  catch { throw new ErrorLibreTranslate(0, "LibreTranslate no devolvió una respuesta válida."); }
}

/** Corta un texto largo por palabras sin pasar del límite y conserva el orden. */
export function dividirTexto(texto: string, limite = LIMITE_CARACTERES_DEFECTO): string[] {
  const tope = limite > 0 ? limite : LIMITE_CARACTERES_DEFECTO;
  if (texto.length <= tope) return [texto];
  const piezas: string[] = [];
  let resto = texto;
  while (resto.length > tope) {
    const corte = Math.max(1, resto.lastIndexOf(" ", tope));
    piezas.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trimStart();
  }
  return resto ? [...piezas, resto] : piezas;
}

export function crearLibreTranslate(opciones: OpcionesLibreTranslate) {
  const raiz = opciones.base.replace(/\/+$/, "");
  if (!raiz) throw new ErrorLibreTranslate(0, "Falta la dirección base de LibreTranslate.");
  const f: FetchLike = opciones.fetch ?? ((url, init) => fetch(url, init));
  const clave = opciones.apiKey?.trim() ?? "";
  const limite = opciones.limiteCaracteres && opciones.limiteCaracteres > 0
    ? opciones.limiteCaracteres : LIMITE_CARACTERES_DEFECTO;

  async function traducir(p: PeticionTraduccion): Promise<ResultadoTraduccion> {
    const textos = Array.isArray(p.q) ? p.q : [p.q];
    if (textos.every((t) => !t.trim())) return { translatedText: Array.isArray(p.q) ? textos.map(() => "") : "" };
    const source = p.source ?? "auto", trozos: string[] = [];
    const cuentas = textos.map((t) => { const partes = dividirTexto(t, limite); trozos.push(...partes); return partes.length; });
    const grupos: number[][] = [];
    let actual: number[] = [], largo = 0;
    trozos.forEach((t, i) => {
      if (actual.length && largo + t.length > limite) { grupos.push(actual); actual = []; largo = 0; }
      actual.push(i); largo += t.length;
    });
    if (actual.length) grupos.push(actual);
    const traducidos = trozos.map(() => "");
    let detectedLanguage: DeteccionLibreTranslate | undefined;
    for (const grupo of grupos) {
      if (grupo.every((i) => !trozos[i].trim())) continue;
      const lote = grupo.map((i) => trozos[i]);
      const cuerpo: Record<string, unknown> = {
        q: lote.length === 1 ? lote[0] : lote, source, target: p.target, format: p.format ?? "text",
      };
      if (clave) cuerpo.api_key = clave;
      const datos = await pedir(f, `${raiz}/translate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      }) as { translatedText?: unknown; detectedLanguage?: DeteccionLibreTranslate };
      const bruto = datos?.translatedText;
      const salida = typeof bruto === "string" ? [bruto] : Array.isArray(bruto) ? bruto : null;
      if (!salida || salida.length !== lote.length || salida.some((x) => typeof x !== "string")) {
        throw new ErrorLibreTranslate(0, "LibreTranslate devolvió una traducción con una forma inesperada.");
      }
      grupo.forEach((indice, j) => { traducidos[indice] = salida[j] as string; });
      if (source === "auto" && !detectedLanguage && datos?.detectedLanguage) detectedLanguage = datos.detectedLanguage;
    }
    let cursor = 0;
    const resultado = cuentas.map((n) => {
      const partes = traducidos.slice(cursor, cursor + n);
      cursor += n;
      return partes.join(" ");
    });
    return {
      translatedText: Array.isArray(p.q) ? resultado : resultado[0] ?? "",
      ...(detectedLanguage ? { detectedLanguage } : {}),
    };
  }

  async function idiomas(): Promise<IdiomaLibreTranslate[]> {
    const datos = await pedir(f, `${raiz}/languages`, { method: "GET" });
    if (!Array.isArray(datos)) throw new ErrorLibreTranslate(0, "LibreTranslate no devolvió la lista de idiomas.");
    return datos.filter((x): x is IdiomaLibreTranslate =>
      !!x && typeof x === "object" && typeof (x as { code?: unknown }).code === "string"
      && typeof (x as { name?: unknown }).name === "string");
  }

  async function detectar(q: string): Promise<DeteccionLibreTranslate> {
    const cuerpo: Record<string, unknown> = { q };
    if (clave) cuerpo.api_key = clave;
    const datos = await pedir(f, `${raiz}/detect`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
    });
    const primera = (Array.isArray(datos) ? datos[0] : null) as Partial<DeteccionLibreTranslate> | null;
    if (!primera || typeof primera.language !== "string" || typeof primera.confidence !== "number") {
      throw new ErrorLibreTranslate(0, "LibreTranslate no pudo detectar el idioma del texto.");
    }
    return { language: primera.language, confidence: primera.confidence };
  }

  async function salud(): Promise<{ status: string }> {
    const datos = await pedir(f, `${raiz}/health`, { method: "GET" });
    const estado = datos && typeof datos === "object" ? (datos as { status?: unknown }).status : undefined;
    return { status: typeof estado === "string" ? estado : "ok" };
  }

  return { traducir, idiomas, detectar, salud };
}
