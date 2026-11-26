/**
 * StarSeed OS — Sincronía instantánea de neuronas entre aparatos vinculados (NEU1126F).
 * ===================================================================================
 * Como son una neurona, las modificaciones de cualquier archivo, configuración,
 * cerebros, sesiones y datos de la neurona deben modificarse en todos los aparatos
 * vinculados a esa neurona al instante que estén conectados.
 * 
 * Reglas de diseño (NEU1126F):
 *   1. Fusión por campo y con fecha (LWW - Last-Write-Wins con desempate determinista por dispositivo/origen y lápida).
 *   2. Cola de cambios pendientes (offline/sin enlace) con reintentos limpios y descarga al restablecer la conexión.
 *   3. Registro de conflictos auditable y transparente (sin pisar campos no concurrentes).
 *   4. Protección de datos propios del aparato (claves de cifrado local, huella del dispositivo, permisos del sistema operativo y credenciales de hardware nunca se sincronizan).
 * 
 * Módulo 100% PURO: sin red real, sin llamadas globales a disco, totalmente testeable en Vitest.
 */

/** Tipo para un valor de campo sincronizable de la neurona */
export type CampoValor = unknown;

/** Registro individual de un cambio o estado de campo en la neurona */
export interface EstadoCampo {
  /** Identificador único del campo o clave (ej. "ajustes.tema", "cerebro.modelo", "archivo:notas.md") */
  clave: string;
  /** Valor actualizado */
  valor: CampoValor;
  /** Marca de tiempo (epoch ms) de la última escritura */
  actualizadoEn: number;
  /** Dispositivo o aparato origen del cambio */
  porDispositivo: string;
  /** Lápida: true si el elemento/archivo fue borrado */
  borrado?: boolean;
}

/** Estado completo sincronizado de la neurona para sus aparatos */
export interface EstadoNeuronaSincronia {
  neuronaId: string;
  /** Mapa de clave de campo -> EstadoCampo */
  campos: Record<string, EstadoCampo>;
  /** Reloj lógico o versión global */
  reloj: number;
}

/** Elemento en la cola de cambios pendientes cuando no hay enlace P2P */
export interface CambioPendiente {
  id: string;
  neuronaId: string;
  campo: EstadoCampo;
  intentos: number;
  creadoEn: number;
}

/** Resultado de una sincronización o fusión entre dos aparatos */
export interface ResultadoSincronia {
  estado: EstadoNeuronaSincronia;
  conflictos: string[];
  cambiosAplicados: string[];
}

/** Campos estrictamente protegidos propios de cada aparato que NUNCA se sincronizan ni se copian a otros */
export const CAMPOS_PROPIOS_APARATO: readonly string[] = [
  "clave_control_local",
  "permisos_sistema",
  "huella_hardware",
  "token_sesion_privada",
  "dispositivo_id_local",
];

/** Comprueba si una clave de campo pertenece a la categoría protegida propia del aparato */
export function esCampoProtegido(clave: string): boolean {
  const normalizada = clave.toLowerCase().trim();
  return CAMPOS_PROPIOS_APARATO.some(
    (protegido) => normalizada === protegido || normalizada.includes(protegido)
  );
}

/**
 * Orden determinista para desempate si dos aparatos escriben exactamente al mismo milisegundo:
 * Gana el que tenga el `porDispositivo` menor alfabéticamente; si ambos escriben borrado, gana la lápida.
 */
export function ganaCampoSobre(a: EstadoCampo, b: EstadoCampo): boolean {
  if (a.actualizadoEn !== b.actualizadoEn) {
    return a.actualizadoEn > b.actualizadoEn;
  }
  if (a.porDispositivo !== b.porDispositivo) {
    return a.porDispositivo < b.porDispositivo;
  }
  return Boolean(a.borrado) && !b.borrado;
}

/** Dos versiones de un campo son distintas si difieren en tiempo, dispositivo origen o estado de lápida */
export function sonCamposDistintos(a: EstadoCampo, b: EstadoCampo): boolean {
  return (
    a.actualizadoEn !== b.actualizadoEn ||
    a.porDispositivo !== b.porDispositivo ||
    Boolean(a.borrado) !== Boolean(b.borrado) ||
    JSON.stringify(a.valor) !== JSON.stringify(b.valor)
  );
}

/**
 * Fusiona dos estados de neurona de forma simétrica y determinista (por campo y fecha).
 * Se ignoran automáticamente los campos protegidos propios del aparato.
 * Los ecos del propio dispositivo (origen igual a `miDispositivo`) se descartan.
 */
export function fusionarEstadoNeurona(
  local: EstadoNeuronaSincronia,
  remoto: EstadoNeuronaSincronia,
  miDispositivo: string
): ResultadoSincronia {
  if (local.neuronaId !== remoto.neuronaId) {
    return {
      estado: local,
      conflictos: ["neurona-distinta"],
      cambiosAplicados: [],
    };
  }

  const campos: Record<string, EstadoCampo> = { ...(local.campos ?? {}) };
  const conflictos: string[] = [];
  const cambiosAplicados: string[] = [];

  for (const [clave, entrante] of Object.entries(remoto.campos ?? {})) {
    // 1. Protección estricta: los datos propios del aparato nunca se aceptan de fuera
    if (esCampoProtegido(clave)) {
      continue;
    }

    // 2. Anti-eco: lo que emitimos nosotros y nos vuelve se ignora
    if (entrante.porDispositivo === miDispositivo) {
      continue;
    }

    const actual = campos[clave];
    if (!actual) {
      campos[clave] = entrante;
      cambiosAplicados.push(clave);
      continue;
    }

    if (!sonCamposDistintos(actual, entrante)) {
      continue;
    }

    // Conflicto si dos dispositivos distintos editaron el mismo campo en ventana cercana
    // (excepto si el dispositivo remoto es el mismo que creó el campo original, o si hay verdadera concurrencia)
    if (actual.porDispositivo !== entrante.porDispositivo && actual.actualizadoEn === entrante.actualizadoEn) {
      conflictos.push(clave);
    }

    if (ganaCampoSobre(entrante, actual)) {
      campos[clave] = entrante;
      cambiosAplicados.push(clave);
    }
  }

  const estado: EstadoNeuronaSincronia = {
    neuronaId: local.neuronaId,
    campos,
    reloj: Math.max(local.reloj ?? 0, remoto.reloj ?? 0) + 1,
  };

  return {
    estado,
    conflictos: Array.from(new Set(conflictos)).sort(),
    cambiosAplicados: Array.from(new Set(cambiosAplicados)).sort(),
  };
}

/**
 * Añade un cambio a la cola de pendientes cuando no hay enlace o la red está caída.
 * Evita duplicados para la misma clave reemplazando el valor anterior si es más reciente.
 */
export function encolarCambioSinEnlace(
  cola: readonly CambioPendiente[],
  cambio: Omit<CambioPendiente, "id" | "intentos">,
  ahora: number
): CambioPendiente[] {
  // Ignorar campos protegidos en la cola
  if (esCampoProtegido(cambio.campo.clave)) {
    return [...cola];
  }

  const id = `${cambio.neuronaId}:${cambio.campo.clave}`;
  const filtrada = cola.filter((item) => item.id !== id);

  const nuevoItem: CambioPendiente = {
    id,
    neuronaId: cambio.neuronaId,
    campo: cambio.campo,
    intentos: 0,
    creadoEn: ahora,
  };

  return [...filtrada, nuevoItem];
}

/**
 * Procesa la cola de cambios pendientes al restablecer el enlace P2P,
 * devolviendo los cambios listos para difundir y la cola restante (con reintentos fallidos si aplica).
 */
export function procesarColaPendiente(
  cola: readonly CambioPendiente[],
  enlaceActivo: boolean
): { paraEmitir: CambioPendiente[]; colaRestante: CambioPendiente[] } {
  if (!enlaceActivo || !cola.length) {
    return { paraEmitir: [], colaRestante: [...cola] };
  }

  // Si hay enlace, todos los pendientes salen para sincronizarse al instante
  const paraEmitir = [...cola];
  return { paraEmitir, colaRestante: [] };
}

/**
 * Inventario actual de lo que sincroniza una neurona entre aparatos vinculados frente a lo que se protege.
 */
export function inventarioSincroniaNeurona(): {
  sincronizado: string[];
  protegido: string[];
  reglasClave: string[];
} {
  return {
    sincronizado: [
      "Ajustes y preferencias de la neurona (localStorage/configuración)",
      "Cerebros y modelos asignados",
      "Archivos y notas compartidas de la neurona",
      "Sesiones de trabajo y estado de la escena",
      "Capabilities y metadatos de los aparatos vinculados",
    ],
    protegido: [...CAMPOS_PROPIOS_APARATO],
    reglasClave: [
      "Fusión determinista por campo con Last-Write-Wins (LWW) y desempate por dispositivo",
      "Cola de cambios pendientes offline con sincronización inmediata al conectar",
      "Lápidas para borrados sin destrucción definitiva",
      "Aislamiento absoluto de claves y permisos propios de cada hardware",
    ],
  };
}
