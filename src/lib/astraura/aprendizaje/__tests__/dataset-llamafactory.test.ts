import { describe, expect, it } from "vitest";
import type { Experiencia } from "../../experiencias";
import { AJUSTES_APRENDIZAJE_DEFECTO, type AjustesAprendizaje } from "../../experiencias-aprendizaje";
import { paraLlamaFactory, permitido, type OpLlamaFactory } from "../dataset-llamafactory";

const exp = (id: string, extra: Partial<Experiencia> = {}): Experiencia => ({
  id, t: "2026-10-25 12:00:00", medio: "os-web", capa: "bitnet", tipo: "valoracion",
  dominio: "memorias", entrada: "¿quién soy?", salida: "Eres la semilla del sistema.",
  confianza: 0.9, ms: 12, resultado: true, valoracion: "positiva", ...extra,
});
const ajustes = (): AjustesAprendizaje => ({
  ...AJUSTES_APRENDIZAJE_DEFECTO,
  aprendizajeColectivo: true,
  porAmbito: {
    memorias: { permite: true, privacidad: "ambito" },
    religiosa: { permite: true, privacidad: "publica" },
    personal: { permite: true, privacidad: "privada" },
    cerrado: { permite: false, privacidad: "ambito" },
  },
});

const op = (extra: Partial<OpLlamaFactory> = {}): OpLlamaFactory =>
  ({ ambito: "memorias", destino: "ambito", nombre: "memorias-core", ...extra });

describe("permitido", () => {
  it("lo privado siempre pasa: el corpus se queda en las máquinas de la persona", () => {
    expect(permitido("privado", "personal", AJUSTES_APRENDIZAJE_DEFECTO)).toEqual({ ok: true });
  });

  it("el ámbito exige aprendizaje colectivo, permiso del ámbito y no ser privado", () => {
    expect(permitido("ambito", "memorias", AJUSTES_APRENDIZAJE_DEFECTO).motivo).toBe("aprendizaje-colectivo-apagado");
    expect(permitido("ambito", "cerrado", ajustes()).motivo).toBe("ambito-no-permite");
    expect(permitido("ambito", "personal", ajustes()).motivo).toBe("privacidad-privada");
    expect(permitido("ambito", "memorias", ajustes())).toEqual({ ok: true });
  });

  it("lo público exige además que la privacidad del ámbito sea pública", () => {
    expect(permitido("publico", "memorias", ajustes()).motivo).toBe("privacidad-no-publica");
    expect(permitido("publico", "religiosa", ajustes())).toEqual({ ok: true });
  });
});

describe("paraLlamaFactory", () => {
  it("una positiva da una fila SFT y una KTO con label true, con el diálogo user/assistant", () => {
    const r = paraLlamaFactory([exp("a1")], ajustes(), op());
    const dialogo = [{ role: "user", content: "¿quién soy?" }, { role: "assistant", content: "Eres la semilla del sistema." }];
    expect(r.sft[0]).toEqual({ messages: dialogo, parte: "train" });
    expect(r.kto[0]!.label).toBe(true);
  });

  it("una negativa no entra en SFT: solo una fila KTO con label false", () => {
    const r = paraLlamaFactory([exp("neg", { valoracion: "negativa" })], ajustes(), op());
    expect(r.sft).toEqual([]);
    expect(r.kto.map((k) => k.label)).toEqual([false]);
  });

  it("una corrección: SFT con el texto corregido + KTO false (original) + KTO true (corregida)", () => {
    const r = paraLlamaFactory([exp("cor", { tipo: "correccion", correccion: "Eres la semilla del sistema: un StarSeed." })], ajustes(), op());
    expect(r.sft[0]!.messages[1]!.content).toBe("Eres la semilla del sistema: un StarSeed.");
    expect(r.kto.map((k) => k.label)).toEqual([false, true]);
    expect(r.kto[0]!.messages[1]!.content).toBe("Eres la semilla del sistema.");
    expect(r.kto[1]!.messages[1]!.content).toBe("Eres la semilla del sistema: un StarSeed.");
  });

  it("ámbito con privacidad privada y destino público: bloqueado, todo vacío", () => {
    const r = paraLlamaFactory([exp("b1"), exp("b2")], ajustes(), op({ ambito: "personal", destino: "publico" }));
    expect(r.sft).toEqual([]);
    expect(r.kto).toEqual([]);
    expect(r.descartadas).toEqual({ bloqueado: 2 });
    expect(r.info).toEqual({});
  });

  it("descarta experiencias con pinta de secreto y deja pasar lo sano", () => {
    const r = paraLlamaFactory([
      exp("s1", { salida: "tu clave es sk-AbCdefghijklmnopqrT2345" }),
      exp("s2", { entrada: "Authorization: Bearer tokieniuhbmnkjhgfdsa0987654321" }),
      exp("s3", { tipo: "correccion", correccion: "AIza0123456789abcdefghijklmnopqrstuv" }),
      exp("s4", { salida: "-----BEGIN RSA PRIVATE KEY-----" }),
      exp("sano"),
    ], ajustes(), op());
    expect(r.descartadas.secreto).toBe(4);
    expect(r.sft).toHaveLength(1);
  });

  it("descarta duplicados exactos, entrada y texto vacíos y salida no string, con sus motivos", () => {
    const r = paraLlamaFactory([
      exp("d1"), exp("d2"), exp("x1", { entrada: "   " }), exp("x2", { salida: "" }),
      exp("x3", { salida: 42 as unknown as string }), exp("x4", { tipo: "correccion", correccion: "   " }),
    ], ajustes(), op());
    expect(r.descartadas.duplicado).toBe(1);
    expect(r.descartadas["entrada-vacia"]).toBe(1);
    expect(r.descartadas["texto-vacio"]).toBe(2);
    expect(r.descartadas["salida-no-string"]).toBe(1);
  });

  it("el reparto es estable por id (FNV-1a) y la suma de tramos es el total de SFT", () => {
    const exps = [
      exp("a1", { entrada: "primera" }), exp("a2", { entrada: "segunda" }), exp("a5", { entrada: "tercera" }),
      exp("t-uno", { entrada: "¿y ahora?" }), exp("d1", { entrada: "otra mazorca" }),
    ];
    const primera = paraLlamaFactory(exps, ajustes(), op());
    expect(primera.sft).toEqual(paraLlamaFactory(exps, ajustes(), op()).sft);
    expect(primera.sft[0]!.parte).toBe("train"); // a1: cubo 5
    expect(primera.sft[2]!.parte).toBe("test"); // a5: cubo 9
    expect(primera.sft[3]!.parte).toBe("val"); // t-uno: cubo 8
    const suma = primera.partes.train + primera.partes.val + primera.partes.test;
    expect(suma).toBe(primera.sft.length);
    expect(primera.partes).toEqual({ train: 3, val: 1, test: 1 });
  });

  it("info tiene las dos entradas de dataset_info.json con formato sharegpt y kto_tag", () => {
    const r = paraLlamaFactory([], ajustes(), op());
    expect(Object.keys(r.info)).toEqual(["memorias-core_sft", "memorias-core_kto"]);
    const sft = r.info["memorias-core_sft"] as { file_name: string; formatting: string; tags: Record<string, string> };
    expect(sft.formatting).toBe("sharegpt");
    expect(sft.file_name).toBe("memorias-core_sft.json");
    expect(sft.tags.assistant_tag).toBe("assistant");
    expect((r.info["memorias-core_kto"] as { columns: Record<string, string> }).columns.kto_tag).toBe("label");
  });
});
