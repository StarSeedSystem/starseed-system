/**
 * relevo/tabla — qué neuronas alcanzan mis vecinas, por qué carril y con qué medida (REL1111I · 2026-11-11).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/red-sin-dependencias.md` §14. Módulo PURO (sin red, sin DOM, sin `node:*`).
 *
 * Cada neurona manda a sus vecinas DIRECTAS de la misma cuenta, por cada carril abierto con ellas, un anuncio corto
 * `tu.rva`: quién es, si hace de relevo y la lista de SUS vecinas directas (neurona, carril, kb/s y ms medidos, y si
 * esa vecina entiende el relevo). Con eso, A sabe que B llega a C sin que nadie tenga que conocer la red entera.
 *
 *   · Fase 1 = un solo relevo: el anuncio solo lleva vecinas directas (no se reanuncia lo aprendido), así que la ruta
 *     más larga posible es A → B → C. Con eso no puede formarse un bucle de anuncios.
 *   · Caducidad: un anuncio vale `CADUCA_MS` (3,5 anuncios). Además, en cuanto cae mi carril con una vecina, se olvida
 *     todo lo que ella anunció (no hace falta esperar a que caduque), y un anuncio nuevo sustituye entero al anterior
 *     (si B deja de ver a C, su siguiente anuncio ya no lo lleva; B lo manda en cuanto cambia, no a los 10 s).
 *   · Solo se aceptan anuncios de una vecina de MI cuenta y cuyo `n` es la neurona que el carril ya probó (saludo firmado):
 *     nadie puede anunciarse por otra.
 *
 * Nunca lanza.
 */

export const T_ANUNCIO = "tu.rva";
export const VERSION_RELEVO = 1;
/** Cada cuánto se repite el anuncio aunque nada cambie. */
export const ANUNCIO_MS = 10_000;
/** Lo que vale un anuncio sin renovarse. */
export const CADUCA_MS = 35_000;
export const MAX_VECINAS_ANUNCIO = 24;
/** Carriles que pueden llevar un relevo (P2P de la misma cuenta; ni el relé del servidor, ni LoRa, ni vínculos ajenos). */
export const CARRILES_RELEVO: ReadonlySet<string> = new Set(["ble", "nativo", "local", "cuenta"]);

/** Una vecina directa tal como la anuncia quien la tiene. */
export interface VecinaAnunciada {
  /** Neurona. */
  n: string;
  /** Carril (`ble`, `nativo`, `local`, `cuenta`). */
  c: string;
  /** kb/s medidos (null = sin medir). */
  k: number | null;
  /** ida y vuelta en ms medida (null = sin medir). */
  l: number | null;
  /** 1 = esa vecina entiende el relevo (me mandó su propio anuncio). Una app anterior queda en 0 y nunca es destino de un relevo. */
  r: 0 | 1;
  /** Huella de la identidad de malla de esa vecina, tal como la probó su saludo con quien anuncia (`id:…`). */
  h?: string;
  /** Pública ECDH de cifrado de esa vecina (la que ella anunció): para sellarle un mensaje sin haberla visto nunca. */
  e?: JsonWebKey;
}

/** Sanea una pública ECDH P-256 en JWK (solo los campos públicos). */
export function leerClaveEc(x: unknown): JsonWebKey | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || o.kty !== "EC" || o.crv !== "P-256") return null;
  if (typeof o.x !== "string" || typeof o.y !== "string" || o.x.length > 64 || o.y.length > 64 || "d" in o) return null;
  return { kty: "EC", crv: "P-256", x: o.x, y: o.y };
}

export interface AnuncioRelevo {
  t: typeof T_ANUNCIO;
  v: 1;
  /** Quién anuncia. */
  n: string;
  /** Su cuenta. */
  u?: string;
  /** Nombre del aparato (para «por relevo de <nombre>»). */
  nm?: string;
  /** Número de secuencia (crece en cada anuncio de esta neurona). */
  s: number;
  /** 1 = acepto hacer de relevo ahora (ajuste encendido y topes de batería y datos con margen). */
  rel: 0 | 1;
  /** Mi pública ECDH de cifrado. */
  e?: JsonWebKey;
  vs: VecinaAnunciada[];
}

function corto(x: unknown, n: number): string | null {
  return typeof x === "string" && x.length > 0 && x.length <= n ? x : null;
}
function numONulo(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
}

export function crearAnuncio(p: { yo: string; uid?: string | null; nombre?: string | null; seq: number; ofrezco: boolean; clave?: JsonWebKey | null; vecinas: VecinaAnunciada[] }): AnuncioRelevo {
  const vistas = new Set<string>();
  const vs: VecinaAnunciada[] = [];
  for (const v of p.vecinas) {
    if (v.n === p.yo || vistas.has(`${v.n}|${v.c}`)) continue;
    vistas.add(`${v.n}|${v.c}`);
    const e = v.e ? leerClaveEc(v.e) : null;
    vs.push({ n: v.n, c: v.c, k: numONulo(v.k), l: numONulo(v.l), r: v.r ? 1 : 0, ...(v.h ? { h: v.h } : {}), ...(e ? { e } : {}) });
    if (vs.length >= MAX_VECINAS_ANUNCIO) break;
  }
  return {
    t: T_ANUNCIO,
    v: 1,
    n: p.yo,
    ...(p.uid ? { u: p.uid } : {}),
    ...(p.nombre ? { nm: p.nombre.slice(0, 60) } : {}),
    s: p.seq,
    rel: p.ofrezco ? 1 : 0,
    ...(p.clave && leerClaveEc(p.clave) ? { e: leerClaveEc(p.clave) as JsonWebKey } : {}),
    vs,
  };
}

/** Lee y sanea un anuncio recibido. Null si no lo es. */
export function leerAnuncio(x: unknown): AnuncioRelevo | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || o.t !== T_ANUNCIO || o.v !== 1) return null;
  const n = corto(o.n, 120);
  if (!n || typeof o.s !== "number" || !Number.isFinite(o.s)) return null;
  const vs: VecinaAnunciada[] = [];
  if (Array.isArray(o.vs)) {
    for (const v of o.vs.slice(0, MAX_VECINAS_ANUNCIO)) {
      const w = v as Record<string, unknown> | null;
      const vn = corto(w?.n, 120);
      const vc = corto(w?.c, 12);
      if (!vn || !vc || !CARRILES_RELEVO.has(vc) || vn === n) continue;
      const h = corto(w?.h, 64);
      const e = leerClaveEc(w?.e);
      vs.push({ n: vn, c: vc, k: numONulo(w?.k), l: numONulo(w?.l), r: w?.r === 1 ? 1 : 0, ...(h ? { h } : {}), ...(e ? { e } : {}) });
    }
  }
  const u = corto(o.u, 120);
  const nm = corto(o.nm, 60);
  const e = leerClaveEc(o.e);
  return { t: T_ANUNCIO, v: 1, n, ...(u ? { u } : {}), ...(nm ? { nm } : {}), s: o.s, rel: o.rel === 1 ? 1 : 0, ...(e ? { e } : {}), vs };
}

interface Entrada {
  anuncio: AnuncioRelevo;
  recibido: number;
}

/** Lo que sé de una vecina como posible relevo hacia un destino. */
export interface RelevoPosible {
  relevo: string;
  nombre: string | null;
  /** El tramo relevo → destino tal como lo midió el relevo. */
  tramo: VecinaAnunciada;
  ofrece: boolean;
  edadMs: number;
}

export class TablaAlcance {
  private porVecina = new Map<string, Entrada>();

  /**
   * Registra el anuncio de una vecina directa. `deVecina` es la neurona que probó el carril (no lo que diga el anuncio).
   * Devuelve «nuevo», «cambio», «igual» o «rechazado».
   */
  registrar(deVecina: string, a: AnuncioRelevo, ahora: number): "nuevo" | "cambio" | "igual" | "rechazado" {
    if (a.n !== deVecina) return "rechazado";
    const prev = this.porVecina.get(deVecina);
    if (prev && a.s < prev.anuncio.s && ahora - prev.recibido < CADUCA_MS) return "rechazado"; // anuncio viejo que llegó tarde
    this.porVecina.set(deVecina, { anuncio: a, recibido: ahora });
    if (!prev) return "nuevo";
    return firmaAnuncio(prev.anuncio) === firmaAnuncio(a) ? "igual" : "cambio";
  }

  /** Olvida todo lo de una vecina (cayó mi carril con ella). */
  olvidar(vecina: string): boolean {
    return this.porVecina.delete(vecina);
  }

  /** Quita lo caducado; devuelve las vecinas olvidadas. */
  caducar(ahora: number): string[] {
    const fuera: string[] = [];
    for (const [n, e] of this.porVecina) {
      if (ahora - e.recibido > CADUCA_MS) {
        this.porVecina.delete(n);
        fuera.push(n);
      }
    }
    return fuera;
  }

  /** ¿Esta vecina habla relevo? (me mandó un anuncio vigente). */
  hablaRelevo(vecina: string, ahora: number): boolean {
    const e = this.porVecina.get(vecina);
    return !!e && ahora - e.recibido <= CADUCA_MS;
  }

  nombreDe(n: string): string | null {
    const e = this.porVecina.get(n);
    if (e?.anuncio.nm) return e.anuncio.nm;
    return null;
  }

  /** Huella de `n` según lo que anuncian mis vecinas vigentes (null si nadie la anuncia o no coinciden). */
  huellaDe(n: string, ahora: number): string | null {
    let h: string | null = null;
    for (const [, e] of this.porVecina) {
      if (ahora - e.recibido > CADUCA_MS) continue;
      for (const v of e.anuncio.vs) {
        if (v.n !== n || !v.h) continue;
        if (h && h !== v.h) return null; // dos vecinas dicen cosas distintas: no se fía de ninguna
        h = v.h;
      }
    }
    return h;
  }

  /** Pública ECDH de `n`: la que anunció ella misma (si es vecina) o la que repiten mis vecinas (si todas coinciden). */
  claveDe(n: string, ahora: number): JsonWebKey | null {
    const propia = this.porVecina.get(n);
    if (propia?.anuncio.e && ahora - propia.recibido <= CADUCA_MS) return propia.anuncio.e;
    let k: JsonWebKey | null = null;
    for (const [, e] of this.porVecina) {
      if (ahora - e.recibido > CADUCA_MS) continue;
      for (const v of e.anuncio.vs) {
        if (v.n !== n || !v.e) continue;
        if (k && (k.x !== v.e.x || k.y !== v.e.y)) return null;
        k = v.e;
      }
    }
    return k;
  }

  /** Vecinas que anuncian un carril directo con `destino` (y que `destino` entiende el relevo). Solo vigentes. */
  relevosHacia(destino: string, ahora: number): RelevoPosible[] {
    const out: RelevoPosible[] = [];
    for (const [n, e] of this.porVecina) {
      if (n === destino || ahora - e.recibido > CADUCA_MS) continue;
      // El mejor tramo de esa vecina al destino (puede tener Bluetooth y red local a la vez).
      let mejor: VecinaAnunciada | null = null;
      for (const v of e.anuncio.vs) {
        if (v.n !== destino || v.r !== 1) continue;
        if (!mejor || (v.k ?? 0) > (mejor.k ?? 0)) mejor = v;
      }
      if (mejor) out.push({ relevo: n, nombre: e.anuncio.nm ?? null, tramo: mejor, ofrece: e.anuncio.rel === 1, edadMs: ahora - e.recibido });
    }
    return out;
  }

  /** Destinos alcanzables por relevo (para la interfaz y el registro). */
  destinos(ahora: number): string[] {
    const s = new Set<string>();
    for (const [n, e] of this.porVecina) {
      if (ahora - e.recibido > CADUCA_MS || e.anuncio.rel !== 1) continue;
      for (const v of e.anuncio.vs) if (v.r === 1 && v.n !== n) s.add(v.n);
    }
    return Array.from(s).sort();
  }

  vecinas(): string[] {
    return Array.from(this.porVecina.keys()).sort();
  }
}

/** Lo que importa de un anuncio para decidir si cambió (sin la secuencia ni las medidas finas). */
function firmaAnuncio(a: AnuncioRelevo): string {
  return `${a.rel}|${a.vs.map((v) => `${v.n}:${v.c}:${v.r}`).sort().join(",")}`;
}
