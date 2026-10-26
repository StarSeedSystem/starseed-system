/**
 * Conocimiento · Cliente WEKNORA en SOLO LECTURA (Ola 1025U · tarea REP1026). Deja que Astraura pregunte a una base de
 * conocimiento de WeKnora (Tencent, MIT) y reciba fragmentos CON su documento de origen, sin que el OS tenga que
 * copiar ni reindexar nada. Solo las rutas documentadas el 2026-10-26 en el repositorio Tencent/WeKnora
 * (`docs/swagger.json`, basePath `/api/v1`, y `website-docs/04-api/01-api-overview.md` y `02-api-chat.md`/`02-api-knowledge.md`):
 *
 *  · `GET  {url}/health`                      sonda sin autenticación; responde `{"status":"ok"}`.
 *  · `GET  {url}/api/v1/knowledge-bases`      lista las bases del espacio; clave con la capacidad `retrieve` (o completa).
 *  · `POST {url}/api/v1/knowledge-search`     búsqueda SIN sesión ni resumen con LLM: «el interfaz preferido para sistemas
 *                                             externos»; clave con `retrieve`. Responde `{success, data:[SearchResult], meta}`.
 *
 * Autenticación: cabecera `X-API-Key` con la clave de API del espacio (una clave limitada a `retrieve` basta y es lo
 * recomendable). NO se usa el chat de preguntas y respuestas (`/knowledge-chat`): crea sesiones y gasta tokens del
 * modelo de la instancia, y eso no es lectura. URL y clave se leen por el NOMBRE de su variable de entorno
 * (`WEKNORA_URL`, `WEKNORA_API_KEY`) en el servidor que llama; jamás en el repo ni en un error. `fetch` y reloj
 * inyectados, `redirect: "manual"`, tope de tiempo y de tamaño (ver `lectura-http.ts`).
 *
 * Límite honesto: hoy no hay ninguna instancia de WeKnora; este cliente está probado con respuestas simuladas.
 */

import {
  acotar,
  booleano,
  credencialesDeEntorno,
  esObjeto,
  identificador,
  numero,
  pedirJson,
  recortar,
  TIEMPO_SONDEO_MS,
  texto,
  type CredencialesDeEntorno,
  type CredencialesLectura,
  type FetchLectura,
  type OpcionesLectura,
  type PerfilServicio,
  type ResultadoLectura,
} from "../servidores/lectura-http";

export type { CredencialesLectura as CredencialesWeKnora, FalloLectura as FalloWeKnora, FetchLectura as FetchWeKnora, OpcionesLectura as OpcionesWeKnora, ResultadoLectura as ResultadoWeKnora } from "../servidores/lectura-http";

/** Dónde se comprobó cada ruta (para quien lea el código o la ficha). */
export const REFERENCIA_WEKNORA = Object.freeze({
  repo: "https://github.com/Tencent/WeKnora",
  comprobada: "2026-10-26",
  version: "v0.8.3",
  rutas: ["GET /health", "GET /api/v1/knowledge-bases", "POST /api/v1/knowledge-search"],
});

/** NOMBRES de las variables de entorno (nunca sus valores) y de la cabecera. */
export const VARIABLES_WEKNORA = Object.freeze({ url: "WEKNORA_URL", clave: "WEKNORA_API_KEY" });

export const PERFIL_WEKNORA: PerfilServicio = {
  nombre: "WeKnora",
  variableUrl: VARIABLES_WEKNORA.url,
  variableClave: VARIABLES_WEKNORA.clave,
  autenticacion: (token) => ({ "x-api-key": token }),
  sufijoApi: "/api/v1",
  motivoEstado: Object.freeze({
    400: "WeKnora rechazó la petición (400): revisa la pregunta y los identificadores de las bases.",
    401: "Clave de API inválida o caducada: crea otra en WeKnora (Ajustes › Claves de API) y ponla en WEKNORA_API_KEY.",
    403: "La clave no tiene permiso: necesita la capacidad «retrieve» y, si está limitada a bases concretas, la base pedida debe estar en su lista.",
    404: "WeKnora no responde en esa dirección: la API vive en /api/v1 del backend (puerto 8080 por defecto); revisa WEKNORA_URL.",
    429: "WeKnora pide ir más despacio (demasiadas peticiones): espera un momento.",
    500: "WeKnora falló por dentro (500): mira el registro de su contenedor «app».",
    502: "WeKnora no es alcanzable desde su proxy (502): ¿está caído el backend?",
    503: "WeKnora no está disponible ahora mismo (503).",
  }),
};

/** Lee `WEKNORA_URL` y `WEKNORA_API_KEY` del entorno que pase quien llama (p. ej. `process.env` en una ruta de servidor). */
export function credencialesWeKnora(env: Readonly<Record<string, string | undefined>>): CredencialesDeEntorno {
  return credencialesDeEntorno(env, PERFIL_WEKNORA);
}

/* ── Lo que devuelve cada operación (cada campo ausente es «sin dato»: null) ── */

export interface SaludWeKnora {
  /** `true` solo si responde `{"status":"ok"}`, tal como documenta WeKnora. */
  ok: boolean;
  estado: string | null;
}

export interface BaseWeKnora {
  id: string;
  nombre: string | null;
  descripcion: string | null;
  tipo: string | null;
  documentos: number | null;
  fragmentos: number | null;
  procesando: boolean | null;
  actualizada: string | null;
}

export interface FragmentoWeKnora {
  id: string | null;
  /** Texto del fragmento, recortado a `MAX_CONTENIDO` caracteres. */
  contenido: string | null;
  recortado: boolean;
  puntuacion: number | null;
  /** Cómo coincidió (`match_type` de WeKnora: vector, palabras clave…). */
  coincidencia: string | null;
  tipoFragmento: string | null;
  documentoId: string | null;
  /** Título del documento (o su nombre de archivo si no hay título): para citar el origen. */
  documento: string | null;
  baseId: string | null;
}

export interface BusquedaWeKnora {
  fragmentos: FragmentoWeKnora[];
  /** Si no hay resultados, lo que diga `meta.rerank.outcome` (la propia documentación lo manda mirar). */
  motivoVacio: string | null;
}

export interface PeticionBusquedaWeKnora {
  /** Texto a buscar (1–500 caracteres). */
  consulta: string;
  /** Bases donde buscar (al menos una: la documentación solo describe la búsqueda con alcance explícito). */
  bases: readonly string[];
  /** Cuántos fragmentos pedir (1–20, por defecto 5). */
  limite?: number;
  /** `false` apaga el reordenado con modelo (`rerank.enabled=false`): más barato si la instancia usa un modelo de pago. */
  reordenar?: boolean;
}

/** Cuánto texto de cada fragmento se devuelve como máximo. */
export const MAX_CONTENIDO = 2_000;
export const MAX_CONSULTA = 500;
export const MAX_BASES = 10;
export const LIMITE_BUSQUEDA = { minimo: 1, maximo: 20, defecto: 5 } as const;

const rechazo = (motivo: string): Extract<ResultadoLectura<never>, { ok: false }> => ({ ok: false, fallo: "peticion", motivo, estado: null, ms: 0 });

/** Sonda sin autenticación (documentada en el resumen de la API): `GET /health` → `{"status":"ok"}`. */
export async function sondear(c: CredencialesLectura, f: FetchLectura, o: OpcionesLectura = {}): Promise<ResultadoLectura<SaludWeKnora>> {
  const r = await pedirJson(c, PERFIL_WEKNORA, { ruta: "/health", publica: true, tiempoMs: TIEMPO_SONDEO_MS }, f, o);
  if (!r.ok) {
    return r.estado === 404
      ? { ...r, motivo: "No hay /health en esa dirección: si WEKNORA_URL es la del frontend (puerto 80), usa la del backend (puerto 8080), donde sí está." }
      : r;
  }
  if (!esObjeto(r.datos)) return { ok: false, fallo: "datos", motivo: "La sonda no devolvió el estado de WeKnora (¿otro servicio?).", estado: r.estado, ms: r.ms };
  const estado = texto(r.datos.status);
  return { ok: true, estado: r.estado, ms: r.ms, datos: { ok: estado === "ok", estado } };
}

/** `GET /api/v1/knowledge-bases` (clave con `retrieve`): mapea solo lo que venga; lo que falte es «sin dato». */
export async function listarBases(c: CredencialesLectura, f: FetchLectura, o: OpcionesLectura = {}): Promise<ResultadoLectura<BaseWeKnora[]>> {
  const r = await pedirJson(c, PERFIL_WEKNORA, { ruta: "/knowledge-bases" }, f, o);
  if (!r.ok) return r;
  const lista = esObjeto(r.datos) && Array.isArray(r.datos.data) ? r.datos.data : null;
  if (lista === null) {
    return { ok: false, fallo: "datos", motivo: "La respuesta no trae la lista de bases de conocimiento (¿API distinta a la documentada?).", estado: r.estado, ms: r.ms };
  }
  const bases: BaseWeKnora[] = [];
  for (const d of lista) {
    const id = esObjeto(d) ? identificador(d.id) : null;
    if (!esObjeto(d) || id === null) continue;
    bases.push({
      id,
      nombre: texto(d.name),
      descripcion: recortar(texto(d.description), 300).texto,
      tipo: texto(d.type),
      documentos: numero(d.knowledge_count),
      fragmentos: numero(d.chunk_count),
      procesando: booleano(d.is_processing),
      actualizada: texto(d.updated_at),
    });
  }
  return { ok: true, estado: r.estado, ms: r.ms, datos: bases };
}

function mapearFragmento(d: Record<string, unknown>): FragmentoWeKnora {
  const { texto: contenido, recortado } = recortar(texto(d.content), MAX_CONTENIDO);
  return {
    id: identificador(d.id),
    contenido,
    recortado,
    puntuacion: numero(d.score),
    coincidencia: texto(d.match_type),
    tipoFragmento: texto(d.chunk_type),
    documentoId: identificador(d.knowledge_id),
    documento: texto(d.knowledge_title) ?? texto(d.knowledge_filename),
    baseId: identificador(d.knowledge_base_id),
  };
}

/**
 * `POST /api/v1/knowledge-search`: recuperación híbrida (palabras clave + vectores) sin LLM de resumen. Devuelve los
 * fragmentos con su documento de origen, listos para citar. El texto buscado NO se escribe en el registro.
 */
export async function buscar(
  c: CredencialesLectura,
  peticion: PeticionBusquedaWeKnora,
  f: FetchLectura,
  o: OpcionesLectura = {},
): Promise<ResultadoLectura<BusquedaWeKnora>> {
  const consulta = (peticion.consulta ?? "").trim();
  if (!consulta) return rechazo("Escribe qué quieres buscar.");
  if (consulta.length > MAX_CONSULTA) return rechazo(`La búsqueda es demasiado larga (máximo ${MAX_CONSULTA} caracteres).`);
  const bases = (peticion.bases ?? []).map((b) => (typeof b === "string" ? b.trim() : "")).filter(Boolean);
  if (bases.length === 0) return rechazo("Indica en qué base de conocimiento buscar (lista las bases primero).");
  if (bases.length > MAX_BASES) return rechazo(`Se puede buscar como mucho en ${MAX_BASES} bases a la vez.`);

  const cuerpo: Record<string, unknown> = {
    query: consulta,
    knowledge_base_ids: bases,
    match_count: acotar(peticion.limite, LIMITE_BUSQUEDA.minimo, LIMITE_BUSQUEDA.maximo, LIMITE_BUSQUEDA.defecto),
  };
  if (peticion.reordenar === false) cuerpo.rerank = { enabled: false };

  const r = await pedirJson(c, PERFIL_WEKNORA, { ruta: "/knowledge-search", metodo: "POST", cuerpo }, f, o);
  if (!r.ok) return r;
  if (!esObjeto(r.datos) || !Array.isArray(r.datos.data)) {
    const detalle = esObjeto(r.datos) && esObjeto(r.datos.error) ? texto(r.datos.error.message) : null;
    return {
      ok: false,
      fallo: "datos",
      motivo: detalle ? `WeKnora no devolvió resultados: ${detalle.slice(0, 160)}` : "La respuesta no trae la lista de resultados (¿API distinta a la documentada?).",
      estado: r.estado,
      ms: r.ms,
    };
  }
  const fragmentos = r.datos.data.filter(esObjeto).map(mapearFragmento);
  const meta = esObjeto(r.datos.meta) && esObjeto(r.datos.meta.rerank) ? r.datos.meta.rerank : null;
  const motivoVacio = fragmentos.length === 0 && meta ? texto(meta.outcome) : null;
  return { ok: true, estado: r.estado, ms: r.ms, datos: { fragmentos, motivoVacio } };
}
