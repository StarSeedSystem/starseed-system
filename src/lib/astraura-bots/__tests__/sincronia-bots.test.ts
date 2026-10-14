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
  test("should call supabase.channel and subscribe", () => {
    const mockChannel = {
      onCalled: false,
      subscribeCalled: false,
      lastEvent: null,
      on: vi.fn().mockImplementation((event, filter, callback) => {
        mockChannel.lastEvent = { event: "*", filter, callback };
        return mockChannel;
      }),
      subscribe: vi.fn().mockReturnThis(),
      removeChannel: vi.fn()
    };
    const supabase = {
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn()
    };
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn()
    };
    const callback = vi.fn();
    const e = ["grupo1", "comunidad1"];

    const unsubscribe = suscribirBotsEntidad(e, callback, supabase, storage);

    expect(supabase.channel).toHaveBeenCalledWith("astraura-bots-realtime");
    expect(mockChannel.on).toHaveBeenCalled();
    expect(mockChannel.subscribe).toHaveBeenCalled();
    expect(typeof unsubscribe).toBe("function");
  });

  test("should return unsubscribe function that calls removeChannel", () => {
    const mockChannel = {
      onCalled: false,
      subscribeCalled: false,
      removeChannelCalled: false,
      on: vi.fn().mockImplementation((event, filter, callback) => {
        mockChannel.lastEvent = { event: "*", filter, callback };
        return mockChannel;
      }),
      subscribe: vi.fn().mockReturnThis(),
      removeChannel: vi.fn()
    };
    const supabase = {
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn()
    };
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn()
    };
    const callback = vi.fn();
    const e = ["grupo1"];
    const mockChannelInstance = supabase.channel("astraura-bots-realtime");

    const unsubscribe = suscribirBotsEntidad(e, callback, supabase, storage);
    unsubscribe();

    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannelInstance);
  });

  test("should call callback when a valid message arrives", () => {
    const mockChannel = {
      onCalled: false,
      subscribeCalled: false,
      lastEvent: null,
      on: vi.fn().mockImplementation((event, filter, callback) => {
        mockChannel.lastEvent = { event: "*", filter, callback };
        return mockChannel;
      }),
      subscribe: vi.fn().mockReturnThis(),
      removeChannel: vi.fn()
    };
    const supabase = {
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn()
    };
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn()
    };
    const callback = vi.fn();
    const e = ["grupo1"];

    suscribirBotsEntidad(e, callback, supabase, storage);

    const mockPayload = {
      nuevo: {
        id: "bot1",
        nombre: "Bot 1",
        dueno: {
          tipo: "grupo",
          id: "grupo1",
          cuentaId: "cuenta1"
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
        sentidosHabilitados: ["pantalla"],
        activo: true,
        actualizado: 1000
      },
      viejo: null
    };

    // Simulate a message: call the callback with a payload that has eventType and the data
    if (mockChannel.lastEvent?.callback) {
      const payload = {
        eventType: mockChannel.lastEvent.event,
        ...mockPayload
      };
      mockChannel.lastEvent.callback(payload);
    }

    expect(callback).toHaveBeenCalledWith({
      t: "*",
      r: mockPayload.nuevo,
      a: null
    });
  });

  test("should ignore message if dueno not in entity list", () => {
    const mockChannel = {
      onCalled: false,
      subscribeCalled: false,
      lastEvent: null,
      on: vi.fn().mockImplementation((event, filter, callback) => {
        mockChannel.lastEvent = { event: "*", filter, callback };
        return mockChannel;
      }),
      subscribe: vi.fn().mockReturnThis(),
      removeChannel: vi.fn()
    };
    const supabase = {
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn()
    };
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn()
    };
    const callback = vi.fn();
    const e = ["grupo1"];

    suscribirBotsEntidad(e, callback, supabase, storage);

    const mockPayload = {
      nuevo: {
        id: "bot1",
        nombre: "Bot 1",
        dueno: {
          tipo: "perfil", // not in e
          id: "perfil1",
          cuentaId: "cuenta1"
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
        sentidosHabilitados: ["pantalla"],
        activo: true,
        actualizado: 1000
      },
      viejo: null
    };

    if (mockChannel.lastEvent?.callback) {
      const payload = {
        eventType: mockChannel.lastEvent.event,
        ...mockPayload
      };
      mockChannel.lastEvent.callback(payload);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  test("should ignore message if dueno tipo is not grupo, comunidad, or pagina", () => {
    const mockChannel = {
      onCalled: false,
      subscribeCalled: false,
      lastEvent: null,
      on: vi.fn().mockImplementation((event, filter, callback) => {
        mockChannel.lastEvent = { event: "*", filter, callback };
        return mockChannel;
      }),
      subscribe: vi.fn().mockReturnThis(),
      removeChannel: vi.fn()
    };
    const supabase = {
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn()
    };
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn()
    };
    const callback = vi.fn();
    const e = ["perfil1"];

    suscribirBotsEntidad(e, callback, supabase, storage);

    const mockPayload = {
      nuevo: {
        id: "bot1",
        nombre: "Bot 1",
        dueno: {
          tipo: "perfil",
          id: "perfil1",
          cuentaId: "cuenta1"
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
        sentidosHabilitados: ["pantalla"],
        activo: true,
        actualizado: 1000
      },
      viejo: null
    };

    if (mockChannel.lastEvent?.callback) {
      const payload = {
        eventType: mockChannel.lastEvent.event,
        ...mockPayload
      };
      mockChannel.lastEvent.callback(payload);
    }

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("abiertosEnEstaNeurona", () => {
  test("should return empty array when storage returns null", () => {
    const supabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((event, filter, callback) => {
          return {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            removeChannel: vi.fn()
          };
        }),
        subscribe: vi.fn(),
        removeChannel: vi.fn()
      })
    };
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    };

    const result = abiertosEnEstaNeurona(supabase, storage);
    expect(result).toEqual([]);
  });

  test("should return parsed array when storage returns valid JSON array of strings", () => {
    const supabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((event, filter, callback) => {
          return {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            removeChannel: vi.fn()
          };
        }),
        subscribe: vi.fn(),
        removeChannel: vi.fn()
      })
    };
    const storage = {
      getItem: vi.fn().mockReturnValue('["item1", "item2"]'),
      setItem: vi.fn()
    };

    const result = abiertosEnEstaNeurona(supabase, storage);
    expect(result).toEqual(["item1", "item2"]);
  });

  test("should return empty array when storage returns invalid JSON", () => {
    const supabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((event, filter, callback) => {
          return {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            removeChannel: vi.fn()
          };
        }),
        subscribe: vi.fn(),
        removeChannel: vi.fn()
      })
    };
    const storage = {
      getItem: vi.fn().mockReturnValue('invalid json'),
      setItem: vi.fn()
    };

    const result = abiertosEnEstaNeurona(supabase, storage);
    expect(result).toEqual([]);
  });

  test("should return empty array when storage returns non-array", () => {
    const supabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((event, filter, callback) => {
          return {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            removeChannel: vi.fn()
          };
        }),
        subscribe: vi.fn(),
        removeChannel: vi.fn()
      })
    };
    const storage = {
      getItem: vi.fn().mockReturnValue('{"key": "value"}'),
      setItem: vi.fn()
    };

    const result = abiertosEnEstaNeurona(supabase, storage);
    expect(result).toEqual([]);
  });
});

describe("marcarAbierto", () => {
  test("should add item when a is true and item not present", () => {
    const supabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((event, filter, callback) => {
          return {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            removeChannel: vi.fn()
          };
        }),
        subscribe: vi.fn(),
        removeChannel: vi.fn()
      })
    };
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    };

    marcarAbierto("item1", true, supabase, storage);

    expect(storage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", JSON.stringify(["item1"]));
  });

  test("should not add duplicate when a is true and item already present", () => {
    const supabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((event, filter, callback) => {
          return {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            removeChannel: vi.fn()
          };
        }),
        subscribe: vi.fn(),
        removeChannel: vi.fn()
      })
    };
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify(["item1"])),
      setItem: vi.fn()
    };

    marcarAbierto("item1", true, supabase, storage);

    expect(storage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", JSON.stringify(["item1"]));
  });

  test("should remove item when a is false and item present", () => {
    const supabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((event, filter, callback) => {
          return {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            removeChannel: vi.fn()
          };
        }),
        subscribe: vi.fn(),
        removeChannel: vi.fn()
      })
    };
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify(["item1", "item2"])),
      setItem: vi.fn()
    };

    marcarAbierto("item1", false, supabase, storage);

    expect(storage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", JSON.stringify(["item2"]));
  });

  test("should not remove item when a is false and item not present", () => {
    const supabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((event, filter, callback) => {
          return {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            removeChannel: vi.fn()
          };
        }),
        subscribe: vi.fn(),
        removeChannel: vi.fn()
      })
    };
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify(["item1"])),
      setItem: vi.fn()
    };

    marcarAbierto("item2", false, supabase, storage);

    expect(storage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", JSON.stringify(["item1"]));
  });

  test("should persist the list via storage.setItem", () => {
    const supabase = {
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((event, filter, callback) => {
          return {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            removeChannel: vi.fn()
          };
        }),
        subscribe: vi.fn(),
        removeChannel: vi.fn()
      })
    };
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify(["item1"])),
      setItem: vi.fn()
    };

    marcarAbierto("item2", true, supabase, storage);

    expect(storage.setItem).toHaveBeenCalledWith("starseed.astraura.bots.orbes.v1", JSON.stringify(["item1", "item2"]));
  });
});