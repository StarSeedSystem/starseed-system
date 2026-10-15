// src/lib/cerebros/telepatia.ts
// Tipos y funciones puras para el sistema de Telepatía de cerebros (Contrato CB1013 §5)
import type { Brain } from '@/lib/brains/brains';
import type { MemoryFile } from '@/lib/cerebro/memory-files';

export type DestinoTelepatia =
  | { tipo: "cerebro"; id: string }
  | { tipo: "grupo" | "comunidad" | "pagina"; id: string }
  | { tipo: "cuenta"; id: string };

export interface VinculoTelepatico {
  id: string;
  destino: DestinoTelepatia;
  alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] };
  direccion: "enviar" | "recibir" | "ambas";
  acceso: "leer" | "escribir";
  auto: boolean;
  estado: "activo" | "pausado" | "pendiente";
  creadoEn: string;
  expiraEn?: string | null;
  ultimaSync?: string | null;
}

/** Resultado de una operación de sincronización. */
export interface SincronizacionOperacion {
  tipo: 'archivo' | 'config';
  nombre: string;
  /** ID del cerebro de donde se copia la información */
  de: string;
  /** ID del cerebro al que se copia la información */
  a: string;
}

/**
 * Valida un vínculo telepatético.
 * Devuelve true si el vínculo es válido.
 */
export function validarVinculo(v: VinculoTelepatico): boolean {
  if (!v.id || typeof v.id !== 'string') return false;
  if (!v.destino || typeof v.destino !== 'object') return false;
  switch (v.destino.tipo) {
    case 'cerebro':
    case 'grupo':
    case 'comunidad':
    case 'pagina':
    case 'cuenta':
      if (!v.destino.id || typeof v.destino.id !== 'string') return false;
      break;
    default:
      return false;
  }
  if (!v.alcance || typeof v.alcance !== 'object') return false;
  if (typeof v.alcance.completo !== 'boolean') return false;
  if (!Array.isArray(v.alcance.memorias)) return false;
  if (!Array.isArray(v.alcance.carpetas)) return false;
  if (!Array.isArray(v.alcance.configuraciones)) return false;
  if (!v.direccion || !['enviar', 'recibir', 'ambas'].includes(v.direccion)) return false;
  if (!v.acceso || !['leer', 'escribir'].includes(v.acceso)) return false;
  if (typeof v.auto !== 'boolean') return false;
  if (!v.estado || !['activo', 'pausado', 'pendiente'].includes(v.estado)) return false;
  if (!v.creadoEn || typeof v.creadoEn !== 'string') return false;
  if (v.expiraEn !== null && v.expiraEn !== undefined && typeof v.expiraEn !== 'string') return false;
  if (v.ultimaSync !== null && v.ultimaSync !== undefined && typeof v.ultimaSync !== 'string') return false;
  return true;
}

/**
 * Normaliza un array de vínculos telepatéticos, filtrando los inválidos.
 * Devuelve un nuevo array con solo los vínculos válidos.
 */
export function normalizarVinculos(vinculos: VinculoTelepatico[]): VinculoTelepatico[] {
  return vinculos.filter(validarVinculo);
}

/**
 * Planifica la sincronización entre dos cerebros según un vínculo.
 * Devuelve las operaciones a realizar (sin ejecutarlas).
 * Respeta la dirección y el acceso del vínculo.
 * Nunca borra en el otro lado.
 */
export function planSincronizacion(
  vinculo: VinculoTelepatico,
  origen: Brain,
  destino: Brain,
  origenFiles: MemoryFile[],
  destinoFiles: MemoryFile[]
): SincronizacionOperacion[] {
  const operaciones: SincronizacionOperacion[] = [];

  // Determinar direcciones permitidas según acceso y dirección
  const pushAllowed = 
    (vinculo.direccion === 'enviar' || vinculo.direccion === 'ambas') && 
    vinculo.acceso === 'escribir';
  const pullAllowed = 
    (vinculo.direccion === 'recibir' || vinculo.direccion === 'ambas') && 
    vinculo.acceso === 'leer';

  // ---- Sincronización de archivos ----
  const alcanceMemorias = vinculo.alcance.completo 
    ? undefined // undefined significa todos
    : vinculo.alcance.memorias;

  // Función para obtener los archivos a considerar según el alcance
  const getFilesToConsider = (files: MemoryFile[], alcance: string[] | undefined): MemoryFile[] => {
    if (alcance === undefined) return files;
    return files.filter(f => alcance.includes(f.name));
  };

  const origenFilesConsidered = getFilesToConsider(origenFiles, alcanceMemorias);
  const destinoFilesConsidered = getFilesToConsider(destinoFiles, alcanceMemorias);

  // Crear mapas por nombre para búsqueda rápida
  const origenFileMap = new Map<string, MemoryFile>();
  origenFilesConsidered.forEach(f => origenFileMap.set(f.name, f));
  const destinoFileMap = new Map<string, MemoryFile>();
  destinoFilesConsidered.forEach(f => destinoFileMap.set(f.name, f));

  // Procesar cada archivo que aparece en alguno de los cerebros
  const allFileNames = new Set([...origenFileMap.keys(), ...destinoFileMap.keys()]);
  for (const nombre of allFileNames) {
    const origenFile = origenFileMap.get(nombre);
    const destinoFile = destinoFileMap.get(nombre);

    let sourceBrainId: string | null = null;
    let targetBrainId: string | null = null;

    if (origenFile && destinoFile) {
      // Existe en ambos: comparar updated_at
      if (origenFile.updated_at && destinoFile.updated_at) {
        if (origenFile.updated_at > destinoFile.updated_at) {
          // Origen es más nuevo
          if (pushAllowed) {
            sourceBrainId = origen.id;
            targetBrainId = destino.id;
          }
        } else if (destinoFile.updated_at > origenFile.updated_at) {
          // Destino es más nuevo
          if (pullAllowed) {
            sourceBrainId = destino.id;
            targetBrainId = origen.id;
          }
        }
        // Si son iguales, no hacemos nada
      }
    } else if (origenFile && !destinoFile) {
      // Solo en origen
      if (pushAllowed) {
        sourceBrainId = origen.id;
        targetBrainId = destino.id;
      }
    } else if (!origenFile && destinoFile) {
      // Solo en destino
      if (pullAllowed) {
        sourceBrainId = destino.id;
        targetBrainId = origen.id;
      }
    }

    if (sourceBrainId && targetBrainId) {
      operaciones.push({
        tipo: 'archivo',
        nombre,
        de: sourceBrainId,
        a: targetBrainId,
      });
    }
  }

  // ---- Sincronización de configuraciones ----
  // Lista de claves de configuración a considerar
  const configKeys = vinculo.alcance.completo
    ? ['servers', 'runtimes', 'skills', 'storage', 'apps', 'moa', 'channels', 'conectores', 'includes.personalities']
    : vinculo.alcance.configuraciones;

  // Usamos el updated_at del cerebro completo para decidir la dirección de copia por clave
  // Si el cerebro de origen es más reciente, copiamos sus configuraciones al destino (si pushAllowed)
  // Si el cerebro de destino es más reciente, copiamos sus configuraciones al origen (si pullAllowed)
  // Si son iguales, no copiamos ninguna configuración
  let configSourceBrain: Brain | null = null;
  let configTargetBrain: Brain | null = null;

  if (origen.updated_at && destino.updated_at) {
    if (origen.updated_at > destino.updated_at) {
      // Origen es más reciente
      if (pushAllowed) {
        configSourceBrain = origen;
        configTargetBrain = destino;
      }
    } else if (destino.updated_at > origen.updated_at) {
      // Destino es más reciente
      if (pullAllowed) {
        configSourceBrain = destino;
        configTargetBrain = origen;
      }
    }
    // Si son iguales, no copiamos configuraciones
  }

  if (configSourceBrain && configTargetBrain) {
    for (const key of configKeys) {
      // Solo copiamos si la clave existe en el cerebro de origen
      if (key in configSourceBrain.config) {
        operaciones.push({
          tipo: 'config',
          nombre: key,
          de: configSourceBrain.id,
          a: configTargetBrain.id,
        });
      }
    }
  }

  return operaciones;
}
