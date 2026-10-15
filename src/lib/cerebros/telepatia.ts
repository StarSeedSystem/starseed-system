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

export function validarVinculo(v: unknown): { ok: true; vinculo: VinculoTelepatico } | { ok: false; motivo: string } {
  if (v === null || typeof v !== 'object') return { ok: false, motivo: 'Vinculo no es un objeto' };
  const vinculo = v as VinculoTelepatio;
  if (typeof vinculo.id !== 'string' || !vinculo.id.trim()) return { ok: false, motivo: 'Vinculo.id debe ser una cadena no vacía' };
  if (!vinculo.destino || typeof vinculo.destino !== 'object') return { ok: false, motivo: 'Destino inválido' };
  const { tipo, id } = vinculo.destino;
  if (typeof tipo !== 'string' || !tipo.trim() || !['cerebro', 'grupo', 'comunidad', 'pagina', 'cuenta'].includes(tipo)) return { ok: false, motivo: 'Destino.tipo inválido' };
  if (typeof id !== 'string' || !id.trim()) return { ok: false, motivo: 'Destino.id debe ser una cadena no vacía' };
  if (typeof vinculo.alcance !== 'object' || vinculo.alcance === null) return { ok: false, motivo: 'Alcance debe ser un objeto' };
  const { completo, memorias, carpetas, configuraciones } = vinculo.alcance;
  if (typeof completo !== 'boolean') return { ok: false, motivo: 'Alcance.completo debe ser un booleano' };
  if (!Array.isArray(memorias)) return { ok: false, motivo: 'Alcance.memorias debe ser un array' };
  if (!Array.isArray(carpetas)) return { ok: false, motivo: 'Alcance.carpetas debe ser un array' };
  if (!Array.isArray(configuraciones)) return { ok: false, motivo: 'Alcance.configuraciones debe ser un array' };
  memorias.forEach(m => { if (typeof m !== 'string') return { ok: false, motivo: 'Alcance.memorias debe contener solo cadenas' }; });
  carpetas.forEach(c => { if (typeof c !== 'string') return { ok: false, motivo: 'Alcance.carpetas debe contener solo cadenas' }; });
  configuraciones.forEach(conf => { if (typeof conf !== 'string') return { ok: false, motivo: 'Alcance.configuraciones debe contener solo cadenas' }; if (!CONFIGURACIONES_TELEPATIA.includes(conf as any)) return { ok: false, motivo: `Configuración no válida: ${conf}` }; });
  if (!completo && !(memorias.length > 0 || carpetas.length > 0 || configuraciones.length > 0)) return { ok: false, motivo: 'Alcance no completo debe especificar memorias, carpetas o configuraciones' };
  const esISO = (fecha: string | null | undefined): boolean => fecha === null || fecha === undefined || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{3})?Z$/.test(fecha);
  if (typeof vinculo.creadoEn !== 'string' || !esISO(vinculo.creadoEn)) return { ok: false, motivo: 'Fecha de creación debe ser una cadena ISO válida' };
  if (vinculo.expiraEn !== null && vinculo.expiraEn !== undefined && !esISO(vinculo.expiraEn)) return { ok: false, motivo: 'Fecha de expiración debe ser una cadena ISO válida o null' };
  if (vinculo.ultimaSync !== null && vinculo.ultimaSync !== undefined && !esISO(vinculo.ultimaSync)) return { ok: false, motivo: 'Fecha de última sincronización debe ser una cadena ISO válida o null' };
  if (!['enviar', 'recibir', 'ambas'].includes(vinculo.direccion)) return { ok: false, motivo: 'Dirección debe ser "enviar", "recibir" o "ambas"' };
  if (!['leer', 'escribir'].includes(vinculo.acceso)) return { ok: false, motivo: 'Acceso debe ser "leer" o "escribir"' };
  if (typeof vinculo.auto !== 'boolean') return { ok: false, motivo: 'Auto debe ser un booleano' };
  if (!['activo', 'pausado', 'pendiente'].includes(vinculo.estado)) return { ok: false, motivo: 'Estado debe ser "activo", "pausado" o "pendiente"' };
  return { ok: true, vinculo: vinculo as VinculoTelepatico };
}

export function normalizarVinculos(config: Record<string, unknown> | null | undefined): VinculoTelepatico[] {
  if (!config || typeof config !== 'object' || !('telepatia' in config)) return [];
  return (config.telepatia as any[]).filter(validarVinculo).map(v => v.vinculo);
}

export function conVinculo(config: Record<string, unknown>, v: VinculoTelepatico): Record<string, unknown> {
  const nuevos = { ...config };
  let telepatiaArray = nuevos.telepatia as any[] | undefined;
  if (!Array.isArray(telepatiaArray)) telepatiaArray = [];
  else telepatiaArray = [...telepatiaArray];
  telepatiaArray = telepatiaArray.filter(item => !(item as VinculoTelepatico).id === v.id);
  telepatiaArray.push(v);
  nuevos.telepatia = telepatiaArray;
  return nuevos;
}

export function sinVinculo(config: Record<string, unknown>, id: string): Record<string, unknown> {
  if (!config || typeof config !== 'object' || !('telepatia' in config)) return { ...config };
  const nuevos = { ...config };
  let telepatiaArray = nuevos.telepatia as any[] | undefined;
  if (!Array.isArray(telepatiaArray)) return nuevos;
  telepatiaArray = [...telepatiaArray];
  nuevos.telepatia = telepatiaArray.filter(item => !(item as VinculoTelepatico).id === id);
  return nuevos;
}

export function estaCaducado(v: VinculoTelepatico, ahora: number): boolean {
  return v.expiraEn != null && ahora > new Date(v.expiraEn).getTime();
}

export function planSincronizacion(
  v: VinculoTelepatico,
  origen: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> },
  destino: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> }
): Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> {
  if (v.estado !== 'activo' || estaCaducado(v, Date.now())) return [];
  let allowedDirections: ('origen' | 'destino')[] = [];
  if (v.direccion === 'enviar' || v.direccion === 'ambas') allowedDirections.push('origen');
  if (v.direccion === 'recibir' || v.direccion === 'ambas') allowedDirections.push('destino');
  if (v.acceso === 'leer') allowedDirections = allowedDirections.filter(dir => dir !== 'destino');
  const fileNames: string[] = v.alcance.completo
    ? [...new Set([...origen.archivos.map(f => f.name), ...destino.archivos.map(f => f.name)])]
    : v.alcance.memorias;
  const operations: Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> = [];
  for (const nombre of fileNames) {
    const origenArchivo = origen.archivos.find(f => f.name === nombre);
    const destinoArchivo = destino.archivos.find(f => f.name === nombre);
    if (!origenArchivo && !destinoArchivo) continue;
    let de: 'origen' | 'destino';
    let a: 'origen' | 'destino';
    const origenTime = origenArchivo?.updated_at ? new Date(origenArchivo.updated_at).getTime() : 0;
    const destinoTime = destinoArchivo?.updated_at ? new Date(destinoArchivo.updated_at).getTime() : 0;
    if (origenTime > destinoTime) { de = 'origen'; a = 'destino'; }
    else if (destinoTime > origenTime) { de = 'destino'; a = 'origen'; }
    else continue;
    const isAllowed = (de === 'origen' && a === 'destino' && allowedDirections.includes('origen')) ||
                      (de === 'destino' && a === 'origen' && allowedDirections.includes('destino'));
    if (isAllowed) operations.push({ tipo: 'archivo', nombre, de, a });
  }
  return operations;
}