import { describe, expect, it } from "vitest";
import {
  crearSecreto,
  esperaRestante,
  registrarFallo,
  verificarSecreto,
  type EstadoIntentos,
} from "../secreto-local";

const ITERACIONES_PRUEBA = 10;

describe("secreto local", () => {
  it("crea y verifica un secreto", async () => {
    const guardado = await crearSecreto("contrasena", "luz-comun", ITERACIONES_PRUEBA);

    expect(guardado).toMatchObject({
      metodo: "contrasena",
      iteraciones: ITERACIONES_PRUEBA,
      v: 1,
    });
    expect(guardado.sal).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(guardado.hash).toMatch(/^[A-Za-z0-9_-]+$/);
    await expect(verificarSecreto(guardado, "luz-comun")).resolves.toBe(true);
  });

  it("rechaza un intento incorrecto", async () => {
    const guardado = await crearSecreto("pin", "2580", ITERACIONES_PRUEBA);

    await expect(verificarSecreto(guardado, "2581")).resolves.toBe(false);
  });

  it("rechaza los PIN inválidos con un mensaje claro", async () => {
    await expect(crearSecreto("pin", "12a4", ITERACIONES_PRUEBA)).rejects.toThrow(
      "El PIN debe contener entre 4 y 12 dígitos.",
    );
    await expect(crearSecreto("pin", "123", ITERACIONES_PRUEBA)).rejects.toThrow(
      "El PIN debe contener entre 4 y 12 dígitos.",
    );
  });

  it("genera sales y hashes distintos para el mismo secreto", async () => {
    const primero = await crearSecreto("pin", "2580", ITERACIONES_PRUEBA);
    const segundo = await crearSecreto("pin", "2580", ITERACIONES_PRUEBA);

    expect(primero.sal).not.toBe(segundo.sal);
    expect(primero.hash).not.toBe(segundo.hash);
  });
});

describe("espera entre intentos", () => {
  it("crece después de cinco fallos y tiene un techo de quince minutos", () => {
    let estado: EstadoIntentos = { fallos: 0, bloqueadoHasta: 0 };
    for (let i = 0; i < 4; i += 1) estado = registrarFallo(estado, 0);
    expect(esperaRestante(estado, 0)).toBe(0);

    estado = registrarFallo(estado, 0);
    expect(esperaRestante(estado, 0)).toBe(30_000);
    estado = registrarFallo(estado, 0);
    expect(esperaRestante(estado, 0)).toBe(60_000);

    for (let i = 0; i < 20; i += 1) estado = registrarFallo(estado, 0);
    expect(esperaRestante(estado, 0)).toBe(15 * 60_000);
    expect(esperaRestante(estado, 15 * 60_000)).toBe(0);
  });
});
