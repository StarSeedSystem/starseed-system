export type HuellaCopia = {
  entradas: number;
  bytes: number;
  sha256: string[];
};

export type ResultadoAlivio = {
  aceptado: string[];
  rechazado: string[];
};

export function huellaDeCopia(entrada: {
  entradas: number;
  bytes: number;
  sha256Listas: string[];
}): HuellaCopia {
  return {
    entradas: entrada.entradas,
    bytes: entrada.bytes,
    sha256: entrada.sha256Listas
  };
}

export async function copiaVerificada(entrada: {
  huellaOriginal: HuellaCopia;
  huellaCopiada: HuellaCopia;
}): Promise<boolean> {
  if (entrada.huellaOriginal.entradas !== entrada.huellaCopiada.entradas) return false;
  if (entrada.huellaOriginal.bytes !== entrada.huellaCopiada.bytes) return false;
  if (entrada.huellaOriginal.sha256.length !== entrada.huellaCopiada.sha256.length) return false;

  for (let i = 0; i < entrada.huellaOriginal.sha256.length; i++) {
    if (entrada.huellaOriginal.sha256[i] !== entrada.huellaCopiada.sha256[i]) return false;
  }

  return true;
}

const RUTAS_PROHIBIDAS = [
  '.env',
  '.env.local',
  '.env.backup',
  '.git',
  'key.pem',
  'key.asc',
  'cert.crt',
  'cert.pem',
  'starseed_memory_root'
];

const EXTENSIONES_PROHIBIDAS = ['.pem', '.key', '.asc'];

function esRutaProhibida(ruta: string): boolean {
  const nombre = ruta.split('/').pop() ?? '';
  if (RUTAS_PROHIBIDAS.some(p => nombre === p || ruta.includes('/' + p + '/'))) return true;
  if (EXTENSIONES_PROHIBIDAS.some(ext => nombre.endsWith(ext))) return true;
  return false;
}

function esWorktreeConCola(ruta: string, tieneColaActiva: boolean): boolean {
  if (!ruta.includes('starseed-wt-')) return false;
  return tieneColaActiva;
}

export function planAlivio(entrada: {
  rutas: string[];
  tieneColaActiva: boolean;
}): ResultadoAlivio {
  const aceptado: string[] = [];
  const rechazado: string[] = [];

  for (const ruta of entrada.rutas) {
    if (esRutaProhibida(ruta) || esWorktreeConCola(ruta, entrada.tieneColaActiva)) {
      rechazado.push(ruta);
    } else {
      aceptado.push(ruta);
    }
  }

  return { aceptado, rechazado };
}