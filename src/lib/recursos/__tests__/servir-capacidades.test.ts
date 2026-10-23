import { describe, it, expect } from "vitest";
import { crearSesion, revocar, type Sesion } from "../sesion-prestamo";
import type { OfertaNeurona } from "../oferta";
import { crearServidor, parseMensajeCapacidad, type MsgCapacidad,
  type MsgCapacidadError, type MsgCapacidadFin, type MsgCapacidadSalida,
  type MsgCapacidadTrozo, type TipoCapacidad } from "../servir-capacidades";

const AHORA = 1000;
function oferta(enUso: boolean): OfertaNeurona {
  return {
    nodoId: "anfitrion-a", cuentaId: "cuenta-a", medio: "escritorio",
    computo: { nucleos: 4, ramLibreMb: 2048, gpu: false, motores: ["palabra", "voz"] },
    almacen: { prestaMb: 0, volumenes: [] },
    apps: [], enlaces: {}, energia: { enUso },
    presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 1024, discoMb: 1024, soloCargando: false } },
    t: AHORA,
  };
}
function sesion(id = "s1", tipo: TipoCapacidad = "palabra", duracion = 1000): Sesion {
  return crearSesion({ anfitrion: "anfitrion-a", invitado: "inv-b", alcance: { tipo: "capacidad", id: tipo }, duracionMs: duracion, ahora: AHORA }, () => id);
}function pedir(id: string, tipo: TipoCapacidad = "palabra", sesionId = "s1"): MsgCapacidad {
  return { t: "capacidad.pedir", id, tipo, sesionId, peticion: "hola" };
}
const estadoDe = (m: MsgCapacidadSalida): number => (m.t === "capacidad.error" ? m.estado : 0);
function diferida(): { promesa: Promise<string>; resolver: (v: string) => void } {
  let fuera!: (v: string) => void;
  const promesa = new Promise<string>((r) => { fuera = r; });
  return { promesa, resolver: fuera };
}

describe("servir-capacidades (anfitrión del relé capacidad.*)", () => {
  it("guía el protocolo y rechaza lo mal formado, sin manejador y sin sesión", async () => {
    expect(parseMensajeCapacidad("{")).toBeNull(); expect(parseMensajeCapacidad(JSON.stringify({ t: "otro", id: "x" }))).toBeNull();
    const serv = crearServidor({ manejadores: { palabra: async () => "" }, oferta: oferta(false), sesiones: [sesion()], ahora: () => AHORA });
    expect(estadoDe((await serv.atender({ t: "capacidad.trozo", id: "x", texto: "y" }))[0])).toBe(400);
    expect(estadoDe((await serv.atender(pedir("p1", "voz")))[0])).toBe(404);
    const sinManejador = crearServidor({ manejadores: {}, oferta: oferta(false), sesiones: [sesion()], ahora: () => AHORA });
    expect(estadoDe((await sinManejador.atender(pedir("p1")))[0])).toBe(404);
    const revocada = crearServidor({ manejadores: { palabra: async () => "" }, oferta: oferta(false), sesiones: [revocar(sesion())], ahora: () => AHORA });
    expect(estadoDe((await revocada.atender(pedir("p1")))[0])).toBe(403);
    const vencida = crearServidor({ manejadores: { palabra: async () => "" }, oferta: oferta(false), sesiones: [sesion("s1", "palabra", 100)], ahora: () => AHORA + 200 });
    expect(estadoDe((await vencida.atender(pedir("p1")))[0])).toBe(403);
    const otroAlcance = crearServidor({ manejadores: { voz: async () => "" }, oferta: oferta(false), sesiones: [sesion()], ahora: () => AHORA });
    expect(estadoDe((await otroAlcance.atender(pedir("p1", "voz")))[0])).toBe(403);
  });

  it("contesta 503 con los topes de préstamo a cero (neurona en uso)", async () => {
    const serv = crearServidor({ manejadores: { palabra: async () => "" }, oferta: oferta(true), sesiones: [sesion()], ahora: () => AHORA });
    const salida = await serv.atender(pedir("p1"));
    expect(estadoDe(salida[0])).toBe(503);
    expect((salida[0] as MsgCapacidadError).reintentarEnS).toBe(60);
    expect(serv.prestamos().vivos).toEqual([]);
  });

  it("corre el manejador, trocea la respuesta en bytes UTF-8 y anota el préstamo hecho", async () => {
    let recibida = "";
    const serv = crearServidor({
      manejadores: { palabra: async (p) => { recibida = p; return "ññ"; } },
      oferta: oferta(false), sesiones: [sesion()], ahora: () => AHORA, tamanoTrozo: 3,
    });
    const salida = await serv.atender(pedir("p1"));
    expect(recibida).toBe("hola");
    expect(salida.map((m) => m.t)).toEqual(["capacidad.trozo", "capacidad.trozo", "capacidad.fin"]);
    expect((salida[0] as MsgCapacidadTrozo).texto).toBe("ñ");
    expect((salida[salida.length - 1] as MsgCapacidadFin).bytes).toBe(4);
    expect(serv.prestamos()).toEqual({
      vivos: [],
      hechos: [{ id: "p1", tipo: "palabra", invitado: "inv-b", bytes: 4, ms: 0, estado: "hecho" }],
    });
  });

  it("encola cuando algo corre y contesta 429 con la cola llena", async () => {
    const par = diferida();
    const emitida: MsgCapacidadSalida[] = [];
    const serv = crearServidor({
      manejadores: { palabra: async () => par.promesa },
      oferta: oferta(false), sesiones: [sesion()], ahora: () => AHORA, emisor: (m) => emitida.push(m),
    });
    const enVuelo = serv.atender(pedir("p1"));
    expect(await serv.atender(pedir("p2"))).toEqual([]);
    expect(await serv.atender(pedir("p3"))).toEqual([]);
    expect(await serv.atender(pedir("p4"))).toEqual([]);
    expect(await serv.atender(pedir("p5"))).toEqual([]);
    expect(estadoDe((await serv.atender(pedir("p6")))[0])).toBe(429);
    expect((await serv.atender(pedir("p6")))[0].t).toBe("capacidad.error");
    expect(serv.prestamos().vivos.map((v) => v.id).sort()).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    par.resolver("listo");
    const salida = await enVuelo;
    expect(salida.filter((m) => m.t === "capacidad.fin")).toHaveLength(5);
    expect(emitida.filter((m) => m.t === "capacidad.fin")).toHaveLength(5);
    expect(serv.prestamos().vivos).toEqual([]);
  });

  it("honra la cancelación de una petición en curso y de una en cola", async () => {
    const par = diferida();
    let corto = false;
    const serv = crearServidor({
      manejadores: { palabra: async (_p, { signal }) => { signal.addEventListener("abort", () => { corto = true; }); return par.promesa; } },
      oferta: oferta(false), sesiones: [sesion()], ahora: () => AHORA,
    });
    const enVuelo = serv.atender(pedir("p1"));
    expect(await serv.atender(pedir("p2"))).toEqual([]);
    await serv.atender({ t: "capacidad.cancelar", id: "p1" });
    await serv.atender({ t: "capacidad.cancelar", id: "p2" });
    par.resolver("tarde");
    const salida = await enVuelo;
    expect(corto).toBe(true);
    expect(salida).toHaveLength(1);
    expect(salida[0].t).toBe("capacidad.error");
    expect(estadoDe(salida[0])).toBe(499);
    expect(serv.prestamos()).toEqual({
      vivos: [],
      hechos: [
        { id: "p2", tipo: "palabra", invitado: "inv-b", bytes: 0, ms: 0, estado: "cancelado" },
        { id: "p1", tipo: "palabra", invitado: "inv-b", bytes: 0, ms: 0, estado: "cancelado" },
      ],
    });
  });
});
