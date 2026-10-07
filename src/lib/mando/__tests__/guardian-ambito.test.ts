import { describe, it, expect } from "vitest";
import { decidirAcceso } from "../guardian";

describe("decidirAcceso", () => {
  describe("sin bandera (comportamiento de hoy)", () => {
    it("local sin usuario pasa (sin bandera, local, sin usuario)", () => {
      expect(
        decidirAcceso({
          bandera: false,
          produccion: false,
          esLocal: true,
          hayUsuario: false,
          tieneCapacidad: false,
          rpcFallo: false,
        }),
      ).toBe(200);
    });

    it("local sin usuario con bandera pasa (sin bandera, local, sin usuario)", () => {
      expect(
        decidirAcceso({
          bandera: false,
          produccion: false,
          esLocal: true,
          hayUsuario: false,
          tieneCapacidad: false,
          rpcFallo: false,
        }),
      ).toBe(200);
    });

    it("producción sin usuario falla (sin bandera, producción, sin usuario)", () => {
      expect(
        decidirAcceso({
          bandera: false,
          produccion: true,
          esLocal: false,
          hayUsuario: false,
          tieneCapacidad: false,
          rpcFallo: false,
        }),
      ).toBe(401);
    });

    it("producción con usuario sin capacidad falla (sin bandera, producción, con usuario, sin capacidad)", () => {
      expect(
        decidirAcceso({
          bandera: false,
          produccion: true,
          esLocal: false,
          hayUsuario: true,
          tieneCapacidad: false,
          rpcFallo: false,
        }),
      ).toBe(403);
    });

    it("producción con usuario con capacidad y RPC sin fallo pasa (sin bandera, producción, con usuario, con capacidad, sin fallo RPC)", () => {
      expect(
        decidirAcceso({
          bandera: false,
          produccion: true,
          esLocal: false,
          hayUsuario: true,
          tieneCapacidad: true,
          rpcFallo: false,
        }),
      ).toBe(200);
    });

    it("producción con usuario con capacidad pero fallo RPC falla (sin bandera, producción, con usuario, con capacidad, fallo RPC)", () => {
      expect(
        decidirAcceso({
          bandera: false,
          produccion: true,
          esLocal: false,
          hayUsuario: true,
          tieneCapacidad: false,
          rpcFallo: true,
        }),
      ).toBe(503);
    });

    it("producción sin usuario pero fallo RPC falla (sin bandera, producción, sin usuario, fallo RPC)", () => {
      expect(
        decidirAcceso({
          bandera: false,
          produccion: true,
          esLocal: false,
          hayUsuario: false,
          tieneCapacidad: false,
          rpcFallo: true,
        }),
      ).toBe(503);
    });
  });

  describe("con bandera (producir PT1008D)", () => {
    it("local sin usuario pasa (con bandera, local, sin usuario)", () => {
      expect(
        decidirAcceso({
          bandera: true,
          produccion: false,
          esLocal: true,
          hayUsuario: false,
          tieneCapacidad: false,
          rpcFallo: false,
        }),
      ).toBe(200);
    });

    it("producción sin usuario falla (con bandera, producción, sin usuario)", () => {
      expect(
        decidirAcceso({
          bandera: true,
          produccion: true,
          esLocal: false,
          hayUsuario: false,
          tieneCapacidad: false,
          rpcFallo: false,
        }),
      ).toBe(401);
    });

    it("producción con usuario sin capacidad falla (con bandera, producción, con usuario, sin capacidad)", () => {
      expect(
        decidirAcceso({
          bandera: true,
          produccion: true,
          esLocal: false,
          hayUsuario: true,
          tieneCapacidad: false,
          rpcFallo: false,
        }),
      ).toBe(403);
    });

    it("producción con usuario con capacidad y RPC sin fallo pasa (con bandera, producción, con usuario, con capacidad, sin fallo RPC)", () => {
      expect(
        decidirAcceso({
          bandera: true,
          produccion: true,
          esLocal: false,
          hayUsuario: true,
          tieneCapacidad: true,
          rpcFallo: false,
        }),
      ).toBe(200);
    });

    it("producción con usuario con capacidad pero fallo RPC falla (con bandera, producción, con usuario, con capacidad, fallo RPC)", () => {
      expect(
        decidirAcceso({
          bandera: true,
          produccion: true,
          esLocal: false,
          hayUsuario: true,
          tieneCapacidad: false,
          rpcFallo: true,
        }),
      ).toBe(503);
    });

    it("producción sin usuario pero fallo RPC falla (con bandera, producción, sin usuario, fallo RPC)", () => {
      expect(
        decidirAcceso({
          bandera: true,
          produccion: true,
          esLocal: false,
          hayUsuario: false,
          tieneCapacidad: false,
          rpcFallo: true,
        }),
      ).toBe(503);
    });
  });
});
