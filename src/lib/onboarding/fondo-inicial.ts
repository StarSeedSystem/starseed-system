/**
 * fondo-inicial — cuándo sale el paso «Elige tu fondo» (Ola 1018F · FSH1018J).
 *
 * Contrato: architecture/fondos-shaders.md §3. El paso aparece al crear el
 * perfil, una vez a las cuentas que ya existían y otra cuando sube la versión
 * del catálogo (novedades). NUNCA bloquea el rito y «Ahora no» lo aplaza siete
 * días. Módulo PURO: reloj, fechas y versiones entran por parámetro.
 */

/** Versión del catálogo de fondos que conoce este código (sube al añadir sets nuevos). */
export const VERSION_CATALOGO_FONDOS = 1;

/** «Ahora no» pospone el paso exactamente estos días. */
export const DIAS_APLAZAMIENTO_FONDO = 7;

const MS_DIA = 24 * 60 * 60 * 1000;

export type VersionCatalogo = number | null;

export interface EstadoElegirFondo {
  /** La cuenta (o el perfil) se acaba de crear: es el momento natural del paso. */
  esPerfilNuevo: boolean;
  /** Ya eligió un fondo alguna vez: no se le repite salvo que haya novedades. */
  yaEligio: boolean;
  /** Última versión del catálogo que vio o eligió (null = nunca lo vio). */
  versionCatalogoVista: VersionCatalogo;
  /** Versión del catálogo instalado en este momento. */
  versionCatalogoActual: number;
  /** ISO de «Ahora no» (null/undefined = no aplazado). */
  aplazadoHasta?: string | null;
  /** Instante de la comprobación (inyectado para que la decisión sea reproducible). */
  ahora: Date | number | string;
}

function aMs(v: Date | number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const ms = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * ¿Toca enseñar «Elige tu fondo» ahora?
 *
 * Orden de las reglas (la primera que decide, manda):
 *  1. Un aplazamiento vigente lo esconde hasta su fecha (evita el bucle).
 *  2. Perfil nuevo: sale siempre, con el fondo actual como opción principal.
 *  3. Catálogo nuevo (versión actual > vista): son novedades y vuelve a salir.
 *  4. Cuenta ya existente que nunca lo vio: sale una vez.
 *  5. En cualquier otro caso, no molesta.
 *
 * Es una recomendación, no una puerta: quien llama decide y puede saltarlo.
 */
export function debeMostrarElegirFondo(e: EstadoElegirFondo): boolean {
  const ahora = aMs(e.ahora) ?? 0;
  const aplazado = aMs(e.aplazadoHasta);
  if (aplazado !== null && ahora < aplazado) return false;

  if (e.esPerfilNuevo) return true;

  const vista = e.versionCatalogoVista;
  if (vista === null || !Number.isFinite(vista)) return !e.yaEligio;
  if (e.versionCatalogoActual > vista) return true;

  return !e.yaEligio && vista === null;
}

/** La fecha que se guarda al pulsar «Ahora no» (siete días después, ISO 8601). */
export function aplazarElegirFondo(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() + DIAS_APLAZAMIENTO_FONDO * MS_DIA).toISOString();
}

/** ¿El fondo elegido ya está al día con el catálogo? (para marcar «sin novedades»). */
export function catalogoFondoAlDia(vista: VersionCatalogo, actual: number): boolean {
  if (vista === null || !Number.isFinite(vista)) return false;
  return actual <= vista;
}
