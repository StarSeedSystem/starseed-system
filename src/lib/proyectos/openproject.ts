/**
 * Proyectos · Cliente OPENPROJECT en SOLO LECTURA (Ola 1025U · tarea REP1026). Deja que Astraura y los agentes de la
 * red vean los proyectos y los paquetes de trabajo de una instancia de OpenProject (GPL-3.0, autoalojada) sin escribir
 * nada en ella. Solo las rutas de la API v3 documentadas el 2026-10-26 en el repositorio opf/openproject
 * (`docs/api/apiv3/`: `openapi-spec.yml`, `paths/root.yml`, `projects.yml`, `work_packages.yml`, `tags/collections.yml`
 * y `tags/filters.yml`; versión 17.9.3):
 *
 *  · `GET {url}/api/v3`                 raíz: `instanceName` y, para administradores, `coreVersion`.
 *  · `GET {url}/api/v3/projects`        proyectos que la clave puede ver (desde la 17.0 también programas y carteras).
 *  · `GET {url}/api/v3/work_packages`   paquetes de trabajo visibles; filtro `project` y filtro `status_id` con
 *                                       operador `o` (abiertos). (La ruta antigua `/projects/{id}/work_packages` está
 *                                       marcada como obsoleta y no se usa.)
 *
 * Autenticación: token de API de la persona como «Basic» con usuario `apikey` (NO su login) y el token como clave,
 * tal como describe `openapi-spec.yml`. El token se crea en la cuenta de OpenProject y respeta los permisos de esa
 * persona. Paginación por número de página (`offset` es la página, desde 1) y `pageSize`. URL y token se leen por el
 * NOMBRE de su variable de entorno (`OPENPROJECT_URL`, `OPENPROJECT_API_KEY`) en el servidor que llama; jamás en el
 * repo ni en un error. `fetch` y reloj inyectados, `redirect: "manual"`, tope de tiempo y de tamaño (ver `lectura-http.ts`).
 *
 * Al ser GPL-3.0, OpenProject corre como programa aparte y el OS solo habla con él por su API: no se copia su código.
 * Límite honesto: hoy no hay ninguna instancia; este cliente está probado con respuestas simuladas.
 */

import {
  acotar,
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

export type { CredencialesLectura as CredencialesOpenProject, FalloLectura as FalloOpenProject, FetchLectura as FetchOpenProject, OpcionesLectura as OpcionesOpenProject, ResultadoLectura as ResultadoOpenProject } from "../servidores/lectura-http";

/** Dónde se comprobó cada ruta (para quien lea el código o la ficha). */
export const REFERENCIA_OPENPROJECT = Object.freeze({
  repo: "https://github.com/opf/openproject",
  comprobada: "2026-10-26",
  version: "v17.9.3",
  rutas: ["GET /api/v3", "GET /api/v3/projects", "GET /api/v3/work_packages"],
});

/** NOMBRES de las variables de entorno (nunca sus valores). */
export const VARIABLES_OPENPROJECT = Object.freeze({ url: "OPENPROJECT_URL", clave: "OPENPROJECT_API_KEY" });

/** Usuario fijo de la autenticación «Basic» con token de API (no es el usuario de la persona). */
const USUARIO_API = "apikey";

const basic = (token: string): string => `Basic ${btoa(`${USUARIO_API}:${token}`)}`;

export const PERFIL_OPENPROJECT: PerfilServicio = {
  nombre: "OpenProject",
  variableUrl: VARIABLES_OPENPROJECT.url,
  variableClave: VARIABLES_OPENPROJECT.clave,
  autenticacion: (token) => ({ authorization: basic(token) }),
  secretosDerivados: (token) => [btoa(`${USUARIO_API}:${token}`)],
  sufijoApi: "/api/v3",
  motivoEstado: Object.freeze({
    400: "OpenProject rechazó la consulta (400): revisa los filtros o el tamaño de página.",
    401: "Token inválido, caducado o API desactivada: crea otro token en tu cuenta de OpenProject (Cuenta › Tokens de acceso) y ponlo en OPENPROJECT_API_KEY.",
    403: "El token no tiene permiso para ver eso: la persona dueña del token necesita ver los proyectos o paquetes de trabajo.",
    404: "OpenProject no responde en esa dirección: la API vive en /api/v3; revisa OPENPROJECT_URL.",
    429: "OpenProject pide ir más despacio (demasiadas peticiones): espera un momento.",
    500: "OpenProject falló por dentro (500): mira su registro.",
    502: "OpenProject no es alcanzable desde su proxy (502): ¿está caído?",
    503: "OpenProject no está disponible ahora mismo (503).",
  }),
};

/** Lee `OPENPROJECT_URL` y `OPENPROJECT_API_KEY` del entorno que pase quien llama. */
export function credencialesOpenProject(env: Readonly<Record<string, string | undefined>>): CredencialesDeEntorno {
  return credencialesDeEntorno(env, PERFIL_OPENPROJECT);
}

/* ── Lo que devuelve cada operación (cada campo ausente es «sin dato»: null) ── */

export interface InstanciaOpenProject {
  nombre: string | null;
  /** Solo la ve un administrador (la documentación lo marca así); si no, queda sin dato. */
  version: string | null;
}

export interface ProyectoOpenProject {
  id: string;
  identificador: string | null;
  nombre: string | null;
  activo: boolean | null;
  publico: boolean | null;
  /** Descripción en texto (Markdown) recortada. */
  descripcion: string | null;
  padre: string | null;
}

export interface PaqueteOpenProject {
  id: string;
  asunto: string | null;
  tipo: string | null;
  estado: string | null;
  prioridad: string | null;
  asignado: string | null;
  proyectoId: string | null;
  proyecto: string | null;
  inicio: string | null;
  fin: string | null;
  /** 0–100, como lo da OpenProject. */
  porcentaje: number | null;
  actualizado: string | null;
}

export interface PaginaOpenProject<T> {
  elementos: T[];
  /** Total de elementos en la colección (no solo en esta página). */
  total: number | null;
  /** Página pedida (desde 1). */
  pagina: number;
  tamanoPagina: number;
  /** ¿Quedan más páginas? `null` si OpenProject no dio el total. */
  hayMas: boolean | null;
}

export interface OpcionesPagina {
  /** Número de página, desde 1 (por defecto 1). */
  pagina?: number;
  /** Elementos por página, 1–100 (por defecto 20). */
  tamano?: number;
}

export const TAMANO_PAGINA = { minimo: 1, maximo: 100, defecto: 20 } as const;
export const MAX_DESCRIPCION = 500;

const rechazo = (motivo: string): Extract<ResultadoLectura<never>, { ok: false }> => ({ ok: false, fallo: "peticion", motivo, estado: null, ms: 0 });

function paginacion(opciones: OpcionesPagina): { pagina: number; tamano: number } {
  return {
    pagina: acotar(opciones.pagina, 1, 10_000, 1),
    tamano: acotar(opciones.tamano, TAMANO_PAGINA.minimo, TAMANO_PAGINA.maximo, TAMANO_PAGINA.defecto),
  };
}

/** `_links.<clave>.title` de un recurso HAL, o `null`. */
function titulo(links: unknown, clave: string): string | null {
  if (!esObjeto(links)) return null;
  const enlace = links[clave];
  return esObjeto(enlace) ? texto(enlace.title) : null;
}

/** El id numérico al final de un `href` como `/api/v3/projects/7`. */
function idDeEnlace(links: unknown, clave: string): string | null {
  if (!esObjeto(links)) return null;
  const enlace = links[clave];
  const href = esObjeto(enlace) ? texto(enlace.href) : null;
  const coincide = href ? /\/(\d+)\/?$/.exec(href) : null;
  return coincide ? coincide[1] : null;
}

function elementosDe(datos: unknown): unknown[] | null {
  if (!esObjeto(datos) || !esObjeto(datos._embedded)) return null;
  return Array.isArray(datos._embedded.elements) ? datos._embedded.elements : null;
}

function armarPagina<T>(datos: unknown, elementos: T[], pagina: number, tamano: number): PaginaOpenProject<T> {
  const total = esObjeto(datos) ? numero(datos.total) : null;
  return { elementos, total, pagina, tamanoPagina: tamano, hayMas: total === null ? null : pagina * tamano < total };
}

/** Sonda verificada en la documentación: `GET /api/v3` (raíz) dice cómo se llama la instancia y, si eres admin, su versión. */
export async function sondear(c: CredencialesLectura, f: FetchLectura, o: OpcionesLectura = {}): Promise<ResultadoLectura<InstanciaOpenProject>> {
  const r = await pedirJson(c, PERFIL_OPENPROJECT, { ruta: "", tiempoMs: TIEMPO_SONDEO_MS }, f, o);
  if (!r.ok) return r;
  if (!esObjeto(r.datos) || r.datos._type !== "Root") {
    return { ok: false, fallo: "datos", motivo: "La raíz de la API no es la de OpenProject (¿otro servicio en esa dirección?).", estado: r.estado, ms: r.ms };
  }
  return { ok: true, estado: r.estado, ms: r.ms, datos: { nombre: texto(r.datos.instanceName), version: texto(r.datos.coreVersion) } };
}

/** `GET /api/v3/projects` (sin filtros, `filters=[]`): los proyectos que el token puede ver. */
export async function listarProyectos(
  c: CredencialesLectura,
  f: FetchLectura,
  opciones: OpcionesPagina & { soloActivos?: boolean } = {},
  o: OpcionesLectura = {},
): Promise<ResultadoLectura<PaginaOpenProject<ProyectoOpenProject>>> {
  const { pagina, tamano } = paginacion(opciones);
  const r = await pedirJson(
    c,
    PERFIL_OPENPROJECT,
    { ruta: "/projects", consulta: { filters: "[]", sortBy: '[["id","asc"]]', pageSize: String(tamano), offset: String(pagina) } },
    f,
    o,
  );
  if (!r.ok) return r;
  const crudos = elementosDe(r.datos);
  if (crudos === null) {
    return { ok: false, fallo: "datos", motivo: "La respuesta no trae la lista de proyectos (¿API distinta a la documentada?).", estado: r.estado, ms: r.ms };
  }
  let proyectos: ProyectoOpenProject[] = [];
  for (const d of crudos) {
    const id = esObjeto(d) ? identificador(d.id) : null;
    if (!esObjeto(d) || id === null) continue;
    proyectos.push({
      id,
      identificador: texto(d.identifier),
      nombre: texto(d.name),
      activo: typeof d.active === "boolean" ? d.active : null,
      publico: typeof d.public === "boolean" ? d.public : null,
      descripcion: recortar(esObjeto(d.description) ? texto(d.description.raw) : null, MAX_DESCRIPCION).texto,
      padre: titulo(d._links, "parent"),
    });
  }
  // Los archivados siguen en la lista: el filtro `active` de la API no se usa (sus valores booleanos no están comprobados).
  if (opciones.soloActivos) proyectos = proyectos.filter((p) => p.activo !== false);
  return { ok: true, estado: r.estado, ms: r.ms, datos: armarPagina(r.datos, proyectos, pagina, tamano) };
}

export interface OpcionesPaquetes extends OpcionesPagina {
  /** Id numérico de un proyecto: solo sus paquetes (filtro `project` con operador `=`). */
  proyectoId?: number | string;
  /** Incluir también los cerrados (por defecto solo los abiertos, filtro `status_id` con operador `o`). */
  incluirCerrados?: boolean;
}

/** `GET /api/v3/work_packages` con `filters` explícitos (la documentación pide mandar `[]` si no hay filtro). */
export async function listarPaquetes(
  c: CredencialesLectura,
  f: FetchLectura,
  opciones: OpcionesPaquetes = {},
  o: OpcionesLectura = {},
): Promise<ResultadoLectura<PaginaOpenProject<PaqueteOpenProject>>> {
  const { pagina, tamano } = paginacion(opciones);
  const filtros: Record<string, unknown>[] = [];
  if (opciones.proyectoId !== undefined) {
    const id = String(opciones.proyectoId).trim();
    if (!/^\d{1,10}$/.test(id)) return rechazo("El proyecto debe ser su id numérico (lo da listarProyectos).");
    filtros.push({ project: { operator: "=", values: [id] } });
  }
  if (!opciones.incluirCerrados) filtros.push({ status_id: { operator: "o", values: null } });

  const r = await pedirJson(
    c,
    PERFIL_OPENPROJECT,
    {
      ruta: "/work_packages",
      consulta: { filters: JSON.stringify(filtros), sortBy: '[["id","asc"]]', pageSize: String(tamano), offset: String(pagina) },
    },
    f,
    o,
  );
  if (!r.ok) return r;
  const crudos = elementosDe(r.datos);
  if (crudos === null) {
    return { ok: false, fallo: "datos", motivo: "La respuesta no trae la lista de paquetes de trabajo (¿API distinta a la documentada?).", estado: r.estado, ms: r.ms };
  }
  const paquetes: PaqueteOpenProject[] = [];
  for (const d of crudos) {
    const id = esObjeto(d) ? identificador(d.id) : null;
    if (!esObjeto(d) || id === null) continue;
    paquetes.push({
      id,
      asunto: texto(d.subject),
      tipo: titulo(d._links, "type"),
      estado: titulo(d._links, "status"),
      prioridad: titulo(d._links, "priority"),
      asignado: titulo(d._links, "assignee"),
      proyectoId: idDeEnlace(d._links, "project"),
      proyecto: titulo(d._links, "project"),
      inicio: texto(d.startDate),
      fin: texto(d.dueDate),
      porcentaje: numero(d.percentageDone),
      actualizado: texto(d.updatedAt),
    });
  }
  return { ok: true, estado: r.estado, ms: r.ms, datos: armarPagina(r.datos, paquetes, pagina, tamano) };
}
