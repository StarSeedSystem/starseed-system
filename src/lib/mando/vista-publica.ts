import { type Visibilidad } from "./ambito";

type EstadoOla = {
  nombre: string;
  avance: number;
  tareas: {
    id: string;
    titulo: string;
    estado: string;
    prompt?: string;
    archivos?: string[];
    registro?: unknown;
    proveedor?: string;
  }[];
};

type EstadoIntegrada = {
  titulo: string;
  fecha: string;
  archivos?: string[];
  commit?: string;
};

type EstadoMotor = {
  estado: string;
  ultimo_reporte: string;
  proveedores?: string[];
};

type Medidores = {
  creditos?: unknown;
};

type ChatEntrada = {
  canal: string;
  autor: string;
  texto: string;
};

type EstadoAmbito = {
  ambito: {
    nombre: string;
    visibilidad: Visibilidad;
  };
  olas: {
    nombre: string;
    avance: number;
    tareas: {
      id: string;
      titulo: string;
      estado: string;
      prompt?: string;
      archivos?: string[];
      registro?: unknown;
      proveedor?: string;
    }[];
  }[];
  integradas: EstadoIntegrada[];
  motor: EstadoMotor;
  medidores?: Medidores;
  chat: ChatEntrada[];
};

type VistaPublica = {
  ambito: {
    nombre: string;
    visibilidad: "publico";
  };
  olas: {
    nombre: string;
    avance: number;
    tareas: {
      id: string;
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
    haceMin: number;
  };
  avanceMedio: number;
  chat: {
    autor: string;
    texto: string;
  }[];
};

export function vistaPublica(estado: EstadoAmbito): VistaPublica | null {
  if (estado.ambito.visibilidad !== "publico") {
    return null;
  }

  const horaEstado = new Date(estado.motor.ultimo_reporte).getTime();
  const ahora = Date.now();
  const haceMin = Math.floor((ahora - horaEstado) / 60000);

  const avanceMedio = estado.olas.reduce((sum, ola) => sum + ola.avance, 0) / estado.olas.length || 0;

  const chatPublico = estado.chat.filter(m => m.canal === "publico");

  return {
    ambito: {
      nombre: estado.ambito.nombre,
      visibilidad: "publico" as const,
    },
    olas: estado.olas.map(ola => ({
      nombre: ola.nombre,
      avance: ola.avance,
      tareas: ola.tareas.map(tarea => ({
        id: tarea.id,
        titulo: tarea.titulo,
        estado: tarea.estado,
      })),
    })),
    integradas: estado.integradas.map(integrada => ({
      titulo: integrada.titulo,
      fecha: integrada.fecha,
    })),
    motor: {
      estado: estado.motor.estado,
      haceMin,
    },
    avanceMedio,
    chat: chatPublico.map(mensaje => ({
      autor: mensaje.autor,
      texto: mensaje.texto,
    })),
  };
}