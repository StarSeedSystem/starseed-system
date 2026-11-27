/**
 * Sugerencias inteligentes para modalidad y acomodo de almacenes
 *
 * Basado en velocidad medida, tamaño, salud y uso:
 * - USB lento → respaldo / réplica
 * - SSD rápido → cerebro activo
 * - Disco viejo con avisos → secundario
 * - NAS → respaldo vivo
 * - Nube → parte de cerebro
 *
 * SOLO SUGIERE: nunca aplica sin aceptación del dueño.
 */

import {
  TipoAlmacen,
  ModalidadAlmacen,
  type Almacen,
  type MedidasAlmacen,
  esModalidadValida,
} from "./modelo";

/** Nivel de confianza de la sugerencia. */
export type NivelConfianza = "alta" | "media" | "baja";

/** Motivo individual de una sugerencia. */
export interface MotivoSugerencia {
  /** Clave técnica para identificar el motivo. */
  clave: string;
  /** Mensaje legible en español para la UI. */
  mensaje: string;
}

/** Evaluación de salud de un almacén. */
export interface EvaluacionSalud {
  /** Nivel general: excelente, buena, regular, critica. */
  nivel: "excelente" | "buena" | "regular" | "critica";
  /** Puntuación 0-100. */
  puntuacion: number;
  /** Factores que influyen en la puntuación. */
  factores: {
    velocidad: number;
    salud: number;
    tipo: number;
    capacidad: number;
  };
  /** Detalle legible. */
  detalle: string;
}

/** Aptitud de un almacén para una modalidad concreta. */
export interface AptitudModalidad {
  /** Modalidad evaluada. */
  modalidad: ModalidadAlmacen;
  /** Puntuación 0-100. */
  puntuacion: number;
  /** Motivos a favor y en contra. */
  motivos: MotivoSugerencia[];
}

/** Sugerencia de modalidad para un almacén. */
export interface SugerenciaAlmacen {
  /** Modalidad recomendada. */
  modalidad: ModalidadAlmacen;
  /** Nivel de confianza. */
  confianza: NivelConfianza;
  /** Motivos de la recomendación. */
  motivos: MotivoSugerencia[];
  /** Advertencias importantes. */
  advertencias: string[];
  /** Todas las modalidades ordenadas por aptitud (mayor a menor). */
  alternativas: AptitudModalidad[];
}

/** Sugerencia de acomodo (ruta) para una modalidad en un almacén. */
export interface SugerenciaAcomodo {
  /** Ruta sugerida dentro del almacén. */
  rutaSugerida: string;
  /** Razón de la sugerencia. */
  razon: string;
  /** Capacidad disponible en bytes. */
  capacidadDisponibleBytes: bigint;
  /** Capacidad disponible legible. */
  capacidadDisponibleLegible: string;
  /** Subcarpetas recomendadas según modalidad. */
  subcarpetas?: string[];
}

/** Configuración completa sugerida para un almacén. */
export interface ConfiguracionSugerida {
  /** Modalidad sugerida. */
  modalidad: SugerenciaAlmacen;
  /** Acomodo sugerido. */
  acomodo: SugerenciaAcomodo;
  /** Evaluación de salud del almacén. */
  evaluacionSalud: EvaluacionSalud;
  /** Aptitudes para todas las modalidades. */
  aptitudes: AptitudModalidad[];
  /** Resumen legible en español. */
  resumen: string;
  /** Avisos importantes (nunca aplica cambios). */
  avisos: string[];
}

/* ------------------------------------------------------------------ */
/* Constantes de umbrales                                             */
/* ------------------------------------------------------------------ */

const UMBRALES_VELOCIDAD = {
  // Mbps mínimos para cada uso
  cerebroCompleto: { lectura: 500, escritura: 400 },
  respaldoVivo: { lectura: 200, escritura: 150 },
  parte: { lectura: 50, escritura: 30 },
  neuronaNodo: { lectura: 100, escritura: 80 },
  secundario: { lectura: 10, escritura: 10 },
  replica: { lectura: 1, escritura: 1 },
} as const;

const PESOS_SALUD: Record<string, number> = {
  excelente: 100,
  buena: 95,
  regular: 60,
  critica: 10,
  desconocida: 40,
};

const PESOS_TIPO: Record<TipoAlmacen, number> = {
  disco_interno: 105,
  red: 95,
  nube: 80,
  neurona: 95,
  nodo: 90,
  extraible: 55,
};

/* ------------------------------------------------------------------ */
/* Evaluación de salud                                                */
/* ------------------------------------------------------------------ */

function puntuacionVelocidad(medidas: MedidasAlmacen): number {
  const lect = medidas.velocidadLecturaMbps;
  const escrit = medidas.velocidadEscrituraMbps;
  const media = (lect + escrit) / 2;
  // Escala más generosa para discos rápidos: 3000+ = 100, 2000 = 95, 1000 = 85, 500 = 70, 100 = 50, 30 = 30, 10 = 15
  if (media >= 3000) return 100;
  if (media >= 2000) return 95;
  if (media >= 1000) return 85;
  if (media >= 500) return 70;
  if (media >= 100) return 50;
  if (media >= 30) return 30;
  return 15;
}

function puntuacionCapacidad(medidas: MedidasAlmacen): number {
  const totalGB = Number(medidas.totalBytes) / 1_000_000_000;
  if (totalGB >= 2000) return 100;
  if (totalGB >= 1000) return 90;
  if (totalGB >= 500) return 80;
  if (totalGB >= 250) return 70;
  if (totalGB >= 100) return 60;
  if (totalGB >= 32) return 40;
  return 20;
}

export function evaluarSaludAlmacen(almacen: Almacen): EvaluacionSalud {
  const { medidas } = almacen;

  const vel = puntuacionVelocidad(medidas);
  const sal = PESOS_SALUD[medidas.salud] ?? 30;
  const tip = PESOS_TIPO[almacen.tipo] ?? 50;
  const cap = puntuacionCapacidad(medidas);

  // Promedio ponderado: velocidad 38%, salud 30%, tipo 20%, capacidad 12%
  const puntuacion = Math.round(vel * 0.38 + sal * 0.3 + tip * 0.2 + cap * 0.12);

  let nivel: EvaluacionSalud["nivel"];
  if (puntuacion >= 85) nivel = "excelente";
  else if (puntuacion >= 65) nivel = "buena";
  else if (puntuacion >= 35) nivel = "regular";
  else nivel = "critica";

  const factores = { velocidad: vel, salud: sal, tipo: tip, capacidad: cap };

  const detalle =
    `Salud: ${medidas.salud} (${sal}/100). ` +
    `Velocidad: ${medidas.velocidadLecturaMbps}/${medidas.velocidadEscrituraMbps} MB/s (${vel}/100). ` +
    `Tipo: ${almacen.tipo} (${tip}/100). ` +
    `Capacidad: ${(Number(medidas.totalBytes) / 1e9).toFixed(1)} GB (${cap}/100). ` +
    `Puntuación global: ${puntuacion}/100 → ${nivel}.`;

  return { nivel, puntuacion, factores, detalle };
}

/* ------------------------------------------------------------------ */
/* Aptitud por modalidad                                              */
/* ------------------------------------------------------------------ */

function umbralesParaModalidad(modalidad: ModalidadAlmacen): {
  lecturaMin: number;
  escrituraMin: number;
  capacidadMinGB: number;
  requiereSaludMinima: "excelente" | "buena" | "regular" | "critica";
} {
  switch (modalidad) {
    case "cerebro-completo":
      return { lecturaMin: 500, escrituraMin: 400, capacidadMinGB: 100, requiereSaludMinima: "buena" };
    case "respaldo-vivo":
      return { lecturaMin: 200, escrituraMin: 150, capacidadMinGB: 500, requiereSaludMinima: "regular" };
    case "parte":
      return { lecturaMin: 50, escrituraMin: 30, capacidadMinGB: 50, requiereSaludMinima: "regular" };
    case "neurona-nodo":
      return { lecturaMin: 100, escrituraMin: 80, capacidadMinGB: 200, requiereSaludMinima: "buena" };
    case "secundario":
      return { lecturaMin: 10, escrituraMin: 10, capacidadMinGB: 100, requiereSaludMinima: "critica" };
    case "replica":
      return { lecturaMin: 1, escrituraMin: 1, capacidadMinGB: 10, requiereSaludMinima: "critica" };
    default:
      return { lecturaMin: 10, escrituraMin: 10, capacidadMinGB: 10, requiereSaludMinima: "critica" };
  }
}

function saludCumple(salud: string, minima: string): boolean {
  const orden = { critica: 0, regular: 1, buena: 2, excelente: 3, desconocida: 1 };
  return (orden[salud as keyof typeof orden] ?? 0) >= (orden[minima as keyof typeof orden] ?? 0);
}

export function calcularAptitudModalidad(
  almacen: Almacen,
  modalidad: ModalidadAlmacen
): AptitudModalidad {
  const { medidas } = almacen;
  const umbrales = umbralesParaModalidad(modalidad);
  const motivos: MotivoSugerencia[] = [];
  let puntuacion = 50; // base

  // Velocidad
  if (medidas.velocidadLecturaMbps >= umbrales.lecturaMin && medidas.velocidadEscrituraMbps >= umbrales.escrituraMin) {
    puntuacion += 25;
    motivos.push({ clave: "velocidad_adecuada", mensaje: `Velocidad suficiente para ${modalidad} (${medidas.velocidadLecturaMbps}/${medidas.velocidadEscrituraMbps} MB/s).` });
  } else {
    puntuacion -= 20;
    motivos.push({ clave: "velocidad_insuficiente", mensaje: `Velocidad por debajo del recomendado para ${modalidad} (mín: ${umbrales.lecturaMin}/${umbrales.escrituraMin} MB/s, actual: ${medidas.velocidadLecturaMbps}/${medidas.velocidadEscrituraMbps} MB/s).` });
  }

  // Salud
  if (saludCumple(medidas.salud, umbrales.requiereSaludMinima)) {
    puntuacion += 15;
    motivos.push({ clave: "salud_adecuada", mensaje: `Salud ${medidas.salud} cumple el mínimo (${umbrales.requiereSaludMinima}) para ${modalidad}.` });
  } else {
    puntuacion -= 15;
    motivos.push({ clave: "salud_insuficiente", mensaje: `Salud ${medidas.salud} por debajo del mínimo (${umbrales.requiereSaludMinima}) para ${modalidad}.` });
  }

  // Capacidad
  const totalGB = Number(medidas.totalBytes) / 1e9;
  if (totalGB >= umbrales.capacidadMinGB) {
    puntuacion += 10;
    motivos.push({ clave: "capacidad_adecuada", mensaje: `Capacidad ${totalGB.toFixed(0)} GB ≥ mínimo ${umbrales.capacidadMinGB} GB para ${modalidad}.` });
  } else {
    puntuacion -= 10;
    motivos.push({ clave: "capacidad_insuficiente", mensaje: `Capacidad ${totalGB.toFixed(0)} GB < mínimo ${umbrales.capacidadMinGB} GB para ${modalidad}.` });
  }

  // Tipo de almacén - bonificaciones/penalizaciones por adecuación natural
  const bonificacionesTipo: Record<TipoAlmacen, Partial<Record<ModalidadAlmacen, number>>> = {
    disco_interno: { "cerebro-completo": 20, "respaldo-vivo": 10, "secundario": 10, "parte": 5 },
    red: { "respaldo-vivo": 25, "neurona-nodo": 10, "parte": 5 },
    nube: { "parte": 20, "respaldo-vivo": 5, "replica": 5 },
    neurona: { "cerebro-completo": 15, "neurona-nodo": 15, "parte": 5 },
    nodo: { "neurona-nodo": 20, "respaldo-vivo": 10, "parte": 5 },
    extraible: { "replica": 15, "respaldo-vivo": 10, "secundario": 10, "parte": -10, "cerebro-completo": -25 },
  };

  const bonus = bonificacionesTipo[almacen.tipo]?.[modalidad] ?? 0;
  if (bonus > 0) {
    puntuacion += bonus;
    const clave = modalidad === "respaldo-vivo" ? "adecuado_para_sync" : "tipo_adecuado";
    motivos.push({ clave, mensaje: `Tipo ${almacen.tipo} adecuado para ${modalidad}.` });
  } else if (bonus < 0) {
    puntuacion += bonus; // resta
    motivos.push({ clave: "tipo_poco_adecuado", mensaje: `Tipo ${almacen.tipo} poco recomendado para ${modalidad}.` });
  }

  // Espacio libre vs capacidad mínima
  const libreGB = Number(medidas.libreBytes) / 1e9;
  if (libreGB < umbrales.capacidadMinGB * 0.5) {
    puntuacion -= 10;
    motivos.push({ clave: "espacio_justo", mensaje: `Espacio libre (${libreGB.toFixed(0)} GB) justo para ${modalidad}.` });
  }

  // Limitar a 0-100
  puntuacion = Math.max(0, Math.min(100, puntuacion));

  return { modalidad, puntuacion, motivos };
}

/* ------------------------------------------------------------------ */
/* Sugerencia de modalidad                                            */
/* ------------------------------------------------------------------ */

const TODAS_MODALIDADES: ModalidadAlmacen[] = [
  "cerebro-completo",
  "parte",
  "replica",
  "respaldo-vivo",
  "neurona-nodo",
  "secundario",
];

export function sugerirModalidad(almacen: Almacen): SugerenciaAlmacen {
  const aptitudes = TODAS_MODALIDADES.map((m) => calcularAptitudModalidad(almacen, m));
  aptitudes.sort((a, b) => b.puntuacion - a.puntuacion);

  const mejor = aptitudes[0];
  const segunda = aptitudes[1];

  // Determinar confianza
  let confianza: NivelConfianza;
  const diferencia = mejor.puntuacion - (segunda?.puntuacion ?? 0);
  if (mejor.puntuacion >= 70 && diferencia >= 8) confianza = "alta";
  else if (mejor.puntuacion >= 50 && diferencia >= 3) confianza = "media";
  else confianza = "baja";

  // Advertencias
  const advertencias: string[] = [];
  // Siempre avisar si el medio es extraíble y podría usarse para datos fundamentales
  if (almacen.tipo === "extraible") {
    advertencias.push(
      `⚠️ Este medio es extraíble. Los datos fundamentales (cerebro-completo, parte, respaldo-vivo) requieren al menos dos copias en medios distintos. ` +
        `No use este medio como única copia de datos importantes sin tener un respaldo vivo activo.`
    );
  }
  if (mejor.puntuacion < 50) {
    advertencias.push(`La aptitud para ${mejor.modalidad} es baja (${mejor.puntuacion}/100). Considere otra modalidad o medio.`);
  }
  if (medidasSaludCritica(almacen)) {
    advertencias.push(`La salud del medio es crítica. Haga un respaldo urgente antes de usarlo para datos importantes.`);
  }

  return {
    modalidad: mejor.modalidad,
    confianza,
    motivos: mejor.motivos,
    advertencias,
    alternativas: aptitudes,
  };
}

function medidasSaludCritica(almacen: Almacen): boolean {
  return almacen.medidas.salud === "critica";
}

export function esFundamental(modalidad: ModalidadAlmacen): boolean {
  return modalidad === "cerebro-completo" || modalidad === "parte" || modalidad === "respaldo-vivo";
}

/* ------------------------------------------------------------------ */
/* Sugerencia de acomodo (ruta)                                       */
/* ------------------------------------------------------------------ */

const RUTAS_POR_MODALIDAD: Record<ModalidadAlmacen, { ruta: string; subcarpetas?: string[]; razon: string }> = {
  "cerebro-completo": { ruta: "/cerebros", subcarpetas: ["privado", "grupos"], razon: "cerebro completo vive en /cerebros" },
  parte: { ruta: "/cerebros", subcarpetas: ["privado", "grupos"], razon: "Partes de cerebros se organizan bajo /cerebros" },
  replica: { ruta: "/replicas", subcarpetas: [], razon: "Réplicas independientes en /replicas" },
  "respaldo-vivo": { ruta: "/respaldos", subcarpetas: ["vivos", "instantaneas"], razon: "Respaldos vivos en /respaldos con instantáneas" },
  "neurona-nodo": { ruta: "/publico", subcarpetas: ["ofertados"], razon: "Capacidad ofrecida a la malla en /publico" },
  secundario: { ruta: "/desarrollo", subcarpetas: ["caches", "compilaciones", "pesados"], razon: "Datos regenerables (cachés, builds) en /desarrollo" },
};

function formatearBytes(bytes: bigint): string {
  const gb = Number(bytes) / 1e9;
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  return `${gb.toFixed(1)} GB`;
}

export function sugerirAcomodo(almacen: Almacen, modalidad: ModalidadAlmacen): SugerenciaAcomodo {
  const config = RUTAS_POR_MODALIDAD[modalidad] ?? RUTAS_POR_MODALIDAD.parte;
  return {
    rutaSugerida: config.ruta,
    razon: config.razon,
    capacidadDisponibleBytes: almacen.medidas.libreBytes,
    capacidadDisponibleLegible: formatearBytes(almacen.medidas.libreBytes),
    subcarpetas: config.subcarpetas,
  };
}

/* ------------------------------------------------------------------ */
/* Configuración completa                                             */
/* ------------------------------------------------------------------ */

export function sugerirConfiguracionCompleta(almacen: Almacen): ConfiguracionSugerida {
  const modalidad = sugerirModalidad(almacen);
  const acomodo = sugerirAcomodo(almacen, modalidad.modalidad);
  const evaluacionSalud = evaluarSaludAlmacen(almacen);
  const aptitudes = modalidad.alternativas;

  const resumen =
    `Para «${almacen.nombre}» (${almacen.tipo}, ${formatearBytes(almacen.medidas.totalBytes)}, ` +
    `${almacen.medidas.velocidadLecturaMbps}/${almacen.medidas.velocidadEscrituraMbps} MB/s, salud ${almacen.medidas.salud}): ` +
    `se sugiere modalidad **${modalidad.modalidad}** (confianza ${modalidad.confianza}) en ${acomodo.rutaSugerida}. ` +
    evaluacionSalud.detalle;

  const avisos: string[] = [...modalidad.advertencias];

  // Aviso de regla de dos copias para extraíble (siempre, por riesgo de ser única copia)
  if (almacen.tipo === "extraible") {
    avisos.push(
      `Regla de dos copias: lo fundamental (cerebro-completo, parte, respaldo-vivo) necesita al menos dos copias en medios distintos. ` +
        `Este medio extraíble NO debe ser la única copia de datos importantes.`
    );
  }

  // Aviso si salud crítica
  if (evaluacionSalud.nivel === "critica") {
    avisos.push(`Salud crítica detectada. Priorice respaldo de datos antes de seguir usando este medio.`);
  }

  // Aviso si espacio muy justo
  const libreGB = Number(almacen.medidas.libreBytes) / 1e9;
  if (libreGB < 10) {
    avisos.push(`Espacio libre muy bajo (${libreGB.toFixed(1)} GB). Libere espacio antes de guardar datos nuevos.`);
  }

  return {
    modalidad,
    acomodo,
    evaluacionSalud,
    aptitudes,
    resumen,
    avisos,
  };
}