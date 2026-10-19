import { describe, test, expect } from 'vitest';
import { fusionarBots, BotSync } from "../sincronia-bots";

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
   );
   test("array vacío local y remoto devuelve array vacío", () => {
     const resultado = fusionarBots([], []);
     expect(resultado).toEqual([]);
   });
   test("fusiona sin conflicto: remoto gana por timestamp", () => {
     const botLocal: BotSync = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true, actualizado: 1 };
     const local: BotSync[] = [botLocal];
     const botRemoto: BotSync = { ...botLocal, nombre: "a2", actualizado: 2 };
     const remoto: BotSync[] = [botRemoto];
     const res = fusionarBots(local, remoto);
     expect(res.length).toBe(1);
     expect(res[0].nombre).toBe("a2");
     expect(res[0].actualizado).toBe(2);
    })\n\n   test("fusiona con conflicto: local gana si es más reciente", () => {\n     const botLocal: BotSync = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false, actualizado: 10 };\n     const local: BotSync[] = [botLocal];\n     const botRemoto: BotSync = { ...botLocal, nombre: "b0", actualizado: 5 };\n     const remoto: BotSync[] = [botRemoto];\n     const res = fusionarBots(local, remoto);\n     expect(res[0].nombre).toBe("b1");\n     expect(res[0].actualizado).toBe(10);\n   })

  test("predeterminado garantizado: se conserva el local si no está en remoto", () => {
    const local: any[] = [hacerBot("bot-default", 1000)];
    const remoto: any[] = [];
    const resultado = fusionarBots(local, remoto);
    expect(resultado.length).toBe(1);
     expect(resultado[0].id).toBe("bot-default");
     expect(resultado[0].actualizado).toBe(1000);
   });
   test("array vacío local y remoto devuelve array vacío", () => {
     const resultado = fusionarBots([], []);
     expect(resultado).toEqual([]);
   })

  test("fusiona sin conflicto: remoto gana por timestamp", () => {
    const botLocal: BotSync = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true };
    const local = { bots: [botLocal], actualizado: { a: 1 } };
    const botRemoto = { ...botLocal, nombre: "a2" };
    const remoto = { bots: [botRemoto], actualizado: { a: 2 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].nombre).toBe("a2");
    expect(res.actualizado.a).toBe(2);
  })

  test("fusiona con conflicto: local gana si es más reciente", () => {
    const botLocal: BotSync = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false };
    const local = { bots: [botLocal], actualizado: { b: 10 } };
    const botRemoto = { ...botLocal, nombre: "b0" };
    const remoto = { bots: [botRemoto], actualizado: { b: 5 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots[0].nombre).toBe("b1");
    expect(res.actualizado.b).toBe(10);
  })

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
  test("array vacío local y remoto devuelve objeto actualizado vacío", () => {
    const resultado = fusionarBots({ bots: [], actualizado: {} }, { bots: [], actualizado: {} });
    expect(resultado.bots).toEqual([]);
    expect(resultado.actualizado).toEqual({});
  })

  test("fusiona sin conflicto: remoto gana por timestamp", () => {
    const botLocal: BotSync = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true };
    const local = { bots: [botLocal], actualizado: { a: 1 } };
    const botRemoto = { ...botLocal, nombre: "a2" };
    const remoto = { bots: [botRemoto], actualizado: { a: 2 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].nombre).toBe("a2");
    expect(res.actualizado.a).toBe(2);
  })

  test("fusiona con conflicto: local gana si es más reciente", () => {
    const botLocal: BotSync = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false };
    const local = { bots: [botLocal], actualizado: { b: 10 } };
    const botRemoto = { ...botLocal, nombre: "b0" };
    const remoto = { bots: [botRemoto], actualizado: { b: 5 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots[0].nombre).toBe("b1");
    expect(res.actualizado.b).toBe(10);
  })

  test("ids nuevos de ambos lados: se incluyen bots exclusivos de cada lado", () => {
    const local: any[] = [hacerBot("local-only", 1000)];
    const remoto: any[] = [hacerBot("remoto-only", 2000)];
    const resultado = fusionarBots(local, remoto);
    const ids = resultado.map(b => b.id).sort();
    expect(ids).toEqual(["local-only", "remoto-only"]);
  });
  test("array vacío local y remoto devuelve objeto actualizado vacío", () => {
    const resultado = fusionarBots({ bots: [], actualizado: {} }, { bots: [], actualizado: {} });
    expect(resultado.bots).toEqual([]);
    expect(resultado.actualizado).toEqual({});
  })

  test("fusiona sin conflicto: remoto gana por timestamp", () => {
    const botLocal: BotSync = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true };
    const local = { bots: [botLocal], actualizado: { a: 1 } };
    const botRemoto = { ...botLocal, nombre: "a2" };
    const remoto = { bots: [botRemoto], actualizado: { a: 2 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].nombre).toBe("a2");
    expect(res.actualizado.a).toBe(2);
  })

  test("fusiona con conflicto: local gana si es más reciente", () => {
    const botLocal: BotSync = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false };
    const local = { bots: [botLocal], actualizado: { b: 10 } };
    const botRemoto = { ...botLocal, nombre: "b0" };
    const remoto = { bots: [botRemoto], actualizado: { b: 5 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots[0].nombre).toBe("b1");
    expect(res.actualizado.b).toBe(10);
  })

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
  test("array vacío local y remoto devuelve objeto actualizado vacío", () => {
    const resultado = fusionarBots({ bots: [], actualizado: {} }, { bots: [], actualizado: {} });
    expect(resultado.bots).toEqual([]);
    expect(resultado.actualizado).toEqual({});
  })

  test("fusiona sin conflicto: remoto gana por timestamp", () => {
    const botLocal: BotSync = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true };
    const local = { bots: [botLocal], actualizado: { a: 1 } };
    const botRemoto = { ...botLocal, nombre: "a2" };
    const remoto = { bots: [botRemoto], actualizado: { a: 2 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].nombre).toBe("a2");
    expect(res.actualizado.a).toBe(2);
  })

  test("fusiona con conflicto: local gana si es más reciente", () => {
    const botLocal: BotSync = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false };
    const local = { bots: [botLocal], actualizado: { b: 10 } };
    const botRemoto = { ...botLocal, nombre: "b0" };
    const remoto = { bots: [botRemoto], actualizado: { b: 5 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots[0].nombre).toBe("b1");
    expect(res.actualizado.b).toBe(10);
  })

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
  test("array vacío local y remoto devuelve objeto actualizado vacío", () => {
    const resultado = fusionarBots({ bots: [], actualizado: {} }, { bots: [], actualizado: {} });
    expect(resultado.bots).toEqual([]);
    expect(resultado.actualizado).toEqual({});
  })

  test("fusiona sin conflicto: remoto gana por timestamp", () => {
    const botLocal: BotSync = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true };
    const local = { bots: [botLocal], actualizado: { a: 1 } };
    const botRemoto = { ...botLocal, nombre: "a2" };
    const remoto = { bots: [botRemoto], actualizado: { a: 2 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].nombre).toBe("a2");
    expect(res.actualizado.a).toBe(2);
  })

  test("fusiona con conflicto: local gana si es más reciente", () => {
    const botLocal: BotSync = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false };
    const local = { bots: [botLocal], actualizado: { b: 10 } };
    const botRemoto = { ...botLocal, nombre: "b0" };
    const remoto = { bots: [botRemoto], actualizado: { b: 5 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots[0].nombre).toBe("b1");
    expect(res.actualizado.b).toBe(10);
  })

  test("no se pierde el predeterminado por fusión (caso remoto más reciente)", () => {
    const local: any[] = [hacerBot("predeterminado", 1000)]; // id especial para predeterminado
    const remoto: any[] = [hacerBot("predeterminado", 2000)]; // más reciente
    const resultado = fusionarBots(local, remoto);
    expect(resultado.length).toBe(1);
    expect(resultado[0].id).toBe("predeterminado");
    // Debe ganar el remoto por ser más reciente
    expect(resultado[0].actualizado).toBe(2000);
  });
  test("array vacío local y remoto devuelve objeto actualizado vacío", () => {
    const resultado = fusionarBots({ bots: [], actualizado: {} }, { bots: [], actualizado: {} });
    expect(resultado.bots).toEqual([]);
    expect(resultado.actualizado).toEqual({});
  })

  test("fusiona sin conflicto: remoto gana por timestamp", () => {
    const botLocal: BotSync = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true };
    const local = { bots: [botLocal], actualizado: { a: 1 } };
    const botRemoto = { ...botLocal, nombre: "a2" };
    const remoto = { bots: [botRemoto], actualizado: { a: 2 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].nombre).toBe("a2");
    expect(res.actualizado.a).toBe(2);
  })

  test("fusiona con conflicto: local gana si es más reciente", () => {
    const botLocal: BotSync = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false };
    const local = { bots: [botLocal], actualizado: { b: 10 } };
    const botRemoto = { ...botLocal, nombre: "b0" };
    const remoto = { bots: [botRemoto], actualizado: { b: 5 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots[0].nombre).toBe("b1");
    expect(res.actualizado.b).toBe(10);
  })

  test("array vacío local y remoto devuelve array vacío", () => {
    const resultado = fusionarBots([], []);
    expect(resultado).toEqual([]);
  });
  test("array vacío local y remoto devuelve objeto actualizado vacío", () => {
    const resultado = fusionarBots({ bots: [], actualizado: {} }, { bots: [], actualizado: {} });
    expect(resultado.bots).toEqual([]);
    expect(resultado.actualizado).toEqual({});
  })

  test("fusiona sin conflicto: remoto gana por timestamp", () => {
    const botLocal: BotSync = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true };
    const local = { bots: [botLocal], actualizado: { a: 1 } };
    const botRemoto = { ...botLocal, nombre: "a2" };
    const remoto = { bots: [botRemoto], actualizado: { a: 2 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].nombre).toBe("a2");
    expect(res.actualizado.a).toBe(2);
  })

  test("fusiona con conflicto: local gana si es más reciente", () => {
    const botLocal: BotSync = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false };
    const local = { bots: [botLocal], actualizado: { b: 10 } };
    const botRemoto = { ...botLocal, nombre: "b0" };
    const remoto = { bots: [botRemoto], actualizado: { b: 5 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots[0].nombre).toBe("b1");
    expect(res.actualizado.b).toBe(10);
  })

  test("local vacío, remoto con bots válidos devuelve los remotos", () => {
    const local: any[] = [];
    const remoto: any[] = [hacerBot("A", 1000), hacerBot("B", 2000)];
    const resultado = fusionarBots(local, remoto);
    const ids = resultado.map(b => b.id).sort();
    expect(ids).toEqual(["A", "B"]);
  });
  test("array vacío local y remoto devuelve objeto actualizado vacío", () => {
    const resultado = fusionarBots({ bots: [], actualizado: {} }, { bots: [], actualizado: {} });
    expect(resultado.bots).toEqual([]);
    expect(resultado.actualizado).toEqual({});
  })

  test("fusiona sin conflicto: remoto gana por timestamp", () => {
    const botLocal: BotSync = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true };
    const local = { bots: [botLocal], actualizado: { a: 1 } };
    const botRemoto = { ...botLocal, nombre: "a2" };
    const remoto = { bots: [botRemoto], actualizado: { a: 2 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].nombre).toBe("a2");
    expect(res.actualizado.a).toBe(2);
  })

  test("fusiona con conflicto: local gana si es más reciente", () => {
    const botLocal: BotSync = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false };
    const local = { bots: [botLocal], actualizado: { b: 10 } };
    const botRemoto = { ...botLocal, nombre: "b0" };
    const remoto = { bots: [botRemoto], actualizado: { b: 5 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots[0].nombre).toBe("b1");
    expect(res.actualizado.b).toBe(10);
  })

  test("remoto vacío, local con bots devuelve los locales", () => {
    const local: any[] = [hacerBot("A", 1000), hacerBot("B", 2000)];
    const remoto: any[] = [];
    const resultado = fusionarBots(local, remoto);
    const ids = resultado.map(b => b.id).sort();
    expect(ids).toEqual(["A", "B"]);
  });
  test("array vacío local y remoto devuelve objeto actualizado vacío", () => {
    const resultado = fusionarBots({ bots: [], actualizado: {} }, { bots: [], actualizado: {} });
    expect(resultado.bots).toEqual([]);
    expect(resultado.actualizado).toEqual({});
  })

  test("fusiona sin conflicto: remoto gana por timestamp", () => {
    const botLocal: BotSync = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true };
    const local = { bots: [botLocal], actualizado: { a: 1 } };
    const botRemoto = { ...botLocal, nombre: "a2" };
    const remoto = { bots: [botRemoto], actualizado: { a: 2 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].nombre).toBe("a2");
    expect(res.actualizado.a).toBe(2);
  })

  test("fusiona con conflicto: local gana si es más reciente", () => {
    const botLocal: BotSync = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false };
    const local = { bots: [botLocal], actualizado: { b: 10 } };
    const botRemoto = { ...botLocal, nombre: "b0" };
    const remoto = { bots: [botRemoto], actualizado: { b: 5 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots[0].nombre).toBe("b1");
    expect(res.actualizado.b).toBe(10);
  })
});