import { describe, it, expect } from "vitest";
import { particion, evaluarCapa, type CapaEvaluada, type Estrato } from "../evaluar-capa";
import type { CasoLaya } from "../aprendizaje-laya";

const ESTRATOS: readonly Estrato[] = [
  "reflejo",
  "juicio",
  "memoria",
  "palabra",
  "razon",
  "profunda",
  "voz",
  "adaptador",
];

function capaBase(nombre: string, acuerdo: number, integrarRevertidos = 0): CapaEvaluada {
  const porEstrato: Record<Estrato, { total: number; acuerdo: number; integrarRevertidos: number }> = {} as Record<
    Estrato,
    { total: number; acuerdo: number; integrarRevertidos: number }
  >;
  for (const e of ESTRATOS) {
    porEstrato[e] = { total: 200, acuerdo, integrarRevertidos };
  }
  return { nombre, porEstrato: Object.freeze(porEstrato) };
}

function reservaMinima(casos: number): readonly CasoLaya[] {
  const arr: CasoLaya[] = [];
  for (let i = 0; i < casos; i++) {
    arr.push({
      punto: "reflejo.herramienta",
      ambito: "global",
      p: 0.8,
      donde: "mac",
      ms: 100,
      resultado: "aceptada",
      estado: `estado-${i}`,
      privado: false,
    });
  }
  return Object.freeze(arr);
}

describe("particion", () => {
  it("es determinista: misma entrada → misma reserva", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const r1 = particion(ids);
    const r2 = particion(ids);
    expect(r1).toEqual(r2);
  });

  it("aproximadamente 20 % caen en reserva (1000 ids → ~200)", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `id-${i}`);
    const r = particion(ids);
    // FNV-1a distribuye uniformemente; 20 % ± 5 % es razonable
    expect(r.length).toBeGreaterThan(150);
    expect(r.length).toBeLessThan(250);
  });

  it("orden de entrada no afecta qué ids entran", () => {
    const ids1 = ["x", "y", "z", "w"];
    const ids2 = ["z", "w", "x", "y"];
    const r1 = particion(ids1);
    const r2 = particion(ids2);
    expect([...r1].sort()).toEqual([...r2].sort());
  });

  it("ids distintos → huellas distintas; no todos entran ni todos salen", () => {
    // Usar más ids para garantizar distribución; el test original fallaba por casualidad estadística
    const ids = [
      "aaa", "bbb", "ccc", "ddd", "eee",
      "fff", "ggg", "hhh", "iii", "jjj",
      "kkk", "lll", "mmm", "nnn", "ooo",
      "ppp", "qqq", "rrr", "sss", "ttt",
    ];
    const r = particion(ids);
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThan(ids.length);
  });
});

describe("evaluarCapa", () => {
  it("pocos datos (< 1000 reserva) → no reemplaza, motivo 'faltan datos'", () => {
    const vigente = capaBase("vigente", 0.7);
    const nueva = capaBase("nueva", 0.8);
    const reserva = reservaMinima(500);
    const res = evaluarCapa({ vigente, nueva, reserva });
    expect(res.reemplaza).toBe(false);
    expect(res.motivos).toContain("faltan datos");
  });

  it("empate (misma acuerdo en todos los estratos) → no reemplaza, motivo 'empate'", () => {
    const vigente = capaBase("vigente", 0.75);
    const nueva = capaBase("nueva", 0.75);
    const reserva = reservaMinima(1200);
    const res = evaluarCapa({ vigente, nueva, reserva });
    expect(res.reemplaza).toBe(false);
    expect(res.motivos).toContain("empate: no mejora en ningún estrato");
  });

  it("peor en un estrato → no reemplaza, motivo indica el estrato", () => {
    const vigente = capaBase("vigente", 0.8);
    const nueva = capaBase("nueva", 0.8);
    // Hacer peor solo en "razon"
    const porEstrato = { ...nueva.porEstrato };
    (porEstrato as Record<Estrato, { total: number; acuerdo: number; integrarRevertidos: number }>)["razon"] = {
      total: 200,
      acuerdo: 0.6, // peor que 0.8
      integrarRevertidos: 0,
    };
    const nuevaPeor = { ...nueva, porEstrato: Object.freeze(porEstrato) };
    const reserva = reservaMinima(1200);
    const res = evaluarCapa({ vigente, nueva: nuevaPeor, reserva });
    expect(res.reemplaza).toBe(false);
    expect(res.motivos.some((m) => m.includes("peor en estrato razon"))).toBe(true);
  });

  it("mejora en algún estrato y no peor en ninguno → reemplaza", () => {
    const vigente = capaBase("vigente", 0.7);
    const nueva = capaBase("nueva", 0.7);
    // Mejorar en "memoria"
    const porEstrato = { ...nueva.porEstrato };
    (porEstrato as Record<Estrato, { total: number; acuerdo: number; integrarRevertidos: number }>)["memoria"] = {
      total: 200,
      acuerdo: 0.85, // mejor que 0.7
      integrarRevertidos: 0,
    };
    const nuevaMejor = { ...nueva, porEstrato: Object.freeze(porEstrato) };
    const reserva = reservaMinima(1200);
    const res = evaluarCapa({ vigente, nueva: nuevaMejor, reserva });
    expect(res.reemplaza).toBe(true);
    expect(res.motivos).toHaveLength(0);
  });

  it("más 'integrar' revertidos que la vigente → no reemplaza", () => {
    const vigente = capaBase("vigente", 0.8, 2); // 2 por estrato = 16 total
    const nueva = capaBase("nueva", 0.85, 3); // 3 por estrato = 24 total > 16
    const reserva = reservaMinima(1200);
    const res = evaluarCapa({ vigente, nueva, reserva });
    expect(res.reemplaza).toBe(false);
    expect(res.motivos.some((m) => m.includes("más integrar revertidos"))).toBe(true);
  });

  it("igual 'integrar' revertidos que la vigente → sí reemplaza (si mejora)", () => {
    const vigente = capaBase("vigente", 0.7, 2);
    const nueva = capaBase("nueva", 0.8, 2); // mismo integrar revertidos, mejor acuerdo
    const reserva = reservaMinima(1200);
    const res = evaluarCapa({ vigente, nueva, reserva });
    expect(res.reemplaza).toBe(true);
    expect(res.motivos).toHaveLength(0);
  });

  it("faltan datos en un estrato (total 0) → no reemplaza", () => {
    const vigente = capaBase("vigente", 0.8);
    const nueva = capaBase("nueva", 0.85);
    // Quitar casos en "voz"
    const porEstrato = { ...nueva.porEstrato };
    (porEstrato as Record<Estrato, { total: number; acuerdo: number; integrarRevertidos: number }>)["voz"] = {
      total: 0,
      acuerdo: 0,
      integrarRevertidos: 0,
    };
    const nuevaSinVoz = { ...nueva, porEstrato: Object.freeze(porEstrato) };
    const reserva = reservaMinima(1200);
    const res = evaluarCapa({ vigente, nueva: nuevaSinVoz, reserva });
    expect(res.reemplaza).toBe(false);
    expect(res.motivos.some((m) => m.includes("faltan datos en estrato voz"))).toBe(true);
  });
});