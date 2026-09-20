import { pasoDeTarea, type Etapa } from "./etapas";
import type { LatidoTarea } from "./tipos";

export interface EtapaFila {
  indice: number;
  nombre: Etapa;
  porcentaje: number;
  atascada: boolean;
}

export interface FilaAgenteDatos {
  tarea: string;
  titulo: string;
  fase: string;
  etapa: EtapaFila;
  modelo: string;
  proveedor?: string;
  minutos: number;
  intento?: number;
  medio: string;
  ide?: string;
  tokens?: { entrada: number; salida: number };
}

export type LatidoEntrada = LatidoTarea & {
  titulo?: string;
  ide?: string;
  estado?: string;
};

/**
 * Convierte un latido crudo en la estructura normalizada FilaAgenteDatos
 * usando las funciones de `@/lib/mando/etapas`.
 */
export function filaDeLatido(l: LatidoEntrada, ahora: number): FilaAgenteDatos {
  const minutos = Math.max(0, l.minutos ?? 0);
  const minutosDesde = ahora - minutos * 60_000;
  const paso = pasoDeTarea(
    {
      id: l.tarea,
      fase: l.fase,
      estado: l.estado,
      minutosDesde,
      modelo: l.modelo,
    },
    ahora,
  );

  const etapa: EtapaFila = paso
    ? {
        indice: paso.indice,
        nombre: paso.etapa,
        porcentaje: paso.porcentaje,
        atascada: paso.desenlace === "atascada",
      }
    : {
        indice: 0,
        nombre: "escribiendo",
        porcentaje: 16,
        atascada: false,
      };

  return {
    tarea: l.tarea,
    titulo: l.titulo || l.tarea,
    fase: l.fase || "",
    etapa,
    modelo: l.modelo || "gemini-3.6-flash",
    proveedor: l.proveedor,
    minutos,
    intento: l.intento,
    medio: l.medio || l.donde || "mac",
    ide: l.ide,
    tokens: l.tokens
      ? { entrada: l.tokens.entrada ?? 0, salida: l.tokens.salida ?? 0 }
      : undefined,
  };
}
