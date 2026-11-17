import { describe, expect, it } from "vitest";
import {
  ESPERA_INACTIVIDAD_MS,
  ESPERA_MAXIMA_MS,
  msParaAbrirGuia,
} from "../use-timeout-interaction";

const T0 = 1_000_000;

describe("msParaAbrirGuia · el temporizador no interrumpe la navegación", () => {
  it("sin interacción todavía, espera la inactividad completa", () => {
    expect(msParaAbrirGuia({ pedidoEn: T0, ultimaInteraccion: T0 }, T0)).toBe(
      ESPERA_INACTIVIDAD_MS,
    );
  });

  it("con la persona inactiva el tiempo acordado, abre ya (0)", () => {
    expect(
      msParaAbrirGuia({ pedidoEn: T0, ultimaInteraccion: T0 }, T0 + ESPERA_INACTIVIDAD_MS),
    ).toBe(0);
  });

  it("un gesto reciente reinicia la cuenta: devuelve lo que falta desde ese gesto", () => {
    const estado = { pedidoEn: T0, ultimaInteraccion: T0 + 800 };
    expect(msParaAbrirGuia(estado, T0 + 1000)).toBe(ESPERA_INACTIVIDAD_MS - 200);
  });

  it("nunca se aplaza más allá del techo, aunque no pare de interactuar", () => {
    const estado = { pedidoEn: T0, ultimaInteraccion: T0 + ESPERA_MAXIMA_MS - 1 };
    expect(msParaAbrirGuia(estado, T0 + ESPERA_MAXIMA_MS)).toBe(0);
  });

  it("cerca del techo devuelve solo lo que queda hasta él, no otra espera completa", () => {
    const ahora = T0 + ESPERA_MAXIMA_MS - 300;
    expect(msParaAbrirGuia({ pedidoEn: T0, ultimaInteraccion: ahora }, ahora)).toBe(300);
  });

  it("acepta umbrales propios y nunca deja el techo por debajo de la inactividad", () => {
    const estado = { pedidoEn: T0, ultimaInteraccion: T0 };
    expect(
      msParaAbrirGuia(estado, T0 + 100, { esperaInactividadMs: 500, esperaMaximaMs: 1000 }),
    ).toBe(400);
    expect(
      msParaAbrirGuia(estado, T0 + 100, { esperaInactividadMs: 500, esperaMaximaMs: 100 }),
    ).toBe(400);
  });

  it("un reloj que va hacia atrás no dispara antes de tiempo", () => {
    expect(msParaAbrirGuia({ pedidoEn: T0 + 500, ultimaInteraccion: T0 + 500 }, T0)).toBe(
      ESPERA_INACTIVIDAD_MS,
    );
  });

  it("no abre mientras haya un gesto más reciente que la petición", () => {
    const ahora = T0 + 500;
    const estado = { pedidoEn: T0, ultimaInteraccion: ahora };
    expect(msParaAbrirGuia(estado, ahora)).toBe(ESPERA_INACTIVIDAD_MS);
  });
});
