/**
 * StarSeed XR · Guardián de privacidad en conexiones de escena (§3 k).
 * Envuelve una ConexionEscena para clasificar y bloquear datos sensibles.
 */
import { evaluarSalida, consentimiento, NUNCA_EN_REGISTROS } from "@/lib/xr/privacidad";
import type { ClaseDato, Destino, Consentimiento } from "@/lib/xr/privacidad";
import type { ConexionEscena, EventoEscena } from "@/lib/vivo/espacial/canal";

export interface OpcionesGuardia {
  destino: Destino;
  consentimientos: () => Consentimiento[];
  ahora: () => number;
  clasificar?: (evento: EventoEscena, payload: Record<string, unknown>) => ClaseDato[];
  alBloquear: (v: { clase: ClaseDato; requiere: "consentimiento" | "nunca"; motivo: string }) => void;
}

function clasificarPorDefecto(evento: EventoEscena, payload: Record<string, unknown>): ClaseDato[] {
  const clases: ClaseDato[] = [];
  const claves = Object.keys(payload || {});
  for (const k of claves) {
    const baja = k.toLowerCase();
    if (baja.includes("camara") || baja === "camara-passthrough") { clases.push("camara-passthrough" as ClaseDato); }
    else if (baja.includes("mapa")) { clases.push("mapa-sala" as ClaseDato); }
    else if (baja.includes("mirada")) { clases.push("mirada" as ClaseDato); }
    else if (baja.includes("articulaciones") || baja.includes("manos")) { clases.push("manos-articulaciones" as ClaseDato); }
    else if (baja.includes("voz")) { clases.push("voz-audio" as ClaseDato); }
    else if (baja.includes("biometria") || baja.includes("pulso")) { clases.push("biometria" as ClaseDato); }
    else if (baja.includes("ubicacion")) { clases.push("ubicacion-fisica" as ClaseDato); }
  }
  return clases;
}

export function protegerConexion(
  c: ConexionEscena,
  o: OpcionesGuardia,
): ConexionEscena {
  const clasificar = o.clasificar ?? clasificarPorDefecto;
  // Limitador: una notificación por clase y por minuto.
  const bloqueosRecientes = new Map<string, number>();

  const notificarSiAplica = (clase: ClaseDato, veredicto: { requiere: "consentimiento" | "nunca"; motivo: string }) => {
    if (veredicto.requiere === "nada") return;
    const ahoraMs = o.ahora();
    const ultimo = bloqueosRecientes.get(clase) ?? 0;
    if (ahoraMs - ultimo < 60_000) return; // una vez por minuto
    bloqueosRecientes.set(clase, ahoraMs);
    o.alBloquear({ clase, requiere: veredicto.requiere, motivo: veredicto.motivo });
  };

  const envolverEnviar = c.enviar.bind(c);
  const envolverPublicar = c.publicarPresencia.bind(c);

  return {
    ...c,
    enviar(evento, payload) {
      const clases = clasificar(evento, payload);
      const cons = o.consentimientos();
      for (const clase of clases) {
        const ver = evaluarSalida(clase, o.destino, o.ahora(), cons);
        if (!ver.permitido) {
          notificarSiAplica(clase, ver);
          return; // bloqueado: no se envía
        }
      }
      // Si llegó aquí, todo permitido (o sin datos clasificados sensibles).
      envolverEnviar(evento, payload);
    },
    publicarPresencia(meta) {
      // Las claves sensibles en meta se detectan igual.
      const metaPayload = meta || {};
      const clases = clasificar("pose" as EventoEscena, metaPayload);
      // También detecta claves anidadas en meta.
      for (const k of Object.keys(metaPayload)) {
        const baja = k.toLowerCase();
        if (baja.includes("camara")) clases.push("camara-passthrough" as ClaseDato);
        if (baja.includes("mapa")) clases.push("mapa-sala" as ClaseDato);
        if (baja.includes("mirada")) clases.push("mirada" as ClaseDato);
        if (baja.includes("articulaciones")) clases.push("manos-articulaciones" as ClaseDato);
        if (baja.includes("voz")) clases.push("voz-audio" as ClaseDato);
      }
      const cons = o.consentimientos();
      for (const clase of new Set(clases)) {
        const ver = evaluarSalida(clase, o.destino, o.ahora(), cons);
        if (!ver.permitido) {
          notificarSiAplica(clase, ver);
          return; // bloqueado
        }
      }
      envolverPublicar(meta);
    },
    // Delegación directa del resto.
    suscrito: c.suscrito,
    onPresencia: c.onPresencia,
    onMensaje: c.onMensaje,
    onFila: c.onFila,
    onSuscrito: c.onSuscrito,
    cerrar: c.cerrar,
    tema: c.tema,
  };
}

export function ejecutarGuardia(
  c: ConexionEscena,
  o: OpcionesGuardia,
): ConexionEscena {
  return protegerConexion(c, o);
}
