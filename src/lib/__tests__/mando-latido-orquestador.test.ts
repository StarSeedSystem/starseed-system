import { describe, it, expect } from "vitest";
import {
    interpretarSalud,
    ordenarPorUrgencia,
    resumen,
    type SaludCola,
} from "../mando/latido-orquestador";

const MINUTO = 60_000;
// Un instante fijo para que los cálculos de «paradaHaceMin» sean deterministas.
const AHORA = Date.UTC(2026, 8, 8, 12, 0, 0); // 2026-09-08 12:00 UTC

describe("interpretarSalud (Ola 298 · colas huérfanas)", () => {
  it("tres tareas todas en «commit» → terminada", () => {
    const s = interpretarSalud(
      "298",
      [{ id: "A" }, { id: "B" }, { id: "C" }],
      { A: { estado: "commit" }, B: { estado: "commit" }, C: { estado: "commit" } },
      AHORA - 90 * MINUTO,
      AHORA,
    );
    expect(s.estado).toBe("terminada");
    expect(s.pendientes).toBe(0);
    expect(s.integradas).toBe(3);
  });

  it("pendientes y latido de hace 1 min → viva", () => {
    const s = interpretarSalud(
      "298",
      [{ id: "A" }, { id: "B" }],
      { A: { estado: "commit" } },
      AHORA - 1 * MINUTO,
      AHORA,
    );
    expect(s.estado).toBe("viva");
    expect(s.pendientes).toBe(1);
  });

  it("pendientes y latido de hace 40 min → huérfana, el motivo cita 40 y las pendientes", () => {
    const s = interpretarSalud(
      "298",
      [{ id: "A" }, { id: "B" }, { id: "C" }],
      { A: { estado: "commit" } },
      AHORA - 40 * MINUTO,
      AHORA,
    );
    expect(s.estado).toBe("huerfana");
    expect(s.pendientes).toBe(2);
    expect(s.paradaHaceMin).toBe(40);
    expect(s.motivo).toContain("40");
    expect(s.motivo).toContain("2 tareas pendientes");
  });

  it("pendientes y latidoMtimeMs null → sin_latido", () => {
    const s = interpretarSalud(
      "298",
      [{ id: "A" }],
      {},
      null,
      AHORA,
    );
    expect(s.estado).toBe("sin_latido");
    expect(s.pendientes).toBe(1);
    expect(s.ultimoLatidoMs).toBeNull();
  });
});

describe("ordenarPorUrgencia (Ola 298)", () => {
  it("pone delante la huérfana con más pendientes", () => {
    const lista: SaludCola[] = [
      interpretarSalud("viva1", [{ id: "A" }], {}, AHORA - 1 * MINUTO, AHORA),
      interpretarSalud("huer1", [{ id: "A" }], {}, AHORA - 40 * MINUTO, AHORA),
      interpretarSalud("huer2", [{ id: "A" }, { id: "B" }, { id: "C" }], {}, AHORA - 20 * MINUTO, AHORA),
      interpretarSalud("term1", [{ id: "A" }], { A: { estado: "commit" } }, AHORA - 40 * MINUTO, AHORA),
    ];
    const ordenadas = ordenarPorUrgencia(lista);
    // Huérfanas primero; entre ellas la de más pendientes (huer2 con 3) gana.
    expect(ordenadas[0].cola).toBe("huer2");
    expect(ordenadas[1].cola).toBe("huer1");
    // La terminada queda al final.
    expect(ordenadas[ordenadas.length - 1].cola).toBe("term1");
  });
});

describe("resumen (Ola 298)", () => {
  it("cuenta bien y su frase menciona las huérfanas cuando las hay", () => {
    const lista: SaludCola[] = [
      interpretarSalud("viva1", [{ id: "A" }], {}, AHORA - 1 * MINUTO, AHORA),
      interpretarSalud("huer1", [{ id: "A" }, { id: "B" }], {}, AHORA - 40 * MINUTO, AHORA),
      interpretarSalud("huer2", [{ id: "A" }], {}, AHORA - 30 * MINUTO, AHORA),
    ];
    const r = resumen(lista);
    expect(r.vivas).toBe(1);
    expect(r.huerfanas).toBe(2);
    expect(r.pendientesHuerfanas).toBe(3);
    expect(r.frase).toContain("huérfanas");
    expect(r.frase).toContain("2");
  });

  it("sin huérfanas la frase habla de las colas vivas", () => {
    const lista: SaludCola[] = [
      interpretarSalud("viva1", [{ id: "A" }], {}, AHORA - 1 * MINUTO, AHORA),
    ];
    const r = resumen(lista);
    expect(r.huerfanas).toBe(0);
    expect(r.frase).toContain("viva");
  });
});