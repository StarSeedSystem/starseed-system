import { CapasPrefs, Contexto, Licencias, preferenciasEfectivas } from '@/lib/modelos/preferencias-capas';

type Motor = {
  id: string;
  claseLicencia: Licencias;
  condicionCumplida?: boolean;
};

type Resultado = {
  permitidos: Motor[];
  excluidos: { id: string; motivo: string }[];
};

/**
 * Filtra los motores según su licencia y el contexto de uso.
 * Reutiliza `preferenciasEfectivas` para determinar las licencias permitidas.
 * @param motores - Array de motores con su id, clase de licencia y opcionalmente condición cumplida.
 * @param contexto - Contexto de uso: personal, grupo, comunidad, publico o comercial.
 * @param capas - Preferencias de cada capa de conciencia.
 * @returns Objeto con los motores permitidos y los excluidos con su motivo.
 */
export function motoresPermitidos(
  motores: Motor[],
  contexto: 'personal' | 'grupo' | 'comunidad' | 'publico' | 'comercial',
  capas: CapasPrefs
): Resultado {
  // Mapeamos el contexto comercial a publico (sin uso personal)
  const contextoMapeado: Contexto = contexto === 'comercial' ? 'publico' : contexto;
  const { licenciaPermitida, permiteUsoPersonal } = preferenciasEfectivas(capas, contextoMapeado);

  const permitidos: Motor[] = [];
  const excluidos: { id: string; motivo: string }[] = [];

  for (const motor of motores) {
    let permitido = false;
    let motivo = '';

    if (motor.claseLicencia === 'personal') {
      if (licenciaPermitida.includes('personal') && permiteUsoPersonal) {
        permitido = true;
      } else {
        motivo = 'pesos no comerciales: solo uso personal';
      }
    } else if (motor.claseLicencia === 'condicionada') {
      // Solo se permite si la condición está cumplida y la licencia condicionada está permitida
      if (licenciaPermitida.includes('condicionada') && motor.condicionCumplida === true) {
        permitido = true;
      } else {
        if (!licenciaPermitida.includes('condicionada')) {
          motivo = 'licencia condicionada no permitida en este contexto';
        } else {
          motivo = 'condición no cumplida';
        }
      }
    } else { // libre o desconocida
      if (licenciaPermitida.includes(motor.claseLicencia)) {
        permitido = true;
      } else {
        motivo = 'licencia no permitida';
      }
    }

    if (permitido) {
      permitidos.push(motor);
    } else {
      excluidos.push({ id: motor.id, motivo });
    }
  }

  return { permitidos, excluidos };
}