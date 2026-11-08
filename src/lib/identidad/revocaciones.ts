/**
 * (IDN1108A) Revocación de neuronas por la malla, sin servidor.
 *
 * La maestra firma una LISTA ACUMULATIVA de neuronas revocadas, con un contador `seq` que solo sube.
 * La lista se difunde (gossip) por cualquier enlace del transporte universal, en un canal propio. Cada
 * neurona acepta una lista solo si: (1) su ancla de cuenta es conocida y de fiar, (2) la firma cuadra y
 * (3) `seq` es mayor que el que ya tenía de esa cuenta. Quien verifica certificados rechaza lo revocado.
 * Lo que NO hace: obligar a una neurona revocada a olvidar su certificado — solo que los demás no la acepten.
 */

import { almacenIdentidad, type AlmacenKV } from "./almacen";
import type { AnclaCuenta, Firmante } from "./certificado-neurona";
import { canonico, huellaMaestra, pubLimpia, verificarFirma } from "./util";

export const CANAL_REVOCACIONES = "identidad.revocaciones";
const CLAVE = "revocaciones.v1";
const MAX_ENTRADAS = 2000;

export interface NeuronaRevocada {
  neuronaId: string;
  /** Huella `id:…` del aparato, si se conoce (cubre el caso de que reutilice otro neuronaId). */
  huella?: string;
  en: number;
  motivo?: string;
}

export interface ListaRevocacion {
  v: 1;
  mfp: string;
  mpub: JsonWebKey;
  seq: number;
  emitido: number;
  revocadas: NeuronaRevocada[];
  sig: string;
}

function mensajeLista(l: Omit<ListaRevocacion, "sig" | "mpub">): string {
  return canonico({
    t: "ss.revocaciones.v1",
    mfp: l.mfp,
    seq: l.seq,
    emitido: l.emitido,
    revocadas: l.revocadas.map((r) => ({ neuronaId: r.neuronaId, huella: r.huella, en: r.en, motivo: r.motivo })),
  });
}

/** Firma la lista siguiente: la previa (si hay) más las nuevas revocaciones, con `seq` + 1. */
export async function firmarListaRevocacion(
  firmante: Firmante,
  previa: ListaRevocacion | null,
  nuevas: ReadonlyArray<{ neuronaId: string; huella?: string; motivo?: string }>,
  ahora = Date.now(),
): Promise<ListaRevocacion | null> {
  const mpub = pubLimpia(firmante.mpub);
  if (!mpub) return null;
  const mfp = await huellaMaestra(mpub);
  if (!mfp || (previa && previa.mfp !== mfp)) return null;
  const mapa = new Map<string, NeuronaRevocada>();
  for (const r of previa?.revocadas ?? []) mapa.set(r.neuronaId, r);
  for (const n of nuevas) if (n.neuronaId && !mapa.has(n.neuronaId)) mapa.set(n.neuronaId, { neuronaId: n.neuronaId, huella: n.huella, en: ahora, motivo: n.motivo });
  const revocadas = [...mapa.values()].slice(-MAX_ENTRADAS);
  const base = { v: 1 as const, mfp, seq: (previa?.seq ?? 0) + 1, emitido: ahora, revocadas };
  const sig = await firmante.firmar(mensajeLista(base));
  return sig ? { ...base, mpub, sig } : null;
}

/** ¿La lista está bien formada y firmada por la maestra de su ancla (que debe ser de fiar)? */
export async function verificarListaRevocacion(lista: unknown, anclas: readonly AnclaCuenta[], umbralAnunciada = 0.6): Promise<boolean> {
  try {
    const l = lista as Partial<ListaRevocacion> | null;
    if (!l || l.v !== 1 || !l.mfp || !l.mpub || !l.sig || typeof l.seq !== "number" || !Number.isInteger(l.seq) || l.seq < 1 || !Array.isArray(l.revocadas)) return false;
    if (l.revocadas.length > MAX_ENTRADAS) return false;
    if (l.revocadas.some((r) => !r || typeof r.neuronaId !== "string" || typeof r.en !== "number")) return false;
    const ancla = anclas.find((a) => a.mfp === l.mfp);
    if (!ancla || (ancla.nivel === "anunciada" && ancla.confianza < umbralAnunciada)) return false;
    const mpub = pubLimpia(l.mpub);
    if (!mpub || (await huellaMaestra(mpub)) !== l.mfp) return false;
    return verificarFirma(mpub, l.sig, mensajeLista(l as ListaRevocacion));
  } catch {
    return false;
  }
}

export function crearRevocaciones(almacen: AlmacenKV = almacenIdentidad()) {
  let cache: Map<string, ListaRevocacion> | null = null;
  async function cargar(): Promise<Map<string, ListaRevocacion>> {
    if (cache) return cache;
    const l = await almacen.leer<ListaRevocacion[]>(CLAVE);
    cache = new Map((Array.isArray(l) ? l : []).map((x) => [x.mfp, x]));
    return cache;
  }
  const guardar = async () => almacen.escribir(CLAVE, [...(cache ?? new Map()).values()]);

  return {
    cargar,
    /** Acepta una lista si verifica y su `seq` supera a la que había. Devuelve true solo si es NUEVA (conviene reenviarla). */
    async aceptar(lista: unknown, anclas: readonly AnclaCuenta[]): Promise<boolean> {
      if (!(await verificarListaRevocacion(lista, anclas))) return false;
      const l = lista as ListaRevocacion;
      const m = await cargar();
      const actual = m.get(l.mfp);
      if (actual && actual.seq >= l.seq) return false;
      m.set(l.mfp, l);
      await guardar();
      return true;
    },
    async lista(mfp: string): Promise<ListaRevocacion | null> {
      return (await cargar()).get(mfp) ?? null;
    },
    /** Predicado síncrono para `verificarCertificadoNeurona` (llamar a `cargar()` antes una vez). */
    estaRevocada(r: { mfp: string; neuronaId: string; huella: string }): boolean {
      const l = cache?.get(r.mfp);
      return !!l?.revocadas.some((x) => x.neuronaId === r.neuronaId || (!!x.huella && x.huella === r.huella));
    },
  };
}
export type Revocaciones = ReturnType<typeof crearRevocaciones>;

/* ═════════════ Gossip por el transporte universal ═════════════ */

export interface DepsGossip {
  revocaciones: Revocaciones;
  anclas: () => Promise<AnclaCuenta[]>;
  /** Enlaces abiertos ahora (cualquier tipo: LAN, BLE, WebRTC, relé…). */
  enlaces: () => Promise<Array<{ id: string }>>;
  enviar: (destino: { enlaceId: string }, canal: string, cuerpo: unknown) => Promise<unknown>;
  alRecibir: (canal: string, cb: (m: { cuerpo: unknown; origen: { enlaceId: string } }) => void) => () => void;
}

/**
 * Escucha el canal de revocaciones y reenvía por los demás enlaces lo que es NUEVO (así no se reenvía en bucle).
 * Devuelve `difundir(lista)` para publicar una lista propia y `parar()`.
 */
export function iniciarGossipRevocaciones(deps: DepsGossip) {
  async function reenviar(lista: ListaRevocacion, salvo?: string) {
    let enlaces: Array<{ id: string }> = [];
    try {
      enlaces = await deps.enlaces();
    } catch {
      enlaces = [];
    }
    for (const e of enlaces) {
      if (e.id === salvo) continue;
      try {
        await deps.enviar({ enlaceId: e.id }, CANAL_REVOCACIONES, lista);
      } catch {
        /* un enlace caído no frena a los demás */
      }
    }
  }
  const parar = deps.alRecibir(CANAL_REVOCACIONES, (m) => {
    void (async () => {
      try {
        if (await deps.revocaciones.aceptar(m.cuerpo, await deps.anclas())) await reenviar(m.cuerpo as ListaRevocacion, m.origen.enlaceId);
      } catch {
        /* basura: se ignora */
      }
    })();
  });
  return {
    parar,
    /** Publica una lista propia ya firmada: la guarda y la manda por todos los enlaces. */
    async difundir(lista: ListaRevocacion): Promise<boolean> {
      const nueva = await deps.revocaciones.aceptar(lista, await deps.anclas());
      await reenviar(lista);
      return nueva;
    },
  };
}
