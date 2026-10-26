/** CNX1020Ab · `medioActual` detecta el medio del OS del lado navegador (jsdom). */
import { describe, expect, it } from "vitest";
import { medioActual } from "../run";

describe("medioActual en el navegador", () => {
  it("una página local (http://localhost) es medio localhost", () => {
    expect(medioActual()).toBe("localhost");
  });

  it("dentro de la app nativa (Tauri) lo apunta aunque el origen sea local", () => {
    (window as unknown as { __TAURI_INTERNALS__: Record<string, never> }).__TAURI_INTERNALS__ = {};
    try {
      expect(medioActual()).toBe("app-nativa-mac");
    } finally {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });
});
