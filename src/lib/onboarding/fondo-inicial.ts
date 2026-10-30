/**
 * fondo-inicial — paso «Elige tu fondo» del rito (Ola 1018F · FSH1018J ·
 * architecture/fondos-shaders.md §3). PURO: decide SI TOCA mostrar la ventana,
 * sin React, sin red, sin disco y sin Supabase: entrada → salida.
 *
 * Reglas del paso (nunca bloquea: solo abre la ventana, nunca detiene el rito):
 *  - al CREAR el perfil sale (se puede saltar; si se salta, queda el actual);
 *  - a los perfiles YA registrados les sale UNA vez (nunca eligieron);
 *  - vuelve a salir cuando el catálogo trae fondos nuevos («novedades»):
 *    al elegir se anota la versión del catálogo vista y se compara si sube;
 *  - «Ahora no» lo aplaza 7 días (también a un perfil nuevo).
 * Un dato corrupto se IGNORA antes que acallar la ventana para siempre: una
 * ventana no bloqueante se vuelve a aplazar con «Ahora no» sin coste alguno.
 */

/** Días que se aplaza el paso con «Ahora no». */
export const DIAS_APLAZAR_ELEGIR_FONDO = 7;

/** La clave bajo la que vive el estado del paso (`versionCatalogoVista` etc.). */
export const CLAVE_FONDO_INICIAL = "starseed.onboarding.fondo-inicial.v1";

export interface EstadoFondoInicial {
  /** ¿Ya eligió fondo (para la versión vista del catálogo)? */
  yaEligio?: boolean;
  /** La versión del catálogo (efectos del paquete instalado) que vio al elegir. */
  versionCatalogoVista?: number | null;
  /** ISO de «Ahora no»: hasta entonces la ventana no sale. */
  aplazadoHasta?: string | null;
}

export interface EntradaFondoInicial {
  esPerfilNuevo: boolean;
  yaEligio: boolean;
  versionCatalogoVista: number | null;
  versionCatalogoActual: number;
  aplazadoHasta: string | null;
  ahora: Date;
}

/** ¿Sale la ventana «Elige tu fondo»? Decisión pura, fecha por parámetro (testeable). */
export function debeMostrarElegirFondo(e: EntradaFondoInicial): boolean {
  // 1) Ya eligió para la versión vista: no se insiste jamás.
  if (e.yaEligio) return false;
  // 2) «Ahora no» aplazó a futuro: silencio hasta la fecha (un aplazamiento
  //    corrupto o pasado se ignora: el paso se puede volver a aplazar sin coste).
  const aplazado = typeof e.aplazadoHasta === "string" ? Date.parse(e.aplazadoHasta) : Number.NaN;
  if (Number.isFinite(aplazado) && aplazado > e.ahora.getTime()) return false;
  // 3) Perfil nuevo: sale al crearlo, con o sin estado previo.
  if (e.esPerfilNuevo) return true;
  // 4) Ya registrado sin elegir antes: sale UNA vez.
  const vista = typeof e.versionCatalogoVista === "number" && Number.isFinite(e.versionCatalogoVista)
    ? e.versionCatalogoVista
    : null;
  if (vista === null) return true;
  // 5) Novedades: sale de nuevo si el catálogo instalado trae fondos nuevos.
  //    Ante una versión actual no finita (dato corrupto) no se molesta.
  return Number.isFinite(e.versionCatalogoActual) && e.versionCatalogoActual > vista;
}

/** La fecha de «Ahora no»: `ahora` + `dias` días, en ISO 8601. */
export function aplazamientoElegirFondo(ahora: Date, dias: number = DIAS_APLAZAR_ELEGIR_FONDO): string {
  return new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * La versión del catálogo INSTALADO: nº de categorías × 1000 + nº de efectos.
 * Solo SUBE cuando `shaders/registry` trae efectos nuevos (cada versión del
 * paquete trae los suyos al catálogo sin tocar código, fondos-shaders.md §1),
 * y sirve como marca de «novedades» en `debeMostrarElegirFondo`.
 */
export function versionDelCatalogo(catalogo: Record<string, readonly unknown[]>): number {
  let efectos = 0;
  for (const lista of Object.values(catalogo)) efectos += Array.isArray(lista) ? lista.length : 0;
  return Object.keys(catalogo).length * 1000 + efectos;
}
