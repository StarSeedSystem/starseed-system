/**
 * Voces NO comerciales · rescate RTVZR1011C (rama nube/41117342059).
 *
 * La rama probaba la conexión del filtro con `omnivoice-web-router`
 * (`familiaExtraPermitida`, `licenciaMotorAceptada`). Main no adoptó esa API:
 * las pruebas de persistencia del router se descartan. Lo que sí sigue vigente
 * es el contrato puro de `voces-no-comerciales.ts`; aquí se fijan los huecos
 * que `voces-no-comerciales.test.ts` no cubría contexto a contexto.
 */
import { describe, expect, it } from "vitest";
import {
  esContextoComercial,
  fichaMotor,
  motoresOpcionalesPersonales,
  puedeUsarMotor,
  veredictoVoz,
  type ContextoVoz,
} from "../voces-no-comerciales";

const CONTEXTOS: readonly ContextoVoz[] = [
  "personal-local",
  "grupo-comunitario",
  "comercial",
  "publico-red",
];

describe("filtro aplicado a las familias no comerciales", () => {
  it("ChatTTS no se permite en ninguno de los cuatro contextos", () => {
    for (const ctx of CONTEXTOS) {
      expect(puedeUsarMotor("chatt-ts", ctx), ctx).toBe(false);
      expect(veredictoVoz("chatt-ts", ctx).permitido, ctx).toBe(false);
    }
  });

  it("F5-TTS y XTTS-v2 nunca suenan en contexto comercial ni público", () => {
    for (const id of ["f5-tts", "xtts-v2"] as const) {
      for (const ctx of ["comercial", "publico-red"] as const) {
        expect(esContextoComercial(ctx), ctx).toBe(true);
        expect(puedeUsarMotor(id, ctx), `${id} · ${ctx}`).toBe(false);
        expect(veredictoVoz(id, ctx).permitido, `${id} · ${ctx}`).toBe(false);
      }
    }
  });

  it("las opciones personales del panel son fichas solo-personal verificadas", () => {
    for (const id of motoresOpcionalesPersonales()) {
      const f = fichaMotor(id);
      expect(f, id).toBeDefined();
      expect(f?.soloUsoPersonalNoComercial, id).toBe(true);
      expect(f?.usoComercialLibre, id).toBe(false);
    }
  });

  it("los opcionales personales exigen casilla de licencia y quedan fuera de AUTO", () => {
    for (const id of motoresOpcionalesPersonales()) {
      for (const ctx of ["personal-local", "grupo-comunitario"] as const) {
        const v = veredictoVoz(id, ctx);
        expect(v.permitido, `${id} · ${ctx}`).toBe(true);
        expect(v.requiereAceptacionLicencia, `${id} · ${ctx}`).toBe(true);
        expect(v.estaEnCadenaAuto, `${id} · ${ctx}`).toBe(false);
      }
    }
  });
});
