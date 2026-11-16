import { describe, it, expect } from "vitest";
import { casoDeDecision, registrar, type EntradaDecision } from "@/lib/astraura/laya/registro-decision";
import { type RegistroAprendizaje } from "@/lib/astraura/laya/aprendizaje-laya";

// Del resultado de `/api/astraura/decidir` a un caso del registro de Laya (JLA1116A §8, fase 1).
// Solo funciones puras: la entrada se inyecta entera (punto, ámbito, confianza calibrada, medio,
// ms, si escaló, estado y `ts`); aquí no hay red, ni disco, ni reloj.

const entrada = (extra: Partial<EntradaDecision> = {}): EntradaDecision => ({
  punto: "reflejo.herramienta",
  ambito: "personal",
  answer_confidence: 0.83,
  donde: "a1",
  ms: 2100,
  escalo: false,
  estado: "consulta: abrir el panel de ajustes",
  ts: 1760000000000,
  ...extra,
});

describe("casoDeDecision", () => {
  it("convierte la decisión en un caso con su punto, ámbito, confianza, medio, ms y `ts` inyectado", () => {
    const caso = casoDeDecision(entrada());
    expect(caso).not.toBeNull();
    expect(caso).toMatchObject({
      punto: "reflejo.herramienta",
      ambito: "personal",
      p: 0.83,
      donde: "a1",
      ms: 2100,
      resultado: "aceptada",
      estado: "consulta: abrir el panel de ajustes",
      ts: 1760000000000,
    });
  });

  it("marca «escalada» cuando la decisión escaló y «aceptada» cuando no", () => {
    expect(casoDeDecision(entrada({ escalo: true }))?.resultado).toBe("escalada");
    expect(casoDeDecision(entrada({ escalo: false }))?.resultado).toBe("aceptada");
  });

  it("un punto desconocido del catálogo no produce caso", () => {
    expect(casoDeDecision(entrada({ punto: "punto.inventado" }))).toBeNull();
  });

  it("sin confianza calibrada válida tampoco hay caso (no se inventa `p`)", () => {
    expect(casoDeDecision(entrada({ answer_confidence: Number.NaN }))).toBeNull();
    expect(casoDeDecision(entrada({ answer_confidence: 1.4 }))).toBeNull();
  });
});

describe("registrar", () => {
  it("anota el caso en el registro y no muta el registro anterior", () => {
    const antes: RegistroAprendizaje = [];
    const despues = registrar(antes, entrada());
    expect(despues).toHaveLength(1);
    expect(despues[0].punto).toBe("reflejo.herramienta");
    expect(antes).toHaveLength(0);
  });

  it("en un punto privado guarda SOLO la huella del estado (el texto no sale)", () => {
    const reg = registrar([], entrada({
      punto: "privacidad.subir",
      estado: "estado con teléfono 600·000·000 y saldos",
    }));
    expect(reg).toHaveLength(1);
    expect(reg[0].privado).toBe(true);
    expect(reg[0].estado).toMatch(/^h[0-9a-f]{8}$/);
    expect(reg[0].estado).not.toContain("teléfono");
    expect(reg[0].estado).not.toContain("saldos");
  });

  it("en un punto que puede salir guarda el estado en claro y no lo marca privado", () => {
    const reg = registrar([], entrada({ punto: "publicar.moderar", estado: "publicación de prueba" }));
    expect(reg[0].privado).toBe(false);
    expect(reg[0].estado).toBe("publicación de prueba");
  });

  it("con punto desconocido deja el registro tal cual (no anota nada)", () => {
    const antes: RegistroAprendizaje = [];
    expect(registrar(antes, entrada({ punto: "punto.inventado" }))).toBe(antes);
    expect(antes).toHaveLength(0);
  });
});
