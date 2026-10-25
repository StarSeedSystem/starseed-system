/** Cliente puro de LibreTranslate (TRD1020A, parte 1): POST /translate con lotes por límite de
 * caracteres y orden garantizado, GET /languages, POST /detect y GET /health. Contrato:
 * architecture/repos-libreria-1020d.md §4 y config/repos-libreria-1020d.json. Sin `node:*`. La
 * `api_key` solo viaja en el cuerpo que quien llama hace: no se guarda ni sale en ningún error
 * (400/403/429/500 explicados en español claro). Sin red en pruebas: `fetch` inyectado; elegir
 * a qué instancia se llama (privacidad) es de TRD1020B. */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export interface OpcionesLibreTranslate { base: string; fetch?: FetchLike; api_key?: string; limiteCaracteres?: number }
export interface PeticionTraduccion { q: string | string[]; source: "auto" | string; target: string; format?: "text" | "html" }
/** Resultado en el MISMO orden que la petición; `detectado` solo cuando se pidió source «auto». */
export interface Traduccion { texto: string | string[]; detectado?: string }
export interface Idioma { codigo: string; nombre: string }
export interface Deteccion { idioma: string; confianza: number }
/** Error con el estado HTTP («null» si no hubo respuesta: red caída o respuesta rota). */
export class ErrorTraduccion extends Error {
  estado: number | null;
  constructor(estado: number | null, mensaje: string) { super(mensaje); this.estado = estado; this.name = "ErrorTraduccion"; }
}
export const LIMITE_DEFECTO = 4500;
type Fila = Record<string, unknown>;

function raiz(op: OpcionesLibreTranslate): string { return op.base.replace(/\/+$/, ""); }

function errorDeEstado(estado: number, detalle: string): ErrorTraduccion {
  const mensajes: Record<number, string> = {
    400: "Petición de traducción no válida.", 403: "Clave no válida o sin permiso para ese par de idiomas.",
    429: "Demasiadas peticiones seguidas: espera un momento e inténtalo de nuevo.", 500: "El servicio de traducción falló por su parte.",
  };
  const base = mensajes[estado] ?? `El servicio de traducción respondió ${estado}.`;
  return new ErrorTraduccion(estado, detalle && estado !== 403 ? base.replace(/\.$/, `: ${detalle}.`) : base);
}

function detalleDeError(j: unknown): string {
  const r = j as { error?: unknown } | null;
  return typeof r?.error === "string" ? r.error : "";
}

async function llamada(op: OpcionesLibreTranslate, camino: string, cuerpo?: string): Promise<unknown> {
  let r: Response;
  try {
    r = await (op.fetch ?? fetch)(raiz(op) + camino, cuerpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo } : {});
  } catch {
    throw new ErrorTraduccion(null, "No se pudo llegar al servicio de traducción: sin conexión o la dirección no responde.");
  }
  const j: unknown = await r.json().catch(() => null);
  if (!r.ok) throw errorDeEstado(r.status, detalleDeError(j));
  return j;
}

function conClave(op: OpcionesLibreTranslate, datos: Fila): string {
  return JSON.stringify(op.api_key ? { ...datos, api_key: op.api_key } : datos);
}

/** Separa un texto largo en trozos de a lo sumo `limite`, cortando en el hueco más cercano
 * (espacio, salto o punto): pegados de nuevo con "" reconstruyen el texto exacto. */
export function trozosDe(texto: string, limite = LIMITE_DEFECTO): string[] {
  if (limite <= 0 || texto.length <= limite) return [texto];
  const trozos: string[] = [];
  for (let inicio = 0; inicio < texto.length; ) {
    let fin = Math.min(inicio + limite, texto.length);
    if (fin < texto.length) {
      const hueco = Math.max(texto.lastIndexOf(" ", fin), texto.lastIndexOf("\n", fin), texto.lastIndexOf(".", fin - 1));
      fin = hueco > inicio ? hueco : fin;
    }
    trozos.push(texto.slice(inicio, fin)); inicio = fin;
  }
  return trozos;
}

/** Agrupa textos en lotes que no pasan de `limite` caracteres, sin cambiar el orden. */
export function lotesDeLista(textos: string[], limite = LIMITE_DEFECTO): string[][] {
  const lotes: string[][] = [];
  let actual: string[] = [], total = 0;
  for (const t of textos) {
    if (actual.length > 0 && total + t.length > limite) { lotes.push(actual); actual = []; total = 0; }
    actual.push(t); total += t.length;
  }
  if (actual.length > 0) lotes.push(actual);
  return lotes;
}

function filasDe(j: unknown): Fila[] {
  return (Array.isArray(j) ? j : [j]).filter((f): f is Fila => typeof f === "object" && f !== null);
}

export function crearLibreTranslate(op: OpcionesLibreTranslate) {
  const limite = op.limiteCaracteres ?? LIMITE_DEFECTO;
  return {
    traducir: async (p: PeticionTraduccion): Promise<Traduccion> => {
      const esLista = Array.isArray(p.q);
      const entradas = esLista ? (p.q as string[]) : [p.q as string];
      const trozos: string[] = [], plan: number[] = [], traducidos: string[] = [];
      // ¿De qué entrada viene cada trozo? `plan` lo guarda en el orden exacto de la petición.
      entradas.forEach((texto, i) => trozosDe(texto, limite).forEach((t) => { trozos.push(t); plan.push(i); }));
      let detectado: string | undefined;
      for (const lote of lotesDeLista(trozos, limite)) {
        const filas = filasDe(await llamada(op, "/translate", conClave(op, { q: lote.length === 1 ? lote[0] : lote, source: p.source, target: p.target, format: p.format ?? "text" })));
        if (filas.length !== lote.length) throw new ErrorTraduccion(null, "El servicio devolvió menos traducciones de las pedidas.");
        filas.forEach((f) => {
          if (typeof f["translatedText"] !== "string") throw new ErrorTraduccion(null, "La respuesta no se pudo entender (falta translatedText).");
          traducidos.push(f["translatedText"] as string);
          const l = (f["detectedLanguage"] as Fila | undefined)?.language;
          if (p.source === "auto" && detectado === undefined && typeof l === "string") detectado = l;
        });
      }
      const textos = entradas.map((_, i) => plan.reduce((acc, dueño, k) => (dueño === i ? `${acc}${traducidos[k]}` : acc), ""));
      return esLista ? { texto: textos, detectado } : { texto: textos[0] ?? "", detectado };
    },
    idiomas: async (): Promise<Idioma[]> => filasDe(await llamada(op, "/languages"))
      .map((f) => ({ codigo: typeof f["code"] === "string" ? (f["code"] as string) : "", nombre: typeof f["name"] === "string" ? (f["name"] as string) : "" }))
      .filter((i) => i["codigo"] !== "" && i["nombre"] !== ""),
    detectar: async (q: string): Promise<Deteccion[]> => filasDe(await llamada(op, "/detect", conClave(op, { q })))
      .map((f) => ({ idioma: typeof f["language"] === "string" ? (f["language"] as string) : "", confianza: typeof f["confidence"] === "number" ? f["confidence"] : 0 }))
      .filter((d) => d["idioma"] !== ""),
    salud: async (): Promise<boolean> => {
      try { return (await (op.fetch ?? fetch)(`${raiz(op)}/health`)).ok; } catch { return false; }
    },
  };
}
