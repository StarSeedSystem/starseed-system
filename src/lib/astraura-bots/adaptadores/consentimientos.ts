import type { ConsentimientoSentido, Sentido } from "../tipos";
import { VIGENCIA_MAX_INVITADO_MS } from "../permisos";

/**
 * Almacén de consentimientos por bot, sentido y cuenta.
 * Por defecto usa localStorage (clave: starseed.astraura.bots.consentimientos.v1)
 * y no se sincroniza entre neuronas.
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
    /**
     * Otorga un consentimiento.
     * @param {{botId:string, sentido:Sentido, cuentaId:string, duracion:"sesion"|"hoy"|"siempre", expreso?:boolean}} params
     * @param {number} ahora
     */
    otorgar: ({ botId, sentido, cuentaId, duracion, expreso }, ahora) => {
      let vence: number | null = null;
      if (duracion === "sesion") vence = ahora + 3600000;
      else if (duracion === "hoy") vence = ahora + 86400000;
      else if (duracion === "siempre") vence = null;

      const cs: ConsentimientoSentido = { botId, sentido, cuentaId, vence, expreso: expreso ?? false };
      const actual = io.leer().filter(c => !(c.botId === botId && c.sentido === sentido && c.cuentaId === cuentaId));
      io.escribir([...actual, cs]);
      io.remoto?.subir(cs).catch(() => {});
    },

    /**
     * Revoca un consentimiento específico.
     * @param {string} botId
     * @param {Sentido} sentido
     * @param {string} cuentaId
     */
    revocar: (botId, sentido, cuentaId) => {
      const actual = io.leer().filter(c => !(c.botId === botId && c.sentido === sentido && c.cuentaId === cuentaId));
      io.escribir(actual);
      io.remoto?.borrar(botId, sentido).catch(() => {});
    },

    /**
     * Revoca todos los consentimientos de un bot.
     * @param {string} botId
     */
    revocarTodo: (botId) => {
      const actual = io.leer().filter(c => c.botId !== botId);
      io.escribir(actual);
    },

    /**
     * Devuelve los consentimientos vigentes y elimina los caducados.
     * @param {number} ahora
     * @returns {ConsentimientoSentido[]}
     */
    vigentes: (ahora) => {
      const actual = io.leer();
      const vigentes: ConsentimientoSentido[] = [];
      const caducados: ConsentimientoSentido[] = [];
      for (const c of actual) {
        if (c.vence === null || c.vence > ahora) vigentes.push(c);
        else caducados.push(c);
      }
      if (caducados.length > 0) {
        io.escribir(vigentes);
        for (const c of caducados) io.remoto?.borrar(c.botId, c.sentido).catch(() => {});
      }
      return vigentes;
    },

    /**
     * Devuelve todos los consentimientos de un bot (incluyendo caducados).
     * @param {string} botId
     * @returns {ConsentimientoSentido[]}
     */
    listaPara: (botId) => io.leer().filter(c => c.botId === botId),
  };
}