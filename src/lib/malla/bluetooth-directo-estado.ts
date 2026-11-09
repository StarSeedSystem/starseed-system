"use client";

/**
 * bluetooth-directo-estado — el estado del Bluetooth directo de la app nativa para la interfaz (BLE1108A).
 * Contrato: `architecture/bluetooth-directo.md`. Lee `ble_estado` al montar y cada 15 s, y escucha
 * `ble://cambio`; fuera de la app nativa devuelve null (en el navegador no hay Bluetooth directo).
 */

import { useEffect, useState } from "react";
import { esAppNativa, puenteNativo } from "@/lib/nativa/puente";
import {
  COMANDO_ABRIR_BLE,
  COMANDO_ACTIVAR_BLE,
  COMANDO_CANAL_RAPIDO_BLE,
  COMANDO_COMPARTIR_REGISTRO_BLE,
  COMANDO_ESTADO_BLE,
  COMANDO_PERMISO_BLE,
  EVENTO_CAMBIO_BLE,
  leerEstadoBle,
  type EstadoBleNativo,
} from "./bluetooth-directo";
import { CLAVE_CANAL_RAPIDO_BLE, fijarCanalRapido, leerAjusteCanalRapido, type DepsAjusteCanalRapido } from "./canal-rapido-ajuste"; // BLE1109B

export function useEstadoBluetooth(): EstadoBleNativo | null {
  const [estado, setEstado] = useState<EstadoBleNativo | null>(null);
  useEffect(() => {
    if (!esAppNativa()) return;
    let vivo = true;
    let baja: (() => void) | null = null;
    const p = puenteNativo();
    const leer = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void p.llamar<unknown>(COMANDO_ESTADO_BLE).then((r) => {
        if (vivo && r.ok) setEstado(leerEstadoBle(r.valor));
      });
    };
    leer();
    const t = setInterval(leer, 15_000);
    void p
      .escuchar(EVENTO_CAMBIO_BLE, (x) => {
        const e = leerEstadoBle(x);
        if (vivo && e) setEstado(e);
      })
      .then((q) => {
        if (vivo) baja = q;
        else q();
      });
    return () => {
      vivo = false;
      clearInterval(t);
      baja?.();
    };
  }, []);
  return estado;
}

/** Encender o apagar el Bluetooth directo (se guarda en la app). */
export async function activarBluetooth(activo: boolean): Promise<{ ok: boolean; estado?: EstadoBleNativo | null; motivo?: string }> {
  const r = await puenteNativo().llamar<unknown>(COMANDO_ACTIVAR_BLE, { activo });
  return r.ok ? { ok: true, estado: leerEstadoBle(r.valor) } : { ok: false, motivo: r.motivo };
}

/** Pedir el permiso de Bluetooth (Android: diálogo con el texto claro; macOS: Ajustes del Sistema). */
export async function pedirPermisoBluetooth(): Promise<{ ok: boolean; motivo?: string }> {
  const r = await puenteNativo().llamar<unknown>(COMANDO_PERMISO_BLE);
  return r.ok ? { ok: true } : { ok: false, motivo: r.motivo };
}

/** Conectar a mano con un vecino (también uno anónimo: el saludo firmado decide si se habla). */
export async function abrirEnlaceBluetooth(vecino: string): Promise<{ ok: boolean; motivo?: string }> {
  const r = await puenteNativo().llamar<unknown>(COMANDO_ABRIR_BLE, { vecino });
  return r.ok ? { ok: true } : { ok: false, motivo: r.motivo };
}

/* ══════════════ BLE1109B: canal rápido (experimental) y registro de enlaces ══════════════ */

function depsCanalRapido(): DepsAjusteCanalRapido {
  return {
    leer: () => {
      try {
        return window.localStorage.getItem(CLAVE_CANAL_RAPIDO_BLE);
      } catch {
        return null;
      }
    },
    escribir: (v) => {
      try {
        window.localStorage.setItem(CLAVE_CANAL_RAPIDO_BLE, v);
      } catch {
        /* sin almacenamiento: vale la app nativa */
      }
    },
    nativo: async (activo) => {
      const r = await puenteNativo().llamar<boolean>(COMANDO_CANAL_RAPIDO_BLE, activo === undefined ? {} : { activo });
      return r.ok && typeof r.valor === "boolean" ? r.valor : null;
    },
  };
}

/** ¿Está encendido «Canal rápido Bluetooth (experimental)»? Por defecto SÍ; la verdad la tiene la app nativa. */
export async function leerCanalRapidoBluetooth(): Promise<boolean> {
  const espejo = (): boolean => leerAjusteCanalRapido(depsCanalRapido().leer()).activo;
  try {
    const v = await depsCanalRapido().nativo();
    return v === null ? espejo() : v;
  } catch {
    return espejo();
  }
}

/** Enciende o apaga el canal rápido (la app nativa reinicia su Bluetooth para que el cambio valga). */
export async function fijarCanalRapidoBluetooth(activo: boolean): Promise<{ ok: boolean; activo: boolean; motivo?: string }> {
  const r = await fijarCanalRapido(depsCanalRapido(), activo);
  return r.ok ? r : { ok: false, activo: false, motivo: "La app no respondió." };
}

/** «Compartir registro de enlaces»: en Android abre la hoja de compartir; en escritorio abre la carpeta del registro. */
export async function compartirRegistroEnlaces(): Promise<{ ok: boolean; texto: string }> {
  try {
    const r = await puenteNativo().llamar<string>(COMANDO_COMPARTIR_REGISTRO_BLE);
    return r.ok ? { ok: true, texto: typeof r.valor === "string" && r.valor ? r.valor : "Registro listo." } : { ok: false, texto: r.motivo ?? "No se pudo compartir el registro." };
  } catch {
    return { ok: false, texto: "No se pudo compartir el registro." };
  }
}
