import { beforeEach, describe, expect, it, vi } from "vitest";
import { deshacer, validarAccion, type AccionBot } from "../acciones";
import { MAX_ORBES_VISIBLES } from "../orbes";
import { disponerTrinity, type EntradaEspacio } from "@/lib/xr/espacio-trinity";
import type { ContextoVoz } from "@/lib/xr/intenciones-voz";

type Respuesta = { ok: boolean; message: string };
type Herramienta = { name: string; describe: string; example: string; handler: (args: Record<string, unknown>, ctx: unknown) => Promise<Respuesta> };
const h = vi.hoisted(() => ({ acciones: [] as Herramienta[] }));
// `actions.ts` arrastra Supabase y el catálogo: se simula con una lista que cada prueba llena (o deja vacía).
vi.mock("@/lib/aurora/actions", () => ({ AURORA_ACTIONS: h.acciones }));
import { ESPACIO_POR_DEFECTO, PROXIMAMENTE_PROTOMOLECULA, TITULO_PROPUESTA_BOT, anclaDeBot, ejecutarIntencionXR, ejecutarProtomolecula, registrarEnEjecutor, type EjecutorCreacion } from "../adaptadores/acciones-creacion";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn() };
const dep = { router, actor: "bot:cafe" };
const valida = (bruto: unknown): AccionBot => { const v = validarAccion(bruto); if (!v.accion) throw new Error(v.problemas.join(" ")); return v.accion; };
const operar = (args: object) => valida({ tipo: "protomolecula.operar", args: { molecula: "mol-1", ...args } });
const voz = (frase: string) => valida({ tipo: "xr.intencion", args: { frase } });
const instalar = (impl: Herramienta["handler"] = async () => ({ ok: true, message: "Parámetro movido." })) => { const handler = vi.fn(impl); h.acciones.push({ name: "protomolecula", describe: "", example: "", handler }); return handler; };
const ctxVoz: ContextoVoz = { grupos: [{ id: "g-banda", nombre: "Banda", miembros: 4 }], contactos: [], estaciones: [{ id: "e-cumbre", nombre: "Cumbre" }], servidores: [] };
const OBJETIVO = { atomoId: "voz-1", parametroId: "reverb.mezcla" };
const MOVER = { accion: "mover", args: { objetivo: OBJETIVO, operacion: { tipo: "exacta", valor: 0.4 } } };
const TARJETA = ["confirmar", "cambiar", "cancelar"];
beforeEach(() => { h.acciones.length = 0; vi.clearAllMocks(); });
describe("protomolecula.operar", () => {
  it("sin la herramienta en AURORA_ACTIONS dice «próximamente» y no llama a nada", async () => {
    expect(await ejecutarProtomolecula(operar(MOVER), dep)).toEqual({ ok: false, previo: {}, motivo: PROXIMAMENTE_PROTOMOLECULA });
    expect(router.push).not.toHaveBeenCalled();
  });
  it("mover con args válidos llega a la herramienta tal cual, con autor y un deshacer que vuelve a validar", async () => {
    const handler = instalar(), a = operar(MOVER);
    const r = await ejecutarProtomolecula(a, dep);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({ accion: "mover", molecula: "mol-1", objetivo: OBJETIVO, operacion: { tipo: "exacta", valor: 0.4 }, agente: "bot:cafe", origen: "agente" });
    expect(r).toMatchObject({ ok: true, motivo: "Parámetro movido." });
    const vuelta = deshacer(a, r.previo); if (!("accion" in vuelta)) throw new Error("mover debía tener deshacer");
    expect(vuelta.accion.args).toMatchObject({ molecula: "mol-1", accion: "deshacer" });
    expect(validarAccion(vuelta.accion).accion).not.toBeNull();
  });
  it("relativa con un modo que no existe o sin parámetro se rechaza con su motivo", async () => {
    const handler = instalar();
    const malo = await ejecutarProtomolecula(operar({ accion: "mover", args: { objetivo: OBJETIVO, operacion: { tipo: "relativa", cantidad: 3, modo: "mucho" } } }), dep);
    const sinParam = await ejecutarProtomolecula(operar({ accion: "mover", args: { objetivo: { atomoId: "voz-1" }, operacion: { tipo: "exacta", valor: 1 } } }), dep);
    expect(malo).toMatchObject({ ok: false, motivo: expect.stringContaining("operacion") });
    expect(sinParam).toMatchObject({ ok: false, motivo: expect.stringContaining("parametroId") });
    expect(handler).not.toHaveBeenCalled();
  });
  it("una acción fuera de §5.1 no se improvisa y proponer-codigo nunca apunta al núcleo intocable", async () => {
    const handler = instalar();
    const rara = await ejecutarProtomolecula(operar({ accion: "borrar-todo" }), dep);
    const nucleo = await ejecutarProtomolecula(operar({ accion: "proponer-codigo", args: { descripcion: "Convertir el audio a OGG", destino: "src/lib/nucleo/invariantes.ts" } }), dep);
    expect(rara.motivo).toContain("abrir, estado, mover, dictar, deshacer, proponer-codigo");
    expect(nucleo).toMatchObject({ ok: false, motivo: expect.stringContaining("núcleo intocable") });
    expect(handler).not.toHaveBeenCalled();
  });
  it("si la herramienta falla, se dice sin lanzar y sin deshacer inventado", async () => {
    instalar(async () => { throw new Error("roto"); });
    const r = await ejecutarProtomolecula(operar({ accion: "dictar", args: { frase: "sube la reverb al 40 %" } }), dep);
    expect(r).toEqual({ ok: false, previo: {}, motivo: "No pude operar la Protomolécula: ocurrió un error inesperado." });
  });
});
describe("xr.intencion", () => {
  it("devuelve la tarjeta de entenderVoz y no ejecuta nada (lo confirma la persona)", () => {
    const handler = instalar();
    const r = ejecutarIntencionXR(voz("crea un mundo con cielo de noche e invita al grupo Banda"), ctxVoz);
    expect(r).toMatchObject({ ok: true, tarjeta: { titulo: "Esto saldrá de tu cuenta. ¿Lo hago?", acciones: TARJETA } });
    expect(r.tarjeta?.lineas).toContain("Invitar a «Banda» (4 personas)");
    expect([handler.mock.calls.length, router.push.mock.calls.length]).toEqual([0, 0]);
  });
  it("una frase no entendida devuelve la pregunta como motivo, sin previo ni tarjeta", () => {
    const r = ejecutarIntencionXR(voz("zzz qqq"), ctxVoz);
    expect(r).toMatchObject({ ok: false, previo: {}, tarjeta: null, motivo: expect.stringContaining("No he entendido «zzz qqq»") });
    expect(r.voz).toMatchObject({ ok: false, razon: "no-entendido" });
  });
  it("lo que no sale de la cuenta también pide confirmación, con un título honesto", () => {
    const r = ejecutarIntencionXR(voz("llévame a la estación Cumbre"), ctxVoz);
    expect(r.voz.ok && r.voz.tarjeta).toBe(null);
    expect(r.tarjeta).toEqual({ titulo: TITULO_PROPUESTA_BOT, lineas: ["Ir a «Cumbre»"], acciones: TARJETA });
  });
  it("sin contexto no adivina: pregunta y no hay tarjeta", () => {
    const r = ejecutarIntencionXR(voz("invita al grupo Banda"), ctxVoz);
    expect(r).toMatchObject({ ok: false, tarjeta: null, motivo: expect.stringContaining("mundo") });
    expect(ejecutarIntencionXR(operar(MOVER), ctxVoz)).toMatchObject({ ok: false, tarjeta: null, motivo: expect.stringContaining("solo traduce «xr.intencion»") });
  });
  it("una frase que no es texto no llega a entenderVoz (y una vacía ni valida): pregunta y no hay tarjeta", () => {
    const noTexto = ejecutarIntencionXR({ tipo: "xr.intencion", args: { frase: 123 } } as unknown as AccionBot, ctxVoz);
    const vacia = validarAccion({ tipo: "xr.intencion", args: { frase: "" } });
    expect(noTexto).toMatchObject({ ok: false, previo: {}, tarjeta: null, motivo: expect.stringContaining("solo traduce") });
    expect(vacia.accion).toBeNull();
    expect(vacia.problemas.join(" ")).toContain("frase");
  });
  it("avisa de que espera la confirmación solo cuando hay tarjeta", () => {
    const onStatus = vi.fn();
    ejecutarIntencionXR(voz("llévame a la estación Cumbre"), ctxVoz, { onStatus });
    expect(onStatus).toHaveBeenCalledTimes(1);
    ejecutarIntencionXR(voz("zzz qqq"), ctxVoz, { onStatus });
    expect(onStatus).toHaveBeenCalledTimes(1);
  });
});
describe("anclaDeBot", () => {
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const grados = (r: number) => (r * 180) / Math.PI;
  it("es estable: misma entrada, misma ancla; la fase depende solo del bot", () => {
    expect(anclaDeBot("cafe", 2)).toEqual(anclaDeBot("cafe", 2));
    expect([anclaDeBot("cafe", 0).fase === anclaDeBot("cafe", 3).fase, anclaDeBot("cafe", 0).fase === anclaDeBot("banda", 0).fase]).toEqual([true, false]);
    expect(anclaDeBot("cafe", 1).id).toBe("bot:cafe");
  });
  it("las visibles son distintas por índice y no se tocan; del 6.º en adelante van a la ranura de «más»", () => {
    const anclas = Array.from({ length: MAX_ORBES_VISIBLES + 1 }, (_, i) => anclaDeBot(`b${i}`, i));
    for (let i = 0; i < anclas.length; i++) for (let j = i + 1; j < anclas.length; j++) expect(dist(anclas[i].posicion, anclas[j].posicion)).toBeGreaterThan(0.15);
    expect(anclas.map((a) => a.visible)).toEqual([true, true, true, true, true, false]);
    expect(anclaDeBot("x", 9).posicion).toEqual(anclas[MAX_ORBES_VISIBLES].posicion);
  });
  it.each(["de-pie", "sentado"] as const)("%s: ninguna orbe cae dentro de Zenith ni de los laterales", (postura) => {
    const e: EntradaEspacio = { ...ESPACIO_POR_DEFECTO, postura };
    const { zenith, logic } = disponerTrinity(e).nodos;
    for (let i = 0; i < MAX_ORBES_VISIBLES; i++) {
      const [x, , z] = anclaDeBot("b", i, e).posicion;
      const az = Math.abs(grados(Math.atan2(x, -z)));
      expect(az).toBeGreaterThan(grados(Math.atan2(zenith.ancho / 2, zenith.distancia)));
      expect(az).toBeLessThan(Math.abs(logic.azimutDeg) - grados(Math.atan2(logic.ancho / 2, logic.distancia)));
    }
  });
  it("la posición depende del índice y no del bot; cada índice avanza por una ranura distinta", () => {
    expect(anclaDeBot("uno", 1).posicion).toEqual(anclaDeBot("otro", 1).posicion);
    expect(anclaDeBot("uno", 0).posicion).not.toEqual(anclaDeBot("uno", 1).posicion);
  });
  it("con una mano, las orbes van al lado libre (Horizon queda del dominante)", () => {
    const e: EntradaEspacio = { ...ESPACIO_POR_DEFECTO, postura: "una-mano", manoDominante: "derecha" };
    for (let i = 0; i < MAX_ORBES_VISIBLES; i++) expect(anclaDeBot("b", i, e).posicion[0]).toBeLessThan(0);
  });
});
describe("registrarEnEjecutor", () => {
  it("añade los dos ejecutores y el de XR usa el contexto de voz del que llama", async () => {
    const mapa = registrarEnEjecutor(new Map<AccionBot["tipo"], EjecutorCreacion>());
    const [xr, proto] = [mapa.get("xr.intencion"), mapa.get("protomolecula.operar")];
    if (!xr || !proto) throw new Error("faltan ejecutores");
    expect([...mapa.keys()].sort()).toEqual(["protomolecula.operar", "xr.intencion"]);
    expect(await xr(voz("llévame a la estación Cumbre"), { ...dep, contextoVoz: ctxVoz })).toMatchObject({ ok: true, tarjeta: { lineas: ["Ir a «Cumbre»"] } });
    expect((await proto(operar(MOVER), dep)).motivo).toBe(PROXIMAMENTE_PROTOMOLECULA);
  });
});
