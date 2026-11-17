import type { AjustesInternet, AjustesBanco, VentanaBanco, AjustesAudiencia, Audiencia } from './tipos';

const CLAVE = 'starseed.malla.internet.v1';

export interface AlmacenAjustes {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

function esNumeroValido(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function esHoraValida(h: unknown): h is string {
  if (typeof h !== 'string') return false;
  const m = h.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return m !== null;
}

function esFechaValida(f: unknown): f is string {
  if (typeof f !== 'string') return false;
  const m = f.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!m) return false;
  const d = new Date(f + 'T00:00:00');
  return !Number.isNaN(d.getTime());
}

function esModoValido(m: unknown): m is 'diario' | 'programado' {
  return m === 'diario' || m === 'programado';
}

function esAudienciaValida(a: unknown): a is Audiencia {
  return a === 'mi-cuenta' || a === 'entidad' || a === 'publico';
}

const VENTANA_DEFECTO: VentanaBanco = { desde: '', hasta: '', horaDesde: '00:00', horaHasta: '23:59', limiteMb: 0 };

function validarVentana(v: unknown): VentanaBanco {
  if (typeof v !== 'object' || v === null) return VENTANA_DEFECTO;
  const obj = v as Record<string, unknown>;
  return {
    desde: esFechaValida(obj.desde) ? obj.desde : VENTANA_DEFECTO.desde,
    hasta: esFechaValida(obj.hasta) ? obj.hasta : VENTANA_DEFECTO.hasta,
    horaDesde: esHoraValida(obj.horaDesde) ? obj.horaDesde : VENTANA_DEFECTO.horaDesde,
    horaHasta: esHoraValida(obj.horaHasta) ? obj.horaHasta : VENTANA_DEFECTO.horaHasta,
    limiteMb: esNumeroValido(obj.limiteMb) ? obj.limiteMb : VENTANA_DEFECTO.limiteMb,
  };
}

function validarBanco(b: unknown, defecto: AjustesBanco): AjustesBanco {
  if (typeof b !== 'object' || b === null) return defecto;
  const obj = b as Record<string, unknown>;
  const ventanasRaw = Array.isArray(obj.ventanas) ? obj.ventanas : [];
  const ventanas = ventanasRaw.map(validarVentana).slice(0, 12);
  return {
    activo: typeof obj.activo === 'boolean' ? obj.activo : defecto.activo,
    modo: esModoValido(obj.modo) ? obj.modo : defecto.modo,
    diarioMb: esNumeroValido(obj.diarioMb) ? obj.diarioMb : defecto.diarioMb,
    ventanas,
  };
}

function validarAudiencia(a: unknown, defecto: AjustesAudiencia): AjustesAudiencia {
  if (typeof a !== 'object' || a === null) return defecto;
  const obj = a as Record<string, unknown>;
  return {
    mesh: typeof obj.mesh === 'boolean' ? obj.mesh : defecto.mesh,
    limiteMeshMb: (obj.limiteMeshMb === null || esNumeroValido(obj.limiteMeshMb)) ? (obj.limiteMeshMb as number | null) : defecto.limiteMeshMb,
  };
}

function validarAjustes(guardados: unknown, defectos: AjustesInternet): AjustesInternet {
  if (typeof guardados !== 'object' || guardados === null) return defectos;
  const obj = guardados as Record<string, unknown>;
  if (obj.version !== 1) return defectos;

  const porAudienciaRaw = obj.porAudiencia as Record<Audiencia, unknown> | undefined;
  const porAudiencia: Record<Audiencia, AjustesAudiencia> = {
    'mi-cuenta': validarAudiencia(porAudienciaRaw?.['mi-cuenta'], defectos.porAudiencia['mi-cuenta']),
    entidad: validarAudiencia(porAudienciaRaw?.entidad, defectos.porAudiencia.entidad),
    publico: validarAudiencia(porAudienciaRaw?.publico, defectos.porAudiencia.publico),
  };

  return {
    version: 1,
    compartirConOtros: typeof obj.compartirConOtros === 'boolean' ? obj.compartirConOtros : defectos.compartirConOtros,
    banco: validarBanco(obj.banco, defectos.banco),
    porAudiencia,
    declaraLimitada: (obj.declaraLimitada === null || typeof obj.declaraLimitada === 'boolean') ? (obj.declaraLimitada as boolean | null) : defectos.declaraLimitada,
    compartirMedidas: typeof obj.compartirMedidas === 'boolean' ? obj.compartirMedidas : defectos.compartirMedidas,
  };
}

export function leerAjustes(almacen: AlmacenAjustes, defectos: AjustesInternet): AjustesInternet {
  try {
    const crudo = almacen.getItem(CLAVE);
    if (crudo === null) return defectos;
    const parseado = JSON.parse(crudo);
    return validarAjustes(parseado, defectos);
  } catch {
    return defectos;
  }
}

export function guardarAjustes(almacen: AlmacenAjustes, ajustes: AjustesInternet): boolean {
  try {
    almacen.setItem(CLAVE, JSON.stringify(ajustes));
    return true;
  } catch {
    return false;
  }
}

/**
 * Constante histórica de «todo apagado». Los valores por defecto que rigen hoy son los de
 * `defectos-audiencia.ts` (`ajustesPorDefecto`, contrato §8.2 de
 * architecture/malla-cristalina-sio2.md): mi-cuenta viene con la malla encendida y sin límite.
 * Esta se conserva porque otras pruebas la usan como referencia explícita de «todo apagado».
 */
export const AJUSTES_APAGADOS: AjustesInternet = {
  version: 1,
  compartirConOtros: false,
  banco: { activo: false, modo: 'diario', diarioMb: 0, ventanas: [] },
  porAudiencia: {
    'mi-cuenta': { mesh: false, limiteMeshMb: null },
    entidad: { mesh: false, limiteMeshMb: null },
    publico: { mesh: false, limiteMeshMb: null },
  },
  declaraLimitada: null,
  compartirMedidas: false,
};