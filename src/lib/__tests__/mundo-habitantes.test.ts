// @vitest-environment jsdom
/**
 * Habitantes reales del mundo · Ola 1025U · U1. `habitantesDeCuenta` devuelve `AgenteMundoRef[]` hechos con
 * `crearAgenteMundoRef` (todos «Bot de IA»), a partir de las personalidades de la cuenta, los bots de sus entidades y
 * los agentes de grupo. Sin datos reales, lista vacía: no se inventa a nadie. Más el recorte al tope visible y el
 * alcance de memoria (las personalidades personales nunca salen a un escenario de grupo o público).
 */
import { describe, expect, it } from "vitest";
import {
  ETIQUETA_BOT_IA,
  MAX_HABITANTES_VISIBLES,
  habitantesDeFuentes,
  habitantesVisibles,
  limitarHabitantes,
  type FuenteBot,
} from "@/lib/avatares/mundo/habitantes";
import { habitantesDeCuenta, leerHabitantesDeCuenta, type ServiciosHabitantes } from "@/lib/avatares/mundo/habitantes-cuenta";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { disponerZonas, ocupantesPorZona, posicionEnEscena, radioDelSuelo, SUELO_Y, zonasParaSimulacion } from "@/lib/avatares/mundo/zonas";
import { ZONAS_POR_DEFECTO } from "@/lib/avatares/mundo/escenarios";
import { gestoParaOcupacion } from "@/lib/avatares/mundo/gestos";

const bot = (id: string, tipo: "perfil" | "grupo" | "pagina", activo = true): FuenteBot => ({
  id,
  nombre: `Bot ${id}`,
  dueno: { tipo, id: `ent-${id}`, cuentaId: "c1" },
  activo,
});

describe("habitantesDeFuentes", () => {
  it("sin fuentes no hay nadie: no se inventa a nadie", () => {
    expect(habitantesDeFuentes({})).toEqual([]);
    expect(habitantesDeFuentes({ cuentaId: "c1", personalidades: [], bots: [], agentesGrupo: [] })).toEqual([]);
  });

  it("une personalidades, bots de entidad y agentes de grupo, todos IA y con su dueño", () => {
    const lista = habitantesDeFuentes({
      cuentaId: "c1",
      personalidades: [{ id: "aurora", name: "Aurora" }],
      bots: [bot("b1", "grupo")],
      agentesGrupo: [{ id: "ag1", name: "Guía del círculo", grupoId: "g9" }],
    });
    expect(lista.map((a) => a.id)).toEqual(["personalidad:aurora", "bot:b1", "agente-grupo:ag1"]);
    expect(lista.every((a) => a.esBotIA === true)).toBe(true);
    expect(lista[0].dueno).toEqual({ tipo: "cuenta", id: "c1" });
    expect(lista[1].dueno).toEqual({ tipo: "grupo", id: "ent-b1" });
    expect(lista[2].dueno).toEqual({ tipo: "grupo", id: "g9" });
    // Idénticos a lo que fabrica el contrato común.
    expect(lista[0]).toEqual(crearAgenteMundoRef({ origen: "personalidad", idOrigen: "aurora", nombre: "Aurora", dueno: { tipo: "cuenta", id: "c1" } }));
  });

  it("un bot pausado no vive en el mundo, y el bot personal de un perfil tampoco cuenta como de entidad", () => {
    const lista = habitantesDeFuentes({ bots: [bot("pausado", "grupo", false), bot("mio", "perfil"), bot("pag", "pagina")] });
    expect(lista.map((a) => a.idOrigen)).toEqual(["pag"]);
    expect(lista[0].dueno.tipo).toBe("pagina");
  });

  it("no repite a nadie y descarta lo incompleto", () => {
    const lista = habitantesDeFuentes({
      personalidades: [{ id: "a", name: "A" }, { id: "a", name: "A otra vez" }, { id: "", name: "sin id" }, { id: "x", name: "" }],
    });
    expect(lista.map((a) => a.id)).toEqual(["personalidad:a"]);
  });

  it("la etiqueta que acompaña a todos es «Bot de IA»", () => {
    expect(ETIQUETA_BOT_IA).toBe("Bot de IA");
  });
});

describe("habitantesVisibles · alcance de memoria", () => {
  const todos = habitantesDeFuentes({
    cuentaId: "c1",
    personalidades: [{ id: "p1", name: "Personal" }],
    bots: [bot("b1", "grupo"), bot("b2", "pagina")],
    agentesGrupo: [{ id: "ag1", name: "Agente", grupoId: "ent-b1" }],
  });

  it("en un escenario privado vive todo lo tuyo", () => {
    expect(habitantesVisibles(todos, { visibilidad: "privada" })).toHaveLength(4);
  });

  it("en uno público o de grupo NUNCA están tus personalidades personales", () => {
    expect(habitantesVisibles(todos, { visibilidad: "publica" }).some((a) => a.origen === "personalidad")).toBe(false);
    expect(habitantesVisibles(todos, { visibilidad: "grupo", grupoId: "ent-b1" }).some((a) => a.origen === "personalidad")).toBe(false);
  });

  it("uno de grupo solo muestra lo de ese grupo", () => {
    const de = habitantesVisibles(todos, { visibilidad: "grupo", grupoId: "ent-b1" });
    expect(de.map((a) => a.id).sort()).toEqual(["agente-grupo:ag1", "bot:b1"]);
  });
});

describe("limitarHabitantes · tope visible honesto", () => {
  const muchos = (n: number) =>
    habitantesDeFuentes({
      personalidades: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      bots: Array.from({ length: n }, (_, i) => bot(`b${i}`, "grupo")),
    });

  it("bajo el tope no recorta ni oculta nada", () => {
    const r = limitarHabitantes(muchos(3));
    expect(r.visibles).toHaveLength(6);
    expect(r.ocultos).toBe(0);
  });

  it("sobre el tope se queda con MAX_HABITANTES_VISIBLES y dice cuántos quedan fuera", () => {
    const todos = muchos(40);
    const r = limitarHabitantes(todos);
    expect(r.visibles).toHaveLength(MAX_HABITANTES_VISIBLES);
    expect(r.ocultos).toBe(80 - MAX_HABITANTES_VISIBLES);
    expect(r.visibles.length + r.ocultos).toBe(todos.length);
  });

  it("reparte el cupo entre orígenes: ninguna fuente se lo come entero", () => {
    const r = limitarHabitantes(muchos(40));
    expect(r.visibles.filter((a) => a.origen === "personalidad").length).toBeGreaterThan(0);
    expect(r.visibles.filter((a) => a.origen === "bot").length).toBeGreaterThan(0);
  });
});

describe("leerHabitantesDeCuenta · con las fuentes inyectadas", () => {
  const servicios = (extra: Partial<ServiciosHabitantes> = {}): Partial<ServiciosHabitantes> => ({
    personalidades: () => [{ id: "aurora", name: "Aurora" }],
    entidades: async () => [{ tipo: "grupo", id: "g1", nombre: "Mi círculo" }],
    botsDeEntidad: async (e) => [{ id: `bot-${e.id}`, nombre: "Bot del círculo", dueno: { tipo: e.tipo, id: e.id, cuentaId: "c1" }, activo: true }],
    agentesGrupo: () => [{ id: "ag1", name: "Guía", grupoId: "g1" }],
    cuentaId: async () => "c1",
    ...extra,
  });

  it("habitantesDeCuenta devuelve AgenteMundoRef[] con las tres fuentes", async () => {
    const lista = await habitantesDeCuenta(servicios());
    expect(lista.map((a) => a.origen)).toEqual(["personalidad", "bot", "agente-grupo"]);
    expect(lista.every((a) => a.esBotIA)).toBe(true);
  });

  it("si una fuente falla, las demás siguen y se dice cuál", async () => {
    const r = await leerHabitantesDeCuenta(
      servicios({
        botsDeEntidad: async () => {
          throw new Error("sin red");
        },
      }),
    );
    expect(r.agentes.map((a) => a.origen)).toEqual(["personalidad", "agente-grupo"]);
    expect(r.avisos.join(" ")).toMatch(/bots de 1 entidad/);
  });

  it("sin sesión solo quedan los de este aparato, y lo dice", async () => {
    const r = await leerHabitantesDeCuenta(servicios({ entidades: async () => null }));
    expect(r.sinSesion).toBe(true);
    expect(r.agentes.map((a) => a.origen)).toEqual(["personalidad", "agente-grupo"]);
    expect(r.avisos.join(" ")).toMatch(/Sin sesión/);
  });

  it("sin nada real la lista está vacía (no se rellena)", async () => {
    const r = await leerHabitantesDeCuenta({
      personalidades: () => [],
      entidades: async () => [],
      botsDeEntidad: async () => [],
      agentesGrupo: () => [],
      cuentaId: async () => "local",
    });
    expect(r.agentes).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("las fuentes que lanzan no tumban la lectura", async () => {
    const r = await leerHabitantesDeCuenta(
      servicios({
        personalidades: () => {
          throw new Error("almacén roto");
        },
        agentesGrupo: () => {
          throw new Error("almacén roto");
        },
        entidades: async () => {
          throw new Error("sin red");
        },
      }),
    );
    expect(r.agentes).toEqual([]);
    expect(r.avisos.length).toBeGreaterThanOrEqual(3);
  });
});

describe("zonas del escenario y suelo", () => {
  it("las zonas se colocan con disponerSalas: una por cada una del escenario, con su ocupación", () => {
    const ocupantes = new Map([["taller", 3], ["agora", 1]]);
    const d = disponerZonas(ZONAS_POR_DEFECTO, ocupantes);
    expect(d.zonas.map((z) => z.id).sort()).toEqual(["agora", "biblioteca", "suenos", "taller"]);
    expect(d.zonas.find((z) => z.id === "taller")?.ocupantes).toBe(3);
    expect(d.zonas.find((z) => z.id === "taller")?.afinidad).toBe("crear");
    expect(zonasParaSimulacion(d)).toHaveLength(4);
  });

  it("sin habitantes no hay actividad que mostrar (honestidad de la oficina)", () => {
    const d = disponerZonas(ZONAS_POR_DEFECTO, new Map());
    expect(d.zonas.every((z) => z.actividad === 0)).toBe(true);
  });

  it("el suelo siempre abarca las zonas", () => {
    const d = disponerZonas(ZONAS_POR_DEFECTO, new Map([["taller", 20]]));
    expect(radioDelSuelo(d)).toBeGreaterThan(d.extension);
  });

  it("ocupantesPorZona cuenta a quien está en cada zona", () => {
    const m = ocupantesPorZona([
      { zonaId: "taller" }, { zonaId: "taller" }, { zonaId: null }, { zonaId: "agora" },
    ] as never);
    expect(m.get("taller")).toBe(2);
    expect(m.get("agora")).toBe(1);
  });

  it("posicionEnEscena posa al habitante sobre el suelo: nunca por debajo", () => {
    const [, y0] = posicionEnEscena([1, 0, 2]);
    const [, y1] = posicionEnEscena([1, 0.5, 2]);
    const [x, yNeg] = posicionEnEscena([1, -9, 2]);
    expect(y0).toBeGreaterThan(SUELO_Y);
    expect(y1).toBeGreaterThan(y0);
    expect(yNeg).toBe(y0);
    expect(x).toBe(1);
  });
});

describe("gestoParaOcupacion", () => {
  it("la energía va en cuartos, para no pedir un clip nuevo en cada tick", () => {
    const g1 = gestoParaOcupacion({ energia: 0.55, humor: "feliz", ocupacion: "conversar" });
    const g2 = gestoParaOcupacion({ energia: 0.62, humor: "feliz", ocupacion: "conversar" });
    expect(g1.energia).toBe(g2.energia);
    expect([0.25, 0.5, 0.75, 0.95]).toContain(g1.energia);
  });
});
