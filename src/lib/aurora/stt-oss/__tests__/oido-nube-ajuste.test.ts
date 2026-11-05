import { describe, it, expect } from "vitest";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
import {
  fijarOidoNube,
  oidoNubeEncendido,
  obtenerEstadoOidoNube,
  CLAVE_OIDO_NUBE,
} from "../oido-nube-ajuste";

const crearDeps = (
  ls: Record<string, string | null> = {},
  medidas: MedidaVoz[] = [],
  voz: { oido?: { motor: string }[]; habla?: { motor: string }[] } | undefined = undefined,
) => ({
  leerLS: (clave: string) => ls[clave],
  escribirLS: (clave: string, valor: string) => { ls[clave] = valor; },
  leerMedidas: () => medidas,
  vozMedida: () => voz,
  ahora: () => 1_000,
});

describe("oido-nube-ajuste", () => {
  describe("oidoNubeEncendido", () => {
    it("devuelve true por defecto (sin item guardado)", () => {
      const deps = crearDeps();
      expect(oidoNubeEncendido(deps)).toBe(true);
    });

    it("devuelve true cuando el valor es '1'", () => {
      const deps = crearDeps();
      deps.escribirLS(CLAVE_OIDO_NUBE, "1");
      expect(oidoNubeEncendido(deps)).toBe(true);
    });

    it("devuelve false cuando el valor es '0'", () => {
      const deps = crearDeps();
      deps.escribirLS(CLAVE_OIDO_NUBE, "0");
      expect(oidoNubeEncendido(deps)).toBe(false);
    });
  });

  describe("fijarOidoNube", () => {
    it("guarda '1' cuando pasa true", () => {
      const deps = crearDeps();
      fijarOidoNube(true, deps);
      expect(deps.leerLS(CLAVE_OIDO_NUBE)).toBe("1");
    });

    it("guarda '0' cuando pasa false", () => {
      const deps = crearDeps();
      fijarOidoNube(false, deps);
      expect(deps.leerLS(CLAVE_OIDO_NUBE)).toBe("0");
    });
  });

  describe("obtenerEstadoOidoNube", () => {
    it("devuelve encendido=true y oido=navegador por defecto", () => {
      const deps = crearDeps({}, [], undefined);
      const estado = obtenerEstadoOidoNube(deps);
      expect(estado.encendido).toBe(true);
      expect(estado.oido).toBe("navegador");
      expect(estado.motorHabla).toBeNull();
      expect(estado.nombreMotor).toBe("");
    });

    it("devuelve encendido=false cuando está apagado", () => {
      const deps = crearDeps({ [CLAVE_OIDO_NUBE]: "0" });
      const estado = obtenerEstadoOidoNube(deps);
      expect(estado.encendido).toBe(false);
    });

    it("devuelve motorHabla cuando hay medidas de habla", () => {
      const voz = { oido: [], habla: [{ motor: "groq-whisper" }] };
      const deps = crearDeps({}, [], voz);
      const estado = obtenerEstadoOidoNube(deps);
      expect(estado.motorHabla).toBe("groq-whisper");
    });

    it("devuelve nombre legible del motor", () => {
      const voz = { oido: [], habla: [{ motor: "groq-whisper" }] };
      const deps = crearDeps({}, [], voz);
      const estado = obtenerEstadoOidoNube(deps);
      expect(estado.nombreMotor).toBe("Groq Whisper");
    });

    it("marca oido=nube para motores conocidos", () => {
      const voz = { oido: [], habla: [{ motor: "groq-whisper" }] };
      const deps = crearDeps({}, [], voz);
      const estado = obtenerEstadoOidoNube(deps);
      expect(estado.oido).toBe("nube");
    });

    it("marca oido=navegador para motores desconocidos", () => {
      const voz = { oido: [], habla: [{ motor: "kokoro" }] };
      const deps = crearDeps({}, [], voz);
      const estado = obtenerEstadoOidoNube(deps);
      expect(estado.oido).toBe("navegador");
    });

    it("usa el primer motor de habla como motor activo", () => {
      const voz = { oido: [{ motor: "navegador" }], habla: [{ motor: "groq-whisper" }, { motor: "gemini" }] };
      const deps = crearDeps({}, [], voz);
      const estado = obtenerEstadoOidoNube(deps);
      expect(estado.motorHabla).toBe("groq-whisper");
    });
  });
});