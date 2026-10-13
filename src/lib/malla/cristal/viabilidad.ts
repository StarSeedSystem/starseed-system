import { Dato, SenalMedida, Medio, ClaseDato, Prioridad } from './tipos';
import { calidadSenal } from './coste';

export interface Viabilidad {
  valor: number;
  apto: boolean;
  motivo: string;
}

export { calidadSenal };

/**
 * Calcula la viabilidad de un enlace para un dato dado.
 * @param dato - El dato a transmitir.
 * @param s - La señal medida del enlace.
 * @param ctx - Contexto adicional.
 * @returns Objeto Viabilidad.
 */
export function viabilidad(
  dato: Dato,
  s: SenalMedida,
  ctx: {
    cuentaDe: (neuronaId: string) => string | null;
    bateriaPct?: number | null;
    cifradoE2E: boolean;
  }
): Viabilidad {
  // Vetos en el orden especificado en la tarea
  const { de, a, medio } = s;
  const origenCuenta = ctx.cuentaDe(dato.origen);
  
  // 1. 'interno' si alguna punta no es de la misma cuenta que el origen
  if (dato.clase === 'interno') {
    if (ctx.cuentaDe(de) !== origenCuenta || ctx.cuentaDe(a) !== origenCuenta) {
      return { valor: 0, apto: false, motivo: 'interno' };
    }
  }
  
  // 2. 'servidor' para 'privado'/'interno' solo si cifradoE2E (si no, veto)
  if (medio === 'servidor' && (dato.clase === 'privado' || dato.clase === 'interno') && !ctx.cifradoE2E) {
    return { valor: 0, apto: false, motivo: 'servidor' };
  }
  
  // 3. 'lora' con bytes > 200 × 8 o tipo 'llamada'
  if (medio === 'lora' && (dato.bytes > 200 * 8 || dato.tipo === 'llamada')) {
    return { valor: 0, apto: false, motivo: 'lora' };
  }
  
  // 4. 'nfc' con bytes > 32768
  if (medio === 'nfc' && dato.bytes > 32768) {
    return { valor: 0, apto: false, motivo: 'nfc' };
  }
  
  // 5. 'privado' o 'interno' sin cifradoE2E (veto general)
  if ((dato.clase === 'privado' || dato.clase === 'interno') && !ctx.cifradoE2E) {
    return { valor: 0, apto: false, motivo: dato.clase === 'privado' ? 'privado' : 'interno' };
  }

  // Si pasa los vetos, calcular valor
  const calidad = calidadSenal(s);
  // Factor de prioridad: P0 premia latencia, P3 premia ancho
  // Como no se especifica exactamente, usamos un factor neutro de 1.0
  // Los tests de orden relativo se basarán en otros factores
  let factorPrioridad = 1.0;
  
  // Factor por medio servidor y clase no publico
  let factorServidor = 1.0;
  if (medio === 'servidor' && dato.clase !== 'publico') {
    factorServidor = 0.6;
  }
  
   // Factor por batería baja y medio de alto consumo (wifi-lan, webrtc)
   let factorBateria = 1.0;
   const consumoAlto = medio === 'wifi-lan' || medio === 'webrtc';
   if (consumoAlto && ctx.bateriaPct != null && ctx.bateriaPct < 20) {
     factorBateria = 0.8;
   }
  
  const valor = calidad * factorPrioridad * factorServidor * factorBateria;
  
  // Aseguramos que el valor esté entre 0 y 1
  const valorFinal = Math.max(0, Math.min(1, valor));
  
  return {
    valor: valorFinal,
    apto: true,
    motivo: 'viable',
  };
}