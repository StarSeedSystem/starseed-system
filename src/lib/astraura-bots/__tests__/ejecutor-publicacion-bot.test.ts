// @vitest-environment jsdom
/**
 * `publicacion.borrador` ya no es «próximamente» (Ola 1025U · U3): el ejecutor publica por la única puerta de los
 * agentes (`publicarComoAgente`), que exige perfil vinculado y deja siempre la marca «Bot de IA».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ejecutarAccion, type DepsEjecutor } from "../adaptadores/ejecutor-acciones";
import { validarAccion, type AccionBot } from "../acciones";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { fijarVisibilidad, guardarPerfilAgente, perfilPorDefecto, vincular } from "@/lib/agentes-red/perfil-agente";
import { leerMarcaDeCuerpo } from "@/lib/agentes-red/marca-bot";

vi.mock("../adaptadores/computadora-cliente");
vi.mock("../adaptadores/acciones-creacion", () => ({ registrarEnEjecutor: (m: Map<unknown, unknown>) => m }));
vi.mock("@/lib/aurora/actions", () => ({ AURORA_ACTIONS: [] }));
const creados = vi.hoisted(() => ({ lista: [] as Array<{ entityType: string; entitySlug: string; body: string; authorName?: string }>, respuesta: { ok: true } as { ok: boolean; needsAuth?: boolean } }));
vi.mock("@/lib/os-social", () => ({
  createPost: vi.fn(async (i: { entityType: string; entitySlug: string; body: string; authorName?: string }) => { creados.lista.push(i); return creados.respuesta; }),
  addComment: vi.fn(),
}));

const AGENTE = crearAgenteMundoRef({ origen: "bot", idOrigen: "guardian", nombre: "Guardián", dueno: { tipo: "grupo", id: "huerto" } });
const deps = (extra: Partial<DepsEjecutor> = {}): DepsEjecutor => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn() }, actor: "bot:guardian", agente: AGENTE, ...extra,
});
const accion = (args: Record<string, unknown>): AccionBot => {
  const v = validarAccion({ tipo: "publicacion.borrador", args });
  if (!v.accion) throw new Error(v.problemas.join(" "));
  return v.accion;
};
const vincularAHuerto = () =>
  guardarPerfilAgente(vincular(fijarVisibilidad(perfilPorDefecto(AGENTE.id), "vinculado", 1), { tipo: "grupo", id: "huerto" }, 2));

beforeEach(() => {
  localStorage.clear();
  creados.lista.length = 0;
  creados.respuesta = { ok: true };
});

describe("ejecutor · publicacion.borrador", () => {
  it("con el perfil privado no publica y lo dice", async () => {
    const r = await ejecutarAccion(accion({ destino: "grupo:huerto", texto: "Hoy toca regar" }), deps());
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/solo privado/);
    expect(creados.lista).toEqual([]);
  });

  it("vinculado al grupo: publica en él, con la marca de bot en el cuerpo", async () => {
    vincularAHuerto();
    const r = await ejecutarAccion(accion({ destino: "grupo:huerto", texto: "Hoy toca regar" }), deps());
    expect(r.ok).toBe(true);
    expect(r.motivo).toMatch(/Bot de IA/);
    expect(creados.lista).toHaveLength(1);
    expect(creados.lista[0]).toMatchObject({ entityType: "group", entitySlug: "huerto", authorName: "Guardián" });
    expect(leerMarcaDeCuerpo(creados.lista[0].body)).toMatchObject({ cuerpo: "Hoy toca regar", marca: { agenteId: "bot:guardian" } });
  });

  it("no publica en una entidad a la que NO está vinculado", async () => {
    vincularAHuerto();
    const r = await ejecutarAccion(accion({ destino: "pagina:calle", texto: "Hola" }), deps());
    expect(r.ok).toBe(false);
    expect(creados.lista).toEqual([]);
  });

  it("sin destino de grupo, comunidad o página, no publica en ningún sitio", async () => {
    vincularAHuerto();
    const sin = await ejecutarAccion(accion({ texto: "Hola" }), deps());
    const raro = await ejecutarAccion(accion({ destino: "evento:fiesta", texto: "Hola" }), deps());
    expect(sin.ok).toBe(false);
    expect(raro.ok).toBe(false);
    expect(sin.motivo).toMatch(/No se publicó nada/);
    expect(creados.lista).toEqual([]);
  });

  it("sin saber qué agente actúa, no se inventa uno", async () => {
    vincularAHuerto();
    const r = await ejecutarAccion(accion({ destino: "grupo:huerto", texto: "Hola" }), deps({ agente: undefined }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/no tiene perfil en la red/);
    expect(creados.lista).toEqual([]);
  });

  it("sin sesión lo cuenta tal cual (no es un éxito) y no deja nada deshacible inventado", async () => {
    vincularAHuerto();
    creados.respuesta = { ok: false, needsAuth: true };
    const r = await ejecutarAccion(accion({ destino: "grupo:huerto", texto: "Hola" }), deps());
    expect(r).toMatchObject({ ok: false, previo: {} });
    expect(r.motivo).toMatch(/iniciar sesión/);
  });
});
