import { describe, it, expect } from "vitest";
import {
  generarRotulos,
  generarGuion,
  describirEstacion,
  sugerirEscena,
  type FnChat,
} from "../asistente-estudio";

const chatCon = (texto: string): FnChat => async () => ({ text: texto });
const chatQueFalla: FnChat = async () => { throw new Error("sin red"); };
const JSON_ROTO = "esto no es json {sin cerrar";
const CON_DE_MAS = JSON.stringify({
  rotulos: ["Uno", "Dos"],
  extra: "de más",
  otro: 42,
});

describe("generarRotulos", () => {
  it("devuelve los rótulos válidos de la IA", async () => {
    const chat: FnChat = chatCon('{"rotulos": ["Bienvenida", "Noticias", "Cierre"]}');
    const r = await generarRotulos("espacio", 3, chat);
    expect(r).toEqual({ ok: true, valor: ["Bienvenida", "Noticias", "Cierre"] });
  });

  it("acepta JSON dentro de cercas de código y con campos de más", async () => {
    const chat: FnChat = chatCon("```json\n" + CON_DE_MAS + "\n```");
    const r = await generarRotulos("espacio", 5, chat);
    expect(r).toEqual({ ok: true, valor: ["Uno", "Dos"] });
  });

  it("descarta rótulos vacíos o kilométricos", async () => {
    const chat: FnChat = chatCon(JSON.stringify({ rotulos: ["ok", "", "x".repeat(61)] }));
    const r = await generarRotulos("tema", 5, chat);
    expect(r).toEqual({ ok: true, valor: ["ok"] });
  });

  it("falla en español si el JSON está roto", async () => {
    const r = await generarRotulos("tema", 5, chatCon(JSON_ROTO));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/json/i);
  });

  it("falla en español si la IA lanza", async () => {
    const r = await generarRotulos("tema", 5, chatQueFalla);
    expect(r.ok).toBe(false);
  });

  it("pide un tema si viene vacío sin llamar a la IA", async () => {
    let llamadas = 0;
    const r = await generarRotulos("  ", 5, async () => { llamadas++; return { text: "" }; });
    expect(r.ok).toBe(false);
    expect(llamadas).toBe(0);
  });
});

describe("generarGuion", () => {
  it("devuelve el guion pedido", async () => {
    const r = await generarGuion("cocina", 10, chatCon('{"guion": "Minuto 1: intro. Este es un guion de prueba largo."}'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toContain("Minuto 1");
  });

  it("rechaza guiones ridículamente cortos", async () => {
    const r = await generarGuion("cocina", 10, chatCon('{"guion": "corto"}'));
    expect(r.ok).toBe(false);
  });

  it("exige minutos positivos", async () => {
    const r = await generarGuion("cocina", 0, chatQueFalla);
    expect(r.ok).toBe(false);
  });
});

describe("describirEstacion", () => {
  it("devuelve descripción y categorías normalizadas", async () => {
    const r = await describirEstacion("Jazz en vivo", "audio", chatCon(
      '{"descripcion": "Jazz suave en directo cada noche.", "categorias": ["JAZZ", "Música", "jazz"]}'
    ));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.descripcion).toContain("Jazz");
      expect(r.valor.categorias).toEqual(["jazz", "música"]);
    }
  });

  it("falla si la descripción es basura", async () => {
    const r = await describirEstacion("Jazz", "audio", chatCon('{"descripcion": "no"}'));
    expect(r.ok).toBe(false);
  });
});

describe("sugerirEscena", () => {
  const estado = {
    escenas: [
      { id: "e1", nombre: "Presentador" },
      { id: "e2", nombre: "Pantalla + cámara" },
    ],
    hablando: "Alex",
    fuenteActiva: "camara",
  };

  it("devuelve la escena elegida si existe", async () => {
    const r = await sugerirEscena(estado, chatCon('{"escenaId": "e2", "porque": "Está compartiendo pantalla."}'));
    expect(r).toEqual({ ok: true, valor: { escenaId: "e2", porque: "Está compartiendo pantalla." } });
  });

  it("rechaza una escena que no existe", async () => {
    const r = await sugerirEscena(estado, chatCon('{"escenaId": "e9", "porque": "algo"}'));
    expect(r.ok).toBe(false);
  });

  it("falla sin escenas y sin llamar a la IA", async () => {
    const r = await sugerirEscena({ escenas: [] }, chatQueFalla);
    expect(r.ok).toBe(false);
  });

  it("falla en español si la IA lanza", async () => {
    const r = await sugerirEscena(estado, chatQueFalla);
    expect(r.ok).toBe(false);
  });
});
