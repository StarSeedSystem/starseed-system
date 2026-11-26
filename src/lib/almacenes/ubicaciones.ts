/**
 * Mapa de ubicaciones de carpetas y memorias en los almacenes
 *
 * Cada cerebro sabe dónde vive cada carpeta o memoria, cuántas copias hay y
 * cuáles están en línea. Regla: lo fundamental tiene al menos dos copias en
 * medios distintos; un medio extraíble nunca es la única copia de algo
 * fundamental salvo que el dueño lo elija sabiendo el riesgo (aviso claro).
 * Una parte fuera de línea se muestra fuera de línea, no desaparece.
 */

import {
  TipoAlmacen,
  ModalidadAlmacen,
  ModalidadCarpeta,
  type Almacen,
} from "./modelo";

/** Copia de una carpeta/memoria en un almacén específico. */
export interface CopiaUbicacion {
  /** Identidad estable del almacén (UUID del volumen). */
  almacenId: string;
  /** Tipo de almacén. */
  almacenTipo: TipoAlmacen;
  /** Nombre legible del almacén. */
  almacenNombre: string;
  /** Modalidad de esta copia en este almacén. */
  modalidad: ModalidadAlmacen | ModalidadCarpeta;
  /** Si el almacén está actualmente en línea. */
  enLinea: boolean;
  /** Ruta dentro del almacén donde vive esta copia. */
  rutaEnAlmacen: string;
  /** Si esta copia es de datos fundamentales (requiere regla de 2 copias). */
  esFundamental: boolean;
}

/** Ubicación de una carpeta específica (todas sus copias). */
export interface UbicacionCarpeta {
  /** Ruta de la carpeta (relativa al cerebro). */
  ruta: string;
  /** ID del cerebro al que pertenece. */
  cerebroId: string;
  /** Todas las copias de esta carpeta en distintos almacenes. */
  copias: CopiaUbicacion[];
}

/** Mapa completo de ubicaciones de un cerebro. */
export interface UbicacionCerebro {
  /** ID del cerebro. */
  cerebroId: string;
  /** Mapa de ruta -> ubicación de carpeta. */
  carpetas: Record<string, UbicacionCarpeta>;
  /** Fecha de última actualización del mapa. */
  fechaActualizacion: string;
}

/** Mapa de ubicaciones por cerebro (clave = cerebroId). */
export type MapaUbicacionesCerebro = Record<string, UbicacionCerebro>;

/** Incumplimiento de la regla de dos copias. */
export interface IncumplimientoDosCopias {
  /** Tipo de incumplimiento. */
  tipo: "una_sola_copia" | "solo_extraible";
  /** Ruta de la carpeta afectada. */
  ruta: string;
  /** Mensaje descriptivo para la UI. */
  mensaje: string;
  /** Almacenes donde están las copias (para diagnóstico). */
  almacenes: string[];
}

/** Resultado de validar la regla de dos copias. */
export interface ResultadoValidacionDosCopias {
  /** Si se cumple la regla globalmente. */
  cumple: boolean;
  /** Lista de incumplimientos detectados. */
  incumplimientos: IncumplimientoDosCopias[];
}

/** Estado de una carpeta según sus copias. */
export type EstadoCarpeta = "en_linea" | "fuera_de_linea" | "sin_copias";

/** Resumen del estado de ubicaciones de un cerebro. */
export interface ResumenUbicacionesCerebro {
  cerebroId: string;
  totalCarpetas: number;
  carpetasEnLinea: number;
  carpetasFueraDeLinea: number;
  carpetasSinCopias: number;
  incumplimientosDosCopias: number;
  advertenciasExtraibleUnico: number;
}

/**
 * Determina si una modalidad se considera fundamental (requiere regla de 2 copias).
 * Fundamentales: cerebro-completo, parte, respaldo-vivo.
 * No fundamentales: replica, neurona-nodo, secundario.
 */
export function esFundamental(modalidad: ModalidadAlmacen | ModalidadCarpeta): boolean {
  return (
    modalidad === "cerebro-completo" ||
    modalidad === "parte" ||
    modalidad === "respaldo-vivo"
  );
}

/**
 * Registra una ubicación (copia) para una carpeta en un almacén.
 * No duplica si ya existe la misma combinación almacenId + rutaEnAlmacen.
 */
export function registrarUbicacion(
  mapa: MapaUbicacionesCerebro,
  cerebroId: string,
  ruta: string,
  copia: CopiaUbicacion
): MapaUbicacionesCerebro {
  const cerebro = mapa[cerebroId] ?? {
    cerebroId,
    carpetas: {} as Record<string, UbicacionCarpeta>,
    fechaActualizacion: new Date().toISOString(),
  };

  const carpeta = cerebro.carpetas[ruta] ?? {
    ruta,
    cerebroId,
    copias: [] as CopiaUbicacion[],
  };

  const yaExiste = carpeta.copias.some(
    (c) => c.almacenId === copia.almacenId && c.rutaEnAlmacen === copia.rutaEnAlmacen
  );

  if (!yaExiste) {
    carpeta.copias = [...carpeta.copias, copia];
  }

  cerebro.carpetas = { ...cerebro.carpetas, [ruta]: carpeta };
  cerebro.fechaActualizacion = new Date().toISOString();

  return { ...mapa, [cerebroId]: cerebro };
}

/**
 * Actualiza el estado en línea de todas las copias de un almacén específico.
 */
export function actualizarEstadoEnLinea(
  mapa: MapaUbicacionesCerebro,
  almacenId: string,
  enLinea: boolean
): MapaUbicacionesCerebro {
  const nuevoMapa: MapaUbicacionesCerebro = {};

  for (const [cerebroId, cerebro] of Object.entries(mapa)) {
    const nuevasCarpetas: Record<string, UbicacionCarpeta> = {};

    for (const [ruta, carpeta] of Object.entries(cerebro.carpetas)) {
      const nuevasCopias = carpeta.copias.map((copia) =>
        copia.almacenId === almacenId ? { ...copia, enLinea } : copia
      );

      nuevasCarpetas[ruta] = { ...carpeta, copias: nuevasCopias };
    }

    nuevoMapa[cerebroId] = {
      ...cerebro,
      carpetas: nuevasCarpetas,
      fechaActualizacion: new Date().toISOString(),
    };
  }

  return nuevoMapa;
}

/**
 * Obtiene todas las copias de una carpeta específica.
 */
export function obtenerCopiasDeCarpeta(
  mapa: MapaUbicacionesCerebro,
  ruta: string
): CopiaUbicacion[] {
  for (const cerebro of Object.values(mapa)) {
    if (cerebro.carpetas[ruta]) {
      return cerebro.carpetas[ruta].copias;
    }
  }
  return [];
}

/**
 * Obtiene todas las copias de todas las carpetas de un cerebro.
 */
export function obtenerCopiasDeCerebro(mapa: MapaUbicacionesCerebro): CopiaUbicacion[] {
  const copias: CopiaUbicacion[] = [];
  for (const cerebro of Object.values(mapa)) {
    for (const carpeta of Object.values(cerebro.carpetas)) {
      copias.push(...carpeta.copias);
    }
  }
  return copias;
}

/**
 * Valida la regla de al menos dos copias en medios distintos para datos fundamentales.
 * Genera aviso claro si un medio extraíble es la única copia.
 */
export function validarReglaDosCopias(mapa: MapaUbicacionesCerebro): ResultadoValidacionDosCopias {
  const incumplimientos: IncumplimientoDosCopias[] = [];

  for (const cerebro of Object.values(mapa)) {
    for (const [ruta, carpeta] of Object.entries(cerebro.carpetas)) {
      const copiasFundamentales = carpeta.copias.filter((c) => c.esFundamental);

      if (copiasFundamentales.length === 0) {
        continue; // No es fundamental, no aplica la regla
      }

      if (copiasFundamentales.length === 1) {
        const copia = copiasFundamentales[0];
        const esExtraible = copia.almacenTipo === "extraible";

        incumplimientos.push({
          tipo: esExtraible ? "solo_extraible" : "una_sola_copia",
          ruta,
          mensaje: esExtraible
            ? `⚠️ La carpeta «${ruta}» solo tiene una copia en un medio extraíble (${copia.almacenNombre}). ` +
              `Los datos fundamentales requieren al menos dos copias en medios distintos. ` +
              `Conecte otro medio o active un respaldo vivo.`
            : `La carpeta «${ruta}» solo tiene una copia (${copia.almacenNombre}). ` +
              `Los datos fundamentales requieren al menos dos copias en medios distintos.`,
          almacenes: [copia.almacenId],
        });
      } else if (copiasFundamentales.length >= 2) {
        // Verificar que estén en medios distintos (diferente almacenId)
        const almacenesUnicos = new Set(copiasFundamentales.map((c) => c.almacenId));
        if (almacenesUnicos.size < 2) {
          incumplimientos.push({
            tipo: "una_sola_copia",
            ruta,
            mensaje: `La carpeta «${ruta}» tiene ${copiasFundamentales.length} copias pero todas en el mismo medio físico. ` +
              `Se requieren al menos dos copias en medios distintos.`,
            almacenes: copiasFundamentales.map((c) => c.almacenId),
          });
        }
      }
    }
  }

  return {
    cumple: incumplimientos.length === 0,
    incumplimientos,
  };
}

/**
 * Obtiene el estado de una carpeta según sus copias.
 * - "en_linea": al menos una copia está en línea
 * - "fuera_de_linea": hay copias pero ninguna en línea
 * - "sin_copias": no hay copias registradas
 */
export function obtenerEstadoCarpeta(
  mapa: MapaUbicacionesCerebro,
  ruta: string
): EstadoCarpeta {
  const copias = obtenerCopiasDeCarpeta(mapa, ruta);

  if (copias.length === 0) {
    return "sin_copias";
  }

  const algunaEnLinea = copias.some((c) => c.enLinea);
  return algunaEnLinea ? "en_linea" : "fuera_de_linea";
}

/**
 * Obtiene un resumen completo del estado de ubicaciones de un cerebro.
 */
export function obtenerResumenCerebro(
  mapa: MapaUbicacionesCerebro,
  cerebroId?: string
): ResumenUbicacionesCerebro {
  let cerebro: UbicacionCerebro | undefined;

  if (cerebroId) {
    cerebro = mapa[cerebroId];
  } else {
    // Si no se especifica, tomar el primero (para compatibilidad)
    const ids = Object.keys(mapa);
    cerebro = ids.length > 0 ? mapa[ids[0]] : undefined;
  }

  if (!cerebro) {
    return {
      cerebroId: cerebroId ?? "",
      totalCarpetas: 0,
      carpetasEnLinea: 0,
      carpetasFueraDeLinea: 0,
      carpetasSinCopias: 0,
      incumplimientosDosCopias: 0,
      advertenciasExtraibleUnico: 0,
    };
  }

  let carpetasEnLinea = 0;
  let carpetasFueraDeLinea = 0;
  let carpetasSinCopias = 0;
  let advertenciasExtraibleUnico = 0;

  for (const [ruta, carpeta] of Object.entries(cerebro.carpetas)) {
    const estado = obtenerEstadoCarpeta(mapa, ruta);

    if (estado === "en_linea") carpetasEnLinea++;
    else if (estado === "fuera_de_linea") carpetasFueraDeLinea++;
    else carpetasSinCopias++;

    // Verificar advertencia de extraíble único para carpetas fundamentales
    const copiasFundamentales = carpeta.copias.filter((c) => c.esFundamental);
    if (copiasFundamentales.length === 1 && copiasFundamentales[0].almacenTipo === "extraible") {
      advertenciasExtraibleUnico++;
    }
  }

  const validacion = validarReglaDosCopias(mapa);

  return {
    cerebroId: cerebro.cerebroId,
    totalCarpetas: Object.keys(cerebro.carpetas).length,
    carpetasEnLinea,
    carpetasFueraDeLinea,
    carpetasSinCopias,
    incumplimientosDosCopias: validacion.incumplimientos.length,
    advertenciasExtraibleUnico,
  };
}

/**
 * Construye el mapa de ubicaciones a partir de los manifiestos de almacenes detectados.
 * Función de conveniencia para inicializar el mapa desde la neurona.
 */
export function construirMapaDesdeManifiestos(
  manifiestos: ManifiestoAlmacen[],
  almacenPorIdVolumen: Map<string, Almacen>
): MapaUbicacionesCerebro {
  const mapa: MapaUbicacionesCerebro = {};

  for (const manifiesto of manifiestos) {
    const almacen = almacenPorIdVolumen.get(manifiesto.idVolumen);
    if (!almacen) continue;

    // Cerebros completos en este almacén
    for (const cerebroId of manifiesto.cerebros) {
      const copia: CopiaUbicacion = {
        almacenId: manifiesto.idVolumen,
        almacenTipo: almacen.tipo,
        almacenNombre: almacen.nombre,
        modalidad: "cerebro-completo",
        enLinea: almacen.medidas.enLinea,
        rutaEnAlmacen: "/",
        esFundamental: true,
      };
      mapa = registrarUbicacion(mapa, cerebroId, "/", copia);
    }

    // Partes (carpetas -> cerebroId) en este almacén
    for (const [ruta, cerebroId] of Object.entries(manifiesto.partes)) {
      const modalidad = almacen.carpetas?.[ruta] ?? "parte";
      const copia: CopiaUbicacion = {
        almacenId: manifiesto.idVolumen,
        almacenTipo: almacen.tipo,
        almacenNombre: almacen.nombre,
        modalidad,
        enLinea: almacen.medidas.enLinea,
        rutaEnAlmacen: ruta,
        esFundamental: esFundamental(modalidad),
      };
      mapa = registrarUbicacion(mapa, cerebroId, ruta, copia);
    }
  }

  return mapa;
}

// Re-exportar tipos necesarios
export type { Almacen, ManifiestoAlmacen } from "./modelo";