import { describe, expect, it } from "vitest";
import type { Experiencia } from "@/lib/astraura/experiencias";
import type { AjustesAprendizaje } from "@/lib/astraura/experiencias-aprendizaje";
import {
  paraLlamaFactory,
  permitido,
  type DestinoModelo,
} from "@/lib/astraura/aprendizaje/dataset-llamafactory";
const ajustes = (privacidad: "privada" | "ambito" | "publica" = "publica"): AjustesAprendizaje => ({
  aprendizajeColectivo: true,
  porAmbito: { salud: { permite: true, privacidad } },
});
function exp(cambios: Partial<Experiencia> = {}): Experiencia {
  return {
    id: "e1",
    t: "2026-10-25 00:00:00",
    medio: "os-web",
    capa: "persona",
    tipo: "valoracion",
    dominio: "salud",
    entrada: "¿Cuánta agua bebo?",
    salida: "Dos litros al día.",
    confianza: null,
    ms: null,
    resultado: null,
    ambito: "salud",
    valoracion: "positiva",
    ...cambios,
  };
}
const op = (destino: DestinoModelo = "privado") => ({ ambito: "salud", destino, nombre: "salud" });

describe("permitido", () => {
  it("privado siempre puede; público exige privacidad pública", () => {
    expect(permitido("privado", "salud", ajustes("privada")).ok).toBe(true);
    expect(permitido("ambito", "salud", ajustes("ambito")).ok).toBe(true);
    expect(permitido("publico", "salud", ajustes("ambito"))).toEqual({
      ok: false,
      motivo: "privacidad-no-publica",
    });
    expect(permitido("ambito", "salud", ajustes("privada")).ok).toBe(false);
  });
});

describe("paraLlamaFactory", () => {
  it("una valoración positiva produce SFT y KTO con label true", () => {
    const r = paraLlamaFactory([exp()], ajustes(), op());
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages[1]).toEqual({ role: "assistant", content: "Dos litros al día." });
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(true);
  });
  it("una negativa solo produce KTO con label false", () => {
    const r = paraLlamaFactory([exp({ valoracion: "negativa" })], ajustes(), op());
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(false);
  });
  it("una corrección produce SFT corregido, KTO false original y KTO true corregido", () => {
    const r = paraLlamaFactory(
      [exp({ tipo: "correccion", valoracion: "negativa", correccion: "Tres litros al día." })],
      ajustes(),
      op(),
    );
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages[1].content).toBe("Tres litros al día.");
    expect(r.kto).toHaveLength(2);
    expect(r.kto.filter((f) => f.label === true)[0].messages[1].content).toBe("Tres litros al día.");
    expect(r.kto.filter((f) => f.label === false)[0].messages[1].content).toBe("Dos litros al día.");
  });
  it("ámbito privado con destino público queda bloqueado y vacío", () => {
    const r = paraLlamaFactory([exp()], ajustes("privada"), op("publico"));
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.info).toEqual({});
    expect(r.descartadas).toEqual({ bloqueado: 1 });
  });

  it("descarta secretos sin dejar rastro en los datasets", () => {
    const r = paraLlamaFactory(
      [exp({ salida: "usa sk-abcdefghijklmnop1234 y listo" })],
      ajustes(),
      op(),
    );
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas.secreto).toBe(1);
  });
  it("descarta duplicados exactos", () => {
    const r = paraLlamaFactory(
      [exp({ id: "a" }), exp({ id: "b" })],
      ajustes(),
      op(),
    );
    expect(r.sft).toHaveLength(1);
    expect(r.descartadas.duplicado).toBe(1);
  });

  it("reparte 80/10/10 de forma estable y suma todas las filas SFT", () => {
    const exps = Array.from({ length: 12 }, (_, i) =>
      exp({ id: `id-${i}`, entrada: `pregunta ${i}` }),
    );
    const a = paraLlamaFactory(exps, ajustes(), op());
    const b = paraLlamaFactory(exps, ajustes(), op());
    expect(a.partes).toEqual(b.partes);
    expect(a.partes.train + a.partes.val + a.partes.test).toBe(a.sft.length);
    for (const fila of a.sft) expect(["train", "val", "test"]).toContain(fila.parte);
    expect(a.sft.map((f) => f.parte)).toEqual(b.sft.map((f) => f.parte));
  });

  it("describe las dos entradas de dataset_info.json", () => {
    const r = paraLlamaFactory([exp()], ajustes(), op());
    expect(Object.keys(r.info)).toEqual(["salud_sft", "salud_kto"]);
    expect(r.info["salud_kto"]).toMatchObject({
      formatting: "sharegpt",
      columns: { messages: "messages", kto_tag: "label" },
    });
  });
});
