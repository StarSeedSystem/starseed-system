// Disponibilidad de segmentos o bandas por la malla (architecture/apps-en-la-malla.md §10).
// Puro: reloj inyectable, sin red, sin disco y sin procesos. Cada anuncio cabe en 1 KB.

/** Cuánto vale un anuncio sin renovarse: 30 s por defecto. */
export const CADUCIDAD_MS = 30_000;
/** Tope de un mensaje de anuncio, contando el JSON en UTF-8. */
export const TOPE_MENSAJE_BYTES = 1024;

export interface MapaBits { total: number; bytes: Uint8Array }
export interface Tengo { nodoId: string; total: number; indices: Iterable<number>; t?: number }
export interface Anuncio { elemento: string; nodoId: string; t: number; total: number; desde: number; bits: number; mapa: string }
export interface Disponibilidad { quienTiene(elemento: string, indice: number, ahora?: number): string[] }

const entero = (n: number): number => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
const aBase64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const deBase64 = (texto: string): Uint8Array | null => {
  try {
    const normal = texto.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(normal + "=".repeat((4 - (normal.length % 4)) % 4));
    return Uint8Array.from(bin, (c: string) => c.charCodeAt(0));
  } catch { return null; }
};
export const codificar = (mapa: Uint8Array): string => aBase64(mapa);
export const decodificar = (texto: string): Uint8Array | null => typeof texto === "string" ? deBase64(texto) : null;

export function indicesABits(total: number, indices: Iterable<number>): MapaBits {
  const t = entero(total);
  const bytes = new Uint8Array(Math.ceil(t / 8));
  for (const i of indices) if (Number.isInteger(i) && i >= 0 && i < t) bytes[i >> 3] |= 1 << (i & 7);
  return { total: t, bytes };
}

const trozo = (elemento: string, nodoId: string, t: number, total: number, desde: number, bytes: Uint8Array): Anuncio =>
  ({ elemento, nodoId, t, total, desde, bits: Math.min(total - desde, bytes.length * 8), mapa: aBase64(bytes) });
const cabe = (a: Anuncio): boolean => new TextEncoder().encode(JSON.stringify(a)).length <= TOPE_MENSAJE_BYTES;

export function anuncio(elemento: string, tengo: Tengo): string[] {
  const total = entero(tengo.total);
  if (!elemento || !tengo.nodoId || total <= 0) return [];
  const t = tengo.t !== undefined && Number.isFinite(tengo.t) ? entero(tengo.t) : Date.now();
  const { bytes } = indicesABits(total, tengo.indices);
  let fin = bytes.length;
  while (fin > 0 && bytes[fin - 1] === 0) fin--;
  if (fin === 0) return [JSON.stringify(trozo(elemento, tengo.nodoId, t, total, 0, new Uint8Array(0)))];
  const salida: string[] = [];
  for (let inicio = 0; inicio < fin;) {
    let bajo = 1, alto = fin - inicio, mejor = 0;
    while (bajo <= alto) {
      const medio = (bajo + alto) >> 1;
      const candidato = trozo(elemento, tengo.nodoId, t, total, inicio * 8, bytes.subarray(inicio, inicio + medio));
      if (cabe(candidato)) { mejor = medio; bajo = medio + 1; } else alto = medio - 1;
    }
    if (mejor === 0) return [];
    salida.push(JSON.stringify(trozo(elemento, tengo.nodoId, t, total, inicio * 8, bytes.subarray(inicio, inicio + mejor))));
    inicio += mejor;
  }
  return salida;
}

type Trozo = { desde: number; bits: number; bytes: Uint8Array };
type Grupo = { elemento: string; nodoId: string; t: number; total: number; trozos: Trozo[] };

const leerAnuncio = (texto: string): Anuncio | null => {
  let dato: unknown;
  try { dato = JSON.parse(texto); } catch { return null; }
  if (typeof dato !== "object" || dato === null) return null;
  const { elemento, nodoId, mapa, t, total, desde, bits } = dato as Record<string, unknown>;
  if (typeof elemento !== "string" || !elemento) return null;
  if (typeof nodoId !== "string" || !nodoId || typeof mapa !== "string") return null;
  if (typeof t !== "number" || !Number.isFinite(t) || t < 0) return null;
  if (typeof total !== "number" || !Number.isInteger(total) || total < 0) return null;
  if (typeof desde !== "number" || !Number.isInteger(desde) || desde < 0 || desde > total) return null;
  if (typeof bits !== "number" || !Number.isInteger(bits) || bits < 0 || bits > total - desde) return null;
  return { elemento, nodoId, t, total, desde, bits, mapa };
};

export function fusionar(mensajes: readonly string[], caducidadMs?: number): Disponibilidad {
  const ttl = caducidadMs === undefined || !Number.isFinite(caducidadMs)
    ? CADUCIDAD_MS : Math.max(0, Math.floor(caducidadMs));
  const grupos = new Map<string, Grupo>();
  for (const texto of mensajes) {
    const a = leerAnuncio(texto);
    if (!a) continue;
    const bytes = deBase64(a.mapa);
    if (!bytes || bytes.length < Math.ceil(a.bits / 8)) continue;
    const clave = `${a.elemento}\u0000${a.nodoId}`;
    const previo = grupos.get(clave);
    const nuevo = { desde: a.desde, bits: a.bits, bytes };
    if (!previo || a.t > previo.t || (a.t === previo.t && a.total !== previo.total)) {
      grupos.set(clave, { elemento: a.elemento, nodoId: a.nodoId, t: a.t, total: a.total, trozos: [nuevo] });
    } else if (a.t === previo.t && a.total === previo.total) previo.trozos.push(nuevo);
  }
  const lista = [...grupos.values()];
  return {
    quienTiene(elemento, indice, ahora = Date.now()) {
      if (!elemento || !Number.isInteger(indice) || indice < 0) return [];
      const instante = Number.isFinite(ahora) ? ahora : Date.now();
      const nodos: string[] = [];
      for (const g of lista) {
        if (g.elemento !== elemento || indice >= g.total || instante - g.t > ttl) continue;
        for (const tr of g.trozos) {
          if (indice < tr.desde || indice >= tr.desde + tr.bits) continue;
          const rel = indice - tr.desde;
          const byte = tr.bytes[rel >> 3];
          if (byte !== undefined && (byte & (1 << (rel & 7))) !== 0) { nodos.push(g.nodoId); break; }
        }
      }
      return nodos.sort();
    },
  };
}

export const quienTiene = (
  disponible: Disponibilidad, elemento: string, indice: number, ahora = Date.now()
): string[] => disponible.quienTiene(elemento, indice, ahora);
