/**
 * Tests de las funciones PURAS de Canales StarSeed (Ola 285 · 2026-09-08 · K1).
 * Solo importa funciones puras: ni la ruta del App Router ni nada que toque disco,
 * porque en este repositorio vitest (`globals: false`) no admite parchear módulos
 * de Node. Cubre `validarCanal`, `idDeCanal`, `fusionarSembrado` y `PLATAFORMAS`.
 */
import { describe, it, expect } from "vitest";
import { PLATAFORMAS, fusionarSembrado, idDeCanal, validarCanal } from "../canales/canales";
import { TG_SPACES } from "../telegram-spaces";

const AHORA = "2026-09-08T00:00:00Z";

describe("validarCanal", () => {
  it("acepta un canal válido con categorías libres", () => {
    const res = validarCanal({
      nombre: "StarSeed · Noticias",
      plataforma: "telegram",
      identificador: "-1003958762100",
      categorias: ["noticias", "ecosistema"],
      cadenciaDia: 6,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.canal.tipo).toBe("canal");
    expect(res.canal.categorias).toEqual(["noticias", "ecosistema"]);
    expect(res.canal.cadenciaDia).toBe(6);
  });

  it("acepta categorías libres (no un enum)", () => {
    const res = validarCanal({
      nombre: "Exocórtex",
      plataforma: "telegram",
      categorias: ["inteligencia-artificial", "personas", "aurora"],
    });
    expect(res.ok).toBe(true);
  });

  it("rechaza 9 categorías (máximo 8)", () => {
    const res = validarCanal({
      nombre: "Canal",
      plataforma: "telegram",
      categorias: ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"],
    });
    expect(res.ok).toBe(false);
  });

  it("rechaza un nombre vacío", () => {
    const res = validarCanal({ nombre: "  ", plataforma: "telegram" });
    expect(res.ok).toBe(false);
  });

  it("rechaza una plataforma inventada", () => {
    const res = validarCanal({ nombre: "Canal", plataforma: "signal" } as never);
    expect(res.ok).toBe(false);
  });
});

describe("idDeCanal", () => {
  it("es estable, en minúsculas y sin acentos", () => {
    const uno = idDeCanal("Noticias StarSeed", "telegram");
    const dos = idDeCanal("Noticias StarSeed", "telegram");
    expect(uno).toBe(dos);
    expect(uno).toBe(uno.toLowerCase());
    expect(uno).not.toMatch(/[ÁÉÍÓÚÑáéíóúñ]/);
    expect(uno).toBe("noticias-starseed-telegram");
  });
});

describe("fusionarSembrado", () => {
  it("siembra 7 espacios desde TG_SPACES (5 canal, 2 grupo)", () => {
    const resultado = fusionarSembrado([], TG_SPACES, AHORA);
    expect(resultado).toHaveLength(7);
    expect(resultado.filter((c) => c.tipo === "canal")).toHaveLength(5);
    expect(resultado.filter((c) => c.tipo === "grupo")).toHaveLength(2);
  });

  it("no duplica al volver a fusionar sobre el resultado", () => {
    const primera = fusionarSembrado([], TG_SPACES, AHORA);
    const segunda = fusionarSembrado(primera, TG_SPACES, AHORA);
    expect(segunda).toHaveLength(7);
  });
});

describe("PLATAFORMAS", () => {
  it("tiene telegram activa y youtube «próximamente»", () => {
    const telegram = PLATAFORMAS.find((p) => p.id === "telegram");
    const youtube = PLATAFORMAS.find((p) => p.id === "youtube");
    expect(telegram?.estado).toBe("activa");
    expect(youtube?.estado).toBe("proximamente");
  });
});