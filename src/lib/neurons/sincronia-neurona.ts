/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SINCRONÍA DE NEURONA — P2P, campos con fecha y cola sin enlace.
 * ---------------------------------------------------------------------------
 * Implementa la sincronización completa de ajustes, cerebros y archivos entre
 * todos los aparatos vinculados a una neurona, con resolución por timestamp
 * (gana el más reciente sin pisar campos ajenos), cola de cambios sin enlace
 * y registro de conflictos. Protege las claves propias del aparato (control,
 * permisos de sistema, huella).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface RegistroCampoSync {
  valor: unknown;
  timestamp: number;
  aparatoId: string;
}

export interface EstadoNeuronaSync {
  neuronaId: string;
  aparatoId: string;
  campos: Record<string, RegistroCampoSync>;
  colaPendiente: Array<{
    id: string;
    campo: string;
    valor: unknown;
    timestamp: number;
    intentos: number;
  }>;
  conflictos: Array<{
    campo: string;
    valorLocal: unknown;
    valorRemoto: unknown;
    timestampLocal: number;
    timestampRemoto: number;
    resueltoEn: number;
  }>;
}

// Campos protegidos propios del aparato que nunca se sincronizan
export const CAMPOS_PROPIOS_APARATO = new Set([
  "aparatoId",
  "claveControl",
  "permisosSistema",
  "huella",
  "dispositivoId",
]);

/**
 * Crea un estado de sincronía inicial para una neurona y aparato.
 */
export function crearEstadoNeuronaSync(neuronaId: string, aparatoId: string): EstadoNeuronaSync {
  return {
    neuronaId,
    aparatoId,
    campos: {},
    colaPendiente: [],
    conflictos: [],
  };
}

/**
 * Fusiona campos remotos con el estado local aplicando la regla:
 * gana el timestamp más reciente, sin pisar campos que no vienen en el remoto
 * y protegiendo los campos propios del aparato.
 */
export function fusionarCamposNeurona(
  estadoLocal: EstadoNeuronaSync,
  camposRemotos: Record<string, RegistroCampoSync>,
  aparatoRemotoId: string
): EstadoNeuronaSync {
  const nuevosCampos = { ...estadoLocal.campos };
  const nuevosConflictos = [...estadoLocal.conflictos];

  for (const [campo, remoto] of Object.entries(camposRemotos)) {
    if (CAMPOS_PROPIOS_APARATO.has(campo)) {
      continue;
    }
    const local = nuevosCampos[campo];
    if (!local) {
      nuevosCampos[campo] = { ...remoto };
    } else {
      if (remoto.timestamp > local.timestamp) {
        nuevosCampos[campo] = { ...remoto };
      } else if (remoto.timestamp === local.timestamp && remoto.aparatoId !== local.aparatoId) {
        // Conflicto por timestamp idéntico de distintos aparatos: gana el de mayor id lexicográficamente
        if (remoto.aparatoId > local.aparatoId) {
          nuevosCampos[campo] = { ...remoto };
        }
        nuevosConflictos.push({
          campo,
          valorLocal: local.valor,
          valorRemoto: remoto.valor,
          timestampLocal: local.timestamp,
          timestampRemoto: remoto.timestamp,
          resueltoEn: Date.now(),
        });
      }
    }
  }

  return {
    ...estadoLocal,
    campos: nuevosCampos,
    conflictos: nuevosConflictos,
  };
}

/**
 * Añade un cambio a la cola pendiente cuando no hay enlace P2P activo.
 */
export function encolarCambioSinEnlace(
  estado: EstadoNeuronaSync,
  campo: string,
  valor: unknown,
  timestamp: number = Date.now()
): EstadoNeuronaSync {
  if (CAMPOS_PROPIOS_APARATO.has(campo)) {
    return estado;
  }

  const id = `${campo}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`;
  const nuevoCambio = {
    id,
    campo,
    valor,
    timestamp,
    intentos: 0,
  };

  return {
    ...estado,
    colaPendiente: [...estado.colaPendiente, nuevoCambio],
    campos: {
      ...estado.campos,
      [campo]: {
        valor,
        timestamp,
        aparatoId: estado.aparatoId,
      },
    },
  };
}

/**
 * Procesa la cola pendiente al restablecer el enlace.
 */
export function procesarColaSinEnlace(
  estado: EstadoNeuronaSync
): { estadoActualizado: EstadoNeuronaSync; cambiosAEmitir: Array<{ campo: string; valor: unknown; timestamp: number }> } {
  const cambiosAEmitir = estado.colaPendiente.map((c) => ({
    campo: c.campo,
    valor: c.valor,
    timestamp: c.timestamp,
  }));

  return {
    estadoActualizado: {
      ...estado,
      colaPendiente: [],
    },
    cambiosAEmitir,
  };
}
