/**
 * canal — punteros mutables FIRMADOS del Enjambre (ENJ1110A · 2026-11-10). Contrato: §10.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Un canal es `(huella del editor, nombre) → raíz` con un número de secuencia creciente y una firma. Gana la
 * secuencia válida más alta; se difunde por cotilleo (`enj.canal`) como un anuncio. Equivale a BEP 46 / BEP 44
 * (elementos mutables) pero sin DHT: viaja por la malla y se guarda en cada neurona.
 * Usos: «última versión de la app para Android», versión actual de una publicación de la Biblioteca, versión
 * actual de una capa de conciencia de un ámbito.
 *
 *  · Un registro viejo (seq menor o igual) se ignora: la repetición de versiones antiguas no hace retroceder a nadie.
 *  · Firma inválida → se ignora y no se reenvía. La firma se comprueba DESPUÉS de las comprobaciones baratas.
 *  · Mismo seq con raíz distinta (el editor firmó dos cosas con el mismo número) → gana la raíz menor, para que todo
 *    el mundo converja a lo mismo; se informa como «conflicto».
 *  · `ts` no puede estar en el futuro más allá del desfase de reloj permitido.
 */

import { jsonCanonico, leerFirma, type FirmaEnj, type FirmarBytes, type VerificarBytes } from "./firmas";
import { esAmbito, textoSeguro, type Ambito } from "./semilla";
import { aBytes, aHex, entero, esObjeto, hex64, sha256 } from "./util";
import { MAX_TAMANO_CONTENIDO } from "./arbol";

export const MAX_CANALES = 512;
export const DESFASE_RELOJ_MS = 24 * 60 * 60_000;
const ORDEN = ["v", "fp", "nombre", "seq", "raiz", "tamano", "ts", "ambito"] as const;

export interface RegistroCanal {
  v: 1;
  /** Huella del editor. */
  fp: string;
  nombre: string;
  seq: number;
  raiz: string;
  tamano: number;
  ts: number;
  ambito: Ambito;
  firma: FirmaEnj;
}

export type ResultadoCanal = "nuevo" | "actualizado" | "igual" | "viejo" | "conflicto" | "invalido" | "firma-mala" | "lleno" | "futuro";

const RE_NOMBRE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,127}$/;

export function leerRegistroCanal(x: unknown): RegistroCanal | null {
  if (!esObjeto(x) || x.v !== 1) return null;
  const firma = leerFirma(x.firma);
  const raiz = hex64(x.raiz);
  const seq = entero(x.seq, 0, 2 ** 40);
  const tamano = entero(x.tamano, 0, MAX_TAMANO_CONTENIDO);
  const ts = entero(x.ts, 0, 8.64e15);
  if (!firma || !raiz || seq === null || tamano === null || ts === null) return null;
  if (typeof x.fp !== "string" || x.fp !== firma.fp) return null;
  if (typeof x.nombre !== "string" || !RE_NOMBRE.test(x.nombre) || textoSeguro(x.nombre, 128) === null) return null;
  if (!esAmbito(x.ambito)) return null;
  return { v: 1, fp: x.fp, nombre: x.nombre, seq, raiz, tamano, ts, ambito: x.ambito, firma };
}

export function cuerpoCanal(r: Omit<RegistroCanal, "firma">): Uint8Array {
  return aBytes("ss-canal-v1|" + jsonCanonico(r as unknown as Record<string, unknown>, ORDEN));
}

/** La huella del editor entra en el cuerpo firmado, así que se da de antemano y la firma debe ser de ESA huella. */
export async function firmarCanal(fp: string, r: Omit<RegistroCanal, "firma" | "fp" | "v">, firmar: FirmarBytes): Promise<RegistroCanal | null> {
  const base = { v: 1 as const, fp, ...r };
  const firma = await firmar(cuerpoCanal(base)).catch(() => null);
  if (!firma || firma.fp !== fp) return null;
  return leerRegistroCanal({ ...base, firma });
}

/** Id estable del canal (editor + nombre), para indexar y para anunciar sin repetir el nombre. */
export async function idCanal(fp: string, nombre: string): Promise<string> {
  return aHex(await sha256(aBytes(`ss-canal-id-v1|${fp}|${nombre}`)));
}

export class AlmacenCanales {
  private mapa = new Map<string, RegistroCanal>();

  constructor(
    private readonly verificar: VerificarBytes,
    private readonly ahora: () => number = () => Date.now(),
    private readonly max = MAX_CANALES,
  ) {}

  private clave(fp: string, nombre: string): string {
    return `${fp}|${nombre}`;
  }

  actual(fp: string, nombre: string): RegistroCanal | null {
    return this.mapa.get(this.clave(fp, nombre)) ?? null;
  }

  todos(): RegistroCanal[] {
    return [...this.mapa.values()];
  }

  /** Procesa un registro recibido (ya con forma válida o crudo). Devuelve qué pasó; solo `nuevo`/`actualizado`/`conflicto` cambian el estado. */
  async recibir(crudo: unknown): Promise<ResultadoCanal> {
    const r = leerRegistroCanal(crudo);
    if (!r) return "invalido";
    if (r.ts > this.ahora() + DESFASE_RELOJ_MS) return "futuro";
    const k = this.clave(r.fp, r.nombre);
    const previo = this.mapa.get(k);
    if (previo) {
      if (r.seq < previo.seq) return "viejo";
      if (r.seq === previo.seq && r.raiz === previo.raiz) return "igual";
    } else if (this.mapa.size >= this.max) {
      return "lleno";
    }
    const { firma, ...sin } = r;
    if (!(await this.verificar(cuerpoCanal(sin), firma).catch(() => false))) return "firma-mala";
    if (!previo) {
      this.mapa.set(k, r);
      return "nuevo";
    }
    if (r.seq > previo.seq) {
      this.mapa.set(k, r);
      return "actualizado";
    }
    // Mismo seq, otra raíz: el editor se contradijo. Gana la raíz menor (todos convergen a la misma).
    if (r.raiz < previo.raiz) this.mapa.set(k, r);
    return "conflicto";
  }
}
