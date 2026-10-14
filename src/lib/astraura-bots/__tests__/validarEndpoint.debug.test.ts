import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { validarEndpoint } from "../adaptadores/invitado-servidor";

// Guardar valores originales de variables de entorno
let originalIntegrationsProxyAllowPrivate: string | undefined;

beforeEach(() => {
  // Guardar y establecer variables de entorno para las pruebas
  originalIntegrationsProxyAllowPrivate = process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE;
  
  // Por defecto, permitir privados (comportamiento normal del SSRF)
  delete process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE;
});

afterEach(() => {
  // Restaurar valores originales
  if (originalIntegrationsProxyAllowPrivate === undefined) {
    delete process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE;
  } else {
    process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE = originalIntegrationsProxyAllowPrivate;
  }
});

describe("validarEndpoint debug", () => {
  it("debe aceptar URLs HTTPS válidas", async () => {
    console.log("Test: INTEGRATIONS_PROXY_ALLOW_PRIVATE =", process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE);
    const result = await validarEndpoint("https://example.com");
    console.log("Test: result =", result);
    expect(result).toBe(true);
  });
});