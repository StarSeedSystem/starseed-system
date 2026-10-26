/**
 * Sueños del Mundo de los avatares · Ola 1025U · U4. Módulo puro: el plan, el prompt, los topes, la memoria que
 * respeta su alcance, la creación para la crónica, los sueños automáticos y el saneado de lo que viene del disco.
 */
import { describe, expect, it } from "vitest";
import { configPorDefecto } from "@/lib/avatares/agente/config-agente";
import { crearAgenteMundoRef, type AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import {
  AJUSTES_SUENOS_DEFECTO, HORA_MS, TIPO_CREACION_SUENO, TOPES_SUENO,
  alcanceDeRecuerdo, candidatoAutomatico, comprobarTopes, empujesDeSueno, enLaUltimaHora, limpiarTurno, nuevoSueno,
  planSueno, promptTurno, puedeRecordarLinea, registrarInicio, registrarLlamada, resultadoACreacion, sanearSueno,
  sanearSuenos, sanearUso, siguienteAutor, textoRecuerdo, usoVacio,
  type Sueno,
} from "../sueno";

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);

const luna = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "luna", nombre: "Luna", dueno: { tipo: "perfil", id: "p1" } });
const sol = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "sol", nombre: "Sol", dueno: { tipo: "perfil", id: "p1" } });
const pagina = crearAgenteMundoRef({ origen: "bot", idOrigen: "pg1", nombre: "Voz de la Página", dueno: { tipo: "pagina", id: "pagina-1" } });
const grupoA1 = crearAgenteMundoRef({ origen: "agente-grupo", idOrigen: "ga1", nombre: "Guía A", dueno: { tipo: "grupo", id: "grupo-a" } });
const grupoA2 = crearAgenteMundoRef({ origen: "agente-grupo", idOrigen: "ga2", nombre: "Guía A2", dueno: { tipo: "grupo", id: "grupo-a" } });
const grupoB = crearAgenteMundoRef({ origen: "agente-grupo", idOrigen: "gb1", nombre: "Guía B", dueno: { tipo: "grupo", id: "grupo-b" } });

function seis(): AgenteMundoRef[] {
  return Array.from({ length: 6 }, (_, i) =>
    crearAgenteMundoRef({ origen: "personalidad", idOrigen: `p${i}`, nombre: `Agente ${i}`, dueno: { tipo: "perfil", id: "p1" } }));
}

function plan(participantes: AgenteMundoRef[], tema = "un puente de luz") {
  const r = planSueno(participantes, tema);
  if (!r.ok) throw new Error(r.motivo);
  return r.plan;
}

function suenoCompleto(participantes: AgenteMundoRef[], tema = "un puente de luz"): Sueno {
  const p = plan(participantes, tema);
  const s = nuevoSueno(p, "esc-1", "manual", T0);
  return {
    ...s,
    estado: "completo",
    terminadoEn: T0 + 5000,
    turnos: p.orden.map((autorId, i) => ({
      autorId,
      autorNombre: participantes.find((x) => x.id === autorId)!.nombre,
      texto: `Línea ${i} de ${autorId}`,
      at: T0 + i,
    })),
  };
}

describe("planSueno", () => {
  it("sin nadie o sin tema, dice qué falta", () => {
    expect(planSueno([], "algo")).toEqual({ ok: false, motivo: expect.stringMatching(/al menos un agente/i) });
    expect(planSueno([luna], "   ")).toEqual({ ok: false, motivo: expect.stringMatching(/tema/i) });
  });

  it("uno solo es un sueño individual de tres turnos suyos", () => {
    const p = plan([luna]);
    expect(p.tipo).toBe("individual");
    expect(p.orden).toEqual([luna.id, luna.id, luna.id]);
  });

  it("de dos a seis es colectivo: dos rondas, en el orden dado", () => {
    const p = plan([luna, sol]);
    expect(p.tipo).toBe("colectivo");
    expect(p.orden).toEqual([luna.id, sol.id, luna.id, sol.id]);
    const seisAgentes = seis();
    expect(plan(seisAgentes).orden).toHaveLength(12);
  });

  it("nunca más de seis agentes ni más de doce turnos", () => {
    const siete = [...seis(), crearAgenteMundoRef({ origen: "bot", idOrigen: "extra", nombre: "Extra", dueno: { tipo: "pagina", id: "x" } })];
    expect(planSueno(siete, "algo")).toEqual({ ok: false, motivo: expect.stringMatching(/como mucho 6/i) });
    expect(plan(seis()).orden.length).toBeLessThanOrEqual(TOPES_SUENO.turnosMax);
  });

  it("los repetidos cuentan una vez (dos veces el mismo agente sigue siendo individual)", () => {
    expect(plan([luna, luna]).tipo).toBe("individual");
  });

  it("el tema se limpia (sin comillas ni marcas) y se acota", () => {
    const p = plan([luna], `«Un "puente" de <luz>» ${"x".repeat(300)}`);
    expect(p.tema).not.toMatch(/[«»"<>]/);
    expect(p.tema.length).toBeLessThanOrEqual(TOPES_SUENO.caracteresTema);
  });
});

describe("nuevoSueno y siguienteAutor", () => {
  it("nace en curso, sin turnos, con todos los participantes como Bot de IA y un id que no repite", () => {
    const p = plan([luna, sol]);
    const s = nuevoSueno(p, "esc-1", "manual", T0);
    expect(s).toMatchObject({ estado: "en-curso", turnos: [], escenarioId: "esc-1", origen: "manual", creadoEn: T0, tipo: "colectivo" });
    expect(s.participantes.every((x) => x.esBotIA === true)).toBe(true);
    const otro = nuevoSueno(p, "esc-1", "manual", T0, new Set([s.id]));
    expect(otro.id).not.toBe(s.id);
  });

  it("el siguiente autor sigue el orden y se acaba al llegar al final", () => {
    const s = nuevoSueno(plan([luna, sol]), "esc-1", "manual", T0);
    expect(siguienteAutor(s)?.id).toBe(luna.id);
    const dos = { ...s, turnos: [{ autorId: luna.id, autorNombre: "Luna", texto: "a", at: 1 }, { autorId: sol.id, autorNombre: "Sol", texto: "b", at: 2 }] };
    expect(siguienteAutor(dos)?.id).toBe(luna.id);
    expect(siguienteAutor({ ...s, turnos: Array.from({ length: 4 }, () => dos.turnos[0]) })).toBeNull();
  });
});

describe("limpiarTurno", () => {
  it("quita el nombre que el modelo antepone, las comillas y los saltos de línea", () => {
    expect(limpiarTurno("Luna: «Veo un puente»\n de luz", "Luna")).toBe("Veo un puente de luz");
    expect(limpiarTurno("**Luna** - sigo soñando", "Luna")).toBe("sigo soñando");
    expect(limpiarTurno("**Luna:** sigo soñando", "Luna")).toBe("sigo soñando");
    expect(limpiarTurno("Luna sigue soñando", "Luna")).toBe("Luna sigue soñando");
  });

  it("corta a 400 caracteres en una palabra entera", () => {
    const largo = Array.from({ length: 200 }, (_, i) => `palabra${i}`).join(" ");
    const t = limpiarTurno(largo, "Luna");
    expect(t.length).toBeLessThanOrEqual(TOPES_SUENO.caracteresTurno);
    expect(t).toMatch(/palabra\d+$/);
  });

  it("lo que no es texto da vacío", () => {
    expect(limpiarTurno(undefined)).toBe("");
    expect(limpiarTurno("   ")).toBe("");
  });
});

describe("promptTurno", () => {
  it("el sistema lleva la ficha del agente y las reglas del sueño; el usuario, el hilo y a quién le toca", () => {
    const s = nuevoSueno(plan([luna, sol], "las estrellas"), "esc-1", "manual", T0);
    const m = promptTurno(luna, { ...s, turnos: [{ autorId: sol.id, autorNombre: "Sol", texto: "Veo una escalera", at: 1 }] }, configPorDefecto(luna));
    expect(m).toHaveLength(2);
    expect(m[0].role).toBe("system");
    expect(m[0].content).toMatch(/Eres «Luna», una IA \(bot\)/);
    expect(m[0].content).toMatch(/sueño compartido/);
    expect(m[0].content).toMatch(/Sol/);
    expect(m[0].content).toMatch(/no hechos/);
    expect(m[0].content).toMatch(/las estrellas/);
    expect(m[1].role).toBe("user");
    expect(m[1].content).toMatch(/Sol: Veo una escalera/);
    expect(m[1].content).toMatch(/Es tu turno, Luna\./);
  });

  it("el sueño individual no menciona a otros y el primer turno abre el sueño", () => {
    const s = nuevoSueno(plan([luna], "el mar"), "esc-1", "manual", T0);
    const m = promptTurno(luna, s, configPorDefecto(luna));
    expect(m[0].content).toMatch(/sueño individual/);
    expect(m[1].content).toMatch(/abre el sueño tú/);
  });

  it("no mete memoria de nadie: solo lo dicho en este sueño", () => {
    const s = nuevoSueno(plan([luna, sol]), "esc-1", "manual", T0);
    const c = configPorDefecto(luna);
    const texto = JSON.stringify(promptTurno(luna, s, c));
    expect(texto).not.toMatch(/recuerd/i);
  });
});

describe("resultadoACreacion", () => {
  it("un sueño completo deja una creación por autor, con su tipo y un id propio", () => {
    const s = suenoCompleto([luna, sol], "las estrellas");
    const c = resultadoACreacion(s, 42);
    expect(c.map((x) => x.autor).sort()).toEqual([luna.id, sol.id].sort());
    for (const x of c) {
      expect(x).toMatchObject({ tipo: TIPO_CREACION_SUENO, tick: 42 });
      expect(x.titulo).toBe("Sueño compartido: las estrellas");
      expect(x.id.startsWith(`sueno:${s.id}:`)).toBe(true);
    }
    expect(resultadoACreacion(suenoCompleto([luna]), 1)[0].titulo).toBe("Sueño: un puente de luz");
  });

  it("uno cancelado, cortado o sin turnos no es una obra", () => {
    const s = suenoCompleto([luna, sol]);
    for (const estado of ["cancelado", "sin-ia", "interrumpido", "en-curso"] as const) {
      expect(resultadoACreacion({ ...s, estado }, 1)).toEqual([]);
    }
    expect(resultadoACreacion({ ...s, turnos: [] }, 1)).toEqual([]);
  });
});

describe("memoria: cada quien recuerda dentro de su alcance", () => {
  it("el alcance más privado donde puede escribir: personal, de grupo o público", () => {
    expect(alcanceDeRecuerdo(luna)).toBe("personal");
    expect(alcanceDeRecuerdo(grupoA1)).toBe("grupo");
    expect(alcanceDeRecuerdo(pagina)).toBe("publica");
  });

  it("lo dicho por un agente solo viaja a un recuerdo igual o más privado", () => {
    expect(puedeRecordarLinea(luna, pagina)).toBe(true); // lo público cabe en lo personal
    expect(puedeRecordarLinea(pagina, luna)).toBe(false); // lo personal NO sale a un recuerdo público
    expect(puedeRecordarLinea(grupoA1, luna)).toBe(false); // ni a uno de grupo
    expect(puedeRecordarLinea(luna, luna)).toBe(true);
  });

  it("entre dos agentes de grupo, solo del mismo grupo", () => {
    expect(puedeRecordarLinea(grupoA1, grupoA2)).toBe(true);
    expect(puedeRecordarLinea(grupoA1, grupoB)).toBe(false);
  });

  it("el recuerdo de un agente público no lleva lo que dijo uno personal; el del personal sí lleva lo público", () => {
    const s = suenoCompleto([luna, pagina], "las estrellas");
    const dePagina = textoRecuerdo(s, pagina);
    expect(dePagina).toMatch(/Soñé con Luna sobre las estrellas/);
    expect(dePagina).toMatch(/Yo dije:/);
    expect(dePagina).not.toContain(`Línea 0 de ${luna.id}`);
    expect(dePagina).not.toMatch(/Luna:/);
    const deLuna = textoRecuerdo(s, luna);
    expect(deLuna).toMatch(/Voz de la Página:/);
  });

  it("un sueño a solas se recuerda a solas", () => {
    expect(textoRecuerdo(suenoCompleto([luna], "el mar"), luna)).toMatch(/^Soñé a solas sobre el mar\./);
  });

  it("la experiencia empuja poco, solo si habló: curiosidad y empatía en compartido, curiosidad y foco a solas", () => {
    const comp = suenoCompleto([luna, sol]);
    expect(empujesDeSueno(comp, luna)).toEqual({ curiosidad: 0.01, empatia: 0.01 });
    expect(empujesDeSueno(suenoCompleto([luna]), luna)).toEqual({ curiosidad: 0.01, foco: 0.01 });
    expect(empujesDeSueno({ ...comp, turnos: [] }, luna)).toEqual({});
    for (const v of Object.values(empujesDeSueno(comp, sol))) expect(Math.abs(v!)).toBeLessThanOrEqual(0.01);
  });
});

describe("topes por hora", () => {
  const configDe = (a: AgenteMundoRef) => configPorDefecto(a);
  const base = (over: Partial<Parameters<typeof comprobarTopes>[0]> = {}) => ({
    uso: usoVacio(), participantes: [luna, sol], orden: [luna.id, sol.id, luna.id, sol.id], configDe, ahora: T0, automatico: false, ...over,
  });

  it("con el uso vacío cabe", () => {
    expect(comprobarTopes(base())).toEqual({ ok: true });
  });

  it("seis sueños en la última hora llenan el tope global; pasada la hora vuelve a caber", () => {
    let uso = usoVacio();
    for (let i = 0; i < TOPES_SUENO.suenosPorHora; i++) uso = registrarInicio(uso, [pagina], false, T0 - i * 1000);
    const v = comprobarTopes(base({ uso }));
    expect(v).toMatchObject({ ok: false, tope: "global" });
    expect(comprobarTopes(base({ uso, ahora: T0 + HORA_MS + 5000 }))).toEqual({ ok: true });
  });

  it("un agente no sueña más de tres veces por hora", () => {
    let uso = usoVacio();
    for (let i = 0; i < TOPES_SUENO.suenosPorAgentePorHora; i++) uso = registrarInicio(uso, [luna], false, T0 - i * 1000);
    const v = comprobarTopes(base({ uso }));
    expect(v).toMatchObject({ ok: false, tope: "agente" });
    expect(v.ok === false && v.motivo).toMatch(/Luna/);
    expect(comprobarTopes(base({ uso, participantes: [sol, pagina], orden: [sol.id, pagina.id] }))).toEqual({ ok: true });
  });

  it("los automáticos tienen además su propio tope", () => {
    let uso = usoVacio();
    for (let i = 0; i < TOPES_SUENO.automaticosPorHora; i++) uso = registrarInicio(uso, [pagina], true, T0 - i * 1000);
    expect(comprobarTopes(base({ uso, automatico: true }))).toMatchObject({ ok: false, tope: "automaticos" });
    expect(comprobarTopes(base({ uso, automatico: false }))).toEqual({ ok: true });
  });

  it("el tope de llamadas de la ficha del agente cuenta los turnos que el plan le pide", () => {
    const poca = (a: AgenteMundoRef) => {
      const c = configPorDefecto(a);
      return { ...c, motores: { ...c.motores, topePorHora: 3 } };
    };
    // Luna ya hizo 2 llamadas; este plan le pide 2 más: 4 > 3.
    let uso = usoVacio();
    uso = registrarLlamada(registrarLlamada(uso, luna.id, T0 - 1000), luna.id, T0 - 500);
    expect(comprobarTopes(base({ uso, configDe: poca }))).toMatchObject({ ok: false, tope: "llamadas" });
    // Con una sola llamada hecha caben las dos del plan.
    expect(comprobarTopes(base({ uso: registrarLlamada(usoVacio(), luna.id, T0 - 1000), configDe: poca }))).toEqual({ ok: true });
  });

  it("el uso guardado se sanea: tira lo que pasó de la hora, lo futuro y la basura", () => {
    const u = sanearUso({ inicios: [T0 - HORA_MS - 1, T0 - 10, "x", T0 + 10 * HORA_MS, null], automaticos: "no", participaciones: { a: [T0 - 5], b: "xx" }, llamadas: 7 }, T0);
    expect(u.inicios).toEqual([T0 - 10]);
    expect(u.automaticos).toEqual([]);
    expect(u.participaciones).toEqual({ a: [T0 - 5] });
    expect(u.llamadas).toEqual({});
    expect(sanearUso(undefined, T0)).toEqual(usoVacio());
    expect(enLaUltimaHora([T0 - 10, T0 - 2 * HORA_MS], T0)).toBe(1);
  });
});

describe("sueños automáticos: nacen de un encuentro entre dos que ya se conocen", () => {
  const agentes = new Map([luna, sol, pagina].map((a) => [a.id, a] as const));
  const habitantes = (v: number) => [
    { id: luna.id, vinculos: { [sol.id]: v } },
    { id: sol.id, vinculos: {} },
    { id: pagina.id, vinculos: {} },
  ];
  const e = (over: Partial<Parameters<typeof candidatoAutomatico>[0]> = {}) => ({
    encuentros: [{ a: luna.id, b: sol.id, tick: 10, tema: "hablaron del mar" }],
    desdeTick: 5, tickActual: 12, habitantes: habitantes(0.4), agentes, recientes: [], ahora: T0, ...over,
  });

  it("apagado de fábrica", () => {
    expect(AJUSTES_SUENOS_DEFECTO.automaticos).toBe(false);
  });

  it("un encuentro nuevo con vínculo suficiente da candidato, con el tema de su encuentro", () => {
    expect(candidatoAutomatico(e())).toMatchObject({ a: luna, b: sol, tema: "hablaron del mar", tick: 10 });
  });

  it("sin vínculo suficiente, con el encuentro ya visto, o demasiado viejo, no hay candidato", () => {
    expect(candidatoAutomatico(e({ habitantes: habitantes(0.1) }))).toBeNull();
    expect(candidatoAutomatico(e({ desdeTick: 10 }))).toBeNull();
    expect(candidatoAutomatico(e({ tickActual: 10 + TOPES_SUENO.antiguedadMaxEncuentroTicks + 1 }))).toBeNull();
  });

  it("la misma pareja no sueña dos veces seguidas dentro del enfriamiento", () => {
    const reciente = { participantes: [luna, sol], creadoEn: T0 - 60_000 };
    expect(candidatoAutomatico(e({ recientes: [reciente] }))).toBeNull();
    expect(candidatoAutomatico(e({ recientes: [{ ...reciente, creadoEn: T0 - TOPES_SUENO.enfriamientoParMs - 1 }] }))).not.toBeNull();
  });

  it("un encuentro con alguien que ya no vive aquí, o sin tema, se salta", () => {
    expect(candidatoAutomatico(e({ encuentros: [{ a: luna.id, b: "bot:fantasma", tick: 10, tema: "x" }] }))).toBeNull();
    expect(candidatoAutomatico(e({ encuentros: [{ a: luna.id, b: sol.id, tick: 10, tema: "   " }] }))).toBeNull();
  });
});

describe("saneado de lo que viene del disco", () => {
  const completo = suenoCompleto([luna, sol]);

  it("ida y vuelta de un sueño completo", () => {
    expect(sanearSueno(JSON.parse(JSON.stringify(completo)))).toEqual(completo);
  });

  it("un sueño «en curso» leído del disco pasó a «interrumpido»; al escribir se conserva", () => {
    const enCurso = { ...completo, estado: "en-curso" };
    const leido = sanearSueno(enCurso);
    expect(leido?.estado).toBe("interrumpido");
    expect(leido?.motivo).toMatch(/se cortó/i);
    expect(sanearSueno(enCurso, true)?.estado).toBe("en-curso");
  });

  it("los participantes se reconstruyen como Bot de IA y el tipo sale de cuántos son", () => {
    const sucio = { ...completo, tipo: "individual", participantes: completo.participantes.map((p) => ({ ...p, esBotIA: false })) };
    const s = sanearSueno(sucio)!;
    expect(s.tipo).toBe("colectivo");
    expect(s.participantes.every((p) => p.esBotIA === true)).toBe(true);
  });

  it("descarta turnos de quien no sueña, vacíos o rotos, y el texto sale limpio", () => {
    const s = sanearSueno({
      ...completo,
      turnos: [
        { autorId: "ajeno:x", texto: "no", at: 1 },
        { autorId: luna.id, texto: "   ", at: 2 },
        { autorId: luna.id, texto: "«Hola» `mundo`", at: 3 },
        "basura",
      ],
    })!;
    expect(s.turnos).toHaveLength(1);
    expect(s.turnos[0].texto).toBe("Hola mundo");
  });

  it("basura devuelve null y nunca lanza; sin id, tema, estado válido o participantes no hay sueño", () => {
    for (const malo of [null, 5, "x", [], {}, { ...completo, id: "" }, { ...completo, tema: "" }, { ...completo, estado: "volando" }, { ...completo, participantes: [] }]) {
      expect(sanearSueno(malo)).toBeNull();
    }
  });

  it("la lista: sin repetidos, de la más antigua a la más reciente y solo los últimos N", () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ({ ...completo, id: `s${i}`, creadoEn: T0 + i }));
    const l = sanearSuenos([...muchos, { ...muchos[3] }, "basura"]);
    expect(l).toHaveLength(TOPES_SUENO.guardadosPorEscenario);
    expect(l[l.length - 1].id).toBe("s19");
    expect(new Set(l.map((x) => x.id)).size).toBe(l.length);
    expect(sanearSuenos("no es una lista")).toEqual([]);
  });
});
