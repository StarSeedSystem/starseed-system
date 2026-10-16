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
  const vinculo = v as VinculoTelepatico;

  // Validate id
  if (typeof vinculo.id !== 'string' || !vinculo.id.trim()) {
    return { ok: false, motivo: 'Vinculo.id debe ser una cadena no vacía' };
  }

  // Validate destino
  if (!vinculo.destino || typeof vinculo.destino !== 'object') {
    return { ok: false, motivo: 'Destino inválido' };
  }
  const { tipo, id } = vinculo.destino;
  if (typeof tipo !== 'string' || !tipo.trim()) {
    return { ok: false, motivo: 'Destino.tipo debe ser una cadena no vacía' };
  }
  if (typeof id !== 'string' || !id.trim()) {
    return { ok: false, motivo: 'Destino.id debe ser una cadena no vacía' };
  }
  const allowedTipos = ['cerebro', 'grupo', 'comunidad', 'pagina', 'cuenta'];
  if (!allowedTipos.includes(tipo)) {
    return { ok: false, motivo: `Destino.tipo no válido: ${tipo}` };
  }
  // Additional constraints based on tipo
  if (tipo === 'cerebro' && tipo !== 'cerebro') {
    // This is redundant but included for clarity
    return { ok: false, motivo: 'Destino.tipo debe ser "cerebro" para este caso' };
  }
  if ((tipo === 'grupo' || tipo === 'comunidad' || tipo === 'pagina') && !(tipo === 'grupo' || tipo === 'comunidad' || tipo === 'pagina')) {
    return { ok: false, motivo: 'Destino.tipo debe ser "grupo", "comunidad" o "pagina"' };
  }
  if (tipo === 'cuenta' && tipo !== 'cuenta') {
    return { ok: false, motivo: 'Destino.tipo debe ser "cuenta"' };
  }

  // Validate alcance
  if (!vinculo.alcance || typeof vinculo.alcance !== 'object') {
    return { ok: false, motivo: 'Alcance inválido' };
  }
  const { completo, memorias, carpetas, configuraciones } = vinculo.alcance;
  if (typeof completo !== 'boolean') {
    return { ok: false, motivo: 'Alcance.completo debe ser booleano' };
  }
  if (!Array.isArray(memorias) || memorias.some(m => typeof m !== 'string')) {
    return { ok: false, motivo: 'Alcance.memorias debe ser un array de strings' };
  }
  if (!Array.isArray(carpetas) || carpetas.some(c => typeof c !== 'string')) {
    return { ok: false, motivo: 'Alcance.carpetas debe ser un array de strings' };
  }
  if (!Array.isArray(configuraciones) || configuraciones.some(c => typeof c !== 'string')) {
    return { ok: false, motivo: 'Alcance.configuraciones debe ser un array de strings' };
  }
  // Validate that configuraciones are from the allowed list
  for (const conf of configuraciones) {
    if (!CONFIGURACIONES_TELEPATIA.includes(conf as any)) {
      return { ok: false, motivo: `Configuración no válida en alcance: ${conf}` };
    }
  }

  // Validate direccion
  if (vinculo.direccion !== 'enviar' && vinculo.direccion !== 'recibir' && vinculo.direccion !== 'ambas') {
    return { ok: false, motivo: 'Direccion debe ser "enviar", "recibir" o "ambas"' };
  }

  // Validate acceso
  if (vinculo.acceso !== 'leer' && vinculo.acceso !== 'escribir') {
    return { ok: false, motivo: 'Acceso debe ser "leer" o "escribir"' };
  }

  // Validate auto
  if (typeof vinculo.auto !== 'boolean') {
    return { ok: false, motivo: 'Auto debe ser booleano' };
  }

  // Validate estado
  if (vinculo.estado !== 'activo' && vinculo.estado !== 'pausado' && vinculo.estado !== 'pendiente') {
    return { ok: false, motivo: 'Estado debe ser "activo", "pausado" o "pendiente"' };
  }

  // Validate creadoEn (ISO string)
  const esISO = (fecha: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{3})?Z$/.test(fecha);
  if (typeof vinculo.creadoEn !== 'string' || !esISO(vinculo.creadoEn)) {
    return { ok: false, motivo: 'Fecha de creación debe ser una cadena ISO válida' };
  }

  // Validate expiraEn (can be undefined, null, or ISO string)
  if (vinculo.expiraEn !== undefined && vinculo.expiraEn !== null) {
    if (typeof vinculo.expiraEn !== 'string' || !esISO(vinculo.expiraEn)) {
      return { ok: false, motivo: 'Fecha de caducidad debe ser una cadena ISO válida o null/undefined' };
    }
  }

  // Validate ultimaSync (can be undefined, null, or ISO string)
  if (vinculo.ultimaSync !== undefined && vinculo.ultimaSync !== null) {
    if (typeof vinculo.ultimaSync !== 'string' || !esISO(vinculo.ultimaSync)) {
      return { ok: false, motivo: 'Ultima sincronizacion debe ser una cadena ISO válida o null/undefined' };
    }
  }

  return { ok: true, vinculo: vinculo as VinculoTelepatico };
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