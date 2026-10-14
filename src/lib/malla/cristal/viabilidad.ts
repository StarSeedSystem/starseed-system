// Malla cristalina SiO₂ amorfa: función de viabilidad para elegir la mejor vía de transmisión

import type { Dato } from './tipos';
import type { SenalMedida } from './tipos';

// Tipo para el contexto de viabilidad
export interface ContextoViabilidad {
  cuentaDeFn: (id: string) => string | null;
  cifradoE2E: boolean;
  bateriaPct?: number;
}

// Tipo para el resultado de viabilidad
export interface ResultadoViabilidad {
  apto: boolean;
  valor: number; // 0 a 1, donde 1 es el mejor
  motivo: string;
}

/**
 * Evalúa la viabilidad de transmitir un dato a través de una señal medida.
 * 
 * @param dato - El dato a transmitir (con clase, tipo, bytes, prioridad, origen)
 * @param senal - La señal medida (con medio, métricas de calidad, origen y destino)
 * @param ctx - El contexto (función de cuenta, cifrado E2E, batería)
 * @returns Resultado de viabilidad con aptitud, valor y motivo
 */
export function viabilidad(dato: Dato, senal: SenalMedida, ctx: ContextoViabilidad): ResultadoViabilidad {
  // 1. VETOS ABSOLUTOS (resultado inmediatamente false)
  
  // Veto interno: comprobar si las cuentas de origen y destino son distintas
  const cuentaOrigen = ctx.cuentaDeFn(dato.origen);
  const cuentaDestino = senal.a ? ctx.cuentaDeFn(senal.a) : null;
  
  // Si conocemos al menos una cuenta y son distintas, veto interno
  if ((cuentaOrigen !== null || cuentaDestino !== null) && 
      cuentaOrigen !== cuentaDestino) {
    return { apto: false, valor: 0, motivo: 'interno' };
  }
  
  // Veto por servidor (tiene precedencia sobre otros vetos cuando medio es servidor)
  if (senal.medio === 'servidor' && !ctx.cifradoE2E && dato.clase !== 'publico') {
    return { apto: false, valor: 0, motivo: 'servidor' };
  }
  
  // Veto por clase y cifrado E2E (para casos no servidor)
  if (!ctx.cifradoE2E) {
    if (dato.clase === 'privado') {
      return { apto: false, valor: 0, motivo: 'privado requiere cifradoE2E' };
    }
    if (dato.clase === 'interno') {
      return { apto: false, valor: 0, motivo: 'interno requiere cifradoE2E' };
    }
  }
  
  // Veto por medio y características del dato
  if (senal.medio === 'lora') {
    // LoRa tiene límites de tamaño y no soporta ciertos tipos
    if (dato.bytes > 1600) {
      return { apto: false, valor: 0, motivo: 'lora' };
    }
    if (dato.tipo === 'llamada') {
      return { apto: false, valor: 0, motivo: 'lora' };
    }
  }
  
  if (senal.medio === 'nfc' && dato.bytes > 32768) {
    return { apto: false, valor: 0, motivo: 'nfc' };
  }
  
  // 2. CÁLCULO DE VALOR (si pasó todos los vetos)
  
  // Valor base basado en la calidad de la señal
  let valor = calcularValorSenal(senal);
  
  // Aplicar factores de corrección
  
  // Factor servidor: reduce valor cuando medio es servidor y clase no es público
  // (Nota: este factor solo se aplica cuando sí pasa los vetos, es decir, cuando cifradoE2E es true o clase es publico)
  if (senal.medio === 'servidor' && dato.clase !== 'publico') {
    valor *= 0.6; // Factor servidor para privado/interno
  }
  
  // Factor batería: reduce valor cuando batería < 20 y medio alto consumo
  const bateria = ctx.bateriaPct ?? 100; // Si no se conoce, asumimos batería buena
  const medioAltoConsumo = senal.medio === 'wifi-lan' || senal.medio === 'webrtc';
  if (bateria < 20 && medioAltoConsumo) {
    valor *= 0.8; // Factor batería
  }
  
  // Factor prioridad: P0 y P1 pueden tener ventaja en ciertos casos
  // (Esto se maneja más en el nivel de enrutamiento, pero podemos ajustar ligeramente)
  // Por ahora, dejamos el valor tal como está, ya que las pruebas de orden relativo
  // se basan en las características intrínsecas de la señal
  
  // Aseguramos que el valor esté entre 0 y 1
  valor = Math.max(0, Math.min(1, valor));
  
  return { apto: true, valor, motivo: 'viable' };
}

/**
 * Calcula el valor base de una señal basado en sus métricas de calidad.
 * 
 * @param senal - La señal medida
 * @returns Valor entre 0 y 1 representando la calidad de la señal
 */
function calcularValorSenal(senal: SenalMedida): number {
  // Normalizamos cada métrica a un rango de 0 a 1 y las combinamos
  
  // RSSI: de -100 (muy malo) a -40 (excelente) -> 0 a 1
  const rssiValor = senal.rssiDbm !== undefined 
    ? Math.max(0, Math.min(1, (senal.rssiDbm + 100) / 60)) 
    : 0.5; // Valor medio si no se conoce
  
  // SNR: de -20 (muy malo) a 20 (excelente) -> 0 a 1
  const snrValor = senal.snrDb !== undefined
    ? Math.max(0, Math.min(1, (senal.snrDb + 20) / 40))
    : 0.5; // Valor medio si no se conoce
  
  // RTT: de 200ms (malo) a 0ms (excelente) -> 1 a 0, luego invertimos
  const rttValor = senal.rttMs !== undefined
    ? Math.max(0, Math.min(1, (200 - senal.rttMs) / 200))
    : 0.5; // Valor medio si no se conoce
  
  // Ancho de banda: logarítmico para evitar saturación
  // De 1 kbps (muy malo) a 100000 kbps (excelente) -> 0 a 1
  const anchoBandaValor = senal.anchoBandaKbps !== undefined
    ? Math.min(1, Math.log2(senal.anchoBandaKbps) / Math.log2(100000))
    : 0.5; // Valor medio si no se conoce
  
  // Pérdida de paquetes: inverso (0% pérdida = 1.0, 100% pérdida = 0)
  const perdidaValor = senal.perdidaPct !== undefined
    ? Math.max(0, 1 - senal.perdidaPct / 100)
    : 0.5; // Valor medio si no se conoce
  
  // Combinamos los factores con pesos (pueden ajustarse según experiencia)
  // Damos más peso a latencia y ancho de banda para aplicaciones interactivas
  const pesoRssi = 0.2;
  const pesoSnr = 0.2;
  const pesoRtt = 0.3;  // Latencia es importante para experiencia de usuario
  const pesoAnchoBanda = 0.2;
  const pesoPerdida = 0.1;
  
  const valor =
    pesoRssi * rssiValor +
    pesoSnr * snrValor +
    pesoRtt * rttValor +
    pesoAnchoBanda * anchoBandaValor +
    pesoPerdida * perdidaValor;
  
  return valor;
}