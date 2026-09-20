export type TonoBitnet = 'verde' | 'ambar' | 'rojo' | 'gris';
export type RecomendacionBitnet = 'dormir' | 'despertar' | null;

export interface SaludBitnet {
  t?: string | number;
  procesos?: number;
  rss_mb?: number;
  ram_libre_mb?: number;
  swap_mb?: number;
  health?: string;
  vivo?: boolean;
  tok_s?: number;
  segundos_prueba?: number;
}

export interface EstadoBitnetSaneado {
  salud: SaludBitnet;
  instalado: { modelo_mb: number; modelo_fecha: string };
  upstream: { motor_commit: string; motor_fecha: string; modelo_sha: string; modelo_fecha: string };
  avisos: string[];
  sinDatos?: boolean;
}

export interface DiagnosticoResult {
  tono: TonoBitnet;
  frase: string;
}

export function leerEstadoBitnet(json: unknown): EstadoBitnetSaneado {
  if (!json || typeof json !== 'object') {
    return {
      salud: { vivo: false, tok_s: 0, swap_mb: 0, ram_libre_mb: 0, rss_mb: 0 },
      instalado: { modelo_mb: 0, modelo_fecha: '' },
      upstream: { motor_commit: '', motor_fecha: '', modelo_sha: '', modelo_fecha: '' },
      avisos: [],
      sinDatos: true,
    };
  }

  const obj = json as Record<string, unknown>;
  const saludRaw = (obj.salud && typeof obj.salud === 'object') ? (obj.salud as Record<string, unknown>) : null;
  const instRaw = (obj.instalado && typeof obj.instalado === 'object') ? (obj.instalado as Record<string, unknown>) : {};
  const upRaw = (obj.upstream && typeof obj.upstream === 'object') ? (obj.upstream as Record<string, unknown>) : {};
  const avisosRaw = Array.isArray(obj.avisos) ? obj.avisos.filter((a): a is string => typeof a === 'string') : [];

  if (!saludRaw && !obj.instalado && !obj.upstream) {
    return {
      salud: { vivo: false, tok_s: 0, swap_mb: 0, ram_libre_mb: 0, rss_mb: 0 },
      instalado: { modelo_mb: 0, modelo_fecha: '' },
      upstream: { motor_commit: '', motor_fecha: '', modelo_sha: '', modelo_fecha: '' },
      avisos: [],
      sinDatos: true,
    };
  }

  const s = saludRaw || {};
  return {
    salud: {
      t: typeof s.t === 'string' || typeof s.t === 'number' ? s.t : undefined,
      procesos: typeof s.procesos === 'number' ? s.procesos : 0,
      rss_mb: typeof s.rss_mb === 'number' ? s.rss_mb : 0,
      ram_libre_mb: typeof s.ram_libre_mb === 'number' ? s.ram_libre_mb : 0,
      swap_mb: typeof s.swap_mb === 'number' ? s.swap_mb : 0,
      health: typeof s.health === 'string' ? s.health : '',
      vivo: Boolean(s.vivo),
      tok_s: typeof s.tok_s === 'number' ? s.tok_s : 0,
      segundos_prueba: typeof s.segundos_prueba === 'number' ? s.segundos_prueba : 0,
    },
    instalado: {
      modelo_mb: typeof instRaw.modelo_mb === 'number' ? instRaw.modelo_mb : 0,
      modelo_fecha: typeof instRaw.modelo_fecha === 'string' ? instRaw.modelo_fecha : '',
    },
    upstream: {
      motor_commit: typeof upRaw.motor_commit === 'string' ? upRaw.motor_commit : '',
      motor_fecha: typeof upRaw.motor_fecha === 'string' ? upRaw.motor_fecha : '',
      modelo_sha: typeof upRaw.modelo_sha === 'string' ? upRaw.modelo_sha : '',
      modelo_fecha: typeof upRaw.modelo_fecha === 'string' ? upRaw.modelo_fecha : '',
    },
    avisos: avisosRaw,
    sinDatos: false,
  };
}

export function diagnostico(estado: EstadoBitnetSaneado | null | undefined): DiagnosticoResult {
  if (!estado || estado.sinDatos) {
    return { tono: 'gris', frase: 'Sin datos de BitNet' };
  }

  const { vivo = false, tok_s = 0, swap_mb = 0 } = estado.salud;

  if (vivo) {
    if (tok_s >= 5) {
      return { tono: 'verde', frase: `BitNet responde a ${tok_s} tok/s` };
    }
    return { tono: 'ambar', frase: 'lento: la máquina va justa' };
  }

  if (swap_mb > 8192) {
    return { tono: 'rojo', frase: 'paginado a disco: la Mac no tiene RAM para BitNet y el enjambre a la vez' };
  }

  return { tono: 'rojo', frase: 'sin respuesta' };
}

export function recomendacion(estado: EstadoBitnetSaneado | null | undefined): RecomendacionBitnet {
  if (!estado || estado.sinDatos) return null;
  const { swap_mb = 0, ram_libre_mb = 0, vivo = false } = estado.salud;

  if (swap_mb > 8192 || (ram_libre_mb < 300 && vivo)) {
    return 'dormir';
  }
  if (!vivo && ram_libre_mb > 2048) {
    return 'despertar';
  }
  return null;
}
