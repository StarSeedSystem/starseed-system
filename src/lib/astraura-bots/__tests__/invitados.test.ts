import { describe, test, expect } from "vitest";
import { 
  CATALOGO_INVITADOS, 
  type EntradaInvitado, 
  crearInvitado 
} from "../invitados";
import { type Bot, type Sentido, SENTIDOS } from "../tipos";
import { NUNCA_INVITADO } from "../permisos";

describe("invitados.ts", () => {
  const perfilId = "profile-123";
  const cuentaId = "account-456";

  test("el catálogo define sentidos máximos correctos (sin NUNCA_INVITADO)", () => {
    const sentidosMaximosEsperados = SENTIDOS.filter(
      (s) => !NUNCA_INVITADO.includes(s)
    );
    Object.values(CATALOGO_INVITADOS).forEach((invitado) => {
      expect(invitado.sentidosMaximos).toEqual(sentidosMaximosEsperados);
    });
  });

  test("el bot creado no tiene origen predeterminado (astraura)", () => {
    const entrada: EntradaInvitado = { tipo: "grok", nombre: "Mi Grok" };
    const resultado = crearInvitado(entrada, perfilId, cuentaId);
    expect("problemas" in resultado).toBe(false);
    const bot = resultado as Bot;
    expect(bot.origen).not.toBe("astraura");
  });

  test("validación rechaza URL no http para openai-compatible", () => {
    const entrada: EntradaInvitado = {
      tipo: "openai-compatible",
      nombre: "Test OpenAI",
      url: "not-a-url",
      variable: "API_KEY",
    };
    const resultado = crearInvitado(entrada, perfilId, cuentaId);
    expect("problemas" in resultado).toBe(true);
    if ("problemas" in resultado) {
      expect(resultado.problemas).toContainEqual(
        expect.stringContaining("URL no es válida")
      );
    }
  });

  test("validación requiere nombre obligatorio", () => {
    const entrada: EntradaInvitado = { tipo: "grok", nombre: "" };
    const resultado = crearInvitado(entrada, perfilId, cuentaId);
    expect("problemas" in resultado).toBe(true);
    if ("problemas" in resultado) {
      expect(resultado.problemas).toContainEqual(
        expect.stringContaining("El nombre es obligatorio")
      );
    }
  });

  test("grok no requiere campo variable en la entrada", () => {
    const entrada: EntradaInvitado = { tipo: "grok", nombre: "Grok Test" };
    const resultado = crearInvitado(entrada, perfilId, cuentaId);
    expect("problemas" in resultado).toBe(false);
    if ("problemas" in resultado) {
      // Si hay problemas, no debería ser por falta de variable
      expect(resultado.problemas).not.toContainEqual(
        expect.stringContaining("variable")
      );
    }
  });

  test("openai-compatible requiere URL y variable", () => {
    const entradaSinURL: EntradaInvitado = {
      tipo: "openai-compatible",
      nombre: "Test",
      url: "",
      variable: "KEY",
    };
    const resultado1 = crearInvitado(entradaSinURL, perfilId, cuentaId);
    expect("problemas" in resultado1).toBe(true);
    if ("problemas" in resultado1) {
      expect(resultado1.problemas).toContainEqual(
        expect.stringContaining("La URL es obligatoria")
      );
    }

    const entradaSinVariable: EntradaInvitado = {
      tipo: "openai-compatible",
      nombre: "Test",
      url: "https://example.com",
      variable: "",
    };
    const resultado2 = crearInvitado(entradaSinVariable, perfilId, cuentaId);
    expect("problemas" in resultado2).toBe(true);
    if ("problemas" in resultado2) {
      expect(resultado2.problemas).toContainEqual(
        expect.stringContaining("El nombre de la variable de entorno es obligatorio")
      );
    }
  });

  test("ag-ui requiere endpoint", () => {
    const entrada: EntradaInvitado = { tipo: "ag-ui", nombre: "Test AG-UI", endpoint: "" };
    const resultado = crearInvitado(entrada, perfilId, cuentaId);
    expect("problemas" in resultado).toBe(true);
    if ("problemas" in resultado) {
      expect(resultado.problemas).toContainEqual(
        expect.stringContaining("El endpoint es obligatorio")
      );
    }
  });

  test("el catálogo no contiene valores de clave reales", () => {
    Object.values(CATALOGO_INVITADOS).forEach((invitado) => {
      // Los campos costeOrientativo y aviso deben be strings descriptivos, no claves
      expect(typeof invitado.costeOrientativo).toBe("string");
      expect(typeof invitado.aviso).toBe("string");
      // Además, podemos verificar que no contengan patrones de claves comunes
      expect(invitado.costeOrientativo).not.toMatch(
        /sk-|AKIA|Bearer|sgdc|xai-/i
      );
      expect(invitado.aviso).not.toMatch(
        /sk-|AKIA|Bearer|sgdc|xai-/i
      );
    });
  });

  test("el bot creado tiene sentidos habilitados dentro del máximo permitido", () => {
    const entrada: EntradaInvitado = { tipo: "grok", nombre: "Test" };
    const resultado = crearInvitado(entrada, perfilId, cuentaId);
    expect("problemas" in resultado).toBe(false);
    const bot = resultado as Bot;
    bot.sentidosHabilitados.forEach((sentido) => {
      expect(SENTIDOS as readonly Sentido[]).toContain(sentido);
      expect(NUNCA_INVITADO as readonly Sentido[]).not.toContain(sentido);
    });
  });

  test("el bot creado tiene el nombre proporcionado (recortado)", () => {
    const nombreConEspacios = "  Mi Bot Invitado  ";
    const entrada: EntradaInvitado = { tipo: "grok", nombre: nombreConEspacios };
    const resultado = crearInvitado(entrada, perfilId, cuentaId);
    expect("problemas" in resultado).toBe(false);
    const bot = resultado as Bot;
    expect(bot.nombre).toBe("Mi Bot Invitado"); // trimmed
  });
});