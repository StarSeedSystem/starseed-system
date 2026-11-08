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
  COMANDO_ESTADO_BLE,
  COMANDO_PERMISO_BLE,
  EVENTO_CAMBIO_BLE,
  leerEstadoBle,
  type EstadoBleNativo,
} from "./bluetooth-directo";

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
