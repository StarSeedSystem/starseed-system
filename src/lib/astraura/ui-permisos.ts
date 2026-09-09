import type { BackgroundScopeMode } from "../../context/appearance-context";
import type { AccionUi, TipoAccionUi } from "./ui-acciones";
import { esAccionDestructiva } from "./ui-acciones";

/**
 * Astraura · Permisos de UI sobre el perfil (Ola 304 · zU2)
 * ============================================================================
 * Capa de DECISIÓN que complementa la gramática de `ui-acciones.ts`: una vez
 * validada una propuesta, el OS decide QUIÉN puede tocar QUÉ de la interfaz
 * del perfil y en qué nivel. Es un módulo PURO: sin React, sin `node:*`,
 * SSR-safe, importable por componentes de cliente (ver CLAUDE.md §«Publicar»).
 *
 * EL REPARTO DE FÁBRICA (el porqué, en español, y es innegociable):
 * la interfaz es del usuario. Que Astraura pueda proponer cualquier cambio no
 * significa que deba aplicarlo a sus espaldas; por eso el reparto de fábrica
 * es «propone y tú decides» (`proponer` por defecto sobre los ámbitos
 * `perfil` y `pagina`), y el ámbito `cuenta` —el que afecta a todos sus
 * perfiles— NUNCA se concede solo. El usuario sube el nivel a `aplicar`
 * cuando quiera, por actor y por tipo, y puede revocarlo en cualquier momento.
 * Eso es el exocórtex de la Tríada (§3): leal al usuario, no al sistema.
 */

/** Cuánto confiamos en un actor para que cambie la interfaz por su cuenta. */
export type NivelUi = "nada" | "proponer" | "aplicar";

/** Un permiso de interfaz: qué puede hacer un actor, sobre qué ámbitos y qué tipos. */
export interface PermisoUi {
  /** Actor al que aplica; `"*"` concede a todos (comodín). */
  actor: string;
  /** Nivel máximo de confianza: `nada` bloquea, `proponer` solo sugiere,
   *  `aplicar` puede retocar por su cuenta (sujeto a las salvaguardas). */
  nivel: NivelUi;
  /** Tipos de acción que cubre; `"*"` cubre todos los del vocabulario. */
  tipos: Array<TipoAccionUi | "*">;
  /** Ámbitos sobre los que actúa; `"*"` cubre todos. `cuenta` NUNCA se
   *  aplica solo (ver comentario del archivo). */
  ambitos: Array<BackgroundScopeMode | "*">;
  /** Marca de tiempo (ms) hasta la que vale; si no existe, no caduca. */
  expiraEn?: number;
}

/** Nivel que recibe un actor por defecto cuando no hay permiso registrado. */
export const NIVEL_POR_DEFECTO: NivelUi = "proponer";

/** Ámbitos que solo se proponen por defecto (nunca `cuenta`). */
export const AMBITOS_POR_DEFECTO: BackgroundScopeMode[] = ["perfil", "pagina"];

/** Resultado de `decidirUi`: a qué nivel se resuelve y por qué. */
export interface Decision {
  /** true si la acción puede seguir (al menos como propuesta). */
  permitido: boolean;
  /** Nivel efectivo tras aplicar las salvaguardas (`aplicar` ≤ `proponer`). */
  nivel: NivelUi;
  /** Explicación en español para el diálogo de confirmación. */
  motivo: string;
}

/**
 * Busca el permiso que gobierna una acción: primero el del actor concreto y,
 * si no existe, el comodín `"*"`. Si el actor tiene varios permisos, se
 * prioriza el que más se ajusta (actor === acción.actor antes que el comodín);
 * entre dos del mismo actor, el primero encontrado manda.
 */
function permisoPara(
  permisos: PermisoUi[],
  actor: string,
  tipo: TipoAccionUi,
  ambito: BackgroundScopeMode,
  ahora: number,
): PermisoUi | null {
  const lista = (a: ReadonlyArray<string>, v: string) =>
    a.includes("*") || a.includes(v);

  const candidatos = permisos.filter((p) => {
    if (p.actor !== actor) return false;
    if (p.expiraEn !== undefined && (p.expiraEn ?? 0) <= ahora) return false;
    return true;
  });
  for (const p of candidatos) {
    if (lista(p.tipos, tipo) && lista(p.ambitos, ambito)) return p;
  }
  for (const p of permisos) {
    if (p.actor !== "*") continue;
    if (p.expiraEn !== undefined && (p.expiraEn ?? 0) <= ahora) continue;
    if (lista(p.tipos, tipo) && lista(p.ambitos, ambito)) return p;
  }
  return null;
}

function nombreActor(actor: string): string {
  if (actor === "*" || actor === "usuario") return actor === "usuario" ? "El usuario" : "Cualquier actor";
  const indice = actor.indexOf(":");
  const nombre = indice >= 0 ? actor.slice(indice + 1) : actor;
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/**
 * Resuelve a qué nivel puede actuar un actor sobre una acción de interfaz.
 * Sin permiso (o fuera de tipos/ámbitos cubiertos) → `NIVEL_POR_DEFECTO`
 * (`proponer`). Un permiso con nivel `nada` bloquea. Con `aplicar`: la
 * salvaguarda del exocórtex lo baja a `proponer` si la acción es destructiva
 * o si pisa el ámbito `cuenta` — el usuario siempre decide al final.
 */
export function decidirUi(
  permisos: PermisoUi[],
  accion: AccionUi,
  ahora: number,
): Decision {
  const permiso = permisoPara(permisos, accion.actor, accion.tipo, accion.ambito, ahora);
  const quién = nombreActor(accion.actor);

  if (!permiso) {
    return {
      permitido: true,
      nivel: NIVEL_POR_DEFECTO,
      motivo: `${quién} puede proponer, no aplicar: enciéndelo en el perfil si quieres que lo haga sola.`,
    };
  }

  if (permiso.nivel === "nada") {
    return {
      permitido: false,
      nivel: "nada",
      motivo: `${quién} no tiene permiso para tocar esto en tu interfaz.`,
    };
  }

  if (accion.ambito === "cuenta" && permiso.nivel === "aplicar") {
    return {
      permitido: true,
      nivel: "proponer",
      motivo: `El ámbito «cuenta» afecta a todos tus perfiles y nunca se aplica solo: ${quién} lo propone y tú decides.`,
    };
  }

  if (permiso.nivel === "aplicar" && esAccionDestructiva(accion)) {
    return {
      permitido: true,
      nivel: "proponer",
      motivo: `Es un cambio destructivo: ${quién} puede proponerlo, pero la decisión final es tuya.`,
    };
  }

  return {
    permitido: true,
    nivel: permiso.nivel,
    motivo:
      permiso.nivel === "aplicar"
        ? `${quién} puede aplicarlo porque lo activaste en el perfil.`
        : `${quién} lo propone; confírmalo tú para aplicarlo.`,
  };
}

/** Clave de almacenamiento local (versión incluida, por compatibilidad). */
export const CLAVE_PERMISOS_UI = "starseed.astraura.ui-permisos.v1";

const NIVELES_VALIDOS = new Set<NivelUi>(["nada", "proponer", "aplicar"]);

/** Sanitiza lo cargado del almacenamiento: descarta basura, nunca lanza. */
function sanitizar(bruto: unknown): PermisoUi[] {
  if (!Array.isArray(bruto)) return [];
  const salida: PermisoUi[] = [];
  for (const item of bruto) {
    if (typeof item !== "object" || item === null) continue;
    const p = item as PermisoUi;
    if (typeof p.actor !== "string" || p.actor.length === 0) continue;
    if (!NIVELES_VALIDOS.has(p.nivel as NivelUi)) continue;
    if (!Array.isArray(p.tipos) || !Array.isArray(p.ambitos)) continue;
    if (p.expiraEn !== undefined && typeof p.expiraEn !== "number") continue;
    salida.push({
      actor: p.actor,
      nivel: p.nivel,
      tipos: p.tipos,
      ambitos: p.ambitos,
      ...(p.expiraEn !== undefined ? { expiraEn: p.expiraEn } : {}),
    });
  }
  return salida;
}

/** Lee los permisos guardados. SSR-safe; en modo privado devuelve `[]`. */
export function leerPermisos(): PermisoUi[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE_PERMISOS_UI);
    return crudo === null ? [] : sanitizar(JSON.parse(crudo));
  } catch {
    return [];
  }
}

/** Guarda los permisos. best-effort: nunca lanza (modo privado / lleno). */
export function guardarPermisos(permisos: PermisoUi[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_PERMISOS_UI, JSON.stringify(sanitizar(permisos)));
  } catch {
    /* noop: guardado optativo, nunca rompe la llamada */
  }
}