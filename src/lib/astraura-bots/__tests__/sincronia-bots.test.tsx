import { describe, it, expect, beforeEach } from "vitest";
import {
  abiertosEnEstaNeurona,
  marcarAbierto,
  migrarAbiertosDesdeAntigua,
} from "../adaptadores/sincronia-bots";

const CLAVE_ABIERTOS = "starseed.astraura.orbes-abiertos";
const CLAVE_ANTIGUA = "starseed.astraura.bots.abiertos.v1";

beforeEach(() => {
  window.localStorage.clear();
});

describe("abiertosEnEstaNeurona (jsdom)", () => {
  it("devuelve [] cuando no hay datos", () => {
    expect(abiertosEnEstaNeurona()).toEqual([]);
  });

  it("devuelve el array guardado", () => {
    window.localStorage.setItem(CLAVE_ABIERTOS, JSON.stringify(["bot1", "bot2"]));
    expect(abiertosEnEstaNeurona()).toEqual(["bot1", "bot2"]);
  });

  it("devuelve [] cuando lo guardado no es un array", () => {
    window.localStorage.setItem(CLAVE_ABIERTOS, '{"not": "an array"}');
    expect(abiertosEnEstaNeurona()).toEqual([]);
  });
});

describe("marcarAbierto (jsdom)", () => {
  it("añade el id cuando abierto es true", () => {
    marcarAbierto("bot1", true);
    expect(abiertosEnEstaNeurona()).toEqual(["bot1"]);
  });

  it("no duplica ids", () => {
    marcarAbierto("bot1", true);
    marcarAbierto("bot1", true);
    expect(abiertosEnEstaNeurona()).toEqual(["bot1"]);
  });

  it("quita el id cuando abierto es false", () => {
    marcarAbierto("bot1", true);
    marcarAbierto("bot2", true);
    marcarAbierto("bot1", false);
    expect(abiertosEnEstaNeurona()).toEqual(["bot2"]);
  });

  it("no hace nada al quitar un bot que no está", () => {
    marcarAbierto("bot1", false);
    expect(abiertosEnEstaNeurona()).toEqual([]);
  });
});

describe("migrarAbiertosDesdeAntigua (jsdom)", () => {
  it("no hace nada sin datos antiguos", () => {
    migrarAbiertosDesdeAntigua();
    expect(window.localStorage.getItem(CLAVE_ABIERTOS)).toBeNull();
  });

  it("migra los datos antiguos a la clave nueva", () => {
    const antiguos = ["oldBot1", "oldBot2"];
    window.localStorage.setItem(CLAVE_ANTIGUA, JSON.stringify(antiguos));
    migrarAbiertosDesdeAntigua();
    expect(window.localStorage.getItem(CLAVE_ABIERTOS)).toBe(JSON.stringify(antiguos));
  });

  it("combina los datos antiguos con los nuevos existentes", () => {
    window.localStorage.setItem(CLAVE_ANTIGUA, JSON.stringify(["oldBot1", "oldBot2"]));
    window.localStorage.setItem(CLAVE_ABIERTOS, JSON.stringify(["existingBot1"]));
    migrarAbiertosDesdeAntigua();
    const combinados = JSON.parse(window.localStorage.getItem(CLAVE_ABIERTOS) ?? "[]");
    expect(combinados).toEqual(expect.arrayContaining(["existingBot1", "oldBot1", "oldBot2"]));
    expect(combinados).toHaveLength(3);
  });

  it("no toca nada si lo antiguo no es un array", () => {
    window.localStorage.setItem(CLAVE_ANTIGUA, '{"not": "an array"}');
    migrarAbiertosDesdeAntigua();
    expect(window.localStorage.getItem(CLAVE_ANTIGUA)).toBe('{"not": "an array"}');
    expect(window.localStorage.getItem(CLAVE_ABIERTOS)).toBeNull();
  });
});
