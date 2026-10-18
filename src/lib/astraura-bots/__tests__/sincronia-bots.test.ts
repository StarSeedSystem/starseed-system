import { describe, test, expect, vi } from 'vitest';
import { fusionarBots, suscribirBotsEntidad, abiertosEnEstaNeurona, marcarAbierto } from "../sincronia-bots";

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

describe("fusionarBots", () => {
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
  test("devuelve una función de desuscripción y llama al callback con cambios", () => {
    const entidades = ["perfil-1", "perfil-2"];
    const callback = vi.fn();
    let capturedCallback: ((p: any) => void) | null = null;
    let mockChannel = {};
    const mockSupabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((eventName: string, filter: any, cb: (p: any) => void) => {
          capturedCallback = cb;
          return { subscribe: vi.fn().mockReturnValue(mockChannel) };
        })
      }),
      removeChannel: vi.fn()
    };

    const unsubscribe = suscribirBotsEntidad(entidades, callback, mockSupabase as any);

    expect(mockSupabase.channel).toHaveBeenCalledWith("astraura-bots-realtime");
    expect(unsubscribe).toBeInstanceOf(Function);
    // Simular una llamada al canal
    const channelMock = mockSupabase.channel.mock.results[0].value;
    // We don't have the filter from the mock, but we can check the call to on
    const onCall = mockSupabase.channel.mock.results[0].value.on.mock.calls[0];
    expect(onCall[0]).toBe("postgres_changes");
    expect(onCall[1].event).toBe("*");
    expect(onCall[1].schema).toBe("public");
    expect(onCall[1].table).toBe("astraura_bots");
    expect(capturedCallback).toBeInstanceOf(Function);
    // Simular un mensaje de inserción
    const mockPayload = {
      eventType: "INSERT",
      nuevo: {
        id: "bot1",
        nombre: "Bot 1",
        dueno: {
          tipo: "grupo",
          id: "perfil-1",
          cuentaId: "cuenta-1"
        },
        origen: "astraura",
        gobierno: "jerarquico",
        personalidad: {},
        cuerpo: {},
        sentidosHabilitados: [],
        activo: true,
        actualizado: Date.now()
      },
      viejo: null,
      error: null
    };
    capturedCallback!(mockPayload);
    expect(callback).toHaveBeenCalledWith({
      t: "INSERT",
      r: mockPayload.nuevo,
      a: null
    });
    // Llamar a la desuscripción
    unsubscribe();
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  test("ignora cambios cuando el dueno no está en la lista de entidades", () => {
    const entidades = ["perfil-1"];
    const callback = vi.fn();
    let capturedCallback: ((p: any) => void) | null = null;
    let mockChannel = {};
    const mockSupabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((eventName: string, filter: any, cb: (p: any) => void) => {
          capturedCallback = cb;
          return { subscribe: vi.fn().mockReturnValue(mockChannel) };
        })
      }),
      removeChannel: vi.fn()
    };

    suscribirBotsEntidad(entidades, callback, mockSupabase as any);
    const channelMock = mockSupabase.channel.mock.results[0].value;
    // Simular un mensaje con dueno no en la lista
    const mockPayload = {
      eventType: "INSERT",
      nuevo: {
        id: "bot1",
        nombre: "Bot 1",
        dueno: {
          tipo: "grupo",
          id: "perfil-3", // no en entidades
          cuentaId: "cuenta-3"
        },
        origen: "astraura",
        gobierno: "jerarquico",
        personalidad: {},
        cuerpo: {},
        sentidosHabilitados: [],
        activo: true,
        actualizado: Date.now()
      },
      viejo: null,
      error: null
    };
    capturedCallback!(mockPayload);
    expect(callback).not.toHaveBeenCalled();
  });

  test("ignora cambios cuando el tipo de dueno no es grupo, comunidad o pagina", () => {
    const entidades = ["perfil-1"];
    const callback = vi.fn();
    let capturedCallback: ((p: any) => void) | null = null;
    let mockChannel = {};
    const mockSupabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((eventName: string, filter: any, cb: (p: any) => void) => {
          capturedCallback = cb;
          return { subscribe: vi.fn().mockReturnValue(mockChannel) };
        })
      }),
      removeChannel: vi.fn()
    };

    suscribirBotsEntidad(entidades, callback, mockSupabase as any);
    const channelMock = mockSupabase.channel.mock.results[0].value;
    // Simular un mensaje con tipo de dueno "perfil" (no permitido)
    const mockPayload = {
      eventType: "INSERT",
      nuevo: {
        id: "bot1",
        nombre: "Bot 1",
        dueno: {
          tipo: "perfil", // no permitido
          id: "perfil-1",
          cuentaId: "cuenta-1"
        },
        origen: "astraura",
        gobierno: "jerarquico",
        personalidad: {},
        cuerpo: {},
        sentidosHabilitados: [],
        activo: true,
        actualizado: Date.now()
      },
      viejo: null,
      error: null
    };
    capturedCallback!(mockPayload);
    expect(callback).not.toHaveBeenCalled();
  });

  test("maneja error de supabase mostrando warning una sola vez", () => {
    const entidades = ["perfil-1"];
    const callback = vi.fn();
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let capturedCallback: ((p: any) => void) | null = null;
    let mockChannel = {};
    const mockSupabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((eventName: string, filter: any, cb: (p: any) => void) => {
          capturedCallback = cb;
          return { subscribe: vi.fn().mockReturnValue(mockChannel) };
        })
      }),
      removeChannel: vi.fn()
    };

    suscribirBotsEntidad(entidades, callback, mockSupabase as any);
    const channelMock = mockSupabase.channel.mock.results[0].value;
    // Simular dos mensajes de error
    const mockPayloadError = {
      eventType: "INSERT",
      nuevo: null,
      viejo: null,
      error: { message: "error" }
    };
    capturedCallback!(mockPayloadError);
    capturedCallback!(mockPayloadError);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});

describe("abiertosEnEstaNeurona", () => {
  test("devuelve array vacío cuando no hay almacenamiento", () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    };
    const resultado = abiertosEnEstaNeurona(mockStorage as any);
    expect(resultado).toEqual([]);
    expect(mockStorage.getItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1");
  });

  test("devuelve array parseado cuando el almacenamiento contiene JSON válido", () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue('["orbe1", "orbe2"]'),
      setItem: vi.fn()
    };
    const resultado = abiertosEnEstaNeurona(mockStorage as any);
    expect(resultado).toEqual(["orbe1", "orbe2"]);
    expect(mockStorage.getItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1");
  });

  test("devuelve array vacío cuando el almacenamiento contiene JSON inválido", () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue('invalid json'),
      setItem: vi.fn()
    };
    const resultado = abiertosEnEstaNeurona(mockStorage as any);
    expect(resultado).toEqual([]);
    expect(mockStorage.getItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1");
  });

  test("devuelve array vacío cuando el almacenamiento contiene un valor no array", () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue('{"not": "an array"}'),
      setItem: vi.fn()
    };
    const resultado = abiertosEnEstaNeurona(mockStorage as any);
    expect(resultado).toEqual([]);
    expect(mockStorage.getItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1");
  });
});

describe("marcarAbierto", () => {
  test("añade un orbe cuando no estaba presente", () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue('["orbe1"]'),
      setItem: vi.fn()
    };
    marcarAbierto(mockStorage as any, "orbe2", true);
    expect(mockStorage.getItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1");
    expect(mockStorage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", '["orbe1","orbe2"]');
  });

  test("elimina un orbe cuando estaba presente", () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue('["orbe1", "orbe2"]'),
      setItem: vi.fn()
    };
    marcarAbierto(mockStorage as any, "orbe1", false);
    expect(mockStorage.getItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1");
    expect(mockStorage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", '["orbe2"]');
  });

  test("no duplica el orbe al añadir", () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue('["orbe1"]'),
      setItem: vi.fn()
    };
    marcarAbierto(mockStorage as any, "orbe1", true);
    expect(mockStorage.getItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1");
    expect(mockStorage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", '["orbe1"]');
  });

  test("no elimina un orbe que no estaba presente", () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue('["orbe1"]'),
      setItem: vi.fn()
    };
    marcarAbierto(mockStorage as any, "orbe2", false);
    expect(mockStorage.getItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1");
    expect(mockStorage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", '["orbe1"]');
  });

  test("maneja almacenamiento vacío", () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    };
    marcarAbierto(mockStorage as any, "orbe1", true);
    expect(mockStorage.getItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1");
    expect(mockStorage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", '["orbe1"]');
  });

  test("maneja JSON corrupto en almacenamiento", () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue('corrupt'),
      setItem: vi.fn()
    };
    marcarAbierto(mockStorage as any, "orbe1", true);
    expect(mockStorage.getItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1");
    expect(mockStorage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", '["orbe1"]');
  });
});