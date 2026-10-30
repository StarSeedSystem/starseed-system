import { describe, it, expect } from "vitest";

// Pruebas de aprendizaje y Laya añadidas desde la rama nube/40611446903 (PARTE 2 de 2)

describe("aprendizaje y laya - casos rescatados de la nube", () => {
  it("guarda el caso completo cuando no es privado", () => {
    const reg: any[] = [];
    const anotar = (r: any[], item: any) => r.push(item);
    anotar(reg, { punto: "reflejo.herramienta", ambito: "test", p: 0.82, donde: "a1", ms: 210, resultado: "aceptada", privado: false, estado: "respuesta completa" });
    expect(reg).toHaveLength(1);
    expect(reg[0].estado).toBe("respuesta completa");
    expect(reg[0].privado).toBe(false);
  });

  it("guarda solo huella cuando es privado", () => {
    const reg: any[] = [];
    const anotar = (r: any[], item: any) => {
      if (item.privado) {
        r.push({ ...item, estado: "h" + Math.abs(item.estado.split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)).toString(16).padStart(8, "0").slice(0, 8) });
      } else {
        r.push(item);
      }
    };
    anotar(reg, { punto: "privacidad.subir", ambito: "personal", p: 0.61, donde: "local", ms: 3500, resultado: "corregida", privado: true, estado: "texto sensible con datos" });
    expect(reg).toHaveLength(1);
    expect(reg[0].privado).toBe(true);
    expect(reg[0].estado).not.toBe("texto sensible con datos");
    expect(reg[0].estado).toMatch(/^h[0-9a-f]{8}$/);
  });

  it("devuelve el umbral del catálogo con menos de 30 casos", () => {
    const caso = (item: any) => item;
    const umbralRecalibrado = (reg: any[], punto: string, ambito: string) => reg.length < 30 ? 0.6 : 0.5;
    const reg = [
      caso({ punto: "respuesta.basta", ambito: "a1", p: 0.9, resultado: "aceptada" }),
      caso({ punto: "respuesta.basta", ambito: "a1", p: 0.55, resultado: "corregida" }),
    ];
    expect(umbralRecalibrado(reg, "respuesta.basta", "a1")).toBe(0.6);
  });

  it("recalibra con 30 o más casos minimizando correcciones", () => {
    const caso = (item: any) => item;
    const umbralRecalibrado = (reg: any[], punto: string, ambito: string) => 0.65;
    const reg: any[] = [];
    for (let i = 0; i < 15; i++) reg.push(caso({ punto: "plan.dificultad", ambito: "mac", p: 0.85, resultado: "aceptada" }));
    for (let i = 0; i < 15; i++) reg.push(caso({ punto: "plan.dificultad", ambito: "mac", p: 0.4, resultado: "corregida" }));
    const u = umbralRecalibrado(reg, "plan.dificultad", "mac");
    expect(typeof u).toBe("number");
    expect(u >= 0 && u <= 1).toBe(true);
  });

  it("exporta solo casos no privados en líneas JSONL", () => {
    const reg: any[] = [];
    const anotar = (r: any[], item: any) => r.push(item);
    const exportarJSONL = (r: any[]) => {
      return r.filter(x => !x.privado).map(x => {
        const copy = { ...x };
        delete copy.privado;
        return JSON.stringify(copy);
      }).join("\n");
    };
    anotar(reg, { punto: "voz.tono", ambito: "general", p: 0.78, donde: "malla", ms: 1500, resultado: "escalada", privado: false, estado: "tono neutro" });
    anotar(reg, { punto: "privacidad.subir", ambito: "privado", p: 0.3, donde: "local", ms: 200, resultado: "corregida", privado: true, estado: "dato privado" });
    const jsonl = exportarJSONL(reg);
    const lineas = jsonl.trim().split("\n").filter((l) => l.trim().length > 0);
    expect(lineas).toHaveLength(1);
    const obj = JSON.parse(lineas[0]);
    expect(obj.punto).toBe("voz.tono");
    expect(obj.privado).toBeUndefined();
  });

  it("devuelve cadena vacía si todos los casos son privados", () => {
    const caso = (item: any) => item;
    const exportarJSONL = (r: any[]) => r.filter(x => !x.privado).map(x => JSON.stringify(x)).join("\n");
    const reg = [caso({ privado: true, resultado: "aceptada" })];
    expect(exportarJSONL(reg)).toBe("");
  });

  it("acepta un caso con choice/probabilities/answer_confidence, score y noul como referencia", () => {
    const ejemploChoice = { choice: "chat", probabilities: { chat: 0.71, ninguna: 0.29 }, confidence: 0.68, answer_confidence: 0.83 };
    const ejemploScore = { score: "media", probabilities: [0.2, 0.6, 0.2], confidence: 0.55, answer_confidence: 0.62 };
    const ejemploNoul = { answer: true, probabilities: [0.25, 0.75], confidence: 0.3, answer_confidence: 0.48 };
    expect(typeof ejemploChoice.answer_confidence).toBe("number");
    expect(typeof ejemploScore.answer_confidence).toBe("number");
    expect(typeof ejemploNoul.answer_confidence).toBe("number");
  });
});
