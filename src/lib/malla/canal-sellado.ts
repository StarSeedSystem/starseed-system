/**
 * canal-sellado — envoltorio de `CanalArchivos` que cifra los archivos de punta a punta (MPT1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * El motor de archivos (`archivos-malla.ts`) sigue hablando en claro con este canal. Por debajo:
 *   · saliente: `archivo.oferta` → `archivo.oferta.cif` (sobres cifrados para cada destinatario con la clave de
 *     contenido, el manifiesto y la firma) y cada `archivo.chunk` → trozo sellado con AES-256-GCM (nonce y AAD
 *     de `cifrado-archivo.ts`). Lo demás (aceptar, progreso, fin, ok…) pasa tal cual.
 *   · entrante: abre la oferta cifrada y entrega al motor la oferta en claro; abre cada trozo y descarta
 *     (sin avisar al motor) los que no casan con su tag. Un trozo en claro de una transferencia sellada se descarta.
 *
 * Como envuelve UN canal, sirve igual sobre un canal directo, el multitrayecto (`canal-multitrayecto-vias.ts`) o
 * un relé: quien reenvía solo ve texto cifrado. Con un par antiguo (sin la capacidad `archivo.e2e.v1`) el archivo va
 * como antes y la transferencia queda marcada «sin cifrado de archivo».
 *
 * Los envíos se encolan en orden (el cifrado de WebCrypto es asíncrono) y `bufferedAmount` cuenta lo que espera.
 * Sin DOM ni red propios. Nunca lanza.
 */

import {
  type AbrirSobreFn,
  type ClaveContenido,
  type DestinatarioArchivo,
  type FirmarFn,
  type VerificarFn,
  abrirOferta,
  abrirTrozo,
  BYTES_TAG_GCM,
  crearClaveContenido,
  esOfertaCifrada,
  sellarOferta,
  sellarTrozo,
  TIPO_OFERTA_CIFRADA,
} from "@/lib/malla/cifrado-archivo";
import { TAM_TROZO_POR_DEFECTO, bufAB64, b64ABuf, decodeChunkBinario, encodeChunkBinario, type CanalArchivos } from "@/lib/network/archivos-malla";

export type ModoCifradoArchivo = "archivo" | "sin-cifrado-de-archivo";

/** (MPT1108B) Claves y modos de las transferencias selladas, compartibles entre varios canales sellados (un receptor, varios enlaces). */
export interface AlmacenSellos {
  selladas: Map<string, { clave: ClaveContenido; total: number }>;
  modos: Map<string, ModoCifradoArchivo>;
}

export function crearAlmacenSellos(): AlmacenSellos {
  return { selladas: new Map(), modos: new Map() };
}

export interface OpcionesCanalSellado {
  /** (MPT1108B) Almacén compartido: la oferta abierta por un enlace sirve para los trozos que llegan por otro. */
  almacen?: AlmacenSellos;
  /** Neuronas destinatarias del archivo (como emisor). Sin esto, este canal no sella lo que envía. */
  destinatarios?: () => DestinatarioArchivo[] | Promise<DestinatarioArchivo[]>;
  /** ¿El par anuncia `archivo.e2e.v1`? Solo `true` sella; `false` = par antiguo (en claro, marcado). Sin función: sella. */
  parCifra?: () => boolean;
  firmar?: FirmarFn | null;
  verificar?: VerificarFn | null;
  /** Cómo abrir un sobre (como receptor). Por defecto, la privada ECDH de esta neurona. */
  abrirSobre?: AbrirSobreFn;
  /** Como receptor: rechazar ofertas en claro (sin cifrado de archivo). */
  exigirCifrado?: boolean;
  /** Aviso del modo con el que se decidió cada transferencia. */
  alModo?: (id: string, modo: ModoCifradoArchivo, detalle?: { firmante?: string | null }) => void;
}

export interface CanalSellado extends CanalArchivos {
  modoCifrado(id: string): ModoCifradoArchivo | null;
  /** Trozos entrantes descartados por no pasar el tag / llegar en claro a una transferencia sellada. */
  descartados(): number;
}

interface Sellada {
  clave: ClaveContenido;
  total: number;
}

const MAX_SELLADAS = 64;
const PREFIJO_OFERTA = '{"t":"archivo.oferta"';
const PREFIJO_CHUNK = '{"t":"archivo.chunk"';
const FINALES = ['{"t":"archivo.ok"', '{"t":"archivo.cancelar"', '{"t":"archivo.rechazar"'];

function leerJson(texto: string): Record<string, unknown> | null {
  try {
    const x = JSON.parse(texto);
    return x && typeof x === "object" ? (x as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function crearCanalSellado(base: CanalArchivos, opts: OpcionesCanalSellado = {}): CanalSellado {
  const selladas = opts.almacen?.selladas ?? new Map<string, Sellada>();
  const modos = opts.almacen?.modos ?? new Map<string, ModoCifradoArchivo>();
  let descartes = 0;
  let pendientesBytes = 0;
  let pendientes = 0;
  let colaTx: Promise<unknown> = Promise.resolve();
  let colaRx: Promise<unknown> = Promise.resolve();

  const recordar = (id: string, s: Sellada): void => {
    selladas.delete(id);
    selladas.set(id, s);
    while (selladas.size > MAX_SELLADAS) selladas.delete(selladas.keys().next().value as string);
  };
  const fijarModo = (id: string, m: ModoCifradoArchivo, detalle?: { firmante?: string | null }): void => {
    modos.set(id, m);
    while (modos.size > MAX_SELLADAS * 2) modos.delete(modos.keys().next().value as string);
    try {
      opts.alModo?.(id, m, detalle);
    } catch {
      /* informativo */
    }
  };
  const olvidarSiFinal = (texto: string): void => {
    if (!FINALES.some((p) => texto.startsWith(p))) return;
    const m = leerJson(texto);
    if (m && typeof m.id === "string") selladas.delete(m.id);
  };

  /** Encola un envío asíncrono (en orden). `peso` = bytes que espera, para la contrapresión. */
  const encolar = (peso: number, tarea: () => Promise<boolean>): void => {
    pendientes++;
    pendientesBytes += peso;
    colaTx = colaTx
      .then(tarea)
      .catch(() => false)
      .finally(() => {
        pendientes--;
        pendientesBytes -= peso;
      });
  };

  /** Prepara el mensaje de texto saliente: devuelve el texto a mandar (sellado si toca) o null para no mandar nada. */
  const prepararTexto = async (texto: string): Promise<string | null> => {
    if (texto.startsWith(PREFIJO_OFERTA)) {
      const oferta = leerJson(texto);
      const id = oferta && typeof oferta.id === "string" ? oferta.id : null;
      if (!oferta || !id || !opts.destinatarios) return texto;
      if (opts.parCifra && !opts.parCifra()) {
        fijarModo(id, "sin-cifrado-de-archivo");
        return texto; // par antiguo: como antes, marcado
      }
      let sello = selladas.get(id);
      const dest = await opts.destinatarios();
      if (!sello) {
        const clave = await crearClaveContenido(id);
        if (!clave) return null;
        sello = { clave, total: typeof oferta.trozos === "number" ? oferta.trozos : 0 };
      }
      const msg = await sellarOferta(oferta, sello.clave, dest, { firmar: opts.firmar });
      if (!msg) {
        selladas.delete(id);
        return null; // nunca se manda la oferta en claro si debía ir sellada
      }
      recordar(id, sello);
      fijarModo(id, "archivo");
      return JSON.stringify(msg);
    }
    if (texto.startsWith(PREFIJO_CHUNK)) {
      const m = leerJson(texto);
      const id = m && typeof m.id === "string" ? m.id : null;
      const s = id ? selladas.get(id) : undefined;
      if (!m || !id || !s) return texto;
      if (typeof m.index !== "number" || typeof m.datosB64 !== "string") return null;
      const ct = await sellarTrozo(s.clave, id, m.index, s.total, b64ABuf(m.datosB64));
      return ct ? JSON.stringify({ t: "archivo.chunk", id, index: m.index, datosB64: bufAB64(ct) }) : null;
    }
    return texto;
  };

  const enviar = (texto: string): boolean => {
    const simple = !texto.startsWith(PREFIJO_OFERTA) && !texto.startsWith(PREFIJO_CHUNK);
    if (simple && pendientes === 0) {
      const ok = base.enviar(texto);
      olvidarSiFinal(texto);
      return ok;
    }
    encolar(texto.length, async () => {
      const t = await prepararTexto(texto);
      if (t === null) return false;
      return base.enviar(t);
    });
    return true;
  };

  const enviarBinario = (buf: ArrayBuffer): boolean => {
    encolar(buf.byteLength, async () => {
      const dec = decodeChunkBinario(buf);
      const s = dec ? selladas.get(dec.id) : undefined;
      if (!dec || !s) return !!base.enviarBinario?.(buf);
      const ct = await sellarTrozo(s.clave, dec.id, dec.index, s.total, dec.datos);
      return ct ? !!base.enviarBinario?.(encodeChunkBinario(dec.id, dec.index, ct)) : false;
    });
    return true;
  };

  const enviarConAcuse = async (texto: string): Promise<boolean> => {
    await colaTx.catch(() => undefined);
    const t = await prepararTexto(texto);
    if (t === null) return false;
    const ok = base.enviarConAcuse ? await base.enviarConAcuse(t) : base.enviar(t);
    olvidarSiFinal(texto);
    return ok;
  };

  /* ── Recepción ── */
  const oyentes = new Set<(d: string | ArrayBuffer) => void>();
  let bajaBase: (() => void) | null = null;
  const emitir = (d: string | ArrayBuffer): void => {
    for (const cb of Array.from(oyentes)) {
      try {
        cb(d);
      } catch {
        /* un oyente roto no afecta a los demás */
      }
    }
  };
  const rechazar = (id: string, motivo: string): void => {
    try {
      base.enviar(JSON.stringify({ t: "archivo.rechazar", id, motivo }));
    } catch {
      /* noop */
    }
  };

  const procesar = async (d: string | ArrayBuffer): Promise<void> => {
    if (typeof d === "string") {
      if (d.startsWith(`{"t":"${TIPO_OFERTA_CIFRADA}"`)) {
        const msg = leerJson(d);
        if (!esOfertaCifrada(msg)) return;
        const abierta = await abrirOferta(msg, { abrir: opts.abrirSobre, verificar: opts.verificar });
        if (!abierta) {
          rechazar(msg.id, "Cifrado de archivo: la oferta no es para este aparato o no es válida.");
          return;
        }
        recordar(abierta.manifiesto.id, { clave: abierta.clave, total: abierta.manifiesto.trozos });
        fijarModo(abierta.manifiesto.id, "archivo", { firmante: abierta.firmante?.fp ?? null });
        emitir(JSON.stringify(abierta.oferta));
        return;
      }
      if (d.startsWith(PREFIJO_OFERTA)) {
        const of = leerJson(d);
        const id = of && typeof of.id === "string" ? of.id : null;
        if (id && opts.exigirCifrado) {
          rechazar(id, "Este aparato exige cifrado de archivo de punta a punta y la oferta venía en claro.");
          return;
        }
        if (id) fijarModo(id, "sin-cifrado-de-archivo");
        emitir(d);
        return;
      }
      if (d.startsWith(PREFIJO_CHUNK)) {
        const m = leerJson(d);
        const id = m && typeof m.id === "string" ? m.id : null;
        const s = id ? selladas.get(id) : undefined;
        if (!s || !id) return void emitir(d);
        const claro = typeof m!.index === "number" && typeof m!.datosB64 === "string" ? await abrirTrozo(s.clave, id, m!.index, s.total, b64ABuf(m!.datosB64)) : null;
        if (!claro) {
          descartes++;
          return;
        }
        emitir(JSON.stringify({ t: "archivo.chunk", id, index: m!.index, datosB64: bufAB64(claro) }));
        return;
      }
      olvidarSiFinal(d);
      return emitir(d);
    }
    const dec = decodeChunkBinario(d);
    const s = dec ? selladas.get(dec.id) : undefined;
    if (!dec || !s) return emitir(d);
    const claro = await abrirTrozo(s.clave, dec.id, dec.index, s.total, dec.datos);
    if (!claro) {
      descartes++;
      return;
    }
    emitir(encodeChunkBinario(dec.id, dec.index, claro));
  };

  const canal: CanalSellado = {
    enviar,
    ...(base.enviarBinario ? { enviarBinario } : {}),
    ...(base.enviarConAcuse ? { enviarConAcuse } : {}),
    bufferedAmount: () => (base.bufferedAmount?.() ?? 0) + pendientesBytes,
    ...(base.tamanoTrozo
      ? {
          tamanoTrozo: () => {
            const t = base.tamanoTrozo?.();
            return typeof t === "number" && t > BYTES_TAG_GCM ? t - BYTES_TAG_GCM : TAM_TROZO_POR_DEFECTO;
          },
        }
      : {}),
    // La oferta sellada pesa más (base64 dentro de un sobre): se le da menos margen al motor para aligerarla.
    ...(base.maxTextoBytes ? { maxTextoBytes: () => Math.floor((base.maxTextoBytes?.() ?? 0) * 0.55) } : {}),
    ...(base.esperarListo ? { esperarListo: () => base.esperarListo!() } : {}),
    ...(base.enlaceArriba ? { enlaceArriba: () => base.enlaceArriba!() } : {}),
    ...(base.alListoTarde ? { alListoTarde: () => base.alListoTarde!() } : {}),
    ...(base.rutaMedida ? { rutaMedida: () => base.rutaMedida!() } : {}),
    ...(base.resumenVias ? { resumenVias: () => base.resumenVias!() } : {}),
    modoCifrado: (id) => modos.get(id) ?? null,
    descartados: () => descartes,
    alMensaje(cb) {
      oyentes.add(cb);
      if (!bajaBase) {
        try {
          bajaBase = base.alMensaje((d) => {
            colaRx = colaRx.then(() => procesar(d)).catch(() => undefined);
          });
        } catch {
          bajaBase = () => undefined;
        }
      }
      return () => {
        oyentes.delete(cb);
        if (!oyentes.size && bajaBase) {
          try {
            bajaBase();
          } catch {
            /* noop */
          }
          bajaBase = null;
        }
      };
    },
  };
  return canal;
}
