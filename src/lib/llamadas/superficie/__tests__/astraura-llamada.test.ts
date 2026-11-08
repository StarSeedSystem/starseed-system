import { describe, expect, it } from "vitest";
import { ASTRAURA_INICIAL as A, contextoParaPrompt, crearRespuesta, elegirGenerador, recibirRespuesta, textoTranscripcion } from "../astraura-llamada";

const resp = (id: string) => crearRespuesta({ id, de: "mac", preguntaDe: "tablet", pregunta: "¿qué hora es?", texto: "Las cinco.", ajustes: { voz: "v1", tono: "cercano", velocidad: 1 }, local: true, en: 1 });

describe("Astraura en la llamada (LLA1108C)", () => {
  it("sin opt-in no se muestra nada ni se recuerda", () => {
    const r = recibirRespuesta(A, resp("1"));
    expect(r.nueva).toBe(false);
    expect(r.estado.respuestas).toHaveLength(0);
  });
  it("una respuesta llega una sola vez aunque venga por varias vías", () => {
    let s = { ...A, activa: true };
    const a = recibirRespuesta(s, resp("1"));
    expect(a).toMatchObject({ nueva: true, leer: false });
    s = a.estado;
    const b = recibirRespuesta(s, resp("1"));
    expect(b.nueva).toBe(false);
    expect(b.estado.respuestas).toHaveLength(1);
  });
  it("todas las neuronas activas ven el MISMO texto y ajustes; solo habla quien lo pidió", () => {
    const r = resp("9");
    const mac = recibirRespuesta({ ...A, activa: true, hablar: true }, r);
    const tab = recibirRespuesta({ ...A, activa: true }, r);
    expect(mac.estado.respuestas[0]).toEqual(tab.estado.respuestas[0]);
    expect(mac.leer).toBe(true);
    expect(tab.leer).toBe(false);
  });
  it("elige un único generador, igual en todas las neuronas", () => {
    const cand = [
      { id: "tablet", activa: true, capaz: true, local: false },
      { id: "mac", activa: true, capaz: true, local: true },
      { id: "movil", activa: false, capaz: true, local: true },
    ];
    expect(elegirGenerador("tablet", cand)).toBe("mac");
    expect(elegirGenerador("mac", cand)).toBe("mac");
    expect(elegirGenerador("tablet", cand.map((c) => ({ ...c, local: false })))).toBe("tablet");
    expect(elegirGenerador("x", [])).toBeNull();
    expect(elegirGenerador("x", [{ id: "a", activa: true, capaz: false, local: true }])).toBeNull();
  });
  it("contexto recortado: lo reciente primero y dentro del límite", () => {
    const c = contextoParaPrompt({ tipo: "voz", participantes: ["Ana"], archivos: [], transcripcion: [{ de: "Ana", texto: "a".repeat(100), en: 1 }, { de: "Yo", texto: "hola", en: 2 }] }, 90);
    expect(c).toContain("Yo: hola");
    expect(c).not.toContain("aaaa");
  });
  it("transcripción: degrada con honestidad", () => {
    expect(textoTranscripcion({ reconocedor: "ninguno", activa: true })).toMatch(/No hay reconocimiento/);
    expect(textoTranscripcion({ reconocedor: "local", activa: true })).toMatch(/no sale/);
  });
});
