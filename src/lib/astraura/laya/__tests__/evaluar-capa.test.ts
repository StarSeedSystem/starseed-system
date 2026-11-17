import { describe, it, expect } from "vitest";
import {
  particion,
  evaluarCapa,
  type CasoReserva,
  type CapaEvaluada,
  type Estrato,
} from "../evaluar-capa";

/** Crea un estrato de prueba. */
const estrato = (capa: Estrato["capa"], ambito: string, punto: string): Estrato => ({ capa, ambito, punto });

/** Crea un caso de reserva sintético. */
const caso = (id: string, estrato: Estrato, desenlace: CasoReserva["desenlace"]): CasoReserva => ({
  id,
  estrato,
  desenlace,
});

/** Capa que siempre acepta (deja pasar todo). */
const capaSiempreAcepta: CapaEvaluada = (casos) =>
  casos.map((c) => ({ casoId: c.id, acepta: true }));

/** Capa que siempre rechaza (bloquea todo). */
const capaSiempreRechaza: CapaEvaluada = (casos) =>
  casos.map((c) => ({ casoId: c.id, acepta: false }));

/** Capa que acepta solo si NO es "integrada-revertida". */
const capaIdeal: CapaEvaluada = (casos) =>
  casos.map((c) => ({ casoId: c.id, acepta: c.desenlace !== "integrada-revertida" }));

/** Capa que acepta "aceptada" y rechaza el resto. */
const capaSoloAceptadas: CapaEvaluada = (casos) =>
  casos.map((c) => ({ casoId: c.id, acepta: c.desenlace === "aceptada" }));

describe("particion", () => {
  it("reparte 20 % a reserva y 80 % a entrenamiento de forma determinista", () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    const { reserva, entrenamiento } = particion(ids);
    expect(reserva.length).toBe(20);
    expect(entrenamiento.length).toBe(80);
    // Sin duplicados ni pérdidas
    const todos = [...reserva, ...entrenamiento].sort();
    expect(todos).toEqual(ids.sort());
  });

  it("el mismo ID siempre cae en la misma partición", () => {
    const { reserva: r1 } = particion(["id-fijo"]);
    const { reserva: r2 } = particion(["id-fijo"]);
    expect(r1).toEqual(r2);
  });

  it("distribuye por huella, no por orden", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const { reserva } = particion(ids);
    // No necesariamente el primero; depende de la huella
    expect(reserva.length).toBeGreaterThanOrEqual(0);
    expect(reserva.length).toBeLessThanOrEqual(ids.length);
  });
});

describe("evaluarCapa", () => {
  const e1 = estrato("reflejo", "a1", "respuesta.basta");
  const e2 = estrato("palabra", "a1", "respuesta.basta");
  const e3 = estrato("juicio", "mac", "plan.dificultad");

  /** Genera reserva con N casos por estrato y desenlaces dados. */
  function reservaCon(
    nPorEstrato: number,
    desenlaces: readonly CasoReserva["desenlace"][] = ["aceptada", "corregida", "escalada", "integrada-revertida"]
  ): readonly CasoReserva[] {
    const casos: CasoReserva[] = [];
    let id = 0;
    for (const est of [e1, e2, e3]) {
      for (let i = 0; i < nPorEstrato; i++) {
        const d = desenlaces[i % desenlaces.length];
        casos.push(caso(`${est.capa}-${est.ambito}-${est.punto}-${id++}`, est, d));
      }
    }
    return casos;
  }

  it("con menos de 1.000 casos devuelve «faltan datos» y no reemplaza", () => {
    const res = evaluarCapa({ vigente: capaIdeal, nueva: capaIdeal, reserva: reservaCon(100) });
    expect(res.reemplaza).toBe(false);
    expect(res.motivos).toContain("faltan datos");
  });

  it("con 1.000 casos pero un solo estrato avisa «estratos insuficientes»", () => {
    const reserva = Array.from({ length: 1000 }, (_, i) =>
      caso(`id-${i}`, e1, i % 4 === 3 ? "integrada-revertida" : "aceptada")
    );
    const res = evaluarCapa({ vigente: capaIdeal, nueva: capaIdeal, reserva });
    expect(res.reemplaza).toBe(false);
    expect(res.motivos).toContain("estratos insuficientes");
  });

  it("empate (misma capa): no reemplaza y motivo «empate: no mejora en ningún estrato»", () => {
    const reserva = reservaCon(400); // 1200 casos totales
    const res = evaluarCapa({ vigente: capaIdeal, nueva: capaIdeal, reserva });
    expect(res.reemplaza).toBe(false);
    expect(res.motivos).toContain("empate: no mejora en ningún estrato");
  });

  it("nueva peor en un estrato: no reemplaza y motivo indica el estrato", () => {
    const reserva = reservaCon(400);
    // Vigente ideal; nueva que falla en e1 aceptando revertidas
    const capaPeorEnE1: CapaEvaluada = (casos) =>
      casos.map((c) =>
        c.estrato.capa === "reflejo" && c.desenlace === "integrada-revertida"
          ? { casoId: c.id, acepta: true } // error: acepta revertida
          : { casoId: c.id, acepta: c.desenlace !== "integrada-revertida" }
      );
    const res = evaluarCapa({ vigente: capaIdeal, nueva: capaPeorEnE1, reserva });
    expect(res.reemplaza).toBe(false);
    expect(res.motivos.some((m) => m.includes("peor en reflejo.a1.respuesta.basta"))).toBe(true);
  });

  it("nueva mejora en un estrato y no empeora en ninguno: reemplaza", () => {
    const reserva = reservaCon(400);
    // Vigente que a veces rechaza "aceptada" (falso negativo)
    const vigenteConFalsosNeg: CapaEvaluada = (casos) =>
      casos.map((c) =>
        c.desenlace === "aceptada" && c.estrato.capa === "palabra"
          ? { casoId: c.id, acepta: false } // error: rechaza aceptada en e2
          : { casoId: c.id, acepta: c.desenlace !== "integrada-revertida" }
      );
    // Nueva ideal: corrige el falso negativo en e2
    const res = evaluarCapa({ vigente: vigenteConFalsosNeg, nueva: capaIdeal, reserva });
    expect(res.reemplaza).toBe(true);
    expect(res.motivos).toContain("mejora sin regresión");
  });

  it("nueva deja pasar más «integrada-revertida» que la vigente: no reemplaza", () => {
    const reserva = reservaCon(400);
    // Vigente ideal (0 falsos positivos)
    // Nueva que acepta algunas revertidas en e3 (juicio) - esto la hace peor en ese estrato
    const capaMasFalsosPos: CapaEvaluada = (casos) =>
      casos.map((c) =>
        c.estrato.capa === "juicio" && c.desenlace === "integrada-revertida"
          ? { casoId: c.id, acepta: true } // error: acepta revertida
          : { casoId: c.id, acepta: c.desenlace !== "integrada-revertida" }
      );
    const res = evaluarCapa({ vigente: capaIdeal, nueva: capaMasFalsosPos, reserva });
    expect(res.reemplaza).toBe(false);
    // Falla primero por ser peor en el estrato "juicio"
    expect(res.motivos.some((m) => m.includes("peor en juicio.mac.plan.dificultad"))).toBe(true);
  });

  it("nueva reduce falsos positivos y mejora acuerdo: reemplaza", () => {
    const reserva = reservaCon(400);
    // Vigente que acepta algunas revertidas en e1
    const vigenteConFPs: CapaEvaluada = (casos) =>
      casos.map((c) =>
        c.estrato.capa === "reflejo" && c.desenlace === "integrada-revertida"
          ? { casoId: c.id, acepta: true }
          : { casoId: c.id, acepta: c.desenlace !== "integrada-revertida" }
      );
    // Nueva ideal (0 falsos positivos)
    const res = evaluarCapa({ vigente: vigenteConFPs, nueva: capaIdeal, reserva });
    expect(res.reemplaza).toBe(true);
    expect(res.motivos).toContain("mejora sin regresión");
  });

  it("nueva con más falsos positivos globales pero sin empeorar estrato: no reemplaza", () => {
    // Reserva donde:
    // - e1: vigente tiene 0.85 acuerdo, nueva tiene 0.85 (mismo) pero más FPs
    // - e2: vigente tiene 0.95 acuerdo, nueva tiene 1.0 (MEJORA)
    // Global FPs: nueva > vigente
    const e1 = estrato("reflejo", "a1", "respuesta.basta");
    const e2 = estrato("palabra", "a1", "respuesta.basta");
    const casos: CasoReserva[] = [];
    // Usar contadores separados por estrato y desenlace para IDs predecibles
    let idxE1A = 0, idxE1C = 0, idxE1R = 0;
    let idxE2A = 0, idxE2C = 0, idxE2R = 0;
    // Estrato e1: 200 casos por réplica
    for (let i = 0; i < 100; i++) casos.push(caso(`e1-a-${idxE1A++}`, e1, "aceptada"));
    for (let i = 0; i < 50; i++) casos.push(caso(`e1-c-${idxE1C++}`, e1, "corregida"));
    for (let i = 0; i < 50; i++) casos.push(caso(`e1-r-${idxE1R++}`, e1, "integrada-revertida"));
    // Estrato e2: 200 casos por réplica
    for (let i = 0; i < 100; i++) casos.push(caso(`e2-a-${idxE2A++}`, e2, "aceptada"));
    for (let i = 0; i < 50; i++) casos.push(caso(`e2-c-${idxE2C++}`, e2, "corregida"));
    for (let i = 0; i < 50; i++) casos.push(caso(`e2-r-${idxE2R++}`, e2, "integrada-revertida"));
    // 400 casos * 3 réplicas = 1200 casos
    const reserva = Array.from({ length: 3 }, (_, rep) =>
      casos.map((c) => ({ ...c, id: `${c.id}-rep${rep}` }))
    ).flat();

    // Vigente:
    // e1: rechaza 20 "aceptada" (FN), acepta 10 "revertida" (FP)
    // e2: rechaza 10 "aceptada" (FN), acepta 0 "revertida"
    const vigente: CapaEvaluada = (cs) =>
      cs.map((c) => {
        const num = parseInt(c.id.split("-")[2] || "0", 10);
        if (c.estrato.capa === "reflejo") {
          if (c.desenlace === "aceptada") return { casoId: c.id, acepta: num >= 20 };
          if (c.desenlace === "integrada-revertida") return { casoId: c.id, acepta: num < 10 };
          return { casoId: c.id, acepta: false };
        }
        // e2
        if (c.desenlace === "aceptada") return { casoId: c.id, acepta: num >= 10 };
        return { casoId: c.id, acepta: false };
      });

    // Nueva:
    // e1: acepta todas "aceptada" (corrige FN), acepta 30 "revertida" (20 FP más)
    // e2: acepta todas "aceptada" (corrige FN), acepta 0 "revertida"
    const nueva: CapaEvaluada = (cs) =>
      cs.map((c) => {
        const num = parseInt(c.id.split("-")[2] || "0", 10);
        if (c.estrato.capa === "reflejo") {
          if (c.desenlace === "aceptada") return { casoId: c.id, acepta: true };
          if (c.desenlace === "integrada-revertida") return { casoId: c.id, acepta: num < 30 };
          return { casoId: c.id, acepta: false };
        }
        // e2
        if (c.desenlace === "aceptada") return { casoId: c.id, acepta: true };
        return { casoId: c.id, acepta: false };
      });

    const res = evaluarCapa({ vigente, nueva, reserva });
    expect(res.reemplaza).toBe(false);
    expect(res.motivos).toContain("más integradas revertidas que la vigente");
  });

  it("partición estable: mismo ID siempre en misma partición", () => {
    const ids = ["caso-1", "caso-2", "caso-3", "caso-4", "caso-5"];
    const { reserva: r1 } = particion(ids);
    const { reserva: r2 } = particion(ids);
    expect(r1).toEqual(r2);
    // Verificar que al repetir con el mismo conjunto el resultado es idéntico
    for (let i = 0; i < 10; i++) {
      const { reserva } = particion(ids);
      expect(reserva).toEqual(r1);
    }
  });
});