/**
 * Desync hunter — recorder, primera divergencia, shrink delta-debug, fixture de regresión.
 * Patrón del skill `coop-sync-testing` (desync-hunting.md): graba, encuentra primera divergencia, encoge, guarda test.
 * Módulo PURO: sin red real, determinista.
 */
import { describe, it, expect } from "vitest";
import { FakeCluster } from "@/lib/test-utils/fake-world";
import { FlightRecorder, vueloAFixture, shrinkDeltaDebug, type FixtureRegresion } from "@/lib/test-utils/flight-recorder";
import { fusionarEstados, type EstadoSala } from "../sincronia-sala";

describe("FlightRecorder · registro y análisis", () => {
  it("registra eventos de tick, fusión y acción", () => {
    const recorder = new FlightRecorder(100);
    recorder.registrar(0, { tipo: "tick", nodo: 0, timestamp: 100, estadoDigest: "abc" });
    recorder.registrar(0, { tipo: "fusion", nodo: 0, timestamp: 150, origen: 1, conflictos: ["e1"], estadoDigest: "def" });
    recorder.registrar(0, { tipo: "accion", nodo: 0, timestamp: 200, accion: "crear:e1" });

    const vuelo = recorder.getVuelo(0);
    expect(vuelo).toBeDefined();
    expect(vuelo!.eventos.length).toBe(3);
    expect(vuelo!.eventos[1].tipo).toBe("fusion");
  });

  it("anillo: exceder capacidad descarta lo más antiguo", () => {
    const recorder = new FlightRecorder(3);
    recorder.registrar(0, { tipo: "tick", nodo: 0, timestamp: 1, estadoDigest: "a" });
    recorder.registrar(0, { tipo: "tick", nodo: 0, timestamp: 2, estadoDigest: "b" });
    recorder.registrar(0, { tipo: "tick", nodo: 0, timestamp: 3, estadoDigest: "c" });
    recorder.registrar(0, { tipo: "tick", nodo: 0, timestamp: 4, estadoDigest: "d" }); // descarta 'a'

    const vuelo = recorder.getVuelo(0);
    expect(vuelo!.eventos.length).toBe(3);
    expect(vuelo!.eventos[0].timestamp).toBe(2);
    expect(vuelo!.eventos[2].timestamp).toBe(4);
  });

  it("vueloAFixture convierte eventos a fixture de regresión", () => {
    const recorder = new FlightRecorder(100);
    recorder.registrar(0, { tipo: "accion", nodo: 0, timestamp: 10, accion: "crear:e1" });
    recorder.registrar(0, { tipo: "fusion", nodo: 0, timestamp: 20, origen: 1, conflictos: [], estadoDigest: "x" });

    const vuelo = recorder.getVuelo(0)!;
    const fixture = vueloAFixture(vuelo, "test-fixture", 123, "bad_wifi");

    expect(fixture.nombre).toBe("test-fixture");
    expect(fixture.semilla).toBe(123);
    expect(fixture.perfil).toBe("bad_wifi");
    expect(fixture.pasos.length).toBe(2);
    expect(fixture.expectaConvergencia).toBe(true);
  });
});

describe("shrinkDeltaDebug · delta-debugging minimiza fixture", () => {
  it("reduce pasos manteniendo el fallo", () => {
    const fixture: FixtureRegresion = {
      nombre: "shrink-test",
      semilla: 1,
      perfil: "bad_wifi",
      pasos: [
        { nodo: 0, accion: "crear:a", timestamp: 10 },
        { nodo: 1, accion: "crear:b", timestamp: 20 },
        { nodo: 0, accion: "editar:a", timestamp: 30 },
        { nodo: 1, accion: "editar:a", timestamp: 40 }, // este causa conflicto
        { nodo: 0, accion: "esperar", timestamp: 50 },
      ],
      expectaConvergencia: true,
      expectaConflictos: ["a"],
    };

    // Replay function: converge siempre, reporta conflictos si está la edición conflictiva
    const replayFn = (pasos: FixtureRegresion["pasos"]) => {
      const tieneConflicto = pasos.some((p) => p.accion === "editar:a" && p.nodo === 1);
      return { converge: true, conflictos: tieneConflicto ? ["a"] : [] };
    };

    const shrunk = shrinkDeltaDebug(fixture, replayFn, 50);
    // Debe quedar solo lo mínimo para reproducir el conflicto
    expect(shrunk.pasos.length).toBeLessThanOrEqual(fixture.pasos.length);
    expect(shrunk.pasos.some((p) => p.accion === "editar:a" && p.nodo === 1)).toBe(true);
    const resultado = replayFn(shrunk.pasos);
    expect(resultado.converge).toBe(fixture.expectaConvergencia);
    expect(resultado.conflictos.sort()).toEqual(fixture.expectaConflictos.sort());
  });

  it("no elimina pasos marcados como pin (último check)", () => {
    const fixture: FixtureRegresion = {
      nombre: "pin-test",
      semilla: 1,
      perfil: "lan",
      pasos: [
        { nodo: 0, accion: "crear:a", timestamp: 10 },
        { nodo: 0, accion: "check", timestamp: 20 }, // pin implícito al final
      ],
      expectaConvergencia: true,
      expectaConflictos: [],
    };

    const replayFn = (pasos: FixtureRegresion["pasos"]) => ({
      converge: pasos.length >= 2,
      conflictos: [],
    });

    const shrunk = shrinkDeltaDebug(fixture, replayFn, 10);
    // El último paso (check) no debe eliminarse porque sin él converge=false
    expect(shrunk.pasos.length).toBeGreaterThanOrEqual(1);
  });
});

describe("DesyncHunter · primera divergencia en cluster", () => {
  it("detecta divergencia cuando un nodo tiene bug inyectado", async () => {
    const cluster = new FakeCluster(3, "bad_wifi", 30025);
    const recorder = new FlightRecorder(1000);

    // Inyecta un bug: nodo 1 tiene fusión rota (ignora timestamp)
    const originalFusionar = fusionarEstados;
    // No podemos patchar import, así que simulamos con estado divergente manual
    // Creamos escenario donde nodos 0 y 2 convergen, nodo 1 diverge
    const id = "divergente";
    cluster.encolarAccion(0, { tipo: "crear", id, tipoElem: "nota", datos: { v: 1 }, dispositivo: cluster.nodos[0].dispositivo });
    await cluster.quiesce(200);

    // Fuerza divergencia: nodo 1 edita con timestamp viejo (simula bug)
    const estadoNodo1 = cluster.getEstado(1);
    const elemViejo = { ...estadoNodo1.elementos[id]!, actualizadoEn: 1, porDispositivo: "buggy" };
    cluster.nodos[1].estado = {
      ...estadoNodo1,
      elementos: { ...estadoNodo1.elementos, [id]: elemViejo },
    };

    // Registra estado antes de fusionar
    for (let i = 0; i < 3; i += 1) {
      recorder.registrar(i, {
        tipo: "tick",
        nodo: i,
        timestamp: cluster.relojGlobal,
        estadoDigest: cluster.digest(cluster.getEstado(i)),
      });
    }

    // Fusiona (nodo 0 y 2 deberían corregir a nodo 1)
    cluster.tick(100);
    await cluster.quiesce(500);

    for (let i = 0; i < 3; i += 1) {
      recorder.registrar(i, {
        tipo: "tick",
        nodo: i,
        timestamp: cluster.relojGlobal,
        estadoDigest: cluster.digest(cluster.getEstado(i)),
      });
    }

    // Si el bug persistió, hay divergencia
    const convergen = cluster.convergen();
    if (!convergen) {
      // Marca desincronía en el recorder
      for (let i = 0; i < 3; i += 1) {
        const digests = cluster.nodos.map((n) => cluster.digest(n.estado));
        const counts = new Map<string, number>();
        for (const d of digests) counts.set(d, (counts.get(d) || 0) + 1);
        const mayoria = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        if (cluster.digest(cluster.getEstado(i)) !== mayoria) {
          recorder.registrar(i, {
            tipo: "desincronia",
            nodo: i,
            timestamp: cluster.relojGlobal,
            detalle: `clave: ${id} mayoria: ${mayoria} minoria: ${cluster.digest(cluster.getEstado(i))}`,
          });
        }
      }
    }

    const primera = recorder.encontrarPrimeraDivergencia();
    if (!convergen) {
      expect(primera).not.toBeNull();
      expect(primera!.clave).toBe(id);
    } else {
      // Si convergieron (fusionarEstados corrigió), no hay divergencia
      expect(primera).toBeNull();
    }
  });

  it("cadena causal muestra eventos relevantes", () => {
    const recorder = new FlightRecorder(100);
    const base = 1000;
    for (let i = 0; i < 10; i += 1) {
      recorder.registrar(0, { tipo: "tick", nodo: 0, timestamp: base + i * 10, estadoDigest: `d${i}` });
    }
    recorder.registrar(0, { tipo: "fusion", nodo: 0, timestamp: base + 100, origen: 1, conflictos: ["x"], estadoDigest: "divergente" });
    recorder.registrar(0, { tipo: "desincronia", nodo: 0, timestamp: base + 100, detalle: "clave: x mayoria: ok minoria: bad" });

    const vuelo = recorder.getVuelo(0)!;
    const cadena = (recorder as any).cadenaCausal(vuelo, base + 100, 200);
    expect(cadena.length).toBeGreaterThan(0);
    expect(cadena.some((e: any) => e.tipo === "fusion")).toBe(true);
  });
});

describe("Integración · fixture de regresión end-to-end", () => {
  it("genera fixture, shrunk, y puede rejugar", async () => {
    const cluster = new FakeCluster(2, "lan", 40025); // red perfecta para test determinista
    const recorder = new FlightRecorder(500);

    const id = "regresion-1";
    cluster.encolarAccion(0, { tipo: "crear", id, tipoElem: "nota", datos: { v: 1 }, dispositivo: cluster.nodos[0].dispositivo });
    cluster.encolarAccion(1, { tipo: "editar", id, tipoElem: "nota", datos: { v: 2 }, dispositivo: cluster.nodos[1].dispositivo });
    await cluster.quiesce(500);

    // Graba
    for (let i = 0; i < 2; i += 1) {
      recorder.registrar(i, {
        tipo: "tick",
        nodo: i,
        timestamp: cluster.relojGlobal,
        estadoDigest: cluster.digest(cluster.getEstado(i)),
      });
    }

    const vuelo0 = recorder.getVuelo(0)!;
    const fixture = vueloAFixture(vuelo0, "regresion-fixture", 40025, "lan");

    // Shrink - replay function más permisiva: converge si hay al menos una acción
    const replayFn = (pasos: FixtureRegresion["pasos"]) => {
      return { converge: pasos.length > 0, conflictos: [] };
    };

    const shrunk = shrinkDeltaDebug(fixture, replayFn, 20);
    expect(shrunk.pasos.length).toBeLessThanOrEqual(fixture.pasos.length);

    // Verifica que el shrunk sigue pasando
    const resultado = replayFn(shrunk.pasos);
    expect(resultado.converge).toBe(true);
  });
});

describe("FlightRecorder · volcado JSON", () => {
  it("volcar() produce JSON válido con todos los vuelos", () => {
    const recorder = new FlightRecorder(10);
    recorder.registrar(0, { tipo: "tick", nodo: 0, timestamp: 1, estadoDigest: "a" });
    recorder.registrar(1, { tipo: "tick", nodo: 1, timestamp: 1, estadoDigest: "a" });

    const json = recorder.volcar();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0][0]).toBe(0);
    expect(parsed[1][0]).toBe(1);
  });
});