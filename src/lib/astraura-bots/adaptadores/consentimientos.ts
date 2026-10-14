import { type ConsentimientoSentido, type Sentido } from "../tipos";
import { VIGENCIA_MAX_INVITADO_MS } from "../permisos";
import { type Bot, esInvitado } from "../tipos";

/**
 * Almacén de consentimientos por bot, sentido y cuenta.
 * @param io Objeto de entrada/salida: leer y escribir el arreglo de consentimientos.
 *           Opcionalmente, remoto para sincronizar con Supabase (best-effort).
 */
export function crearAlmacenConsentimientos(io: {
  leer(): ConsentimientoSentido[];
  escribir(cs: ConsentimientoSentido[]): void;
  remoto?: {
    subir(c: ConsentimientoSentido): Promise<void>;
    borrar(botId: string, sentido: Sentido): Promise<void>;
  };
}) {
  return {
    otorgar: (
      { botId, sentido, cuentaId, duracion, expreso = false }: { botId: string; sentido: Sentido; cuentaId: string; duracion: "sesion" | "hoy" | "siempre"; expreso?: boolean },
      ahora: number,
      bot?: Bot
    ) => {
      // Calculate vence based on duracion
      let vence: number | null = null;
      if (duracion === "sesion") {
        vence = ahora + 60 * 60 * 1000; // 1 hour
      } else if (duracion === "hoy") {
        vence = ahora + 24 * 60 * 60 * 1000; // 24 hours
      } else if (duracion === "siempre") {
        vence = null;
      }

      // If the bot is invitado, cap the duration to 1 hour (sesion)
      if (bot && esInvitado(bot)) {
        vence = ahora + 60 * 60 * 1000; // force to 1 hour
      }

      const nuevoConsentimiento: ConsentimientoSentido = {
        botId,
        sentido,
        cuentaId,
        vence,
        expreso: expreso ?? false,
      };

      const actuales = io.leer();
      // Remove any existing consentimiento for the same botId, sentido, cuentaId
      const sinExistente = actuales.filter(
        c => !(c.botId === botId && c.sentido === sentido && c.cuentaId === cuentaId)
      );
      const actualizados = [...sinExistente, nuevoConsentimiento];
      io.escribir(actualizados);

      // Best-effort remote sync
      io.remoto?.subir(nuevoConsentimiento).catch(() => {});
    },
    revocar: (botId: string, sentido: Sentido, cuentaId: string) => {
      const actuales = io.leer();
      const actualizados = actuales.filter(
        c => !(c.botId === botId && c.sentido === sentido && c.cuentaId === cuentaId)
      );
      io.escribir(actualizados);
      // Best-effort remote removal
      io.remoto?.borrar(botId, sentido).catch(() => {});
    },
    revocarTodo: (botId: string) => {
      const actuales = io.leer();
      // We need to know which sentidos we are removing for this botId to call remoto.borrar
      const sentidosAEliminar = new Set<Sentido>();
      const actualizados = actuales.filter(c => {
        if (c.botId === botId) {
          sentidosAEliminar.add(c.sentido);
          return false; // remove this consentimiento
        }
        return true;
      });
      io.escribir(actualizados);
      // Best-effort remote removal for each sentido
      sentidosAEliminar.forEach(sentido => {
        io.remoto?.borrar(botId, sentido).catch(() => {});
      });
    },
    vigentes: (ahora: number) => {
      const actuales = io.leer();
      const vigentes = actuales.filter(c => c.vence === null || c.vence > ahora);
      io.escribir(vigentes); // purge expired
      return vigentes;
    },
    listaPara: (botId: string) => {
      const actuales = io.leer();
      return actuales.filter(c => c.botId === botId);
    },
  };
}