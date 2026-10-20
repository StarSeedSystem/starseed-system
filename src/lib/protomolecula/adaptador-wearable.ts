/**
 * Protomolécula · ADAPTADOR DE WEARABLES. Web Bluetooth para ritmo cardíaco.
 * Módulo PURO: quien llama (p. ej. un sensor de neurona) lee el hardware y llama a `procesar`.
 * Aquí no hay dispositivos ni reloj.
 */

import type { Autor, Operacion, Origen, Parametro, ParametroRef, ValorParametro } from "./tipos";
import type { FuenteControl } from "./vinculos-control.ts";

/** Servicio y característica estándar de ritmo cardíaco (Bluetooth SIG). */
export const SERVICIO_PULSO = "heart_rate"; // 0x180D
export const CARACTERISTICA_PULSO = "heart_rate_measurement"; // 0x2A37

/** Rango fisiológico típico de pulso en adultos (bpm). */
export const RANGO_PULSO = { min: 40, max: 180 };

/** Analiza la trama de ritmo cardíaco según Bluetooth SIG.
 *  Devuelve el valor bruto (latidos por minuto) o null si no se puede interpretar.
 */
export function analizarTramaPulso(datos: DataView): number | null {
  if (datos.byteLength < 1) return null;

  const flags = datos.getUint8(0);
  let indice = 1;

  // Bit 0: formato del valor de frecuencia cardíaca (0 = UINT8, 1 = UINT16)
  const esValor16Bits = (flags & 0x01) === 1;
  
  // Bit 1: sensor de contacto detectado (0 = no soportado, 1 = soportado)
  const contactoSoportado = (flags & 0x02) === 2;
  
  // Bit 2: sensor de contacto detectado (0 = no detectado, 1 = detectado)
  // Solo relevante si el bit 1 está establecido
  let contactoDetectado = false;
  if (contactoSoportado) {
    contactoDetectado = (flags & 0x04) === 4;
  }

  // Si el contacto es soportado pero no detectado, no usamos la medición
  if (contactoSoportado && !contactoDetectado) {
    return null;
  }

  // Leer el valor de frecuencia cardíaca
  let frecuencia: number;
  if (esValor16Bits) {
    if (datos.byteLength < indice + 2) return null;
    frecuencia = datos.getUint16(indice, /* littleEndian */ true);
    indice += 2;
  } else {
    if (datos.byteLength < indice + 1) return null;
    frecuencia = datos.getUint8(indice);
    indice += 1;
  }

  // Los bytes restantes son para energía gastada, intervalo RR, etc. (no usados aquí)
  return frecuencia;
}

/** Procesa una medición de pulso bruto y genera una Operacion si es válida.
 *  El valor bruto debe estar en el rango fisiológico (40-180 bpm).
 */
export function procesarPulso(
  bruto: number,
  parametro: Parametro,
  autor: Autor,
  ahora: number,
  idOperacion: string
): { operacion: Operacion | null } {
  const { min = RANGO_PULSO.min, max = RANGO_PULSO.max } = parametro;
  
  // Validar que esté en rango fisiológico
  if (bruto < min || bruto > max) {
    return { operacion: null };
  }

  const operacion: Operacion = {
    id: idOperacion,
    objetivo: { atomoId: parametro.id, parametroId: "valor" }, // Asumiendo que el parámetro tiene un id "valor" para simplificar
    accion: { tipo: "exacta", valor: bruto },
    autor,
    origen: "sensor",
    t: ahora,
    fuente: "wearable:pulso",
  };

  return { operacion };
}

/** Crea un vínculo de control para un wearable de pulso.
 *  El usuario debe haber dado consentimiento para esta métrica.
 */
export function crearVinculoPulso(
  id: string,
  parametro: Parametro,
  creadoPor: string
): FuenteControl {
  return {
    tipo: "sensor",
    sensorId: "wearable:pulso",
  };
}