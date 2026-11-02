/**
 * chat-herramientas — lógica PURA del picker «Conectores y habilidades» de la
 * bandeja «Personalidades activas» (`src/components/agent/chat-personality-tray.tsx`).
 *
 * Decide qué habilidades (`SKILL_CAPABILITIES`, `src/ai/astraura/skills.ts`) y
 * qué conectores (`OSS_SERVICES`, `src/lib/services/oss-services.ts`) están
 * activos para ESTE chat, reutilizando el MISMO campo de `ChatConfig`
 * (`.skills` / `.connections`) que ya lee `src/ai/astraura/router.ts` y ya
 * edita `src/components/aurora/chat-config-menu.tsx` — así el picker tiene
 * efecto REAL sobre lo que usa Aurora, no es decoración.
 *
 * Convención de selección (la misma que ya usa `ChatConfig`): un array
 * EXPLÍCITO son las únicas herramientas permitidas para el chat; `undefined`
 * es «Todas, sin restricción» — el valor por defecto de una cuenta/chat
 * nuevos («deben venir todas instaladas y usadas por defecto»). Un array
 * explícito que vuelve a cubrir el catálogo entero se colapsa otra vez a
 * `undefined`, así las habilidades/conectores que se añadan más adelante al
 * catálogo entran activos solos — mismo patrón que `DeployTarget`/
 * `toggleSkill`/`toggleRepo` (sentinela "todas"/"todos") en
 * `src/lib/aurora/setup-config.ts`.
 *
 * Sin red, sin DOM, sin localStorage: todo puro y testeable (vitest).
 */

import type { SkillCapability } from "@/ai/astraura/skills";

/** `undefined` = «Todas» (sin restricción); array = exactamente esos ids. */
export type SeleccionHerramientas = string[] | undefined;

/** ¿Está `id` activo en esta selección? (sin restricción ⇒ activo). */
export function herramientaActiva(seleccion: SeleccionHerramientas, id: string): boolean {
  return seleccion === undefined ? true : seleccion.includes(id);
}

/** ¿Cubre la selección TODO `todosIds`? («Todas» sin restricción ⇒ sí, por definición). */
export function todasHerramientasActivas(seleccion: SeleccionHerramientas, todosIds: string[]): boolean {
  if (seleccion === undefined) return true;
  if (!todosIds.length) return false;
  const activos = new Set(seleccion);
  return todosIds.every((id) => activos.has(id));
}

/** Cuántos de `todosIds` están activos en esta selección. */
export function contarHerramientasActivas(seleccion: SeleccionHerramientas, todosIds: string[]): number {
  if (seleccion === undefined) return todosIds.length;
  const activos = new Set(seleccion);
  return todosIds.filter((id) => activos.has(id)).length;
}

/**
 * Alterna un id. Si la selección era «Todas» (sin restricción), parte del
 * catálogo COMPLETO (así solo ese id queda excluido). Si el resultado vuelve
 * a cubrir el catálogo entero, colapsa otra vez a `undefined` («Todas» vivo
 * de nuevo, para que lo nuevo entre solo). Defensivo: ids fuera de
 * `todosIds` se ignoran (ni activan ni cuentan).
 */
export function alternarHerramienta(
  seleccion: SeleccionHerramientas,
  todosIds: string[],
  id: string,
): SeleccionHerramientas {
  const base = seleccion === undefined ? todosIds : seleccion.filter((x) => todosIds.includes(x));
  const activos = new Set(base);
  if (activos.has(id)) activos.delete(id);
  else if (todosIds.includes(id)) activos.add(id);
  const siguiente = todosIds.filter((x) => activos.has(x));
  return siguiente.length === todosIds.length ? undefined : siguiente;
}

/** Interruptor maestro «Todas»: todo activo (`undefined`) ⇄ ninguno (`[]`). */
export function alternarTodasHerramientas(
  seleccion: SeleccionHerramientas,
  todosIds: string[],
): SeleccionHerramientas {
  return todasHerramientasActivas(seleccion, todosIds) ? [] : undefined;
}

// ── Honestidad de conectores («instalado · falta conectar») ──────────────────

export type EstadoConector = "activo" | "falta-conectar" | "desactivado";

/**
 * Un conector puede estar SELECCIONADO para el chat (no excluido) sin estar
 * realmente USABLE todavía: si pide credenciales/endpoint (`conectado` es lo
 * que ya comprueba `chat-config-menu.tsx` con `readConnections()`) y el
 * usuario no los ha puesto, no puede fingirse "activo" — regla de
 * honestidad del OS. `sinCredenciales` cubre los conectores `browser-local`
 * (corren en el navegador, no piden nada) y cualquier otro que no requiera
 * conexión para funcionar.
 */
export function estadoConector(args: {
  seleccionado: boolean;
  conectado: boolean;
  sinCredenciales: boolean;
}): EstadoConector {
  if (!args.seleccionado) return "desactivado";
  if (args.conectado || args.sinCredenciales) return "activo";
  return "falta-conectar";
}

export function etiquetaEstadoConector(estado: EstadoConector): string {
  if (estado === "activo") return "conectado";
  if (estado === "falta-conectar") return "instalado · falta conectar";
  return "desactivado para este chat";
}

// ── Resumen de una frase (cabecera del picker) ────────────────────────────────

/** Frase compacta de cabecera, p.ej. "56 de 56 habilidades · 5 conectores activos (de 21)". */
export function resumenPickerHerramientas(args: {
  habilidadesActivas: number;
  habilidadesTotal: number;
  conectoresActivos: number;
  conectoresTotal: number;
}): string {
  const hab = `${args.habilidadesActivas} de ${args.habilidadesTotal} habilidad${args.habilidadesTotal === 1 ? "" : "es"}`;
  const con = `${args.conectoresActivos} conector${args.conectoresActivos === 1 ? "" : "es"} activo${
    args.conectoresActivos === 1 ? "" : "s"
  } (de ${args.conectoresTotal})`;
  return `${hab} · ${con}`;
}

// ── Herramienta «Contenido vivo» (CVV1028 · contrato §2 y §3) ────────────────

/** Id estable de la habilidad y del átomo que la sirve en la Protomolécula. */
export const ID_HERRAMIENTA_CONTENIDO_VIVO = "contenido-vivo";

/** Descripción exacta del picker: lo que hace la herramienta, en una frase. */
export const DESCRIPCION_CONTENIDO_VIVO =
  "3D vivo, película de scroll y gráficos que se mueven, eligiendo entre lo local y los servicios conectados";

/**
 * La habilidad tiene la MISMA forma que las demás del picker (`SkillCapability`:
 * `id`, `label`, `systemPrompt`, `defaultOn`…) más la `descripcion` visible. El
 * `systemPrompt` es el que hace que, al usarla, Astraura pida a la Protomolécula
 * el átomo `contenido-vivo` con la acción que ya entiende `accion-agente.ts`.
 */
export interface HabilidadPickerViva extends SkillCapability {
  descripcion: string;
}

export const HERRAMIENTA_CONTENIDO_VIVO: HabilidadPickerViva = {
  id: ID_HERRAMIENTA_CONTENIDO_VIVO,
  label: "Contenido vivo",
  descripcion: DESCRIPCION_CONTENIDO_VIVO,
  defaultOn: true,
  systemPrompt:
    `Puedes hacer VIVA una publicación, página o mensaje: ${DESCRIPCION_CONTENIDO_VIVO}. ` +
    "Elige por tarea la ruta local o la de un servicio conectado (Spline, Higgsfield, Flow), con lo local primero " +
    "y sin gastar un crédito sin cotizar y sin un sí de la persona. " +
    "Al usarla, abre la Protomolécula y pide su átomo «contenido-vivo» con " +
    '[[ACCION: protomolecula {"accion":"abrir","herramienta":"contenido-vivo"}]]. ' +
    "No inventes cifras ni copies código de ninguna skill externa.",
  routing: {},
};

/** Petición al átomo de la Protomolécula: la misma forma que usa `accion-agente.ts`. */
export interface PeticionAtomoContenidoVivo {
  accion: "abrir";
  herramienta: typeof ID_HERRAMIENTA_CONTENIDO_VIVO;
  titulo?: string;
}

/** Devuelve la petición al átomo `contenido-vivo`; el título opcional va acotado. Puro. */
export function peticionAtomoContenidoVivo(titulo?: string): PeticionAtomoContenidoVivo {
  const limpio = typeof titulo === "string" ? titulo.trim().slice(0, 80) : "";
  return limpio
    ? { accion: "abrir", herramienta: ID_HERRAMIENTA_CONTENIDO_VIVO, titulo: limpio }
    : { accion: "abrir", herramienta: ID_HERRAMIENTA_CONTENIDO_VIVO };
}

/** Petición al átomo SOLO para «Contenido vivo»; cualquier otra herramienta devuelve `null`. */
export function peticionAtomoDeHerramienta(id: string, titulo?: string): PeticionAtomoContenidoVivo | null {
  return id === ID_HERRAMIENTA_CONTENIDO_VIVO ? peticionAtomoContenidoVivo(titulo) : null;
}

/** Catálogo del picker con la herramienta añadida una sola vez y sin mutar `base`. */
export function habilidadesConContenidoVivo(base: readonly SkillCapability[]): SkillCapability[] {
  return base.some((h) => h.id === ID_HERRAMIENTA_CONTENIDO_VIVO)
    ? [...base]
    : [...base, HERRAMIENTA_CONTENIDO_VIVO];
}

// ── Migración: universo legado de habilidades (antes de este picker) ─────────

/**
 * Versión de la migración de la selección de habilidades del chat.
 * v2 (CVV1028): añade «Contenido vivo» a las selecciones explícitas ya
 * migradas en v1. Como su id está FUERA del universo legado, la migración lo
 * enciende sin tocar lo que la persona sí había decidido a mano.
 */
export const HERRAMIENTAS_DEFAULTS_VERSION = 2;

/**
 * Ids de habilidad que YA se podían elegir a mano antes de este picker: el
 * menú «Configuración del chat» (`chat-config-menu.tsx`, sección
 * «Habilidades») solo exponía estos 8 (`SKILL_KEYS`). Cualquier
 * `ChatConfig.skills` explícito de ANTES de esta migración se decidió SOLO
 * contra ese universo: el resto del catálogo real (`SKILL_CAPABILITIES`,
 * ~56 ids) nunca fue una opción, así que no cuenta como «el usuario lo
 * apagó» — entra activo solo, una única vez.
 */
export const HABILIDADES_UNIVERSO_LEGADO: readonly string[] = [
  "taste",
  "pm",
  "web-senses",
  "research",
  "vision",
  "voice",
  "planning",
  "memory",
];

export interface MigracionHerramientas {
  seleccion: SeleccionHerramientas;
  version: number;
  /** true si hay que persistir (aunque el array resultante no cambie de contenido). */
  cambio: boolean;
}

/**
 * Migra la selección de habilidades persistida de un chat a la versión
 * actual (mismo patrón que `DOCK_DEFAULT_ON_IDS`/`DOCK_DEFAULTS_VERSION` en
 * `src/lib/dock/dock-defaults.ts`):
 *   · YA al día (`version >= HERRAMIENTAS_DEFAULTS_VERSION`) → se respeta
 *     ÍNTEGRA, incluida cualquier habilidad nueva que el usuario haya
 *     apagado él mismo DESPUÉS de migrar (su decisión, no se vuelve a tocar).
 *   · De antes de esta migración (o sin versión) y con selección EXPLÍCITA →
 *     añade las habilidades FUERA del universo legado (nunca elegibles a
 *     mano hasta ahora) sin tocar las que el usuario sí pudo decidir.
 *   · En v1 (ya migrada) → solo añade la novedad de v2 («Contenido vivo»):
 *     lo que la persona apagara después de v1 se respeta.
 *   · Sin selección explícita («Todas») → nada que migrar: ya cubre las
 *     nuevas solas. Solo se estampa la versión.
 */
export function migrarSeleccionHabilidades(
  seleccion: SeleccionHerramientas,
  version: number | undefined,
  todosIdsActuales: string[],
): MigracionHerramientas {
  const actual = version ?? 0;
  if (actual >= HERRAMIENTAS_DEFAULTS_VERSION) {
    return { seleccion, version: actual, cambio: false };
  }
  if (seleccion === undefined) {
    return { seleccion: undefined, version: HERRAMIENTAS_DEFAULTS_VERSION, cambio: true };
  }
  const legado = new Set(HABILIDADES_UNIVERSO_LEGADO);
  const activos = new Set(seleccion);
  const novedades = actual === 0
    ? todosIdsActuales.filter((id) => !legado.has(id))
    : [ID_HERRAMIENTA_CONTENIDO_VIVO];
  for (const id of novedades) {
    if (todosIdsActuales.includes(id)) activos.add(id);
  }
  const migrada = todosIdsActuales.filter((id) => activos.has(id));
  const final = migrada.length === todosIdsActuales.length ? undefined : migrada;
  return { seleccion: final, version: HERRAMIENTAS_DEFAULTS_VERSION, cambio: true };
}
