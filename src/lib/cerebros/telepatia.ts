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

export const CONFIGURACIONES_TELEPATIA = ['servers','runtimes','skills','storage','apps','moa','channels','conectores','includes.personalities'] as const;

export function validarVinculo(v: unknown): { ok: true; vinculo: VinculoTelepatico } | { ok: false; motivo: string } {
  if (typeof v !== 'object' || v === null) {
    return { ok: false, motivo: 'vinculo no es un objeto' };
  }
  const destino = (v as any).destino;
  if (typeof destino !== 'object' || destino === null) {
    return { ok: false, motivo: 'destino es inválido' };
  }
  if (!['cerebro', 'grupo', 'comunidad', 'pagina', 'cuenta'].includes(destino.tipo)) {
    return { ok: false, motivo: 'tipo de destino inválido' };
  }
  if (typeof destino.id !== 'string') {
    return { ok: false, motivo: 'id de destino debe ser string' };
  }
  const alcance = (v as any).alcance;
  if (typeof alcance !== 'object' || alcance === null) {
    return { ok: false, motivo: 'alcance es inválido' };
  }
  if (typeof alcance.completo !== 'boolean') {
    return { ok: false, motivo: 'alcance.completo debe ser boolean' };
  }
  const dir = (v as any).direccion;
  if (!['enviar', 'recibir', 'ambas'].includes(dir)) {
    return { ok: false, motivo: 'direccion inválida' };
  }
  const acceso = (v as any).acceso;
  if (!['leer', 'escribir'].includes(acceso)) {
    return { ok: false, motivo: 'acceso inválido' };
  }
  const estado = (v as any).estado;
  if (!['activo', 'pausado', 'pendiente'].includes(estado)) {
    return { ok: false, motivo: 'estado inválido' };
  }
  const creadoEn = (v as any).creadoEn;
  if (typeof creadoEn !== 'string' || !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?/.test(creadoEn)) {
    return { ok: false, motivo: 'creadoEn debe ser ISO-8601' };
  }
  const expiraEn = (v as any).expiraEn;
  if (expiraEn !== undefined && expiraEn !== null && (typeof expiraEn !== 'string' || !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?/.test(expiraEn))) {
    return { ok: false, motivo: 'expiraEn debe ser ISO-8601 o nulo' };
  }
  const ultimaSync = (v as any).ultimaSync;
  if (ultimaSync !== undefined && ultimaSync !== null && (typeof ultimaSync !== 'string' || !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?/.test(ultimaSync))) {
    return { ok: false, motivo: 'ultimaSync debe ser ISO-8601 o nulo' };
  }
  const config = (v as any).configuraciones;
  if (!Array.isArray(config) || !config.every((c: any) => typeof c === 'string')) {
    return { ok: false, motivo: 'configuraciones debe ser string[]' };
  }
  if (!config.every((c: string) => CONFIGURACIONES_TELEPATIA.includes(c))) {
    return { ok: false, motivo: 'alguna configuración no es válida' };
  }
  const memorias = (v as any).memorias;
  if (!Array.isArray(memorias) || !memorias.every((m: any) => typeof m === 'string')) {
    return { ok: false, motivo: 'memorias debe ser string[]' };
  }
  const carpetas = (v as any).carpetas;
  if (!Array.isArray(carpetas) || !carpetas.every((c: any) => typeof c === 'string')) {
    return { ok: false, motivo: 'carpetas debe ser string[]' };
  }
  const auto = (v as any).auto;
  if (typeof auto !== 'boolean') {
    return { ok: false, motivo: 'auto debe ser boolean' };
  }
  const id = (v as any).id;
  if (typeof id !== 'string') {
    return { ok: false, motivo: 'id debe ser string' };
  }
  const fechaCreacion = Date.parse(creadoEn);
  const fechaExpiracion = expiraEn ? Date.parse(expiraEn) : Infinity;
  if (fechaCreacion > fechaExpiracion) {
    return { ok: false, motivo: 'expiraEn es anterior a creadoEn' };
  }
  return { ok: true, vinculo: v as VinculoTelepatico };
}

export function normalizarVinculos(config: Record<string, unknown> | null | undefined): VinculoTelepatico[] {
  if (config === null || config === undefined) {
    return [];
  }
  const vinculos = config.telepatia as unknown[] | undefined;
  if (!Array.isArray(vinculos)) {
    return [];
  }
  const validos: VinculoTelepatico[] = [];
  for (const v of vinculos) {
    const val = validarVinculo(v);
    if (val.ok) {
      validos.push(val.vinculo);
    }
  }
  return validos;
}

export function conVinculo(config: Record<string, unknown>, vinculo: VinculoTelepatico): Record<string, unknown> {
  const configNuevo = { ...config };
  if (!configNuevo.brain) {
    configNuevo.brain = {};
  }
  if (!configNuevo.brain.config) {
    configNuevo.brain.config = {};
  }
  if (!configNuevo.brain.config.telepatia) {
    configNuevo.brain.config.telepatia = [];
  }
  const telepatiaArray = configNuevo.brain.config.telepatia as unknown[];
  const index = telepatiaArray.findIndex((v: unknown) => {
    const idA = (v as any).id;
    return typeof idA === 'string' && idA === vinculo.id;
  });
  if (index >= 0) {
    telepatiaArray[index] = vinculo;
  } else {
    telepatiaArray.push(vinculo);
  }
  return configNuevo;
}

export function sinVinculo(config: Record<string, unknown>, id: string): Record<string, unknown> {
  const configNuevo = { ...config };
  const telepatiaArray = configNuevo.brain?.config?.telepatia as unknown[] | undefined;
  if (Array.isArray(telepatiaArray)) {
    const filtrado = telepatiaArray.filter((v: unknown) => {
      const idA = (v as any).id;
      return typeof idA === 'string' && idA !== id;
    });
    configNuevo.brain.config.telepatia = filtrado;
  }
  return configNuevo;
}

export function estaCaducado(vinculo: VinculoTelepatico, ahora: number): boolean {
  if (vinculo.estado !== 'activo') {
    return true;
  }
  if (vinculo.estado === 'pausado' || vinculo.estado === 'pendiente') {
    return true;
  }
  const expiraEn = vinculo.expiraEn ? Date.parse(vinculo.expiraEn) : Infinity;
  return Date.parse(vinculo.creadoEn) + (24 * 60 * 60 * 1000) < ahora || ahora > expiraEn;
}

export function planSincronizacion(
  vinculo: VinculoTelepatico,
  origen: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> },
  destino: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> }
): Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> {
  if (vinculo.estado !== 'activo') {
    return [];
  }
  if (estaCaducado(vinculo, Date.now())) {
    return [];
  }
  const alcance = vinculo.alcance;
  const esAccesoLeer = vinculo.acceso === 'leer';
  const soloOrigenADestino = vinculo.direccion === 'enviar' || vinculo.direccion === 'ambas';
  const soloDestinoAOrigen = vinculo.direccion === 'recibir' || vinculo.direccion === 'ambas';
  const operaciones: Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> = [];
  if (soloOrigenADestino && !esAccesoLeer) {
    if (alcance.completo) {
      for (const configName of CONFIGURACIONES_TELEPATIA) {
        operaciones.push({ tipo: 'config', nombre: configName, de: 'origen', a: 'destino' });
      }
      for (const archivo of origen.archivos) {
        operaciones.push({ tipo: 'archivo', nombre: archivo.name, de: 'origen', a: 'destino' });
      }
      for (const carpeta of alcance.carpetas) {
        operaciones.push({ tipo: 'carpeta', nombre: carpeta, de: 'origen', a: 'destino' });
      }
    } else {
      for (const configName of alcance.configuraciones) {
        if (CONFIGURACIONES_TELEPATIA.includes(configName)) {
          operaciones.push({ tipo: 'config', nombre: configName, de: 'origen', a: 'destino' });
        }
      }
      for (const archivo of origen.archivos) {
        if (alcance.memorias.includes(archivo.name)) {
          operaciones.push({ tipo: 'archivo', nombre: archivo.name, de: 'origen', a: 'destino' });
        }
      }
      for (const carpeta of alcance.carpetas) {
        operaciones.push({ tipo: 'carpeta', nombre: carpeta, de: 'origen', a: 'destino' });
      }
    }
  }
  if (soloDestinoAOrigen && esAccesoLeer) {
    if (alcance.completo) {
      for (const configName of CONFIGURACIONES_TELEPATIA) {
        operaciones.push({ tipo: 'config', nombre: configName, de: 'destino', a: 'origen' });
      }
      for (const archivo of destino.archivos) {
        operaciones.push({ tipo: 'archivo', nombre: archivo.name, de: 'destino', a: 'origen' });
      }
      for (const carpeta of alcance.carpetas) {
        operaciones.push({ tipo: 'carpeta', nombre: carpeta, de: 'destino', a: 'origen' });
      }
    } else {
      for (const configName of alcance.configuraciones) {
        if (CONFIGURACIONES_TELEPATIA.includes(configName)) {
          operaciones.push({ tipo: 'config', nombre: configName, de: 'destino', a: 'origen' });
        }
      }
      for (const archivo of destino.archivos) {
        if (alcance.memorias.includes(archivo.name)) {
          operaciones.push({ tipo: 'archivo', nombre: archivo.name, de: 'destino', a: 'origen' });
        }
      }
      for (const carpeta of alcance.carpetas) {
        operaciones.push({ tipo: 'carpeta', nombre: carpeta, de: 'destino', a: 'origen' });
      }
    }
  }
  return operaciones;
}