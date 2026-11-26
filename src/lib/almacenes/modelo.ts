/**
 * Modelo del almacén universal — StarSeed OS
 *
 * Un almacén es un medio con identidad estable (UUID del volumen + número de serie
 * del aparato; nunca la ruta de montaje, que cambia). Lo detecta la neurona donde
 * está conectado.
 *
 * Modalidades por almacén y por carpeta:
 *   - Cerebro completo: lleva un cerebro entero (privado o de grupo).
 *   - Parte de un cerebro: carpetas o capas concretas.
 *   - Réplica independiente: copia congelada en un momento.
 *   - Respaldo vivo: copia que se pone al día sola (tiempo real, al conectarse, programada o a mano).
 *   - Neurona o nodo almacén: ofrece capacidad a la malla (privada, de grupo, comunidad o pública).
 *   - Secundario: datos útiles pero regenerables (cachés, compilaciones, pesados del desarrollo).
 */

export const TipoAlmacen = {
  EXTRAIBLE: "extraible" as const,
  DISCO_INTERNO: "disco_interno" as const,
  RED: "red" as const,
  NUBE: "nube" as const,
  NEURONA: "neurona" as const,
  NODO: "nodo" as const,
} as const;

export type TipoAlmacen = (typeof TipoAlmacen)[keyof typeof TipoAlmacen];

export const ModalidadAlmacen = {
  CEREBRO_COMPLETO: "cerebro-completo" as const,
  PARTE: "parte" as const,
  REPLICA: "replica" as const,
  RESPALDO_VIVO: "respaldo-vivo" as const,
  NEURONA_NODO: "neurona-nodo" as const,
  SECUNDARIO: "secundario" as const,
} as const;

export type ModalidadAlmacen = (typeof ModalidadAlmacen)[keyof typeof ModalidadAlmacen];

export const ModalidadCarpeta = {
  CEREBRO_COMPLETO: "cerebro-completo" as const,
  PARTE: "parte" as const,
  REPLICA: "replica" as const,
  RESPALDO_VIVO: "respaldo-vivo" as const,
  NEURONA_NODO: "neurona-nodo" as const,
  SECUNDARIO: "secundario" as const,
} as const;

export type ModalidadCarpeta = (typeof ModalidadCarpeta)[keyof typeof ModalidadCarpeta];

export type SaludAlmacen = "excelente" | "buena" | "regular" | "critica" | "desconocida";

export interface MedidasAlmacen {
  totalBytes: bigint;
  libreBytes: bigint;
  velocidadLecturaMbps: number;
  velocidadEscrituraMbps: number;
  salud: SaludAlmacen;
  sistemaArchivos: string;
  enLinea: boolean;
  neuronaId: string;
}

export interface CarpetaModalidad {
  [ruta: string]: ModalidadCarpeta;
}

export interface Almacen {
  idVolumen: string;
  numeroSerie: string;
  tipo: TipoAlmacen;
  nombre: string;
  modalidad: ModalidadAlmacen;
  medidas: MedidasAlmacen;
  carpetas?: CarpetaModalidad;
  rutaMontaje?: string; // Solo informativa, NO es identidad
  fechaDeteccion: string;
  fechaUltimaConexion: string;
}

export interface ManifiestoAlmacen {
  versionFormato: number;
  idVolumen: string;
  numeroSerie: string;
  dueño: string;
  cerebros: string[];
  partes: Record<string, string>;
  cifrado: boolean;
  algoritmosCifrado: string[];
  fechaCreacion: string;
  fechaActualizacion: string;
}

export interface ValidacionManifiesto {
  valido: boolean;
  errores: string[];
}

const TIPOS_VALIDOS: readonly TipoAlmacen[] = Object.values(TipoAlmacen);
const MODALIDADES_VALIDAS: readonly ModalidadAlmacen[] = Object.values(ModalidadAlmacen);
export const VERSIONES_SOPORTADAS = [1] as const;
const CAMPOS_PROHIBIDOS = [
  "clavePrivada",
  "claveSecreta",
  "secretKey",
  "privateKey",
  "token",
  "contraseña",
  "password",
  "passphrase",
  "apiKey",
  "apiSecret",
  "refreshToken",
  "accessToken",
  "secret",
] as const;

export function esTipoAlmacenValido(tipo: string): tipo is TipoAlmacen {
  return TIPOS_VALIDOS.includes(tipo as TipoAlmacen);
}

export function esModalidadValida(modalidad: string): modalidad is ModalidadAlmacen {
  return MODALIDADES_VALIDAS.includes(modalidad as ModalidadAlmacen);
}

export function esModalidadCarpetaValida(modalidad: string): modalidad is ModalidadCarpeta {
  return MODALIDADES_VALIDAS.includes(modalidad as ModalidadCarpeta);
}

export function crearAlmacen(params: {
  idVolumen: string;
  numeroSerie: string;
  tipo: TipoAlmacen;
  nombre: string;
  modalidad: ModalidadAlmacen;
  medidas: MedidasAlmacen;
  carpetas?: CarpetaModalidad;
  rutaMontaje?: string;
}): Almacen {
  if (!esTipoAlmacenValido(params.tipo)) {
    throw new Error(`Tipo de almacén inválido: ${params.tipo}`);
  }
  if (!esModalidadValida(params.modalidad)) {
    throw new Error(`Modalidad de almacén inválida: ${params.modalidad}`);
  }
  if (params.carpetas) {
    for (const [ruta, modalidad] of Object.entries(params.carpetas)) {
      if (!esModalidadCarpetaValida(modalidad)) {
        throw new Error(`Modalidad inválida para carpeta ${ruta}: ${modalidad}`);
      }
    }
  }

  const ahora = new Date().toISOString();
  return {
    idVolumen: params.idVolumen,
    numeroSerie: params.numeroSerie,
    tipo: params.tipo,
    nombre: params.nombre,
    modalidad: params.modalidad,
    medidas: params.medidas,
    carpetas: params.carpetas,
    rutaMontaje: params.rutaMontaje,
    fechaDeteccion: ahora,
    fechaUltimaConexion: ahora,
  };
}

export function validarManifiestoAlmacen(manifiesto: unknown): ValidacionManifiesto {
  const errores: string[] = [];

  if (!manifiesto || typeof manifiesto !== "object") {
    return { valido: false, errores: ["El manifiesto debe ser un objeto"] };
  }

  const m = manifiesto as Record<string, unknown>;

  // Campos obligatorios
  const camposObligatorios = [
    "versionFormato",
    "idVolumen",
    "numeroSerie",
    "dueño",
    "cerebros",
    "partes",
    "cifrado",
    "algoritmosCifrado",
    "fechaCreacion",
    "fechaActualizacion",
  ] as const;

  for (const campo of camposObligatorios) {
    if (!(campo in m)) {
      errores.push(`Campo obligatorio faltante: ${campo}`);
    }
  }

  // Validar versión de formato
  if (typeof m.versionFormato === "number") {
    if (!VERSIONES_SOPORTADAS.includes(m.versionFormato as 1)) {
      errores.push(`versión de formato no soportada: ${m.versionFormato}. versiones soportadas: ${VERSIONES_SOPORTADAS.join(", ")}`);
    }
  } else {
    errores.push("versionFormato debe ser un número");
  }

  // Validar campos de tipo string
  const camposString = ["idVolumen", "numeroSerie", "dueño", "fechaCreacion", "fechaActualizacion"] as const;
  for (const campo of camposString) {
    if (typeof m[campo] !== "string" || (m[campo] as string).trim() === "") {
      errores.push(`Campo ${campo} debe ser una cadena no vacía`);
    }
  }

  // Validar arrays
  if (!Array.isArray(m.cerebros)) {
    errores.push("cerebros debe ser un array");
  } else if (!m.cerebros.every((x: unknown) => typeof x === "string")) {
    errores.push("todos los elementos de cerebros deben ser cadenas");
  }

  if (!Array.isArray(m.algoritmosCifrado)) {
    errores.push("algoritmosCifrado debe ser un array");
  } else if (!m.algoritmosCifrado.every((x: unknown) => typeof x === "string")) {
    errores.push("todos los elementos de algoritmosCifrado deben ser cadenas");
  }

  // Validar partes (objeto con rutas -> cerebroId)
  if (m.partes && typeof m.partes === "object" && !Array.isArray(m.partes)) {
    for (const [ruta, cerebroId] of Object.entries(m.partes as Record<string, unknown>)) {
      if (typeof cerebroId !== "string") {
        errores.push(`En partes, la ruta "${ruta}" debe mapear a un string (cerebroId)`);
      }
    }
  } else {
    errores.push("partes debe ser un objeto");
  }

  // Validar cifrado (boolean)
  if (typeof m.cifrado !== "boolean") {
    errores.push("cifrado debe ser un booleano");
  }

  // Validar campos prohibidos (secretos)
  for (const campoProhibido of CAMPOS_PROHIBIDOS) {
    if (campoProhibido in m) {
      errores.push(`campo prohibido (contiene secreto): ${campoProhibido}`);
    }
  }

  // Validar que no hay campos extra con nombres sospechosos
  const claves = Object.keys(m);
  for (const clave of claves) {
    const claveLower = clave.toLowerCase();
    if (
      claveLower.includes("secret") ||
      claveLower.includes("password") ||
      claveLower.includes("token") ||
      claveLower.includes("key") ||
      claveLower.includes("credential") ||
      claveLower.includes("private")
    ) {
      if (!CAMPOS_PROHIBIDOS.includes(clave as (typeof CAMPOS_PROHIBIDOS)[number])) {
        errores.push(`Campo sospechoso (posible secreto): ${clave}`);
      }
    }
  }

  return {
    valido: errores.length === 0,
    errores,
  };
}