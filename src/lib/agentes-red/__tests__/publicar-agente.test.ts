// @vitest-environment jsdom
/**
 * La puerta de publicación de los agentes (Ola 1025U · U3): sin vínculo no publica, todo envío sale marcado
 * «Bot de IA» y hay un tope por hora.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import {
  MAX_TEXTO_ENVIO, TOPE_ENVIOS_POR_HORA, comentarComoAgente, destinoDeTexto, publicarComoAgente, registrarEnvio,
  type PuertosPublicacion,
} from "../publicar-agente";
import { leerMarcaDeCuerpo } from "../marca-bot";
import { fijarVisibilidad, perfilPorDefecto, vincular } from "../perfil-agente";

const AGENTE = crearAgenteMundoRef({ origen: "bot", idOrigen: "guardian", nombre: "Guardián", dueno: { tipo: "grupo", id: "huerto" } });
const HUERTO = { tipo: "grupo", id: "huerto" } as const;
const VINCULADO = vincular(fijarVisibilidad(perfilPorDefecto(AGENTE.id), "vinculado", 1), HUERTO, 2);

function puertos(extra: Partial<PuertosPublicacion> = {}) {
  const publicarOs = vi.fn(async () => ({ ok: true }));
  const comentarOs = vi.fn(async () => ({ ok: true }));
  const comentarLienzo = vi.fn(async () => ({ ok: true }));
  const p: PuertosPublicacion = {
    leerPerfil: () => VINCULADO, ahora: () => 1_000_000, publicarOs, comentarOs, comentarLienzo, ...extra,
  };
  return { p, publicarOs, comentarOs, comentarLienzo };
}

beforeEach(() => localStorage.clear());

describe("publicarComoAgente", () => {
  it("en privado no publica nada y dice por qué", async () => {
    const { p, publicarOs } = puertos({ leerPerfil: () => perfilPorDefecto(AGENTE.id) });
    const r = await publicarComoAgente({ agente: AGENTE, destino: HUERTO, texto: "Hola" }, p);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.motivo).toMatch(/solo privado/);
    expect(publicarOs).not.toHaveBeenCalled();
  });

  it("vinculado pero a OTRA entidad: tampoco", async () => {
    const { p, publicarOs } = puertos();
    const r = await publicarComoAgente({ agente: AGENTE, destino: { tipo: "pagina", id: "calle" }, texto: "Hola" }, p);
    expect(r.ok).toBe(false);
    expect(publicarOs).not.toHaveBeenCalled();
  });

  it("vinculado a la entidad: publica, y el cuerpo guardado lleva SIEMPRE la marca de bot", async () => {
    const { p, publicarOs } = puertos();
    const r = await publicarComoAgente({ agente: AGENTE, destino: HUERTO, texto: "  Riego a las 8  " }, p);
    expect(r.ok).toBe(true);
    expect(publicarOs).toHaveBeenCalledTimes(1);
    const enviado = (publicarOs.mock.calls[0] as unknown as [{ entityType: string; entitySlug: string; body: string; authorName: string }])[0];
    expect(enviado).toMatchObject({ entityType: "group", entitySlug: "huerto", authorName: "Guardián" });
    const { cuerpo, marca } = leerMarcaDeCuerpo(enviado.body);
    expect(cuerpo).toBe("Riego a las 8");
    expect(marca).toMatchObject({ esBotIA: true, agenteId: AGENTE.id, dueno: { tipo: "grupo", id: "huerto" } });
  });

  it("una comunidad se publica como página del OS", async () => {
    const perfil = vincular(fijarVisibilidad(perfilPorDefecto(AGENTE.id), "vinculado", 1), { tipo: "comunidad", id: "plaza" }, 2);
    const { p, publicarOs } = puertos({ leerPerfil: () => perfil });
    await publicarComoAgente({ agente: AGENTE, destino: { tipo: "comunidad", id: "plaza" }, texto: "Hola" }, p);
    expect((publicarOs.mock.calls[0] as unknown as [{ entityType: string }])[0].entityType).toBe("page");
  });

  it("rechaza texto vacío y texto excesivo sin llamar al OS", async () => {
    const { p, publicarOs } = puertos();
    expect((await publicarComoAgente({ agente: AGENTE, destino: HUERTO, texto: "   " }, p)).ok).toBe(false);
    expect((await publicarComoAgente({ agente: AGENTE, destino: HUERTO, texto: "x".repeat(MAX_TEXTO_ENVIO + 1) }, p)).ok).toBe(false);
    expect(publicarOs).not.toHaveBeenCalled();
  });

  it("sin sesión lo dice (needsAuth) y no cuenta el envío", async () => {
    const { p } = puertos({ publicarOs: async () => ({ ok: false, needsAuth: true }) });
    const r = await publicarComoAgente({ agente: AGENTE, destino: HUERTO, texto: "Hola" }, p);
    expect(r).toMatchObject({ ok: false, needsAuth: true });
    expect(localStorage.getItem(`starseed.agentes-red.envios.${AGENTE.id}.v1`)).toBeNull();
  });

  it("un fallo de red se cuenta como fallo, nunca como publicado", async () => {
    const { p } = puertos({ publicarOs: async () => { throw new Error("sin red"); } });
    const r = await publicarComoAgente({ agente: AGENTE, destino: HUERTO, texto: "Hola" }, p);
    expect(r.ok).toBe(false);
  });

  it(`tope: a partir de ${TOPE_ENVIOS_POR_HORA} envíos en una hora, el siguiente se rechaza`, async () => {
    const { p, publicarOs } = puertos();
    for (let i = 0; i < TOPE_ENVIOS_POR_HORA; i++) {
      expect((await publicarComoAgente({ agente: AGENTE, destino: HUERTO, texto: `Mensaje ${i}` }, p)).ok).toBe(true);
    }
    const r = await publicarComoAgente({ agente: AGENTE, destino: HUERTO, texto: "Uno más" }, p);
    expect(r.ok).toBe(false);
    expect(publicarOs).toHaveBeenCalledTimes(TOPE_ENVIOS_POR_HORA);
    // pasada la hora, vuelve a poder
    const luego = puertos({ ahora: () => 1_000_000 + 61 * 60 * 1000 });
    expect((await publicarComoAgente({ agente: AGENTE, destino: HUERTO, texto: "Ya" }, luego.p)).ok).toBe(true);
  });
});

describe("comentarComoAgente", () => {
  it("en privado no comenta", async () => {
    const { p, comentarOs } = puertos({ leerPerfil: () => perfilPorDefecto(AGENTE.id) });
    const r = await comentarComoAgente({ agente: AGENTE, destino: HUERTO, postId: "p1", texto: "Bien" }, p);
    expect(r.ok).toBe(false);
    expect(comentarOs).not.toHaveBeenCalled();
  });

  it("en una publicación del OS, el comentario sale con la marca en el cuerpo", async () => {
    const { p, comentarOs } = puertos();
    const r = await comentarComoAgente({ agente: AGENTE, destino: HUERTO, postId: "p1", texto: "Bien dicho" }, p);
    expect(r.ok).toBe(true);
    const [postId, cuerpo, nombre] = comentarOs.mock.calls[0] as unknown as [string, string, string];
    expect(postId).toBe("p1");
    expect(nombre).toBe("Guardián");
    expect(leerMarcaDeCuerpo(cuerpo)).toMatchObject({ cuerpo: "Bien dicho", marca: { agenteId: AGENTE.id } });
  });

  it("en el Lienzo, la marca viaja como objeto", async () => {
    const { p, comentarLienzo, comentarOs } = puertos();
    await comentarComoAgente({ agente: AGENTE, destino: HUERTO, postId: "p2", texto: "Hola", fuente: "lienzo" }, p);
    expect(comentarOs).not.toHaveBeenCalled();
    const [, texto, marca] = comentarLienzo.mock.calls[0] as unknown as [string, string, { esBotIA: boolean; agenteId: string }];
    expect(texto).toBe("Hola");
    expect(marca).toMatchObject({ esBotIA: true, agenteId: AGENTE.id });
  });

  it("sin publicación no hay a qué responder", async () => {
    const { p } = puertos();
    expect((await comentarComoAgente({ agente: AGENTE, destino: HUERTO, postId: "", texto: "Hola" }, p)).ok).toBe(false);
  });
});

describe("piezas puras", () => {
  it("registrarEnvio olvida lo que tiene más de una hora y avisa cuándo se reabre", () => {
    const hora = 60 * 60 * 1000;
    expect(registrarEnvio([], 5000, 2)).toEqual({ ok: true, envios: [5000] });
    expect(registrarEnvio([0], hora + 1, 1)).toEqual({ ok: true, envios: [hora + 1] });
    const lleno = registrarEnvio([100, 200], 300, 2);
    expect(lleno.ok).toBe(false);
    expect(lleno.reabreEn).toBe(100 + hora - 300);
  });

  it("destinoDeTexto solo entiende grupo:, comunidad: y pagina:", () => {
    expect(destinoDeTexto("grupo:huerto")).toEqual({ tipo: "grupo", id: "huerto" });
    expect(destinoDeTexto(" comunidad:plaza ")).toEqual({ tipo: "comunidad", id: "plaza" });
    expect(destinoDeTexto("pagina:calle-viva")).toEqual({ tipo: "pagina", id: "calle-viva" });
    expect(destinoDeTexto("red:red")).toBeNull();
    expect(destinoDeTexto("evento:x")).toBeNull();
    expect(destinoDeTexto("grupo:con espacio")).toBeNull();
    expect(destinoDeTexto(7)).toBeNull();
  });
});
