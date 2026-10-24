/**
 * VZF1015S — elegirServidorVoz: elección autogestionada del servidor de voz
 * de la sesión (Ola 1015V · contradado voz-fusionada-astraura.md §5).
 * Pruebas de función pura: sin red, sin micrófono y sin procesos, con el
 * reloj inyectado por `ahora` y las fichas construidas a mano.
 */
import { describe, expect, it } from "vitest";
import {
  elegirServidorVoz,
  LATIDO_SERVIDOR_MAX_MS,
  RAM_SERVIDOR_MIN_MB,
  type EntradaElegirServidorVoz,
} from "../servidor-voz-sesion";
import type { CapacidadesNodo, VozNodo } from "../capacidades-nodo";

const AHORA = 1_800_000_000_000;

/** Ficha de voz anunciada (§5) construida a mano: viva por defecto. */
const ficha = (
  nodoId: string,
  o: {
    medio?: CapacidadesNodo["medio"];
    voz?: VozNodo;
    t?: number;
    ramLibreMb?: number;
    ambitos?: CapacidadesNodo["ambitos"];
  } = {},
): CapacidadesNodo => ({
  nodoId,
  medio: o.medio ?? "mac",
  needle: null,
  bitnet: null,
  jev: false,
  ramLibreMb: o.ramLibreMb ?? 2000,
  cpu: 10,
  t: o.t ?? AHORA - 5000,
  ...(o.ambitos ? { ambitos: o.ambitos } : {}),
  ...(o.voz ? { voz: o.voz } : {}),
});

/** Oído medido: menor tiempo real entre los motores que la ficha anuncia. */
const vozOido = (tiempoReal: number, motor = "phonon-2"): VozNodo =>
  ({ oido: [{ motor, idiomas: ["es"], tiempoReal, flujo: true }], habla: [] });
/** Habla medida: primer sonido entre los motores que la ficha anuncia. */
const vozHabla = (primerSonidoMs: number, motor = "supertonic"): VozNodo =>
  ({ oido: [], habla: [{ motor, primerSonidoMs }] });
const vozOidoHabla = (tReal: number, sonidoMs: number): VozNodo => ({
  oido: [{ motor: "parakeet-v3", idiomas: ["es"], tiempoReal: tReal, flujo: false }],
  habla: [{ motor: "supertonic", primerSonidoMs: sonidoMs }],
});

const elegir = (o: Partial<EntradaElegirServidorVoz> & { fichas: EntradaElegirServidorVoz["fichas"] }) =>
  elegirServidorVoz({
    sesion: { tipo: "grupo", miembros: ["n-yo"] },
    ahora: AHORA,
    ...o,
  });

describe("elección: menor latencia medida, oído y habla por separado", () => {
  it("elige la mejor de oír y la mejor de hablar, aunque no sean la misma neurona", () => {
    const r = elegir({
      fichas: [
        ficha("n-yo", { voz: vozOidoHabla(11.1, 400) }),
        ficha("a1", { medio: "nube", ambitos: ["publico"], voz: vozOido(6.9) }),
        ficha("n-luna", { voz: vozOidoHabla(10.9, 350) }),
      ],
    });
    expect(r.oido?.nodoId).toBe("a1");
    expect(r.habla?.nodoId).toBe("n-luna");
    expect(r.motivo).toContain("oído: a1");
    expect(r.motivo).toContain("habla: n-luna");
  });

  it("el A1 entra como candidato aunque no sea miembro (24/7, §5) y sin voz no se elige", () => {
    const r = elegir({
      fichas: [ficha("a1", { medio: "nube", ambitos: ["cuenta"], voz: vozOido(9) }), ficha("n-mudo")],
    });
    expect(r.oido?.nodoId).toBe("a1");
    expect(r.motivo).toContain("habla: sin fichas de voz en pie");
  });

  it("filtra: sin latido hace 3 min, sin RAM y sin medidas de ese rol no cuentan", () => {
    const r = elegir({
      fichas: [
        ficha("n-yo", { voz: vozOidoHabla(12, 700) }),
        ficha("muerta", { voz: vozOido(1), t: AHORA - LATIDO_SERVIDOR_MAX_MS - 1 }),
        ficha("poca-ram", { voz: vozOido(1), ramLibreMb: RAM_SERVIDOR_MIN_MB - 1 }),
        ficha("sin-habla", { voz: vozHabla(200), ramLibreMb: 0 }),
      ],
    });
    expect(r.oido?.nodoId).toBe("n-yo");
    expect(r.habla?.nodoId).toBe("n-yo");
  });
});

describe("histéresis: solo salta si lo nuevo es ≥ 30 % mejor", () => {
  it("una mejora dentro del margen no saca a la elegida actual", () => {
    const r = elegir({
      fichas: [
        ficha("n-yo", { voz: vozOido(6.9) }),
        ficha("n-luna", { voz: vozOido(6.0) }), // mejora 13 %: no salta
      ],
      actual: { oido: ficha("n-yo", { voz: vozOido(6.9) }), motivo: "anterior" },
    });
    expect(r.oido?.nodoId).toBe("n-yo");
    expect(r.motivo).toContain("se mantiene n-yo (histéresis)");
  });

  it("con una mejora bien por encima del umbral (30 %) sí salta", () => {
    const r = elegir({
      fichas: [
        ficha("n-yo", { voz: vozOido(10) }),
        ficha("n-luna", { voz: vozOido(6.9) }), // mejora 31 %: salta
      ],
      actual: { oido: ficha("n-yo", { voz: vozOido(10) }), motivo: "anterior" },
    });
    expect(r.oido?.nodoId).toBe("n-luna");
    expect(r.motivo).toContain("cambia a n-luna");
    expect(r.motivo).toContain("31 % mejor");
  });
});

describe("relevo y privacidad", () => {
  it("si la actual dejó de latir, la mejor viva entra aunque no supere el 30 %", () => {
    const r = elegir({
      fichas: [
        ficha("n-muerta", { voz: vozOido(1.5), t: AHORA - 10 * 60 * 1000 }),
        ficha("n-luna", { voz: vozOido(5) }),
      ],
      actual: { oido: ficha("n-muerta", { voz: vozOido(1.5) }), motivo: "anterior" },
    });
    expect(r.oido?.nodoId).toBe("n-luna");
    expect(r.motivo).toContain("relevo a n-luna");
  });

  it("una ficha más rápida pero ajena a la sesión nunca recibe el audio", () => {
    const r = elegir({
      fichas: [
        ficha("n-ajena", { medio: "linux", voz: vozOido(0.5), ramLibreMb: 8000 }), // ni miembro ni cuenta ni A1
        ficha("n-yo", { voz: vozOido(11) }),
      ],
    });
    expect(r.oido?.nodoId).toBe("n-yo");
    expect(r.oido?.nodoId).not.toBe("n-ajena");
  });

  it("solo hay fichas ajenas en pie: sin elección y el motivo dice privacidad", () => {
    const r = elegir({
      fichas: [
        ficha("n-ajena", { medio: "android", voz: vozOidoHabla(1, 100), ramLibreMb: 4000 }),
      ],
    });
    expect(r.oido).toBeUndefined();
    expect(r.habla).toBeUndefined();
    expect(r.motivo).toContain("sin candidatas de confianza (privacidad)");
  });
});

describe("robustez: nunca lanza y la sesión vacía no elige", () => {
  it("sin fichas devuelve solo el motivo; con la entrada rota, tampoco lanza", () => {
    expect(elegir({ fichas: [] }).oido).toBeUndefined();
    expect(
      elegirServidorVoz({
        fichas: null as unknown as CapacidadesNodo[],
        sesion: null as unknown as EntradaElegirServidorVoz["sesion"],
        ahora: Number.NaN,
      }).motivo,
    ).toContain("sesión");
  });
});




