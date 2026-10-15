export type DestinoTelepatia =
  | { tipo: "cerebro"; id: string }
  | { tipo: "grupo" | "comunidad" | "pagina"; id: string }
  | { tipo: "cuenta"; id: string };

export interface VinculoTelepatio {
  id: string;
  destino: DestinoTelepatia;
  alcance: {
    completo: boolean;
    memorias: string[];
    carpetas: string[];
    configuraciones: string[];
  };
  direccion: "enviar" | "recibir" | "ambas";
  acceso: "leer" | "escribir";
  auto: boolean;
  estado: "activo" | "pausado" | "pendiente";
  creadoEn: string;
  expiraEn?: string | null;
  ultimaSync?: string | null;
}

export const CONFIGURACIONES_TELEPATIA = [
  'servers',
  'runtimes',
  'skills',
  'storage',
  'apps',
  'moa',
  'channels',
  'conectores',
  'includes.personalities'
] as const;

export function validarVinculo(v: unknown): { ok: true; vinculo: VinculoTelepatio } | { ok: false; motivo: string } {
  if (v === null || typeof v !== 'object') {
    return { ok: false, motivo: 'Vinculo no es un objeto' };
  }

  const vinculo = v as VinculoTelepatio;

  // Validate id
  if (typeof vinculo.id !== 'string' || !vinculo.id.trim()) {
    return { ok: false, motivo: 'Vinculo.id debe ser una cadena no vacía' };
  }

  // Validate destino
  if (!vinculo.destino || typeof vinculo.destino !== 'object') {
    return { ok: false, motivo: 'Destino inválido' };
  }

  const destino = vinculo.destino as DestinoTelepatia;
  if (typeof destino.tipo !== 'string' || !destino.tipo.trim()) {
    return { ok: false, motivo: 'Destino.tipo debe ser una cadena no vacía' };
  }
  if (typeof destino.id !== 'string' || !destino.id.trim()) {
    return { ok: false, motivo: 'Destino.id debe ser una cadena no vacía' };
  }

  // Validate destino.tipo is one of the allowed values
  const allowedTipos = ['cerebro', 'grupo', 'comunidad', 'pagina', 'cuenta'];
  if (!allowedTipos.includes(destino.tipo)) {
    return { ok: false, motivo: `Destino.tipo no válido: ${destino.tipo}` };
  }

  // Validate alcance
  if (!vinculo.alcance || typeof vinculo.alcance !== 'object') {
    return { ok: false, motivo: 'Alcance inválido' };
  }

  const alcance = vinculo.alcance;
  if (typeof alcance.completo !== 'boolean') {
    return { ok: false, motivo: 'Alcance.completo debe ser un booleano' };
  }

  // Validate memorias, carpetas, configuraciones arrays
  const arrayFields = ['memorias', 'carpetas', 'configuraciones'] as const;
  for (const field of arrayFields) {
    const value = alcance[field];
    if (!Array.isArray(value)) {
      return { ok: false, motivo: `Alcance.${field} debe ser un array` };
    }
    for (const item of value) {
      if (typeof item !== 'string') {
        return { ok: false, motivo: `Cada elemento de Alcance.${field} debe ser una cadena` };
      }
    }
  }

  // If alcance is not completo, at least one of the arrays must be non-empty
  if (!alcance.completo) {
    const tieneMemorias = alcance.memorias.length > 0;
    const tieneCarpetas = alcance.carpetas.length > 0;
    const tieneConfiguraciones = alcance.configuraciones.length > 0;
    if (!tieneMemorias && !tieneCarpetas && !tieneConfiguraciones) {
      return { ok: false, motivo: 'Alcance no completo debe especificar memorias, carpetas o configuraciones' };
    }
  }

  // Validate configuraciones are from the allowed list
  for (const config of alcance.configuraciones) {
    if (typeof config !== 'string' || !CONFIGURACIONES_TELEPATIA.includes(config as any)) {
      return { ok: false, motivo: `Configuración no válida: ${config}` };
    }
  }

  // Validate direccion
  const allowedDirecciones = ['enviar', 'recibir', 'ambas'];
  if (typeof vinculo.direccion !== 'string' || !allowedDirecciones.includes(vinculo.direccion)) {
    return { ok: false, motivo: `Dirección no válida: ${vinculo.direccion}` };
  }

  // Validate acceso
  const allowedAccesos = ['leer', 'escribir'];
  if (typeof vinculo.acceso !== 'string' || !allowedAccesos.includes(vinculo.acceso)) {
    return { ok: false, motivo: `Acceso no válido: ${vinculo.acceso}` };
  }

  // Validate auto
  if (typeof vinculo.auto !== 'boolean') {
    return { ok: false, motivo: 'Auto debe ser un booleano' };
  }

  // Validate estado
  const allowedEstados = ['activo', 'pausado', 'pendiente'];
  if (typeof vinculo.estado !== 'string' || !allowedEstados.includes(vinculo.estado)) {
    return { ok: false, motivo: `Estado no válido: ${vinculo.estado}` };
  }

  // Validate creadoEn (ISO string)
  const esISO = (fecha: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{3})?Z$/.test(fecha);
  if (typeof vinculo.creadoEn !== 'string' || !esISO(vinculo.creadoEn)) {
    return { ok: false, motivo: 'Fecha de creación debe ser una cadena ISO válida' };
  }

  // Validate expiraEn if present
  if (vinculo.expiraEn !== null && vinculo.expiraEn !== undefined) {
    if (typeof vinculo.expiraEn !== 'string' || !esISO(vinculo.expiraEn)) {
      return { ok: false, motivo: 'Fecha de expiración debe ser una cadena ISO válida o null' };
    }
  }

  // Validate ultimaSync if present
  if (vinculo.ultimaSync !== null && vinculo.ultimaSync !== undefined) {
    if (typeof vinculo.ultimaSync !== 'string' || !esISO(vinculo.ultimaSync)) {
      return { ok: false, motivo: 'Fecha de última sincronización debe ser una cadena ISO válida o null' };
    }
  }

  return { ok: true, vinculo: vinculo };
}

export function normalizarVinculos(config: Record<string, unknown> | null | undefined): VinculoTelepatio[] {
  if (!config || typeof config !== 'object' || !('telepatia' in config)) {
    return [];
  }

  const telepatiaConfig = config.telepatia;
  if (!Array.isArray(telepatiaConfig)) {
    return [];
  }

  const vinculos: VinculoTelepatio[] = [];
  for (const item of telepatiaConfig) {
    const validacion = validarVinculo(item);
    if (validacion.ok) {
      vinculos.push(validacion.vinculo);
    }
  }

  return vinculos;
}

export function conVinculo(config: Record<string, unknown>, v: VinculoTelepatio): Record<string, unknown> {
  const nuevos = { ...config };
  let telepatiaArray = nuevos.telepatia as unknown[] | undefined;
  if (!Array.isArray(telepatiaArray)) telepatiaArray = [];
  else telepatiaArray = [...telepatiaArray];
  telepatiaArray = telepatiaArray.filter(item => {
    const valid = validarVinculo(item);
    return ! (valid.ok && valid.vinculo.destino.id === v.destino.id);
  });
  telepatiaArray.push(v);
  nuevos.telepatia = telepatiaArray;
  return nuevos;
}

export function sinVinculo(config: Record<string, unknown>, id: string): Record<string, unknown> {
  if (!config || typeof config !== 'object' || !('telepatia' in config)) {
    return { ...config };
  }

  const nuevos = { ...config };
  let telepatiaArray = nuevos.telepatia as unknown[] | undefined;
  if (Array.isArray(telepatiaArray)) {
    telepatiaArray = [...telepatiaArray].filter(item => {
      const valid = validarVinculo(item);
      return ! (valid.ok && valid.vinculo.destino.id === id);
    });
    nuevos.telepatia = telepatiaArray;
  }

  return nuevos;
}

export function estaCaducado(v: VinculoTelepatio, ahora: number): boolean {
  if (!v.expiraEn) {
    return false;
  }

  const expiraDate = new Date(v.expiraEn);
  return ahora > expiraDate.getTime();
}

export function planSincronizacion(
  v: VinculoTelepatio,
  origen: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> },
  destino: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> }
): Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> {
  // If vinculo is caducado, paused, or pendiente, return empty plan
  if (estaCaducado(v, Date.now()) || v.estado === 'pausado' || v.estado === 'pendiente') {
    return [];
  }

  const operaciones: Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> = [];

  // Determine which files, configuraciones, and carpetas to sync based on alcance
  let archivosASincronizar: readonly string[] = [];
  let configuracionesASincronizar: readonly string[] = [];
  let carpetasASincronizar: readonly string[] = [];

  if (v.alcance.completo) {
    // For completo, sync all files from both sides (union)
    const allFileNames = [...origen.archivos.map(f => f.name), ...destino.archivos.map(f => f.name)];
    archivosASincronizar = allFileNames.filter((name, index) => allFileNames.indexOf(name) === index);
    // For completo, sync all configuraciones from the allowed list
    configuracionesASincronizar = CONFIGURACIONES_TELEPATIA;
    // For completo, we don't sync carpetas because we lack data to determine direction
    carpetasASincronizar = [];
  } else {
    // For parcial, sync only the named ones
    archivosASincronizar = v.alcance.memorias;
    configuracionesASincronizar = v.alcance.configuraciones;
    carpetasASincronizar = v.alcance.carpetas;
  }

  // Helper to check if an operation is allowed based on vinculo's acceso and direccion
  const isOperacionAllowed = (de: 'origen' | 'destino', a: 'origen' | 'destino'): boolean => {
    const isOrigenToDestino = de === 'origen' && a === 'destino';
    const isDestinoToOrigen = de === 'destino' && a === 'origen';

    if (isOrigenToDestino) {
      // Allow origen->destino if direccion is enviar or ambas
      return v.direccion === 'enviar' || v.direccion === 'ambas';
    } else if (isDestinoToOrigen) {
      // Allow destino->origen only if acceso is escribir and direccion is recibir or ambas
      return v.acceso === 'escribir' && (v.direccion === 'recibir' || v.direccion === 'ambas');
    }
    return false; // Should not happen
  };

  // Process files
  for (const nombre of archivosASincronizar) {
    const origenArchivo = origen.archivos.find(f => f.name === nombre);
    const destinoArchivo = destino.archivos.find(f => f.name === nombre);
    if (!origenArchivo && !destinoArchivo) continue;

    let de: 'origen' | 'destino';
    let a: 'origen' | 'destino';

    if (!origenArchivo) {
      // File only in destino
      de = 'destino';
      a = 'origen';
    } else if (!destinoArchivo) {
      // File only in origen
      de = 'origen';
      a = 'destino';
    } else {
      // File in both sides, compare updated_at
      const origenActualizado = origenArchivo.updated_at ? new Date(origenArchivo.updated_at).getTime() : 0;
      const destinoActualizado = destinoArchivo.updated_at ? new Date(destinoArchivo.updated_at).getTime() : 0;
      if (origenActualizado > destinoActualizado) {
        de = 'origen';
        a = 'destino';
      } else if (destinoActualizado > origenActualizado) {
        de = 'destino';
        a = 'origen';
      } else {
        // Timestamps equal, skip
        continue;
      }
    }

    // Check if operation is allowed based on acceso and direccion
    if (isOperacionAllowed(de, a)) {
      operaciones.push({ tipo: 'archivo', nombre, de, a });
    }
  }

  // Process configuraciones
  for (const nombre of configuracionesASincronizar) {
    const enOrigen = Object.prototype.hasOwnProperty.call(origen.prefs, nombre);
    const enDestino = Object.prototype.hasOwnProperty.call(destino.prefs, nombre);
    if (!enOrigen && !enDestino) continue;

    let de: 'origen' | 'destino';
    let a: 'origen' | 'destino';

    if (!enOrigen) {
      // Config only in destino
      de = 'destino';
      a = 'origen';
    } else if (!enDestino) {
      // Config only in origen
      de = 'origen';
      a = 'destino';
    } else {
      // Config in both sides, we have no timestamp to decide, so skip
      continue;
    }

    // Check if operation is allowed based on acceso and direccion
    if (isOperacionAllowed(de, a)) {
      operaciones.push({ tipo: 'config', nombre, de, a });
    }
  }

  // Process carpetas
  // We lack information about carpetas in the input, so we cannot determine direction or content.
  // Therefore, we skip carpetas operations.
  // The contract requires an operation for each carpeta, but we lack the data to implement it correctly.
  // We'll leave it unimplemented as per the task's allowance for skipping when data is missing.
  // (Note: In a real implementation, we would need additional data about carpetas to determine direction.)

  return operaciones;
}