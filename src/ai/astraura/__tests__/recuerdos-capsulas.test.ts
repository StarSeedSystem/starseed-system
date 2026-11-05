/**
 * RECUERDOS DE CÁPSULAS MEMVID (MVD1027F-d3b, parte 3):
 * pruebas de `recordarDeCapsulas` — búsqueda en cápsulas, filtrado por alcance,
 * límite de fragmentos/caracteres, detección de fuga y tope de tiempo.
 * Módulo puro: la E/S real (el cliente de cápsulas del servidor) se inyecta como
 * dependencia (`buscar`) para que sea testeable. Sin red, sin disco, sin procesos.
 */
import { describe, expect, it, vi } from "vitest";
import { recordarDeCapsulas, type RecordarOpciones, type BuscarCapsulaFn, type AciertoCapsula } from "@/ai/astraura/recuerdos-capsulas";
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

      const lineasTexto = r.split("\n").slice(1).map((l) => l.replace(/^- /, ""));
      expect(lineasTexto.reduce((n, l) => n + l.length, 0)).toBeLessThanOrEqual(1500);
    });

    it("recorta el último al alcanzar el límite de caracteres (MAX_CARACTERES = 1500)", async () => {
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
      expect(lineas).toEqual(["RECUERDOS (cápsulas Memvid):", `- ${"A".repeat(800)}`, `- ${"B".repeat(700)}`]);
    });

    it("deja de pedir a las cápsulas siguientes cuando ya llenó los 6 fragmentos", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      const cuatro = Array.from({ length: 4 }, (_, i) => ({
        titulo: `R${i}`,
        texto: `Recuerdo número ${i} con cuerpo entero.`,
        alcance: "personal" as AlcanceMemoria,
      }));
      aciertos.set("personalidad-aurora", cuatro);
      aciertos.set("agente-bot1", cuatro);
      aciertos.set("cerebro-casa", [{ titulo: "R", texto: "esto no debe entrar: el cupo de seis ya está lleno", alcance: "personal" }]);

      const ordenLlamadas: string[] = [];
      const buscar: BuscarCapsulaFn = async (sujeto, _consulta, k) => {
        ordenLlamadas.push(`${sujeto.tipo}-${sujeto.id}`);
        const lista = aciertos.get(`${sujeto.tipo}-${sujeto.id}`) ?? [];
        return lista.slice(0, k).map((a) => ({
          titulo: a.titulo, texto: a.texto,
          uri: `mv2://${sujeto.tipo}/${sujeto.id}/1`, ts: Date.now(), alcance: a.alcance, sujeto,
        }));
      };
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: { ...contextoBase, agenteId: "bot1", cerebroId: "casa" },
        buscar,
      };
      const r = await recordarDeCapsulas(opts);

      expect(ordenLlamadas).toEqual(["personalidad-aurora", "agente-bot1"]); // al cerebro ya no se le pregunta
      expect(r.split("\n")).toHaveLength(7); // cabecera + 6 fragmentos (MAX_FRAGMENTOS)
      expect(r).not.toContain("el cupo de seis");
    });

    it("deja de pedir a las cápsulas siguientes cuando ya llenó los 1500 caracteres", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("perfil-alex", [
        { titulo: "R1", texto: "a".repeat(1000), alcance: "perfil" },
        { titulo: "R2", texto: "b".repeat(1000), alcance: "perfil" },
      ]);
      aciertos.set("pagina-web", [{ titulo: "R", texto: "esto no debe llegar porque el espacio ya está lleno", alcance: "publica" }]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: { actor: actorUsuario, perfilId: "alex", paginaId: "web" },
        buscar,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r.split("\n").slice(1)).toEqual([`- ${"a".repeat(1000)}`, `- ${"b".repeat(500)}`]);
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
    it("en la nube deja fuera el fragmento personal y conserva el resto", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "Secreto", texto: "la fiesta sorpresa de Marta queda guardada a solas en el baúl de la casa.", alcance: "personal" },
      ]);
      aciertos.set("grupo-equipo", [
        { titulo: "Grupo", texto: "Reunión del equipo el martes a las 10.", alcance: "grupo" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "fiesta",
        contexto: contextoBase,
        buscar,
        esModeloNube: true,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).toContain("Reunión del equipo");
      expect(r).not.toContain("Marta");
    });

    it("sin nube conserva lo personal", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "Secreto", texto: "la fiesta sorpresa de Marta queda guardada a solas en el baúl de la casa.", alcance: "personal" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "fiesta",
        contexto: contextoBase,
        buscar,
        esModeloNube: false,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).toContain("Marta");
    });

    it("si lo que queda copia lo personal (coincidencia ≥ 40 chars), no sale nada", async () => {
      const secreto = "La contraseña del servidor es supersecreta123 y no se la digas a nadie.";
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "Secreto", texto: secreto, alcance: "personal" },
      ]);
      aciertos.set("grupo-equipo", [
        { titulo: "Copia", texto: `Aviso del grupo: ${secreto} la cambiaremos el viernes.`, alcance: "grupo" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "consejos",
        contexto: contextoBase,
        buscar,
        esModeloNube: true,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).toBe("");
    });

    it("sin fragmentos personal en los resultados no salta la valla", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("grupo-equipo", [
        { titulo: "Grupo", texto: "Reunión del equipo el martes a las 10 en la sala de la casa.", alcance: "grupo" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "reunión",
        contexto: contextoBase,
        buscar,
        esModeloNube: true,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r).toContain("Reunión del equipo");
    });
  });

  describe("timeout y manejo de errores", () => {
    it("devuelve cadena vacía si la consulta queda vacía al recortarla", async () => {
      const buscar = vi.fn();
      const opts: RecordarOpciones = {
        consulta: "   ",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toBe("");
      expect(buscar).not.toHaveBeenCalled();
    });

    it("se rinde con el tope total ante un buscador que cuelga", async () => {
      const buscar = vi.fn(() => new Promise<AciertoCapsula[] | null>(() => {}));
      const comenzo = Date.now();
      const opts: RecordarOpciones = {
        consulta: "colgado",
        contexto: contextoBase,
        buscar,
        timeoutMs: 40,
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toBe("");
      expect(Date.now() - comenzo).toBeLessThan(5000);
    });

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
