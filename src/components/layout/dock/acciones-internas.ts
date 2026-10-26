"use client";

/**
 * Ejecutor de las acciones rápidas del dock (Ola 1025U · V1a).
 * ─────────────────────────────────────────────────────────────────────────────
 * El catálogo (`@/lib/dock/acciones-rapidas`) es puro y solo DESCRIBE qué hace cada
 * acción; aquí se ejecuta:
 *   · ruta    → navegar (el dock pasa su `router.push`);
 *   · evento  → `window.dispatchEvent(new CustomEvent(...))`;
 *   · función → una función real del OS, cargada a demanda (el dock vive en el layout
 *               raíz: el almacén de escritorios o las notificaciones no pueden entrar
 *               en su paquete inicial).
 * Devuelve un mensaje corto y HONESTO de lo que pasó, que el menú enseña tal cual.
 */

import type { AccionRapida, FuncionDock } from "@/lib/dock/acciones-rapidas";

export interface ResultadoAccion {
  ok: boolean;
  mensaje: string;
}

export async function ejecutarFuncionDock(f: FuncionDock, navegar: (ruta: string) => void): Promise<ResultadoAccion> {
  switch (f) {
    case "escritorio-nuevo": {
      const { createDesktop } = await import("@/components/desktop/desktop-store");
      createDesktop();
      navegar("/escritorios");
      return { ok: true, mensaje: "Escritorio nuevo creado." };
    }
    case "notificaciones-marcar-leidas": {
      const { loadAllNotifications, markAllSeen } = await import("@/lib/notifications/notifications");
      const todas = await loadAllNotifications();
      const sinLeer = todas.filter((n) => !n.seen);
      if (sinLeer.length === 0) return { ok: true, mensaje: "No tienes notificaciones sin leer." };
      const hecho = await markAllSeen(sinLeer);
      return hecho
        ? { ok: true, mensaje: sinLeer.length === 1 ? "1 notificación marcada como leída." : `${sinLeer.length} notificaciones marcadas como leídas.` }
        : { ok: false, mensaje: "No se pudieron marcar como leídas. Comprueba tu sesión e inténtalo de nuevo." };
    }
    default:
      return { ok: false, mensaje: "Esta acción todavía no está disponible." };
  }
}

export async function ejecutarAccion(accion: AccionRapida, navegar: (ruta: string) => void): Promise<ResultadoAccion> {
  const d = accion.destino;
  try {
    if (d.tipo === "ruta") {
      navegar(d.ruta);
      return { ok: true, mensaje: "" };
    }
    if (d.tipo === "evento") {
      window.dispatchEvent(new CustomEvent(d.evento, d.detalle ? { detail: d.detalle } : undefined));
      return { ok: true, mensaje: "" };
    }
    return await ejecutarFuncionDock(d.funcion, navegar);
  } catch {
    return { ok: false, mensaje: "No se pudo completar la acción. Inténtalo de nuevo." };
  }
}
