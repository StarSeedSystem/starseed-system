import type { Visibilidad } from './ambito.ts';

// Input type as per the contract
export interface EstadoAmbito {
  ambito: {
    nombre: string;
    visibilidad: Visibilidad;
  };
  olas: {
    nombre: string;
    avance: number; // assuming number for simplicity, could be string but contract says avance
    tareas: {
      id: string;
      titulo: string;
      estado: string;
      prompt?: string;
      archivos?: string[];
      registro?: string;
      proveedor?: string;
    }[];
  }[];
  integradas: {
    titulo: string;
    fecha: string; // assuming ISO string
    archivos?: string[];
    commit?: string;
  }[];
  motor: {
    estado: string;
    ultimo_reporte: string; // ISO timestamp
    proveedores?: string[];
  };
  medidores?: {
    creditos?: unknown;
  };
  chat: {
    canal: string;
    autor: string;
    texto: string;
  }[];
}

// Output type
export interface VistaPublica {
  nombre: string;
  olas: {
    nombre: string;
    avance: number;
    tareas: {
      titulo: string;
      estado: string;
    }[];
  }[];
  integradas: {
    titulo: string;
    fecha: string;
  }[];
  motor: {
    estado: string;
    haceMin: number; // minutes since ultimo_reporte
  };
  avanceMedio: number;
  chat: {
    autor: string;
    texto: string;
  }[];
}

/**
 * Devuelve la vista pública del estado del ámbito si la visibilidad es 'publico', de lo contrario null.
 * @param estado El estado del ámbito
 * @returns VistaPublica | null
 */
export function vistaPublica(estado: EstadoAmbito): VistaPublica | null {
  // If not publico, return null
  if (estado.ambito.visibilidad !== 'publico') {
    return null;
  }

  // Compute haceMin from ultimo_reporte
  const haceMin = Math.floor((Date.now() - new Date(estado.motor.ultimo_reporte).getTime()) / 60000);

   // Compute avanceMedio as the average of avance across olas
   const avanceMedio =
     estado.olas.length > 0
       ? estado.olas.reduce((sum, ola) => sum + ola.avance, 0) / estado.olas.length
       : 0;

  // Filter chat to only canal 'publico'
  const chatPublico = estado.chat
    .filter((msg) => msg.canal === 'publico')
    .map(({ autor, texto }) => ({ autor, texto }));

  // Build the result
  return {
    nombre: estado.ambito.nombre,
    olas: estado.olas.map((ola) => ({
      nombre: ola.nombre,
      avance: ola.avance,
      tareas: ola.tareas.map((t) => ({
        titulo: t.titulo,
        estado: t.estado,
      })),
    })),
    integradas: estado.integradas.map((i) => ({
      titulo: i.titulo,
      fecha: i.fecha,
    })),
    motor: {
      estado: estado.motor.estado,
      haceMin,
    },
    avanceMedio,
    chat: chatPublico,
  };
}