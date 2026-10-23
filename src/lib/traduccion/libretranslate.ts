/** Cliente puro de LibreTranslate (TRD1020A). Contrato: architecture/repos-libreria-1020d.md §4. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type FormatoTraduccion = "text" | "html";
export type MotivoError = "red" | "http" | "respuesta" | "validacion";
export interface OpcionesLibreTranslate { base: string; fetch?: FetchLike; apiKey?: string; limiteCaracteres?: number }
export interface SolicitudTraduccion { q: string | string[]; source?: string; target: string; format?: FormatoTraduccion }
export interface IdiomaDetectado { language: string; confidence: number }
export interface RespuestaTraduccion { translatedText: string | string[]; detectedLanguage?: IdiomaDetectado }
export interface IdiomaLibreTranslate { code: string; name: string; targets: string[] }
export interface EstadoLibreTranslate { status: string }
export class ErrorLibreTranslate extends Error {
  constructor(public readonly estado: number, mensaje: string, public readonly motivo: MotivoError = "http") { super(mensaje); this.name = "ErrorLibreTranslate"; }
}
export interface ClienteLibreTranslate {
  base: string; limiteCaracteres: number;
  traducir(solicitud: SolicitudTraduccion): Promise<RespuestaTraduccion>;
  idiomas(): Promise<IdiomaLibreTranslate[]>; detectar(q: string): Promise<IdiomaDetectado[]>;
  salud(): Promise<EstadoLibreTranslate>;
}
export const LIMITE_CARACTERES = 2000;
const MENSAJES: Record<number, string> = {
  400: "LibreTranslate rechazó la petición (400): revisa los idiomas de origen y destino y el texto enviado.",
  403: "LibreTranslate no autoriza la petición (403): hace falta una clave válida o el origen no está permitido.",
  429: "LibreTranslate está saturado (429): espera unos segundos y vuelve a intentarlo.",
  500: "LibreTranslate falló en su servidor (500): la traducción no se completó, reinténtalo más tarde.",
};
const mensajeDeEstado = (e: number) => MENSAJES[e] ?? `LibreTranslate respondió con un error ${e}.`;
interface Trozo { indice: number; texto: string }
function trocear(texto: string, tope: number): string[] {
  const trozos: string[] = []; let resto = texto;
  while (resto.length > tope) {
    const corte = Math.max(resto.lastIndexOf("\n", tope), resto.lastIndexOf(" ", tope));
    const fin = corte > tope / 2 ? corte : tope;
    trozos.push(resto.slice(0, fin).trim()); resto = resto.slice(fin).trimStart();
  }
  if (resto.trim()) trozos.push(resto.trim());
  return trozos.filter(Boolean);
}

function planificar(textos: string[], tope: number, dividir: boolean): Trozo[][] {
  const lotes: Trozo[][] = []; let lote: Trozo[] = []; let usado = 0;
  textos.forEach((texto, indice) => {
    for (const trozo of dividir ? trocear(texto, tope) : [texto]) {
      if (!trozo) continue;
      if (lote.length > 0 && usado + trozo.length > tope) { lotes.push(lote); lote = []; usado = 0; }
      lote.push({ indice, texto: trozo }); usado += trozo.length;
    }
  });
  if (lote.length > 0) lotes.push(lote);
  return lotes;
}

function cuerpo(apiKey: string | undefined, datos: Record<string, unknown>): string {
  return JSON.stringify(apiKey ? { ...datos, api_key: apiKey } : datos);
}

async function pedir(f: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  let r: Response;
  try { r = await f(url, init); } catch { throw new ErrorLibreTranslate(0, "No se pudo llegar a LibreTranslate: revisa la dirección y tu conexión.", "red"); }
  if (!r.ok) throw new ErrorLibreTranslate(r.status, mensajeDeEstado(r.status));
  try { return await r.json(); } catch { throw new ErrorLibreTranslate(r.status, "LibreTranslate devolvió una respuesta que no es JSON.", "respuesta"); }
}

async function traducirCon(f: FetchLike, base: string, apiKey: string | undefined, tope: number, s: SolicitudTraduccion): Promise<RespuestaTraduccion> {
  const q = s.q; const textos = Array.isArray(q) ? [...q] : [q];
  if (textos.length === 0) return { translatedText: [] };
  const target = s.target.trim();
  if (!target) throw new ErrorLibreTranslate(0, "Indica el idioma de destino (target).", "validacion");
  const format = s.format ?? "text"; const origen = s.source?.trim() || "auto"; const piezas: string[][] = textos.map(() => []);
  const lotes = planificar(textos, tope, format === "text"); let detectado: IdiomaDetectado | undefined;
  for (const lote of lotes) {
    const enviado = lote.map((t) => t.texto);
    const qEnviado = !Array.isArray(q) && lotes.length === 1 ? enviado[0] : enviado;
    const datos = (await pedir(f, `${base}/translate`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: cuerpo(apiKey, { q: qEnviado, source: origen, target, format }) })) as { translatedText?: unknown; detectedLanguage?: IdiomaDetectado };
    const traducidos = Array.isArray(datos.translatedText) ? datos.translatedText.map(String) : [String(datos.translatedText ?? "")];
    if (traducidos.length !== enviado.length) throw new ErrorLibreTranslate(0, "LibreTranslate devolvió un número de traducciones distinto del enviado.", "respuesta");
    lote.forEach((t, i) => piezas[t.indice].push(traducidos[i]));
    const d = datos.detectedLanguage;
    if (origen === "auto" && !detectado && d && typeof d.language === "string") detectado = { language: d.language, confidence: Number(d.confidence ?? 0) };
  }
  const traducido = piezas.map((p) => p.join(" "));
  return Array.isArray(q) ? { translatedText: traducido, detectedLanguage: detectado } : { translatedText: traducido[0] ?? "", detectedLanguage: detectado };
}

async function idiomasCon(f: FetchLike, base: string, apiKey: string | undefined): Promise<IdiomaLibreTranslate[]> {
  const ruta = apiKey ? `${base}/languages?api_key=${encodeURIComponent(apiKey)}` : `${base}/languages`;
  const datos = await pedir(f, ruta, { method: "GET" });
  const lista = Array.isArray(datos) ? datos : (datos as { languages?: unknown } | null)?.languages;
  if (!Array.isArray(lista)) throw new ErrorLibreTranslate(0, "LibreTranslate devolvió la lista de idiomas en un formato inesperado.", "respuesta");
  return lista.map((x) => {
    const i = (x ?? {}) as Record<string, unknown>;
    return { code: String(i.code ?? ""), name: String(i.name ?? i.code ?? ""), targets: Array.isArray(i.targets) ? i.targets.map(String) : [] };
  }).filter((i) => i.code);
}

async function detectarCon(f: FetchLike, base: string, apiKey: string | undefined, q: string): Promise<IdiomaDetectado[]> {
  const texto = q.trim();
  if (!texto) return [];
  const datos = await pedir(f, `${base}/detect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo(apiKey, { q: texto }) });
  return (Array.isArray(datos) ? datos : [datos]).map((x) => {
    const d = (x ?? {}) as Record<string, unknown>;
    return { language: String(d.language ?? ""), confidence: Number(d.confidence ?? 0) };
  }).filter((d) => d.language);
}

async function saludCon(f: FetchLike, base: string): Promise<EstadoLibreTranslate> {
  const datos = (await pedir(f, `${base}/health`, { method: "GET" })) as { status?: unknown } | null;
  return { status: typeof datos?.status === "string" ? datos.status : "ok" };
}

export function crearClienteLibreTranslate(o: OpcionesLibreTranslate): ClienteLibreTranslate {
  const base = o.base?.trim().replace(/\/+$/, "") ?? "";
  if (!base) throw new ErrorLibreTranslate(0, "Indica la dirección de LibreTranslate (base).", "validacion");
  const f = o.fetch ?? ((url, init) => fetch(url, init));
  const apiKey = o.apiKey?.trim() || undefined;
  const limite = o.limiteCaracteres && o.limiteCaracteres > 0 ? Math.floor(o.limiteCaracteres) : LIMITE_CARACTERES;
  return { base, limiteCaracteres: limite, traducir: (s) => traducirCon(f, base, apiKey, limite, s),
    idiomas: () => idiomasCon(f, base, apiKey), detectar: (q) => detectarCon(f, base, apiKey, q), salud: () => saludCon(f, base) };
}
