import { describe, it, expect } from "vitest";
import {
  elegirServidorVoz,
  LATIDO_MAX_MS,
  RAM_MIN_HABLA_MB,
  type EntradaServidorVozSesion,
} from "./servidor-voz-sesion";
import type { CapacidadesNodo } from "../capacidades-nodo";

const AHORA = 1_000_000;

function ficha(
  id: string,
  o: { hace?: number; ram?: number; propio?: boolean; enSegundoPlano?: boolean; oido?: number; habla?: number } = {},
): CapacidadesNodo {
  return {
    nodoId: id,
    medio: "linux",
    needle: null,
    bitnet: null,
    jev: false,
    ramLibreMb: o.ram ?? 4000,
    cpu: 10,
    t: AHORA - (o.hace ?? 10_000),
    ambitos: o.propio ? ["propio", "cuenta"] : ["publico"],
    enSegundoPlano: o.enSegundoPlano ?? false,
    voz: {
      oido: o.oido != null ? [{ motor: "phonon2", idiomas: ["es"], tiempoReal: o.oido, flujo: true }] : [],
      habla: o.habla != null ? [{ motor: "supertonic", primerSonidoMs: o.habla }] : [],
    },
  };
}

function elegir(
  fichas: CapacidadesNodo[],
  extra: Partial<Omit<EntradaServidorVozSesion, "fichas" | "ahora">> = {},
): ReturnType<typeof elegirServidorVoz> {
  return elegirServidorVoz({ sesion: { miembros: ["m1"], tipo: "grupo" }, fichas, ahora: AHORA, ...extra });
}

describe("elegirServidorVoz (Ola 1015V · S)", () => {
  it("elige por menor latencia medida: el oído rápido y la voz rápida, aunque sea otra neurona", () => {
    const r = elegir([ficha("m1", { oido: 10, habla: 900 }), ficha("r1", { propio: true, oido: 5, habla: 300 })]);
    expect(r.oido).toBe("r1");
    expect(r.habla).toBe("r1");
  });

  it("histéresis: una mejoría menor del 30 % no cambia el servidor", () => {
    // Actual r1 (tiempo real 10). Candidata nueva 8: mejor pero no un 30 %.
    const r = elegir([ficha("m1", { oido: 10, habla: 100 }), ficha("n2", { propio: true, oido: 8, habla: 100 })],
      { actual: { oido: "m1", habla: "m1" } });
    expect(r.oido).toBe("m1");
    expect(r.motivo).toContain("se mantiene");
  });

  it("histéresis superada: un 30 % mejor sí cambia", () => {
    // 10 · 0,7 = 7; la nueva con 6 lo es.
    const r = elegir([ficha("m1", { oido: 10, habla: 100 }), ficha("n2", { propio: true, oido: 6, habla: 100 })],
      { actual: { oido: "m1" } });
    expect(r.oido).toBe("n2");
    expect(r.habla).toBe("m1");
  });

  it("relevo: si el actual dejó de latir, la mejor viva toma el sitio", () => {
    const muerta = ficha("m1", { hace: LATIDO_MAX_MS + 1, oido: 1, habla: 50 });
    const viva = ficha("r1", { propio: true, oido: 20, habla: 200 });
    const r = elegir([muerta, viva], { actual: { oido: "m1", habla: "m1" } });
    expect(r.oido).toBe("r1");
    expect(r.habla).toBe("r1");
    expect(r.motivo).toContain("relevo");
  });

  it("RAM insuficiente: sin RAM de voz una ficha rápida no sirve la voz", () => {
    const pobre = ficha("p1", { propio: true, oido: 2, habla: 20, ram: 200 });
    const sano = ficha("r1", { propio: true, oido: 30, habla: 500 });
    const r = elegir([pobre, sano]);
    expect(RAM_MIN_HABLA_MB).toBeGreaterThan(200);
    expect(r.habla).toBe("r1");
    // El oído (250 MB) sí que puede irse a otro sitio más rápido.
    expect(r.oido).toBe("r1");
  });

  it("privacidad: la ficha más rápida de un ajeno nunca es elegida", () => {
    const ajeno = ficha("otro", { oido: 0.5, habla: 10 });
    const propia = ficha("r1", { propio: true, oido: 9, habla: 200 });
    const r = elegir([ajeno, propia]);
    expect(r.oido).toBe("r1");
    expect(r.habla).toBe("r1");
  });

  it("el A1 (24/7) entra como servidor aunque no sea miembro ni propio declarado", () => {
    const a1 = ficha("a1-mini", { oido: 3 });
    const propia = ficha("r1", { propio: true, oido: 9, habla: 200 });
    const r = elegir([a1, propia], { a1Id: "a1-mini" });
    expect(r.oido).toBe("a1-mini");
    expect(r.habla).toBe("r1");
  });

  it("sin candidatos: nada elegido y el motivo lo dice", () => {
    const r = elegir([ficha("otro", { oido: 1, habla: 1 })]);
    expect(r.oido).toBeUndefined();
    expect(r.habla).toBeUndefined();
    expect(r.motivo).toContain("sin oído");
    expect(r.motivo).toContain("sin voz");
  });
});
