import { crearVariacionPublica } from '../variaciones/fuentes';

export const CLAVE_VISTAS = 'starseed.ramas4d.vistas.v1';
export const PLANTILLAS = ['educacion', 'cerebros', 'politica', 'cultura', 'ia', 'creacion', 'metagenesis'] as const;
export const PERSPECTIVAS = ['yo', 'grupo', 'comunidad', 'neurona'] as const;
export const FONDOS = ['noche', 'aurora', 'cristal', 'vacio'] as const;
export const ESTILOS_ETIQUETA = ['natural', 'compacta', 'destacada'] as const;
export const TIPOS_BASE = ['neurona', 'cerebro', 'archivo', 'memoria', 'agente', 'proceso'] as const;
export const PERMISOS_COMPARTIR = ['contactos', 'grupo', 'publico'] as const;

export type PermisoCompartir = (typeof PERMISOS_COMPARTIR)[number];
export type AmbitoVista = 'persona' | 'grupo';

export interface VistaConfig {
  plantilla: string;
  capas: string[];
  perspectiva: string;
  formasPorTipo: Record<string, string>;
  iconosPorTipo: Record<string, string>;
  colores: { tokens: Record<string, string>; personalizados: Record<string, string> };
  fisica: { gravedad: number; distancia: number; velocidad: number };
  fondo: string;
  sonidoEspacial: { activo: boolean; volumen: number };
  etiquetas: { visibles: boolean; tamano: number; estilo: string };
}

export interface VistaGuardada {
  ambito: AmbitoVista;
  idAmbito: string;
  config: VistaConfig;
}

export interface AlmacenVistas {
  v: 2;
  vistas: Record<string, VistaGuardada>;
}

export const VISTA_DEFECTO: VistaConfig = {
  plantilla: 'educacion',
  capas: [],
  perspectiva: 'yo',
  formasPorTipo: {},
  iconosPorTipo: {},
  colores: { tokens: { acento: 'primary' }, personalizados: {} },
  fisica: { gravedad: 0.5, distancia: 8, velocidad: 1 },
  fondo: 'noche',
  sonidoEspacial: { activo: false, volumen: 0.5 },
  etiquetas: { visibles: true, tamano: 1, estilo: 'natural' },
};

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const txt = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim() : d);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const mapa = (v: unknown): Record<string, string> => {
  const salida: Record<string, string> = {}; for (const [k, val] of Object.entries(obj(v))) if (typeof val === 'string') salida[k] = val; return salida;
};

export function normalizarConfig(crudo: unknown): VistaConfig {
  const c = obj(crudo);
  const colores = obj(c.colores);
  const fisica = obj(c.fisica);
  const sonido = obj(c.sonidoEspacial);
  const etiquetas = obj(c.etiquetas);
  return {
    plantilla: txt(c.plantilla, VISTA_DEFECTO.plantilla),
    capas: Array.isArray(c.capas) ? c.capas.filter((x): x is string => typeof x === 'string') : [],
    perspectiva: txt(c.perspectiva, VISTA_DEFECTO.perspectiva),
    formasPorTipo: mapa(c.formasPorTipo),
    iconosPorTipo: mapa(c.iconosPorTipo),
    colores: { tokens: mapa(colores.tokens), personalizados: mapa(colores.personalizados) },
    fisica: { gravedad: num(fisica.gravedad, 0.5), distancia: num(fisica.distancia, 8), velocidad: num(fisica.velocidad, 1) },
    fondo: txt(c.fondo, VISTA_DEFECTO.fondo),
    sonidoEspacial: { activo: bool(sonido.activo, false), volumen: Math.min(1, Math.max(0, num(sonido.volumen, 0.5))) },
    etiquetas: { visibles: bool(etiquetas.visibles, true), tamano: Math.max(0.5, num(etiquetas.tamano, 1)), estilo: txt(etiquetas.estilo, 'natural') },
  };
}

export function migrarAlmacen(crudo: unknown): AlmacenVistas {
  const a = obj(crudo);
  const entradas = obj(a.vistas);
  const vistas: Record<string, VistaGuardada> = {};
  for (const [clave, valor] of Object.entries(entradas)) {
    const g = obj(valor);
    const configCruda = obj(g.config ?? valor);
    if (a.v === 1) {
      const acento = txt(configCruda.colorTema, '');
      const colores = obj(configCruda.colores);
      if (acento) configCruda.colores = { ...colores, tokens: { ...obj(colores.tokens), acento } };
      if (typeof configCruda.sonido === 'boolean') {
        configCruda.sonidoEspacial = { activo: configCruda.sonido, volumen: num(obj(configCruda.sonidoEspacial).volumen, 0.5) };
      }
    }
    vistas[clave] = {
      ambito: g.ambito === 'grupo' ? 'grupo' : 'persona',
      idAmbito: txt(g.idAmbito, clave.split(':')[0]),
      config: normalizarConfig(configCruda),
    };
  }
  return { v: 2, vistas };
}

export function serializarAlmacen(almacen: AlmacenVistas): string { return JSON.stringify(almacen); }
export function leerAlmacen(): AlmacenVistas {
  if (typeof window === 'undefined') return { v: 2, vistas: {} };
  try { return migrarAlmacen(JSON.parse(window.localStorage.getItem(CLAVE_VISTAS) ?? 'null')); }
  catch { return { v: 2, vistas: {} }; }
}
export function guardarVista(vista: VistaGuardada): AlmacenVistas {
  const almacen = leerAlmacen();
  almacen.vistas[`${vista.ambito}:${vista.idAmbito}`] = vista;
  if (typeof window !== 'undefined') window.localStorage.setItem(CLAVE_VISTAS, serializarAlmacen(almacen));
  return almacen;
}
export function configuracionPublica(config: VistaConfig): VistaConfig { return normalizarConfig(config); }
export function permisoValido(valor: string): valor is PermisoCompartir { return (PERMISOS_COMPARTIR as readonly string[]).includes(valor); }
export function variacionDesdeVista(config: VistaConfig, titulo: string, autor: string) {
  return crearVariacionPublica('vista:ramas4d', 'variacion', titulo, 'Configuración de una vista de Ramas 4D, sin datos privados.', configuracionPublica(config), 'ramas4d', autor);
}
