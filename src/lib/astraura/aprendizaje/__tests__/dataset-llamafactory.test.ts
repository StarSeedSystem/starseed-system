// Pruebas del convertidor de experiencias Astraura → datasets LlamaFactory.
// Solo funciones puras: sin red, sin disco, sin vi.mock de módulos de Node.
import { describe, it, expect } from "vitest";
import type { Experiencia, TipoExperiencia } from "../../experiencias";
import type { AjustesAprendizaje, PrivacidadAmbito } from "../../experiencias-aprendizaje";
import { permitido, paraLlamaFactory } from "../dataset-llamafactory";

const AMBITO = "musica";

const ajustes = (privacidad: PrivacidadAmbito, permite = true, colectivo = true): AjustesAprendizaje => ({
  aprendizajeColectivo: colectivo,
  porAmbito: { [AMBITO]: { permite, privacidad } },
});

function crear(parcial: Partial<Experiencia> & { tipo: TipoExperiencia }): Experiencia {
  const defecto: Experiencia = {
    id: "exp-01",
    t: "2026-10-29 10:00:00",
    medio: "os-web",
    capa: "llm",
    dominio: AMBITO,
    entrada: "tono para dormir",
    salida: "tono suave en Re",
    confianza: null,
    ms: null,
    resultado: null,
    valoracion: undefined,
    ...parcial,
  };
  return defecto;
}

const OP = { ambito: AMBITO, destino: "ambito" as const, nombre: "musica-v1" };

describe("permitido", () => {
  it("el destino «privado» siempre está permitido", () => {
    expect(permitido("privado", AMBITO, ajustes("privada")).ok).toBe(true);
  });

  it("sin aprendizaje colectivo, el destino «ambito» se bloquea", () => {
    expect(permitido("ambito", AMBITO, ajustes("ambito", true, false)).ok).toBe(false);
  });

  it("privacidad «publica» permite «publico», «ambito» no", () => {
    expect(permitido("publico", AMBITO, ajustes("publica")).ok).toBe(true);
    expect(permitido("publico", AMBITO, ajustes("ambito")).ok).toBe(false);
  });
});

describe("paraLlamaFactory", () => {
  it("valoración positiva: fila SFT y KTO true", () => {
    const r = paraLlamaFactory([crear({ tipo: "valoracion", valoracion: "positiva" })], ajustes("ambito"), OP);
    expect(r.sft).toHaveLength(1);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(true);
    expect(r.kto[0].messages[1].content).toBe("tono suave en Re");
  });

  it("valoración negativa: solo KTO false, sin SFT", () => {
    const r = paraLlamaFactory([crear({ tipo: "valoracion", valoracion: "negativa" })], ajustes("ambito"), OP);
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(false);
  });

  it("corrección: SFT corregida, KTO false del original y KTO true de la corregida", () => {
    const e = crear({
      tipo: "correccion" as TipoExperiencia,
      valoracion: "negativa",
      salida: "re mayor rápido",
      correccion: "re mayor suave y lento",
    });
    const r = paraLlamaFactory([e], ajustes("ambito"), OP);
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages[1].content).toBe("re mayor suave y lento");
    expect(r.kto).toHaveLength(2);
    expect(r.kto[0].messages[1].content).toBe("re mayor rápido");
    expect(r.kto[0].label).toBe(false);
    expect(r.kto[1].messages[1].content).toBe("re mayor suave y lento");
    expect(r.kto[1].label).toBe(true);
  });

  it("experiencia privada con destino «publico»: bloqueado y vacío", () => {
    const r = paraLlamaFactory(
      [crear({ tipo: "valoracion", valoracion: "positiva", id: "x01" })],
      ajustes("privada"),
      { ambito: AMBITO, destino: "publico", nombre: "musica-v1" },
    );
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas).toEqual({ bloqueado: 1 });
    expect(r.info).toEqual({});
  });

  it("experiencia con pinta de secreto: descartada", () => {
    const e = crear({ tipo: "valoracion", valoracion: "positiva", entrada: "clave sk-abcdef1234567890ab" });
    const r = paraLlamaFactory([e], ajustes("ambito"), OP);
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas).toEqual({ secreto: 1 });
  });

  it("duplicado exacto: descartado el segundo", () => {
    const e = crear({ tipo: "valoracion", valoracion: "positiva" });
    const r = paraLlamaFactory([e, { ...e, id: "otro-id" }], ajustes("ambito"), OP);
    expect(r.sft).toHaveLength(1);
    expect(r.descartadas).toEqual({ duplicado: 1 });
  });

  it("reparto estable: la misma experiencia cae siempre en la misma parte", () => {
    const lote = Array.from({ length: 31 }, (_, i) =>
      crear({ tipo: "valoracion", valoracion: "positiva", id: `exp-${i}` }),
    );
    const o1 = paraLlamaFactory(lote, ajustes("ambito"), OP);
    const o2 = paraLlamaFactory(lote, ajustes("ambito"), OP);
    expect(o2.partes).toEqual(o1.partes);
    const sumaPartes = o1.partes.train + o1.partes.val + o1.partes.test;
    expect(sumaPartes).toBe(o1.sft.length);
    for (const fila of o1.kto) {
      expect(["train", "val", "test"]).toContain(fila.parte);
    }
  });

  it("info contiene las entradas de dataset_info.json para SFT y KTO", () => {
    const r = paraLlamaFactory([], ajustes("ambito"), OP);
    expect(Object.keys(r.info)).toEqual(["musica-v1_sft", "musica-v1_kto"]);
    const sft = r.info["musica-v1_sft"] as Record<string, unknown>;
    const kto = r.info["musica-v1_kto"] as Record<string, unknown>;
    expect(sft.formatting).toBe("sharegpt");
    expect((sft.columns as Record<string, unknown>).messages).toBe("messages");
    expect((sft.tags as Record<string, unknown>).user_tag).toBe("user");
    expect(sft.file_name).toBe("musica-v1_sft.json");
    expect((kto.columns as Record<string, unknown>).kto_tag).toBe("label");
  });

  it("experiencias de otro ámbito o de otro tipo: fuera del corpus", () => {
    const lote = [
      crear({ tipo: "valoracion", valoracion: "positiva", dominio: "cocina" }),
      crear({ tipo: "intencion" }),
    ];
    const r = paraLlamaFactory(lote, ajustes("ambito"), OP);
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
  });
});
