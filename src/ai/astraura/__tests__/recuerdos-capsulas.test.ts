/**
 * RECUERDOS DE CÁPSULAS MEMVID (MVD1027F-d3b, parte 3):
 * pruebas de `recordarDeCapsulas` — búsqueda en cápsulas, filtrado por alcance,
 * límite de fragmentos/caracteres, detección de fuga y tope de tiempo.
 * Módulo puro: la E/S real (fetch a /api/memorias/capsulas) se inyecta como
 * dependencia (`buscar`) para que sea testeable. Sin red, sin disco, sin procesos.
 */
import { describe, expect, it, vi } from "vitest";
import {
  recordarDeCapsulas,
  type RecordarOpciones,
  type RecordarMultimodalOpciones,
  type BuscarCapsulaFn,
  type Recordar,
} from "@/ai/astraura/recuerdos-capsulas";
import { type ContextoCapsulas, type SujetoMemoria } from "@/lib/memorias/capsulas";
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

function esperadaVacia(): Recordar {
  return { memoria: "", leann: "", combinado: "" };
}

describe("recordarDeCapsulas", () => {
  describe("memoryScope «personal» desactiva las cápsulas", () => {
    it("devuelve objeto vacío cuando memoryScope === 'personal'", async () => {
      const buscar = vi.fn();
      const opts: RecordarOpciones = {
        consulta: "planes",
        contexto: contextoBase,
        buscar,
        memoryScope: "personal",
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toEqual(esperadaVacia());
      expect(buscar).not.toHaveBeenCalled();
    });
  });

  describe("actor sin ámbitos visibles", () => {
    it("devuelve objeto vacío cuando el actor no tiene cápsulas visibles", async () => {
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
      expect(r).toEqual(esperadaVacia());
      expect(buscar).not.toHaveBeenCalled();
    });
  });

  describe("sin cápsulas en el contexto", () => {
    it("devuelve objeto vacío cuando capsulasParaContexto devuelve array vacío", async () => {
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
      expect(r).toEqual(esperadaVacia());
      expect(buscar).not.toHaveBeenCalled();
    });
  });

  describe("búsqueda sin resultados", () => {
    it("devuelve objeto vacío cuando buscar devuelve null o array vacío en todas las cápsulas", async () => {
      const buscar = vi.fn().mockResolvedValue(null);
      const opts: RecordarOpciones = {
        consulta: "nada",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toEqual(esperadaVacia());
      expect(buscar).toHaveBeenCalledTimes(4);
    });
  });

  describe("búsqueda exitosa con formato correcto", () => {
    it("devuelve bloque RECUERDOS (cápsulas Memvid) con los fragmentos encontrados", async () => {
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

      expect(r.memoria).toContain("RECUERDOS (cápsulas Memvid):");
      expect(r.memoria).toContain("Aurora prefiere el café con leche");
      expect(r.memoria).toContain("Le gusta programar en Rust");
      expect(r.memoria).toContain("Alex trabaja en StarSeed OS");
      expect(r.memoria.split("\n").length).toBe(4);
    });
  });

  describe("límites: MAX_FRAGMENTOS (6)", () => {
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

      const lineas = r.memoria.split("\n");
      expect(lineas.length).toBe(5);
      expect(r.memoria).toContain("Fragmento número 3");
      expect(r.memoria).not.toContain("Fragmento número 4");
    });

    it("respeta el límite de 6 fragmentos totales (MAX_FRAGMENTOS)", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      for (let i = 0; i < 4; i++) {
        aciertos.set(`perfil-p${i}`, [{
          titulo: `P${i}`,
          texto: `Fragmento ${i}`,
          alcance: "perfil" as AlcanceMemoria,
        }]);
      }

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "test",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r.combinado.split("\n").filter(l => l.startsWith("- ")).length).toBeLessThanOrEqual(6);
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

      expect(r.memoria).toContain("Reunión del equipo");
      expect(r.memoria).toContain("Anuncio público");
      expect(r.memoria).not.toContain("Secreto personal");
      expect(r.memoria).not.toContain("Dato de perfil");
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

      expect(r.memoria).toContain("Página pública");
      expect(r.memoria).not.toContain("Interno del grupo");
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

        expect(r.memoria).toContain("Secreto personal");
        expect(r.memoria).toContain("Dato de perfil");
        expect(r.memoria).toContain("Cosa de grupo");
        expect(r.memoria).toContain("Anuncio público");
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
        contexto: { actor: actorUsuario, personalidadId: "aurora" },
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

      expect(r.combinado).toContain("[FUGA DETECTADA]");
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

      expect(r.combinado).not.toContain("[FUGA DETECTADA]");
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

      expect(r.combinado).not.toContain("[FUGA DETECTADA]");
    });

    it("fuga detectada solo con coincidencia ≥ MINIMO_FUGA (40 chars)", async () => {
      const aciertos = new Map<string, { titulo: string; texto: string; alcance: AlcanceMemoria }[]>();
      aciertos.set("personalidad-aurora", [
        { titulo: "Corto", texto: "Clave: abc123", alcance: "personal" },
      ]);

      const buscar = crearBuscarFake(aciertos);
      const opts: RecordarOpciones = {
        consulta: "clave",
        contexto: contextoBase,
        buscar,
        esModeloNube: true,
      };
      const r = await recordarDeCapsulas(opts);

      expect(r.combinado).not.toContain("[FUGA DETECTADA]");
    });
  });

  describe("timeout y manejo de errores", () => {
    it("devuelve objeto vacío si la búsqueda supera el timeout", async () => {
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
      expect(r).toEqual(esperadaVacia());
    });

    it("devuelve objeto vacío si buscar lanza una excepción", async () => {
      const buscar = async () => {
        throw new Error("Red caída");
      };
      const opts: RecordarOpciones = {
        consulta: "error",
        contexto: contextoBase,
        buscar,
      };
      const r = await recordarDeCapsulas(opts);
      expect(r).toEqual(esperadaVacia());
    });

    it("usa timeoutMs personalizado (por defecto 900ms)", async () => {
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
});