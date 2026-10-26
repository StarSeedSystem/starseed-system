/**
 * Reglas de la Protomolécula de cada grupo, comunidad o página (Ola 1026P · P2). Módulo PURO: sin React, sin red,
 * sin «use client» y sin `node:*` (lo importan componentes de cliente que cuelgan de la orbe).
 *
 * Una entidad decide con sus reglas QUIÉN puede abrir su Protomolécula, QUIÉN puede cambiar qué y CÓMO:
 *   · directo     → lo aplica quien tenga rol suficiente (y cualquier otra persona miembro puede llevarlo a votación:
 *                   la vía democrática nunca se cierra);
 *   · propuesta   → cualquiera propone y decide quien gestiona;
 *   · votación    → democrático, con el umbral y el quórum del gobierno de la entidad.
 *
 * Lo que NO se puede configurar (invariantes, se imponen al leer y al decidir; ver `architecture/protomolecula-gobierno.md`):
 *   1. Transparencia: no hay ningún campo para apagarla; todo permiso directo queda anotado y visible.
 *   2. Una IA o un agente nunca aprueba solo: toda acción suya pide confirmación de una persona.
 *   3. Un permiso directo jamás cubre «reglas» ni «permisos»: quien cambia las reglas no se las concede a sí misma
 *      ni a otras personas saltándose la regla que las gobierna.
 *   4. «reglas» y «permisos» solo admiten directo o votación (una «propuesta que decide quien gestiona» no tiene
 *      cómo aplicarse a la configuración sin pasar por el voto del motor de gobernanza).
 *   5. Las personas con rol de observación miran, no cambian (salvo permiso nombrado a su persona).
 */
import { TIPOS_CAMBIO_PROTO, type EntidadProto, type TipoCambioProto } from "../peticion/contrato";
import type { GovernanceMode } from "@/lib/governance/types";

/* ── Vocabulario ─────────────────────────────────────────────────────────── */

export type TipoEntidadGobernada = "grupo" | "comunidad" | "pagina";
export const TIPOS_ENTIDAD_GOBERNADA: readonly TipoEntidadGobernada[] = ["grupo", "comunidad", "pagina"];

export type VisibilidadProto = "privada" | "miembros" | "publica";
export const VISIBILIDADES: readonly VisibilidadProto[] = ["privada", "miembros", "publica"];

export type ModoCambio = "directo" | "propuesta" | "votacion";
export const MODOS_CAMBIO: readonly ModoCambio[] = ["directo", "propuesta", "votacion"];

/** Quién puede abrir o usar: de más abierto a más reservado. */
export type NivelAcceso = "cualquiera" | "miembros" | "colaboracion" | "gestion" | "dueno";
export const NIVELES_ACCESO: readonly NivelAcceso[] = ["cualquiera", "miembros", "colaboracion", "gestion", "dueno"];

export const valorNivel = (n: NivelAcceso): number => NIVELES_ACCESO.indexOf(n);

/** Tipos de cambio que un permiso directo puede cubrir. «reglas» y «permisos» nunca (invariante 3). */
export const TIPOS_DELEGABLES: readonly TipoCambioProto[] = ["contenido", "diseno", "funciones", "creacion"];

/** Tipos que solo admiten directo o votación (invariante 4). */
export const TIPOS_SIN_PROPUESTA: readonly TipoCambioProto[] = ["reglas", "permisos"];

/** Clave en la configuración de gobernanza de la entidad (`governance_configs.params.config`). */
export const CLAVE_REGLAS = "protomolecula.reglas";

export const VERSION_REGLAS = 1;
export const MAX_PERMISOS = 50;
const MAX_TEXTO = 240;
const MAX_ID = 80;

/** Desde qué rol aplica un permiso por rol (de ahí hacia arriba). El observador nunca entra por rol. */
export type RolMinimoPermiso = "miembros" | "colaboracion" | "gestion";
export const ROLES_MINIMOS_PERMISO: readonly RolMinimoPermiso[] = ["miembros", "colaboracion", "gestion"];

export type SujetoPermiso =
  | { tipo: "rol"; desde: RolMinimoPermiso }
  | { tipo: "persona"; usuarioId: string; nombre?: string };

export interface PermisoDirecto {
  id: string;
  sujeto: SujetoPermiso;
  /** Para qué tipos de cambio se salta la propuesta o la votación (solo los delegables). */
  tipos: TipoCambioProto[];
  concedidoPor: string | null;
  concedidoEn: number;
  /** ms desde época; sin él no caduca. */
  caduca?: number;
  motivo?: string;
}

export interface ReglasProtomolecula {
  version: typeof VERSION_REGLAS;
  visibilidad: VisibilidadProto;
  cambios: Record<TipoCambioProto, ModoCambio>;
  permisosDirectos: PermisoDirecto[];
  acceso: { abrir: NivelAcceso; usar: NivelAcceso };
  actualizadoEn?: number;
  actualizadoPor?: string | null;
}

/* ── Qué entidad es ──────────────────────────────────────────────────────── */

const KIND_A_TIPO: Record<string, TipoEntidadGobernada> = {
  grupo: "grupo", group: "grupo",
  comunidad: "comunidad", community: "comunidad", ef: "comunidad", entidad: "comunidad", asamblea: "comunidad", partido: "comunidad",
  pagina: "pagina", page: "pagina",
};

/** El `kind` de las pantallas de entidad (comunidad, ef, partido, grupo, page…) → tipo gobernado. Igual que `decisionScopeFor`. */
export function tipoEntidadDeKind(kind: string | null | undefined): TipoEntidadGobernada {
  return KIND_A_TIPO[String(kind ?? "").toLowerCase()] ?? "comunidad";
}

export function esEntidadGobernada(e: EntidadProto | null | undefined): e is EntidadProto & { tipo: TipoEntidadGobernada } {
  return !!e && (TIPOS_ENTIDAD_GOBERNADA as readonly string[]).includes(e.tipo) && typeof e.id === "string" && e.id.length > 0;
}

/** Ámbito del motor de gobernanza (`governance_configs.scope`, `proposals.scope`). */
export function scopeDeEntidad(tipo: TipoEntidadGobernada): "group" | "community" | "page" {
  return tipo === "grupo" ? "group" : tipo === "pagina" ? "page" : "community";
}

export const ARTICULO_ENTIDAD: Record<TipoEntidadGobernada, string> = { grupo: "del grupo", comunidad: "de la comunidad", pagina: "de la página" };

/* ── Etiquetas en lenguaje claro ─────────────────────────────────────────── */

export const ETIQUETA_TIPO: Record<TipoCambioProto, string> = {
  contenido: "Contenido",
  diseno: "Diseño",
  funciones: "Funciones",
  permisos: "Permisos",
  reglas: "Reglas",
  creacion: "Creación",
};

export const AYUDA_TIPO: Record<TipoCambioProto, string> = {
  contenido: "Editar lo que ya hay: textos, imágenes, bloques.",
  diseno: "Cómo se ve: colores, fondos, composición.",
  funciones: "Qué hace: herramientas, vínculos y mandos.",
  permisos: "Quién puede qué: permisos directos y roles.",
  reglas: "Estas mismas reglas: visibilidad, modos y acceso.",
  creacion: "Añadir algo nuevo: un objeto, una imagen, una molécula.",
};

export const ETIQUETA_MODO: Record<ModoCambio, string> = { directo: "Directo", propuesta: "Propuesta", votacion: "Votación" };
export const AYUDA_MODO: Record<ModoCambio, string> = {
  directo: "Lo aplica quien tenga rol suficiente; el resto puede llevarlo a votación.",
  propuesta: "Cualquiera propone y decide quien gestiona.",
  votacion: "Se decide en democracia, con el umbral y el quórum de la entidad.",
};

export const ETIQUETA_VISIBILIDAD: Record<VisibilidadProto, string> = { privada: "Privada", miembros: "Solo miembros", publica: "Pública" };
export const AYUDA_VISIBILIDAD: Record<VisibilidadProto, string> = {
  privada: "Solo quien gestiona la ve y la abre.",
  miembros: "Las personas que forman parte pueden abrirla.",
  publica: "Cualquiera puede mirarla (sin cambiar nada).",
};

export const ETIQUETA_NIVEL: Record<NivelAcceso, string> = {
  cualquiera: "Cualquiera",
  miembros: "Miembros",
  colaboracion: "Colaboración o más",
  gestion: "Gestión o más",
  dueno: "Solo la cuenta dueña",
};

export const ETIQUETA_ROL_MINIMO: Record<RolMinimoPermiso, string> = { miembros: "Miembros", colaboracion: "Colaboración o más", gestion: "Gestión o más" };

/* ── Valores por defecto ─────────────────────────────────────────────────── */

/** Nivel de acceso que fija cada visibilidad como techo de «abrir». */
export const NIVEL_DE_VISIBILIDAD: Record<VisibilidadProto, NivelAcceso> = { privada: "gestion", miembros: "miembros", publica: "cualquiera" };

/**
 * Valores por defecto, derivados de las preferencias del OS (democrático primero) y del modo de gobierno de la entidad:
 *   · democrático (lo normal, y lo que se asume sin configuración): votación para reglas y permisos, propuesta para
 *     diseño, funciones y creación, directo para el contenido de quien tiene rol;
 *   · jerárquico (solo si la entidad lo eligió de forma explícita): decide directamente quien gestiona.
 * Todo es privado de partida: solo las personas miembro abren la Protomolécula de la entidad.
 */
export function reglasPorDefecto(_tipo: TipoEntidadGobernada = "grupo", modo: GovernanceMode = "democratic"): ReglasProtomolecula {
  const jerarquico = modo === "hierarchical";
  const cambios: Record<TipoCambioProto, ModoCambio> = jerarquico
    ? { contenido: "directo", diseno: "directo", funciones: "directo", permisos: "directo", reglas: "directo", creacion: "directo" }
    : { contenido: "directo", diseno: "propuesta", funciones: "propuesta", permisos: "votacion", reglas: "votacion", creacion: "propuesta" };
  return { version: VERSION_REGLAS, visibilidad: "miembros", cambios, permisosDirectos: [], acceso: { abrir: "miembros", usar: "miembros" } };
}

/* ── Saneado (todo lo que viene de fuera se trata con desconfianza) ──────── */

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const texto = (x: unknown, max: number): string | undefined => {
  if (typeof x !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const t = x.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
  return t.length ? t : undefined;
};
const numero = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : undefined);
const en = <T extends string>(x: unknown, lista: readonly T[]): T | undefined => (typeof x === "string" && (lista as readonly string[]).includes(x) ? (x as T) : undefined);

/** Aplica las invariantes de modo: «reglas» y «permisos» no admiten «propuesta». */
function modoValido(tipo: TipoCambioProto, modo: ModoCambio | undefined, defecto: ModoCambio): ModoCambio {
  if (!modo) return defecto;
  if (modo === "propuesta" && (TIPOS_SIN_PROPUESTA as readonly string[]).includes(tipo)) return "votacion";
  return modo;
}

/** El acceso nunca es más abierto que la visibilidad, y «usar» nunca más abierto que «abrir». */
export function acotarAcceso(visibilidad: VisibilidadProto, acceso: { abrir: NivelAcceso; usar: NivelAcceso }): { abrir: NivelAcceso; usar: NivelAcceso } {
  const techo = valorNivel(NIVEL_DE_VISIBILIDAD[visibilidad]);
  const abrir = NIVELES_ACCESO[Math.max(valorNivel(acceso.abrir), techo)];
  const usar = NIVELES_ACCESO[Math.max(valorNivel(acceso.usar), valorNivel(abrir))];
  return { abrir, usar };
}

function sanearPermiso(x: unknown): PermisoDirecto | null {
  if (!esObjeto(x)) return null;
  const id = texto(x.id, MAX_ID);
  if (!id) return null;
  const s = x.sujeto;
  if (!esObjeto(s)) return null;
  let sujeto: SujetoPermiso | null = null;
  if (s.tipo === "rol") {
    const desde = en(s.desde, ROLES_MINIMOS_PERMISO);
    if (desde) sujeto = { tipo: "rol", desde };
  } else if (s.tipo === "persona") {
    const usuarioId = texto(s.usuarioId, MAX_ID);
    if (usuarioId) sujeto = { tipo: "persona", usuarioId, ...(texto(s.nombre, 80) ? { nombre: texto(s.nombre, 80) as string } : {}) };
  }
  if (!sujeto) return null;
  const tipos = Array.isArray(x.tipos)
    ? (Array.from(new Set(x.tipos.filter((t): t is TipoCambioProto => (TIPOS_DELEGABLES as readonly unknown[]).includes(t)))) as TipoCambioProto[])
    : [];
  if (tipos.length === 0) return null;
  const caduca = numero(x.caduca);
  const motivo = texto(x.motivo, MAX_TEXTO);
  return {
    id,
    sujeto,
    tipos,
    concedidoPor: texto(x.concedidoPor, MAX_ID) ?? null,
    concedidoEn: numero(x.concedidoEn) ?? 0,
    ...(caduca !== undefined ? { caduca } : {}),
    ...(motivo ? { motivo } : {}),
  };
}

/**
 * Lee unas reglas de lo que haya guardado (texto JSON u objeto) sobre unas de base. Nunca lanza: lo que no vale se
 * descarta y se queda lo de base. Impone las invariantes aunque el JSON venga de una propuesta aprobada o manipulada.
 */
export function normalizarReglas(crudo: unknown, base: ReglasProtomolecula = reglasPorDefecto()): ReglasProtomolecula {
  let x: unknown = crudo;
  if (typeof x === "string") {
    try { x = JSON.parse(x); } catch { return base; }
  }
  if (!esObjeto(x)) return base;
  const visibilidad = en(x.visibilidad, VISIBILIDADES) ?? base.visibilidad;
  const cambiosCrudos = esObjeto(x.cambios) ? x.cambios : {};
  const cambios = {} as Record<TipoCambioProto, ModoCambio>;
  for (const t of TIPOS_CAMBIO_PROTO) cambios[t] = modoValido(t, en(cambiosCrudos[t], MODOS_CAMBIO), modoValido(t, base.cambios[t], "votacion"));
  const permisos: PermisoDirecto[] = [];
  const vistos = new Set<string>();
  for (const p of Array.isArray(x.permisosDirectos) ? x.permisosDirectos : []) {
    const s = sanearPermiso(p);
    if (!s || vistos.has(s.id)) continue;
    vistos.add(s.id);
    permisos.push(s);
    if (permisos.length >= MAX_PERMISOS) break;
  }
  const a = esObjeto(x.acceso) ? x.acceso : {};
  const acceso = acotarAcceso(visibilidad, {
    abrir: en(a.abrir, NIVELES_ACCESO) ?? base.acceso.abrir,
    usar: en(a.usar, NIVELES_ACCESO) ?? base.acceso.usar,
  });
  const en_ = numero(x.actualizadoEn);
  return {
    version: VERSION_REGLAS,
    visibilidad,
    cambios,
    permisosDirectos: permisos,
    acceso,
    ...(en_ !== undefined ? { actualizadoEn: en_ } : {}),
    ...(x.actualizadoPor === null || typeof x.actualizadoPor === "string" ? { actualizadoPor: texto(x.actualizadoPor, MAX_ID) ?? null } : {}),
  };
}

/** Texto JSON estable (lo que viaja en la configuración de la entidad y en el borrador de propuesta). */
export function serializarReglas(r: ReglasProtomolecula): string {
  return JSON.stringify(normalizarReglas(r, r));
}

/* ── Permisos directos ───────────────────────────────────────────────────── */

export const MS_DIA = 24 * 60 * 60 * 1000;

export function permisoVigente(p: PermisoDirecto, ahora: number): boolean {
  return p.caduca === undefined || p.caduca > ahora;
}

function nuevoId(ahora: number): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return `pd-${c.randomUUID()}`;
  } catch { /* sin crypto */ }
  return `pd-${ahora.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface DatosPermiso {
  sujeto: SujetoPermiso;
  tipos: TipoCambioProto[];
  concedidoPor: string | null;
  motivo?: string;
  /** Días de vigencia; sin él, no caduca. */
  dias?: number;
}

/** Crea un permiso directo. Devuelve `null` si no cubre ningún tipo delegable o el sujeto no vale. */
export function crearPermiso(datos: DatosPermiso, ahora: number = Date.now()): PermisoDirecto | null {
  return sanearPermiso({
    id: nuevoId(ahora),
    sujeto: datos.sujeto,
    tipos: datos.tipos,
    concedidoPor: datos.concedidoPor,
    concedidoEn: ahora,
    ...(datos.dias && datos.dias > 0 ? { caduca: ahora + Math.floor(datos.dias) * MS_DIA } : {}),
    motivo: datos.motivo,
  });
}

export function conPermiso(r: ReglasProtomolecula, p: PermisoDirecto): ReglasProtomolecula {
  return normalizarReglas({ ...r, permisosDirectos: [...r.permisosDirectos.filter((x) => x.id !== p.id), p] }, r);
}

export function sinPermiso(r: ReglasProtomolecula, id: string): ReglasProtomolecula {
  return { ...r, permisosDirectos: r.permisosDirectos.filter((p) => p.id !== id) };
}

/* ── Qué cambió entre dos reglas (para saber qué regla de gobierno aplica) ── */

/**
 * Tipos de cambio que toca pasar de unas reglas a otras: visibilidad, modos y acceso son «reglas»; los permisos
 * directos son «permisos». Cada uno sigue SU regla (por defecto, votación).
 */
export function tiposTocados(antes: ReglasProtomolecula, despues: ReglasProtomolecula): TipoCambioProto[] {
  const j = JSON.stringify;
  const r = j({ v: antes.visibilidad, c: antes.cambios, a: antes.acceso }) !== j({ v: despues.visibilidad, c: despues.cambios, a: despues.acceso });
  const p = j(antes.permisosDirectos) !== j(despues.permisosDirectos);
  return [...(r ? (["reglas"] as const) : []), ...(p ? (["permisos"] as const) : [])];
}

/* ── Descripción en palabras (para el resumen de una propuesta y para el aviso de «qué vas a cambiar») ── */

export function etiquetaSujeto(s: SujetoPermiso): string {
  return s.tipo === "persona" ? (s.nombre || `la cuenta ${s.usuarioId.slice(0, 8)}`) : `rol «${ETIQUETA_ROL_MINIMO[s.desde]}»`;
}

/** Lo que cambia entre dos reglas, una línea por cambio y en lenguaje claro. */
export function describirCambios(antes: ReglasProtomolecula, despues: ReglasProtomolecula): string[] {
  const out: string[] = [];
  if (antes.visibilidad !== despues.visibilidad) out.push(`Visibilidad: ${ETIQUETA_VISIBILIDAD[antes.visibilidad]} → ${ETIQUETA_VISIBILIDAD[despues.visibilidad]}.`);
  if (antes.acceso.abrir !== despues.acceso.abrir) out.push(`Quién la abre: ${ETIQUETA_NIVEL[antes.acceso.abrir]} → ${ETIQUETA_NIVEL[despues.acceso.abrir]}.`);
  if (antes.acceso.usar !== despues.acceso.usar) out.push(`Quién la usa: ${ETIQUETA_NIVEL[antes.acceso.usar]} → ${ETIQUETA_NIVEL[despues.acceso.usar]}.`);
  for (const t of TIPOS_CAMBIO_PROTO) {
    if (antes.cambios[t] !== despues.cambios[t]) out.push(`${ETIQUETA_TIPO[t]}: ${ETIQUETA_MODO[antes.cambios[t]].toLowerCase()} → ${ETIQUETA_MODO[despues.cambios[t]].toLowerCase()}.`);
  }
  const idsAntes = new Map(antes.permisosDirectos.map((p) => [p.id, p]));
  const idsDespues = new Map(despues.permisosDirectos.map((p) => [p.id, p]));
  for (const p of despues.permisosDirectos) {
    const previo = idsAntes.get(p.id);
    if (!previo) out.push(`Permiso directo nuevo para ${etiquetaSujeto(p.sujeto)}: ${p.tipos.map((t) => ETIQUETA_TIPO[t].toLowerCase()).join(", ")}${p.caduca ? ` (hasta el ${new Date(p.caduca).toLocaleDateString("es-ES")})` : ""}.`);
    else if (JSON.stringify(previo) !== JSON.stringify(p)) out.push(`Permiso directo cambiado para ${etiquetaSujeto(p.sujeto)}.`);
  }
  for (const p of antes.permisosDirectos) if (!idsDespues.has(p.id)) out.push(`Permiso directo retirado a ${etiquetaSujeto(p.sujeto)}.`);
  return out;
}
