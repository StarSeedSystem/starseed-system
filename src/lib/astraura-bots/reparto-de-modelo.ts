export interface RepartoModelo {
  id: string;
  nombre: string;
  descripcion: string;
  modelo: string;
  parametros: Record<string, unknown>;
  preferencias: Record<string, number>;
}

export const MODELOS: RepartoModelo[] = [
  {
    id: "modelo-gratis",
    nombre: "Gratis",
    descripcion: "Modelo gratuito",
    modelo: "modelo-gratis",
    parametros: { maxTareas: 5, maxPasos: 10 },
    preferencias: { costo: 0, calidad: 0.3 },
  },
  {
    id: "modelo-astra",
    nombre: "Astra",
    descripcion: "Modelo Astra",
    modelo: "modelo-astra",
    parametros: { maxTareas: 20, maxPasos: 50 },
    preferencias: { costo: 1, calidad: 0.7 },
  },
];

export function modeloPorId(id: string): RepartoModelo | undefined {
  return MODELOS.find((m) => m.id === id);
}

export function mejoresModelos(parametros?: Record<string, unknown>): RepartoModelo[] {
  return MODELOS.sort((a, b) => {
    const prefA = a.preferencias.costo - b.preferencias.costo;
    const prefB = a.preferencias.calidad - b.preferencias.calidad;
    return prefB - prefA;
  });
}
