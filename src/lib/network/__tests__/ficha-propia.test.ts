/**
 * ficha-propia — parte PURA (medio deducido de la plataforma). La medida
 * completa (`medirFichaPropia`, con batería/voz/document) ya está probada
 * herméticamente en `components/brains/__tests__/ficha-propia-voz.test.tsx`.
 */
import { describe, expect, test } from "vitest";
import { medioDesdePlataforma } from "@/lib/network/ficha-propia";

describe("medioDesdePlataforma", () => {
  test("deduce el medio del nodo de la plataforma del navegador", () => {
    expect(medioDesdePlataforma("Linux armv8l, Android 13")).toBe("android");
    expect(medioDesdePlataforma("iPhone")).toBe("ios");
    expect(medioDesdePlataforma("Linux x86_64")).toBe("linux");
    expect(medioDesdePlataforma("Win32")).toBe("navegador");
    expect(medioDesdePlataforma("MacIntel")).toBe("mac");
  });

  test("plataforma vacía o desconocida: sin inventar, medio por defecto mac", () => {
    expect(medioDesdePlataforma("")).toBe("mac");
    expect(medioDesdePlataforma("desconocida")).toBe("mac");
  });
});
