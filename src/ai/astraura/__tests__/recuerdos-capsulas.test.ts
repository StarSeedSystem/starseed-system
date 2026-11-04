<<<<<<< HEAD
/**
 * RECUERDOS DE CÁPSULAS MEMVID (MVD1027F-d3b, parte 3):
 * pruebas de `recordarDeCapsulas` — búsqueda en cápsulas, filtrado por alcance,
 * límite de fragmentos/caracteres, detección de fuga y tope de tiempo.
 * Módulo puro: la E/S real (fetch a /api/memorias/capsulas) se inyecta como
 * dependencia (`buscar`) para que sea testeable. Sin red, sin disco, sin procesos.
 */
import { describe, expect, it, vi } from "vitest";
import { recordarDeCapsulas, type RecordarOpciones, type BuscarCapsulaFn } from "@/ai/astraura/recuerdos-capsulas";
import { type ContextoCapsulas, type SujetoMemoria, capsulaDe } from "@/lib/memorias/capsulas";
import { type ActorMemoria, type AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";

const actorUsuario: ActorMemoria = { tipo: "usuario" };
const actorPersonal: ActorMemoria = { tipo: "agente-personal" };
const actorGrupo: ActorMemoria = { tipo: "agente-grupo", grupoId: "g1" };
const actorPublico: ActorMemoria = { tipo: "agente-publico" };

const sujetoPersonalidad: SujetoMemoria = { tipo: "personalidad", id: "aurora" };
const sujetoPerfil: SujetoMemoria = { tipo: "perfil", id: "alex" };
const sujetoGrupo: SujetoMemoria = { tipo: "grupo", id: "equipo", grupoId: "g1" };
const sujetoPagina: SujetoMemoria = { tipo: "pagina", id: "web" };

const contextoBase: ContextoCapsulas & { actor: ActorMemoria } = {
  personalidadId: "aurora",
  perfilId: "alex",
  grupoId: "equipo",
  paginaId: "web",
  actor: actorUsuario,
};

const capsulaPersonalidad = capsulaDe(sujetoPersonalidad, new Date("2026-10-01"));
const capsulaPerfil = capsulaDe(sujetoPerfil, new Date("2026-10-01"));
const capsulaGrupo = capsulaDe(sujetoGrupo, new Date("2026-10-01"));
const capsulaPagina = capsulaDe(sujetoPagina, new Date("2026-10-01"));

function crearBuscarFake(aciertos: Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>): BuscarCapsulaFn {
  return async (sujeto, _consulta, k) => {
    const key = `${sujeto.tipo}-${sujeto.id}`;
    const lista = aciertos.get(key) ?? [];
    return lista.slice(0, k).map((a) => ({
      titulo: a.titulo,
      texto: a.texto,
      uri: `mv2://${sujeto.tipo}/${sujeto.id}/1`,
      ts: Date.now(),
      alcance: a.alcance,
      sujeto,
    }));
  };
}

describe("recordarDeCapsulas", () => {
  describe("memoryScope «personal» desactiva las cápsulas", () => {
    it("devuelve cadena vacía cuando memoryScope === 'personal' (propiedad de opts, no de contexto)", async () => {
      const buscar = vi.fn();
      const opts: RecordarOpciones = {
        consulta: "planes",
        contexto: contextoBase,
        buscar,
        memoryScope: "personal",
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toBe("");
      expect(buscar).not.toHaveBeenCalled();
    });
  });

  describe("actor sin ámbitos visibles", () => {
    it("devuelve cadena vacía cuando el actor no tiene cápsulas visibles en el contexto", async () => {
      // agente-publico solo ve "publica", pero si el contexto no tiene página/grupo público, no hay cápsulas
      const contextoSoloPrivado: ContextoCapsulas & { actor: ActorMemoria } = {
        personalidadId: "aurora",
        perfilId: "alex",
        actor: actorPublico,
      };
      const buscar = vi.fn();
      const opts: RecordarOpciones = {
        consulta: "planes",
        contexto: contextoSoloPrivado,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toBe("");
      expect(buscar).not.toHaveBeenCalled();
    });
  });

  describe("sin cápsulas en el contexto", () => {
    it("devuelve cadena vacía cuando capsulasParaContexto devuelve array vacío", async () => {
      const contextoVacio: ContextoCapsulas & { actor: ActorMemoria } = {
        actor: actorUsuario,
      };
      const buscar = vi.fn();
      const opts: RecordarOpciones = {
        consulta: "planes",
        contexto: contextoVacio,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toBe("");
      expect(buscar).not.toHaveBeenCalled();
    });
  });

  describe("búsqueda sin resultados", () => {
    it("devuelve cadena vacía cuando buscar devuelve null o array vacío en todas las cápsulas", async () => {
      const buscar = vi.fn().mockResolvedValue(null);
      const opts: RecordarOpciones = {
        consulta: "nada",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toBe("");
      expect(buscar).toHaveBeenCalledTimes(4); // personalidad, perfil, grupo, página
    });
  });

  describe("búsqueda exitosa con formato correcto", () => {
    it("devuelve bloque RECUERDOS con los fragmentos encontrados", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "Recuerdo 1", texto: "Aurora prefiere el café con leche.", alcance: "personal" },
        { titulo: "Recuerdo 2", texto: "Le gusta programar en Rust.", alcance: "personal" },
      ]);
      aciertos.set("perfil-alex", [
        { titulo: "Recuerdo 3", texto: "Alex trabaja en StarSeed OS.", alcance: "perfil" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "trabajo",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).toContain("RECUERDOS (cápsulas Memvid):");
      expect(r).toContain("Aurora prefiere el café con leche");
      expect(r).toContain("Le gusta programar en Rust");
      expect(r).toContain("Alex trabaja en StarSeed OS");
      expect(r.split("\n").length).toBe(4); // cabecera + 3 fragmentos
    });
  });

  describe("límites: MAX_FRAGMENTOS (6) y MAX_CARACTERES (1500)", () => {
    it("respeta el límite de K_POR_CAPSULA (4) por cápsula", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      const fragmentos = Array.from({ length: 10 }, (_, i) => ({
        titulo: `R${i}`,
        texto: `Fragmento número ${i} con texto suficiente.`,
        alcance: "personal" as AlcanceMemoria,
      }));
      aciertos.set("personalidad-aurora", fragmentos);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);

      const lineas = r.split("\n");
      expect(lineas.length).toBe(5); // cabecera + 4 fragmentos (K_POR_CAPSULA)
      expect(r).toContain("Fragmento número 3");
      expect(r).not.toContain("Fragmento número 4");
    });

    it("respeta el límite de 1500 caracteres totales", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      const textoLargo = "X".repeat(400);
      aciertos.set("personalidad-aurora", [
        { titulo: "R1", texto: textoLargo, alcance: "personal" },
        { titulo: "R2", texto: textoLargo, alcance: "personal" },
        { titulo: "R3", texto: textoLargo, alcance: "personal" },
        { titulo: "R4", texto: textoLargo, alcance: "personal" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);

      const soloTexto = r.replace("RECUERDOS (cápsulas Memvid):\n", "").replace(/^- /gm, "");
      expect(soloTexto.length).toBeLessThanOrEqual(1500);
    });

    it("para al alcanzar el límite de caracteres (MAX_CARACTERES = 1500)", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "R1", texto: "A".repeat(800), alcance: "personal" },
        { titulo: "R2", texto: "B".repeat(800), alcance: "personal" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);

      const lineas = r.split("\n");
      expect(lineas.length).toBe(2); // cabecera + 1 fragmento (800 + 800 > 1500)
    });
  });

  describe("filtrado por alcance del actor", () => {
    it("agente-grupo solo ve fragmentos de alcance 'grupo' y 'publica'", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "Personal", texto: "Secreto personal", alcance: "personal" },
        { titulo: "Perfil", texto: "Dato de perfil", alcance: "perfil" },
      ]);
      aciertos.set("grupo-equipo", [
        { titulo: "Grupo", texto: "Reunión del equipo", alcance: "grupo" },
        { titulo: "Público", texto: "Anuncio público", alcance: "publica" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "equipo",
        contexto: { ...contextoBase, actor: actorGrupo },
        buscar,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).toContain("Reunión del equipo");
      expect(r).toContain("Anuncio público");
      expect(r).not.toContain("Secreto personal");
      expect(r).not.toContain("Dato de perfil");
    });

    it("agente-publico solo ve fragmentos de alcance 'publica'", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("pagina-web", [
        { titulo: "Grupo", texto: "Interno del grupo", alcance: "grupo" },
        { titulo: "Público", texto: "Página pública", alcance: "publica" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "web",
        contexto: { ...contextoBase, actor: actorPublico, paginaId: "web" },
        buscar,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).toContain("Página pública");
      expect(r).not.toContain("Interno del grupo");
    });

    it("usuario y agente-personal ven todos los alcances", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "Personal", texto: "Secreto personal", alcance: "personal" },
        { titulo: "Perfil", texto: "Dato de perfil", alcance: "perfil" },
        { titulo: "Grupo", texto: "Cosa de grupo", alcance: "grupo" },
        { titulo: "Público", texto: "Anuncio público", alcance: "publica" },
      ]);

      for (const actor of [actorUsuario, actorPersonal]) {
        const buscar = crearBuscarFake(aciertos);
        const opts: RecordarOpciones = {
          consulta: "test",
          contexto: { ...contextoBase, actor },
          buscar,
        };
        const r = await recordarDeCapsulas(opts);

        expect(r).toContain("Secreto personal");
        expect(r).toContain("Dato de perfil");
        expect(r).toContain("Cosa de grupo");
        expect(r).toContain("Anuncio público");
      }
    });
  });

  describe("orden de cápsulas: de lo más cercano a lo más general", () => {
    it("busca en orden: personalidad → agente → cerebro → perfil → grupo → página", async () => {
      const ordenLlamadas: string[] = [];
      const buscar = async (sujeto: SujetoMemoria) => {
        ordenLlamadas.push(`${sujeto.tipo}-${sujeto.id}`);
        return [];
      };
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: {
          ...contextoBase,
          agenteId: "bot1",
          cerebroId: "cerebro1",
        },
        buscar,
      };
      await recordarDeCapsulas(opts);

      expect(ordenLlamadas).toEqual([
        "personalidad-aurora",
        "agente-bot1",
        "cerebro-cerebro1",
        "perfil-alex",
        "grupo-equipo",
        "pagina-web",
      ]);
    });

    it("salta cápsulas cuyo sujeto no está en el contexto", async () => {
      const ordenLlamadas: string[] = [];
      const buscar = async (sujeto: SujetoMemoria) => {
        ordenLlamadas.push(`${sujeto.tipo}-${sujeto.id}`);
        return [];
      };
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: { actor: actorUsuario, personalidadId: "aurora" }, // solo personalidad
        buscar,
      };
      await recordarDeCapsulas(opts);

      expect(ordenLlamadas).toEqual(["personalidad-aurora"]);
    });
  });

  describe("detección de fuga (esModeloNube = true)", () => {
    it("marca [FUGA DETECTADA] cuando hay coincidencia ≥ 40 chars con fragmento personal", async () => {
      const textoSecreto = "La contraseña del servidor es supersecreta123 y no se la digas a nadie.";
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "Secreto", texto: textoSecreto, alcance: "personal" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "contraseña",
        contexto: contextoBase,
        buscar,
        esModeloNube: true,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).toContain("[FUGA DETECTADA]");
    });

    it("NO marca fuga cuando el modelo NO es de la nube", async () => {
      const textoSecreto = "La contraseña del servidor es supersecreta123 y no se la digas a nadie.";
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "Secreto", texto: textoSecreto, alcance: "personal" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "contraseña",
        contexto: contextoBase,
        buscar,
        esModeloNube: false,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).not.toContain("[FUGA DETECTADA]");
    });

    it("NO marca fuga cuando no hay fragmentos de alcance 'personal' en los resultados", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("grupo-equipo", [
        { titulo: "Público", texto: "Reunión del equipo el martes a las 10.", alcance: "grupo" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "reunión",
        contexto: contextoBase,
        buscar,
        esModeloNube: true,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).not.toContain("[FUGA DETECTADA]");
    });

    it("fuga detectada solo con coincidencia ≥ MINIMO_FUGA (40 chars)", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "Corto", texto: "Clave: abc123", alcance: "personal" }, // < 40 chars
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "clave",
        contexto: contextoBase,
        buscar,
        esModeloNube: true,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).not.toContain("[FUGA DETECTADA]");
    });
  });

  describe("timeout y manejo de errores", () => {
    it("devuelve cadena vacía si la búsqueda supera el timeout", async () => {
      const buscar = async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return [];
      };
      const opts: RecordarOpciones = {
        consulta: "lento",
        contexto: contextoBase,
        buscar,
        timeoutMs: 50,
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toBe("");
    });

    it("devuelve cadena vacía si buscar lanza una excepción", async () => {
      const buscar = async () => {
        throw new Error("Red caída");
      };
      const opts: RecordarOpciones = {
        consulta: "error",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toBe("");
    });

    it("usa timeoutMs personalizado (por defecto 800ms)", async () => {
      const timeouts: number[] = [];
      const buscar = async (_s: SujetoMemoria, _q: string, _k: number) => {
        timeouts.push(Date.now());
        await new Promise((r) => setTimeout(r, 50));
        return [];
      };
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: contextoBase,
        buscar,
        timeoutMs: 300,
      };
      await recordarDeCapsulas(opts);
      expect(timeouts.length).toBeGreaterThan(0);
    });
  });

  describe("k por cápsula (K_POR_CAPSULA = 4)", () => {
    it("pasa k=4 a la función buscar", async () => {
      const kRecibidos: number[] = [];
      const buscar = async (_s: SujetoMemoria, _q: string, k: number) => {
        kRecibidos.push(k);
        return [];
      };
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: contextoBase,
        buscar,
      };
      await recordarDeCapsulas(opts);
      expect(kRecibidos.every((k) => k === 4)).toBe(true);
    });
  });

  describe("fragmentos devueltos conservan orden de cápsulas y de búsqueda", () => {
    it("los fragmentos de cápsulas más cercanas aparecen primero", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [{ titulo: "P1", texto: "De personalidad", alcance: "personal" }]);
      aciertos.set("perfil-alex", [{ titulo: "P2", texto: "De perfil", alcance: "perfil" }]);
      aciertos.set("grupo-equipo", [{ titulo: "P3", texto: "De grupo", alcance: "grupo" }]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);

      const idxPersonalidad = r.indexOf("De personalidad");
      const idxPerfil = r.indexOf("De perfil");
      const idxGrupo = r.indexOf("De grupo");
      expect(idxPersonalidad).toBeLessThan(idxPerfil);
      expect(idxPerfil).toBeLessThan(idxGrupo);
    });
  });
});
=======
/** Pruebas de recordarDeCapsulas (MVD1027F) con buscador FALSO: ni una llamada real a 4490. */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { recordarDeCapsulas } from "../recuerdos-capsulas";
import type { AciertoMemvid } from "@/lib/memorias/memvid-cliente";
import type { SujetoMemoria } from "@/lib/memorias/capsulas";

const FECHA = new Date("2026-10-27T12:00:00.000Z"); // fija: sin depender del reloj
const acierto = (texto: string): AciertoMemvid => ({ titulo: "t", texto });

/** Buscador falso: responde por «tipo:id» y apunta cada llamada para poder mirarla. */
function buscarFalso(responde: Record<string, AciertoMemvid[] | null>) {
  const llamadas: { quien: string; k: number; consulta: string }[] = [];
  const buscar = vi.fn(async (s: SujetoMemoria, consulta: string, k: number) => {
    llamadas.push({ quien: `${s.tipo}:${s.id}`, k, consulta });
    return responde[`${s.tipo}:${s.id}`] ?? null;
  });
  return { buscar, llamadas };
}

describe("recordarDeCapsulas", () => {
  it("devuelve «» con consulta vacía, sin cápsulas o si el servidor no responde", async () => {
    const f = buscarFalso({});
    expect(await recordarDeCapsulas({ perfilId: "alex" }, "  ", { buscar: f.buscar, fecha: FECHA })).toBe("");
    expect(f.llamadas).toEqual([]); // a consulta vacía ni pregunta
    const fa = buscarFalso({});
    expect(await recordarDeCapsulas({}, "hola", { buscar: fa.buscar, fecha: FECHA })).toBe("");
    expect(fa.llamadas).toEqual([]); // sin contexto no hay cápsulas que buscar
    const fn = buscarFalso({ "perfil:alex": null });
    expect(await recordarDeCapsulas({ perfilId: "alex" }, "hola", { buscar: fn.buscar, fecha: FECHA })).toBe("");
    expect(fn.llamadas.map((l) => l.quien)).toEqual(["perfil:alex"]); // preguntó, el servidor no llegó
  });

  it("pregunta k=4 y por cada cápsula de la más cercana a la más general, con la consulta directa", async () => {
    const { buscar, llamadas } = buscarFalso({
      "personalidad:aurora": [acierto("Aurora aprendió que la casa queda mejor con la cortina de la terraza abierta.")],
      "perfil:alex": [],
      "pagina:claustro": [acierto("El claustro publica la guía de cursos del trimestre.")],
    });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", perfilId: "alex", paginaId: "claustro" },
      "luz de la casa",
      { buscar, fecha: FECHA },
    );
    expect(llamadas.map((l) => l.quien)).toEqual(["personalidad:aurora", "perfil:alex", "pagina:claustro"]);
    expect(new Set(llamadas.map((l) => l.k))).toEqual(new Set([4]));
    expect(llamadas.every((l) => l.consulta === "luz de la casa")).toBe(true);
    expect(bloque).toContain("RECUERDOS (cápsulas Memvid):");
    expect(bloque).toContain("cortina de la terraza");
    expect(bloque).toContain("guía de cursos");
  });

  it("para en 6 fragmentos y ya no pregunta a más cápsulas", async () => {
    const cuatro = ["una", "dos", "tres", "cuatro"].map((n) => acierto(`recuerdo ${n} con su cuerpo propio entero`));
    const { buscar, llamadas } = buscarFalso({
      "personalidad:aurora": cuatro,
      "agente:ayudante": cuatro,
      "cerebro:casa": [acierto("esto no debe entrar: el cupo de seis ya está lleno")],
    });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", agenteId: "ayudante", cerebroId: "casa" },
      "recuerdos", { buscar, fecha: FECHA },
    );
    expect(bloque.split("\n").slice(1)).toHaveLength(6);
    expect(llamadas.map((l) => l.quien)).toEqual(["personalidad:aurora", "agente:ayudante"]);
    expect(bloque).not.toContain("el cupo de seis");
  });

  it("recorta el total a 1500 caracteres y deja de buscar", async () => {
    const { buscar, llamadas } = buscarFalso({
      "perfil:alex": [acierto("a".repeat(1000)), acierto("b".repeat(1000))],
      "pagina:claustro": [acierto("esto no debe llegar porque el espacio ya está lleno")],
    });
    const bloque = await recordarDeCapsulas(
      { perfilId: "alex", paginaId: "claustro" }, "consulta", { buscar, fecha: FECHA },
    );
    expect(bloque.split("\n").slice(1)).toEqual([`- ${"a".repeat(1000)}`, `- ${"b".repeat(500)}`]);
    expect(llamadas.map((l) => l.quien)).toEqual(["perfil:alex"]);
  });

  it("con modelo de nube deja fuera lo personal y sin nube lo conserva", async () => {
    const conPersonalidad = () => buscarFalso({
      "personalidad:aurora": [acierto("la fiesta sorpresa de Marta queda guardada a solas en el baúl de la casa entera")],
      "pagina:claustro": [acierto("el claustro publica la guía de cursos del trimestre y queda abierta al mundo")],
    });
    const sinNube = await recordarDeCapsulas(
      { personalidadId: "aurora", paginaId: "claustro" }, "fiesta",
      { buscar: conPersonalidad().buscar, fecha: FECHA },
    );
    expect(sinNube).toContain("Marta");
    const enNube = await recordarDeCapsulas(
      { personalidadId: "aurora", paginaId: "claustro" }, "fiesta",
      { buscar: conPersonalidad().buscar, fecha: FECHA, enNube: true },
    );
    expect(enNube).toContain("guía de cursos");
    expect(enNube).not.toContain("Marta");
  });

  it("un agente de grupo no pregunta a las cápsulas personales que no ve", async () => {
    const { buscar, llamadas } = buscarFalso({
      "grupo:luna": [acierto("la luna guarda las notas de la casa del grupo")],
      "pagina:claustro": [acierto("el claustro publica la guía de cursos del trimestre y queda abierta al mundo")],
    });
    const bloque = await recordarDeCapsulas(
      { personalidadId: "aurora", perfilId: "alex", grupoId: "luna", paginaId: "claustro" }, "notas",
      { buscar, fecha: FECHA, actor: { tipo: "agente-grupo", grupoId: "luna" } },
    );
    expect(llamadas.map((l) => l.quien)).toEqual(["grupo:luna", "pagina:claustro"]);
    expect(bloque).toContain("notas de la casa del grupo");
    expect(bloque).not.toContain("Aurora");
  });

  it("se rinde tras el tope total ante un buscador que cuelga", async () => {
    const buscar = vi.fn(() => new Promise<AciertoMemvid[] | null>(() => {}));
    const comenzo = Date.now();
    const bloque = await recordarDeCapsulas({ perfilId: "alex" }, "colgado", { buscar, topeMs: 40 });
    expect(bloque).toBe("");
    expect(Date.now() - comenzo).toBeLessThan(5000);
  });
});
>>>>>>> 598ba1d88 (salvavidas · MVD1027F-d1: trabajo del agente antes de las puertas (tsc / vitest))
