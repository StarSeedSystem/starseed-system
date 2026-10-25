// src/lib/traduccion/libretranslate.ts — cliente puro de LibreTranslate
// (Ola 1020U · TRD1020A, parte 1). Sin `node:*` y con `fetch` inyectable: sirve
// en navegador y servidor y se prueba sin red. La clave de API va solo en el
// cuerpo cuando quien llama la pasa, jamás se guarda aquí (repos-libreria-1020d.md §4).

export interface InstanciaLibreTranslate {
  base: string; // base sin barra final, p. ej. «http://127.0.0.1:5000»
  claveApi?: string;
  limiteCaracteres?: number;
  fetch?: typeof fetch; // transporte inyectable (pruebas)
}

export interface PeticionTraduccion {
  q: string | string[]; // texto o lista; se respeta el orden de la lista
  source: "auto" | string; // «auto» → el servidor detecta el idioma
  target: string;
  format?: "text" | "html";
}

export interface RespuestaTraduccion {
  textos: string[]; // una por texto de entrada, en el mismo orden
  /** Idioma detectado del primer lote; solo cuando source es «auto». */
  detectado?: string | null;
}

export interface IdiomaLibreTranslate {
  code: string;
  name?: string;
}

export interface DeteccionIdioma {
  language: string; // código del candidato, p. ej. «es»
  confidence: number;
}

const LOTE_DEFECTO = 1800;

const MENSAJES_HTTP: Record<number, string> = {
  400: "LibreTranslate rechazó la petición (400): revisa los idiomas o el texto.",
  403: "LibreTranslate rechazó la clave de API (403): falta o no es válida.",
  429: "LibreTranslate está saturada (429): espera un momento y reintenta.",
  500: "Error interno de LibreTranslate (500): inténtalo más tarde.",
};

/** Junta los textos en lotes que no superen el límite; un texto grande va solo. */
export function crearLotes(textos: string[], limite: number = LOTE_DEFECTO): string[][] {
  const lotes: string[][] = []; let actual: string[] = []; let car = 0;
  for (const texto of textos) {
    if (actual.length > 0 && car + texto.length > limite) {
      lotes.push(actual); actual = []; car = 0;
    }
    actual.push(texto);
    car += texto.length;
  }
  if (actual.length > 0) lotes.push(actual);
  return lotes;
}

/** Piezas de una respuesta: `objetosDe` toma objetos (uno o lista); `textosDe`, el translatedText. */
function objetosDe(valor: unknown): Record<string, unknown>[] {
  if (Array.isArray(valor)) return valor.filter((v): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v));
  return valor !== null && typeof valor === "object" ? [valor as Record<string, unknown>] : [];
}
function textosDe(valor: unknown): string[] {
  if (typeof valor === "string") return [valor];
  if (Array.isArray(valor)) return valor.filter((v): v is string => typeof v === "string");
  return [];
}

async function pedir(instancia: InstanciaLibreTranslate, ruta: string, cuerpo?: Record<string, unknown>): Promise<unknown> {
  const enviador = instancia.fetch ?? fetch; const base = instancia.base.replace(/\/+$/, "");
  let respuesta: Response;
  try {
    respuesta = await enviador(`${base}${ruta}`, {
      method: cuerpo ? "POST" : "GET",
      headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (e) { throw new Error(`No se pudo conectar con LibreTranslate (${base}${ruta}): ${e instanceof Error ? e.message : String(e)}`); }
  if (!respuesta.ok) throw new Error(MENSAJES_HTTP[respuesta.status] ?? `LibreTranslate respondió HTTP ${respuesta.status}.`);
  return respuesta.json();
}

/** Traduce por lotes (POST /translate) respetando el orden de la entrada. */
export async function traducir(instancia: InstanciaLibreTranslate, entrada: PeticionTraduccion): Promise<RespuestaTraduccion> {
  const textos = Array.isArray(entrada.q) ? entrada.q : [entrada.q];
  const traducciones: string[] = []; let detectado: string | null | undefined;
  for (const lote of crearLotes(textos, instancia.limiteCaracteres)) {
    const cuerpo: Record<string, unknown> = { q: lote, source: entrada.source, target: entrada.target, format: entrada.format ?? "text" };
    if (instancia.claveApi) cuerpo.api_key = instancia.claveApi;
    const datos = objetosDe(await pedir(instancia, "/translate", cuerpo))[0];
    for (const t of textosDe(datos?.translatedText)) if (typeof t === "string") traducciones.push(t);
    if (entrada.source === "auto" && detectado === undefined) {
      const l = objetosDe(datos?.detectedLanguage)[0]?.language; detectado = typeof l === "string" ? l : null;
    }
  }
  if (traducciones.length !== textos.length) throw new Error("LibreTranslate devolvió otra cantidad de traducciones que la esperada.");
  return detectado === undefined ? { textos: traducciones } : { textos: traducciones, detectado };
}

/** Idiomas que ofrece la instancia (GET /languages). */
export async function idiomas(instancia: InstanciaLibreTranslate): Promise<IdiomaLibreTranslate[]> {
  return objetosDe(await pedir(instancia, "/languages"))
    .map((o) => ({ code: typeof o.code === "string" ? o.code : "", name: typeof o.name === "string" ? o.name : undefined }))
    .filter((i) => i.code !== "");
}

/** Candidatos de idioma de un texto, en el orden que da el servidor (POST /detect). */
export async function detectar(instancia: InstanciaLibreTranslate, q: string): Promise<DeteccionIdioma[]> {
  const cuerpo: Record<string, unknown> = instancia.claveApi ? { q, api_key: instancia.claveApi } : { q };
  return objetosDe(await pedir(instancia, "/detect", cuerpo))
    .map((o) => ({ language: typeof o.language === "string" ? o.language : "", confidence: typeof o.confidence === "number" ? o.confidence : 0 }))
    .filter((d) => d.language !== "");
}

/** Salud de la instancia (GET /health): true si responde sin error. */
export async function salud(instancia: InstanciaLibreTranslate): Promise<boolean> {
  try { return objetosDe(await pedir(instancia, "/health"))[0]?.success !== false; }
  catch { return false; }
}
