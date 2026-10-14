import { describe, test, expect, vi } from "vitest";
import { crearPuenteSentidos } from "@/lib/astraura-bots/adaptadores/sentidos-puente";
import type { Bot, ConsentimientoSentido, Medio, RolBot, SesionTipo, Sentido } from "@/lib/astraura-bots/tipos";
import type { AlcanceMemoria, FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import type { ScreenElement } from "@/lib/aurora/screen-control/screen-scanner";

// Helper to create a mock bot
function crearMockBot(
  overrides: Partial<Bot> = {},
): Bot {
  return {
    id: "bot-1",
    nombre: "Bot de prueba",
    dueno: {
      tipo: "perfil",
      id: "perfil-1",
      cuentaId: "cuenta-1",
    },
    origen: "astraura",
    gobierno: "jerarquico",
    personalidad: {
      calidez: 0.5,
      energia: 0.5,
      formalidad: 0.5,
      curiosidad: 0.5,
      humor: 0.5,
      concision: 0.5,
    },
    cuerpo: {
      forma: "orbe",
      tono: 0,
      escala: 1,
    },
    sentidosHabilitados: ["pantalla", "captura-pantalla", "camara", "archivos", "red", "microfono"],
    activo: true,
    ...overrides,
  };
}

// Helper to create mock consentimientos
function crearMockConsentimientos(
  overrides: Partial<ConsentimientoSentido>[] = [],
): ConsentimientoSentido[] {
  const base: ConsentimientoSentido = {
    botId: "bot-1",
    sentido: "pantalla",
    cuentaId: "cuenta-1",
    vence: Date.now() + 3600000, // 1 hour from now
    expreso: false,
  };
  return overrides.map((override) => ({ ...base, ...override }));
}

// Helper to create mock personal fragments
function crearMockPersonales(
  overrides: Partial<FragmentoMemoria>[] = [],
): FragmentoMemoria[] {
  const base: FragmentoMemoria = {
    id: "frag-1",
    alcance: "personal",
    texto: "Este es un fragmento personal de prueba.",
    origen: "test",
    at: Date.now(),
    etiquetas: [],
  };
  return overrides.map((override) => ({ ...base, ...override }));
}

describe("crearPuenteSentidos", () => {
  test("devuelve error cuando el bot no está activo", async () => {
    const bot = crearMockBot({ activo: false });
    const dep = {
      pantalla: {
        scanScreen: jest.fn(),
        formatScanSummary: jest.fn(),
      },
      "captura-pantalla": jest.fn(),
      camara: jest.fn(),
      archivos: jest.fn(),
      red: jest.fn(),
      microfono: jest.fn(),
    };
    const puente = crearPuenteSentidos(dep);
    const ctx = {
      cuentaId: "cuenta-1",
      sesion: "privada",
      medio: "web",
      consentimientos: [],
      ahora: Date.now(),
      personales: [],
    };

    const resultado = await puente.percibir(bot, "pantalla", ctx);

    expect(resultado).toEqual({
      ok: false,
      motivo: "«Bot de prueba» está en pausa.",
    });
  });

  test("devuelve error cuando el sentido no está habilitado por el dueño", async () => {
    const bot = crearMockBot({ sentidosHabilitados: [] });
    const dep = {
      pantalla: {
        scanScreen: jest.fn(),
        formatScanSummary: jest.fn(),
      },
      "captura-pantalla": jest.fn(),
      camara: jest.fn(),
      archivos: jest.fn(),
      red: jest.fn(),
      microfono: jest.fn(),
    };
    const puente = crearPuenteSentidos(dep);
    const ctx = {
      cuentaId: "cuenta-1",
      sesion: "privada",
      medio: "web",
      consentimientos: [],
      ahora: Date.now(),
      personales: [],
    };

    const resultado = await puente.percibir(bot, "pantalla", ctx);

    expect(resultado).toEqual({
      ok: false,
      motivo: "Quien administra «Bot de prueba» no le habilitó «pantalla».",
    });
  });

  test("devuelve percepción exitosa para el sentido pantalla", async () => {
    const bot = crearMockBot();
    const elementosMock: ScreenElement[] = [
      { id: 1, label: "Botón", kind: "boton", el: {} as HTMLElement, rect: { top: 0, left: 0, width: 10, height: 10 } },
    ];
    const dep = {
      pantalla: {
        scanScreen: jest.fn().mockReturnValue(elementosMock),
        formatScanSummary: jest.fn().mockReturnValue("1 Botón"),
      },
      "captura-pantalla": jest.fn(),
      camara: jest.fn(),
      archivos: jest.fn(),
      red: jest.fn(),
      microfono: jest.fn(),
    };
    const puente = crearPuenteSentidos(dep);
    const ctx = {
      cuentaId: "cuenta-1",
      sesion: "privada",
      medio: "web",
      consentimientos: crearMockConsentimientos([
        { ...crearMockConsentimientos()[0], sentido: "pantalla" },
      ]),
      ahora: Date.now(),
      personales: [],
    };

    const resultado = await puente.percibir(bot, "pantalla", ctx);

    expect(resultado).toEqual({ ok: true, texto: "1 Botón" });
    expect(dep.pantalla.scanScreen).toHaveBeenCalled();
    expect(dep.pantalla.formatScanSummary).toHaveBeenCalledWith(elementosMock);
  });

  test("devuelve percepción exitosa para el sentido captura-pantalla", async () => {
    const bot = crearMockBot();
    const dep = {
      pantalla: {
        scanScreen: jest.fn(),
        formatScanSummary: jest.fn(),
      },
      "captura-pantalla": jest.fn().mockResolvedValue("Descripción de la pantalla"),
      camara: jest.fn(),
      archivos: jest.fn(),
      red: jest.fn(),
      microfono: jest.fn(),
    };
    const puente = crearPuenteSentidos(dep);
    const ctx = {
      cuentaId: "cuenta-1",
      sesion: "privada",
      medio: "web",
      consentimientos: crearMockConsentimientos([
        { ...crearMockConsentimientos()[0], sentido: "captura-pantalla" },
      ]),
      ahora: Date.now(),
      personales: [],
    };

    const resultado = await puente.percibir(bot, "captura-pantalla", ctx);

    expect(resultado).toEqual({ ok: true, texto: "Descripción de la pantalla" });
    expect(dep["captura-pantalla"]).toHaveBeenCalled();
  });

  test("trunca el texto a 4000 caracteres cuando excede ese límite", async () => {
    const bot = crearMockBot();
    const textoLargo = "a".repeat(5000);
    const dep = {
      pantalla: {
        scanScreen: jest.fn(),
        formatScanSummary: jest.fn(),
      },
      "captura-pantalla": jest.fn().mockResolvedValue(textoLargo),
      camara: jest.fn(),
      archivos: jest.fn(),
      red: jest.fn(),
      microfono: jest.fn(),
    };
    const puente = crearPuenteSentidos(dep);
    const ctx = {
      cuentaId: "cuenta-1",
      sesion: "privada",
      medio: "web",
      consentimientos: crearMockConsentimientos([
        { ...crearMockConsentimientos()[0], sentido: "captura-pantalla" },
      ]),
      ahora: Date.now(),
      personales: [],
    };

    const resultado = await puente.percibir(bot, "captura-pantalla", ctx);

    expect(resultado).toEqual({ ok: true, texto: textoLargo.slice(0, 4000) });
  });

  test("detecta fuga de memoria personal y devuelve error para bot invitado", async () => {
    const bot = crearMockBot({ origen: "ag-ui" }); // invitado
    const dep = {
      pantalla: {
        scanScreen: jest.fn(),
        formatScanSummary: jest.fn(),
      },
      "captura-pantalla": jest.fn().mockResolvedValue("Este es un fragmento personal de prueba. Más texto."),
      camara: jest.fn(),
      archivos: jest.fn(),
      red: jest.fn(),
      microfono: jest.fn(),
    };
    const puente = crearPuenteSentidos(dep);
    const personales: FragmentoMemoria[] = [{
      id: "frag-1",
      alcance: "personal",
      texto: "Este es un fragmento personal de prueba.",
      origen: "test",
      at: Date.now(),
      etiquetas: [],
    }];
    const ctx = {
      cuentaId: "cuenta-1",
      sesion: "privada",
      medio: "web",
      consentimientos: crearMockConsentimientos([
        { ...crearMockConsentimientos()[0], sentido: "captura-pantalla" },
      ]),
      ahora: Date.now(),
      personales,
    };

    const resultado = await puente.percibir(bot, "captura-pantalla", ctx);

    expect(resultado).toEqual({ ok: false, motivo: "Fuga de memoria personal detectada." });
  });

  test("devuelve error para sentido no implementado", async () => {
    const bot = crearMockBot();
    const dep = {
      pantalla: {
        scanScreen: jest.fn(),
        formatScanSummary: jest.fn(),
      },
      "captura-pantalla": jest.fn(),
      camara: jest.fn(),
      archivos: jest.fn(),
      red: jest.fn(),
      microfono: jest.fn(),
    };
    const puente = crearPuenteSentidos(dep);
    const ctx = {
      cuentaId: "cuenta-1",
      sesion: "privada",
      medio: "web",
      consentimientos: [],
      ahora: Date.now(),
      personales: [],
    };

    const resultado = await puente.percibir(bot, "terminal", ctx);

    expect(resultado).toEqual({ ok: false, motivo: "próximamente: sentido terminal no implementado" });
  });

  test("maneja error lanzado por la dependencia de archivos", async () => {
    const bot = crearMockBot();
    const dep = {
      pantalla: {
        scanScreen: jest.fn(),
        formatScanSummary: jest.fn(),
      },
      "captura-pantalla": jest.fn(),
      camara: jest.fn(),
      archivos: jest.fn().mockRejectedValue(new Error("Error de acceso a archivos")),
      red: jest.fn(),
      microfono: jest.fn(),
    };
    const puente = crearPuenteSentidos(dep);
    const ctx = {
      cuentaId: "cuenta-1",
      sesion: "privada",
      medio: "web",
      consentimientos: crearMockConsentimientos([
        { ...crearMockConsentimientos()[0], sentido: "archivos" },
      ]),
      ahora: Date.now(),
      personales: [],
    };

    const resultado = await puente.percibir(bot, "archivos", ctx);

    expect(resultado).toEqual({ ok: false, motivo: "Error de acceso a archivos" });
  });
});