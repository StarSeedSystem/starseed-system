import { Compartir } from './cristal/puertas-internet';

export interface PreferenciasRedCompartida {
  interruptor: boolean;
  maximoCon: Compartir;
  soloWifi: boolean;
  kbpsSubidaMax: number;
  reservaBateriaPct: number;
  automatico: boolean;
  compartirMedidas: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasRedCompartida = {
  interruptor: false,
  maximoCon: 'nadie',
  soloWifi: true,
  kbpsSubidaMax: 1024,
  reservaBateriaPct: 30,
  automatico: false,
  compartirMedidas: false,
};

export function sanearPreferenciasRed(crudo: unknown): PreferenciasRedCompartida {
  const defaults = PREFERENCIAS_POR_DEFECTO;
  if (!crudo || typeof crudo !== 'object') return { ...defaults };
  const c = crudo as Partial<PreferenciasRedCompartida>;

  return {
    interruptor: typeof c.interruptor === 'boolean' ? c.interruptor : defaults.interruptor,
    maximoCon: ['nadie', 'mi-cuenta', 'vinculos', 'grupo', 'publico'].includes(c.maximoCon as string) 
      ? (c.maximoCon as Compartir) : defaults.maximoCon,
    soloWifi: typeof c.soloWifi === 'boolean' ? c.soloWifi : defaults.soloWifi,
    kbpsSubidaMax: typeof c.kbpsSubidaMax === 'number' ? Math.max(0, Math.min(10000, c.kbpsSubidaMax)) : defaults.kbpsSubidaMax,
    reservaBateriaPct: typeof c.reservaBateriaPct === 'number' ? Math.max(0, Math.min(100, c.reservaBateriaPct)) : defaults.reservaBateriaPct,
    automatico: typeof c.automatico === 'boolean' ? c.automatico : defaults.automatico,
    compartirMedidas: typeof c.compartirMedidas === 'boolean' ? c.compartirMedidas : defaults.compartirMedidas,
  };
}

export function leerPreferenciasRed(): PreferenciasRedCompartida {
  try {
    const item = localStorage.getItem('preferencias-red-compartida');
    return sanearPreferenciasRed(item ? JSON.parse(item) : PREFERENCIAS_POR_DEFECTO);
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

export function guardarPreferenciasRed(preferencias: PreferenciasRedCompartida): { aviso?: boolean } {
  const actual = leerPreferenciasRed();
  const niveles: Compartir[] = ['nadie', 'mi-cuenta', 'vinculos', 'grupo', 'publico'];
  const sube = niveles.indexOf(preferencias.maximoCon) > niveles.indexOf(actual.maximoCon);
  localStorage.setItem('preferencias-red-compartida', JSON.stringify(sanearPreferenciasRed(preferencias)));
  return sube ? { aviso: true } : {};
}


