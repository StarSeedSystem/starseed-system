export type DestinoTelepatia =
  | { tipo: "cerebro"; id: string }
  | { tipo: "grupo" | "comunidad" | "pagina"; id: string }
  | { tipo: "cuenta"; id: string };

export interface VinculoTelepatico {
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
      }
    }
  }

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