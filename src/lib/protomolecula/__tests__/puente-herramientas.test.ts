import { describe, it, expect, vi } from "vitest";
import {
  crearToken, procesarMensaje, mensajeParaMarco, destinoDe, esUrlEmbebible, sanearParametro,
  MENSAJES_POR_SEGUNDO,
  type Marco, type EstadoLimite,
} from "../puente-herramientas";
import type { Parametro } from "../tipos";

const TOKEN = "a".repeat(32);
const ORIGEN = "https://herramienta.example.com";

function marcoDe(origen: string | null = ORIGEN, parametros?: Parametro[]): Marco {
  return { ventana: { soyLaVentana: true }, token: TOKEN, origenEsperado: origen, parametros };
}
const limite = (): EstadoLimite => ({ fichas: MENSAJES_POR_SEGUNDO, proximaRecarga: 0 });
function ev(marco: Marco, data: unknown, origin: string | null = ORIGEN) {
  return { origin: origin ?? "null", source: marco.ventana, data };
}
const hola = { protomolecula: 1, tipo: "hola", canal: TOKEN };

describe("crearToken", () => {
  it("16 bytes → 32 caracteres hex", () => {
    const token = crearToken((n) => Uint8Array.from({ length: n }, (_, i) => i * 16 + i % 16));
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });
  it("genera un string hexadecimal de 32 caracteres (16 bytes)", () => {
    const mockAleatorio = vi.fn((n: number) => {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = i + 1;
      return bytes;
    });
    const token = crearToken(mockAleatorio);
    expect(typeof token).toBe("string");
    expect(token.length).toBe(32);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    expect(mockAleatorio).toHaveBeenCalledWith(16);
  });
});

describe("mensajeParaMarco y destinoDe", () => {
  it("mensaje lleva versión, tipo y canal", () => {
    expect(mensajeParaMarco("establecer", { parametroId: "v", valor: 1 }, TOKEN)).toEqual({
      protomolecula: 1, tipo: "establecer", canal: TOKEN, parametroId: "v", valor: 1,
    });
  });
  it("origen opaco → '*' (solo se entrega a ese contentWindow, §8.1.1)", () => {
    expect(destinoDe(marcoDe(null))).toBe("*");
  });
  it("origen real → el origen exacto", () => {
    expect(destinoDe(marcoDe(ORIGEN))).toBe(ORIGEN);
  });
});

describe("esUrlEmbebible", () => {
  const os = "https://starseed-os.vercel.app";
  it("acepta https ajena y devuelve su origen", () => {
    expect(esUrlEmbebible("https://tool.example.com/app?x=1", os)).toEqual({ ok: true, origen: "https://tool.example.com" });
  });
  it.each([
    ["http://tool.example.com", "https"],
    ["https://u:pw@tool.example.com", "credenciales"],
    ["https://starseed-os.vercel.app/app", "mismo origen"],
    ["javascript:alert(1)", "https"],
    ["data:text/html,<b>x</b>", "https"],
    ["blob:https://x.example/abc", "https"],
    ["no-es-url", "inválida"],
  ])("rechaza %s", (url, motivo) => {
    const r = esUrlEmbebible(url, os);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo.toLowerCase()).toContain(motivo.toLowerCase());
  });
});

describe("sanearParametro", () => {
  it("filtra basura y respeta tipos conocidos", () => {
    expect(sanearParametro({ id: "v", nombre: "Volumen", tipo: "numero", min: 0, max: 1 })).toEqual({
      id: "v", nombre: "Volumen", tipo: "numero", min: 0, max: 1,
    });
    expect(sanearParametro({ id: "v", nombre: "V", tipo: "raro" })).toBeNull();
    expect(sanearParametro("nada")).toBeNull();
    expect(sanearParametro({ nombre: "sin id", tipo: "numero" })).toBeNull();
  });
});

describe("procesarMensaje · identidad", () => {
  it("rechaza una ventana ajena", () => {
    const m = marcoDe();
    const r = procesarMensaje({ origin: ORIGEN, source: {}, data: hola }, m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("ventana");
  });
  it("rechaza token que no es del marco", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, canal: "otro" }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("token");
  });
  it("envoltorio propio exige origin 'null'", () => {
    const m = marcoDe(null);
    expect(procesarMensaje(ev(m, hola, ORIGEN), m, 0, limite()).entrada).toBeNull();
    expect(procesarMensaje(ev(m, hola, null), m, 0, limite()).entrada?.tipo).toBe("hola");
  });
  it("app ajena exige su origen exacto", () => {
    const m = marcoDe("https://buena.example.com");
    expect(procesarMensaje(ev(m, hola, "https://mala.example.com"), m, 0, limite()).entrada).toBeNull();
    expect(procesarMensaje(ev(m, hola, "https://buena.example.com"), m, 0, limite()).entrada?.tipo).toBe("hola");
  });
  it("rechaza data que no es objeto", () => {
    const m = marcoDe();
    for (const data of [null, "texto", 42, [1]]) {
      expect(procesarMensaje(ev(m, data), m, 0, limite()).entrada).toBeNull();
    }
  });
  it("exige la cabecera del protocolo", () => {
    const m = marcoDe();
    expect(procesarMensaje(ev(m, { tipo: "hola", canal: TOKEN }), m, 0, limite()).entrada).toBeNull();
  });
  it("ignora tipos desconocidos", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, tipo: "ovnis" }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("ignorado");
  });
});

describe("procesarMensaje · mensajes", () => {
  it("hola: sanea los parámetros declarados y descarta los inválidos", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, {
      ...hola, nombre: "Amplitud",
      parametros: [
        { id: "vol", nombre: "Volumen", tipo: "numero" },
        { id: "x", nombre: "<script>", tipo: "trampa" },
      ],
    }), m, 0, limite());
    expect(r.entrada?.tipo).toBe("hola");
    const params = r.entrada?.parametros as Parametro[];
    expect(params).toHaveLength(1);
    expect(params[0].id).toBe("vol");
  });
  it("cambio válido contra el tipo declarado (número finito)", () => {
    const m = marcoDe(ORIGEN, [{ id: "vol", nombre: "V", tipo: "numero" }]);
    const ok = procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "vol", valor: 0.5 }), m, 0, limite());
    expect(ok.entrada?.valor).toBe(0.5);
    const infinito = procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "vol", valor: Infinity }), m, 0, limite());
    expect(infinito.entrada).toBeNull();
  });
  it("cambio booleano y opción de la lista", () => {
    const m = marcoDe(ORIGEN, [
      { id: "on", nombre: "On", tipo: "booleano" },
      { id: "modo", nombre: "Modo", tipo: "opcion", opciones: ["a", "b"] },
    ]);
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "on", valor: true }), m, 0, limite()).entrada).not.toBeNull();
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "on", valor: "sí" }), m, 0, limite()).entrada).toBeNull();
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "modo", valor: "b" }), m, 0, limite()).entrada).not.toBeNull();
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "modo", valor: "z" }), m, 0, limite()).entrada).toBeNull();
  });
  it("cambio a un parámetro no declarado se rechaza", () => {
    const m = marcoDe(ORIGEN, [{ id: "vol", nombre: "V", tipo: "numero" }]);
    const r = procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "otro", valor: 1 }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("no declarado");
  });
  it("sin parámetros declarados aún, cambio pasa (hola no recibido)", () => {
    const m = marcoDe();
    expect(procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: "x", valor: 1 }), m, 0, limite()).entrada).not.toBeNull();
  });
  it("rechaza mensaje hola con nombre no válido", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, nombre: 42 }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("nombre");
  });
  it("rechaza mensaje cambio con parametroId no válido", () => {
    const m = marcoDe(ORIGEN, [{ id: "vol", nombre: "V", tipo: "numero" }]);
    const r = procesarMensaje(ev(m, { ...hola, tipo: "cambio", parametroId: 42, valor: 1 }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("parametroId");
  });
  it("rechaza mensaje exportar con formato no válido", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, tipo: "exportar", formato: 42, datos: {} }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("formato");
  });
  it("rechaza mensaje error con mensaje no válido", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, tipo: "error", mensaje: 42 }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("mensaje");
  });
  it("exportar, listo y error válidos", () => {
    const m = marcoDe();
    expect(procesarMensaje(ev(m, { ...hola, tipo: "exportar", formato: "png", datos: { b: 1 } }), m, 0, limite()).entrada?.tipo).toBe("exportar");
    expect(procesarMensaje(ev(m, { ...hola, tipo: "listo" }), m, 0, limite()).entrada?.tipo).toBe("listo");
    expect(procesarMensaje(ev(m, { ...hola, tipo: "error", mensaje: "falló" }), m, 0, limite()).entrada?.mensaje).toBe("falló");
    expect(procesarMensaje(ev(m, { ...hola, tipo: "error", mensaje: "" }), m, 0, limite()).entrada).toBeNull();
  });
});

describe("procesarMensaje · topes", () => {
  it("JSON por encima de 64 KB se rechaza", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, nombre: "x".repeat(70 * 1024) }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("64 KB");
  });
  it("exportar por encima de 2 MB se rechaza", () => {
    const m = marcoDe();
    const r = procesarMensaje(ev(m, { ...hola, tipo: "exportar", formato: "wav", datos: "x".repeat(2 * 1024 * 1024 + 10) }), m, 0, limite());
    expect(r.entrada).toBeNull();
    expect(r.motivo).toContain("2 MB");
  });
});

describe("procesarMensaje · frecuencia (reloj simulado)", () => {
  it("cubo de 120 mensajes/s y recuperación al segundo siguiente", () => {
    const m = marcoDe();
    let estado = limite();
    let aceptados = 0;
    for (let i = 0; i < 200; i++) {
      const r = procesarMensaje(ev(m, hola), m, 5_000, estado);
      estado = r.estado;
      if (r.entrada) aceptados++;
    }
    expect(aceptados).toBe(120);
    const r2 = procesarMensaje(ev(m, hola), m, 5_999, estado);
    expect(r2.entrada).toBeNull();
    expect(r2.motivo).toContain("frecuencia");
    const r3 = procesarMensaje(ev(m, hola), m, 6_000, r2.estado);
    expect(r3.entrada).not.toBeNull();
  });
});
