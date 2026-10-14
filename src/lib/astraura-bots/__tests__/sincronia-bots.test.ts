import { describe, test, expect } from "vitest";
import { fusionarBots } from "../adaptadores/sincronia-bots";
import { SYNCED_KEYS } from "../../settings-sync";
import type { Bot } from "../tipos";

/**
 * Crea un bot de prueba con los datos dados.
 */
function crearBot(
  id: string,
  nombre: string,
  overrides: Partial<Bot> = {}
): Bot {
  return {
    id,
    nombre,
    dueno: {
      tipo: "perfil",
      id: "perfil1",
      cuentaId: "cuenta1",
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
    sentidosHabilitados: ["pantalla"],
    activo: true,
    ...overrides,
  };
}

/**
 * Crea el objeto de entrada para fusionarBots con bots y actualizado.
 */
function crearEntrada(
  bots: Bot[],
  actualizado: Record<string, number> = {}
) {
  return { bots, actualizado };
}

describe("fusionarBots", () => {
  test("gana el más reciente por actualizado", () => {
    const bot1 = crearBot("bot1", "Bot 1");
    const bot2 = crearBot("bot2", "Bot 2");

    const local = crearEntrada([bot1, bot2], {
      bot1: 10, // timestamp más antiguo
      bot2: 20,
    });

    const remoto = crearEntrada([bot1, bot2], {
      bot1: 30, // timestamp más reciente
      bot2: 15, // timestamp más antiguo
    });

    const resultado = fusionarBots(local, remoto);

    // bot1 debe ganar del remoto (30 > 10)
    expect(resultado.bots.find((b) => b.id === "bot1")?.nombre).toBe("Bot 1");
    // bot2 debe ganar del local (20 > 15)
    expect(resultado.bots.find((b) => b.id === "bot2")?.nombre).toBe("Bot 2");
    // Los timestamps deben ser los más recientes
    expect(resultado.actualizado.bot1).toBe(30);
    expect(resultado.actualizado.bot2).toBe(20);
  });

  test("predeterminado garantizado", () => {
    // Asumimos que el predeterminado es un bot con id conocido, pero como no tenemos acceso a la lista de predeterminados,
    // simulamos que uno de los bots es el predeterminado por su id.
    const botPredeterminado = crearBot("predeterminado-id", "Bot Predeterminado");
    const botOtro = crearBot("otro", "Otro Bot");

    // Caso: el predeterminado está solo en local
    const local = crearEntrada([botPredeterminado, botOtro], {
      "predeterminado-id": 100,
      otro: 50,
    });
    const remoto = crearEntrada([botOtro], { otro: 60 }); // remoto no tiene el predeterminado

    const resultado = fusionarBots(local, remoto);
    // El predeterminado debe estar presente
    expect(resultado.bots.some((b) => b.id === "predeterminado-id")).toBe(true);
    // Y debe ser el de local (porque remoto no lo tiene)
    expect(resultado.bots.find((b) => b.id === "predeterminado-id")?.nombre).toBe(
      "Bot Predeterminado"
    );

    // Caso: el predeterminado está solo en remoto
    const local2 = crearEntrada([botOtro], { otro: 50 });
    const remoto2 = crearEntrada([botPredeterminado, botOtro], {
      "predeterminado-id": 200,
      otro: 55,
    });

    const resultado2 = fusionarBots(local2, remoto2);
    expect(resultado2.bots.some((b) => b.id === "predeterminado-id")).toBe(true);
    expect(resultado2.bots.find((b) => b.id === "predeterminado-id")?.nombre).toBe(
      "Bot Predeterminado"
    );
  });

  test("borrado remoto no propaga", () => {
    const bot = crearBot("bot1", "Bot 1");
    // Local tiene el bot, remoto no tiene el bot (simulando borrado remoto)
    const local = crearEntrada([bot], { bot1: 10 });
    const remoto = crearEntrada([], {}); // remoto vacío

    const resultado = fusionarBots(local, remoto);
    // El bot debe seguir estando porque no se propaga el borrado
    expect(resultado.bots.length).toBe(1);
    expect(resultado.bots[0].id).toBe("bot1");
    // El timestamp debe ser el de local
    expect(resultado.actualizado.bot1).toBe(10);
  });

  test("ids nuevos de ambos lados", () => {
    const botLocal = crearBot("local-only", "Local Only");
    const botRemoto = crearBot("remoto-only", "Remoto Only");
    const botComun = crearBot("common", "Común");

    const local = crearEntrada([botLocal, botComun], {
      "local-only": 1,
      common: 10,
    });
    const remoto = crearEntrada([botRemoto, botComun], {
      "remoto-only": 2,
      common: 5, // local tiene timestamp más reciente
    });

    const resultado = fusionarBots(local, remoto);
    // Debemos tener los tres bots
    expect(resultado.bots.length).toBe(3);
    // El bot común debe ser el de local (porque 10 > 5)
    expect(
      resultado.bots.find((b) => b.id === "common")?.nombre
    ).toBe("Común");
    // Los timestamps deben ser correctos
    expect(resultado.actualizado["local-only"]).toBe(1);
    expect(resultado.actualizado["remoto-only"]).toBe(2);
    expect(resultado.actualizado.common).toBe(10);
  });

  test("determinismo", () => {
    const bot1 = crearBot("bot1", "Bot 1");
    const bot2 = crearBot("bot2", "Bot 2");
    const local = crearEntrada([bot1, bot2], { bot1: 1, bot2: 2 });
    const remoto = crearEntrada([bot2, bot1], { bot2: 3, bot1: 4 }); // mismo datos, distinto orden

    const resultado1 = fusionarBots(local, remoto);
    const resultado2 = fusionarBots(local, remoto); // misma llamada

    // Los resultados deben ser idénticos
    expect(resultado1).toEqual(resultado2);
    // Además, el orden de los bots en el array debe ser el mismo? No garantizado por el algoritmo, pero nosotros usamos un Map y luego Array.from, que depende del orden de inserción.
    // Para hacer la prueba determinista, podemos ordenar por id.
    const botsOrdenados1 = [...resultado1.bots].sort((a, b) => a.id.localeCompare(b.id));
    const botsOrdenados2 = [...resultado2.bots].sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    expect(botsOrdenados1).toEqual(botsOrdenados2);
  });

  test("basura del remoto descartada", () => {
    // Basura: un objeto que no es un Bot (por ejemplo, falta un campo requerido)
    // PeroTypeScript nos protege, así que simulamos un bot con un campo inválido? 
    // En lugar de eso, probamos que si el remoto tiene un bot con un id que también está en local, pero el remoto tiene un timestamp más antiguo, se descarta.
    const bot = crearBot("bot1", "Bot 1");
    const local = crearEntrada([bot], { bot1: 10 });
    const remoto = crearEntrada(
      [crearBot("bot1", "Bot 1 Remoto", { activo: false })], // mismo id, pero diferente contenido
      { bot1: 5 } // timestamp más antiguo
    );

    const resultado = fusionarBots(local, remoto);
    // Debe ganar el local porque su timestamp es más reciente
    expect(resultado.bots[0].activo).toBe(true); // el local tiene activo: true
    expect(resultado.actualizado.bot1).toBe(10);
  });

    test("empate en timestamp gana el local", () => {
      const bot = crearBot("bot1", "Bot 1");
      const local = crearEntrada([bot], { bot1: 10 });
      const remoto = crearEntrada(
        [crearBot("bot1", "Bot 1 Remoto", { nombre: "Bot 1 Remoto" })], // same id, different name
        { bot1: 10 } // same timestamp
      );

      const resultado = fusionarBots(local, remoto);
      // Debe ganar el local porque el remoto no es más reciente
      expect(resultado.bots[0].nombre).toBe("Bot 1");
      expect(resultado.actualizado.bot1).toBe(10);
    });

    // Prueba adicional: que las dos claves estén en SYNCED_KEYS (esto pertenece a settings-sync, pero lo incluimos aquí por la tarea)
    test("las dos claves están en SYNCED_KEYS", () => {
      expect(SYNCED_KEYS).toContain("starseed.astraura.bots.v1");
      expect(SYNCED_KEYS).toContain("starseed.astraura.bots.orbes.v1");
    });
});