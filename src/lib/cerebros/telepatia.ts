export type DestinoTelepatia = { tipo: string; id: string };
export type AlcanceParcial = { archivos?: readonly string[]; configuraciones?: readonly string[]; carpetas?: readonly string[] };
export type VinculoTelepatico = { destino: DestinoTelepatia; alcance: 'completo' | AlcanceParcial; configuraciones: Record<string, unknown>; fechaCreacion: string; fechaCaducidad: string };
export const CONFIGURACIONES_TELEPATIA = ['servers','runtimes','skills','storage','apps','moa','channels','conectores','includes.personalities'] as const;
type ConfiguracionTelepatia = typeof CONFIGURACIONES_TELEPATIA[number];

function esConfiguracionValida(valor: string): valor is ConfiguracionTelepatia {
  return CONFIGURACIONES_TELEPATIA.includes(valor as ConfiguracionTelepatia);
}

export function validarVinculo(v: unknown): { ok: true; vinculo: VinculoTelepatico } | { ok: false; motivo: string } {
  if (v === null || typeof v !== 'object') return { ok: false, motivo: 'El vínculo no es un objeto' };
  const vinculo = v as VinculoTelepatico;
  if (!vinculo.destino || typeof vinculo.destino !== 'object') return { ok: false, motivo: 'Destino inválido' };
  if (typeof vinculo.destino.tipo !== 'string' || !vinculo.destino.tipo.trim()) return { ok: false, motivo: 'Destino.tipo debe ser una cadena no vacía' };
  if (typeof vinculo.destino.id !== 'string' || !vinculo.destino.id.trim()) return { ok: false, motivo: 'Destino.id debe ser una cadena no vacía' };
  if (vinculo.alcance !== 'completo' && typeof vinculo.alcance === 'object') {
    const alcance = vinculo.alcance;
    if (alcance.archivos && !Array.isArray(alcance.archivos)) return { ok: false, motivo: 'Alcance.archivos debe ser un array si está presente' };
    if (alcance.configuraciones && !Array.isArray(alcance.configuraciones)) return { ok: false, motivo: 'Alcance.configuraciones debe ser un array si está presente' };
    if (alcance.carpetas && !Array.isArray(alcance.carpetas)) return { ok: false, motivo: 'Alcance.carpetas debe ser un array si está presente' };
    const tieneArchivos = alcance.archivos && alcance.archivos.length > 0;
    const tieneConfiguraciones = alcance.configuraciones && alcance.configuraciones.length > 0;
    const tieneCarpetas = alcance.carpetas && alcance.carpetas.length > 0;
    if (!tieneArchivos && !tieneConfiguraciones && !tieneCarpetas) return { ok: false, motivo: 'Alcance no completo debe especificar archivos, configuraciones o carpetas' };
    if (alcance.configuraciones) {
      for (const config of alcance.configuraciones) {
        if (typeof config !== 'string' || !esConfiguracionValida(config)) return { ok: false, motivo: `Configuración no válida: ${config}` };
      }
    }
  } else if (vinculo.alcance !== 'completo') return { ok: false, motivo: 'Alcance debe ser "completo" o un objeto' };
  if (typeof vinculo.configuraciones !== 'object' || vinculo.configuraciones === null) return { ok: false, motivo: 'Configuraciones debe ser un objeto' };
  const keys = Object.keys(vinculo.configuraciones);
  for (const key of keys) {
    if (!esConfiguracionValida(key)) return { ok: false, motivo: `Clave de configuración no válida: ${key}` };
  }
  const esISO = (fecha: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{3})?Z$/.test(fecha);
  if (typeof vinculo.fechaCreacion !== 'string' || !esISO(vinculo.fechaCreacion)) return { ok: false, motivo: 'Fecha de creación debe ser una cadena ISO válida' };
  if (typeof vinculo.fechaCaducidad !== 'string' || !esISO(vinculo.fechaCaducidad)) return { ok: false, motivo: 'Fecha de caducidad debe ser una cadena ISO válida' };
  return { ok: true, vinculo: vinculo };
}
export function normalizarVinculos(config: Record<string, unknown> | null | undefined): VinculoTelepatico[] {
  if (!config || typeof config !== 'object' || !('telepatia' in config)) return [];
  const telepatiaConfig = config.telepatia;
  if (!Array.isArray(telepatiaConfig)) return [];
  const vinculos: VinculoTelepatico[] = [];
  for (const item of telepatiaConfig) {
    const validacion = validarVinculo(item);
    if (validacion.ok) vinculos.push(validacion.vinculo);
  }
  return vinculos;
}
export function conVinculo(config: Record<string, unknown>, v: VinculoTelepatico): Record<string, unknown> {
  const nuevos = { ...config };
  let telepatiaArray = nuevos.telepatia as unknown[] | undefined;
  if (!Array.isArray(telepatiaArray)) telepatiaArray = [];
  else telepatiaArray = [...telepatiaArray];
  telepatiaArray = telepatiaArray.filter(item => !((item as VinculoTelepatico).destino.id === v.destino.id));
  telepatiaArray.push(v);
  nuevos.telepatia = telepatiaArray;
  return nuevos;
}
export function sinVinculo(config: Record<string, unknown>, id: string): Record<string, unknown> {
  if (!config || typeof config !== 'object' || !('telepatia' in config)) return { ...config };
  const nuevos = { ...config };
  let telepatiaArray = nuevos.telepatia as unknown[] | undefined;
  if (!Array.isArray(telepatiaArray)) return nuevos;
  telepatiaArray = [...telepatiaArray];
  nuevos.telepatia = telepatiaArray.filter(item => !((item as VinculoTelepatico).destino.id === id));
  return nuevos;
}
export function estaCaducado(v: VinculoTelepatico, ahora: number): boolean {
  return ahora > new Date(v.fechaCaducidad).getTime();
}
export function planSincronizacion(
  v: VinculoTelepatico,
  origen: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> },
  destino: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> }
): Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> {
  if (estaCaducado(v, Date.now())) return [];
  const operaciones: Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> = [];
  const archivosASincronizar: readonly string[] = v.alcance === 'completo' 
    ? (() => {
        const allNames = [...origen.archivos.map(f => f.name), ...destino.archivos.map(f => f.name)];
        return allNames.filter((name, index) => allNames.indexOf(name) === index);
      })()
    : (v.alcance as AlcanceParcial).archivos || [];
  const configuracionesASincronizar: readonly string[] = v.alcance === 'completo' 
    ? CONFIGURACIONES_TELEPATIA 
    : (v.alcance as AlcanceParcial).configuraciones || [];
  const carpetasASincronizar: readonly string[] = v.alcance === 'completo' 
    ? [] 
    : (v.alcance as AlcanceParcial).carpetas || [];
  for (const nombre of archivosASincronizar) {
    const origenArchivo = origen.archivos.find(f => f.name === nombre);
    const destinoArchivo = destino.archivos.find(f => f.name === nombre);
    if (!origenArchivo && !destinoArchivo) continue;
    let de: 'origen' | 'destino', a: 'origen' | 'destino';
    if (!origenArchivo) { de = 'destino'; a = 'origen'; }
    else if (!destinoArchivo) { de = 'origen'; a = 'destino'; }
    else {
      const origenActualizado = origenArchivo.updated_at ? new Date(origenArchivo.updated_at).getTime() : 0;
      const destinoActualizado = destinoArchivo.updated_at ? new Date(destinoArchivo.updated_at).getTime() : 0;
      if (origenActualizado > destinoActualizado) { de = 'origen'; a = 'destino'; }
      else if (destinoActualizado > origenActualizado) { de = 'destino'; a = 'origen'; }
      else continue;
    }
    operaciones.push({ tipo: 'archivo', nombre, de, a });
  }
  for (const nombre of configuracionesASincronizar) {
    const enOrigen = Object.prototype.hasOwnProperty.call(origen.prefs, nombre);
    const enDestino = Object.prototype.hasOwnProperty.call(destino.prefs, nombre);
    if (!enOrigen && !enDestino) continue;
    let de: 'origen' | 'destino', a: 'origen' | 'destino';
    if (!enOrigen) { de = 'destino'; a = 'origen'; }
    else if (!enDestino) { de = 'origen'; a = 'destino'; }
    else continue;
    operaciones.push({ tipo: 'config', nombre, de, a });
  }
  for (const nombre of carpetasASincronizar) {
    // No tenemos información de carpetas en la entrada, así que lo omitimos.
    // La tarea requiere operaciones de carpetas pero carecemos de datos para determinar la dirección.
    // Lo dejaremos sin implementar según lo permitido por la tarea para omitir cuando faltan datos.
    continue;
  }
  return operaciones;
}