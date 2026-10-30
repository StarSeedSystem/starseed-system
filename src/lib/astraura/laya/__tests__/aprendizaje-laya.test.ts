// Pruebas de aprendizaje-laya (LYS1018M). Módulos PUROS: sin red, sin disco, sin reloj, sin modelo.
// Respuestas de Laya de ejemplo con la forma real: choice/probabilities/answer_confidence, score, noul.
import { describe, expect, it } from "vitest";
import { anotar, umbralRecalibrado, exportarJSONL, type RegistroLaya } from "../aprendizaje-laya";
import { puntoDecision } from "../puntos-decision";

describe("anotar", () => {
  it("guarda el estado SOLO como huella si es privado; nunca propaga el contenido completo", () => {
    const registro: RegistroLaya = [];
    const estadoPrivado = { texto: "correo@secreto.com", telefono: "+34 600 000 000", choice: "chat" };
    const nuevo = anotar(registro, {
      punto: "privacidad.subir",
      ambito: "cuenta",
      p: 0.4,
      donde: "a1",
      ms: 2100,
      resultado: "aceptada",
      privado: true,
      estado: estadoPrivado,
    });
    expect(nuevo.length).toBe(1);
    const caso = nuevo[0];
    expect(caso.privado).toBe(true);
    expect(caso.huella).toBe(true);
    expect(caso.estado).toBeUndefined();
    // La huella no contiene el texto ni datos
    expect((caso as any).texto).toBeUndefined();
  });

  it("para casos no privados guarda el estado completo", () => {
    const registro: RegistroLaya = [];
    const estado = { choice: "chat", probabilities: { chat: 0.8 }, answer_confidence: 0.83 };
    const nuevo = anotar(registro, {
      punto: "reflejo.herramienta",
      ambito: "pagina",
      p: 0.83,
      donde: "mac",
      ms: 1500,
      resultado: "aceptada",
      privado: false,
      estado,
    });
    expect(nuevo[0].privado).toBe(false);
    expect(nuevo[0].estado).toEqual(estado);
    expect(nuevo[0].huella).toBe(false);
  });
});

describe("umbralRecalibrado", () => {
  it("con menos de 30 casos devuelve el umbral del catálogo", () => {
    const registro: RegistroLaya = [];
    // Añadir 29 casos
    let r = registro;
    for (let i = 0; i < 29; i++) {
      r = anotar(r, {
        punto: "reflejo.herramienta",
        ambito: "cuenta",
        p: 0.5 + i * 0.01,
        donde: "a1",
        ms: 2000,
        resultado: i % 3 === 0 ? "corregida" : "aceptada",
        privado: false,
        estado: {},
      });
    }
    const umbral = umbralRecalibrado(r, "reflejo.herramienta", "cuenta");
    expect(umbral).toBe(puntoDecision("reflejo.herramienta")?.umbral);
  });

  it("con >= 30 casos devuelve el umbral que minimiza correcciones", () => {
    const registro: RegistroLaya = [];
    let r = registro;
    // Crear 30 casos: mayoría aceptadas cuando p es alto
    for (let i = 0; i < 30; i++) {
      const p = 0.4 + (i % 10) * 0.05; // 0.4,0.45,...,0.85
      r = anotar(r, {
        punto: "respuesta.basta",
        ambito: "grupo",
        p,
        donde: "mac",
        ms: 1800,
        resultado: p >= 0.6 ? "aceptada" : "corregida", // correcciones cuando p bajo
        privado: false,
        estado: {},
      });
    }
    const umbral = umbralRecalibrado(r, "respuesta.basta", "grupo");
    // Debe minimizar correcciones
    expect(typeof umbral).toBe("number");
    expect(umbral).toBeGreaterThanOrEqual(0);
    expect(umbral).toBeLessThanOrEqual(1);
    // Con umbral >= 0.6 minimizamos correcciones según nuestros datos
    expect(umbral).toBeGreaterThanOrEqual(0.5);
  });
});

describe("exportarJSONL", () => {
  it("saca los casos no privados en formato JSONL con la forma real de Laya", () => {
    const registro: RegistroLaya = [];
    let r = anotar(registro, {
      punto: "reflejo.herramienta",
      ambito: "pagina",
      p: 0.83,
      donde: "a1",
      ms: 2100,
      resultado: "aceptada",
      privado: false,
      estado: {
        choice: "chat",
        probabilities: { chat: 0.71, voz: 0.05, tarea: 0.24 },
        answer_confidence: 0.83,
        confidence: 0.68,
      },
    });
    r = anotar(r, {
      punto: "privacidad.subir",
      ambito: "cuenta",
      p: 0.25,
      donde: "a1",
      ms: 2200,
      resultado: "escalada",
      privado: true,
      estado: { privado: true, datos: "sensibles" },
    });
    const jsonl = exportarJSONL(r);
    const lineas = jsonl.trim().split("\n");
    expect(lineas.length).toBe(1); // solo el caso no privado
    const caso = JSON.parse(lineas[0]);
    expect(caso.punto).toBe("reflejo.herramienta");
    expect(caso.choice).toBe("chat");
    expect(caso.answer_confidence).toBe(0.83);
    expect(caso.probabilities).toEqual({ chat: 0.71, voz: 0.05, tarea: 0.24 });
    // El caso privado no debe aparecer
    expect(jsonl).not.toContain("sensibles");
  });

  it("devuelve cadena vacía si no hay casos no privados", () => {
    const registro: RegistroLaya = [];
    const r = anotar(registro, {
      punto: "privacidad.subir",
      ambito: "persona",
      p: 0.4,
      donde: "a1",
      ms: 2000,
      resultado: "corregida",
      privado: true,
      estado: { x: 1 },
    });
    expect(exportarJSONL(r)).toBe("");
  });
});
