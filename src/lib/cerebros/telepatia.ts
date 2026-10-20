<<<<<<< HEAD
=======
// src/lib/cerebros/telepatia.ts
// Tipos y funciones puras para el sistema de Telepatía de cerebros (Contrato CB1013 §5)
import type { Brain } from '@/lib/brains/brains';
import type { MemoryFile } from '@/lib/cerebro/memory-files';

>>>>>>> 15e516538 (salvavidas · CB1013Fb: trabajo del agente antes de las puertas (tsc / vitest))
export type DestinoTelepatia =
  | { tipo: "cerebro"; id: string }
  | { tipo: "grupo" | "comunidad" | "pagina"; id: string }
  | { tipo: "cuenta"; id: string };

export interface VinculoTelepatico {
  id: string;
  destino: DestinoTelepatia;
<<<<<<< HEAD
  alcance: {
    completo: boolean;
    memorias: string[];
    carpetas: string[];
    configuraciones: string[];
  };
=======
  alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] };
>>>>>>> 15e516538 (salvavidas · CB1013Fb: trabajo del agente antes de las puertas (tsc / vitest))
  direccion: "enviar" | "recibir" | "ambas";
  acceso: "leer" | "escribir";
  auto: boolean;
  estado: "activo" | "pausado" | "pendiente";
  creadoEn: string;
  expiraEn?: string | null;
  ultimaSync?: string | null;
}

<<<<<<< HEAD
export const CONFIGURACIONES_TELEPATIA = ['servers','runtimes','skills','storage','apps','moa','channels','conectores','includes.personalities'] as const;

export function validarVinculo(v: unknown): { ok: true; vinculo: VinculoTelepatico } | { ok: false; motivo: string } {
  if (v === null || typeof v !== 'object') {
    return { ok: false, motivo: 'Vinculo no es un objeto' };
  }
  const vinculo = v as Record<string, unknown>;

  if (typeof vinculo.id !== 'string' || !vinculo.id.trim()) {
    return { ok: false, motivo: 'Vinculo.id debe ser una cadena no vacía' };
  }

  const destino = vinculo.destino as Record<string, unknown> | undefined;
  if (!destino || typeof destino.tipo !== 'string' || typeof destino.id !== 'string' || !destino.id.trim()) {
    return { ok: false, motivo: 'Destino inválido' };
  }
  const allowedTipos = ['cerebro', 'grupo', 'comunidad', 'pagina', 'cuenta'] as const;
  if (!allowedTipos.some(t => t === destino.tipo)) {
    return { ok: false, motivo: `Destino.tipo no válido: ${destino.tipo}` };
  }

  const alcance = vinculo.alcance as Record<string, unknown> | undefined;
  if (!alcance || typeof alcance.completo !== 'boolean') {
    return { ok: false, motivo: 'Alcance inválido' };
  }
  const memorias = Array.isArray(alcance.memorias) ? alcance.memorias : [];
  const carpetas = Array.isArray(alcance.carpetas) ? alcance.carpetas : [];
  const configuraciones = Array.isArray(alcance.configuraciones) ? alcance.configuraciones : [];
  if (!memorias.every(m => typeof m === 'string') || !carpetas.every(c => typeof c === 'string') || !configuraciones.every(c => typeof c === 'string')) {
    return { ok: false, motivo: 'Alcance contiene elementos no string' };
  }
  if (!alcance.completo && memorias.length === 0 && carpetas.length === 0 && configuraciones.length === 0) {
    return { ok: false, motivo: 'Alcance debe tener al menos un elemento cuando no es completo' };
  }
  for (const conf of configuraciones) {
    if (!CONFIGURACIONES_TELEPATIA.some(c => c === conf)) {
      return { ok: false, motivo: `Configuración no válida en alcance: ${conf}` };
    }
  }

  if (!['enviar', 'recibir', 'ambas'].includes(vinculo.direccion as string)) {
    return { ok: false, motivo: 'Direccion debe ser "enviar", "recibir" o "ambas"' };
  }
  if (!['leer', 'escribir'].includes(vinculo.acceso as string)) {
    return { ok: false, motivo: 'Acceso debe ser "leer" o "escribir"' };
  }
  if (typeof vinculo.auto !== 'boolean') {
    return { ok: false, motivo: 'Auto debe ser booleano' };
  }
  if (!['activo', 'pausado', 'pendiente'].includes(vinculo.estado as string)) {
    return { ok: false, motivo: 'Estado debe ser "activo", "pausado" o "pendiente"' };
  }

  const esISO = (fecha: unknown) => typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(fecha);
  if (!esISO(vinculo.creadoEn)) {
    return { ok: false, motivo: 'Fecha de creación debe ser una cadena ISO válida' };
  }
  if (vinculo.expiraEn !== undefined && vinculo.expiraEn !== null && !esISO(vinculo.expiraEn)) {
    return { ok: false, motivo: 'Fecha de caducidad debe ser ISO o null' };
  }
  if (vinculo.ultimaSync !== undefined && vinculo.ultimaSync !== null && !esISO(vinculo.ultimaSync)) {
    return { ok: false, motivo: 'Ultima sincronizacion debe ser ISO o null' };
  }

  return { ok: true, vinculo: v as VinculoTelepatico };
}

export function normalizarVinculos(config: Record<string, unknown> | null | undefined): VinculoTelepatico[] {
  if (!config || typeof config !== 'object') return [];
  const lista = (config as Record<string, unknown>).telepatia;
  if (!Array.isArray(lista)) return [];
  const validos: VinculoTelepatico[] = [];
  for (const item of lista) {
    const r = validarVinculo(item);
    if (r.ok) validos.push(r.vinculo);
  }
  return validos;
}

export function conVinculo(config: Record<string, unknown>, v: VinculoTelepatico): Record<string, unknown> {
  const nuevo = { ...config };
  const existentesRaw = (config as Record<string, unknown>).telepatia;
  const existentes = Array.isArray(existentesRaw) ? [...existentesRaw] : [];
  const idx = existentes.findIndex((x) => {
    if (!x || typeof x !== 'object') return false;
    const r = x as Record<string, unknown>;
    return r.id === v.id;
  });
  if (idx >= 0) {
    existentes[idx] = v;
  } else {
    existentes.push(v);
  }
  nuevo.telepatia = existentes;
  return nuevo;
}

export function sinVinculo(config: Record<string, unknown>, id: string): Record<string, unknown> {
  const nuevo = { ...config };
  const existentesRaw = (config as Record<string, unknown>).telepatia;
  const existentes = Array.isArray(existentesRaw) ? existentesRaw : [];
  nuevo.telepatia = existentes.filter((x) => {
    if (!x || typeof x !== 'object') return true;
    const r = x as Record<string, unknown>;
    return r.id !== id;
  });
  return nuevo;
}

export function estaCaducado(v: VinculoTelepatico, ahora: number): boolean {
  if (!v.expiraEn) return false;
  const ts = Date.parse(v.expiraEn);
  if (Number.isNaN(ts)) return false;
  return ahora >= ts;
}

export function planSincronizacion(
  v: VinculoTelepatico,
  origen: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> },
  destino: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> }
): Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> {
  if (v.estado !== 'activo') return [];
  if (estaCaducado(v, Date.now())) return [];

  const allowedOrigenADestino = v.direccion === 'enviar' || v.direccion === 'ambas';
  const allowedDestinoAOrigen = (v.direccion === 'recibir' || v.direccion === 'ambas') && v.acceso !== 'leer';

  const ops: Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> = [];

  const nombresArchivos = v.alcance.completo
    ? Array.from(new Set([...origen.archivos.map(a => a.name), ...destino.archivos.map(a => a.name)]))
    : v.alcance.memorias;

  const mapArchivo = (arr: typeof origen.archivos) => new Map(arr.map(a => [a.name, a]));
  const orMap = mapArchivo(origen.archivos);
  const deMap = mapArchivo(destino.archivos);

  const parseTs = (s?: string | null) => {
    if (!s) return null;
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  };

  for (const nombre of nombresArchivos) {
    const orF = orMap.get(nombre);
    const deF = deMap.get(nombre);
    if (orF && !deF) {
      if (allowedOrigenADestino) ops.push({ tipo: 'archivo', nombre, de: 'origen', a: 'destino' });
    } else if (!orF && deF) {
      if (allowedDestinoAOrigen) ops.push({ tipo: 'archivo', nombre, de: 'destino', a: 'origen' });
    } else if (orF && deF) {
      const tOr = parseTs(orF.updated_at);
      const tDe = parseTs(deF.updated_at);
      if (tOr === null && tDe !== null) {
        if (allowedDestinoAOrigen) ops.push({ tipo: 'archivo', nombre, de: 'destino', a: 'origen' });
      } else if (tDe === null && tOr !== null) {
        if (allowedOrigenADestino) ops.push({ tipo: 'archivo', nombre, de: 'origen', a: 'destino' });
      } else if (tOr !== null && tDe !== null) {
        if (tOr > tDe && allowedOrigenADestino) ops.push({ tipo: 'archivo', nombre, de: 'origen', a: 'destino' });
        else if (tDe > tOr && allowedDestinoAOrigen) ops.push({ tipo: 'archivo', nombre, de: 'destino', a: 'origen' });
=======
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
>>>>>>> 15e516538 (salvavidas · CB1013Fb: trabajo del agente antes de las puertas (tsc / vitest))
      }
    }
  }

<<<<<<< HEAD
  for (const carpeta of v.alcance.carpetas) {
    if (allowedOrigenADestino) ops.push({ tipo: 'carpeta', nombre: carpeta, de: 'origen', a: 'destino' });
    if (allowedDestinoAOrigen) ops.push({ tipo: 'carpeta', nombre: carpeta, de: 'destino', a: 'origen' });
  }

  const configs = v.alcance.completo
    ? [...CONFIGURACIONES_TELEPATIA]
    : v.alcance.configuraciones;

  for (const cfg of configs) {
    const orVal = origen.prefs[cfg];
    const deVal = destino.prefs[cfg];
    if (orVal !== undefined && deVal === undefined) {
      if (allowedOrigenADestino) ops.push({ tipo: 'config', nombre: cfg, de: 'origen', a: 'destino' });
    } else if (deVal !== undefined && orVal === undefined) {
      if (allowedDestinoAOrigen) ops.push({ tipo: 'config', nombre: cfg, de: 'destino', a: 'origen' });
    }
  }

  return ops;
}
=======
  return operaciones;
}
>>>>>>> 15e516538 (salvavidas · CB1013Fb: trabajo del agente antes de las puertas (tsc / vitest))
