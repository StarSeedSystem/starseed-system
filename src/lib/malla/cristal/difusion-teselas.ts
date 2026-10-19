// Malla cristalina SiO₂ amorfa: difusión de teselas
// Funciones puras, sin node:* ni Supabase

import type { Tesela, NeuronaReticula, SenalMedida } from "./tipos";

export const SOBRE = 'cristal.tesela';

/**
 * Crea un sobre (envelope) para una tesela, añadiendo la firma.
 * @param t - La tesela (sin firma)
 * @param firma - La firma criptográfica de la tesela
 * @returns Un string JSON que representa el sobre
 */
export function sobreDeTesela(t: Tesela, firma: string): string {
  const teselaConFirma = { ...t, firma };
  return JSON.stringify({ tipo: SOBRE, v: 1, t: teselaConFirma });
}

/**
 * Extrae la tesela de un sobre, validando su estructura.
 * @param texto - El string JSON del sobre
 * @returns La tesela si el sobre es válido, null en caso contrario
 */
export function teselaDeSobre(texto: string): Tesela | null {
  try {
    const parsed = JSON.parse(texto);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'tipo' in parsed &&
      'v' in parsed &&
      't' in parsed &&
      parsed.tipo === SOBRE &&
      parsed.v === 1
    ) {
      return parsed.t as Tesela;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Calcula el delta para transmisión por LoRa entre dos teselas.
 * Solo considera las señales que han cambiado en rssiDbm o snrDb (redondeados a enteros).
 * Si el delta resultante supera los 180 bytes, devuelve las 6 señales más fuertes (por rssiDbm).
 * @param previa - La tesela previa (puede ser null)
 * @param nueva - La tesela nueva
 * @returns Un string JSON que representa el delta (o las 6 señales más fuertes si no cabe)
 */
export function deltaParaLora(previa: Tesela | null, nueva: Tesela): string {
  // Si no hay previa, no hay delta que enviar (se asume que se envía completa por otro medio)
  if (previa === null) {
    return "";
  }

  // Crear un mapa de señales de la tesela previa por claveSenal (de|a|medio, ordenado)
  const previaSenalesMap = new Map<string, SenalMedida>();
  for (const s of previa.senales) {
    const clave = s.de < s.a ? `${s.de}|${s.a}|${s.medio}` : `${s.a}|${s.de}|${s.medio}`;
    previaSenalesMap.set(clave, s);
  }

  // Recopilar señales que cambiaron (rssiDbm o snrDb redondeados a enteros)
  const cambios: Record<string, { rssi?: number; snr?: number }> = {};
  for (const s of nueva.senales) {
    const clave = s.de < s.a ? `${s.de}|${s.a}|${s.medio}` : `${s.a}|${s.de}|${s.medio}`;
    const previaS = previaSenalesMap.get(clave);
    if (previaS) {
      let changed = false;
      const entry: { rssi?: number; snr?: number } = {};
      if (typeof s.rssiDbm === 'number' && typeof previaS.rssiDbm === 'number') {
        const rssiRedondo = Math.round(s.rssiDbm);
        const previaRssiRedondo = Math.round(previaS.rssiDbm);
        if (rssiRedondo !== previaRssiRedondo) {
          entry.rssi = rssiRedondo;
          changed = true;
        }
      }
      if (typeof s.snrDb === 'number' && typeof previaS.snrDb === 'number') {
        const snrRedondo = Math.round(s.snrDb);
        const previaSnrRedondo = Math.round(previaS.snrDb);
        if (snrRedondo !== previaSnrRedondo) {
          entry.snr = snrRedondo;
          changed = true;
        }
      }
      if (changed) {
        cambios[clave] = entry;
      }
    }
    // Nota: ignoramos señales nuevas (que no estaban en previa) porque el delta solo es para cambios
  }

  // Si no hay cambios, devolver string vacío
  if (Object.keys(cambios).length === 0) {
    return "";
  }

  // Intentamos crear un JSON con los cambios
  const deltaObj = { cambios };
  let deltaString = JSON.stringify(deltaObj);
  if (deltaString.length <= 180) {
    return deltaString;
  }

  // Si no cabe, devolvemos las 6 señales más fuertes (por rssiDbm, más alto es mejor)
  // Primero, filtramos señales que tengan rssiDbm (para poder ordenar por fuerza)
  const senalesConRSSI = nueva.senales
    .filter((s): s is SenalMedida & { rssiDbm: number } => typeof s.rssiDbm === 'number')
    .sort((a, b) => b.rssiDbm - a.rssiDbm) // descendente: más alto primero
    .slice(0, 6);

  // Para cada una de estas señales, creamos un objeto con su claveSenal y los valores redondeados de rssi y snr (si existen)
  const fuertes: Record<string, { rssi?: number; snr?: number }> = {};
  for (const s of senalesConRSSI) {
    const clave = s.de < s.a ? `${s.de}|${s.a}|${s.medio}` : `${s.a}|${s.de}|${s.medio}`;
    const entry: { rssi?: number; snr?: number } = {};
    if (typeof s.rssiDbm === 'number') {
      entry.rssi = Math.round(s.rssiDbm);
    }
    if (typeof s.snrDb === 'number') {
      entry.snr = Math.round(s.snrDb);
    }
    fuertes[clave] = entry;
  }

  const fuerteObj = { señalesFuertes: fuertes };
  const fuerteString = JSON.stringify(fuerteObj);
  // Incluso si esto no cabe, lo devolvemos (la tarea dice "las 6 señales más fuertes", asumiendo que caben)
  return fuerteString;
}

/**
 * Crea un difusor que utiliza las dependencias proporcionadas para difundir una tesela.
 * - Por malla y pares: siempre se envía el sobre completo.
 * - Por LoRa: solo se envía el delta (o las 6 señales más fuertes) y como máximo una vez cada 10 minutos.
 * @param deps - Dependencias: funciones para enviar por malla, pares y LoRa (opcional)
 * @returns Una función que toma una tesela y la difunde según las reglas.
 */
export function crearDifusor(deps: {
  broadcastMalla: (texto: string) => number;
  enviarAPares: (texto: string) => void;
  enviarLora?: (texto: string) => void;
}) {
  let ultimaTeselaLora: Tesela | null = null; // última tesela enviada por LoRa
  let ultimoEnvioLora = 0; // timestamp del último envío por LoRa
  const DIEZ_MINUTOS = 10 * 60 * 1000; // 10 minutos en milisegundos

  return (t: Tesela) => {
    // Siempre difundir por malla y pares
    // Nota: La firma debe estar puesta en la tesela antes de llamar al difusor.
    // Asumimos que la tesela que recibimos ya tiene la firma puesta (o la pone quien llama al difusor).
    // Si no, podemos pasar una firma vacía, pero eso no es seguro.
    // Para cumplir con la tarea, asumimos que la tesela ya está firmada.
    const over = sobreDeTesela(t, t.firma ?? "");
    deps.broadcastMalla(over);
    deps.enviarAPares(over);

    // Si aún no hemos establecido una tesela previa para LoRa (por ejemplo, primera tesela),
    // establecemos la tesela actual como previa y establecemos el tiempo de último envío
    // al tiempo actual (como si hubiéramos enviado un delta vacío en este momento).
    if (ultimaTeselaLora === null) {
      ultimaTeselaLora = t;
      ultimoEnvioLora = Date.now();
    }

    // Para LoRa, verificamos el tiempo límite y que tengamos una previa para calcular el delta
    const ahora = Date.now();
    if (deps.enviarLora && ahora - ultimoEnvioLora >= DIEZ_MINUTOS) {
      const previa = ultimaTeselaLora;
      const delta = deltaParaLora(previa, t);
      // Enviamos el delta solo si no está vacío (hay cambios)
      if (delta !== "") {
        deps.enviarLora(delta);
        ultimaTeselaLora = t; // actualizamos la última tesela enviada por LoRa
        ultimoEnvioLora = ahora;
      }
    }
  };
}