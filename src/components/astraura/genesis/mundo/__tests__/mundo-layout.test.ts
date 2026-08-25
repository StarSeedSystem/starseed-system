/**
 * mundo-layout.test.ts — Pruebas de la colocación y el agrupamiento puros.
 * Es justo lo que la tarea señala como más peligroso: código donde "se ve
 * bien" no es evidencia de que sea correcto. Aquí se comprueba con números,
 * no con la vista.
 */
import { describe, it, expect } from "vitest";
import {
  agruparPorComunidad,
  agruparPorEspacio,
  construirGrafoMundo,
  calcularDisposicionMundo,
  vinculosAAristasVisibles,
} from "../mundo-layout";
import type { SerListado, Vinculo, Comunidad, Espacio } from "@/lib/astraura/genesis-types";

// ─────────────────────────────────────────────────────── Fábricas de prueba

function ser(parcial: Partial<SerListado> & { id: string }): SerListado {
  return {
    nombre: parcial.id,
    rol: "explorador",
    estado: "activo",
    color: null,
    adn: null,
    generacion: 0,
    comunidades: [],
    experiencia: 0,
    ...parcial,
  };
}

function vinculo(parcial: Partial<Vinculo> & { id: string; origenId: string; destinoId: string }): Vinculo {
  return {
    tipo: "aliado",
    fuerza: 0.5,
    bidireccional: true,
    motivo: null,
    creadoEn: 0,
    ...parcial,
  };
}

function comunidad(parcial: Partial<Comunidad> & { id: string }): Comunidad {
  return {
    nombre: parcial.id,
    proposito: "",
    miembros: [],
    espacioId: null,
    color: null,
    creadaEn: 0,
    ...parcial,
  };
}

function espacio(parcial: Partial<Espacio> & { id: string }): Espacio {
  return {
    nombre: parcial.id,
    constructorId: null,
    arquetipo: "agora",
    semilla: 1,
    habitantes: [],
    objetos: [],
    creadoEn: 0,
    ...parcial,
  };
}

function distancia(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

// ────────────────────────────────────────────────────────────── Agrupamiento

describe("agruparPorComunidad", () => {
  it("une las dos direcciones del dato denormalizado", () => {
    const seres = [
      ser({ id: "a", comunidades: ["c1"] }), // solo lo declara el ser
      ser({ id: "b" }), // solo lo declara la comunidad
      ser({ id: "c" }), // no pertenece
    ];
    const comunidades = [comunidad({ id: "c1", miembros: ["b"] })];
    const resultado = agruparPorComunidad(seres, comunidades);
    expect(new Set(resultado.get("c1"))).toEqual(new Set(["a", "b"]));
  });

  it("ignora ids de miembros que no existen entre los seres recibidos", () => {
    const seres = [ser({ id: "a" })];
    const comunidades = [comunidad({ id: "c1", miembros: ["a", "fantasma"] })];
    const resultado = agruparPorComunidad(seres, comunidades);
    expect(resultado.get("c1")).toEqual(["a"]);
  });

  it("una comunidad sin miembros aparece con una lista vacía, no ausente", () => {
    const resultado = agruparPorComunidad([], [comunidad({ id: "vacia" })]);
    expect(resultado.get("vacia")).toEqual([]);
  });
});

describe("agruparPorEspacio", () => {
  it("filtra habitantes desconocidos y no duplica", () => {
    const seres = [ser({ id: "a" })];
    const espacios = [espacio({ id: "e1", habitantes: ["a", "a", "fantasma"] })];
    const resultado = agruparPorEspacio(seres, espacios);
    expect(resultado.get("e1")).toEqual(["a"]);
  });
});

// ───────────────────────────────────────────────────────────── Grafo de fuerzas

describe("construirGrafoMundo", () => {
  it("genera un nodo por ser + comunidad + espacio, y una arista por vínculo/pertenencia válidos", () => {
    const seres = [ser({ id: "a", comunidades: ["c1"] }), ser({ id: "b", comunidades: ["c1"] })];
    const comunidades = [comunidad({ id: "c1", miembros: ["a", "b"] })];
    const espacios = [espacio({ id: "e1", habitantes: ["a"] })];
    const vinculos = [vinculo({ id: "v1", origenId: "a", destinoId: "b" })];

    const { nodos, aristas } = construirGrafoMundo(seres, vinculos, comunidades, espacios);
    expect(nodos).toHaveLength(4); // 2 seres + 1 comunidad + 1 espacio
    // 1 vínculo + 2 pertenencias de comunidad (a,b) + 1 pertenencia de espacio (a)
    expect(aristas).toHaveLength(4);
  });

  it("descarta un vínculo hacia un ser que no está en la lista, sin lanzar", () => {
    const seres = [ser({ id: "a" })];
    const vinculos = [vinculo({ id: "v1", origenId: "a", destinoId: "fantasma" })];
    const { aristas } = construirGrafoMundo(seres, vinculos, [], []);
    expect(aristas).toHaveLength(0);
  });

  it("descarta un auto-vínculo (origen === destino)", () => {
    const seres = [ser({ id: "a" })];
    const vinculos = [vinculo({ id: "v1", origenId: "a", destinoId: "a" })];
    const { aristas } = construirGrafoMundo(seres, vinculos, [], []);
    expect(aristas).toHaveLength(0);
  });

  it("un ser y una comunidad con el MISMO id crudo no se fusionan en un nodo", () => {
    const seres = [ser({ id: "x" })];
    const comunidades = [comunidad({ id: "x" })];
    const { nodos } = construirGrafoMundo(seres, [], comunidades, []);
    expect(nodos).toHaveLength(2);
    expect(new Set(nodos.map((n) => n.type))).toEqual(new Set(["ser", "comunidad"]));
  });

  it("la frecuencia de un ser sin ADN cae a la del tetraedro (741 Hz, el sólido de un agente)", () => {
    const { nodos } = construirGrafoMundo([ser({ id: "a" })], [], [], []);
    expect(nodos[0]?.frequency).toBe(741);
  });
});

// ─────────────────────────────────────────────────────────────── Disposición

describe("calcularDisposicionMundo", () => {
  it("con listas vacías devuelve un mundo vacío digno, no lanza", () => {
    const disposicion = calcularDisposicionMundo([], [], [], []);
    expect(disposicion.seres.size).toBe(0);
    expect(disposicion.comunidades.size).toBe(0);
    expect(disposicion.espacios.size).toBe(0);
    expect(disposicion.iteraciones).toBe(0);
  });

  it("es determinista: mismos datos, misma disposición, bit a bit", () => {
    const seres = [ser({ id: "a" }), ser({ id: "b" }), ser({ id: "c" })];
    const vinculos = [vinculo({ id: "v1", origenId: "a", destinoId: "b", fuerza: 0.9 })];
    const comunidades = [comunidad({ id: "c1", miembros: ["b", "c"] })];
    const espacios = [espacio({ id: "e1", habitantes: ["a"] })];

    const d1 = calcularDisposicionMundo(seres, vinculos, comunidades, espacios, { iteraciones: 120 });
    const d2 = calcularDisposicionMundo(seres, vinculos, comunidades, espacios, { iteraciones: 120 });

    for (const id of ["a", "b", "c"]) {
      expect(d1.seres.get(id)).toEqual(d2.seres.get(id));
    }
  });

  it("un vínculo fuerte acerca a dos seres más que a un tercero sin vínculo alguno", () => {
    const seres = [ser({ id: "a" }), ser({ id: "b" }), ser({ id: "c" })];
    // a-b con vínculo máximo; c sin ningún vínculo ni comunidad — el control.
    const vinculos = [vinculo({ id: "v1", origenId: "a", destinoId: "b", fuerza: 1 })];

    const disposicion = calcularDisposicionMundo(seres, vinculos, [], []);
    const a = disposicion.seres.get("a")!;
    const b = disposicion.seres.get("b")!;
    const c = disposicion.seres.get("c")!;

    expect(distancia(a, b)).toBeLessThan(distancia(a, c));
  });

  it("pertenecer a la misma comunidad acerca más que no pertenecer a ninguna", () => {
    const seres = [ser({ id: "a" }), ser({ id: "b" }), ser({ id: "fuera" })];
    const comunidades = [comunidad({ id: "c1", miembros: ["a", "b"] })];

    const disposicion = calcularDisposicionMundo(seres, [], comunidades, []);
    const a = disposicion.seres.get("a")!;
    const b = disposicion.seres.get("b")!;
    const fuera = disposicion.seres.get("fuera")!;

    expect(distancia(a, b)).toBeLessThan(distancia(a, fuera));
  });

  it("una comunidad sin miembros sigue siendo un lugar legible (radio mínimo, no cero)", () => {
    const disposicion = calcularDisposicionMundo([ser({ id: "a" })], [], [comunidad({ id: "vacia" })], []);
    const region = disposicion.comunidades.get("vacia");
    expect(region).toBeDefined();
    expect(region!.miembros).toEqual([]);
    expect(region!.radio).toBeGreaterThan(0);
  });

  it("el radio de una región siempre alcanza a todos sus miembros dispuestos", () => {
    const seres = [ser({ id: "a" }), ser({ id: "b" }), ser({ id: "c" }), ser({ id: "d" })];
    const comunidades = [comunidad({ id: "c1", miembros: ["a", "b", "c", "d"] })];
    const disposicion = calcularDisposicionMundo(seres, [], comunidades, []);
    const region = disposicion.comunidades.get("c1")!;
    for (const miembroId of region.miembros) {
      const posicion = disposicion.seres.get(miembroId)!;
      expect(distancia(region.centro, posicion)).toBeLessThanOrEqual(region.radio);
    }
  });

  it("cada ser recibido aparece en el resultado, incluso a escala de decenas", () => {
    const seres = Array.from({ length: 60 }, (_, i) => ser({ id: `ser-${i}` }));
    const comunidades = Array.from({ length: 6 }, (_, i) =>
      comunidad({ id: `com-${i}`, miembros: seres.filter((_, j) => j % 6 === i).map((s) => s.id) }),
    );
    const vinculos = Array.from({ length: 80 }, (_, i) =>
      vinculo({
        id: `v-${i}`,
        origenId: `ser-${i % 60}`,
        destinoId: `ser-${(i * 7 + 3) % 60}`,
        fuerza: (i % 10) / 10,
      }),
    );

    const inicio = performance.now();
    const disposicion = calcularDisposicionMundo(seres, vinculos, comunidades, []);
    const duracionMs = performance.now() - inicio;

    expect(disposicion.seres.size).toBe(60);
    for (const s of seres) expect(disposicion.seres.get(s.id)).toBeDefined();
    // No es la medición de FPS del informe (esa se hace en navegador real) —
    // solo una red de seguridad contra una regresión que vuelva la física
    // patológicamente lenta.
    expect(duracionMs).toBeLessThan(2000);
  });

  it("ignora un vínculo cuyo origen o destino no está en `seres` sin romper la convergencia", () => {
    const seres = [ser({ id: "a" }), ser({ id: "b" })];
    const vinculos = [vinculo({ id: "v1", origenId: "a", destinoId: "fantasma" })];
    expect(() => calcularDisposicionMundo(seres, vinculos, [], [])).not.toThrow();
  });
});

describe("vinculosAAristasVisibles", () => {
  it("solo incluye vínculos cuyos dos extremos tienen posición resuelta", () => {
    const posiciones = new Map([
      ["a", { x: 0, y: 0, z: 0 }],
      ["b", { x: 1, y: 0, z: 0 }],
    ]);
    const vinculos = [
      vinculo({ id: "v1", origenId: "a", destinoId: "b" }),
      vinculo({ id: "v2", origenId: "a", destinoId: "fantasma" }),
    ];
    const aristas = vinculosAAristasVisibles(vinculos, posiciones);
    expect(aristas.map((a) => a.id)).toEqual(["v1"]);
  });

  it("no genera nada para las aristas sintéticas de comunidad/espacio — solo vínculos reales", () => {
    const posiciones = new Map([
      ["a", { x: 0, y: 0, z: 0 }],
      ["b", { x: 1, y: 0, z: 0 }],
    ]);
    const aristas = vinculosAAristasVisibles([], posiciones);
    expect(aristas).toEqual([]);
  });

  it("descarta un auto-vínculo", () => {
    const posiciones = new Map([["a", { x: 0, y: 0, z: 0 }]]);
    const aristas = vinculosAAristasVisibles([vinculo({ id: "v1", origenId: "a", destinoId: "a" })], posiciones);
    expect(aristas).toEqual([]);
  });

  it("recorta `fuerza` fuera de rango a 0..1 al convertirla en intensidad", () => {
    const posiciones = new Map([
      ["a", { x: 0, y: 0, z: 0 }],
      ["b", { x: 1, y: 0, z: 0 }],
    ]);
    const aristas = vinculosAAristasVisibles(
      [vinculo({ id: "v1", origenId: "a", destinoId: "b", fuerza: 4.2 })],
      posiciones,
    );
    expect(aristas[0]?.intensidad).toBe(1);
  });
});
