import type { CapasPrefs, Licencias, ResultadoPreferencias } from "../../modelos/preferencias-capas";
import { preferenciasEfectivas } from "../../modelos/preferencias-capas";

export type ContextoLicencia = "personal" | "grupo" | "comunidad" | "publico" | "comercial";

export interface Motor {
  id: string;
  claseLicencia: Licencias;
  condicionCumplida?: boolean;
}

export interface ResultadoLicencia {
  permitidos: Motor[];
  excluidos: {
    id: string;
    motivo: string;
  }[];
}

export function motoresPermitidos(
  motores: Motor[],
  contexto: ContextoLicencia,
  capas: CapasPrefs
): ResultadoLicencia {
  // Tratar contexto comercial como publico para licencias, pero sin uso personal
  const contextoParaLicencias: "personal" | "grupo" | "comunidad" | "publico" =
    contexto === "comercial" ? "publico" : contexto;

  const { licenciaPermitida, permiteUsoPersonal: permiteUsoPersonalBase } =
    preferenciasEfectivas(capas, contextoParaLicencias);

  // En contexto comercial, nunca se permite uso personal
  const permiteUsoPersonal =
    contexto === "comercial" ? false : permiteUsoPersonalBase;

  const permitidos: Motor[] = [];
  const excluidos: { id: string; motivo: string }[] = [];

  for (const motor of motores) {
    // Primero, verificar si la licencia está permitida por las capas y contexto
    if (!licenciaPermitida.includes(motor.claseLicencia)) {
      // Si es licencia personal y el contexto no es personal, dar motivo de uso personal
      if (
        motor.claseLicencia === "personal" &&
        contexto !== "personal"
      ) {
        excluidos.push({
          id: motor.id,
          motivo: `uso personal no permitido en contexto ${contexto}`,
        });
      } else {
        excluidos.push({
          id: motor.id,
          motivo: `licencia ${motor.claseLicencia} no permitida en contexto ${contexto}`,
        });
      }
      continue;
    }

    // Segundo, si es una licencia personal, verificar que se permita el uso personal
    // (Este caso ocurre cuando la licencia está permitida pero el contexto comercial
    //  no permite uso personal, aunque ya deberíamos haberlo capturado arriba al mapear
    //  comercial a publico. Pero lo dejamos por seguridad.)
    if (
      motor.claseLicencia === "personal" &&
      !permiteUsoPersonal
    ) {
      excluidos.push({
        id: motor.id,
        motivo: `uso personal no permitido en contexto ${contexto}`,
      });
      continue;
    }

    // Tercero, si es condicionada, verificar que se cumpla la condición
    if (
      motor.claseLicencia === "condicionada" &&
      motor.condicionCumplida !== true
    ) {
      excluidos.push({
        id: motor.id,
        motivo: "condición no cumplida",
      });
      continue;
    }

    // De lo contrario, está permitido
    permitidos.push(motor);
  }

  return { permitidos, excluidos };
}