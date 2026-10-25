// Imaginación · tipos y resumen puros para Genesis (sin red, sin disco, reloj por parámetro).
// Contrato: architecture/imaginacion-autodesarrollo.md §3, §4 y §6 (Ola 1021I) y el de la Ola 1024I
// (propuestas libres de los agentes imaginativos, reimaginar, lote y la aprobación automática).
// Espejo de autodesarrollo_logica.py. Lo importa el cliente: jamás `node:*` aquí.
export type FuentePropuesta = "diaria" | "profunda" | "astraura" | "directores" | "agentes";
export type ImportanciaPropuesta = "baja" | "media" | "alta" | "crítica";
export type EstadoPropuesta =
  | "nueva" | "autodesarrollo" | "esperando-aprobacion" | "pregunta"
  | "descartada" | "aprobada" | "rechazada" | "pospuesta" | "hecha"
  | "reimaginando" | "reimaginada";
export type TipoPropuesta = "codigo" | "diseno" | "contenido" | "investigacion" | "otro";
export type AmbitoPropuesta = "metagenesis" | "personal" | `grupo:${string}` | `pagina:${string}`;
/** Quién decide: Alex con sus botones o la aprobación y reimaginación automática (§3). */
export type QuienDecide = "alex" | "automatica";
export interface ReferenciaPropuesta { titulo: string; url: string }
/** Lo que se pidió al reimaginar: notas (≤ 2000), referencias https, cuándo y quién. */
export interface Reimaginacion { notas: string; referencias: ReferenciaPropuesta[]; pedida: string; por: QuienDecide }

export interface PropuestaImaginacion {
  id: string; fuente: FuentePropuesta; titulo: string; cuerpo: string; archivos: string[];
  utilidad: number; importancia: ImportanciaPropuesta; estado: EstadoPropuesta;
  motivo: string; tarea?: string; t: string; // t: instante ISO 8601
  // Ola 1024I: todo opcional al leer (una propuesta vieja sigue valiendo).
  agente?: string; tipo?: TipoPropuesta; ambito?: AmbitoPropuesta; referencias?: ReferenciaPropuesta[];
  version?: number; version_de?: string; reimaginacion?: Reimaginacion; decidida?: string; hasta?: string;
}
/** La que devuelve el servidor: los campos nuevos ya rellenados con su defecto. */
export type PropuestaNormalizada = PropuestaImaginacion & Required<Pick<PropuestaImaginacion, "tipo" | "ambito" | "referencias" | "version">>;

export interface FranjaHoraria { dias: number[]; desde: string; hasta: string }
/** El botón «Aprobación y reimaginación automática» (§3). Alta y crítica NUNCA se aprueban solas. */
export interface AjustesAuto { aprobar: boolean; reimaginar: boolean; umbral: number; max_reimaginaciones: number }
export interface AjustesAutodesarrollo {
  automatico: boolean; rango: { min: number; max: number };
  fuentes: Record<FuentePropuesta, boolean>;
  horario: { modo: "inteligente" | "franjas"; franjas: FranjaHoraria[]; repartir: boolean };
  profunda: { cada_dias: number };
  auto: AjustesAuto;
}
export const NOMBRE_FUENTE: Record<FuentePropuesta, string> = {
  diaria: "Imaginación diaria", profunda: "Imaginación profunda",
  astraura: "Procesos imaginativos de Astraura", directores: "Directores", agentes: "Agentes imaginativos",
};
export const NOMBRE_TIPO: Record<TipoPropuesta, string> = {
  codigo: "Código", diseno: "Diseño", contenido: "Contenido", investigacion: "Investigación", otro: "Otro",
};
export const NOMBRE_ESTADO: Record<EstadoPropuesta, string> = {
  nueva: "Nueva", autodesarrollo: "Autodesarrollo", "esperando-aprobacion": "Esperando tu aprobación", pregunta: "Pregunta",
  descartada: "Descartada", aprobada: "Integrada", rechazada: "Rechazada", pospuesta: "Pospuesta", hecha: "Hecha",
  reimaginando: "Reimaginando", reimaginada: "Reimaginada",
};
export const ESTADOS_PROPUESTA = Object.keys(NOMBRE_ESTADO) as EstadoPropuesta[];
export const TIPOS_PROPUESTA = Object.keys(NOMBRE_TIPO) as TipoPropuesta[];
export const IMPORTANCIAS_PROPUESTA: ImportanciaPropuesta[] = ["baja", "media", "alta", "crítica"];
/** Lo que Alex puede decidir con los botones (§2): «nueva» si el automático no le tocó y «descartada» para rescatarla. */
export const ESTADOS_DECIDIBLES: readonly EstadoPropuesta[] = ["esperando-aprobacion", "pregunta", "pospuesta", "nueva", "descartada"];
export const MAX_REFERENCIAS = 20;
export const MAX_LOTE = 500;

export const AJUSTES_POR_DEFECTO: AjustesAutodesarrollo = {
  automatico: true, rango: { min: 0, max: 10 },
  fuentes: { diaria: true, profunda: true, astraura: true, directores: true, agentes: true },
  horario: { modo: "inteligente", franjas: [{ dias: [0, 1, 2, 3, 4, 5, 6], desde: "02:00", hasta: "06:00" }], repartir: true },
  profunda: { cada_dias: 7 },
  auto: { aprobar: false, reimaginar: false, umbral: 0.75, max_reimaginaciones: 2 },
};
const FUENTES = Object.keys(AJUSTES_POR_DEFECTO.fuentes) as FuentePropuesta[];
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const AMBITO = /^(metagenesis|personal|(grupo|pagina):[A-Za-z0-9_.-]{1,80})$/;
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const entero = (v: unknown, def: number, lo: number, hi: number) =>
  typeof v === "number" && Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : def;
const cadena = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function franja(f: unknown): FranjaHoraria | null {
  if (!esObj(f) || !Array.isArray(f.dias)) return null;
  const dias = [...new Set(f.dias.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  const { desde, hasta } = f;
  if (!dias.length || typeof desde !== "string" || typeof hasta !== "string") return null;
  if (!HORA.test(desde) || !HORA.test(hasta) || desde === hasta) return null;
  return { dias, desde, hasta };
}

/** Ajustes completos y válidos; lo inválido vuelve al defecto (igual que Python). */
export function validarAjustes(d: unknown): AjustesAutodesarrollo {
  const r: AjustesAutodesarrollo = structuredClone(AJUSTES_POR_DEFECTO);
  if (!esObj(d)) return r;
  if (typeof d.automatico === "boolean") r.automatico = d.automatico;
  const rg = esObj(d.rango) ? d.rango : {};
  const mx = entero(rg.max, r.rango.max, 0, 10);
  r.rango = { min: Math.min(entero(rg.min, r.rango.min, 0, 10), mx), max: mx };
  const fu = esObj(d.fuentes) ? d.fuentes : {};
  for (const k of FUENTES) if (typeof fu[k] === "boolean") r.fuentes[k] = fu[k] as boolean;
  const h = esObj(d.horario) ? d.horario : {};
  if (h.modo === "inteligente" || h.modo === "franjas") r.horario.modo = h.modo;
  if (typeof h.repartir === "boolean") r.horario.repartir = h.repartir;
  if (Array.isArray(h.franjas)) {
    const validas = h.franjas.map(franja).filter((x): x is FranjaHoraria => x !== null);
    if (validas.length || h.franjas.length === 0) r.horario.franjas = validas;
  }
  r.profunda.cada_dias = entero(esObj(d.profunda) ? d.profunda.cada_dias : undefined, 7, 0, 365);
  const a = esObj(d.auto) ? d.auto : {};
  if (typeof a.aprobar === "boolean") r.auto.aprobar = a.aprobar;
  if (typeof a.reimaginar === "boolean") r.auto.reimaginar = a.reimaginar;
  if (typeof a.umbral === "number" && Number.isFinite(a.umbral)) r.auto.umbral = Math.min(1, Math.max(0, a.umbral));
  r.auto.max_reimaginaciones = entero(a.max_reimaginaciones, r.auto.max_reimaginaciones, 0, 10);
  return r;
}

const urlSegura = (s: string): URL | null => {
  if (s.length > 2000 || !/^https:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname && !u.username && !u.password ? u : null; // sin credenciales en la URL
  } catch {
    return null;
  }
};
/** Referencias `[{titulo, url}]` (o URLs sueltas): solo `https://`, sin repetir, como mucho 20, título ≤ 200 (si falta, el dominio). */
export function normalizarReferencias(x: unknown): ReferenciaPropuesta[] {
  if (!Array.isArray(x)) return [];
  const vistas = new Set<string>();
  const r: ReferenciaPropuesta[] = [];
  for (const it of x) {
    if (r.length >= MAX_REFERENCIAS) break;
    const crudo = typeof it === "string" ? { url: it } : esObj(it) ? it : null;
    const u = crudo && typeof crudo.url === "string" ? urlSegura(crudo.url.trim()) : null;
    if (!u || vistas.has(u.href)) continue;
    vistas.add(u.href);
    r.push({ titulo: cadena(crudo?.titulo, 200) || u.hostname, url: u.href });
  }
  return r;
}
/** La reimaginación pedida, acotada; undefined si no es un objeto. */
export function normalizarReimaginacion(x: unknown): Reimaginacion | undefined {
  if (!esObj(x)) return undefined;
  return { notas: cadena(x.notas, 2000), referencias: normalizarReferencias(x.referencias), pedida: cadena(x.pedida, 40), por: x.por === "automatica" ? "automatica" : "alex" };
}

export const esAmbito = (x: unknown): x is AmbitoPropuesta => typeof x === "string" && AMBITO.test(x);
export const normalizarAmbito = (x: unknown): AmbitoPropuesta => (esAmbito(x) ? x : "metagenesis");
/** `?ambito=` de la consulta: vacío o «todos» → «todos»; un ámbito válido → él; lo demás → null (petición mala). */
export function leerAmbito(x: unknown): AmbitoPropuesta | "todos" | null {
  if (x === undefined || x === null || x === "" || x === "todos") return "todos";
  return esAmbito(x) ? x : null;
}
/** Las propuestas de un ámbito (sin ámbito guardado = «metagenesis»); «todos» o nada → todas. */
export function filtrarPorAmbito<T extends PropuestaImaginacion>(propuestas: T[], ambito?: AmbitoPropuesta | "todos"): T[] {
  if (!ambito || ambito === "todos") return [...propuestas];
  return propuestas.filter((p) => (p.ambito ?? "metagenesis") === ambito);
}
export const esDecidible = (estado: EstadoPropuesta) => ESTADOS_DECIDIBLES.includes(estado);
/** Lo que espera una decisión de Alex (§2): lo que la lista manual deja aprobar, reimaginar, rechazar o posponer. */
export const decidibles = <T extends PropuestaImaginacion>(propuestas: T[]): T[] => propuestas.filter((p) => esDecidible(p.estado));
/** Alta y crítica: siempre con el visto bueno de Alex (regla fija, ningún interruptor la salta). */
export const exigeVistoBueno = (importancia: ImportanciaPropuesta) => importancia === "alta" || importancia === "crítica";
/** Reimaginaciones que le quedan a la automática: el máximo menos las ya hechas (versión − 1). */
export const reimaginacionesLibres = (p: PropuestaImaginacion, ajustes: AjustesAutodesarrollo) =>
  Math.max(0, ajustes.auto.max_reimaginaciones - (Math.max(1, p.version ?? 1) - 1));

export type HacerDecision = "integrar" | "reimaginar" | "rechazar" | "posponer";
export type HacerLote = Exclude<HacerDecision, "posponer">;
/**
 * Por qué no se puede tomar esta decisión sobre la propuesta, o null si se puede. Alex decide todo lo decidible;
 * la automática solo integra lo bajo/medio con utilidad ≥ umbral (con su interruptor encendido) y solo reimagina
 * con reimaginaciones libres: nunca rechaza, nunca pospone y NUNCA integra alta ni crítica.
 */
export function vetoDecision(p: PropuestaImaginacion, hacer: HacerDecision, por: QuienDecide, ajustes: AjustesAutodesarrollo): string | null {
  if (!esDecidible(p.estado)) return `Esa propuesta está «${p.estado}»: no espera tu decisión.`;
  if (por !== "automatica") return null;
  if (hacer === "integrar") {
    if (exigeVistoBueno(p.importancia)) return `Importancia ${p.importancia}: la automática nunca la integra, espera tu visto bueno.`;
    if (!ajustes.auto.aprobar) return "La aprobación automática está apagada.";
    if (p.utilidad < ajustes.auto.umbral) return `Utilidad ${p.utilidad.toFixed(2)} por debajo del umbral ${ajustes.auto.umbral.toFixed(2)}: no se integra sola.`;
    return null;
  }
  if (hacer === "reimaginar") {
    if (!ajustes.auto.reimaginar) return "La reimaginación automática está apagada.";
    if (reimaginacionesLibres(p, ajustes) <= 0) return `Sin reimaginaciones libres (máximo ${ajustes.auto.max_reimaginaciones}): queda para tu revisión.`;
    return null;
  }
  return "La automática no rechaza ni pospone: eso lo decides tú.";
}

const ESPERAN: EstadoPropuesta[] = ["esperando-aprobacion", "pregunta"];
const INTEGRADAS: EstadoPropuesta[] = ["aprobada", "autodesarrollo", "hecha"];
const PESO_IMPORTANCIA: Record<ImportanciaPropuesta, number> = { crítica: 3, alta: 2, media: 1, baja: 0 };
const mismoDia = (iso: string, hoy: Date) => {
  const f = new Date(iso);
  return !Number.isNaN(f.getTime()) && f.toDateString() === hoy.toDateString();
};

export interface ResumenPastilla { texto: string; tono: "ok" | "atencion" | "aviso"; porDecidir: number; reimaginando: number; integradasHoy: number }
/**
 * «N por decidir · R reimaginando · I integradas hoy». Por decidir: lo que espera a Alex (esperando aprobación o
 * pregunta); integradas hoy: aprobadas, autodesarrolladas o hechas con la decisión (o la fecha) de hoy.
 * Tono: aviso si espera algo alto o crítico; atención si espera algo; ok si nada.
 */
export function resumenPastilla(propuestas: PropuestaImaginacion[], hoy: Date): ResumenPastilla {
  const espera = propuestas.filter((p) => ESPERAN.includes(p.estado));
  const reimaginando = propuestas.filter((p) => p.estado === "reimaginando").length;
  const integradasHoy = propuestas.filter((p) => INTEGRADAS.includes(p.estado) && mismoDia(p.decidida ?? p.t, hoy)).length;
  const tono = espera.some((p) => exigeVistoBueno(p.importancia)) ? "aviso" : espera.length ? "atencion" : "ok";
  return { texto: `${espera.length} por decidir · ${reimaginando} reimaginando · ${integradasHoy} integradas hoy`, tono, porDecidir: espera.length, reimaginando, integradasHoy };
}

/** «aprobar» se conserva por compatibilidad (la API lo acepta); las filas ofrecen «integrar», que es lo mismo. */
export type AccionPropuesta = "integrar" | "aprobar" | "reimaginar" | "rechazar" | "posponer" | "ver-origen";
export interface FilaMedidor {
  id: string; titulo: string; fuente: string; agente?: string; tipo: TipoPropuesta; ambito: AmbitoPropuesta;
  utilidad: number; importancia: ImportanciaPropuesta; estado: EstadoPropuesta; tarea?: string; version: number;
  referencias: ReferenciaPropuesta[]; esperaAlex: boolean; decidible: boolean; acciones: AccionPropuesta[];
}
const ACCIONES_DECIDIBLE: AccionPropuesta[] = ["integrar", "reimaginar", "rechazar", "posponer", "ver-origen"];
/** Filas: primero lo que espera a Alex, luego lo demás decidible, y dentro por importancia y utilidad. */
export function filasMedidor(propuestas: PropuestaImaginacion[]): FilaMedidor[] {
  return propuestas.map((p): FilaMedidor => {
    const decidible = esDecidible(p.estado);
    const fila: FilaMedidor = {
      id: p.id, titulo: p.titulo, fuente: NOMBRE_FUENTE[p.fuente], tipo: p.tipo ?? "codigo", ambito: p.ambito ?? "metagenesis",
      utilidad: p.utilidad, importancia: p.importancia, estado: p.estado, tarea: p.tarea, version: p.version ?? 1,
      referencias: p.referencias ?? [], esperaAlex: ESPERAN.includes(p.estado), decidible,
      acciones: decidible ? [...ACCIONES_DECIDIBLE] : ["ver-origen"],
    };
    if (p.agente) fila.agente = p.agente;
    return fila;
  }).sort((a, b) => Number(b.esperaAlex) - Number(a.esperaAlex) || Number(b.decidible) - Number(a.decidible)
    || PESO_IMPORTANCIA[b.importancia] - PESO_IMPORTANCIA[a.importancia] || b.utilidad - a.utilidad || a.id.localeCompare(b.id));
}

/** Cuerpo de POST /api/mando/imaginacion ya interpretado (§4). Las notas y referencias las valida el servidor. */
export type PeticionImaginacion =
  | { accion: "integrar"; id: string; por: QuienDecide }
  | { accion: "reimaginar"; id: string; notas: string; referencias: unknown; por: QuienDecide }
  | { accion: "rechazar"; id: string; motivo: string }
  | { accion: "posponer"; id: string; horas: number }
  | { accion: "lote"; ids: string[] | "pendientes"; hacer: HacerLote; notas: string; referencias: unknown; motivo: string; ambito: AmbitoPropuesta | "todos"; por: QuienDecide }
  | { accion: "ajustes"; ajustes: unknown };
const FALTA_REIMAGINAR = "Para reimaginar di qué cambiar (notas) o da al menos una referencia https:// válida.";
/** El motivo por el que no se puede reimaginar con estas notas y referencias, o null. */
export const vetoReimaginar = (notas: unknown, referencias: unknown): string | null =>
  cadena(notas, 2000) || normalizarReferencias(referencias).length ? null : FALTA_REIMAGINAR;

/** Interpreta el cuerpo del POST: la petición tipada o el error para un 400. «aprobar» = «integrar». */
export function interpretarPeticion(cuerpo: unknown): PeticionImaginacion | { error: string } {
  if (!esObj(cuerpo)) return { error: "Cuerpo JSON inválido." };
  const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
  const id = cadena(cuerpo.id, 120);
  const por: QuienDecide = cuerpo.por === "automatica" ? "automatica" : "alex";
  const notas = typeof cuerpo.notas === "string" ? cuerpo.notas : "";
  const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo : "";
  if (accion === "ajustes") return { accion, ajustes: cuerpo.ajustes };
  if (accion === "lote") {
    const hacer = cuerpo.hacer === "aprobar" ? "integrar" : cuerpo.hacer;
    if (hacer !== "integrar" && hacer !== "reimaginar" && hacer !== "rechazar") return { error: "En un lote se puede integrar, reimaginar o rechazar." };
    let ids: string[] | "pendientes";
    if (cuerpo.ids === "pendientes") ids = "pendientes";
    else if (Array.isArray(cuerpo.ids) && cuerpo.ids.every((x) => typeof x === "string")) {
      ids = [...new Set((cuerpo.ids as string[]).map((x) => x.trim()).filter(Boolean))];
      if (!ids.length) return { error: "El lote no trae ids." };
      if (ids.length > MAX_LOTE) return { error: `Como mucho ${MAX_LOTE} propuestas por lote.` };
    } else return { error: "«ids» es una lista de ids o «pendientes»." };
    const ambito = leerAmbito(cuerpo.ambito);
    if (ambito === null) return { error: "Ámbito desconocido: usa metagenesis, personal, grupo:<id> o pagina:<id>." };
    if (hacer === "reimaginar") {
      const veto = vetoReimaginar(notas, cuerpo.referencias);
      if (veto) return { error: veto };
    }
    return { accion, ids, hacer, notas, referencias: cuerpo.referencias, motivo, ambito, por };
  }
  if (!["integrar", "aprobar", "reimaginar", "rechazar", "posponer"].includes(accion)) {
    return { error: "Acción desconocida: usa integrar, reimaginar, rechazar, posponer, lote o ajustes." };
  }
  if (!id) return { error: "Falta el id de la propuesta." };
  if (accion === "integrar" || accion === "aprobar") return { accion: "integrar", id, por };
  if (accion === "rechazar") return { accion, id, motivo };
  if (accion === "posponer") {
    const horas = typeof cuerpo.horas === "number" ? cuerpo.horas : Number(cuerpo.horas);
    if (!Number.isFinite(horas) || horas < 1 || horas > 720) return { error: "Se pospone de 1 a 720 horas." };
    return { accion, id, horas };
  }
  const veto = vetoReimaginar(notas, cuerpo.referencias);
  return veto ? { error: veto } : { accion: "reimaginar", id, notas, referencias: cuerpo.referencias, por };
}
