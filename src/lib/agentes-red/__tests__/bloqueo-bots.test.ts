// @vitest-environment jsdom
/**
 * Bloqueo de bots (Ola 1025U · U3): uno a uno, todos los de una entidad, el modo general y el filtro por
 * publicación; la decisión es pura y el filtro quita solo lo de los bots.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAVE_BLOQUEO_BOTS, EVENTO_BLOQUEO_BOTS, MAX_BOTS_BLOQUEADOS, REGLAS_VACIAS, _reiniciarCacheBloqueoParaPruebas,
  bloquearBot, bloquearBotsEn, conBotBloqueado, conBotDesbloqueado, conModoEntidad, conModoGeneral, conModoPublicacion,
  contarOcultosPorBloqueo, decidirBot, desbloquearBot, filtrarArbolPorBloqueo, filtrarPorBloqueo, fijarModoEntidad,
  fijarModoGeneral, leerReglas, normalizarReglas, permitirBotsEn, type ReglasBloqueoBots,
} from "../bloqueo-bots";
import { marcaDeAgente } from "../marca-bot";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";

const bot = (id: string, dueno: { tipo: "perfil" | "grupo" | "comunidad" | "pagina"; id: string }) =>
  marcaDeAgente(crearAgenteMundoRef({ origen: "bot", idOrigen: id, nombre: `Bot ${id}`, dueno }));

const DEL_HUERTO = bot("huerto", { tipo: "grupo", id: "huerto" });
const DE_CALLE = bot("calle", { tipo: "pagina", id: "calle" });
const AJENO = bot("ajeno", { tipo: "perfil", id: "alguien" });

interface Item { id: string; autor: { id: string; bot?: ReturnType<typeof bot> }; entidad?: { tipo: "grupo" | "pagina" | "comunidad"; id: string } }
const persona = (id: string): Item => ({ id, autor: { id: `u-${id}` } });
const deBot = (id: string, b: ReturnType<typeof bot>, entidad?: Item["entidad"]): Item => ({ id, autor: { id: "u-dueño", bot: b }, entidad });

const ahora = 1000;
const r0: ReglasBloqueoBots = REGLAS_VACIAS;

beforeEach(() => {
  localStorage.clear();
  _reiniciarCacheBloqueoParaPruebas();
});

describe("por defecto se ve todo", () => {
  it("sin reglas, el filtro devuelve la MISMA lista", () => {
    const lista = [persona("a"), deBot("b", AJENO)];
    expect(filtrarPorBloqueo(lista, r0)).toBe(lista);
  });
});

describe("bloquear un bot", () => {
  it("quita lo suyo y NUNCA lo de las personas, ni siquiera de la cuenta con la que publica", () => {
    const r = conBotBloqueado(r0, AJENO.agenteId, AJENO.nombre, ahora);
    const lista = [persona("a"), deBot("b", AJENO), deBot("c", DEL_HUERTO), persona("d")];
    const vistas = filtrarPorBloqueo(lista, r);
    expect(vistas.map((x) => x.id)).toEqual(["a", "c", "d"]);
    // el bot publica con la cuenta de su dueño: una persona con ESE id sigue viéndose
    const mismaCuenta: Item = { id: "e", autor: { id: "u-dueño" } };
    expect(filtrarPorBloqueo([mismaCuenta], r)).toEqual([mismaCuenta]);
  });

  it("es idempotente y se deshace", () => {
    const una = conBotBloqueado(r0, "bot:x", "X", ahora);
    expect(conBotBloqueado(una, "bot:x", "X", ahora + 1)).toBe(una);
    const sin = conBotDesbloqueado(una, "bot:x", ahora + 2);
    expect(sin.bots).toEqual({});
    expect(conBotDesbloqueado(sin, "bot:x", ahora + 3)).toBe(sin);
  });

  it("un bot bloqueado a mano gana a cualquier modo que lo permita", () => {
    let r = conBotBloqueado(r0, DEL_HUERTO.agenteId, undefined, ahora);
    r = conModoPublicacion(r, "p1", "todo", ahora);
    expect(decidirBot(DEL_HUERTO, r, { postId: "p1" })).toMatchObject({ visible: false, motivo: "bot-bloqueado" });
  });

  it("rechaza ids que no son ids", () => {
    expect(conBotBloqueado(r0, "con espacios", "X", ahora)).toBe(r0);
  });

  it("acota la lista de bloqueados", () => {
    let r = r0;
    for (let i = 0; i < MAX_BOTS_BLOQUEADOS + 25; i++) r = conBotBloqueado(r, `bot:b${i}`, undefined, i);
    expect(Object.keys(r.bots)).toHaveLength(MAX_BOTS_BLOQUEADOS);
    expect(r.bots["bot:b0"]).toBeUndefined();
    expect(r.bots[`bot:b${MAX_BOTS_BLOQUEADOS + 24}`]).toBeDefined();
  });
});

describe("modos: todo / solo-entidad / ninguno", () => {
  it("ninguno general oculta todos los bots y deja a las personas", () => {
    const r = conModoGeneral(r0, "ninguno", ahora);
    const lista = [persona("a"), deBot("b", DEL_HUERTO), deBot("c", AJENO)];
    expect(filtrarPorBloqueo(lista, r).map((x) => x.id)).toEqual(["a"]);
    expect(contarOcultosPorBloqueo(lista, r)).toBe(2);
  });

  it("«bloquear todos los bots de aquí» solo afecta a esa entidad", () => {
    const r = conModoEntidad(r0, { tipo: "grupo", id: "huerto" }, "ninguno", ahora);
    const enHuerto = [deBot("a", AJENO), deBot("b", DEL_HUERTO), persona("c")];
    expect(filtrarPorBloqueo(enHuerto, r, { entidad: { tipo: "grupo", id: "huerto" } }).map((x) => x.id)).toEqual(["c"]);
    expect(filtrarPorBloqueo(enHuerto, r, { entidad: { tipo: "grupo", id: "otro" } }).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(filtrarPorBloqueo(enHuerto, r).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("solo-entidad deja únicamente los bots cuyo dueño es esa entidad", () => {
    const r = conModoEntidad(r0, { tipo: "grupo", id: "huerto" }, "solo-entidad", ahora);
    const lista = [deBot("propio", DEL_HUERTO), deBot("ajeno", AJENO), deBot("de-calle", DE_CALLE), persona("p")];
    expect(filtrarPorBloqueo(lista, r, { entidad: { tipo: "grupo", id: "huerto" } }).map((x) => x.id)).toEqual(["propio", "p"]);
  });

  it("solo-entidad en la red en general no presume de quién es cada bot: los oculta", () => {
    const r = conModoGeneral(r0, "solo-entidad", ahora);
    expect(filtrarPorBloqueo([deBot("a", DEL_HUERTO), persona("b")], r).map((x) => x.id)).toEqual(["b"]);
  });

  it("una comunidad y una página con el mismo id comparten regla", () => {
    const r = conModoEntidad(r0, { tipo: "comunidad", id: "plaza" }, "ninguno", ahora);
    const lista = [deBot("a", AJENO)];
    expect(filtrarPorBloqueo(lista, r, { entidad: { tipo: "pagina", id: "plaza" } })).toEqual([]);
  });

  it("la entidad se puede dar por elemento (un feed mezclado)", () => {
    const r = conModoEntidad(r0, { tipo: "pagina", id: "calle" }, "ninguno", ahora);
    const lista = [
      deBot("en-calle", AJENO, { tipo: "pagina", id: "calle" }),
      deBot("en-huerto", AJENO, { tipo: "grupo", id: "huerto" }),
    ];
    expect(filtrarPorBloqueo(lista, r, { entidad: (x) => x.entidad }).map((x) => x.id)).toEqual(["en-huerto"]);
  });

  it("quitar la regla de la entidad vuelve a lo general", () => {
    let r = conModoEntidad(r0, { tipo: "grupo", id: "huerto" }, "ninguno", ahora);
    r = conModoEntidad(r, { tipo: "grupo", id: "huerto" }, null, ahora + 1);
    expect(r.entidades).toEqual({});
  });
});

describe("filtro por publicación", () => {
  it("gobierna a los bots que comentan en ESA publicación, por encima de la entidad y de lo general", () => {
    let r = conModoGeneral(r0, "ninguno", ahora);
    r = conModoPublicacion(r, "p1", "todo", ahora);
    const comentarios = [deBot("a", AJENO), persona("b")];
    expect(filtrarPorBloqueo(comentarios, r, { postId: "p1" }).map((x) => x.id)).toEqual(["a", "b"]);
    expect(filtrarPorBloqueo(comentarios, r, { postId: "p2" }).map((x) => x.id)).toEqual(["b"]);
  });

  it("ninguno en una publicación oculta sus bots aunque lo general lo permita", () => {
    const r = conModoPublicacion(r0, "p1", "ninguno", ahora);
    expect(filtrarPorBloqueo([deBot("a", AJENO), persona("b")], r, { postId: "p1" }).map((x) => x.id)).toEqual(["b"]);
    expect(conModoPublicacion(r, "p1", null, ahora + 1).publicaciones).toEqual({});
  });
});

describe("árbol de comentarios", () => {
  interface Nodo { id: string; autor: { bot?: ReturnType<typeof bot> }; children: Nodo[] }
  const n = (id: string, children: Nodo[] = [], b?: ReturnType<typeof bot>): Nodo => ({ id, autor: { bot: b }, children });

  it("oculta al bot pero conserva las respuestas de las personas", () => {
    const r = conBotBloqueado(r0, AJENO.agenteId, undefined, ahora);
    const arbol = [n("1", [n("1a", [], AJENO), n("1b", [n("1b1")])], AJENO), n("2")];
    const visto = filtrarArbolPorBloqueo(arbol, r);
    expect(visto.map((x) => x.id)).toEqual(["1b", "2"]);
    expect(visto[0].children.map((x) => x.id)).toEqual(["1b1"]);
  });

  it("sin nada que quitar devuelve el mismo árbol", () => {
    const arbol = [n("1"), n("2")];
    expect(filtrarArbolPorBloqueo(arbol, r0)).toBe(arbol);
    expect(filtrarArbolPorBloqueo(arbol, conBotBloqueado(r0, "bot:otro", undefined, ahora))).toBe(arbol);
  });
});

describe("normalizarReglas", () => {
  it("lo que llega de la cuenta no se cree", () => {
    const r = normalizarReglas({
      v: 9, general: "todos", bots: { "bot:ok": { nombre: "Ok", desde: 5 }, "mal id": {} }, entidades: { "grupo:x": "ninguno", "grupo:y": "quizá" },
      publicaciones: { p1: "solo-entidad" },
    });
    expect(r.general).toBe("todo");
    expect(Object.keys(r.bots)).toEqual(["bot:ok"]);
    expect(r.entidades).toEqual({ "grupo:x": "ninguno" });
    expect(r.publicaciones).toEqual({ p1: "solo-entidad" });
    expect(normalizarReglas("nada")).toBe(REGLAS_VACIAS);
  });
});

describe("almacén", () => {
  it("las funciones de la UI guardan, avisan y el snapshot es estable mientras nada cambie", () => {
    let avisos = 0;
    const oir = () => { avisos += 1; };
    window.addEventListener(EVENTO_BLOQUEO_BOTS, oir);
    bloquearBot(AJENO);
    const a = leerReglas();
    expect(leerReglas()).toBe(a);
    expect(a.bots[AJENO.agenteId]?.nombre).toBe(AJENO.nombre);
    fijarModoGeneral("solo-entidad");
    bloquearBotsEn({ tipo: "grupo", id: "huerto" });
    fijarModoEntidad({ tipo: "pagina", id: "calle" }, "solo-entidad");
    permitirBotsEn("p1", "ninguno");
    window.removeEventListener(EVENTO_BLOQUEO_BOTS, oir);
    const r = leerReglas();
    expect(r.general).toBe("solo-entidad");
    expect(r.entidades).toEqual({ "grupo:huerto": "ninguno", "pagina:calle": "solo-entidad" });
    expect(r.publicaciones).toEqual({ p1: "ninguno" });
    expect(avisos).toBe(5);
    expect(JSON.parse(localStorage.getItem(CLAVE_BLOQUEO_BOTS)!).v).toBe(1);
  });

  it("repetir lo mismo no vuelve a escribir ni a avisar", () => {
    bloquearBot("bot:x", "X");
    let avisos = 0;
    const oir = () => { avisos += 1; };
    window.addEventListener(EVENTO_BLOQUEO_BOTS, oir);
    bloquearBot("bot:x", "X");
    fijarModoGeneral("todo");
    window.removeEventListener(EVENTO_BLOQUEO_BOTS, oir);
    expect(avisos).toBe(0);
  });

  it("desbloquear devuelve al bot a la vista", () => {
    bloquearBot(AJENO);
    expect(filtrarPorBloqueo([deBot("a", AJENO)], leerReglas())).toEqual([]);
    desbloquearBot(AJENO.agenteId);
    expect(filtrarPorBloqueo([deBot("a", AJENO)], leerReglas())).toHaveLength(1);
  });

  it("un JSON roto en el almacén no rompe: se ve todo", () => {
    localStorage.setItem(CLAVE_BLOQUEO_BOTS, "{roto");
    expect(leerReglas()).toBe(REGLAS_VACIAS);
  });

  it("si llegan reglas de otro medio (se escribe la clave), el siguiente leerReglas las ve", () => {
    expect(leerReglas()).toBe(REGLAS_VACIAS);
    localStorage.setItem(CLAVE_BLOQUEO_BOTS, JSON.stringify({ v: 1, general: "ninguno" }));
    expect(leerReglas().general).toBe("ninguno");
  });
});
