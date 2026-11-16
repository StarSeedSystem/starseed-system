/**
 * almacen-ajustes — guardar y leer los ajustes de internet compartido en el aparato (INT06).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/malla-cristalina-sio2.md` §8.2.
 * Los ajustes viven SOLO en el aparato (almacén local inyectado `{ getItem, setItem }`, nunca un servidor).
 */

import type { AjustesInternet, AjustesBanco, VentanaBanco, Audiencia, AjustesAudiencia } from './tipos';

export const CLAVE_AJUSTES = 'starseed.malla.internet.v1' as const;

export interface Almacen {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const AJUSTES_APAGADOS: AjustesInternet = {
  version: 1,
  compartirConOtros: false,
  banco: {
    activo: false,
    modo: 'diario',
    diarioMb: 0,
    ventanas: [],
  },
  porAudiencia: {
    'mi-cuenta': { mesh: false, limiteMeshMb: null },
    'entidad': { mesh: false, limiteMeshMb: null },
    'publico': { mesh: false, limiteMeshMb: null },
  },
  declaraLimitada: null,
  compartirMedidas: false,
};

const ES_HH_MM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const ES_AAAA_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

function validarNumeroNaturally(x: unknown, min: number = 0): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  if (x < min) return null;
  return x;
}

function validarHora(x: unknown): string | null {
  if (typeof x !== 'string' || !ES_HH_MM.test(x)) return null;
  return x;
}

function validarFecha(x: unknown): string | null {
  if (typeof x !== 'string' || !ES_AAAA_MM_DD.test(x)) return null;
  return x;
}

function validarModoBanco(x: unknown): 'diario' | 'programado' {
  if (x === 'diario' || x === 'programado') return x;
  return 'diario';
}

function validarVentana(v: unknown, defecto: VentanaBanco): VentanaBanco | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const desde = validarFecha(o.desde);
  const hasta = validarFecha(o.hasta);
  const horaDesde = validarHora(o.horaDesde);
  const horaHasta = validarHora(o.horaHasta);
  const limiteMb = validarNumeroNaturally(o.limiteMb, 0);
  if (!desde || !hasta || !horaDesde || !horaHasta || limiteMb === null) return null;
  return { desde, hasta, horaDesde, horaHasta, limiteMb };
}

function validarAjustesAudiencia(x: unknown, defecto: AjustesAudiencia): AjustesAudiencia {
  if (!x || typeof x !== 'object') return defecto;
  const o = x as Record<string, unknown>;
  const mesh = o.mesh === true;
  const limiteRaw = o.limiteMeshMb;
  const limiteMeshMb = validarNumeroNaturally(limiteRaw, 0) ?? null;
  return { mesh, limiteMeshMb };
}

function validarAjustesBanco(x: unknown, defecto: AjustesBanco): AjustesBanco {
  if (!x || typeof x !== 'object') return defecto;
  const o = x as Record<string, unknown>;

  const activo = o.activo === true;
  const modo = validarModoBanco(o.modo);
  const diarioMb = validarNumeroNaturally(o.diarioMb, 0) ?? 0;

  let ventanas: VentanaBanco[] = [];
  if (Array.isArray(o.ventanas)) {
    const validas = new Array<VentanaBanco>();
    for (const v of o.ventanas.slice(0, 12)) {
      const valida = validarVentana(v, defecto.ventanas[0] ?? { desde: '', hasta: '', horaDesde: '', horaHasta: '', limiteMb: 0 });
      if (valida) validas.push(valida);
    }
    ventanas = validas.slice(0, 12);
  }

  return { activo, modo, diarioMb, ventanas };
}

export function leerAjustes(almacen: { getItem(key: string): string | null }, defectos: AjustesInternet): AjustesInternet {
  let raw: string | null;
  try {
    raw = almacen.getItem(CLAVE_AJUSTES);
  } catch {
    return defectos;
  }
  if (!raw) return defectos;

  let datos: unknown;
  try {
    datos = JSON.parse(raw);
  } catch {
    return defectos;
  }

  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return defectos;

  const o = datos as Record<string, unknown>;

  if (o.version !== 1) return defectos;

  const compartirConOtros = o.compartirConOtros === true ? true : false;
  const banco = validarAjustesBanco(o.banco, defectos.banco);
  const porAudienciaRaw = o.porAudiencia;
  let porAudiencia: Record<Audiencia, AjustesAudiencia> = {
    'mi-cuenta': { mesh: false, limiteMeshMb: null },
    'entidad': { mesh: false, limiteMeshMb: null },
    'publico': { mesh: false, limiteMeshMb: null },
  };
  if (porAudienciaRaw && typeof porAudienciaRaw === 'object' && !Array.isArray(porAudienciaRaw)) {
    const obj = porAudienciaRaw as Record<string, unknown>;
    for (const aud of ['mi-cuenta', 'entidad', 'publico'] as Audiencia[]) {
      porAudiencia[aud] = validarAjustesAudiencia(obj[aud], defectos.porAudiencia[aud]);
    }
  }
  const declaraLimitadaRaw = o.declaraLimitada;
  const declaraLimitada: boolean | null = declaraLimitadaRaw === true ? true : declaraLimitadaRaw === false ? false : null;
  const compartirMedidas = o.compartirMedidas === true;

  return {
    version: 1,
    compartirConOtros,
    banco,
    porAudiencia,
    declaraLimitada,
    compartirMedidas,
  };
}

export function guardarAjustes(almacen: { setItem(key: string, value: string): void }, ajustes: AjustesInternet): boolean {
  try {
    const serializado = JSON.stringify(ajustes);
    almacen.setItem(CLAVE_AJUSTES, serializado);
    return true;
  } catch {
    return false;
  }
}