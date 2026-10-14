import { crearAlmacenConsentimientos } from "../adaptadores/consentimientos";
import { type ConsentimientoSentido, type Sentido } from "../tipos";
import { decidirSentido } from "../permisos";
import { type Bot, type TipoSesion, type Medio } from "../tipos";
import { describe, test, expect } from "vitest";
import { vi } from "vitest";

describe("consentimientos adapter", () => {
  const ahora = 1000000; // fixed timestamp for testing
  const botId = "bot1";
  const sentido: Sentido = "pantalla";
  const cuentaId = "user1";

  // Helper to create a mock bot
  const crearBot = (invitado = false): Bot => ({
    id: botId,
    nombre: "Test Bot",
    dueno: {
      tipo: "perfil",
      id: "profile1",
      cuentaId: "user1",
    },
    origen: invitado ? "ag-ui" : "astraura",
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
    sentidosHabilitados: ["pantalla"],
    activo: true,
  });

  test("otorgar with sesion duration sets correct expiration", () => {
    const escribir = vi.fn();
    const almacen = crearAlmacenConsentimientos({
      leer: () => [],
      escribir,
    });

    almacen.otorgar(
      { botId, sentido, cuentaId, duracion: "sesion", expreso: true },
      ahora
    );

    expect(escribir).toHaveBeenCalled();
    const argumento = escribir.mock.calls[0][0] as ConsentimientoSentido[];
    expect(argumento.length).toBe(1);
    const cs = argumento[0];
    expect(cs.botId).toBe(botId);
    expect(cs.sentido).toBe(sentido);
    expect(cs.cuentaId).toBe(cuentaId);
    expect(cs.vence).toBe(ahora + 60 * 60 * 1000); // 1 hour later
    expect(cs.expreso).toBe(true);
  });

  test("otorgar with hoy duration sets correct expiration", () => {
    const escribir = vi.fn();
    const almacen = crearAlmacenConsentimientos({
      leer: () => [],
      escribir,
    });

    almacen.otorgar(
      { botId, sentido, cuentaId, duracion: "hoy" },
      ahora
    );

    const argumento = escribir.mock.calls[0][0] as ConsentimientoSentido[];
    const cs = argumento[0];
    expect(cs.vence).toBe(ahora + 24 * 60 * 60 * 1000); // 24 hours later
  });

  test("otorgar with siempre duration sets vence to null", () => {
    const escribir = vi.fn();
    const almacen = crearAlmacenConsentimientos({
      leer: () => [],
      escribir,
    });

    almacen.otorgar(
      { botId, sentido, cuentaId, duracion: "siempre" },
      ahora
    );

    const argumento = escribir.mock.calls[0][0] as ConsentimientoSentido[];
    const cs = argumento[0];
    expect(cs.vence).toBeNull();
  });

  test("invitado bot gets duration capped to 1 hour", () => {
    const escribir = vi.fn();
    const almacen = crearAlmacenConsentimientos({
      leer: () => [],
      escribir,
    });
    const botInvitado = crearBot(true);

    // Try to grant "siempre" to an invited bot
    almacen.otorgar(
      { botId, sentido, cuentaId, duracion: "siempre" },
      ahora,
      botInvitado
    );

    const argumento = escribir.mock.calls[0][0] as ConsentimientoSentido[];
    const cs = argumento[0];
    expect(cs.vence).toBe(ahora + 60 * 60 * 1000); // capped to 1 hour
  });

  test("revocar removes a specific consent", () => {
    const escribir = vi.fn();
    const leerMock = vi.fn()
      .mockReturnValueOnce([
        { botId, sentido, cuentaId, vence: ahora + 1000, expreso: false },
        { botId: "bot2", sentido, cuentaId, vence: ahora + 1000, expreso: false },
      ]);
    const almacen = crearAlmacenConsentimientos({
      leer: leerMock,
      escribir,
    });

    almacen.revocar(botId, sentido, cuentaId);

    expect(escribir).toHaveBeenCalled();
    const argumento = escribir.mock.calls[0][0] as ConsentimientoSentido[];
    expect(argumento.length).toBe(1);
    expect(argumento[0].botId).toBe("bot2");
  });

  test("revocarTodo removes all consents for a bot", () => {
    const escribir = vi.fn();
    const leerMock = vi.fn()
      .mockReturnValueOnce([
        { botId, sentido: "pantalla", cuentaId, vence: ahora + 1000, expreso: false },
        { botId, sentido: "microfono", cuentaId, vence: ahora + 2000, expreso: true },
        { botId: "bot2", sentido: "pantalla", cuentaId, vence: ahora + 3000, expreso: false },
      ]);
    const almacen = crearAlmacenConsentimientos({
      leer: leerMock,
      escribir,
    });

    almacen.revocarTodo(botId);

    expect(escribir).toHaveBeenCalled();
    const argumento = escribir.mock.calls[0][0] as ConsentimientoSentido[];
    expect(argumento.length).toBe(1); // only bot2 remains
    expect(argumento[0].botId).toBe("bot2");
  });

  test("vigentes removes expired consents and returns valid ones", () => {
    const escribir = vi.fn();
    const leerMock = vi.fn()
      .mockReturnValueOnce([
        { botId, sentido, cuentaId, vence: ahora - 1000, expreso: false }, // expired
        { botId, sentido: "microfono", cuentaId, vence: ahora + 1000, expreso: true }, // valid
      ]);
    const almacen = crearAlmacenConsentimientos({
      leer: leerMock,
      escribir,
    });

    const resultado = almacen.vigentes(ahora);

    expect(escribir).toHaveBeenCalled();
    const argumentoEscrito = escribir.mock.calls[0][0] as ConsentimientoSentido[];
    expect(argumentoEscrito.length).toBe(1);
    expect(argumentoEscrito[0].sentido).toBe("microfono");

    expect(resultado.length).toBe(1);
    expect(resultado[0].sentido).toBe("microfono");
  });

  test("listaPara returns consents for a botId", () => {
    const leerMock = vi.fn()
      .mockReturnValueOnce([
        { botId, sentido, cuentaId, vence: ahora + 1000, expreso: false },
        { botId: "bot2", sentido, cuentaId, vence: ahora + 1000, expreso: false },
      ]);
    const almacen = crearAlmacenConsentimientos({
      leer: leerMock,
      escribir: vi.fn(),
    });

    const resultado = almacen.listaPara(botId);

    expect(resultado.length).toBe(1);
    expect(resultado[0].botId).toBe(botId);
  });

    test("consentimiento from almacen feeds decidirSentido and allows it", () => {
      let stored: ConsentimientoSentido[] = [];
      const almacen = crearAlmacenConsentimientos({
        leer: () => stored,
        escribir: (cs: ConsentimientoSentido[]) => { stored = cs; },
      });

      // Grant consent
      almacen.otorgar(
        { botId, sentido, cuentaId, duracion: "sesion" },
        ahora
      );

      // Get current consents
      const consents = almacen.vigentes(ahora);

      // Create a mock bot (not invitado)
      const bot = crearBot(false);

      // Create a petition for decidirSentido
      const peticion = {
        bot,
        sentido,
        cuentaId,
        sesion: "privada" as TipoSesion,
        medio: "web" as Medio,
        consentimientos: consents,
        ahora,
      };

      const decision = decidirSentido(peticion);
      expect(decision.permitido).toBe(true);
      // The motivo should mention consentimiento
      expect(decision.motivo).toContain("Permitido");
    });

    test("revoked consent leads to denial in decidirSentido", () => {
      let stored: ConsentimientoSentido[] = [];
      const almacen = crearAlmacenConsentimientos({
        leer: () => stored,
        escribir: (cs: ConsentimientoSentido[]) => { stored = cs; },
      });

      // Grant consent
      almacen.otorgar(
        { botId, sentido, cuentaId, duracion: "sesion" },
        ahora
      );

      // Revoke it
      almacen.revocar(botId, sentido, cuentaId);

      // Get current consents (should be empty after revocar and vigentes? but we haven't called vigentes)
      // We'll call vigentes to purge and get the current list
      const consents = almacen.vigentes(ahora); // should be empty

      const bot = crearBot(false);
      const peticion = {
        bot,
        sentido,
        cuentaId,
        sesion: "privada" as TipoSesion,
        medio: "web" as Medio,
        consentimientos: consents,
        ahora,
      };

      const decision = decidirSentido(peticion);
      expect(decision.permitido).toBe(false);
      expect(decision.requiere).toBe("consentimiento");
    });
});