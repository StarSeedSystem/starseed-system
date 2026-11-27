// Del NFC al mejor transporte (contrato: architecture/nfc-neuronas.md §1 y §4).
// Módulo puro: sin red, disco ni Node. Con la tarjeta ya verificada decide POR DÓNDE viaja cada cosa:
// lo pequeño (< 32 KB) por el propio NFC; archivos, folders y cerebros por la sesión cifrada, en todos
// los transportes comunes a la vez (BLE, Wi‑Fi, LAN, malla). El cifrado se inyecta (X25519 + derivación).

import type { Relacion } from "./preferencias";
import type { TarjetaNeurona, TipoTransporte } from "./tarjeta";

export const LIMITE_NFC_BYTES = 32 * 1024;

export type TipoCarga = "texto" | "enlace" | "oferta" | "archivo" | "folder" | "cerebro" | "permiso";
export type Permiso = "capacidades" | "capas" | "almacenamiento" | "senales" | "internet_banco" | "internet_mesh";

export interface Carga {
  tipo: TipoCarga;
  bytes: number;
  permiso?: Permiso;
}

export type MotivoNoViaja = "sin_toque" | "sin_transporte" | "permiso_sin_nombre" | "carga_invalida";

export type PlanTraspaso =
  | { ok: true; via: "nfc"; transportes: [] }
  | { ok: true; via: "sesion"; transportes: TipoTransporte[]; cifrada: true }
  | { ok: false; motivo: MotivoNoViaja };

export interface EntradaPlan {
  propia: TarjetaNeurona;
  ajena: TarjetaNeurona;
  relacion: Relacion;
  /** El usuario tocó «aceptar» para ESTA carga. */
  toque: boolean;
  carga: Carga;
  /** Transportes que ahora mismo responden en esta neurona (el enrutador los mide). */
  vivos: readonly TipoTransporte[];
}

/** Del más rápido al más lento: el enrutador reparte, pero esta es la prioridad si solo cabe uno. */
export const ORDEN_TRANSPORTES: readonly TipoTransporte[] = ["wifi-direct", "lan", "ble", "malla"];

const PEQUENAS: readonly TipoCarga[] = ["texto", "enlace", "oferta"];
const esPropia = (r: Relacion) => r === "misma_cuenta" || r === "nodo_propio";

/** Transportes que las dos tarjetas declaran, que están vivos aquí, en orden de prioridad y sin repetir. */
export function transportesComunes(
  propia: TarjetaNeurona,
  ajena: TarjetaNeurona,
  vivos: readonly TipoTransporte[],
): TipoTransporte[] {
  const mios = new Set(propia.transportes.map((t) => t.tipo));
  const suyos = new Set(ajena.transportes.map((t) => t.tipo));
  return ORDEN_TRANSPORTES.filter((t) => mios.has(t) && suyos.has(t) && vivos.includes(t));
}

/** Nada se acepta de una neurona desconocida sin un toque; lo propio solo pide toque si mueve datos grandes. */
export function requiereToque(relacion: Relacion, carga: Carga): boolean {
  if (esPropia(relacion)) return carga.tipo === "cerebro" || carga.tipo === "permiso";
  return true;
}

export function planificarTraspaso(e: EntradaPlan): PlanTraspaso {
  const { carga } = e;
  if (!Number.isFinite(carga.bytes) || carga.bytes < 0) return { ok: false, motivo: "carga_invalida" };
  if (carga.tipo === "permiso" && !carga.permiso) return { ok: false, motivo: "permiso_sin_nombre" };
  if (requiereToque(e.relacion, carga) && !e.toque) return { ok: false, motivo: "sin_toque" };
  if (PEQUENAS.includes(carga.tipo) && carga.bytes < LIMITE_NFC_BYTES) return { ok: true, via: "nfc", transportes: [] };
  const transportes = transportesComunes(e.propia, e.ajena, e.vivos);
  if (transportes.length === 0) return { ok: false, motivo: "sin_transporte" };
  return { ok: true, via: "sesion", transportes, cifrada: true };
}

// --- Sesión cifrada: clave efímera X25519 de las dos tarjetas ---

/** Contexto idéntico en las dos neuronas (claves y nonces ordenados), para derivar la misma clave. */
export function contextoSesion(a: TarjetaNeurona, b: TarjetaNeurona): string {
  const partes = [a, b]
    .map((t) => `${t.neuronaId}:${t.claveEfimera}:${t.nonce}`)
    .sort();
  return `starseed-nfc-traspaso-v1|${partes.join("|")}`;
}

export interface MotorCifrado {
  /** X25519: secreto compartido a partir de mi privada efímera y la pública efímera de la otra. */
  acordar(privadaHex: string, publicaAjenaHex: string): Uint8Array;
  /** HKDF o similar: clave simétrica de 32 bytes ligada al contexto. */
  derivar(secreto: Uint8Array, contexto: string): Uint8Array;
}

export interface SesionTraspaso {
  id: string;
  clave: Uint8Array;
  transportes: TipoTransporte[];
}

const aHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Abre la sesión con la tarjeta ya verificada. El id sale del contexto, igual en ambos lados. */
export function abrirSesion(
  propia: TarjetaNeurona,
  ajena: TarjetaNeurona,
  privadaEfimeraHex: string,
  transportes: TipoTransporte[],
  motor: MotorCifrado,
): SesionTraspaso {
  const contexto = contextoSesion(propia, ajena);
  const clave = motor.derivar(motor.acordar(privadaEfimeraHex, ajena.claveEfimera), contexto);
  const id = aHex(motor.derivar(clave, `${contexto}|id`)).slice(0, 32);
  return { id, clave, transportes };
}
