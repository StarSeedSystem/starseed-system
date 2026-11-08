/**
 * recepcion-sellada — la entrada de archivos que abre el cifrado de archivo antes de dárselos al motor (MPT1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Todos los receptores de la app (malla de la cuenta, enlace local, TCP nativo, Bluetooth, vínculos entre cuentas) llamaban a
 * `motor.manejarMensaje(canal, data, contexto)`. Ahora llaman a `recibirArchivo(motor, canal, data, contexto)`:
 *   · lo que no es de archivos pasa tal cual;
 *   · `archivo.oferta.cif` y los trozos selladas se abren con `crearCanalSellado` y el motor recibe el claro;
 *   · una oferta en claro (par antiguo) pasa y queda marcada «sin cifrado de archivo» (`modoCifrado`).
 * El almacén de claves es UNO para toda la sesión: la oferta puede llegar por un enlace y los trozos por otros (multitrayecto).
 * Nunca lanza.
 */

import type { CanalArchivos, ContextoRecepcion, MotorArchivos } from "@/lib/network/archivos-malla";
import { crearAlmacenSellos, crearCanalSellado, type CanalSellado } from "@/lib/malla/canal-sellado";

interface Receptor {
  sellado: CanalSellado;
  alimentar(d: string | ArrayBuffer): void;
  ctx: ContextoRecepcion | undefined;
}

const almacen = crearAlmacenSellos();
const receptores = new WeakMap<CanalArchivos, Receptor>();

function receptorDe(motor: Pick<MotorArchivos, "manejarMensaje">, canal: CanalArchivos): Receptor {
  let r = receptores.get(canal);
  if (r) return r;
  const oyentes = new Set<(d: string | ArrayBuffer) => void>();
  const base: CanalArchivos = {
    ...canal,
    alMensaje: (cb) => {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
  };
  const sellado = crearCanalSellado(base, { almacen });
  const rec: Receptor = {
    sellado,
    ctx: undefined,
    alimentar(d) {
      for (const cb of Array.from(oyentes)) cb(d);
    },
  };
  sellado.alMensaje((claro) => {
    try {
      motor.manejarMensaje(sellado, claro, rec.ctx);
    } catch {
      /* un mensaje roto no tumba la recepción */
    }
  });
  receptores.set(canal, rec);
  r = rec;
  return r;
}

/** Entrega al motor un mensaje de archivo llegado por `canal`, abriendo el cifrado de archivo si lo trae. */
export function recibirArchivo(motor: Pick<MotorArchivos, "manejarMensaje">, canal: CanalArchivos, data: string | ArrayBuffer, contexto?: ContextoRecepcion): void {
  try {
    if (typeof data === "string" && !data.startsWith('{"t":"archivo.')) return motor.manejarMensaje(canal, data, contexto);
    const r = receptorDe(motor, canal);
    r.ctx = contexto ?? r.ctx;
    r.alimentar(data);
  } catch {
    /* nunca lanza */
  }
}

/** Solo pruebas. */
export function _reiniciarRecepcionSellada(): void {
  almacen.selladas.clear();
  almacen.modos.clear();
}
