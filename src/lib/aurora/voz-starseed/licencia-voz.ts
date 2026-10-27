import { preferenciasEfectivas, type CapasPrefs, type Contexto, type Licencias } from "@/lib/modelos/preferencias-capas";

export interface MotorInfo {
    id: string;
    claseLicencia: "libre" | "condicionada" | "personal";
    condicionCumplida?: boolean;
}

export interface ResultadoPermisos {
    permitidos: MotorInfo[];
    excluidos: { id: string; motivo: string }[];
}

/**
 * Filtra los motores permitidos según el contexto de uso y las capas de conciencia.
 * 
 * Reglas:
 * - Comercial se trata como contexto "publico" sin uso personal.
 * - Solo motores con licencia "libre" son permitidos fuera de uso personal.
 * - "condicionada" solo se permite si `condicionCumplida` es true.
 * - "personal" solo se permite en contexto personal.
 */
export function motoresPermitidos(
    motores: MotorInfo[],
    contexto: "personal" | "grupo" | "comunidad" | "publico" | "comercial",
    capas: CapasPrefs
): ResultadoPermisos {
    const contextoMapeado: Contexto = contexto === "comercial" ? "publico" : contexto;
    const { licenciaPermitida } = preferenciasEfectivas(capas, contextoMapeado);
    
    const permitidos: MotorInfo[] = [];
    const excluidos: { id: string; motivo: string }[] = [];
    
    for (const motor of motores) {
        const clase = motor.claseLicencia as Licencias;
        
        if (!licenciaPermitida.includes(clase)) {
            const motivo = clase === "personal" 
                ? "pesos no comerciales: solo uso personal"
                : `Licencia ${clase} no permitida en contexto ${contexto}`;
            excluidos.push({ id: motor.id, motivo });
            continue;
        }
        
        if (clase === "condicionada" && !motor.condicionCumplida) {
            excluidos.push({ id: motor.id, motivo: "Condición de uso no cumplida" });
            continue;
        }
        
        permitidos.push(motor);
    }
    
    return { permitidos, excluidos };
}
