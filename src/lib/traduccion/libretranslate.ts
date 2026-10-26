// Cliente puro de LibreTranslate (Ola 1020U · TRD1020A, parte 1): sin `node:*`, con `fetch`
// inyectable (pruebas sin red) y sin jamás guardar la clave de API (repos-libreria-1020d.md §4).

export interface InstanciaLibreTranslate {
  base: string; // base de la instancia, p. ej. «http://127.0.0.1:5000»
  claveApi?: string;
  limiteCaracteres?: number; // tope de caracteres por lote (el del servidor, p. ej.)
  fetch?: typeof fetch; // transporte inyectable (pruebas)
}

export interface PeticionTraduccion {
  q: string | string[]; // texto o lista; se respeta el orden de la lista
  source: "auto" | string; // «auto» → el servidor detecta el idioma
  target: string;
  format?: "text" | "html";
}

export interface RespuestaTraduccion {
  /** Espejo de `q»: texto cuando entra texto, lista cuando entra lista. */
  traduccion: string | string[];
  /** Idioma detectado del primer lote; solo cuando source es «auto». */
  detectado?: string | null;
}

export interface IdiomaLibreTranslate { code: string; name?: string; }

/** Candidato de detección: `language` código (p. ej. «es») y `confidence` 0–100. */
export interface DeteccionIdioma { language: string; confidence: number; }

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
      lotes.push(actual);
      actual = [];
      car = 0;
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
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
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
  } catch (e) {
    throw new Error(`No se pudo conectar con LibreTranslate (${base}${ruta}): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!respuesta.ok) throw new Error(MENSAJES_HTTP[respuesta.status] ?? `LibreTranslate respondió HTTP ${respuesta.status}.`);
  return respuesta.json();
}

/** Traduce por lotes (POST /translate) respetando el orden de la entrada. */
export async function traducir(instancia: InstanciaLibreTranslate, entrada: PeticionTraduccion): Promise<RespuestaTraduccion> {
  const qEntrada = entrada.q; const esLista = Array.isArray(qEntrada); const textos = esLista ? qEntrada : [qEntrada];
  const hechos: string[] = [];
  let detectado: string | null | undefined;
  for (const lote of crearLotes(textos, instancia.limiteCaracteres)) {
    // LibreTranslate devuelve texto o lista tal como recibe `q»: se envía igual.
    const cuerpo: Record<string, unknown> = { q: esLista ? lote : lote[0], source: entrada.source, target: entrada.target, format: entrada.format ?? "text" };
    if (instancia.claveApi) cuerpo.api_key = instancia.claveApi;
    const datos = objetosDe(await pedir(instancia, "/translate", cuerpo))[0];
    for (const t of textosDe(datos?.translatedText)) hechos.push(t);
    if (entrada.source === "auto" && detectado === undefined) {
      const l = objetosDe(datos?.detectedLanguage)[0]?.language;
      detectado = typeof l === "string" ? l : null;
    }
  }
  if (hechos.length !== textos.length) throw new Error("LibreTranslate devolvió otra cantidad de traducciones que la esperada.");
  return detectado === undefined ? { traduccion: esLista ? hechos : hechos[0] } : { traduccion: esLista ? hechos : hechos[0], detectado };
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

/** Salud de la instancia (GET /health): true si responde sin error y no tuvo éxito negado. */
export async function salud(instancia: InstanciaLibreTranslate): Promise<boolean> {
  try { return objetosDe(await pedir(instancia, "/health"))[0]?.success !== false; } catch { return false; }
}
