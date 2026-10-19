// src/lib/aurora/voz-starseed/licencia-voz.ts
import { preferenciasEfectivas, type CapasPrefs, type Licencias, type Contexto } from '../../modelos/preferencias-capas';

export interface Motor {
  id: string;
  claseLicencia: Licencias;
  condicionCumplida?: boolean;
}

export interface ResultadoLicencia {
  permitidos: Motor[];
  excluidos: { id: string; motivo: string }[];
}

export function motoresPermitidos(
  motores: Motor[],
  contexto: 'personal' | 'grupo' | 'comunidad' | 'publico' | 'comercial',
  capas: CapasPrefs
): ResultadoLicencia {
  // Tratar contexto comercial como público sin uso personal
  const contextoEfectivo = contexto === 'comercial' ? 'publico' : contexto;
  
  // Obtener las preferencias efectivas de licencias
  const { licenciaPermitida, permiteUsoPersonal } = preferenciasEfectivas(capas, contextoEfectivo);
  
  const permitidos: Motor[] = [];
  const excluidos: { id: string; motivo: string }[] = [];
  
  for (const motor of motores) {
    // Verificar si la clase de licencia está permitida
    if (!licenciaPermitida.includes(motor.claseLicencia)) {
      excluidos.push({
        id: motor.id,
        motivo: `licencia ${motor.claseLicencia} no permitida en contexto ${contexto}`
      });
      continue;
    }
    
    // Para licencias condicionadas, verificar que la condición se cumpla
    if (motor.claseLicencia === 'condicionada' && !motor.condicionCumplida) {
      excluidos.push({
        id: motor.id,
        motivo: 'condición no cumplida para licencia condicionada'
      });
      continue;
    }
    
    // Si passed all checks, add to permitidos
    permitidos.push(motor);
  }
  
  return { permitidos, excluidos };
}