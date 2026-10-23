// Disponibilidad en poco espacio (architecture/apps-en-la-malla.md §10, tarea U · Ola 1017A)
// Puro: sin node:*, sin APIs del navegador; el reloj llega inyectado (t del emisor y recibidoEn local)

export const TOPE_MENSAJE_BYTES = 1024; // tope de cada anuncio por la malla
export const CADUCIDAD_POR_DEFECTO_MS = 30_000; // un anuncio vale 30 s si no se renueva

const ALFABETO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Un anuncio cubre un tramo del elemento: desde hasta, con mapa de bits relativo. */
export interface AnuncioDisponibilidad {
  nodo: string; // quien lo anuncia
  elemento: string; // id de la transmisión o del volumen
  total: number; // piezas totales (segmentos de una transmisión o bandas de un volumen)
  desde: number; // primer índice que cubre el mapa de bits
  hasta: number; // último índice que cubre
  bits: string; // mapa de bits relativo a `desde`, en base64
  t: number; // ms de emisión, reloj del emisor
}

export interface AnuncioRecibido {
  anuncio: AnuncioDisponibilidad;
  recibidoEn: number; // reloj local al recibirlo (inyectado para la caducidad)
}

/** Por nodo dentro de un elemento: la unión de sus piezas más recientes. */
export interface FuenteElemento {
  nodo: string;
  total: number;
  bits: Uint8Array; // mapa absoluto del elemento, una pieza por bit
  t: number; // emisión más nueva de ese nodo
  recibidoEn: number; // recepción más nueva de ese nodo
}

export interface MapaElemento {
  elemento: string;
  orden: Map<string, FuenteElemento>; // por nodo, el más nuevo gana
}

export type RegistroDisponibilidad = Map<string, MapaElemento>;

/** Base64 puro: sin Buffer (solo servidor) ni btoa (solo navegador). */
export function codificar(bytes: Uint8Array): string {
  let salida = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b1 << 16) | (b2 << 8) | b3;
    salida += ALFABETO_B64[(n >> 18) & 63] + ALFABETO_B64[(n >> 12) & 63];
    salida += i + 1 < bytes.length ? ALFABETO_B64[(n >> 6) & 63] : "=";
    salida += i + 2 < bytes.length ? ALFABETO_B64[n & 63] : "=";
  }
  return salida;
}

/** Decodifica base64 puro (ignora el relleno «=», falla con carácter fuera del alfabeto). */
export function decodificar(texto: string): Uint8Array {
  const limpio = texto.replace(/=+$/, "");
  const salida = new Uint8Array(Math.floor((limpio.length * 6) / 8));
  let escritos = 0;
  let enEspera = 0;
  let bufer = 0;
  for (const letra of limpio) {
    const valor = ALFABETO_B64.indexOf(letra);
    if (valor < 0) throw new Error("Carácter fuera del alfabeto base64: " + letra);
    bufer = (bufer << 6) | valor;
    enEspera += 6;
    if (enEspera >= 8) {
      enEspera -= 8;
      salida[escritos++] = (bufer >> enEspera) & 0xff;
    }
  }
  return salida;
}

export function crearBits(cantidad: number): Uint8Array {
  return new Uint8Array(Math.max(0, Math.ceil(cantidad / 8)));
}

export function marcarIndice(bits: Uint8Array, indice: number): void {
  bits[indice >> 3] |= 1 << (indice % 8);
}

export function tieneIndice(bits: Uint8Array, indice: number): boolean {
  return (bits[indice >> 3] & (1 << (indice % 8))) !== 0;
}

const CODIFICADOR = new TextEncoder();

/** Peso en bytes de un texto (para medir el tamaño real del mensaje). */
export function pesoTexto(texto: string): number {
  return CODIFICADOR.encode(texto).length;
}

/** Peso del sobre del mensaje: dígitos del peor caso, el campo «bits» (clave 7 + comillas 2) vacío. */
function pesoFijo(nodo: string, elemento: string, total: number, t: number): number {
  const plantilla = JSON.stringify({ nodo, elemento, total, desde: total, hasta: total, t });
  return pesoTexto(plantilla) + 9;
}

/** Crea los anuncios del elemento que dice tener, troceados al tope de 1 KB por mensaje. */
export function anuncio(
  nodo: string,
  elemento: string,
  total: number,
  tengo: number[],
  t: number
): AnuncioDisponibilidad[] {
  const fijos = pesoFijo(nodo, elemento, total, t);
  const ordenados = [...new Set(tengo)].filter((i) => i >= 0 && i < total).sort((a, b) => a - b);
  const piezas: AnuncioDisponibilidad[] = [];
  let grupo: number[] = [];
  const cerrar = () => {
    if (grupo.length === 0) return;
    const desde = grupo[0];
    const hasta = grupo[grupo.length - 1];
    const bits = crearBits(hasta - desde + 1);
    for (const i of grupo) marcarIndice(bits, i - desde);
    piezas.push({ nodo, elemento, total, desde, hasta, bits: codificar(bits), t });
    grupo = [];
  };
  for (const i of ordenados) {
    if (grupo.length > 0) {
      const bytesBits = 4 * Math.ceil(Math.ceil((i - grupo[0] + 1) / 8) / 3);
      if (fijos + bytesBits > TOPE_MENSAJE_BYTES) cerrar();
    }
    if (grupo.length === 0) grupo = [i];
    else grupo.push(i);
  }
  cerrar();
  return piezas;
}

/** Une anuncios (de muchos nodos y muchos tramos) en un registro por elemento y por nodo. */
export function fusionar(recibidos: AnuncioRecibido[]): RegistroDisponibilidad {
  const registro: RegistroDisponibilidad = new Map();
  for (const { anuncio, recibidoEn } of recibidos) {
    if (anuncio.total < 1 || anuncio.desde < 0 || anuncio.hasta < anuncio.desde) continue;
    const mapa = registro.get(anuncio.elemento) ?? { elemento: anuncio.elemento, orden: new Map() };
    registro.set(anuncio.elemento, mapa);
    let fuente = mapa.orden.get(anuncio.nodo);
    if (!fuente) {
      fuente = { nodo: anuncio.nodo, total: anuncio.total, bits: crearBits(anuncio.total), t: anuncio.t, recibidoEn };
    }
    if (recibidoEn >= fuente.recibidoEn) fuente.recibidoEn = recibidoEn;
    fuente.t = Math.max(fuente.t, anuncio.t);
    mapa.orden.set(anuncio.nodo, fuente);
    const trozos = decodificar(anuncio.bits);
    const limite = Math.min(anuncio.hasta - anuncio.desde + 1, anuncio.total - anuncio.desde);
    for (let j = 0; j < limite; j++) {
      if (tieneIndice(trozos, j)) marcarIndice(fuente.bits, anuncio.desde + j);
    }
  }
  return registro;
}

/** Quién tiene la pieza del elemento ahora: solo anuncios frescos, el más reciente primero. */
export function quienTiene(
  registro: RegistroDisponibilidad,
  elemento: string,
  indice: number,
  ahora: number,
  caducidadMs: number = CADUCIDAD_POR_DEFECTO_MS
): string[] {
  const mapa = registro.get(elemento);
  if (!mapa || indice < 0) return [];
  const vivas: FuenteElemento[] = [];
  for (const fuente of mapa.orden.values()) {
    if (ahora - fuente.recibidoEn > caducidadMs) continue;
    if (indice >= fuente.total) continue;
    if (tieneIndice(fuente.bits, indice)) vivas.push(fuente);
  }
  return vivas.sort((a, b) => b.t - a.t).map((f) => f.nodo);
}
