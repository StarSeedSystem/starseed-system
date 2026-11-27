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

/* ── «Elige tu fondo» (FON1126A): selección única, vista previa y catálogo propio ── */

/** Lo mínimo que necesita la lógica de una opción de fondo (la ficha completa vive en el componente). */
export interface OpcionBase { id: string; nombre: string }

/** Selección como radio: tocar otro fondo desmarca el anterior; tocar el mismo lo mantiene. */
export function elegirFondoUnico(_anterior: string | null, id: string): string {
  return id;
}

/** Une «Fondo actual», sets oficiales, catálogo y fondos propios sin repetir ids (gana el primero). */
export function opcionesFondoCompletas<T extends OpcionBase>(...grupos: ReadonlyArray<readonly T[]>): T[] {
  const vistos = new Set<string>();
  return grupos.flat().filter((o) => {
    if (vistos.has(o.id)) return false;
    vistos.add(o.id);
    return true;
  });
}

/** La opción elegida (vista previa grande); si el id ya no existe, la primera. */
export function opcionElegida<T extends OpcionBase>(opciones: readonly T[], id: string | null): T | null {
  return opciones.find((o) => o.id === id) ?? opciones[0] ?? null;
}

/** Añade un fondo al catálogo del perfil; si el id ya existe lo reemplaza (personalizar = volver con el resultado). */
export function incorporarFondo<T extends OpcionBase>(catalogo: readonly T[], nuevo: T): T[] {
  return catalogo.some((o) => o.id === nuevo.id) ? catalogo.map((o) => (o.id === nuevo.id ? nuevo : o)) : [...catalogo, nuevo];
}

export type OrigenAnadirFondo = "libreria" | "archivos";

/** Las dos tarjetas que cierran siempre la rejilla. */
export const TARJETAS_ANADIR_FONDO: ReadonlyArray<{ origen: OrigenAnadirFondo; titulo: string; ayuda: string }> = [
  { origen: "libreria", titulo: "Añadir desde la Librería", ayuda: "Fondos y sets publicados" },
  { origen: "archivos", titulo: "Desde mis archivos", ayuda: "Imagen, vídeo o set de tu Biblioteca o del aparato" },
];

export type ModoVistaPrevia = "animada" | "quieta" | "imagen";

/** Cómo se pinta una miniatura: sin WebGPU, imagen fija; con movimiento reducido o rendimiento bajo, quieta; si no, anima solo con cursor o foco. */
export function modoVistaPrevia(e: { webgpu: boolean; movimientoReducido: boolean; rendimientoBajo: boolean; activa: boolean }): ModoVistaPrevia {
  if (!e.webgpu) return "imagen";
  if (e.movimientoReducido || e.rendimientoBajo) return "quieta";
  return e.activa ? "animada" : "quieta";
}
