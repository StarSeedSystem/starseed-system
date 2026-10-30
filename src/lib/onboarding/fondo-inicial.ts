/**
 * fondo-inicial — Decide cuándo mostrar el paso «Elige tu fondo» en el rito.
 * ---------------------------------------------------------------------------
 * Puro: entrada → salida, sin red, sin disco, sin reloj real.
 * El reloj (ahora) se inyecta para que las pruebas sean deterministas.
 */

export interface EntradaFondoInicial {
  /** true si el perfil se está creando ahora (primera vez). */
  esPerfilNuevo: boolean;
  /** true si el usuario ya eligió fondo en esta versión del catálogo. */
  yaEligio: boolean;
  /** Versión del catálogo que el usuario ya vio (guardada en su estado). */
  versionCatalogoVista: number;
  /** Versión actual del catálogo de fondos (sube cuando hay novedades). */
  versionCatalogoActual: number;
  /** Timestamp (ms) hasta el que el usuario aplazó la elección; 0 = sin aplazar. */
  aplazadoHasta: number;
  /** Timestamp actual (ms) — inyectado para pureza y tests. */
  ahora: number;
}

export interface SalidaFondoInicial {
  /** true = mostrar el paso «Elige tu fondo». */
  mostrar: boolean;
  /** Motivo por el que se muestra (útil para logs/telemetría). */
  motivo: "perfil-nuevo" | "novedades-catalogo" | "nunca-visto" | "aplazado-vencido" | "no-mostrar";
  /** Si true, el usuario puede posponer con «Ahora no» (7 días). */
  puedeAplazar: boolean;
}

/** Días de aplazamiento cuando el usuario pulsa «Ahora no». */
export const DIAS_APLAZAMIENTO = 7;
export const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Decide si se debe mostrar el selector de fondo inicial.
 *
 * Reglas (orden de prioridad):
 * 1. Perfil nuevo → SIEMPRE muestra (motivo "perfil-nuevo").
 * 2. Ya eligió en la versión actual del catálogo → NO muestra ("no-mostrar").
 * 3. Aplazamiento VIGENTE: respeta siempre, sea cual sea el estado del catálogo.
 * 4. Si versionVista === 0 (nunca vio el catálogo):
 *    a) Aplazamiento VENCIDO → "aplazado-vencido".
 *    b) Sin aplazamiento vencido → "nunca-visto".
 * 5. Catálogo con novedades (versionActual > versionVista Y versionVista > 0) → "novedades-catalogo".
 *    (Prioridad sobre "aplazado-vencido" cuando hay novedades reales).
 * 6. Aplazamiento VENCIDO (versionVista === versionActual, sin novedades) → "aplazado-vencido".
 * 7. Mismo catálogo pero NO eligió aún (versionVista === versionActual && !yaEligio) → "nunca-visto".
 * 8. Por defecto → NO muestra ("no-mostrar").
 * 9. Nunca bloquea: el paso siempre es opcional (puedeAplazar = true cuando se muestra).
 */
export function debeMostrarElegirFondo(e: EntradaFondoInicial): SalidaFondoInicial {
  // 1. Perfil nuevo: siempre muestra, no importa el resto.
  if (e.esPerfilNuevo) {
    return { mostrar: true, motivo: "perfil-nuevo", puedeAplazar: true };
  }

  // 2. Si ya eligió en la versión actual, no vuelve a salir.
  if (e.yaEligio && e.versionCatalogoVista >= e.versionCatalogoActual) {
    return { mostrar: false, motivo: "no-mostrar", puedeAplazar: false };
  }

  // 3. Aplazamiento VIGENTE: respeta siempre, sea cual sea el estado del catálogo.
  if (e.aplazadoHasta > 0 && e.ahora < e.aplazadoHasta) {
    return { mostrar: false, motivo: "no-mostrar", puedeAplazar: false };
  }

  const aplazadoVencido = e.aplazadoHasta > 0 && e.ahora >= e.aplazadoHasta;
  const hayNovedades = e.versionCatalogoActual > e.versionCatalogoVista;
  const nuncaVio = e.versionCatalogoVista === 0;

  // 4. Nunca vio el catálogo (versionVista === 0).
  if (nuncaVio) {
    if (aplazadoVencido) {
      return { mostrar: true, motivo: "aplazado-vencido", puedeAplazar: true };
    }
    return { mostrar: true, motivo: "nunca-visto", puedeAplazar: true };
  }

  // 5. Catálogo con novedades reales (versionActual > versionVista Y versionVista > 0).
  // Prioridad sobre "aplazado-vencido" cuando hay novedades.
  if (hayNovedades) {
    return { mostrar: true, motivo: "novedades-catalogo", puedeAplazar: true };
  }

  // 6. Aplazamiento VENCIDO (sin novedades, versionVista === versionActual).
  if (aplazadoVencido) {
    return { mostrar: true, motivo: "aplazado-vencido", puedeAplazar: true };
  }

  // 7. Mismo catálogo pero NO eligió aún (versionVista === versionActual && !yaEligio).
  if (e.versionCatalogoVista === e.versionCatalogoActual && !e.yaEligio) {
    return { mostrar: true, motivo: "nunca-visto", puedeAplazar: true };
  }

  // 8. Por defecto: no mostrar.
  return { mostrar: false, motivo: "no-mostrar", puedeAplazar: false };
}

/**
 * Calcula el timestamp (ms) para aplazar 7 días desde ahora.
 * Pura: recibe 'ahora' inyectado.
 */
export function calcularAplazamiento(ahora: number): number {
  return ahora + DIAS_APLAZAMIENTO * MS_POR_DIA;
}

/**
 * Versión del catálogo de fondos por defecto (para migraciones).
 * Se usa cuando no hay versión guardada en el estado del usuario.
 */
export const VERSION_CATALOGO_DEFECTO = 1;