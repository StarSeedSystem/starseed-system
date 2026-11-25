"use client";

/**
 * DIR1125N · Montaje global (layout raíz, junto a los avisos de mensajes): desde que arranca la app escucha lo recibido de
 * otras neuronas, las sesiones y peticiones de control y los fallos de enlace, y lo deja en el Centro de notificaciones.
 * Así ya no hace falta abrir Señales para que la bandeja escuche ni para ver el registro. Sin interfaz propia.
 */
import { useEffect } from "react";
import { getNetworkInbox, subscribeNetworkInbox } from "@/ai/astraura/mesh/network-inbox";
import { registroGlobal } from "@/lib/control-remoto/registro-sesiones";
import { avisosPeticionAbiertos, suscribirAvisosPeticion } from "@/lib/control-remoto/aviso-peticion";
import { fallosEnlaces, suscribirFallosEnlaces, textoFalloSenal } from "@/lib/malla/fallos-enlaces";
import { notifyFromApp } from "@/lib/notifications/app-notify";
import { crearRegistroSenalesControl } from "@/lib/notifications/registro-senales-control";

export function RegistroSenalesControlMount(): null {
  useEffect(
    () =>
      crearRegistroSenalesControl({
        notificar: notifyFromApp,
        ahora: () => Date.now(),
        bandeja: { leer: getNetworkInbox, suscribir: subscribeNetworkInbox },
        sesiones: { leer: () => registroGlobal.sesionesSalientes(), suscribir: (cb) => registroGlobal.suscribir(cb) },
        peticiones: { leer: avisosPeticionAbiertos, suscribir: suscribirAvisosPeticion },
        fallos: { leer: fallosEnlaces, suscribir: suscribirFallosEnlaces },
        fraseFallo: (nombre, f) => textoFalloSenal(nombre, f, null).split(" · ")[0],
      }),
    [],
  );
  return null;
}

export default RegistroSenalesControlMount;
