import { describe, it, expect } from "vitest";
import { isOssSttSupported, loadModel, isModelReady } from "../oss-stt";

describe("oss-stt (módulo puro)", () => {
  it("reporta soporte correctamente", () => {
    // En el entorno de test, la navegación / getUserMedia pueden ser falsos
    const supported = isOssSttSupported();
    expect(typeof supported).toBe("boolean");
  });

  it("isModelReady reporta false inicialmente", () => {
    expect(isModelReady()).toBe(false);
  });
});
