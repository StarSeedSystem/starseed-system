"use client";

/**
 * Cuántas notificaciones sin leer hay, SI el contexto de notificaciones está montado.
 * `useNotifications` lanza un error fuera de su proveedor; el Centro de Control también se monta suelto
 * (pruebas, otras superficies), así que aquí ese caso es «sin dato» (null) y no un fallo.
 * El orden de los hooks no cambia: `useNotifications` llama siempre a `useContext` antes de lanzar.
 */
import { useNotifications } from "@/context/notifications-context";

export function useNoLeidas(): number | null {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- ver la nota de arriba
    return useNotifications().unreadCount;
  } catch {
    return null;
  }
}
