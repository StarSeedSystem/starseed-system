import { describe, test, expect, vi } from 'vitest';
import { fusionarBots, suscribirBotsEntidad, abiertosEnEstaNeurona, marcarAbierto, type BotSync } from "../sincronia-bots";

const mockStorage = {
  getItem: vi.fn(),
  setItem: vi.fn()
};

const mockChannel = {};
const mockSupabaseClient = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn()
};

describe("fusionarBots", () => {
  /**
   * Bot de ejemplo para pruebas (incluye el campo actualizado para sincronía).
   * @param id Id único del bot.
   * @param actualizado Marca de tiempo de última actualización.
   */
  function hacerBot(id: string, actualizado: number): any {
    return {
      id,
      nombre: `Bot ${id}`,
      dueno: {
        tipo: "perfil",
        id: `perfil-${id}`,
        cuentaId: `cuenta-${id}`
      },
      origen: "astraura",
      gobierno: "jerarquico",
      personalidad: {
        calidez: 0.5,
        energia: 0.5,
        formalidad: 0.5,
        curiosidad: 0.5,
        humor: 0.5,
        concision: 0.5
      },
      cuerpo: {
        forma: "orbe",
        tono: 200,
        escala: 1
      },
      sentidosHabilitados: ["pantalla", "red"],
      activo: true,
      actualizado // Marca de tiempo para fusión
    };
  }

  /**
   * Bot inválido (falta el campo `nombre`).
   */
  function hacerBotInvalido(): any {
    return {
      id: "bot-invalido",
      // nombre faltante a propósito
      dueno: {
        tipo: "perfil",
        id: "perfil-invalido",
        cuentaId: "cuenta-invalido"
      },
      origen: "astraura",
      gobierno: "jerarquico",
      personalidad: {
        calidez: 0.5,
        energia: 0.5,
        formalidad: 0.5,
        curiosidad: 0.5,
        humor: 0.5,
        concision: 0.5
      },
      cuerpo: {
        forma: "orbe",
        tono: 200,
        escala: 1
      },
      sentidosHabilitados: ["pantalla", "red"],
      activo: true,
      actualizado: Date.now()
    };
  }

  test("gana el más reciente por actualizado", () => {
    const local: any[] = [
      hacerBot("bot1", 1000), // más antiguo
      hacerBot("bot2", 2000)
    ];
    const remoto: any[] = [
      hacerBot("bot1", 2000), // más reciente
      hacerBot("bot3", 1500)
    ];
    const resultado = fusionarBots(local, remoto);
    // Orden no garantizado, pero verificamos contenido
    const ids = resultado.map(b => b.id).sort();
    expect(ids).toEqual(["bot1", "bot2", "bot3"]);
    // bot1 debe venir del remoto (más reciente)
    const bot1 = resultado.find(b => b.id === "bot1");
    expect(bot1?.actualizado).toBe(2000);
  });

  test("predeterminado garantizado: se conserva el local si no está en remoto", () => {
    const local: any[] = [hacerBot("bot-default", 1000)];
    const remoto: any[] = [];
    const resultado = fusionarBots(local, remoto);
    expect(resultado.length).toBe(1);
    expect(resultado[0].id).toBe("bot-default");
    expect(resultado[0].actualizado).toBe(1000);
  });

  test("borrado remoto no propaga: se conserva el local ausente en remoto", () => {
    const local: any[] = [hacerBot("bot-local", 1000)];
    const remoto: any[] = [hacerBot("bot-remoto", 2000)]; // otro bot
    const resultado = fusionarBots(local, remoto);
    const ids = resultado.map(b => b.id).sort();
    expect(ids).toEqual(["bot-local", "bot-remoto"]);
    // Ambos deben estar presentes
    expect(resultado.some(b => b.id === "bot-local" && b.actualizado === 1000)).toBe(true);
    expect(resultado.some(b => b.id === "bot-remoto" && b.actualizado === 2000)).toBe(true);
  });

  test("ids nuevos de ambos lados: se incluyen bots exclusivos de cada lado", () => {
    const local: any[] = [hacerBot("local-only", 1000)];
    const remoto: any[] = [hacerBot("remoto-only", 2000)];
    const resultado = fusionarBots(local, remoto);
    const ids = resultado.map(b => b.id).sort();
    expect(ids).toEqual(["local-only", "remoto-only"]);
  });

  test("determinismo: misma entrada produce misma salida", () => {
    const local: any[] = [
      hacerBot("A", 100),
      hacerBot("B", 200)
    ];
    const remoto: any[] = [
      hacerBot("A", 150), // gana remoto
      hacerBot("C", 50)
    ];
    const resultado1 = fusionarBots(local, remoto);
    const resultado2 = fusionarBots(local, remoto);
    // Ordenar por id para comparación estable
    const ordenado1 = [...resultado1].sort((a, b) => a.id.localeCompare(b.id));
    const ordenado2 = [...resultado2].sort((a, b) => a.id.localeCompare(b.id));
    expect(ordenado1).toEqual(ordenado2);
  });

  test("basura del remoto descartada: se ignoran bots no válidos", () => {
    const local: any[] = [hacerBot("bot-valido", 1000)];
    const remoto: any[] = [
      hacerBotInvalido(), // inválido: falta nombre
      hacerBot("bot-remoto-valido", 2000) // válido
    ];
    const resultado = fusionarBots(local, remoto);
    const ids = resultado.map(b => b.id).sort();
    const expected = ["bot-valido", "bot-remoto-valido"].sort();
    expect(ids).toEqual(expected);
    // El bot inválido no debe aparecer
    expect(resultado.length).toBe(2);
  });

  test("no se pierde el predeterminado por fusión (caso remoto más reciente)", () => {
    const local: any[] = [hacerBot("predeterminado", 1000)]; // id especial para predeterminado
    const remoto: any[] = [hacerBot("predeterminado", 2000)]; // más reciente
    const resultado = fusionarBots(local, remoto);
    expect(resultado.length).toBe(1);
    expect(resultado[0].id).toBe("predeterminado");
    // Debe ganar el remoto por ser más reciente
    expect(resultado[0].actualizado).toBe(2000);
  });

  test("array vacío local y remoto devuelve array vacío", () => {
    const resultado = fusionarBots([], []);
    expect(resultado).toEqual([]);
  });

  test("local vacío, remoto con bots válidos devuelve los remotos", () => {
    const local: any[] = [];
    const remoto: any[] = [hacerBot("A", 1000), hacerBot("B", 2000)];
    const resultado = fusionarBots(local, remoto);
    const ids = resultado.map(b => b.id).sort();
    expect(ids).toEqual(["A", "B"]);
  });

  test("remoto vacío, local con bots devuelve los locales", () => {
    const local: any[] = [hacerBot("A", 1000), hacerBot("B", 2000)];
    const remoto: any[] = [];
    const resultado = fusionarBots(local, remoto);
    const ids = resultado.map(b => b.id).sort();
    expect(ids).toEqual(["A", "B"]);
  });
});

describe("suscribirBotsEntidad", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  test("debe llamar al canal y suscribirse", () => {
    const e = ["entidad1"];
    const callback = vi.fn();
    const s = mockSupabaseClient;

    suscribirBotsEntidad(e, callback);

    expect(s.channel).toHaveBeenCalledWith("astraura-bots-realtime", {
      event: "*",
      schema: "public",
      table: "astraura_bots"
    });
    // The on method should have been called
    expect(s.channel.mock.results[0].value.on).toHaveBeenCalledWith({
      event: "*",
      schema: "public",
      table: "astraura_bots"
    }, expect.any(Function));
  });

  test("debe llamar al callback cuando hay un cambio", () => {
    const e = ["entidad1"];
    const callback = vi.fn();
    const s = mockSupabaseClient;

    const unsubscribe = suscribirBotsEntidad(e, callback);

    // Simulate a change
    const channelMock = s.channel.mock.results[0].value;
    const onMock = channelMock.on.mock.results[0].value;
    const subscribeMock = onMock.subscribe.mock.results[0].value;
    // Call the callback that was passed to on
    subscribeMock({
      error: null,
      nuevo: { id: "bot1", actualizado: 1000, nombre: "Bot 1", dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" }, origen: "astraura", gobierno: "jerarquico", personalidad: {}, cuerpo: {}, sentidosHabilitados: [], activo: true },
      viejo: null
    });

    expect(callback).toHaveBeenCalledWith({
      t: "INSERT",
      r: { id: "bot1", actualizado: 1000, nombre: "Bot 1", dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" }, origen: "astraura", gobierno: "jerarquico", personalidad: {}, cuerpo: {}, sentidosHabilitados: [], activo: true },
      a: null
    });
  });

  test("debe no llamar al callback si hay un error", () => {
    const e = ["entidad1"];
    const callback = vi.fn();
    const s = mockSupabaseClient;

    const unsubscribe = suscribirBotsEntidad(e, callback);

    // Simulate an error
    const channelMock = s.channel.mock.results[0].value;
    const onMock = channelMock.on.mock.results[0].value;
    const subscribeMock = onMock.subscribe.mock.results[0].value;
    subscribeMock({
      error: new Error("Error"),
      nuevo: null,
      viejo: null
    });

    expect(callback).not.toHaveBeenCalled();
  });

  test("debe devolver una función de desuscripción que llame a removeChannel", () => {
    const e = ["entidad1"];
    const callback = vi.fn();
    const s = mockSupabaseClient;

    const unsubscribe = suscribirBotsEntidad(e, callback);
    unsubscribe();

    expect(s.removeChannel).toHaveBeenCalledWith(mockChannel);
  });
});

describe("abiertosEnEstaNeurona", () => {
  // tests will be added here
});

describe("marcarAbierto", () => {
  // tests will be added here
});