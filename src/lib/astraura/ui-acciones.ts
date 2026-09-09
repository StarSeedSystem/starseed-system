import type {
  AppearanceConfig,
  BackgroundScopeMode,
  DeepPartial,
} from "../../context/appearance-context";
import type { CustomFont } from "../../context/appearance-context";

/**
 * Astraura · Gramática de acciones de UI (Ola 304 · zU1)
 * ============================================================================
 * Vocabulario CERRADO con el que la IA (agentes, personalidades, procesos
 * imaginativos…) pide cambios de interfaz. Es la frontera de DESCONFIANZA:
 * un modelo puede alucinar cualquier parche; solo entra lo que esté en
 * `CAMPOS_PERMITIDOS` y solo en forma de `AccionUi` validada.
 *
 * Módulo PURO: sin React, sin `node:*`, SSR-safe. Lo importan componentes de
 * cliente para el diálogo de confirmación (ver CLAUDE.md §«Publicar»).
 *
 * La IA es el exocórtex del usuario (Tríada §3): todo cambio se explica con
 * `motivo`, nunca se aplica nada mudo, y el usuario confirma antes.
 */

/** Qué faja de la interfaz puede tocar cada tipo de acción. */
export type TipoAccionUi =
  | "apariencia"
  | "fondo"
  | "tipografia"
  | "distribucion"
  | "preset"
  | "movimiento"
  | "restaurar";

/** Quién pide el cambio. `usuario` = petición humana directa. */
export type ActorAccion = string;

/** Un cambio de interfaz propuesto por Astraura. */
export interface AccionUi {
  tipo: TipoAccionUi;
  ambito: BackgroundScopeMode;
  ambitoId?: string;
  parche: DeepPartial<AppearanceConfig>;
  motivo: string;
  actor: string;
}

/** Prefijos de ruta de `AppearanceConfig` que cada tipo puede tocar. */
export const CAMPOS_PERMITIDOS: Record<TipoAccionUi, ReadonlyArray<string>> = {
  apariencia: ["styling.*"],
  fondo: [
    "background.type",
    "background.value",
    "background.blur",
    "background.animation",
    "background.overlayOpacity",
    "background.overlayColor",
    "background.intensity",
    "background.living.*",
    "background.filter.*",
    "background.environment.*",
  ],
  tipografia: ["typography.fontFamily", "typography.scale", "typography.customFonts"],
  distribucion: ["layout.*"],
  preset: ["styling.crystalPreset"],
  movimiento: ["background.animation", "background.living.*", "animations.*"],
  restaurar: [],
};

/* ── Recorte del parche a las rutas permitidas ────────────────────────── */

function registrarRutas(rutas: ReadonlyArray<string>): {
  exactas: Set<string>;
  prefijos: Set<string>;
} {
  const exactas = new Set<string>();
  const prefijos = new Set<string>();
  for (const r of rutas) {
    if (r.endsWith(".*")) prefijos.add(r.slice(0, -2));
    else exactas.add(r);
  }
  return { exactas, prefijos };
}

function esRutaPermitida(ruta: string, exactas: Set<string>, prefijos: Set<string>): boolean {
  if (exactas.has(ruta)) return true;
  for (const p of prefijos) {
    if (ruta === p || ruta.startsWith(p + ".")) return true;
  }
  return false;
}

function puedeDescender(ruta: string, exactas: Set<string>, prefijos: Set<string>): boolean {
  if (exactas.has(ruta)) return true;
  // Una rama intermedia («typography») no aparece como tal en la lista: solo
  // aparecen sus hojas («typography.scale»). Hay que poder bajar por ella o
  // los tipos sin comodín `.*` se quedarían sin NINGUNA ruta viva.
  for (const e of exactas) {
    if (e.startsWith(ruta + ".")) return true;
  }
  for (const p of prefijos) {
    if (p === ruta || p.startsWith(ruta + ".")) return true;
  }
  return false;
}

/**
 * Devuelve una copia de `parche` borrando cualquier ruta que no esté en la
 * lista permitida. Hojas (escalares y arrays) solo se conservan si su ruta
 * exacta está permitida; a los objetos se desciende si pueden llevar a algo
 * permitido. `undefined` si no queda nada válido.
 */
function recortarParche(
  parche: Record<string, unknown>,
  exactas: Set<string>,
  prefijos: Set<string>,
): Record<string, unknown> | undefined {
  const itinerar = (valor: unknown, base: string): unknown => {
    if (valor === null || typeof valor !== "object" || Array.isArray(valor)) {
      return esRutaPermitida(base, exactas, prefijos) ? valor : undefined;
    }
    const obj = valor as Record<string, unknown>;
    const salida: Record<string, unknown> = {};
    for (const clave of Object.keys(obj)) {
      const ruta = base ? `${base}.${clave}` : clave;
      if (!puedeDescender(ruta, exactas, prefijos)) continue;
      const resultado = itinerar(obj[clave], ruta);
      if (resultado !== undefined) salida[clave] = resultado;
    }
    return Object.keys(salida).length > 0 ? salida : undefined;
  };
  return (itinerar(parche, "") as Record<string, unknown> | undefined) ?? undefined;
}

/** Formato de `actor`: `agente:<id>` · `personalidad:<id>` · `proceso:<id>` · `usuario`. */
const ACTOR_RE = /^(agente|personalidad|proceso):[A-Za-z0-9_.-]+$|^usuario$/;

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

const TIPOS_VALIDOS = new Set<string>(Object.keys(CAMPOS_PERMITIDOS) as TipoAccionUi[]);
const AMBITOS_VALIDOS = new Set<BackgroundScopeMode>(["cuenta", "perfil", "pagina"]);

/**
 * Valida con desconfianza una propuesta de cambio de interfaz. Nunca lanza:
 * cualquier duda (tipo raro, motivo vacío, actor inválido, ruta prohibida)
 * devuelve `null`. El parche devuelto ya viene recortado a `CAMPOS_PERMITIDOS`.
 */
export function validarAccionUi(bruto: unknown): AccionUi | null {
  if (!esObjetoPlano(bruto)) return null;

  const { tipo, ambito, ambitoId, parche, motivo, actor } = bruto;
  if (typeof tipo !== "string" || !TIPOS_VALIDOS.has(tipo)) return null;
  if (typeof ambito !== "string" || !AMBITOS_VALIDOS.has(ambito as BackgroundScopeMode)) return null;

  if (ambitoId !== undefined && typeof ambitoId !== "string") return null;
  if (ambito === "cuenta" && ambitoId !== undefined) return null;

  if (!esObjetoPlano(parche)) return null;

  if (typeof motivo !== "string") return null;
  const motivoLimpio = motivo.trim();
  if (motivoLimpio.length === 0 || motivoLimpio.length > 240) return null;

  if (typeof actor !== "string" || !ACTOR_RE.test(actor.trim())) return null;

  const { exactas, prefijos } = registrarRutas(CAMPOS_PERMITIDOS[tipo as TipoAccionUi]);
  const recortado = recortarParche(parche, exactas, prefijos);

  return {
    tipo: tipo as TipoAccionUi,
    ambito: ambito as BackgroundScopeMode,
    ambitoId: ambitoId as string | undefined,
    parche: (recortado ?? {}) as DeepPartial<AppearanceConfig>,
    motivo: motivoLimpio,
    actor: actor.trim(),
  };
}

const VERBOS: Record<TipoAccionUi, string> = {
  apariencia: "cambiar la apariencia",
  fondo: "cambiar el fondo",
  tipografia: "ajustar la tipografía",
  distribucion: "cambiar la distribución",
  preset: "aplicar el preset visual",
  movimiento: "ajustar el movimiento",
  restaurar: "restaurar los valores",
};

const AMBITO_FRASE: Record<BackgroundScopeMode, string> = {
  cuenta: "de tu cuenta",
  perfil: "de tu perfil",
  pagina: "de esta página",
};

function nombreActor(actor: string): string {
  if (actor === "usuario") return "El usuario";
  const indice = actor.indexOf(":");
  const nombre = indice >= 0 ? actor.slice(indice + 1) : actor;
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/**
 * Encaja el `motivo` en la frase sin tartamudear: muchos motivos ya vienen
 * redactados con su propio «porque…», así que solo se antepone la conjunción
 * cuando falta.
 */
function fraseMotivo(motivo: string): string {
  const limpio = motivo.trim();
  return /^porque\s/i.test(limpio) ? limpio : `porque ${limpio}`;
}

/** Frase humana para el diálogo de confirmación, p. ej.:
 *  «Aurora quiere cambiar el fondo de tu perfil — porque estás leyendo de noche». */
export function describirAccion(a: AccionUi): string {
  return `${nombreActor(a.actor)} quiere ${VERBOS[a.tipo]} ${AMBITO_FRASE[a.ambito]} — ${fraseMotivo(a.motivo)}`;
}

/**
 * Riesgo alto de la acción. true si borra fuentes personalizadas, vacía las
 * capas del fondo o actúa sobre el ámbito `cuenta` (afecta a TODOS los perfiles).
 */
export function esAccionDestructiva(a: AccionUi): boolean {
  if (a.ambito === "cuenta") return true;

  const fonts = (a.parche as AppearanceConfig | undefined)?.typography?.customFonts;
  if (Array.isArray(fonts)) {
    if (fonts.length === 0) return true;
    const sinNombre = fonts.some((f) => f && !((f as CustomFont)?.name));
    if (sinNombre) return true;
  }

  const layers = (a.parche as AppearanceConfig | undefined)?.background?.layers;
  if (Array.isArray(layers) && layers.length === 0) return true;

  return false;
}