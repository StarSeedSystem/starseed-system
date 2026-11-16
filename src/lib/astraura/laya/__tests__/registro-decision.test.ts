import { describe, it, expect } from "vitest";
import { casoDeDecision, registrar, type EntradaDecision } from "@/lib/astraura/laya/registro-decision";
import { huellaEstado } from "@/lib/astraura/laya/aprendizaje-laya";
import type { RegistroAprendizaje, CasoLaya } from "@/lib/astraura/laya/aprendizaje-laya";

const entradaBase = (extra: Partial<EntradaDecision> = {}): EntradaDecision => ({
  punto: "reflejo.herramienta",
  ambito: "a1",
  answer_confidence: 0.83,
  donde: "a1",
  ms: 2500,
  escalo: false,
  estado: "consulta: ¿qué herramienta? -> chat",
  ts: 1760000000000,
  ...extra,
});

const casoEsperado = (extra: Partial<CasoLaya> = {}): CasoLaya => ({
  punto: "reflejo.herramienta",
  ambito: "a1",
  p: 0.83,
  donde: "a1",
  ms: 2500,
  resultado: "aceptada",
  estado: "consulta: ¿qué herramienta? -> chat",
  privado: true, // reflejo.herramienta tiene privacidad "solo-propias" por defecto
  ts: 1760000000000,
  ...extra,
});

describe("casoDeDecision", () => {
  it("convierte una entrada válida en CasoLaya con resultado 'aceptada' y privado true (privacidad por defecto)", () => {
    const entrada = entradaBase();
    const caso = casoDeDecision(entrada);
    expect(caso).toEqual(casoEsperado());
  });

  it("marca resultado 'escalada' cuando escalo es true", () => {
    const entrada = entradaBase({ escalo: true });
    const caso = casoDeDecision(entrada);
    expect(caso).toEqual(casoEsperado({ resultado: "escalada" }));
  });

  it("punto con privacidad 'solo-propias' marca privado true y devuelve estado completo (anotar lo hashea)", () => {
    const entrada = entradaBase({ punto: "privacidad.subir", estado: "texto con teléfono 600·000·000" });
    const caso = casoDeDecision(entrada);
    expect(caso?.privado).toBe(true);
    expect(caso?.estado).toBe("texto con teléfono 600·000·000");
  });

  it("punto 'publicar.moderar' tiene privacidad 'puede-salir' -> privado false", () => {
    const entrada = entradaBase({ punto: "publicar.moderar" });
    const caso = casoDeDecision(entrada);
    expect(caso?.privado).toBe(false);
    expect(caso?.estado).toBe(entrada.estado);
  });

  it("punto 'enjambre.medio' tiene privacidad 'puede-salir' -> privado false", () => {
    const entrada = entradaBase({ punto: "enjambre.medio" });
    const caso = casoDeDecision(entrada);
    expect(caso?.privado).toBe(false);
  });

  it("punto desconocido devuelve null", () => {
    const entrada = entradaBase({ punto: "punto.inexistente" as EntradaDecision["punto"] });
    expect(casoDeDecision(entrada)).toBeNull();
  });

  it("answer_confidence null se convierte en 0", () => {
    const entrada = entradaBase({ answer_confidence: null });
    const caso = casoDeDecision(entrada);
    expect(caso?.p).toBe(0);
  });

  it("inyecta ts cuando se proporciona", () => {
    const entrada = entradaBase({ ts: 1234567890 });
    const caso = casoDeDecision(entrada);
    expect(caso?.ts).toBe(1234567890);
  });

  it("no muta la entrada original", () => {
    const entrada = entradaBase({ estado: "original" });
    casoDeDecision(entrada);
    expect(entrada.estado).toBe("original");
  });
});

describe("registrar", () => {
  it("añade el caso al registro usando anotar (hashea estado si privado)", () => {
    const registro: RegistroAprendizaje = [];
    const entrada = entradaBase({ punto: "plan.dificultad", ts: 1760000000000 });
    const nuevo = registrar(registro, entrada);
    expect(nuevo).toHaveLength(1);
    // plan.dificultad tiene privacidad "solo-propias" -> anotar hashea el estado
    expect(nuevo[0].privado).toBe(true);
    expect(nuevo[0].estado).toBe(huellaEstado("consulta: ¿qué herramienta? -> chat"));
    expect(nuevo[0].punto).toBe("plan.dificultad");
    expect(nuevo[0].ts).toBe(1760000000000);
    expect(registro).toHaveLength(0);
  });

  it("punto privado guarda huella en el registro", () => {
    const registro: RegistroAprendizaje = [];
    const entrada = entradaBase({
      punto: "privacidad.subir",
      estado: "dato sensible",
    });
    const nuevo = registrar(registro, entrada);
    expect(nuevo).toHaveLength(1);
    expect(nuevo[0].privado).toBe(true);
    expect(nuevo[0].estado).toMatch(/^h[0-9a-f]{8}$/);
    expect(nuevo[0].estado).toBe(huellaEstado("dato sensible"));
  });

  it("punto 'publicar.moderar' no es privado y guarda estado completo", () => {
    const registro: RegistroAprendizaje = [];
    const entrada = entradaBase({ punto: "publicar.moderar", estado: "publicación visible" });
    const nuevo = registrar(registro, entrada);
    expect(nuevo[0].privado).toBe(false);
    expect(nuevo[0].estado).toBe("publicación visible");
  });

  it("punto desconocido no modifica el registro", () => {
    const registro: RegistroAprendizaje = [casoEsperado({ punto: "reflejo.herramienta" })];
    const entrada = entradaBase({ punto: "punto.inexistente" as EntradaDecision["punto"] });
    const nuevo = registrar(registro, entrada);
    expect(nuevo).toEqual(registro);
    expect(nuevo).toHaveLength(1);
  });

  it("escalada se registra correctamente", () => {
    const registro: RegistroAprendizaje = [];
    const entrada = entradaBase({ escalo: true, punto: "respuesta.basta" });
    const nuevo = registrar(registro, entrada);
    expect(nuevo[0].resultado).toBe("escalada");
  });
});