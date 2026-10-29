/**
 * Módulo para gestionar el manifiesto de memorias en StarSeed OS.
 * Nota: Se utiliza SHA-256 (vía Web Crypto API) para el hashing,
 * ya que BLAKE3 no está disponible de forma nativa en el navegador
 * sin dependencias externas.
 */

export interface CopiaMemoria {
  cerebroId: string;
  memoriaId: string;
  destino: 'local' | 'starseed' | 'gdrive' | 'p2p' | 'externo';
  huella: string;
  bytes: number;
  actualizadoMs: number | null;
}

export interface ManifiestoMemoria {
  huellas: Record<string, {
    copias: CopiaMemoria[];
    destinos: Set<string>;
    ultimaCopia: CopiaMemoria;
    divergente: boolean;
  }>;
}

export interface PropuestaLimpieza {
  cerebroId: string;
  memoriaId: string;
  destino: string;
  razon: string;
  requiereConfirmacion: boolean;
}

export async function huellaContenido(texto: string): Promise<string> {
  const normalizado = texto.replace(/\r\n/g, '\n');
  const encoder = new TextEncoder();
  const data = encoder.encode(normalizado);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function construirManifiesto(copias: CopiaMemoria[]): ManifiestoMemoria {
  const manifiesto: ManifiestoMemoria = { huellas: {} };

  for (const copia of copias) {
    if (!manifiesto.huellas[copia.huella]) {
      manifiesto.huellas[copia.huella] = {
        copias: [],
        destinos: new Set(),
        ultimaCopia: copia,
        divergente: false,
      };
    }
    const entrada = manifiesto.huellas[copia.huella];
    entrada.copias.push(copia);
    entrada.destinos.add(copia.destino);

    if (!entrada.ultimaCopia.actualizadoMs || (copia.actualizadoMs && copia.actualizadoMs > entrada.ultimaCopia.actualizadoMs)) {
      entrada.ultimaCopia = copia;
    }
  }

  const items: Record<string, string[]> = {};
  for (const huella in manifiesto.huellas) {
    for (const copia of manifiesto.huellas[huella].copias) {
      const key = `${copia.cerebroId}:${copia.memoriaId}`;
      if (!items[key]) items[key] = [];
      if (!items[key].includes(huella)) items[key].push(huella);
    }
  }

  for (const key in items) {
    if (items[key].length > 1) {
      for (const huella of items[key]) {
        manifiesto.huellas[huella].divergente = true;
      }
    }
  }

  return manifiesto;
}

export function divergencias(m: ManifiestoMemoria): Array<{ cerebroId: string; memoriaId: string; huellaMasNueva: string }> {
  const grupos: Record<string, { huella: string; tiempo: number }[]> = {};
  for (const huella in m.huellas) {
    for (const copia of m.huellas[huella].copias) {
      const key = `${copia.cerebroId}:${copia.memoriaId}`;
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push({ huella, tiempo: copia.actualizadoMs || 0 });
    }
  }

  const resultado = [];
  for (const key in grupos) {
    const items = grupos[key];
    const uniqueHuellas = Array.from(new Set(items.map(i => i.huella)));
    if (uniqueHuellas.length > 1) {
      const [cerebroId, memoriaId] = key.split(':');
      const sorted = items.sort((a, b) => b.tiempo - a.tiempo);
      resultado.push({ cerebroId, memoriaId, huellaMasNueva: sorted[0].huella });
    }
  }
  return resultado;
}

export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  const propuestas: PropuestaLimpieza[] = [];
  const items: Record<string, CopiaMemoria[]> = {};

  for (const huella in m.huellas) {
    for (const copia of m.huellas[huella].copias) {
      const key = `${copia.cerebroId}:${copia.memoriaId}`;
      if (!items[key]) items[key] = [];
      items[key].push(copia);
    }
  }

  for (const key in items) {
    const copias = items[key];
    if (copias.length > 1) {
      copias.sort((a, b) => (b.actualizadoMs || 0) - (a.actualizadoMs || 0));
      for (const copia of copias.slice(1)) {
        if (copia.destino !== 'local') {
          propuestas.push({
            cerebroId: copia.cerebroId,
            memoriaId: copia.memoriaId,
            destino: copia.destino,
            razon: 'Existe una copia más reciente',
            requiereConfirmacion: true,
          });
        }
      }
    }
  }
  return propuestas;
}

export function resumenManifiesto(m: ManifiestoMemoria): string {
  const huellas = Object.keys(m.huellas);
  const totalMemorias = new Set(huellas.flatMap(h => m.huellas[h].copias.map(c => `${c.cerebroId}:${c.memoriaId}`))).size;
  const copiaUnica = huellas.filter(h => m.huellas[h].copias.length === 1).length;
  const divergente = huellas.filter(h => m.huellas[h].divergente).length;
  return `${totalMemorias} memorias, ${copiaUnica} con copia única, ${divergente} divergente`;
}
