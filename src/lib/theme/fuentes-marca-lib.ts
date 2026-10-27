// Módulo puro de fuentes de marca StarSeed.
// Sin red, sin DOM, sin node:*. Solo datos y funciones puras para probar.

export const URL_SATOSHI = 'https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap';
export const URL_QUICKSAND = 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;700&display=swap';

export interface FuenteMarcaEstado {
  papelEditorial: boolean;
  temaNatural: boolean;
  enlacesInsertados: string[];
}

export const estadoInicial: FuenteMarcaEstado = {
  papelEditorial: false,
  temaNatural: false,
  enlacesInsertados: [],
};

export function requiereSatoshi(estado: FuenteMarcaEstado): boolean {
  return estado.papelEditorial && !estado.enlacesInsertados.includes(URL_SATOSHI);
}

export function requiereQuicksand(estado: FuenteMarcaEstado): boolean {
  return estado.temaNatural && !estado.enlacesInsertados.includes(URL_QUICKSAND);
}

export function variablesCSS(): Record<string, string> {
  return {
    '--ss-font-display': "'Satoshi', 'Rajdhani', 'Inter', sans-serif",
    '--ss-font-titular': "'Rajdhani', 'Inter', sans-serif",
    '--ss-font-organica': "'Quicksand', 'Inter', sans-serif",
  };
}

export function respaldos(): Record<string, string[]> {
  return {
    '--ss-font-display': ['Rajdhani', 'Inter', 'sans-serif'],
    '--ss-font-titular': ['Inter', 'sans-serif'],
    '--ss-font-organica': ['Inter', 'sans-serif'],
  };
}

export function duplicadosInsertados(urls: string[]): string[] {
  const vistos = new Set<string>();
  const duplicados: string[] = [];
  for (const u of urls) {
    if (vistos.has(u)) duplicados.push(u);
    vistos.add(u);
  }
  return duplicados;
}

export function insertarEnlace(estadoActual: FuenteMarcaEstado, url: string): FuenteMarcaEstado {
  if (estadoActual.enlacesInsertados.includes(url)) return estadoActual;
  return {
    ...estadoActual,
    enlacesInsertados: [...estadoActual.enlacesInsertados, url],
  };
}
