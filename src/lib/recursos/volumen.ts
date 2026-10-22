// Volúmenes por bandas para apps en la malla (architecture/apps-en-la-malla.md §7)
// Puro: sin node:* ni APIs del navegador concretas
import {
  TOPE_MENSAJE_BYTES,
  indicesABits,
  fusionar,
  quienTiene,
} from "./disponibilidad";

export interface Banda {
  indice: number;
  sha256: string;
  bytes: number;
}

export interface Manifiesto {
  id: string;
  version: string;
  tamano: number; // bytes totales
  banda: number; // tamaño de cada banda en bytes (4 MiB = 4 * 1024 * 1024)
  bandas: Banda[];
  privado: boolean;
  importancia: number; // 0-3
}

// Funciones puras para trabajar con volúmenes por bandas

export function bandasDeRango(m: Manifiesto, desde: number, hasta: number): Banda[] {
  if (desde < 0 || hasta >= m.bandas.length || desde > hasta) {
    return [];
  }
  return m.bandas.slice(desde, hasta + 1);
}

export function diferencia(mViejo: Manifiesto, mNuevo: Manifiesto): { añadidas: Banda[]; eliminadas: Banda[]; modificadas: Banda[] } {
  const bandasViejo = new Map(mViejo.bandas.map(b => [b.indice, b]));
  const bandasNuevo = new Map(mNuevo.bandas.map(b => [b.indice, b]));
  
  const añadidas: Banda[] = [];
  const eliminadas: Banda[] = [];
  const modificadas: Banda[] = [];
  
  // Bandas añadidas o modificadas
  for (const [indice, bandaNueva] of bandasNuevo) {
    const bandaVieja = bandasViejo.get(indice);
    if (!bandaVieja) {
      añadidas.push(bandaNueva);
    } else if (bandaVieja.sha256 !== bandaNueva.sha256) {
      modificadas.push(bandaNueva);
    }
  }
  
  // Bandas eliminadas
  for (const [indice, bandaVieja] of bandasViejo) {
    if (!bandasNuevo.has(indice)) {
      eliminadas.push(bandaVieja);
    }
  }
  
  return { añadidas, eliminadas, modificadas };
}

export function replicasDeseadas(m: Manifiesto): number {
  if (m.privado) {
    return 2; // privado: 2 en la cuenta
  } else {
    // público: 2 + importancia, tope 5
    return Math.min(2 + m.importancia, 5);
  }
}

export interface Oferta {
  id: string; // id de la neurona/servidor
  indice: number; // índice de la banda que ofrece
  velocidad: number; // velocidad medida (mayor = más rápida)
  permitted: boolean; // si está permitido por privacidad
}

export interface Tenedor {
  id: string; // id de la neurona/servidor que tiene la banda
  indice: number; // índice de la banda que tiene
  velocidad: number; // velocidad medida (mayor = más rápida)
  permitted: boolean; // si está permitido por privacidad para compartir
}

export function elegirFuentes(
  m: Manifiesto,
  bandaNumero: number,
  tenedores: Tenedor[],
  ofertas: Oferta[],
  anuncios?: readonly string[],
  ahora = Date.now(),
): Oferta[] {
  // La banda pedida tiene que existir en el manifiesto, según su mapa compacto.
  const presentes = indicesABits(m.bandas.length, m.bandas.map((b) => b.indice));
  if (bandaNumero < 0 || bandaNumero >= presentes.total) return [];
  if ((presentes.bytes[bandaNumero >> 3] & (1 << (bandaNumero & 7))) === 0) return [];

  // Si hay anuncios vivos, manda quién dice tener la banda; los mensajes que
  // pasan del tope de 1 KB se descartan antes de fusionarlos.
  const anunciados = anuncios === undefined ? null : new Set(
    quienTiene(
      fusionar(anuncios.filter((texto) => new TextEncoder().encode(texto).length <= TOPE_MENSAJE_BYTES)),
      m.id,
      bandaNumero,
      ahora,
    ),
  );

  // Combinar tenedores y ofertas en una lista única de fuentes
  const fuentes: Oferta[] = [
    // Convertir tenedores a ofertas (asumiendo que si son tenedores y permitted, pueden ofrecer)
    ...tenedores
      .filter(t => t.indice === bandaNumero && t.permitted && (!anunciados || anunciados.has(t.id)))
      .map(t => ({ id: t.id, indice: t.indice, velocidad: t.velocidad, permitted: t.permitted })),
    // Filtrar ofertas por el número de banda y permiso
    ...ofertas
      .filter(o => o.indice === bandaNumero && o.permitted && (!anunciados || anunciados.has(o.id)))
  ];
  
  // Ordenar por velocidad descending (de la más rápida a la más lenta)
  return fuentes.sort((a, b) => b.velocidad - a.velocidad);
}

// Constantes
export const TAMANO_BANDA = 4 * 1024 * 1024; // 4 MiB