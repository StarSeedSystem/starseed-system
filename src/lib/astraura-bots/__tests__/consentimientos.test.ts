import { describe, it, expect, afterEach } from "vitest";
import { crearAlmacenConsentimientos } from "../adaptadores/consentimientos";
import { decidirSentido, type PeticionSentido } from "../permisos";
import type { Bot, ConsentimientoSentido, Sentido, TipoDueno, Gobierno, OrigenBot, Personalidad, Cuerpo, TipoSesion, Medio } from "../tipos";

// Helper to create a minimal bot for testing
function crearBotParaPrueba(
  overrides: Partial<Bot> = {}
): Bot {
  return {
    id: "bot-1",
    nombre: "Bot de prueba",
    dueno: {
      tipo: "perfil" as TipoDueno,
      id: "perfil-1",
      cuentaId: "cuenta-1",
    },
    origen: "astraura" as OrigenBot,
    gobierno: "jerarquico" as Gobierno,
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
    sentidosHabilitados: ["pantalla", "red"], // habilitamos solo algunos para la prueba
    activo: true,
    ...overrides,
  };
}

// Helper to create a minimal peticionSentido for decidirSentido
function crearPeticionSentidoBase(
  bot: Bot,
  sentido: Sentido,
  cuentaId: string,
  ahora: number
): PeticionSentido {
  return {
    bot,
    sentido,
    cuentaId,
    sesion: "privada" as TipoSesion,
    medio: "web" as Medio,
    consentimientos: [],
    ahora,
  };
}

describe("Almacén de consentimientos (en memoria)", () => {
  const ahora = 1000000000000; // timestamp fijo para pruebas

  // IO en memoria
  let almacenamiento: ConsentimientoSentido[] = [];
  const io = {
    leer: () => [...almacenamiento],
    escribir: (cs: ConsentimientoSentido[]) => {
      almacenamiento = [...cs];
    },
    remoto: {
      subir: async () => Promise.resolve(),
      borrar: async () => Promise.resolve(),
    },
  };

  const almacen = crearAlmacenConsentimientos(io);

  afterEach(() => {
    almacenamiento = [];
  });

  describe("otorgar", () => {
    it("should set correct expiration for 'sesion'", () => {
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora
      );
      const cs = io.leer()[0];
      expect(cs.vence).toBe(ahora + 60 * 60 * 1000); // 1 hora
    });

    it("should set correct expiration for 'hoy'", () => {
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "hoy" },
        ahora
      );
      const cs = io.leer()[0];
      expect(cs.vence).toBe(ahora + 24 * 60 * 60 * 1000); // 24 horas
    });

    it("should set null expiration for 'siempre'", () => {
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "siempre" },
        ahora
      );
      const cs = io.leer()[0];
      expect(cs.vence).toBeNull();
    });

    it("should set expreso flag when provided", () => {
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion", expreso: true },
        ahora
      );
      const cs = io.leer()[0];
      expect(cs.expreso).toBe(true);
    });

    it("should replace existing consentimiento for same botId, sentido, cuentaId", () => {
      // First grant
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora
      );
      // Second grant with different expiration (hoy)
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "hoy" },
        ahora
      );
      const cs = io.leer();
      expect(cs.length).toBe(1);
      expect(cs[0].vence).toBe(ahora + 24 * 60 * 60 * 1000);
    });
  });

  describe("revocar", () => {
    it("should remove the specific consentimiento", () => {
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora
      );
      almacen.otorgar(
        { botId: "bot-1", sentido: "red", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora
      );

      almacen.revocar("bot-1", "pantalla", "cuenta-1");
      const cs = io.leer();
      expect(cs.length).toBe(1);
      expect(cs[0].sentido).toBe("red");
    });

    it("should do nothing if consentimiento does not exist", () => {
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora
      );
      almacen.revocar("bot-1", "red", "cuenta-1"); // sentido diferente
      const cs = io.leer();
      expect(cs.length).toBe(1);
      expect(cs[0].sentido).toBe("pantalla");
    });
  });

  describe("revocarTodo", () => {
    it("should remove all consentimientos for a botId", () => {
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora
      );
      almacen.otorgar(
        { botId: "bot-1", sentido: "red", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora
      );
      almacen.otorgar(
        { botId: "bot-2", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora
      );

      almacen.revocarTodo("bot-1");
      const cs = io.leer();
      expect(cs.length).toBe(1);
      expect(cs[0].botId).toBe("bot-2");
    });
  });

  describe("vigentes", () => {
    it("should return only non-expired consentimientos and remove expired ones", () => {
      const ahora = 1000000000000;
      // Grant one that expires in the past
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora - 70 * 60 * 1000 // expirado hace 10 minutos
      );
      // Grant one that expires in the future
      almacen.otorgar(
        { botId: "bot-1", sentido: "red", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora + 30 * 60 * 1000 // expira en 30 minutos
      );
      // Grant one that never expires
      almacen.otorgar(
        { botId: "bot-1", sentido: "archivos", cuentaId: "cuenta-1", duracion: "siempre" },
        ahora
      );

      const vigentes = almacen.vigentes(ahora);
      expect(vigentes.length).toBe(2);
      const sentidos = vigentes.map((c) => c.sentido);
      expect(sentidos).toContain("red");
      expect(sentidos).toContain("archivos");

      // Check that storage now only has the non-expired ones
      const almacenActual = io.leer();
      expect(almacenActual.length).toBe(2);
      const almacenSentidos = almacenActual.map((c) => c.sentido);
      expect(almacenSentidos).toContain("red");
      expect(almacenSentidos).toContain("archivos");
    });

    it("should return empty array if all are expired", () => {
      const ahora = 1000000000000;
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora - 70 * 60 * 1000
      );
      const vigentes = almacen.vigentes(ahora);
      expect(vigentes.length).toBe(0);
      expect(io.leer().length).toBe(0);
    });
  });

  describe("listaPara", () => {
    it("should return all consentimientos for a botId (including expired)", () => {
      const ahora = 1000000000000;
      almacen.otorgar(
        { botId: "bot-1", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora - 70 * 60 * 1000 // expirado
      );
      almacen.otorgar(
        { botId: "bot-1", sentido: "red", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora + 30 * 60 * 1000 // válido
      );
      almacen.otorgar(
        { botId: "bot-2", sentido: "pantalla", cuentaId: "cuenta-1", duracion: "sesion" },
        ahora
      );

      const lista = almacen.listaPara("bot-1");
      expect(lista.length).toBe(2);
      const sentidos = lista.map((c) => c.sentido);
      expect(sentidos).toContain("pantalla");
      expect(sentidos).toContain("red");
    });

    it("should return empty array if no consentimientos for botId", () => {
      const lista = almacen.listaPara("bot-inexistente");
      expect(lista.length).toBe(0);
    });
  });

  describe("integración con decidirSentido", () => {
    it("should allow sense when consentimiento is vigente (no invitado)", () => {
      const bot = crearBotParaPrueba({ origen: "astraura" }); // no invitado
      const ahora = 1000000000000;

      // Otorgar consentimiento para pantalla
      almacen.otorgar(
        { botId: bot.id, sentido: "pantalla", cuentaId: bot.dueno.cuentaId, duracion: "sesion" },
        ahora
      );

      const peticion: PeticionSentido = crearPeticionSentidoBase(
        bot,
        "pantalla",
        bot.dueno.cuentaId,
        ahora
      );
      peticion.consentimientos = almacen.vigentes(ahora); // obtener los vigentes del almacen

      const decision = decidirSentido(peticion);
      expect(decision.permitido).toBe(true);
      expect(decision.requiere).toBe("nada");
      expect(decision.indicador).toBe(true); // porque pantalla no es íntimo? pero el indicador se muestra si está activo
    });

    it("should deny sense when consentimiento is revoked", () => {
      const bot = crearBotParaPrueba({ origen: "astraura" });
      const ahora = 1000000000000;

      // Otorgar y luego revocar
      almacen.otorgar(
        { botId: bot.id, sentido: "pantalla", cuentaId: bot.dueno.cuentaId, duracion: "sesion" },
        ahora
      );
      almacen.revocar(bot.id, "pantalla", bot.dueno.cuentaId);

      const peticion: PeticionSentido = crearPeticionSentidoBase(
        bot,
        "pantalla",
        bot.dueno.cuentaId,
        ahora
      );
      peticion.consentimientos = almacen.vigentes(ahora);

      const decision = decidirSentido(peticion);
      expect(decision.permitido).toBe(false);
      expect(decision.requiere).toBe("consentimiento");
    });

    it("should limit invitado to 1 hour even if siempre is granted", () => {
      const bot = crearBotParaPrueba({
        origen: "externo" as OrigenBot, // invitado
      });
      const ahora = 1000000000000;

      // Otorgar consentimiento 'siempre' para pantalla
      almacen.otorgar(
        { botId: bot.id, sentido: "pantalla", cuentaId: bot.dueno.cuentaId, duracion: "siempre" },
        ahora
      );

      // En el momento actual, debería denegarse porque a un invitado nunca se le da más de 1 hora
      let peticion: PeticionSentido = crearPeticionSentidoBase(
        bot,
        "pantalla",
        bot.dueno.cuentaId,
        ahora
      );
      peticion.consentimientos = almacen.vigentes(ahora);
      let decision = decidirSentido(peticion);
      expect(decision.permitido).toBe(false);
      expect(decision.requiere).toBe("consentimiento");

      // Pasado 1 hora y 1 segundo, también debería denegarse
      const ahoraDespues = ahora + 61 * 60 * 1000;
      peticion = crearPeticionSentidoBase(
        bot,
        "pantalla",
        bot.dueno.cuentaId,
        ahoraDespues
      );
      peticion.consentimientos = almacen.vigentes(ahoraDespues); // el almacenamiento todavía tiene el consentimiento (porque es siempre) pero decidirSentido lo rechazará por ser invitado y superar 1 hora
      decision = decidirSentido(peticion);
      expect(decision.permitido).toBe(false);
      expect(decision.requiere).toBe("consentimiento");
    });
  });
});