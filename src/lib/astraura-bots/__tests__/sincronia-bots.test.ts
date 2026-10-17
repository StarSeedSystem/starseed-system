import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';
import { fusionarBots, type BotSync } from "../sincronia-bots";
import { suscribirBotsEntidad, abiertosEnEstaNeurona, marcarAbierto } from "../adaptadores/sincronia-bots";

// Mock the supabase client module
vi.mock("@/utils/supabase/client");
// Mock the realtime module
vi.mock("@/lib/realtime/realtime");

// Now we can import the mocked modules
import { createClient } from "@/utils/supabase/client";
import { onTableChange } from "@/lib/realtime/realtime";

// Mocks
const mockChannel = {};
const mockSupabaseClient = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn()
};

// Make the mocks return our values
(createClient as vi.Mock).mockReturnValue(mockSupabaseClient);

// Mock window.localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn()
};
// @ts-ignore
vi.stubGlobal('window', {
  localStorage: localStorageMock
});



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
  let handleChangeCallback: ((payload: any) => void) | null = null;
  afterEach(() => {
    vi.resetAllMocks();
  });
  beforeEach(() => {
    handleChangeCallback = null;
    const unsubscribeMock = vi.fn();
    (onTableChange as vi.Mock).mockImplementation((_table, _options, callback) => {
      handleChangeCallback = callback;
      return unsubscribeMock;
    });
  });
  test("debe llamar al canal y suscribirse", () => {
    const e = [{ tipo: "perfil", id: "entidad1", cuentaId: "cuenta-1" }];
    const callback = vi.fn();

    suscribirBotsEntidad(e, callback);

    // Expect onTableChange to have been called with the correct args
    expect(onTableChange).toHaveBeenCalledWith("astraura_bots", {
      filter: expect.any(String),
      event: "*"
    }, expect.any(Function));
    });

    test("debe llamar al callback cuando hay un cambio", () => {
      const e = [{ tipo: "perfil", id: "entidad1", cuentaId: "cuenta-1" }];
      const callback = vi.fn();

      const unsubscribe = suscribirBotsEntidad(e, callback);
      expect(handleChangeCallback).toBeInstanceOf(Function);

      // Simulate a change by calling the handleChange function
      handleChangeCallback({
        error: null,
        new: { id: "bot1", actualizado: 1000, nombre: "Bot 1", dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" }, origen: "astraura", gobierno: "jerarquico", personalidad: {}, cuerpo: {}, sentidosHabilitados: [], activo: true },
        eventType: "INSERT"
      });

      expect(callback).toHaveBeenCalledWith([{
        id: "bot1",
        actualizado: 1000,
        nombre: "Bot 1",
        dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" },
        origen: "astraura",
        gobierno: "jerarquico",
        personalidad: {},
        cuerpo: {},
        sentidosHabilitados: [],
        activo: true
      }]);
    });


 
     test("debe devolver una función de desuscripción que llame a removeChannel", () => {
       const e = [{ tipo: "perfil", id: "entidad1", cuentaId: "cuenta-1" }];
       const callback = vi.fn();

      const unsubscribe = suscribirBotsEntidad(e, callback);
      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
      expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(mockSupabaseClient.channel.mock.calls[0][0]);
    });
});

describe("abiertosEnEstaNeurona", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

    test("debe devolver un array vacío si el almacenamiento devuelve null", () => {
      // Mock window.localStorage
      const storageMock = {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn()
      };
      // @ts-ignore
      window.localStorage = storageMock;

      const resultado = abiertosEnEstaNeurona();

      expect(resultado).toEqual([]);
      expect(storageMock.getItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1");
    });

    test("debe devolver un array vacío si el almacenamiento devuelve un string que no es JSON", () => {
      // Mock window.localStorage
      const storageMock = {
        getItem: vi.fn().mockReturnValue("no es json"),
        setItem: vi.fn()
      };
      // @ts-ignore
      window.localStorage = storageMock;

      const resultado = abiertosEnEstaNeurona();

      expect(resultado).toEqual([]);
      expect(storageMock.getItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1");
    });

    test("debe devolver un array vacío si el almacenamiento devuelve un JSON que no es un array", () => {
      // Mock window.localStorage
      const storageMock = {
        getItem: vi.fn().mockReturnValue(JSON.stringify({})),
        setItem: vi.fn()
      };
      // @ts-ignore
      window.localStorage = storageMock;

      const resultado = abiertosEnEstaNeurona();

      expect(resultado).toEqual([]);
      expect(storageMock.getItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1");
    });

    test("debe devolver el array de strings si el almacenamiento devuelve un JSON válido", () => {
      // Mock window.localStorage
      const valor = ["id1", "id2"];
      const storageMock = {
        getItem: vi.fn().mockReturnValue(JSON.stringify(valor)),
        setItem: vi.fn()
      };
      // @ts-ignore
      window.localStorage = storageMock;

      const resultado = abiertosEnEstaNeurona();

      expect(resultado).toEqual(valor);
      expect(storageMock.getItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1");
    });

    test("debe filtrar los valores que no son strings", () => {
      // Mock window.localStorage
      const valor = ["id1", 123, "id2"];
      const storageMock = {
        getItem: vi.fn().mockReturnValue(JSON.stringify(valor)),
        setItem: vi.fn()
      };
      // @ts-ignore
      window.localStorage = storageMock;

      const resultado = abiertosEnEstaNeurona();

      expect(resultado).toEqual(["id1", "id2"]);
      expect(storageMock.getItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1");
    });
});

describe("marcarAbierto", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

    test("no hace nada si window es undefined", () => {
      // Since we are in a Node environment, window is undefined, so the function should return early.
      marcarAbierto("id1", true);
      // No assertions needed because the function should not access localStorage when window is undefined.
    });

    test("llama a getItem y setItem del almacenamiento cuando se agrega un nuevo id", () => {
      // Mock window.localStorage
      const storageMock = {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn()
      };
      // @ts-ignore
      window.localStorage = storageMock;

      marcarAbierto("id1", true);

      expect(storageMock.getItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1");
      expect(storageMock.setItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1", JSON.stringify(["id1"]));
    });

    test("llama a getItem y setItem del almacenamiento cuando se agrega un id que ya existe (no debe duplicar)", () => {
      // Mock window.localStorage
      const almacenado = JSON.stringify(["id1", "id2"]);
      const storageMock = {
        getItem: vi.fn().mockReturnValue(almacenado),
        setItem: vi.fn()
      };
      // @ts-ignore
      window.localStorage = storageMock;

      marcarAbierto("id1", true);

      expect(storageMock.getItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1");
      expect(storageMock.setItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1", JSON.stringify(["id1", "id2"])); // Should not add duplicate
    });

    test("llama a getItem y setItem del almacenamiento cuando se elimina un id existente", () => {
      // Mock window.localStorage
      const almacenado = JSON.stringify(["id1", "id2", "id3"]);
      const storageMock = {
        getItem: vi.fn().mockReturnValue(almacenado),
        setItem: vi.fn()
      };
      // @ts-ignore
      window.localStorage = storageMock;

      marcarAbierto("id2", false);

      expect(storageMock.getItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1");
      expect(storageMock.setItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1", JSON.stringify(["id1", "id3"]));
    });

    test("llama a getItem y setItem del almacenamiento cuando se elimina un id que no existe", () => {
      // Mock window.localStorage
      const almacenado = JSON.stringify(["id1", "id2"]);
      const storageMock = {
        getItem: vi.fn().mockReturnValue(almacenado),
        setItem: vi.fn()
      };
      // @ts-ignore
      window.localStorage = storageMock;

      marcarAbierto("id3", false);

      expect(storageMock.getItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1");
      expect(storageMock.setItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1", JSON.stringify(["id1", "id2"])); // No change
    });

    test("maneja correctamente el almacenamiento corrupto (no JSON)", () => {
      // Mock window.localStorage
      const storageMock = {
        getItem: vi.fn().mockReturnValue("not json"),
        setItem: vi.fn()
      };
      // @ts-ignore
      window.localStorage = storageMock;

      marcarAbierto("id1", true);

      expect(storageMock.getItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1");
      expect(storageMock.setItem).toHaveBeenCalledWith("starseed.astraura.bots.abiertos.v1", JSON.stringify(["id1"]));
    });
});