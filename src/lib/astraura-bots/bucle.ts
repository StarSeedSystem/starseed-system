export interface Bucle {
  id: string;
  nombre: string;
  descripcion: string;
  iteraciones: number;
  delay: number;
}

export const BUCHES: Bucle[] = [
  {
    id: "bucles-gratis",
    nombre: "Bucles Gratis",
    descripcion: "Bucles con costo gratuito",
    iteraciones: 10,
    delay: 0,
  },
  {
    id: "bucles-astra",
    nombre: "Bucles Astra",
    descripcion: "Bucles con costo Astra",
    iteraciones: 50,
    delay: 1000,
  },
];

export function buclePorId(id: string): Bucle | undefined {
  return BUCHES.find((b) => b.id === id);
}

export function ejecutarBucle(bucles: Bucle[]): void {
  for (const bucle of bucles) {
    console.log(`Ejecutando bucle: ${bucle.nombre}`);
    for (let i = 0; i < bucle.iteraciones; i++) {
      console.log(`Iteración ${i + 1} de ${bucle.nombre}`);
      if (bucle.delay > 0) {
        console.log(`Esperando ${bucle.delay}ms...`);
        // En una implementación real, usaríamos setTimeout o similar
      }
    }
  }
}
