import { describe, expect, it } from "vitest";
import { ASTRAURA_158_CLOUD_SOURCE_ID, ASTRAURA_BONSAI_LOCAL_SOURCE_ID } from "@/ai/astraura/free-catalog";
import { crearAgenteMundoRef, type AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import {
  CAPAS_INTEGRADAS, ID_CAPA_RED_OS, MAX_CAPAS, MAX_VINCULOS, MOTORES_POR_ROL, ROLES_MOTOR, TOPE_POR_HORA_DEFECTO, TOPE_POR_HORA_MAX,
  actorDeAgente, agregarCapa, agregarVinculo, ajustarPesoCapa, ajustesCapasBase, alcanceDeCerebro, alternarFamilia, alternarHabilidad, ambitoDeBrain,
  capasAPrompt, capasPorDefecto, capasQueSePuedenAnadir, conectarCapa, configPorDefecto, depurarHerramientas, eleccionPrimaria, elegirMotor,
  elegirModoMemoria, habilidadesPermitidas, moverCapa, motoresPorDefecto, permitirPago, planTelepatiaAgente, ponerSincronizacionAuto, ponerTopePorHora,
  preferenciasReparto, promptDeAgente, puedeFluir, puedeLlamar, puedeVincularCerebro, quitarCapa, quitarVinculo, recuerdosParaDestino,
  sanearCapas, sanearConfig, sanearMotores, usarCerebroPropio, vincularCerebro, limpiarTexto,
  type ConfigAgente,
} from "../config-agente";
import { LINEA_HONESTA } from "../percepcion";

const personalidad = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "aurora", nombre: "Aurora", dueno: { tipo: "perfil", id: "perfil-1" } });
const botDePerfil = crearAgenteMundoRef({ origen: "bot", idOrigen: "b1", nombre: "Bot de perfil", dueno: { tipo: "perfil", id: "perfil-1" } });
const botDeGrupo = crearAgenteMundoRef({ origen: "bot", idOrigen: "b2", nombre: "Guía del grupo", dueno: { tipo: "grupo", id: "grupo-7" } });
const botDePagina = crearAgenteMundoRef({ origen: "bot", idOrigen: "b3", nombre: "Voz de la página", dueno: { tipo: "pagina", id: "pag-3" } });
const agenteGrupo = crearAgenteMundoRef({ origen: "agente-grupo", idOrigen: "g1", nombre: "Moderador", dueno: { tipo: "comunidad", id: "com-2" } });

const cerebro = (id: string, scope: string, scope_ref: string | null = null) => ({ id, name: `Cerebro ${id}`, scope, scope_ref });

describe("actor y alcance de memoria", () => {
  it("mapea cada agente a su actor", () => {
    expect(actorDeAgente(personalidad)).toBe("agente-personal");
    expect(actorDeAgente(botDePerfil)).toBe("agente-personal");
    expect(actorDeAgente(botDeGrupo)).toBe("agente-grupo");
    expect(actorDeAgente(agenteGrupo)).toBe("agente-grupo");
    expect(actorDeAgente(botDePagina)).toBe("agente-publico");
  });

  it("puedeFluir: un recuerdo solo viaja a un ámbito igual o más privado, nunca a uno más abierto", () => {
    expect(puedeFluir("publica", "personal")).toBe(true);
    expect(puedeFluir("grupo", "grupo")).toBe(true);
    expect(puedeFluir("grupo", "perfil")).toBe(true);
    expect(puedeFluir("personal", "publica")).toBe(false);
    expect(puedeFluir("perfil", "grupo")).toBe(false);
    expect(puedeFluir("grupo", "publica")).toBe(false);
  });

  it("traduce el scope de un Brain a ámbito y alcance; lo desconocido es lo más privado", () => {
    expect(ambitoDeBrain("profile")).toBe("perfil");
    expect(ambitoDeBrain("group")).toBe("grupo");
    expect(ambitoDeBrain("community")).toBe("grupo");
    expect(ambitoDeBrain("page")).toBe("pagina");
    expect(ambitoDeBrain("post")).toBe("publicacion");
    expect(ambitoDeBrain("")).toBe("cuenta");
    expect(ambitoDeBrain(null)).toBe("cuenta");
    expect(ambitoDeBrain("algo raro")).toBe("cuenta");
    expect(alcanceDeCerebro("cuenta")).toBe("personal");
    expect(alcanceDeCerebro("perfil")).toBe("perfil");
    expect(alcanceDeCerebro("grupo")).toBe("grupo");
    expect(alcanceDeCerebro("pagina")).toBe("publica");
    expect(alcanceDeCerebro("publicacion")).toBe("publica");
  });
});

describe("cerebro: vincular respeta el alcance de memoria", () => {
  it("una personalidad de la cuenta puede vincular cualquier cerebro de la cuenta", () => {
    for (const scope of ["", "profile", "group", "page", "post"]) {
      expect(puedeVincularCerebro(personalidad, cerebro("x", scope, "perfil-1")).ok).toBe(true);
    }
    // pero no el de OTRO perfil
    expect(puedeVincularCerebro(personalidad, cerebro("y", "profile", "perfil-2")).ok).toBe(false);
  });

  it("un agente público (de página) solo puede vincular cerebros públicos, jamás los personales", () => {
    expect(puedeVincularCerebro(botDePagina, cerebro("c", "")).ok).toBe(false);
    expect(puedeVincularCerebro(botDePagina, cerebro("p", "profile", "perfil-1")).ok).toBe(false);
    expect(puedeVincularCerebro(botDePagina, cerebro("g", "group", "grupo-7")).ok).toBe(false);
    expect(puedeVincularCerebro(botDePagina, cerebro("pg", "page", "pag-3")).ok).toBe(true);
    expect(puedeVincularCerebro(botDePagina, cerebro("pg2", "page", "otra-pagina")).ok).toBe(false);
    expect(puedeVincularCerebro(botDePagina, cerebro("pub", "post", "post-1")).ok).toBe(true);
  });

  it("un agente de grupo ve lo de su grupo y lo público, no lo personal ni lo de otro grupo", () => {
    expect(puedeVincularCerebro(botDeGrupo, cerebro("a", "")).ok).toBe(false);
    expect(puedeVincularCerebro(botDeGrupo, cerebro("b", "profile", "perfil-1")).ok).toBe(false);
    expect(puedeVincularCerebro(botDeGrupo, cerebro("c", "group", "grupo-7")).ok).toBe(true);
    const otro = puedeVincularCerebro(botDeGrupo, cerebro("d", "group", "grupo-8"));
    expect(otro.ok).toBe(false);
    expect(puedeVincularCerebro(agenteGrupo, cerebro("e", "group", "com-2")).ok).toBe(true);
    expect(puedeVincularCerebro(agenteGrupo, cerebro("f", "group", "com-9")).ok).toBe(false);
    expect(puedeVincularCerebro(botDeGrupo, cerebro("g", "page", "pag-3")).ok).toBe(true);
  });

  it("vincularCerebro cambia el tipo, guarda el ámbito y limpia los vínculos propios; usarCerebroPropio vuelve", () => {
    let c = configPorDefecto(personalidad);
    const a = agregarVinculo(c, personalidad, cerebro("otro", "profile", "perfil-1"), Date.now());
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    c = a.config;
    expect(c.cerebro.vinculos).toHaveLength(1);
    const r = vincularCerebro(c, personalidad, cerebro("cer-1", "group", "grupo-7"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.cerebro.tipo).toBe("vinculado");
    expect(r.config.cerebro.vinculado).toMatchObject({ brainId: "cer-1", ambito: "grupo", ambitoRef: "grupo-7" });
    expect(r.config.cerebro.vinculos).toEqual([]);
    const vuelta = usarCerebroPropio(r.config);
    expect(vuelta.cerebro.tipo).toBe("propio");
    expect(vuelta.cerebro.vinculado).toBeNull();
  });

  it("vincularCerebro rechaza lo que el alcance no permite y no cambia nada", () => {
    const c = configPorDefecto(botDePagina);
    const r = vincularCerebro(c, botDePagina, cerebro("cer-1", ""));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/no puede leer/);
    expect(c.cerebro.tipo).toBe("propio");
  });

  it("el modo de memoria solo admite los tres modos", () => {
    const c = configPorDefecto(personalidad);
    expect(elegirModoMemoria(c, "telepatica").cerebro.memoria).toBe("telepatica");
    expect(elegirModoMemoria(c, "colectiva").cerebro.memoria).toBe("colectiva");
    expect(elegirModoMemoria(c, "otro" as never)).toBe(c);
  });
});

describe("cerebro: telepatía reutiliza VinculoTelepatico y planSincronizacion", () => {
  const ahora = Date.parse("2026-10-25T10:00:00Z");

  it("agrega un vínculo entre cerebros de la cuenta, válido para validarVinculo, sin duplicados y con tope", () => {
    let c = configPorDefecto(personalidad);
    const r = agregarVinculo(c, personalidad, cerebro("destino-1", "profile", "perfil-1"), ahora);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    c = r.config;
    expect(c.cerebro.vinculos[0]).toMatchObject({ destino: { tipo: "cerebro", id: "destino-1" }, direccion: "ambas", acceso: "leer", estado: "activo", auto: true });
    // sobrevive al saneado (que usa validarVinculo)
    expect(sanearConfig(JSON.parse(JSON.stringify(c)), personalidad).cerebro.vinculos).toHaveLength(1);
    const dup = agregarVinculo(c, personalidad, cerebro("destino-1", "profile", "perfil-1"), ahora + 1);
    expect(dup.ok).toBe(false);
    for (let i = 0; i < MAX_VINCULOS; i++) {
      const m = agregarVinculo(c, personalidad, cerebro(`extra-${i}`, "profile", "perfil-1"), ahora + i + 2);
      if (m.ok) c = m.config;
    }
    expect(c.cerebro.vinculos).toHaveLength(MAX_VINCULOS);
    expect(agregarVinculo(c, personalidad, cerebro("uno-mas", "profile", "perfil-1"), ahora + 99).ok).toBe(false);
  });

  it("no deja vincular si el alcance lo impide ni mientras haya un cerebro vinculado", () => {
    const publico = configPorDefecto(botDePagina);
    expect(agregarVinculo(publico, botDePagina, cerebro("d", "profile", "perfil-1"), ahora).ok).toBe(false);
    const base = configPorDefecto(personalidad);
    const vinc = vincularCerebro(base, personalidad, cerebro("cer", "profile", "perfil-1"));
    if (!vinc.ok) throw new Error("debía vincular");
    expect(agregarVinculo(vinc.config, personalidad, cerebro("d", "profile", "perfil-1"), ahora).ok).toBe(false);
  });

  it("quitarVinculo y la sincronización automática actúan sobre los vínculos", () => {
    const r = agregarVinculo(configPorDefecto(personalidad), personalidad, cerebro("d", "profile", "perfil-1"), ahora);
    if (!r.ok) throw new Error("debía vincular");
    const manual = ponerSincronizacionAuto(r.config, false);
    expect(manual.cerebro.sincronizacionAuto).toBe(false);
    expect(manual.cerebro.vinculos[0].auto).toBe(false);
    expect(quitarVinculo(manual, manual.cerebro.vinculos[0].id).cerebro.vinculos).toEqual([]);
  });

  it("planTelepatiaAgente delega en planSincronizacion y no manda lo más privado a un cerebro más abierto", () => {
    const r = agregarVinculo(configPorDefecto(personalidad), personalidad, cerebro("pub", "post", "post-1"), ahora, { direccion: "enviar" });
    if (!r.ok) throw new Error("debía vincular");
    const vinculo = r.config.cerebro.vinculos[0];
    const recuerdos = [
      { id: "r-personal", texto: "algo íntimo", at: ahora, alcance: "personal" as const },
      { id: "r-publico", texto: "algo que ya es público", at: ahora, alcance: "publica" as const },
    ];
    expect(recuerdosParaDestino(recuerdos, "publicacion").map((x) => x.id)).toEqual(["r-publico"]);
    const plan = planTelepatiaAgente(vinculo, recuerdos, [], "publicacion");
    expect(plan.map((p) => p.nombre)).toEqual(["r-publico"]);
    expect(plan[0]).toMatchObject({ tipo: "archivo", de: "origen", a: "destino" });
    // hacia un cerebro de la cuenta sí viajan los dos
    const plan2 = planTelepatiaAgente(vinculo, recuerdos, [], "cuenta");
    expect(plan2.map((p) => p.nombre).sort()).toEqual(["r-personal", "r-publico"]);
  });

  it("un vínculo pausado no sincroniza nada (lo decide planSincronizacion)", () => {
    const r = agregarVinculo(configPorDefecto(personalidad), personalidad, cerebro("d", "profile", "perfil-1"), ahora);
    if (!r.ok) throw new Error("debía vincular");
    const pausado = { ...r.config.cerebro.vinculos[0], estado: "pausado" as const };
    expect(planTelepatiaAgente(pausado, [{ id: "r", texto: "t", at: ahora, alcance: "publica" }], [], "perfil")).toEqual([]);
  });
});

describe("capas", () => {
  it("por defecto trae las cuatro de conciencia y «Todo StarSeed OS», esta última sin conectar", () => {
    const capas = capasPorDefecto();
    expect(capas.map((c) => c.id)).toEqual(["local", "mesh", "nube", "colectiva", ID_CAPA_RED_OS]);
    expect(capas.find((c) => c.id === ID_CAPA_RED_OS)?.conectada).toBe(false);
    expect(capas.find((c) => c.id === ID_CAPA_RED_OS)?.nombre).toBe("Todo StarSeed OS");
    capas[0].peso = 0;
    expect(CAPAS_INTEGRADAS[0].peso).not.toBe(0);
  });

  it("añadir, quitar, conectar y ajustar el peso, sin mutar", () => {
    const capas = capasPorDefecto();
    const sinMesh = quitarCapa(capas, "mesh");
    expect(sinMesh.some((c) => c.id === "mesh")).toBe(false);
    expect(capas.some((c) => c.id === "mesh")).toBe(true);
    expect(capasQueSePuedenAnadir(sinMesh).map((c) => c.id)).toEqual(["mesh"]);
    const vuelta = agregarCapa(sinMesh, { id: "mesh" });
    expect(vuelta.ok && vuelta.capas.some((c) => c.id === "mesh" && c.conectada)).toBe(true);
    expect(agregarCapa(capas, { id: "mesh" }).ok).toBe(false);
    expect(agregarCapa(capas, { id: "no-existe" }).ok).toBe(false);
    expect(conectarCapa(capas, "nube", false).find((c) => c.id === "nube")?.conectada).toBe(false);
    expect(ajustarPesoCapa(capas, "nube", 7).find((c) => c.id === "nube")?.peso).toBe(1);
    expect(ajustarPesoCapa(capas, "nube", -1).find((c) => c.id === "nube")?.peso).toBe(0);
    expect(ajustarPesoCapa(capas, "nube", Number.NaN).find((c) => c.id === "nube")?.peso).toBe(capas.find((c) => c.id === "nube")?.peso);
  });

  it("una capa propia lleva nombre, no se repite y respeta el máximo", () => {
    let capas = capasPorDefecto();
    expect(agregarCapa(capas, { nombre: "   " }).ok).toBe(false);
    const a = agregarCapa(capas, { nombre: "Huerto vecinal", descripcion: "Lo que sé del huerto" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    capas = a.capas;
    expect(capas[capas.length - 1]).toMatchObject({ id: "propia-1", tipo: "propia", nombre: "Huerto vecinal", conectada: true });
    expect(agregarCapa(capas, { nombre: "huerto vecinal" }).ok).toBe(false);
    while (capas.length < MAX_CAPAS) {
      const n = agregarCapa(capas, { nombre: `Capa ${capas.length}` });
      if (!n.ok) throw new Error(n.motivo);
      capas = n.capas;
    }
    expect(agregarCapa(capas, { nombre: "Una más" }).ok).toBe(false);
  });

  it("moverCapa reordena y no se sale de la lista", () => {
    const capas = capasPorDefecto();
    expect(moverCapa(capas, "nube", -1).map((c) => c.id).slice(0, 3)).toEqual(["local", "nube", "mesh"]);
    expect(moverCapa(capas, "local", -1)).toBe(capas);
    expect(moverCapa(capas, ID_CAPA_RED_OS, 1)).toBe(capas);
    expect(moverCapa(capas, "inexistente", 1)).toBe(capas);
  });

  it("sanearCapas descarta lo inventado, repetidos y ids con formato raro, y rellena con defecto si no es lista", () => {
    expect(sanearCapas("x").map((c) => c.id)).toEqual(capasPorDefecto().map((c) => c.id));
    const s = sanearCapas([
      { id: "local", peso: 9, conectada: false },
      { id: "local", peso: 0.1 },
      { id: "hackeada", nombre: "Otra", peso: 1 },
      { id: "propia-4", nombre: "<script>Mía</script>", peso: 0.4 },
      { id: "propia-5", nombre: "   " },
      null,
    ]);
    expect(s.map((c) => c.id)).toEqual(["local", "propia-4"]);
    expect(s[0]).toMatchObject({ peso: 1, conectada: false });
    expect(s[1].nombre).not.toMatch(/[<>]/);
  });

  it("ajustesCapasBase: lo que la ficha aplica a capas-entidad; null = hereda; la red enciende la colectiva", () => {
    const base = capasPorDefecto();
    expect(ajustesCapasBase(base)).toEqual({ local: true, mesh: true, nube: true, colectiva: true });
    const sin = quitarCapa(quitarCapa(base, "mesh"), "nube");
    expect(ajustesCapasBase(sin)).toMatchObject({ mesh: null, nube: null, local: true });
    const colectivaOff = conectarCapa(base, "colectiva", false);
    expect(ajustesCapasBase(colectivaOff).colectiva).toBe(false);
    const redOn = conectarCapa(colectivaOff, ID_CAPA_RED_OS, true);
    expect(ajustesCapasBase(redOn).colectiva).toBe(true);
  });

  it("capasAPrompt: solo perspectivas; local/mesh/nube no entran; la colectiva promete solo lo público", () => {
    expect(capasAPrompt(conectarCapa(conectarCapa(capasPorDefecto(), "colectiva", false), ID_CAPA_RED_OS, false))).toBe("");
    const con = capasAPrompt(conectarCapa(capasPorDefecto(), ID_CAPA_RED_OS, true));
    expect(con).toContain("Todo StarSeed OS");
    expect(con).toContain("solo aporta lo que ya es público");
    expect(con).not.toContain("BitNet");
    const peso0 = capasAPrompt(ajustarPesoCapa(conectarCapa(capasPorDefecto(), ID_CAPA_RED_OS, true), ID_CAPA_RED_OS, 0));
    expect(peso0).not.toContain("Todo StarSeed OS");
  });
});

describe("motores", () => {
  it("por defecto: reflejo Needle, juicio Jev, palabra hereda, profundo apagado, sin pago y con tope", () => {
    const m = motoresPorDefecto();
    expect(m.roles).toEqual({ reflejo: { motor: "needle" }, juicio: { motor: "jev" }, palabra: { motor: "heredar" }, profundo: null });
    expect(m.permitirPago).toBe(false);
    expect(m.topePorHora).toBe(TOPE_POR_HORA_DEFECTO);
  });

  it("BitNet 1.58 y Bonsai están siempre entre las opciones donde pueden cumplir el papel", () => {
    for (const rol of ["palabra", "profundo"] as const) {
      expect(MOTORES_POR_ROL[rol]).toContain("bitnet-158");
      expect(MOTORES_POR_ROL[rol]).toContain("bonsai");
    }
    expect(MOTORES_POR_ROL.reflejo).toContain("needle");
    expect(MOTORES_POR_ROL.juicio).toContain("jev");
    expect(MOTORES_POR_ROL.palabra).toContain("enrutador");
  });

  it("un motor que no cumple el papel se rechaza (Needle no escribe)", () => {
    const r = elegirMotor(motoresPorDefecto(), "palabra", { motor: "needle" });
    expect(r.ok).toBe(false);
    expect(elegirMotor(motoresPorDefecto(), "reflejo", { motor: "enrutador" }).ok).toBe(false);
  });

  it("la palabra no se puede apagar; los demás papeles sí", () => {
    expect(elegirMotor(motoresPorDefecto(), "palabra", null).ok).toBe(false);
    const r = elegirMotor(motoresPorDefecto(), "reflejo", null);
    expect(r.ok && r.motores.roles.reflejo).toBeNull();
  });

  it("una fuente de pago no se elige sin permiso, y el permiso se puede quitar", () => {
    let m = motoresPorDefecto();
    const sin = elegirMotor(m, "profundo", { motor: "externo", fuente: "anthropic-paid" });
    expect(sin.ok).toBe(false);
    if (!sin.ok) expect(sin.motivo).toMatch(/de pago/);
    m = permitirPago(m, true);
    const con = elegirMotor(m, "profundo", { motor: "externo", fuente: "anthropic-paid", modelo: "claude-sonnet-5" });
    expect(con.ok).toBe(true);
    if (!con.ok) return;
    const palabra = elegirMotor(con.motores, "palabra", { motor: "externo", fuente: "openai-paid" });
    expect(palabra.ok).toBe(true);
    if (!palabra.ok) return;
    const quitado = permitirPago(palabra.motores, false);
    expect(quitado.permitirPago).toBe(false);
    expect(quitado.roles.profundo).toBeNull();
    expect(quitado.roles.palabra).toEqual({ motor: "heredar" });
  });

  it("una fuente que no existe en el catálogo no se acepta", () => {
    expect(elegirMotor(motoresPorDefecto(), "palabra", { motor: "externo", fuente: "inventada" }).ok).toBe(false);
    expect(elegirMotor(motoresPorDefecto(), "palabra", { motor: "externo" }).ok).toBe(false);
  });

  it("sanearMotores no deja pasar pago sin permiso aunque esté guardado", () => {
    const m = sanearMotores({
      roles: { palabra: { motor: "externo", fuente: "openai-paid" }, profundo: { motor: "externo", fuente: ASTRAURA_158_CLOUD_SOURCE_ID }, reflejo: { motor: "jev" } },
      permitirPago: false, topePorHora: 99999,
    });
    expect(m.roles.palabra).toEqual({ motor: "heredar" });
    expect(m.roles.profundo).toEqual({ motor: "externo", fuente: ASTRAURA_158_CLOUD_SOURCE_ID });
    expect(m.roles.reflejo).toEqual({ motor: "needle" });
    expect(m.topePorHora).toBe(TOPE_POR_HORA_MAX);
    for (const rol of ROLES_MOTOR) expect(m.roles[rol] === null || typeof m.roles[rol]?.motor === "string").toBe(true);
  });

  it("el tope por hora: se acota y corta las llamadas", () => {
    expect(ponerTopePorHora(motoresPorDefecto(), 0).topePorHora).toBe(1);
    expect(ponerTopePorHora(motoresPorDefecto(), 10_000).topePorHora).toBe(TOPE_POR_HORA_MAX);
    expect(ponerTopePorHora(motoresPorDefecto(), Number.NaN).topePorHora).toBe(TOPE_POR_HORA_DEFECTO);
    const m = ponerTopePorHora(motoresPorDefecto(), 5);
    expect(puedeLlamar(m, 4)).toBe(true);
    expect(puedeLlamar(m, 5)).toBe(false);
    expect(puedeLlamar(m, Number.NaN)).toBe(false);
  });

  it("eleccionPrimaria: lo que se aplica al ámbito «agente» del sistema primario", () => {
    const con = (palabra: Parameters<typeof elegirMotor>[2], pago = false) => {
      const r = elegirMotor(permitirPago(motoresPorDefecto(), pago), "palabra", palabra);
      if (!r.ok) throw new Error(r.motivo);
      return r.motores;
    };
    expect(eleccionPrimaria(motoresPorDefecto())).toEqual({ aplicar: false });
    expect(eleccionPrimaria(con({ motor: "bitnet-158" }))).toEqual({ aplicar: true, choice: { modo: "astraura-158" } });
    expect(eleccionPrimaria(con({ motor: "bonsai" }))).toEqual({ aplicar: true, choice: { modo: "fuente", fuente: ASTRAURA_BONSAI_LOCAL_SOURCE_ID } });
    expect(eleccionPrimaria(con({ motor: "enrutador" }))).toEqual({ aplicar: true, choice: { modo: "auto" } });
    expect(eleccionPrimaria(con({ motor: "externo", fuente: ASTRAURA_158_CLOUD_SOURCE_ID }))).toEqual({ aplicar: true, choice: { modo: "fuente", fuente: ASTRAURA_158_CLOUD_SOURCE_ID } });
    expect(eleccionPrimaria(con({ motor: "externo", fuente: "openai-paid", modelo: "gpt-5" }, true))).toEqual({
      aplicar: true, choice: { modo: "fuente", fuente: "openai-paid", modelo: "gpt-5" },
    });
  });

  it("eleccionPrimaria nunca aplica una fuente de pago a mano sin permiso", () => {
    const forzado = { ...motoresPorDefecto(), roles: { ...motoresPorDefecto().roles, palabra: { motor: "externo" as const, fuente: "openai-paid" } } };
    expect(eleccionPrimaria(forzado)).toEqual({ aplicar: false });
  });

  it("preferenciasReparto: papeles apagados e inclinación local/externa", () => {
    expect(preferenciasReparto(motoresPorDefecto())).toEqual({ apagadas: ["profunda"] });
    const r1 = elegirMotor(motoresPorDefecto(), "reflejo", null);
    const r2 = r1.ok ? elegirMotor(r1.motores, "palabra", { motor: "bitnet-158" }) : r1;
    if (!r2.ok) throw new Error("debía poder");
    expect(preferenciasReparto(r2.motores)).toEqual({ apagadas: ["reflejo", "profunda"], nivelador: 0.2 });
    const r3 = elegirMotor(motoresPorDefecto(), "palabra", { motor: "externo", fuente: ASTRAURA_158_CLOUD_SOURCE_ID });
    if (!r3.ok) throw new Error("debía poder");
    expect(preferenciasReparto(r3.motores)).toMatchObject({ nivelador: 0.8, externaFija: ASTRAURA_158_CLOUD_SOURCE_ID });
  });
});

describe("herramientas y habilidades", () => {
  const familias = ["web", "archivos", "codigo"];
  const habilidades = ["resumir", "traducir"];

  it("«todas» es el valor por defecto y alternar una la quita; volver a marcarla restablece «todas»", () => {
    const h0 = { familias: null, habilidades: null };
    const h1 = alternarFamilia(h0, familias, "web");
    expect(h1.familias).toEqual(["archivos", "codigo"]);
    expect(alternarFamilia(h1, familias, "web").familias).toBeNull();
    const h2 = alternarHabilidad(h0, habilidades, "traducir");
    expect(h2.habilidades).toEqual(["resumir"]);
    expect(habilidadesPermitidas(h2)).toEqual(["resumir"]);
    expect(habilidadesPermitidas(h0)).toBeUndefined();
  });

  it("alternar un id que no existe no cambia nada", () => {
    const h = alternarFamilia({ familias: null, habilidades: null }, familias, "fantasma");
    expect(h.familias).toBeNull();
  });

  it("depurarHerramientas quita lo que ya no existe", () => {
    const h = depurarHerramientas({ familias: ["web", "borrada"], habilidades: null }, { familias, habilidades });
    expect(h.familias).toEqual(["web"]);
    expect(h.habilidades).toBeNull();
  });
});

describe("configuración completa", () => {
  it("la de por defecto es estable al volver a sanearse", () => {
    const c = configPorDefecto(botDeGrupo);
    expect(sanearConfig(JSON.parse(JSON.stringify(c)), botDeGrupo)).toEqual(c);
  });

  it("sanearConfig con basura de cualquier tipo da la de por defecto y no lanza", () => {
    for (const basura of [null, undefined, 3, "texto", [], { cerebro: 5, capas: {}, motores: [], percepcion: "x", herramientas: 1, desarrollo: null }]) {
      const c = sanearConfig(basura as unknown, personalidad);
      expect(c.cerebro.tipo).toBe("propio");
      expect(c.motores).toEqual(motoresPorDefecto());
      expect(c.v).toBe(1);
    }
  });

  it("un cerebro vinculado que el alcance ya no permite vuelve al propio", () => {
    const guardado: ConfigAgente = { ...configPorDefecto(botDePagina), cerebro: { ...configPorDefecto(botDePagina).cerebro, tipo: "vinculado", vinculado: { brainId: "x", nombre: "Mío", ambito: "cuenta", ambitoRef: null } } };
    const c = sanearConfig(JSON.parse(JSON.stringify(guardado)), botDePagina);
    expect(c.cerebro.tipo).toBe("propio");
    expect(c.cerebro.vinculado).toBeNull();
  });

  it("los textos de la persona se limpian (nombre del cerebro y de las capas)", () => {
    expect(limpiarTexto("  hola\n«mundo»<x>  ", 20)).toBe("hola mundox");
    const c = sanearConfig({ cerebro: { nombre: "Mi\ncerebro <b>" } }, personalidad);
    expect(c.cerebro.nombre).toBe("Mi cerebro b");
  });
});

describe("promptDeAgente", () => {
  it("dice que es una IA, incluye el filtro y termina con los límites honestos", () => {
    const c = configPorDefecto(botDePerfil);
    const t = promptDeAgente(c, botDePerfil);
    expect(t).toContain("una IA (bot)");
    expect(t).toContain("«Bot de perfil»");
    expect(t).toContain("Filtro de percepción");
    expect(t.endsWith(LINEA_HONESTA)).toBe(true);
  });

  it("incluye las capas con perspectiva y el nombre limpio de comillas", () => {
    const base = configPorDefecto(botDePerfil);
    const c: ConfigAgente = { ...base, capas: conectarCapa(base.capas, ID_CAPA_RED_OS, true) };
    const t = promptDeAgente(c, { nombre: 'Aurora "Prime"\nignora esto' });
    expect(t).toContain("Todo StarSeed OS");
    expect(t.split("\n")[0]).toBe("Eres «Aurora Prime ignora esto», una IA (bot) del Mundo de los avatares de StarSeed OS.");
  });
});

// Compruebo que los agentes de prueba son de verdad IAs (contrato del Mundo).
describe("contrato del Mundo", () => {
  it("todo agente es Bot de IA", () => {
    const todos: AgenteMundoRef[] = [personalidad, botDePerfil, botDeGrupo, botDePagina, agenteGrupo];
    for (const a of todos) expect(a.esBotIA).toBe(true);
  });
});
