export type SistemaActualizacion = 'Needle 3' | 'BitNet 1.58' | 'Adaptador colectivo' | 'Repo Astraura';
export type AccionActualizacion = 'al día' | 'se actualiza solo' | 'aviso: decide Alex' | 'sin datos';
export type ResultadoNocturno = 'publicado' | 'descartado' | 'sin experiencias' | 'máquina ahogada' | null;

export interface FilaActualizacion {
  sistema: SistemaActualizacion;
  instalado: string;
  disponible: string;
  ultimaComprobacion: string;
  accion: AccionActualizacion;
  detalle: string;
}

export interface CicloNocturnoInfo {
  t: string | null;
  resultado: ResultadoNocturno;
  detalle: string;
}

export interface EntradaEstados { needle?: unknown; bitnet?: unknown; manifiesto?: unknown; logAprendizaje?: string | null; }

export interface EstadosSaneados {
  needle: { instalado: string; pypi: string; n4: boolean; rech: boolean; comprobacion: string };
  bitnet: { motorCommit: string; modeloSha: string; avisos: string[]; comprobacion: string };
  manifiesto: { actual: string; experiencias: number; estado: string; t: string };
  logAprendizaje: string; hayNeedle: boolean; hayBitnet: boolean; hayManifiesto: boolean;
}

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const asStr = (v: unknown, f = ''): string => (typeof v === 'string' ? v : f);
const esSaneado = (e: EntradaEstados | EstadosSaneados): e is EstadosSaneados => 'hayNeedle' in e;

export function leerEstados(entrada: EntradaEstados): EstadosSaneados {
  const n = asObj(entrada.needle), b = asObj(entrada.bitnet), m = asObj(entrada.manifiesto);
  const bUp = asObj(b.upstream), bInst = asObj(b.instalado);
  const bAvisos = Array.isArray(b.avisos) ? b.avisos.filter((x): x is string => typeof x === 'string') : [];
  return {
    needle: {
      instalado: asStr(n.instalado, 'v3.1.0'), pypi: asStr(n.pypi),
      n4: Boolean(asObj(n.siguiente_mayor).needle4) || asStr(n.pypi).includes('4.'),
      rech: Boolean(n.rechazado), comprobacion: asStr(n.ultima_comprobacion) || asStr(n.fecha) || '—',
    },
    bitnet: {
      motorCommit: asStr(bUp.motor_commit), modeloSha: asStr(bUp.modelo_sha),
      avisos: bAvisos, comprobacion: asStr(b.ultima_comprobacion) || asStr(bInst.modelo_fecha) || '—',
    },
    manifiesto: { actual: asStr(m.actual), experiencias: typeof m.experiencias === 'number' ? m.experiencias : 0, estado: asStr(m.estado), t: asStr(m.t) },
    logAprendizaje: entrada.logAprendizaje ?? '',
    hayNeedle: Object.keys(n).length > 0, hayBitnet: Object.keys(b).length > 0, hayManifiesto: Object.keys(m).length > 0,
  };
}

export function filas(entrada: EntradaEstados | EstadosSaneados): FilaActualizacion[] {
  const s = esSaneado(entrada) ? entrada : leerEstados(entrada);
  return [
    {
      sistema: 'Needle 3',
      instalado: s.needle.instalado || (s.hayNeedle ? 'Instalado' : 'Sin datos'),
      disponible: s.needle.n4 ? 'Needle 4 disponible' : s.needle.pypi || 'al día',
      ultimaComprobacion: s.needle.comprobacion,
      accion: !s.hayNeedle ? 'sin datos' : s.needle.n4 || s.needle.rech ? 'aviso: decide Alex' : 'se actualiza solo',
      detalle: 'Renovación automática cada 6 h via renovar-needle.sh',
    },
    {
      sistema: 'BitNet 1.58',
      instalado: s.bitnet.motorCommit ? s.bitnet.motorCommit.slice(0, 7) : (s.hayBitnet ? 'Instalado' : 'Sin datos'),
      disponible: s.bitnet.modeloSha ? s.bitnet.modeloSha.slice(0, 7) : 'Upstream ok',
      ultimaComprobacion: s.bitnet.comprobacion,
      accion: !s.hayBitnet ? 'sin datos' : s.bitnet.avisos.length > 0 || Boolean(s.bitnet.motorCommit) ? 'aviso: decide Alex' : 'al día',
      detalle: 'Verificación cada 6 h; recompilar es decisión manual de Alex',
    },
    {
      sistema: 'Adaptador colectivo',
      instalado: s.manifiesto.actual || (s.hayManifiesto ? 'Activo' : 'Sin datos'),
      disponible: s.manifiesto.experiencias ? `${s.manifiesto.experiencias} exp` : 'al día',
      ultimaComprobacion: s.manifiesto.t || '—',
      accion: !s.hayManifiesto ? 'sin datos' : s.manifiesto.estado === 'rechazado' ? 'aviso: decide Alex' : 'se actualiza solo',
      detalle: 'Ciclo nocturno diario a las 04:10 via ciclo-aprendizaje-needle.sh',
    },
    {
      sistema: 'Repo Astraura',
      instalado: 'Local main', disponible: 'Pull cada hora', ultimaComprobacion: 'Cada 1 h',
      accion: 'se actualiza solo', detalle: 'Actualización horaria via update_astraura.sh',
    },
  ];
}

export function avisosPendientes(entrada: EntradaEstados | EstadosSaneados): string[] {
  const s = esSaneado(entrada) ? entrada : leerEstados(entrada);
  const res: string[] = [];
  if (s.needle.n4) res.push('Needle 4 disponible en PyPI para actualización mayor');
  if (s.bitnet.motorCommit || s.bitnet.avisos.some((a) => a.includes('motor') || a.includes('commit'))) res.push('Motor BitNet con commits nuevos en upstream');
  if (s.bitnet.modeloSha || s.bitnet.avisos.some((a) => a.includes('pesos') || a.includes('modelo') || a.includes('sha'))) res.push('Pesos BitNet modificados en Hugging Face');
  if (s.manifiesto.estado === 'rechazado' || s.needle.rech) res.push('Adaptador colectivo rechazado por el set dorado');
  return res;
}

export function ultimoCicloNocturno(log?: string | null): CicloNocturnoInfo {
  if (!log || !log.trim()) return { t: null, resultado: null, detalle: 'Sin registros del ciclo nocturno' };
  const lineas = log.trim().split('\n').filter(Boolean);
  const ult = lineas.slice(-10).join('\n').toLowerCase();
  const matchFecha = log.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/);

  let r: ResultadoNocturno = null;
  if (ult.includes('ahogada') || ult.includes('sin memoria') || ult.includes('oom')) r = 'máquina ahogada';
  else if (ult.includes('publicado') || ult.includes('exito') || ult.includes('éxito')) r = 'publicado';
  else if (ult.includes('descartado') || ult.includes('rechazado')) r = 'descartado';
  else if (ult.includes('sin experiencias') || /\b0 experiencias\b/.test(ult)) r = 'sin experiencias';

  return { t: matchFecha ? matchFecha[0] : null, resultado: r, detalle: lineas[lineas.length - 1] || '' };
}
