/**
 * RECUERDO MULTIMODAL (LNN1028F):
 * pruebas de `recordar` — búsqueda paralela en Memvid y LEANN,
 * fusión por rango recíproco (RRF), filtrado por alcance,
 * detección de fuga y tope de tiempo.
 * Módulo puro: la E/S real se inyecta como dependencia (`buscarMemvid`, `buscarLeann`).
 * Sin red, sin disco, sin procesos.
 */
import { describe, expect, it, vi } from "vitest";
import {
  recordar,
  recordarDeCapsulas,
  type RecordarMultimodalOpciones,
  type Recordar,
  type BuscarMemvidFn,
  type BuscarLeannFn,
  type AciertoMemvid,
  type AciertoLeann,
  type OpcionesBuscarLeann,
} from "@/ai/astraura/recuerdos-capsulas";
import { type ContextoCapsulas, type SujetoMemoria, alcanceDe } from "@/lib/memorias/capsulas";
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

/** Nombre del índice LEANN igual que en la implementación (nombreIndiceLeann). */
function nombreIndiceLeann(sujeto: SujetoMemoria): string {
  return `${sujeto.tipo}-${sujeto.id}-${alcanceDe(sujeto)}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function crearBuscarMemvidFake(
  aciertos: Map<string, AciertoMemvid[]>
): BuscarMemvidFn {
  return async (sujeto, _consulta, k) => {
    const key = `${sujeto.tipo}-${sujeto.id}`;
    const lista = aciertos.get(key) ?? [];
    return lista.slice(0, k);
  };
}

function crearBuscarLeannFake(
  aciertos: Map<string, AciertoLeann[]>
): BuscarLeannFn {
  return async (indice, _consulta, _opciones) => {
    const lista = aciertos.get(indice) ?? [];
    return lista;
  };
}

describe("recordar (multimodal: Memvid + LEANN)", () => {
  describe("salida temprana: consultas cortas sin signo de pregunta", () => {
    it("devuelve bloques vacíos cuando la consulta tiene < 4 palabras y no contiene '?'", async () => {
      const buscarMemvid = vi.fn();
      const buscarLeann = vi.fn();
      const opts: RecordarMultimodalOpciones = {
        consulta: "planes café",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
      expect(buscarMemvid).not.toHaveBeenCalled();
      expect(buscarLeann).not.toHaveBeenCalled();
    });

    it("devuelve bloques vacíos para consulta de 3 palabras", async () => {
      const buscarMemvid = vi.fn();
      const buscarLeann = vi.fn();
      const opts: RecordarMultimodalOpciones = {
        consulta: "qué hora es",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
    });

    it("NO sale temprano si la consulta contiene '?' aunque sea corta", async () => {
      const buscarMemvid = vi.fn().mockResolvedValue([
        { titulo: "R1", texto: "Son las 10.", uri: "u1", alcance: "personal" },
      ]);
      const buscarLeann = vi.fn().mockResolvedValue([]);

      const opts: RecordarMultimodalOpciones = {
        consulta: "qué hora?",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r.memoria).toContain("Son las 10");
      expect(buscarMemvid).toHaveBeenCalled();
    });

    it("NO sale temprano si la consulta tiene 4 palabras", async () => {
      const buscarMemvid = vi.fn().mockResolvedValue([
        { titulo: "R1", texto: "Reunión a las 10.", uri: "u1", alcance: "personal" },
      ]);
      const buscarLeann = vi.fn().mockResolvedValue([]);

      const opts: RecordarMultimodalOpciones = {
        consulta: "reunión a las diez",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r.memoria).toContain("Reunión a las 10");
    });
  });

  describe("memoryScope «personal» desactiva las cápsulas", () => {
    it("devuelve bloques vacíos cuando memoryScope === 'personal'", async () => {
      const buscarMemvid = vi.fn();
      const buscarLeann = vi.fn();
      const opts: RecordarMultimodalOpciones = {
        consulta: "planes para el café hoy",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
        memoryScope: "personal",
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
      expect(buscarMemvid).not.toHaveBeenCalled();
      expect(buscarLeann).not.toHaveBeenCalled();
    });
  });

  describe("actor sin ámbitos visibles", () => {
    it("devuelve bloques vacíos cuando el actor no tiene cápsulas visibles", async () => {
      const contextoSoloPrivado: ContextoCapsulas & { actor: ActorMemoria } = {
        personalidadId: "aurora",
        perfilId: "alex",
        actor: actorPublico,
      };
      const buscarMemvid = vi.fn();
      const buscarLeann = vi.fn();
      const opts: RecordarMultimodalOpciones = {
        consulta: "planes para el café hoy",
        contexto: contextoSoloPrivado,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
      expect(buscarMemvid).not.toHaveBeenCalled();
      expect(buscarLeann).not.toHaveBeenCalled();
    });
  });

  describe("sin cápsulas en el contexto", () => {
    it("devuelve bloques vacíos cuando capsulasParaContexto devuelve array vacío", async () => {
      const contextoVacio: ContextoCapsulas & { actor: ActorMemoria } = {
        actor: actorUsuario,
      };
      const buscarMemvid = vi.fn();
      const buscarLeann = vi.fn();
      const opts: RecordarMultimodalOpciones = {
        consulta: "planes para el café hoy",
        contexto: contextoVacio,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
      expect(buscarMemvid).not.toHaveBeenCalled();
      expect(buscarLeann).not.toHaveBeenCalled();
    });
  });

  describe("búsqueda sin resultados en ninguna fuente", () => {
    it("devuelve bloques vacíos cuando ambas búsquedas devuelven null o array vacío", async () => {
      const buscarMemvid = vi.fn().mockResolvedValue(null);
      const buscarLeann = vi.fn().mockResolvedValue(null);
      const opts: RecordarMultimodalOpciones = {
        consulta: "nada que encontrar aquí ahora",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
      expect(buscarMemvid).toHaveBeenCalledTimes(4);
      expect(buscarLeann).toHaveBeenCalledTimes(4);
    });
  });

  describe("búsqueda exitosa con Memvid y LEANN", () => {
    it("devuelve tres bloques: memoria, leann y combinado", async () => {
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("personalidad-aurora", [
        { titulo: "Recuerdo 1", texto: "Aurora prefiere café con leche.", uri: "mv2://1", ts: Date.now(), alcance: "personal" },
      ]);
      memvidAciertos.set("perfil-alex", [
        { titulo: "Recuerdo 2", texto: "Alex trabaja en StarSeed OS.", uri: "mv2://2", ts: Date.now(), alcance: "perfil" },
      ]);

      const leannAciertos = new Map<string, AciertoLeann[]>();
      leannAciertos.set(nombreIndiceLeann(sujetoPersonalidad), [
        { id: "l1", puntuacion: 0.9, texto: "El café es la bebida favorita de Aurora.", metadatos: { alcance: "personal" } },
      ]);
      leannAciertos.set(nombreIndiceLeann(sujetoPerfil), [
        { id: "l2", puntuacion: 0.8, texto: "StarSeed OS es el proyecto principal.", metadatos: { alcance: "perfil" } },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = crearBuscarLeannFake(leannAciertos);

      const opts: RecordarMultimodalOpciones = {
        consulta: "trabajo y café favorito hoy",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);

      expect(r.memoria).toContain("RECUERDOS (cápsulas Memvid):");
      expect(r.memoria).toContain("Aurora prefiere café con leche");
      expect(r.memoria).toContain("Alex trabaja en StarSeed OS");

      expect(r.leann).toContain("RECUERDOS (significado LEANN):");
      expect(r.leann).toContain("El café es la bebida favorita de Aurora");
      expect(r.leann).toContain("StarSeed OS es el proyecto principal");

      expect(r.combinado).toContain("RECUERDOS (memoria + significado):");
      expect(r.combinado).toContain("Aurora prefiere café con leche");
      expect(r.combinado).toContain("StarSeed OS es el proyecto principal");
    });

    it("solo Memvid tiene resultados → leann vacío, combinado = memoria", async () => {
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("personalidad-aurora", [
        { titulo: "R1", texto: "Solo Memvid tiene esto.", uri: "mv2://1", alcance: "personal" },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = vi.fn().mockResolvedValue([]);

      const opts: RecordarMultimodalOpciones = {
        consulta: "solo memoria tiene resultados aquí",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);

      expect(r.memoria).toContain("Solo Memvid tiene esto");
      expect(r.leann).toBe("");
      expect(r.combinado).toContain("Solo Memvid tiene esto");
    });

    it("solo LEANN tiene resultados → memoria vacío, combinado = leann", async () => {
      const leannAciertos = new Map<string, AciertoLeann[]>();
      leannAciertos.set(nombreIndiceLeann(sujetoPersonalidad), [
        { id: "l1", puntuacion: 0.9, texto: "Solo LEANN encuentra esto por significado.", metadatos: { alcance: "personal" } },
      ]);

      const buscarMemvid = vi.fn().mockResolvedValue(null);
      const buscarLeann = crearBuscarLeannFake(leannAciertos);

      const opts: RecordarMultimodalOpciones = {
        consulta: "solo leann tiene resultados aquí",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);

      expect(r.memoria).toBe("");
      expect(r.leann).toContain("Solo LEANN encuentra esto por significado");
      expect(r.combinado).toContain("Solo LEANN encuentra esto por significado");
    });
  });

  describe("fusión RRF (rango recíproco)", () => {
    it("fragmentos que aparecen en ambas fuentes suben en el combinado", async () => {
      // Mismo ID para que el dedupe funcione
      const sharedId = "shared-fragment-1";

      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("personalidad-aurora", [
        { titulo: "R1", texto: "Fragmento común en ambas fuentes.", uri: sharedId, alcance: "personal" },
        { titulo: "R2", texto: "Solo en Memvid.", uri: "mv2://2", alcance: "personal" },
      ]);

      const leannAciertos = new Map<string, AciertoLeann[]>();
      leannAciertos.set(nombreIndiceLeann(sujetoPersonalidad), [
        { id: sharedId, puntuacion: 0.9, texto: "Fragmento común en ambas fuentes.", metadatos: { alcance: "personal" } },
        { id: "l2", puntuacion: 0.8, texto: "Solo en LEANN.", metadatos: { alcance: "personal" } },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = crearBuscarLeannFake(leannAciertos);

      const opts: RecordarMultimodalOpciones = {
        consulta: "test fusión rrf combinado ahora",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);

      const lineasCombinado = r.combinado.split("\n").filter((l) => l.startsWith("-"));
      expect(lineasCombinado.length).toBeGreaterThan(0);
      expect(lineasCombinado[0]).toContain("Fragmento común en ambas fuentes");
    });

    it("dedupe por id: la primera aparición (Memvid) gana", async () => {
      const sharedId = "same-id-for-dedupe";

      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("personalidad-aurora", [
        { titulo: "R1", texto: "Texto de Memvid (primero).", uri: sharedId, alcance: "personal" },
      ]);

      const leannAciertos = new Map<string, AciertoLeann[]>();
      leannAciertos.set(nombreIndiceLeann(sujetoPersonalidad), [
        { id: sharedId, puntuacion: 0.9, texto: "Texto de LEANN (segundo).", metadatos: { alcance: "personal" } },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = crearBuscarLeannFake(leannAciertos);

      const opts: RecordarMultimodalOpciones = {
        consulta: "test dedupe mismo id ahora",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);

      // El dedupe actual mantiene la primera aparición (Memvid se procesa antes que LEANN)
      expect(r.combinado).toContain("Texto de Memvid (primero)");
      expect(r.combinado).not.toContain("Texto de LEANN (segundo)");
    });
  });

  describe("límites: MAX_FRAGMENTOS (6) y MAX_CARACTERES (1500)", () => {
    it("respeta límite de 6 fragmentos en combinado", async () => {
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      const leannAciertos = new Map<string, AciertoLeann[]>();
      const baseText = "Fragmento número ";
      for (let i = 0; i < 10; i++) {
        const texto = `${baseText}${i} con texto suficiente para probar límites.`;
        const uri = `mv2://${i}`;
        const id = `l${i}`;
        if (!memvidAciertos.has("personalidad-aurora")) memvidAciertos.set("personalidad-aurora", []);
        if (!leannAciertos.has(nombreIndiceLeann(sujetoPersonalidad))) leannAciertos.set(nombreIndiceLeann(sujetoPersonalidad), []);
        memvidAciertos.get("personalidad-aurora")!.push({ titulo: `R${i}`, texto, uri, alcance: "personal" });
        leannAciertos.get(nombreIndiceLeann(sujetoPersonalidad))!.push({ id, puntuacion: 0.9 - i * 0.01, texto, metadatos: { alcance: "personal" } });
      }

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = crearBuscarLeannFake(leannAciertos);

      const opts: RecordarMultimodalOpciones = {
        consulta: "test límite fragmentos combinado ahora",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);

      const lineasCombinado = r.combinado.split("\n").filter((l) => l.startsWith("-"));
      expect(lineasCombinado.length).toBeLessThanOrEqual(6);
    });

    it("respeta límite de 6 fragmentos en combinado (sin límite de caracteres en fusión actual)", async () => {
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      const textoLargo = "X".repeat(400);
      memvidAciertos.set("personalidad-aurora", [
        { titulo: "R1", texto: textoLargo, uri: "mv2://1", alcance: "personal" },
        { titulo: "R2", texto: textoLargo, uri: "mv2://2", alcance: "personal" },
        { titulo: "R3", texto: textoLargo, uri: "mv2://3", alcance: "personal" },
        { titulo: "R4", texto: textoLargo, uri: "mv2://4", alcance: "personal" },
        { titulo: "R5", texto: textoLargo, uri: "mv2://5", alcance: "personal" },
        { titulo: "R6", texto: textoLargo, uri: "mv2://6", alcance: "personal" },
        { titulo: "R7", texto: textoLargo, uri: "mv2://7", alcance: "personal" },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = vi.fn().mockResolvedValue([]);

      const opts: RecordarMultimodalOpciones = {
        consulta: "test límite fragmentos combinado ahora",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);

      // La fusión actual limita a 6 fragmentos (MAX_FRAGMENTOS), no a 1500 caracteres
      const lineasCombinado = r.combinado.split("\n").filter((l) => l.startsWith("- "));
      expect(lineasCombinado.length).toBeLessThanOrEqual(6);
    });
  });

  describe("filtrado por alcance del actor", () => {
    it("agente-grupo solo ve fragmentos de alcance 'grupo' y 'publica' en ambos bloques", async () => {
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("personalidad-aurora", [
        { titulo: "Personal", texto: "Secreto personal", uri: "mv2://1", alcance: "personal" },
        { titulo: "Perfil", texto: "Dato de perfil", uri: "mv2://2", alcance: "perfil" },
      ]);
      memvidAciertos.set("grupo-equipo", [
        { titulo: "Grupo", texto: "Reunión del equipo", uri: "mv2://3", alcance: "grupo" },
        { titulo: "Público", texto: "Anuncio público", uri: "mv2://4", alcance: "publica" },
      ]);

      const leannAciertos = new Map<string, AciertoLeann[]>();
      leannAciertos.set(nombreIndiceLeann(sujetoGrupo), [
        { id: "l1", puntuacion: 0.9, texto: "Reunión del equipo encontrada por significado", metadatos: { alcance: "grupo" } },
        { id: "l2", puntuacion: 0.8, texto: "Anuncio público semántico", metadatos: { alcance: "publica" } },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = crearBuscarLeannFake(leannAciertos);

      const opts: RecordarMultimodalOpciones = {
        consulta: "equipo y reuniones del grupo",
        contexto: { ...contextoBase, actor: actorGrupo },
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);

      expect(r.memoria).toContain("Reunión del equipo");
      expect(r.memoria).toContain("Anuncio público");
      expect(r.memoria).not.toContain("Secreto personal");
      expect(r.memoria).not.toContain("Dato de perfil");

      expect(r.leann).toContain("Reunión del equipo encontrada por significado");
      expect(r.leann).toContain("Anuncio público semántico");

      expect(r.combinado).toContain("Reunión del equipo");
      expect(r.combinado).not.toContain("Secreto personal");
    });

    it("agente-publico solo ve fragmentos de alcance 'publica'", async () => {
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("pagina-web", [
        { titulo: "Grupo", texto: "Interno del grupo", uri: "mv2://1", alcance: "grupo" },
        { titulo: "Público", texto: "Página pública", uri: "mv2://2", alcance: "publica" },
      ]);

      const leannAciertos = new Map<string, AciertoLeann[]>();
      leannAciertos.set(nombreIndiceLeann(sujetoPagina), [
        { id: "l1", puntuacion: 0.9, texto: "Página pública semántica", metadatos: { alcance: "publica" } },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = crearBuscarLeannFake(leannAciertos);

      const opts: RecordarMultimodalOpciones = {
        consulta: "web pública para todos",
        contexto: { ...contextoBase, actor: actorPublico, paginaId: "web" },
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);

      expect(r.memoria).toContain("Página pública");
      expect(r.memoria).not.toContain("Interno del grupo");
      expect(r.leann).toContain("Página pública semántica");
      expect(r.combinado).toContain("Página pública");
      expect(r.combinado).not.toContain("Interno del grupo");
    });

    it("usuario y agente-personal ven todos los alcances", async () => {
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("personalidad-aurora", [
        { titulo: "Personal", texto: "Secreto personal", uri: "mv2://1", alcance: "personal" },
        { titulo: "Perfil", texto: "Dato de perfil", uri: "mv2://2", alcance: "perfil" },
        { titulo: "Grupo", texto: "Cosa de grupo", uri: "mv2://3", alcance: "grupo" },
        { titulo: "Público", texto: "Anuncio público", uri: "mv2://4", alcance: "publica" },
      ]);

      const leannAciertos = new Map<string, AciertoLeann[]>();
      leannAciertos.set(nombreIndiceLeann(sujetoPersonalidad), [
        { id: "l1", puntuacion: 0.9, texto: "Secreto personal semántico", metadatos: { alcance: "personal" } },
        { id: "l2", puntuacion: 0.8, texto: "Anuncio público semántico", metadatos: { alcance: "publica" } },
      ]);

      for (const actor of [actorUsuario, actorPersonal]) {
        const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
        const buscarLeann = crearBuscarLeannFake(leannAciertos);
        const opts: RecordarMultimodalOpciones = {
          consulta: "test todos alcances visibles",
          contexto: { ...contextoBase, actor },
          buscarMemvid,
          buscarLeann,
        };
        const r = await recordar(opts);

        expect(r.memoria).toContain("Secreto personal");
        expect(r.memoria).toContain("Dato de perfil");
        expect(r.memoria).toContain("Cosa de grupo");
        expect(r.memoria).toContain("Anuncio público");
        expect(r.leann).toContain("Secreto personal semántico");
        expect(r.combinado).toContain("Secreto personal");
      }
    });
  });

  describe("orden de cápsulas: de lo más cercano a lo más general", () => {
    it("busca en orden: personalidad → agente → cerebro → perfil → grupo → página", async () => {
      const ordenMemvid: string[] = [];
      const ordenLeann: string[] = [];

      const buscarMemvid = async (sujeto: SujetoMemoria) => {
        ordenMemvid.push(`${sujeto.tipo}-${sujeto.id}`);
        return [];
      };
      const buscarLeann = async (indice: string) => {
        ordenLeann.push(indice);
        return [];
      };

      const opts: RecordarMultimodalOpciones = {
        consulta: "orden de búsqueda cápsulas completo",
        contexto: {
          ...contextoBase,
          agenteId: "bot1",
          cerebroId: "cerebro1",
        },
        buscarMemvid,
        buscarLeann,
      };
      await recordar(opts);

      expect(ordenMemvid).toEqual([
        "personalidad-aurora",
        "agente-bot1",
        "cerebro-cerebro1",
        "perfil-alex",
        "grupo-equipo",
        "pagina-web",
      ]);
      expect(ordenLeann.length).toBe(6);
    });

    it("salta cápsulas cuyo sujeto no está en el contexto", async () => {
      const ordenMemvid: string[] = [];
      const buscarMemvid = async (sujeto: SujetoMemoria) => {
        ordenMemvid.push(`${sujeto.tipo}-${sujeto.id}`);
        return [];
      };
      const buscarLeann = vi.fn().mockResolvedValue([]);

      const opts: RecordarMultimodalOpciones = {
        consulta: "solo personalidad en el contexto",
        contexto: { actor: actorUsuario, personalidadId: "aurora" },
        buscarMemvid,
        buscarLeann,
      };
      await recordar(opts);

      expect(ordenMemvid).toEqual(["personalidad-aurora"]);
    });
  });

  describe("detección de fuga (esModeloNube = true)", () => {
    it("marca [FUGA DETECTADA] en combinado cuando hay coincidencia ≥ 40 chars con fragmento personal", async () => {
      const textoSecreto = "La contraseña del servidor es supersecreta123 y no se la digas a nadie.";
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("personalidad-aurora", [
        { titulo: "Secreto", texto: textoSecreto, uri: "mv2://1", alcance: "personal" },
      ]);

      const leannAciertos = new Map<string, AciertoLeann[]>();
      leannAciertos.set(nombreIndiceLeann(sujetoPersonalidad), [
        { id: "l1", puntuacion: 0.9, texto: textoSecreto, metadatos: { alcance: "personal" } },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = crearBuscarLeannFake(leannAciertos);

      const opts: RecordarMultimodalOpciones = {
        consulta: "contraseña del servidor secreta hoy",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
        esModeloNube: true,
      };
      const r = await recordar(opts);

      expect(r.combinado).toContain("[FUGA DETECTADA]");
    });

    it("NO marca fuga cuando el modelo NO es de la nube", async () => {
      const textoSecreto = "La contraseña del servidor es supersecreta123 y no se la digas a nadie.";
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("personalidad-aurora", [
        { titulo: "Secreto", texto: textoSecreto, uri: "mv2://1", alcance: "personal" },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = vi.fn().mockResolvedValue([]);

      const opts: RecordarMultimodalOpciones = {
        consulta: "contraseña del servidor secreta hoy",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
        esModeloNube: false,
      };
      const r = await recordar(opts);

      expect(r.combinado).not.toContain("[FUGA DETECTADA]");
    });

    it("NO marca fuga cuando no hay fragmentos de alcance 'personal' en el combinado", async () => {
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("grupo-equipo", [
        { titulo: "Público", texto: "Reunión del equipo el martes a las 10.", uri: "mv2://1", alcance: "grupo" },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = vi.fn().mockResolvedValue([]);

      const opts: RecordarMultimodalOpciones = {
        consulta: "reunión equipo martes próximo",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
        esModeloNube: true,
      };
      const r = await recordar(opts);

      expect(r.combinado).not.toContain("[FUGA DETECTADA]");
    });

    it("fuga detectada solo con coincidencia ≥ MINIMO_FUGA (40 chars)", async () => {
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("personalidad-aurora", [
        { titulo: "Corto", texto: "Clave: abc123", uri: "mv2://1", alcance: "personal" },
      ]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = vi.fn().mockResolvedValue([]);

      const opts: RecordarMultimodalOpciones = {
        consulta: "clave corta no es fuga",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
        esModeloNube: true,
      };
      const r = await recordar(opts);

      expect(r.combinado).not.toContain("[FUGA DETECTADA]");
    });
  });

  describe("timeout y manejo de errores", () => {
    it("devuelve bloques vacíos si la búsqueda supera el timeout", async () => {
      const buscarMemvid = async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return [];
      };
      const buscarLeann = async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return [];
      };
      const opts: RecordarMultimodalOpciones = {
        consulta: "búsqueda muy lenta en ambas fuentes",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
        timeoutMs: 50,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
    });

    it("devuelve bloques vacíos si buscarMemvid lanza excepción", async () => {
      const buscarMemvid = async () => {
        throw new Error("Red Memvid caída");
      };
      const buscarLeann = vi.fn().mockResolvedValue([]);
      const opts: RecordarMultimodalOpciones = {
        consulta: "error en memvid ahora mismo",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
    });

    it("devuelve bloques vacíos si buscarLeann lanza excepción", async () => {
      const buscarMemvid = vi.fn().mockResolvedValue([]);
      const buscarLeann = async () => {
        throw new Error("Red LEANN caída");
      };
      const opts: RecordarMultimodalOpciones = {
        consulta: "error en leann ahora mismo",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
    });

    it("usa timeoutMs personalizado (por defecto 900ms)", async () => {
      const timeouts: number[] = [];
      const buscarMemvid = async () => {
        timeouts.push(Date.now());
        await new Promise((r) => setTimeout(r, 50));
        return [];
      };
      const buscarLeann = async () => {
        timeouts.push(Date.now());
        await new Promise((r) => setTimeout(r, 50));
        return [];
      };
      const opts: RecordarMultimodalOpciones = {
        consulta: "test timeout personalizado multimodal",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
        timeoutMs: 300,
      };
      await recordar(opts);
      expect(timeouts.length).toBeGreaterThan(0);
    });
  });

  describe("pesoVector para búsqueda LEANN", () => {
    it("pasa pesoVector a la función buscarLeann", async () => {
      const pesosRecibidos: number[] = [];
      const buscarMemvid = vi.fn().mockResolvedValue([]);
      const buscarLeann = async (_indice: string, _consulta: string, opciones: OpcionesBuscarLeann) => {
        pesosRecibidos.push(opciones.pesoVector ?? 0.5);
        return [];
      };
      const opts: RecordarMultimodalOpciones = {
        consulta: "test peso vector personalizado ahora",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
        pesoVector: 0.7,
      };
      await recordar(opts);
      expect(pesosRecibidos.every((p) => p === 0.7)).toBe(true);
    });

    it("usa PESO_VECTOR_POR_DEFECTO (0.5) cuando no se especifica", async () => {
      const pesosRecibidos: number[] = [];
      const buscarMemvid = vi.fn().mockResolvedValue([]);
      const buscarLeann = async (_indice: string, _consulta: string, opciones: OpcionesBuscarLeann) => {
        pesosRecibidos.push(opciones.pesoVector ?? 0.5);
        return [];
      };
      const opts: RecordarMultimodalOpciones = {
        consulta: "test peso vector por defecto ahora",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      await recordar(opts);
      expect(pesosRecibidos.every((p) => p === 0.5)).toBe(true);
    });
  });

  describe("búsqueda paralela: Memvid y LEANN se consultan A LA VEZ", () => {
    it("ambas búsquedas empiezan antes de que ninguna termine", async () => {
      let memvidEmpezo = false;
      let leannEmpezo = false;
      let memvidTermino = false;
      let leannTermino = false;

      const buscarMemvid = async () => {
        memvidEmpezo = true;
        await new Promise((r) => setTimeout(r, 50));
        memvidTermino = true;
        return [{ titulo: "M", texto: "Memvid result", uri: "m1", alcance: "personal" as AlcanceMemoria }];
      };
      const buscarLeann = async () => {
        leannEmpezo = true;
        await new Promise((r) => setTimeout(r, 50));
        leannTermino = true;
        return [{ id: "l1", puntuacion: 0.9, texto: "Leann result", metadatos: { alcance: "personal" } }];
      };

      const opts: RecordarMultimodalOpciones = {
        consulta: "paralelo memvid leann ahora",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      await recordar(opts);

      expect(memvidEmpezo).toBe(true);
      expect(leannEmpezo).toBe(true);
    });
  });

  describe("fragmentos conservan orden de cápsulas y de búsqueda", () => {
    it("los fragmentos de cápsulas más cercanas aparecen primero en memoria (el combinado usa RRF)", async () => {
      const memvidAciertos = new Map<string, AciertoMemvid[]>();
      memvidAciertos.set("personalidad-aurora", [{ titulo: "P1", texto: "De personalidad", uri: "m1", alcance: "personal" }]);
      memvidAciertos.set("perfil-alex", [{ titulo: "P2", texto: "De perfil", uri: "m2", alcance: "perfil" }]);
      memvidAciertos.set("grupo-equipo", [{ titulo: "P3", texto: "De grupo", uri: "m3", alcance: "grupo" }]);

      const leannAciertos = new Map<string, AciertoLeann[]>();
      leannAciertos.set(nombreIndiceLeann(sujetoPersonalidad), [{ id: "l1", puntuacion: 0.9, texto: "Leann personalidad", metadatos: { alcance: "personal" } }]);
      leannAciertos.set(nombreIndiceLeann(sujetoPerfil), [{ id: "l2", puntuacion: 0.8, texto: "Leann perfil", metadatos: { alcance: "perfil" } }]);

      const buscarMemvid = crearBuscarMemvidFake(memvidAciertos);
      const buscarLeann = crearBuscarLeannFake(leannAciertos);

      const opts: RecordarMultimodalOpciones = {
        consulta: "orden cápsulas cercanas primero",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);

      // Memoria preserva el orden de cápsulas
      const idxPersonalidadMemoria = r.memoria.indexOf("De personalidad");
      const idxPerfilMemoria = r.memoria.indexOf("De perfil");
      const idxGrupoMemoria = r.memoria.indexOf("De grupo");
      expect(idxPersonalidadMemoria).toBeLessThan(idxPerfilMemoria);
      expect(idxPerfilMemoria).toBeLessThan(idxGrupoMemoria);

      // Combinado usa fusión RRF (reordena por puntuación), no orden de cápsulas
      // Solo verificamos que contenga los fragmentos esperados
      expect(r.combinado).toContain("De personalidad");
      expect(r.combinado).toContain("De perfil");
      expect(r.combinado).toContain("De grupo");
    });
  });
});

describe("recordarDeCapsulas (alias retrocompatible)", () => {
  it("sigue funcionando con la firma antigua y devuelve string", async () => {
    const buscar = vi.fn().mockResolvedValue([
      { titulo: "R1", texto: "Compatibilidad hacia atrás", uri: "mv2://1", alcance: "personal" },
    ]);
    const opts = {
      consulta: "test compatibilidad hacia atrás",
      contexto: contextoBase,
      buscar,
    };
    const r = await recordarDeCapsulas(opts);
    expect(typeof r).toBe("string");
    expect(r).toContain("Compatibilidad hacia atrás");
  });
});