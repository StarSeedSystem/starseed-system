import { describe, it, expect } from "vitest";
import { apagado } from "@/lib/aurora/stt-oss/oido-nube";

const AHORA = 1_700_000_000_000;

describe("oidoNube · ajustes", () => {
  it("apagado devuelve false cuando localStorage no tiene la clave", () => {
    const original = typeof window !== "undefined" ? window.localStorage : null;
    if (original) {
      const item = original.getItem("starseed.oido.nube");
      if (item !== "0") {
        expect(apagado()).toBe(false);
      }
    }
  });

  it("apagado devuelve true cuando localStorage es \"0\"", () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("starseed.oido.nube", "0");
      expect(apagado()).toBe(true);
      window.localStorage.removeItem("starseed.oido.nube");
    }
  });

  it("apagado devuelve false cuando localStorage es otro valor", () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("starseed.oido.nube", "1");
      expect(apagado()).toBe(false);
      window.localStorage.removeItem("starseed.oido.nube");
    }
  });

  it("apagado maneja errores de localStorage gracefully", () => {
    if (typeof window !== "undefined") {
      const originalGetter = window.localStorage.getItem;
      // @ts-expect-error - simular error
      window.localStorage.getItem = () => { throw new Error("simulated error"); };
      expect(apagado()).toBe(false);
      window.localStorage.getItem = originalGetter;
    }
  });
});