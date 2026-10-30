// Pruebas del generador de datasets SFT/KTO para LlamaFactory (módulo puro).
import { describe, it, expect } from "vitest";
import { paraLlamaFactory, permitido } from "../dataset-llamafactory";
import type { DestinoModelo } from "../dataset-llamafactory";
import type { Experiencia } from "../../experiencias";
import type { AjustesAprendizaje } from "../../experiencias-aprendizaje";

function exp(p: Partial<Experiencia> & { id: string }): Experiencia {
  return {
    t: "2026-10-30 10:00:00",
    medio: "os-web",
    capa: "bitnet",
    tipo: p.tipo ?? "valoracion",
    valoracion: p.valoracion ?? "positiva",
    dominio: p.dominio ?? "salas",
    entrada: p.entrada ?? "¿cómo saludo?",
    salida: p.salida ?? "Hola, ¿qué tal?",
    confianza: null,
    ms: null,
    resultado: null,
    ...p,
    id: p.id,
  };
}

const AJUSTES: AjustesAprendizaje = {
  aprendizajeColectivo: true,
  porAmbito: {
    salas: { permite: true, privacidad: "ambito" },
    ultima: { permite: true, privacidad: "publica" },
    cerro: { permite: false, privacidad: "ambito" },
    cerradon: { permite: true, privacidad: "privada" },
  },
};

function op(destino: DestinoModelo, ambito = "salas", nombre = "salas-1025") {
  return { ambito, destino, nombre };
}

const OP_AMBITO = op("ambito");
const OP_PUBLICO = op("publico", "ultima");

describe("permitido", () => {
  it("privado siempre ok; el corpus se queda en las máquinas de la persona", () => {
    expect(permitido("privado", "cerro", AJUSTES)).toEqual({ ok: true });
  });

  it("ámbito exige aprendizaje colectivo, permiso y privacidad no privada", () => {
    expect(permitido("ambito", "salas", AJUSTES)).toEqual({ ok: true });
    expect(permitido("ambito", "salas", { ...AJUSTES, aprendizajeColectivo: false }).motivo).toBeTruthy();
    expect(permitido("ambito", "cerro", AJUSTES).ok).toBe(false);
    expect(permitido("ambito", "cerradon", AJUSTES).ok).toBe(false);
  });

  it("público exige además privacidad pública", () => {
    expect(permitido("publico", "salas", AJUSTES).ok).toBe(false);
    expect(permitido("publico", "ultima", AJUSTES)).toEqual({ ok: true });
  });
});

describe("paraLlamaFactory", () => {
  it("una valoración positiva da fila SFT y fila KTO con label true", () => {
    const r = paraLlamaFactory([exp({ id: "p1", tipo: "valoracion", valoracion: "positiva" })], AJUSTES, OP_AMBITO);
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages).toEqual([
      { role: "user", content: "¿cómo saludo?" },
      { role: "assistant", content: "Hola, ¿qué tal?" },
    ]);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(true);
    expect(r.kto[0].messages[1].content).toBe("Hola, ¿qué tal?");
  });

  it("una valoración negativa da solo KTO con label false (sin SFT)", () => {
    const r = paraLlamaFactory([exp({ id: "n1", tipo: "valoracion", valoracion: "negativa" })], AJUSTES, OP_AMBITO);
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(false);
  });

  it("una corrección da SFT corregido, KTO false con el original y KTO true con la corrección", () => {
    const r = paraLlamaFactory(
      [exp({ id: "c1", tipo: "correccion", valoracion: "negativa", salida: "malo", correccion: "mejorado" })],
      AJUSTES,
      OP_AMBITO,
    );
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages[1].content).toBe("mejorado");
    expect(r.kto).toHaveLength(2);
    expect(r.kto[0].label).toBe(false);
    expect(r.kto[0].messages[1].content).toBe("malo");
    expect(r.kto[1].label).toBe(true);
    expect(r.kto[1].messages[1].content).toBe("mejorado");
  });

  it("público con privacidad pública produce filas", () => {
    const r = paraLlamaFactory([exp({ id: "pu1", dominio: "ultima" })], AJUSTES, OP_PUBLICO);
    expect(r.sft).toHaveLength(1);
    expect(r.kto).toHaveLength(1);
  });

  it("ámbito privado con destino público queda bloqueado y vacío", () => {
    const exps = [exp({ id: "b1" }), exp({ id: "b2" }), exp({ id: "b3" })];
    const r = paraLlamaFactory(exps, AJUSTES, op("publico", "cerradon"));
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas).toEqual({ bloqueado: 3 });
    expect(r.info).toEqual({});
  });

  it("el texto con pinta de secreto se descarta con el motivo «secreto»", () => {
    const r = paraLlamaFactory(
      [exp({ id: "s1", tipo: "valoracion", valoracion: "positiva", salida: "clave sk-abcdefghijklmn0123" })],
      AJUSTES,
      OP_AMBITO,
    );
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas).toEqual({ secreto: 1 });
  });

  it("el duplicado exacto se descarta con el motivo «duplicado»", () => {
    const a = paraLlamaFactory(
      [exp({ id: "d1" }), exp({ id: "d2" })],
      AJUSTES,
      OP_AMBITO,
    );
    expect(a.sft).toHaveLength(1);
    expect(a.descartadas).toEqual({ duplicado: 1 });
  });

  it("descarta entradas vacías, textos vacíos y salidas que no son string", () => {
    const r = paraLlamaFactory(
      [
        exp({ id: "v1", entrada: "   " }),
        exp({ id: "v2", salida: "" }),
        exp({ id: "v3", salida: 42 }),
      ],
      AJUSTES,
      OP_AMBITO,
    );
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas).toEqual({ "entrada-vacia": 1, "texto-vacio": 1, "salida-no-string": 1 });
  });

  it("descarta tipos no aprendibles y experiencias de otro ámbito", () => {
    const r = paraLlamaFactory(
      [
        exp({ id: "x1", tipo: "texto" }),
        exp({ id: "x2", dominio: "otro", ambito: "otro" }),
      ],
      AJUSTES,
      OP_AMBITO,
    );
    expect(r.sft).toHaveLength(0);
    expect(r.descartadas).toEqual({ "tipo-no-aprendible": 1, "otro-ambito": 1 });
  });

  it("sin aprendizaje colectivo no se genera nada para un destino de ámbito", () => {
    const r = paraLlamaFactory([exp({ id: "n0" })], { ...AJUSTES, aprendizajeColectivo: false }, OP_AMBITO);
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas).toEqual({ bloqueado: 1 });
  });

  it("las filas van a info con las entrada de dataset_info.json", () => {
    const r = paraLlamaFactory([], AJUSTES, OP_AMBITO);
    const s = r.info["salas-1025_sft"] as { formatting?: string; columns?: Record<string, string>; tags?: Record<string, string> };
    const k = r.info["salas-1025_kto"] as typeof s;
    expect(s).toBeTruthy();
    expect(s.formatting).toBe("sharegpt");
    expect(s.columns).toEqual({ messages: "messages" });
    expect(s.tags).toEqual({ role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" });
    expect(k).toBeTruthy();
    expect(k.columns).toEqual({ messages: "messages", kto_tag: "label" });
  });

  it("el reparto es estable (misma experiencia ⇒ misma parte) y la suma de partes = filas SFT", () => {
    const exps = [
      exp({ id: "e0", tipo: "valoracion", valoracion: "positiva" }),
      exp({ id: "e1", tipo: "valoracion", valoracion: "negativa" }),
      exp({ id: "e2", tipo: "correccion", valoracion: "negativa", salida: "a", correccion: "b" }),
      exp({ id: "e3", tipo: "valoracion", valoracion: "positiva", entrada: "otro" }),
      exp({ id: "e4", tipo: "valoracion", valoracion: "positiva", entrada: "más" }),
    ];
    const r1 = paraLlamaFactory(exps, AJUSTES, OP_AMBITO);
    const r2 = paraLlamaFactory(exps, AJUSTES, OP_AMBITO);
    expect(r1.sft.map((f) => f.parte)).toEqual(r2.sft.map((f) => f.parte));
    expect(r1.kto.map((f) => f.parte)).toEqual(r2.kto.map((f) => f.parte));
    const suma = r1.partes.train + r1.partes.val + r1.partes.test;
    expect(suma).toBe(r1.sft.length);
  });

  it("todas las filas de una misma experiencia comparten la misma parte", () => {
    const r = paraLlamaFactory(
      [exp({ id: "comp1", tipo: "correccion", salida: "uno", correccion: "dos" })],
      AJUSTES,
      OP_AMBITO,
    );
    const partes = [r.sft[0].parte, r.kto[0].parte, r.kto[1].parte];
    expect(new Set(partes).size).toBe(1);
  });
});


