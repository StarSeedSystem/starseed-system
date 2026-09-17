import { describe, it, expect } from "vitest";
import { resultado, type Propuesta } from "../votacion-desarrolladores";

const DIA_MS = 24 * 60 * 60 * 1000;
const ahora = 1_000_000_000_000;

function base(extra?: Partial<Propuesta>): Propuesta {
  return {
    candidato: "nuevo@star.seed",
    propuestaPor: "maggasukha@star.seed",
    votos: {},
    abiertaDesdeMs: ahora - DIA_MS,
    ...extra,
  };
}

describe("resultado de votación de desarrolladores", () => {
  it("un solo desarrollador aprueba con su voto a favor", () => {
    const p = base({ votos: { "maggasukha@star.seed": true } });
    const r = resultado(p, ["maggasukha@star.seed"], ahora);
    expect(r.estado).toBe("aprobada");
    expect(r.motivo).toContain("un solo desarrollador");
  });

  it("mayoría simple aprueba", () => {
    const devs = ["a@s", "b@s", "c@s"];
    const p = base({ votos: { "a@s": true, "b@s": true } });
    const r = resultado(p, devs, ahora);
    expect(r.estado).toBe("aprobada");
  });

  it("empate sin mayoría deja la propuesta abierta", () => {
    const devs = ["a@s", "b@s", "c@s", "d@s"];
    const p = base({ votos: { "a@s": true, "b@s": true, "c@s": false } });
    const r = resultado(p, devs, ahora);
    expect(r.estado).toBe("abierta");
  });

  it("descarta el voto de quien ya no es desarrollador y lo dice", () => {
    const devs = ["a@s", "b@s", "c@s"];
    const p = base({ votos: { "a@s": true, "ex@s": true } });
    const r = resultado(p, devs, ahora);
    expect(r.estado).toBe("abierta");
    expect(r.motivo).toContain("descart");
  });

  it("rechaza el autovoto", () => {
    const p = base({
      candidato: "a@s",
      propuestaPor: "b@s",
      votos: { "a@s": true },
    });
    const r = resultado(p, ["a@s", "b@s"], ahora);
    expect(r.estado).toBe("rechazada");
    expect(r.motivo).toContain("votarse a sí mismo");
  });

  it("rechaza autopropuesta", () => {
    const p = base({ candidato: "a@s", propuestaPor: "a@s" });
    const r = resultado(p, ["a@s"], ahora);
    expect(r.estado).toBe("rechazada");
  });

  it("caduca a los 14 días sin mayoría", () => {
    const devs = ["a@s", "b@s", "c@s"];
    const p = base({
      votos: { "a@s": true },
      abiertaDesdeMs: ahora - 14 * DIA_MS,
    });
    const r = resultado(p, devs, ahora);
    expect(r.estado).toBe("caducada");
    expect(r.motivo).toContain("14");
  });

  it("no caduca antes de los 14 días", () => {
    const devs = ["a@s", "b@s", "c@s"];
    const p = base({
      votos: { "a@s": true },
      abiertaDesdeMs: ahora - 13 * DIA_MS,
    });
    expect(resultado(p, devs, ahora).estado).toBe("abierta");
  });

  it("rechaza cuando la mayoría es imposible", () => {
    const devs = ["a@s", "b@s", "c@s"];
    const p = base({ votos: { "a@s": false, "b@s": false } });
    const r = resultado(p, devs, ahora);
    expect(r.estado).toBe("rechazada");
  });
});
