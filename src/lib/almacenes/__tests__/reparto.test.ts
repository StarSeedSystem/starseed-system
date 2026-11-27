import { describe, it, expect } from "vitest";
import {
  NodoAlmacen,
  OfertaAlmacen,
  RepartoPlan,
  calcularDiversidad,
  seleccionarNodos,
  verificarReciprocidad,
  calcularCuota,
  repararReparto,
  NodoIdentidad,
} from "../reparto";

describe("reparto - distribución democrática de fragmentos", () => {
  const crearNodo = (overrides: Partial<NodoAlmacen> = {}): NodoAlmacen => ({
    id: `nodo-${Math.random().toString(36).slice(2)}`,
    personaId: `persona-${Math.random().toString(36).slice(2)}`,
    redId: `red-${Math.random().toString(36).slice(2)}`,
    dispositivoId: `dispositivo-${Math.random().toString(36).slice(2)}`,
    capacidadBytes: 100_000_000_000n, // 100 GB
    libreBytes: 50_000_000_000n, // 50 GB libre
    salud: "excelente",
    version: 1,
    ...overrides,
  });

  const crearOferta = (overrides: Partial<OfertaAlmacen> = {}): OfertaAlmacen => ({
    nodoId: `nodo-${Math.random().toString(36).slice(2)}`,
    bytesOfrecidos: 10_000_000_000n, // 10 GB
    duracionMs: 30 * 24 * 60 * 60 * 1000, // 30 días
    prioridad: 1,
    ...overrides,
  });

  describe("calcularDiversidad", () => {
    it("retorna 1.0 para nodos completamente diversos", () => {
      const nodos = [
        crearNodo({ id: "n1", personaId: "p1", redId: "r1", dispositivoId: "d1" }),
        crearNodo({ id: "n2", personaId: "p2", redId: "r2", dispositivoId: "d2" }),
        crearNodo({ id: "n3", personaId: "p3", redId: "r3", dispositivoId: "d3" }),
      ];
      expect(calcularDiversidad(nodos)).toBe(1.0);
    });

    it("retorna valor bajo para nodos en misma persona", () => {
      const nodos = [
        crearNodo({ id: "n1", personaId: "p1", redId: "r1", dispositivoId: "d1" }),
        crearNodo({ id: "n2", personaId: "p1", redId: "r1", dispositivoId: "d2" }), // misma persona, misma red
        crearNodo({ id: "n3", personaId: "p1", redId: "r1", dispositivoId: "d3" }), // misma persona, misma red
      ];
      const diversidad = calcularDiversidad(nodos);
      expect(diversidad).toBeLessThan(0.5);
    });

    it("retorna valor medio para mezcla de personas y redes", () => {
      const nodos = [
        crearNodo({ id: "n1", personaId: "p1", redId: "r1", dispositivoId: "d1" }),
        crearNodo({ id: "n2", personaId: "p2", redId: "r1", dispositivoId: "d2" }), // misma red
        crearNodo({ id: "n3", personaId: "p3", redId: "r2", dispositivoId: "d3" }),
      ];
      const diversidad = calcularDiversidad(nodos);
      expect(diversidad).toBeGreaterThan(0.3);
      expect(diversidad).toBeLessThan(0.9);
    });

    it("maneja array vacío", () => {
      expect(calcularDiversidad([])).toBe(0);
    });

    it("maneja un solo nodo", () => {
      const nodos = [crearNodo()];
      expect(calcularDiversidad(nodos)).toBe(1.0);
    });
  });

  describe("seleccionarNodos", () => {
    it("selecciona n nodos de los disponibles", () => {
      const nodos = Array.from({ length: 10 }, (_, i) => crearNodo({ id: `n${i}` }));
      const ofertas = nodos.map((n) => crearOferta({ nodoId: n.id, bytesOfrecidos: 10_000_000_000n }));
      const seleccionados = seleccionarNodos(nodos, ofertas, 5, 3);
      expect(seleccionados.length).toBe(5);
    });

    it("prefiere nodos con mejor salud", () => {
      const nodos = [
        crearNodo({ id: "n1", salud: "critica" }),
        crearNodo({ id: "n2", salud: "regular" }),
        crearNodo({ id: "n3", salud: "buena" }),
        crearNodo({ id: "n4", salud: "excelente" }),
        crearNodo({ id: "n5", salud: "excelente" }),
      ];
      const ofertas = nodos.map((n) => crearOferta({ nodoId: n.id }));
      const seleccionados = seleccionarNodos(nodos, ofertas, 3, 2);
      // Debe preferir los de salud excelente
      const idsSeleccionados = seleccionados.map((s) => s.nodoId);
      expect(idsSeleccionados).toContain("n4");
      expect(idsSeleccionados).toContain("n5");
    });

    it("prefiere nodos con más capacidad libre", () => {
      const nodos = [
        crearNodo({ id: "n1", libreBytes: 1_000_000_000n }),
        crearNodo({ id: "n2", libreBytes: 10_000_000_000n }),
        crearNodo({ id: "n3", libreBytes: 50_000_000_000n }),
        crearNodo({ id: "n4", libreBytes: 100_000_000_000n }),
        crearNodo({ id: "n5", libreBytes: 200_000_000_000n }),
      ];
      const ofertas = nodos.map((n) => crearOferta({ nodoId: n.id }));
      const seleccionados = seleccionarNodos(nodos, ofertas, 3, 2);
      const idsSeleccionados = seleccionados.map((s) => s.nodoId);
      expect(idsSeleccionados).toContain("n5");
      expect(idsSeleccionados).toContain("n4");
    });

    it("maximiza diversidad (persona, red, dispositivo distintos)", () => {
      const nodos = [
        crearNodo({ id: "n1", personaId: "p1", redId: "r1", dispositivoId: "d1" }),
        crearNodo({ id: "n2", personaId: "p1", redId: "r1", dispositivoId: "d2" }), // misma persona, red
        crearNodo({ id: "n3", personaId: "p2", redId: "r2", dispositivoId: "d3" }),
        crearNodo({ id: "n4", personaId: "p3", redId: "r3", dispositivoId: "d4" }),
        crearNodo({ id: "n5", personaId: "p4", redId: "r4", dispositivoId: "d5" }),
      ];
      const ofertas = nodos.map((n) => crearOferta({ nodoId: n.id }));
      const seleccionados = seleccionarNodos(nodos, ofertas, 3, 2);
      const personas = new Set(seleccionados.map((s) => nodos.find((n) => n.id === s.nodoId)?.personaId));
      // Debe elegir personas distintas si es posible
      expect(personas.size).toBeGreaterThanOrEqual(2);
    });

    it("respeta el número de réplicas n", () => {
      const nodos = Array.from({ length: 20 }, (_, i) => crearNodo({ id: `n${i}` }));
      const ofertas = nodos.map((n) => crearOferta({ nodoId: n.id }));
      for (const n of [3, 5, 7, 10]) {
        const seleccionados = seleccionarNodos(nodos, ofertas, n, 2);
        expect(seleccionados.length).toBe(n);
      }
    });

    it("lanza error si no hay suficientes nodos", () => {
      const nodos = [crearNodo({ id: "n1" }), crearNodo({ id: "n2" })];
      const ofertas = nodos.map((n) => crearOferta({ nodoId: n.id }));
      expect(() => seleccionarNodos(nodos, ofertas, 5, 2)).toThrow("Nodos insuficientes");
    });

    it("filtra nodos sin oferta válida", () => {
      const nodos = [
        crearNodo({ id: "n1" }),
        crearNodo({ id: "n2" }),
        crearNodo({ id: "n3" }),
      ];
      const ofertas = [
        crearOferta({ nodoId: "n1" }),
        // n2 sin oferta
        crearOferta({ nodoId: "n3" }),
      ];
      const seleccionados = seleccionarNodos(nodos, ofertas, 2, 1);
      expect(seleccionados.length).toBe(2);
      const ids = seleccionados.map((s) => s.nodoId);
      expect(ids).not.toContain("n2");
    });
  });

  describe("verificarReciprocidad", () => {
    it("aprueba si el nodo ofrece al menos lo que consume", () => {
      const nodo = crearNodo({ id: "n1", personaId: "p1" });
      const ofertasPropias = [crearOferta({ nodoId: "n1", bytesOfrecidos: 20_000_000_000n })];
      const consumo = 10_000_000_000n;
      expect(verificarReciprocidad(nodo, ofertasPropias, consumo)).toBe(true);
    });

    it("rechaza si el nodo consume más de lo que ofrece", () => {
      const nodo = crearNodo({ id: "n1", personaId: "p1" });
      const ofertasPropias = [crearOferta({ nodoId: "n1", bytesOfrecidos: 5_000_000_000n })];
      const consumo = 10_000_000_000n;
      expect(verificarReciprocidad(nodo, ofertasPropias, consumo)).toBe(false);
    });

    it("aprueba si no hay ofertas propias pero consumo es 0", () => {
      const nodo = crearNodo({ id: "n1", personaId: "p1" });
      expect(verificarReciprocidad(nodo, [], 0)).toBe(true);
    });

    it("suma múltiples ofertas del mismo nodo", () => {
      const nodo = crearNodo({ id: "n1", personaId: "p1" });
      const ofertasPropias = [
        crearOferta({ nodoId: "n1", bytesOfrecidos: 5_000_000_000n }),
        crearOferta({ nodoId: "n1", bytesOfrecidos: 6_000_000_000n }),
      ];
      const consumo = 10_000_000_000n;
      expect(verificarReciprocidad(nodo, ofertasPropias, consumo)).toBe(true);
    });
  });

  describe("calcularCuota", () => {
    it("calcula cuota base por reciprocidad", () => {
      const ofertas = [
        crearOferta({ nodoId: "n1", bytesOfrecidos: 100_000_000_000n }),
        crearOferta({ nodoId: "n2", bytesOfrecidos: 50_000_000_000n }),
        crearOferta({ nodoId: "n3", bytesOfrecidos: 10_000_000_000n }),
      ];
      const cuotas = calcularCuota(ofertas, 100_000_000_000n); // total demanda 100GB
      expect(cuotas.get("n1")).toBeGreaterThan(cuotas.get("n2")!);
      expect(cuotas.get("n2")).toBeGreaterThan(cuotas.get("n3")!);
    });

    it("respeta límite máximo de cuota por nodo", () => {
      const ofertas = [
        crearOferta({ nodoId: "n1", bytesOfrecidos: 1_000_000_000_000n }), // 1TB
        crearOferta({ nodoId: "n2", bytesOfrecidos: 10_000_000_000n }),
      ];
      const cuotas = calcularCuota(ofertas, 100_000_000_000n, { maxPorNodo: 50_000_000_000n });
      expect(cuotas.get("n1")).toBeLessThanOrEqual(50_000_000_000n);
      expect(cuotas.get("n2")).toBeLessThanOrEqual(50_000_000_000n);
      // La suma debe ser <= demandaTotal (puede ser menor si maxPorNodo lo impide)
      const suma = (cuotas.get("n1") ?? 0n) + (cuotas.get("n2") ?? 0n);
      expect(suma).toBeLessThanOrEqual(100_000_000_000n);
    });

    it("distribuye proporcionalmente a la oferta", () => {
      const ofertas = [
        crearOferta({ nodoId: "n1", bytesOfrecidos: 20_000_000_000n }),
        crearOferta({ nodoId: "n2", bytesOfrecidos: 20_000_000_000n }),
      ];
      const cuotas = calcularCuota(ofertas, 40_000_000_000n);
      expect(cuotas.get("n1")).toBe(20_000_000_000n);
      expect(cuotas.get("n2")).toBe(20_000_000_000n);
    });

    it("maneja demanda cero", () => {
      const ofertas = [crearOferta({ nodoId: "n1", bytesOfrecidos: 10_000_000_000n })];
      const cuotas = calcularCuota(ofertas, 0n);
      expect(cuotas.get("n1")).toBe(0n);
    });
  });

  describe("repararReparto", () => {
    it("reemplaza nodo caído por uno nuevo manteniendo n réplicas", () => {
      const nodos = Array.from({ length: 10 }, (_, i) => crearNodo({ id: `n${i}` }));
      const ofertas = nodos.map((n) => crearOferta({ nodoId: n.id }));
      const planOriginal: RepartoPlan = {
        fragmentoIndices: [0, 1, 2, 3, 4],
        asignaciones: new Map([
          [0, "n0"],
          [1, "n1"],
          [2, "n2"],
          [3, "n3"],
          [4, "n4"],
        ]),
        k: 3,
        n: 5,
      };

      // Nodo n2 se cae
      const nodosDisponibles = nodos.filter((n) => n.id !== "n2");
      const ofertasDisponibles = ofertas.filter((o) => o.nodoId !== "n2");

      const planReparado = repararReparto(planOriginal, nodosDisponibles, ofertasDisponibles, ["n2"]);
      expect(planReparado.asignaciones.size).toBe(5);
      expect(planReparado.asignaciones.has(2)).toBe(true);
      expect(planReparado.asignaciones.get(2)).not.toBe("n2");
      // Debe mantener k=3, n=5
      expect(planReparado.k).toBe(3);
      expect(planReparado.n).toBe(5);
    });

    it("no duplica nodos en la reparación", () => {
      const nodos = Array.from({ length: 6 }, (_, i) => crearNodo({ id: `n${i}` }));
      const ofertas = nodos.map((n) => crearOferta({ nodoId: n.id }));
      const planOriginal: RepartoPlan = {
        fragmentoIndices: [0, 1, 2, 3, 4],
        asignaciones: new Map([
          [0, "n0"],
          [1, "n1"],
          [2, "n2"],
          [3, "n3"],
          [4, "n4"],
        ]),
        k: 3,
        n: 5,
      };

      const nodosDisponibles = nodos.filter((n) => n.id !== "n2");
      const ofertasDisponibles = ofertas.filter((o) => o.nodoId !== "n2");

      const planReparado = repararReparto(planOriginal, nodosDisponibles, ofertasDisponibles, ["n2"]);
      const nodosAsignados = Array.from(planReparado.asignaciones.values());
      const unicos = new Set(nodosAsignados);
      expect(unicos.size).toBe(nodosAsignados.length);
    });

    it("mantiene diversidad en la reparación", () => {
      const nodos = [
        crearNodo({ id: "n0", personaId: "p1", redId: "r1" }),
        crearNodo({ id: "n1", personaId: "p2", redId: "r2" }),
        crearNodo({ id: "n2", personaId: "p3", redId: "r3" }), // cae
        crearNodo({ id: "n3", personaId: "p4", redId: "r4" }),
        crearNodo({ id: "n4", personaId: "p5", redId: "r5" }),
        crearNodo({ id: "n5", personaId: "p1", redId: "r1" }), // mismo p1/r1 que n0
      ];
      const ofertas = nodos.map((n) => crearOferta({ nodoId: n.id }));
      const planOriginal: RepartoPlan = {
        fragmentoIndices: [0, 1, 2, 3, 4],
        asignaciones: new Map([
          [0, "n0"],
          [1, "n1"],
          [2, "n2"],
          [3, "n3"],
          [4, "n4"],
        ]),
        k: 3,
        n: 5,
      };

      const nodosDisponibles = nodos.filter((n) => n.id !== "n2");
      const ofertasDisponibles = ofertas.filter((o) => o.nodoId !== "n2");

      const planReparado = repararReparto(planOriginal, nodosDisponibles, ofertasDisponibles, ["n2"]);
      // Debe preferir n5 (nueva persona/red) sobre duplicar p1/r1
      const asignado = planReparado.asignaciones.get(2);
      expect(asignado).toBe("n5");
    });
  });

  describe("NodoIdentidad", () => {
    it("identifica nodo por persona+dispositivo+red", () => {
      const identidad: NodoIdentidad = {
        personaId: "p1",
        dispositivoId: "d1",
        redId: "r1",
      };
      expect(identidad.personaId).toBe("p1");
      expect(identidad.dispositivoId).toBe("d1");
      expect(identidad.redId).toBe("r1");
    });

    it("permite comparar identidades", () => {
      const id1: NodoIdentidad = { personaId: "p1", dispositivoId: "d1", redId: "r1" };
      const id2: NodoIdentidad = { personaId: "p1", dispositivoId: "d1", redId: "r1" };
      const id3: NodoIdentidad = { personaId: "p2", dispositivoId: "d1", redId: "r1" };
      expect(JSON.stringify(id1)).toBe(JSON.stringify(id2));
      expect(JSON.stringify(id1)).not.toBe(JSON.stringify(id3));
    });
  });
});