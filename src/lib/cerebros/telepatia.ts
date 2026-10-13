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
  if (typeof v !== 'object' || v === null) return { ok: false, motivo: 'no es un objeto' };
  const vinculo = v as VinculoTelepatico;
  if (typeof vinculo.id !== 'string' || !vinculo.id.trim()) return { ok: false, motivo: 'id' };
  if (!vinculo.destino || typeof vinculo.destino !== 'object') return { ok: false, motivo: 'destino inválido' };
  const { tipo, id: destinoId } = vinculo.destino;
  if (typeof tipo !== 'string' || !['cerebro','grupo','comunidad','pagina','cuenta'].includes(tipo)) return { ok: false, motivo: 'tipo de destino inválido' };
  if (typeof destinoId !== 'string' || !destinoId.trim()) return { ok: false, motivo: 'id de destino inválido' };
  if (!vinculo.alcance || typeof vinculo.alcance !== 'object') return { ok: false, motivo: 'alcance inválido' };
  const { completo, memorias, carpetas, configuraciones } = vinculo.alcance;
  if (typeof completo !== 'boolean') return { ok: false, motivo: 'alcance.completo inválido' };
  if (!Array.isArray(memorias) || !memorias.every((m): m is string => typeof m === 'string')) return { ok: false, motivo: 'memorias inválidas' };
  if (!Array.isArray(carpetas) || !carpetas.every((c): c is string => typeof c === 'string')) return { ok: false, motivo: 'carpetas inválidas' };
  if (!Array.isArray(configuraciones) || !configuraciones.every((c): c is string => typeof c === 'string')) return { ok: false, motivo: 'configuraciones inválidas' };
  for (const conf of configuraciones) {
    if (!CONFIGURACIONES_TELEPATIA.includes(conf as any)) return { ok: false, motivo: 'configuración no válida' };
  }
  if (!completo && memorias.length === 0 && carpetas.length === 0 && configuraciones.length === 0) return { ok: false, motivo: 'alcance incompleto vacío' };
  if (typeof vinculo.direccion !== 'string' || !['enviar','recibir','ambas'].includes(vinculo.direccion as any)) return { ok: false, motivo: 'dirección inválida' };
  if (typeof vinculo.acceso !== 'string' || !['leer','escribir'].includes(vinculo.acceso as any)) return { ok: false, motivo: 'acceso inválido' };
  if (typeof vinculo.auto !== 'boolean') return { ok: false, motivo: 'auto inválido' };
  if (typeof vinculo.estado !== 'string' || !['activo','pausado','pendiente'].includes(vinculo.estado as any)) return { ok: false, motivo: 'estado inválido' };
  if (typeof vinculo.creadoEn !== 'string' || isNaN(Date.parse(vinculo.creadoEn))) return { ok: false, motivo: 'creadoEn inválido' };
  if (vinculo.expiraEn !== null && typeof vinculo.expiraEn !== 'undefined') {
    if (typeof vinculo.expiraEn !== 'string' || vinculo.expiraEn === '') return { ok: false, motivo: 'expiraEn inválido' };
    if (isNaN(Date.parse(vinculo.expiraEn))) return { ok: false, motivo: 'expiraEn inválido' };
  }
  if (vinculo.ultimaSync !== null && typeof vinculo.ultimaSync !== 'undefined') {
    if (typeof vinculo.ultimaSync !== 'string' || vinculo.ultimaSync === '') return { ok: false, motivo: 'ultimaSync inválido' };
    if (isNaN(Date.parse(vinculo.ultimaSync))) return { ok: false, motivo: 'ultimaSync inválido' };
  }
  return { ok: true, vinculo };
}
export function normalizarVinculos(config: Record<string, unknown> | null | undefined): VinculoTelepatico[] {
  if (!config || typeof config !== 'object') return [];
  const telepatiaProp = config.telepatia;
  if (!Array.isArray(telepatiaProp)) return [];
  const result: VinculoTelepatico[] = [];
  for (const item of telepatiaProp) {
    const validation = validarVinculo(item);
    if (validation.ok) result.push(validation.vinculo);
  }
  return result;
}
export function conVinculo(config: Record<string, unknown>, v: VinculoTelepatico): Record<string, unknown> {
  if (!config || typeof config !== 'object') return { ...config, telepatia: [v] };
  const telepatia = Array.isArray(config.telepatia) ? config.telepatia : [];
  const index = telepatia.findIndex((item) => item.id === v.id);
  const newTelepatia = [...telepatia];
  if (index >= 0) newTelepatia[index] = v;
  else newTelepatia.push(v);
  return { ...config, telepatia: newTelepatia };
}
export function sinVinculo(config: Record<string, unknown>, id: string): Record<string, unknown> {
  if (!config || typeof config !== 'object') return config;
  const telepatia = Array.isArray(config.telepatia) ? config.telepatia : [];
  const newTelepatia = telepatia.filter((item) => item.id !== id);
  if (newTelepatia.length === telepatia.length) return config;
  return { ...config, telepatia: newTelepatia };
}
export function estaCaducado(v: VinculoTelepatico, ahora: number): boolean {
  if (v.expiraEn == null) return false;
  const expiraDate = Date.parse(v.expiraEn);
  return !isNaN(expiraDate) && expiraDate < ahora;
}
export function planSincronizacion(
  v: VinculoTelepatico,
  origen: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> },
  destino: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> }
): Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> {
  if (v.estado === 'pausado' || v.estado === 'pendiente' || estaCaducado(v, Date.now())) return [];
  let allowOrigenToDestino = v.direccion === 'enviar' || v.direccion === 'ambas', allowDestinoToOrigen = v.acceso === 'leer' ? false : (v.direccion === 'recibir' || v.direccion === 'ambas');
  const isDireccionPermitida = (de: 'origen' | 'destino', a: 'origen' | 'destino') =>
    (de === 'origen' && a === 'destino') ? allowOrigenToDestino : allowDestinoToOrigen;
  const filesToConsider: string[] = v.alcance.completo
    ? Array.from(new Set([...origen.archivos.map(f => f.name), ...destino.archivos.map(f => f.name)]))
    : v.alcance.memorias;
  const operations: Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> = [];
  for (const fileName of filesToConsider) {
    const origenFile = origen.archivos.find(f => f.name === fileName);
    const destinoFile = destino.archivos.find(f => f.name === fileName);
    let sourceSide: 'origen' | 'destino' | null = null;
    let targetSide: 'origen' | 'destino' | null = null;
    if (origenFile && destinoFile) {
      const origenUpdated = origenFile.updated_at ? Date.parse(origenFile.updated_at) : -1;
      const destinoUpdated = destinoFile.updated_at ? Date.parse(destinoFile.updated_at) : -1;
      if (origenUpdated > destinoUpdated) { sourceSide = 'origen'; targetSide = 'destino'; }
      else if (destinoUpdated > origenUpdated) { sourceSide = 'destino'; targetSide = 'origen'; }
    } else if (origenFile) { sourceSide = 'origen'; targetSide = 'destino'; }
    else if (destinoFile) { sourceSide = 'destino'; targetSide = 'origen'; }
    if (sourceSide && targetSide && isDireccionPermitida(sourceSide, targetSide)) {
      operations.push({ tipo: 'archivo', nombre: fileName, de: sourceSide, a: targetSide });
    }
  }
  return operations;
}