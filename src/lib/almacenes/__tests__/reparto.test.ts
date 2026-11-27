import { describe, it, expect } from "vitest";
import {
  NodoAlmacen,
  OfertaAlmacenamiento,
  ResultadoReparto,
  RepartoError,
  calcularPuntuacionNodo,
  seleccionarNodos,
  verificarDiversidad,
  repararReparto,
  calcularCuotaReciprocidad,
  type PoliticaDiversidad,
} from "../reparto";

describe("reparto - distribución democrática de fragmentos", () => {
  const nodoBase: NodoAlmacen = {
    id: "nodo-1",
    personaId: "persona-1",
    redId: "red-1",
    dispositivoId: "dispositivo-1",
    capacidadTotalBytes: BigInt(1_000_000_000_000), // 1 TB
    capacidadDisponibleBytes: BigInt(500_000_000_000), // 500 GB
    salud: "excelente",
    latenciaMs: 10,
    anchoBandaMbps: 1000,
    reputacion: 1.0,
    ofreciendoDesde: "2026-01-01T00:00:00Z",
  };

  const crearNodo = (overrides: Partial<NodoAlmacen> = {}): NodoAlmacen => ({
    ...nodoBase,
    ...overrides,
    id: overrides.id ?? `nodo-${Math.random()}`,
  });

  describe("NodoAlmacen", () => {
    it("define un nodo con todos los campos requeridos", () => {
      const nodo = crearNodo();
      expect(nodo.id).toBeDefined();
      expect(nodo.personaId).toBeDefined();
      expect(nodo.redId).toBeDefined();
      expect(nodo.dispositivoId).toBeDefined();
      expect(nodo.capacidadTotalBytes).toBeGreaterThan(0n);
      expect(nodo.capacidadDisponibleBytes).toBeGreaterThan(0n);
      expect(["excelente", "buena", "regular", "critica", "desconocida"]).toContain(nodo.salud);
      expect(nodo.latenciaMs).toBeGreaterThanOrEqual(0);
      expect(nodo.anchoBandaMbps).toBeGreaterThan(0);
      expect(nodo.reputacion).toBeGreaterThanOrEqual(0);
      expect(nodo.reputacion).toBeLessThanOrEqual(1);
    });
  });

  describe("calcularPuntuacionNodo", () => {
    it("puntuación alta para nodo excelente con mucha capacidad", () => {
      const nodo = crearNodo({
        salud: "excelente",
        capacidadDisponibleBytes: BigInt(800_000_000_000),
        latenciaMs: 5,
        anchoBandaMbps: 2000,
        reputacion: 1.0,
      });

      const puntuacion = calcularPuntuacionNodo(nodo, BigInt(100_000_000_000)); // 100 GB necesarios
      expect(puntuacion).toBeGreaterThan(0.8);
    });

    it("puntuación baja para nodo con poca capacidad disponible", () => {
      const nodo = crearNodo({
        capacidadDisponibleBytes: BigInt(10_000_000_000), // 10 GB
        salud: "buena",
      });

      const puntuacion = calcularPuntuacionNodo(nodo, BigInt(100_000_000_000)); // 100 GB necesarios
      expect(puntuacion).toBeLessThan(0.3);
    });

    it("puntuación cero si capacidad insuficiente", () => {
      const nodo = crearNodo({
        capacidadDisponibleBytes: BigInt(1_000_000_000), // 1 GB
      });

      const puntuacion = calcularPuntuacionNodo(nodo, BigInt(100_000_000_000)); // 100 GB necesarios
      expect(puntuacion).toBe(0);
    });

    it("puntuación penaliza salud crítica", () => {
      const nodoExcelente = crearNodo({ salud: "excelente", capacidadDisponibleBytes: BigInt(500_000_000_000) });
      const nodoCritico = crearNodo({ salud: "critica", capacidadDisponibleBytes: BigInt(500_000_000_000) });

      const p1 = calcularPuntuacionNodo(nodoExcelente, BigInt(100_000_000_000));
      const p2 = calcularPuntuacionNodo(nodoCritico, BigInt(100_000_000_000));

      expect(p2).toBeLessThan(p1);
    });

    it("puntuación considera latencia y ancho de banda", () => {
      const nodoRapido = crearNodo({ latenciaMs: 5, anchoBandaMbps: 2000 });
      const nodoLento = crearNodo({ latenciaMs: 500, anchoBandaMbps: 10 });

      const p1 = calcularPuntuacionNodo(nodoRapido, BigInt(100_000_000_000));
      const p2 = calcularPuntuacionNodo(nodoLento, BigInt(100_000_000_000));

      expect(p1).toBeGreaterThan(p2);
    });

    it("puntuación considera reputación", () => {
      const nodoBueno = crearNodo({ reputacion: 1.0 });
      const nodoMalo = crearNodo({ reputacion: 0.2 });

      const p1 = calcularPuntuacionNodo(nodoBueno, BigInt(100_000_000_000));
      const p2 = calcularPuntuacionNodo(nodoMalo, BigInt(100_000_000_000));

      expect(p1).toBeGreaterThan(p2);
    });
  });

  describe("seleccionarNodos", () => {
    it("selecciona n nodos de los disponibles para k de n", () => {
      const nodos = Array.from({ length: 10 }, (_, i) => crearNodo({ id: `nodo-${i}` }));
      const fragmentosPorNodo = 1; // Cada nodo guarda 1 fragmento
      const totalFragmentos = 5; // n = 5
      const k = 3;

      const resultado = seleccionarNodos(nodos, totalFragmentos, k, fragmentosPorNodo);

      expect(resultado.nodosSeleccionados.length).toBe(totalFragmentos);
      expect(resultado.nodosSeleccionados.length).toBeLessThanOrEqual(nodos.length);
      // Verificar que todos son nodos válidos
      for (const sel of resultado.nodosSeleccionados) {
        expect(nodos.find((n) => n.id === sel.nodoId)).toBeDefined();
        expect(sel.fragmentosAsignados).toBe(fragmentosPorNodo);
      }
    });

    it("respeta diversidad: no pone todo en mismo dispositivo", () => {
      // 5 nodos, mismo dispositivo, distintas personas/redes
      const nodos = Array.from({ length: 5 }, (_, i) =>
        crearNodo({ id: `nodo-${i}`, personaId: `persona-${i}`, redId: `red-${i}`, dispositivoId: "mismo-dispositivo" })
      );

      const politica: PoliticaDiversidad = {
        maxPorDispositivo: 1,
        maxPorRed: 2,
        maxPorPersona: 2,
      };

      // Con maxPorDispositivo=1, solo puede seleccionar 1 nodo (lanza error si pide más)
      expect(() => seleccionarNodos(nodos, 5, 3, 1, politica)).toThrow(RepartoError);

      // Pero puede seleccionar 1 nodo
      const resultado = seleccionarNodos(nodos, 1, 1, 1, politica);
      expect(resultado.nodosSeleccionados.length).toBe(1);
    });

    it("respeta diversidad: no pone todo en misma red", () => {
      const nodos = Array.from({ length: 5 }, (_, i) =>
        crearNodo({ id: `nodo-${i}`, personaId: `persona-${i}`, redId: "misma-red", dispositivoId: `dispositivo-${i}` })
      );

      const politica: PoliticaDiversidad = {
        maxPorDispositivo: 5,
        maxPorRed: 2,
        maxPorPersona: 5,
      };

      // Con maxPorRed=2, solo puede seleccionar 2 nodos
      expect(() => seleccionarNodos(nodos, 5, 3, 1, politica)).toThrow(RepartoError);

      const resultado = seleccionarNodos(nodos, 2, 2, 1, politica);
      expect(resultado.nodosSeleccionados.length).toBe(2);
    });

    it("respeta diversidad: no pone todo en misma persona", () => {
      const nodos = Array.from({ length: 5 }, (_, i) =>
        crearNodo({ id: `nodo-${i}`, personaId: "misma-persona", redId: `red-${i}`, dispositivoId: `dispositivo-${i}` })
      );

      const politica: PoliticaDiversidad = {
        maxPorDispositivo: 5,
        maxPorRed: 5,
        maxPorPersona: 2,
      };

      // Con maxPorPersona=2, solo puede seleccionar 2 nodos
      expect(() => seleccionarNodos(nodos, 5, 3, 1, politica)).toThrow(RepartoError);

      const resultado = seleccionarNodos(nodos, 2, 2, 1, politica);
      expect(resultado.nodosSeleccionados.length).toBe(2);
    });

    it("prefiere nodos con mayor puntuación", () => {
      const nodos = [
        crearNodo({ id: "bueno", salud: "excelente", capacidadDisponibleBytes: BigInt(500_000_000_000), reputacion: 1.0 }),
        crearNodo({ id: "malo", salud: "regular", capacidadDisponibleBytes: BigInt(50_000_000_000), reputacion: 0.3 }),
        crearNodo({ id: "medio", salud: "buena", capacidadDisponibleBytes: BigInt(200_000_000_000), reputacion: 0.7 }),
      ];

      const resultado = seleccionarNodos(nodos, 2, 2, 1);

      // Debe seleccionar los 2 mejores
      expect(resultado.nodosSeleccionados.map((s) => s.nodoId)).toEqual(["bueno", "medio"]);
    });

    it("lanza error si no hay suficientes nodos válidos", () => {
      const nodos = [crearNodo({ capacidadDisponibleBytes: BigInt(1_000_000_000) })]; // Muy poca capacidad

      expect(() => seleccionarNodos(nodos, 5, 3, 1)).toThrow(RepartoError);
    });

    it("asigna múltiples fragmentos por nodo si se especifica", () => {
      // Necesitamos al menos k nodos distintos para k=2
      const nodos = [
        crearNodo({ id: "nodo-1", capacidadDisponibleBytes: BigInt(500_000_000_000) }),
        crearNodo({ id: "nodo-2", capacidadDisponibleBytes: BigInt(500_000_000_000) }),
      ];

      // 3 fragmentos totales, 2 por nodo (fragmentosPorNodo=2)
      // Como hay 2 nodos, se asignan 2 al primero y 1 al segundo = 3 asignaciones
      const resultado = seleccionarNodos(nodos, 3, 2, 2);

      // Devuelve 3 asignaciones (no 2 nodos)
      expect(resultado.nodosSeleccionados.length).toBe(3);
      // Verificar que hay 2 nodos distintos
      const nodosDistintos = new Set(resultado.nodosSeleccionados.map((s) => s.nodoId)).size;
      expect(nodosDistintos).toBe(2);
    });
  });

  describe("verificarDiversidad", () => {
    it("devuelve true si cumple política de diversidad", () => {
      const nodos = [
        crearNodo({ id: "n1", personaId: "p1", redId: "r1", dispositivoId: "d1" }),
        crearNodo({ id: "n2", personaId: "p2", redId: "r2", dispositivoId: "d2" }),
        crearNodo({ id: "n3", personaId: "p3", redId: "r3", dispositivoId: "d3" }),
      ];

      const politica: PoliticaDiversidad = { maxPorDispositivo: 1, maxPorRed: 2, maxPorPersona: 2 };
      expect(verificarDiversidad(nodos, politica)).toBe(true);
    });

    it("devuelve false si viola maxPorDispositivo", () => {
      const nodos = [
        crearNodo({ id: "n1", dispositivoId: "d1" }),
        crearNodo({ id: "n2", dispositivoId: "d1" }),
        crearNodo({ id: "n3", dispositivoId: "d2" }),
      ];

      const politica: PoliticaDiversidad = { maxPorDispositivo: 1, maxPorRed: 3, maxPorPersona: 3 };
      expect(verificarDiversidad(nodos, politica)).toBe(false);
    });

    it("devuelve false si viola maxPorRed", () => {
      const nodos = [
        crearNodo({ id: "n1", redId: "r1" }),
        crearNodo({ id: "n2", redId: "r1" }),
        crearNodo({ id: "n3", redId: "r1" }),
      ];

      const politica: PoliticaDiversidad = { maxPorDispositivo: 3, maxPorRed: 2, maxPorPersona: 3 };
      expect(verificarDiversidad(nodos, politica)).toBe(false);
    });

    it("devuelve false si viola maxPorPersona", () => {
      const nodos = [
        crearNodo({ id: "n1", personaId: "p1" }),
        crearNodo({ id: "n2", personaId: "p1" }),
        crearNodo({ id: "n3", personaId: "p1" }),
      ];

      const politica: PoliticaDiversidad = { maxPorDispositivo: 3, maxPorRed: 3, maxPorPersona: 2 };
      expect(verificarDiversidad(nodos, politica)).toBe(false);
    });
  });

  describe("repararReparto", () => {
    it("repara reparto cuando un nodo se va", () => {
      const nodosOriginales = Array.from({ length: 5 }, (_, i) => crearNodo({ id: `nodo-${i}` }));
      const asignacionOriginal = nodosOriginales.map((n, i) => ({
        nodoId: n.id,
        fragmentosAsignados: 1,
        indiceFragmento: i,
      }));

      // Nodo 2 se va
      const nodosDisponibles = nodosOriginales.filter((n) => n.id !== "nodo-2");
      const nodosCaidos = ["nodo-2"];

      const reparacion = repararReparto(asignacionOriginal, nodosDisponibles, nodosCaidos, 5, 3);

      expect(reparacion.nuevasAsignaciones.length).toBe(5);
      // El fragmento del nodo caído debe reasignarse
      const fragmentoHuerfano = asignacionOriginal.find((a) => a.nodoId === "nodo-2");
      expect(fragmentoHuerfano).toBeDefined();
      const nuevoDueño = reparacion.nuevasAsignaciones.find((a) => a.indiceFragmento === fragmentoHuerfano!.indiceFragmento);
      expect(nuevoDueño).toBeDefined();
      expect(nuevoDueño!.nodoId).not.toBe("nodo-2");
    });

    it("mantiene asignaciones de nodos que siguen vivos", () => {
      const nodosOriginales = Array.from({ length: 5 }, (_, i) => crearNodo({ id: `nodo-${i}` }));
      const asignacionOriginal = nodosOriginales.map((n, i) => ({
        nodoId: n.id,
        fragmentosAsignados: 1,
        indiceFragmento: i,
      }));

      const nodosDisponibles = nodosOriginales.filter((n) => n.id !== "nodo-4");
      const nodosCaidos = ["nodo-4"];

      const reparacion = repararReparto(asignacionOriginal, nodosDisponibles, nodosCaidos, 5, 3);

      // Nodos vivos mantienen sus fragmentos
      for (const vivo of nodosDisponibles) {
        const original = asignacionOriginal.find((a) => a.nodoId === vivo.id);
        const nuevo = reparacion.nuevasAsignaciones.find((a) => a.nodoId === vivo.id);
        if (original && nuevo) {
          expect(nuevo.indiceFragmento).toBe(original.indiceFragmento);
        }
      }
    });
  });

  describe("calcularCuotaReciprocidad", () => {
    it("da cuota proporcional a lo ofrecido", () => {
      const ofertas: OfertaAlmacenamiento[] = [
        { personaId: "p1", bytesOfrecidos: BigInt(1_000_000_000_000) }, // 1 TB
        { personaId: "p2", bytesOfrecidos: BigInt(500_000_000_000) }, // 500 GB
        { personaId: "p3", bytesOfrecidos: BigInt(250_000_000_000) }, // 250 GB
      ];

      const cuotas = calcularCuotaReciprocidad(ofertas, BigInt(1_000_000_000_000)); // 1 TB total a repartir

      // Proporcional: p1=1/1.75, p2=0.5/1.75, p3=0.25/1.75
      expect(Number(cuotas.get("p1") ?? 0n)).toBeCloseTo(571_428_571_428, -3);
      expect(Number(cuotas.get("p2") ?? 0n)).toBeCloseTo(285_714_285_714, -3);
      expect(Number(cuotas.get("p3") ?? 0n)).toBeCloseTo(142_857_142_857, -3);
    });

    it("respetan mínimo garantizado", () => {
      const ofertas: OfertaAlmacenamiento[] = [
        { personaId: "p1", bytesOfrecidos: BigInt(1_000_000_000_000) },
        { personaId: "p2", bytesOfrecidos: BigInt(0) }, // No ofrece nada
      ];

      const cuotas = calcularCuotaReciprocidad(ofertas, BigInt(100_000_000_000), { minimoGarantizado: BigInt(10_000_000_000) });

      expect(cuotas.get("p1")).toBeGreaterThan(0);
      expect(cuotas.get("p2")).toBe(BigInt(10_000_000_000)); // Mínimo garantizado
    });

    it("cuota cero si no hay capacidad total", () => {
      const ofertas: OfertaAlmacenamiento[] = [
        { personaId: "p1", bytesOfrecidos: BigInt(0) },
        { personaId: "p2", bytesOfrecidos: BigInt(0) },
      ];

      const cuotas = calcularCuotaReciprocidad(ofertas, BigInt(1_000_000_000_000));

      expect(cuotas.get("p1")).toBe(0n);
      expect(cuotas.get("p2")).toBe(0n);
    });
  });

  describe("Integración: reparto completo con reparación", () => {
    it("flujo: seleccionar -> verificar diversidad -> simular caída -> reparar", () => {
      // 10 nodos diversos
      const nodos = Array.from({ length: 10 }, (_, i) =>
        crearNodo({
          id: `nodo-${i}`,
          personaId: `persona-${i % 5}`, // 5 personas
          redId: `red-${i % 3}`, // 3 redes
          dispositivoId: `dispositivo-${i}`, // 10 dispositivos únicos
        })
      );

      const politica: PoliticaDiversidad = {
        maxPorDispositivo: 1,
        maxPorRed: 2,
        maxPorPersona: 2,
      };

      // Seleccionar 6 nodos para n=6, k=4
      const seleccion = seleccionarNodos(nodos, 6, 4, 1, politica);
      expect(seleccion.nodosSeleccionados.length).toBe(6);
      expect(verificarDiversidad(seleccion.nodosSeleccionados.map((s) => nodos.find((n) => n.id === s.nodoId)!), politica)).toBe(true);

      // Simular caída de 2 nodos
      const caidos = seleccion.nodosSeleccionados.slice(0, 2).map((s) => s.nodoId);
      const disponibles = nodos.filter((n) => !caidos.includes(n.id));

      const asignacionOriginal = seleccion.nodosSeleccionados.map((s) => ({
        nodoId: s.nodoId,
        fragmentosAsignados: 1,
        indiceFragmento: s.indiceFragmento,
      }));

      const reparacion = repararReparto(asignacionOriginal, disponibles, caidos, 6, 4);

      // Debe haber 6 asignaciones (todos los fragmentos cubiertos)
      expect(reparacion.nuevasAsignaciones.length).toBe(6);

      // Verificar que al menos k nodos distintos
      const nodosDistintos = new Set(reparacion.nuevasAsignaciones.map((a) => a.nodoId)).size;
      expect(nodosDistintos).toBeGreaterThanOrEqual(4);
    });
  });
});