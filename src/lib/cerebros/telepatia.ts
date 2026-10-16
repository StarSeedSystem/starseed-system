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
  if (!allowedTipos.includes(destino.tipo as any)) {
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
    if (!CONFIGURACIONES_TELEPATIA.includes(conf as any)) {
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
  // TODO
  return [];
}

export function conVinculo(config: Record<string, unknown>, v: VinculoTelepatico): Record<string, unknown> {
  // TODO
  return config;
}

export function sinVinculo(config: Record<string, unknown>, id: string): Record<string, unknown> {
  // TODO
  return config;
}

export function estaCaducado(v: VinculoTelepatico, ahora: number): boolean {
  // TODO
  return false;
}

export function planSincronizacion(
  v: VinculoTelepatico,
  origen: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> },
  destino: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> }
): Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> {
  // TODO
  return [];
}