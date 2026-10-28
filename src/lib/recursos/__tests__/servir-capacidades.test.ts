/**
 * Pruebas de servir-capacidades (Ola 1017A · F): admisión (sesión y topes),
 * cola con tope 4, troceado, cancelación y anotación de préstamos.
 * Sin red, sin disco: reloj y envío inyectados, manejadores de mentira.
 */
import { describe, it, expect } from "vitest";
import {
  bytesUtf8,
  type Msg,
  type MsgError,
  type MsgFin,
  type MsgTrozo,
  type TipoCapacidad,
} from "../../network/capacidad-por-malla";
import { crearServidor, cupoDePrestamos, MAX_EN_COLA, type ManejadoresCapacidad } from "../servir-capacidades";
import { crearSesion, revocar } from "../sesion-prestamo";
import { type OfertaNeurona } from "../oferta";

const BASE = 1_000;
let ya = BASE;
const reloj = () => ya;
const espera = () => new Promise<void>((res) => { setTimeout(res, 0); });

const ofertaBase = (ext: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "nodo-1", cuentaId: "c-1", medio: "mac", t: BASE,
  computo: { nucleos: 4, ramLibreMb: 8_000, gpu: false, motores: ["palabra"] },
  almacen: { prestaMb: 0, volumenes: [] },
  apps: [], enlaces: {}, energia: { enUso: false },
  presta: {
    cuenta: true, grupos: [], publico: false,
    topes: { cpuPct: 100, ramMb: 4_000, discoMb: 0, soloCargando: false },
  },
  ...ext,
});

const sesionValida = (duracionMs = 10_000) =>
  crearSesion(
    { anfitrion: "nodo-1", invitado: "par-1", alcance: { tipo: "capacidad", id: "palabra" }, duracionMs, ahora: BASE },
    () => "s1",
  );

const serv = (manejadores: ManejadoresCapacidad, ext: Partial<OfertaNeurona> = {}, sesiones?: ReturnType<typeof sesionValida>[]) =>
  crearServidor({ manejadores, oferta: ofertaBase(ext), sesiones: sesiones ?? [sesionValida()], ahora: reloj });

const colector = () => {
  const salidas: Msg[] = [];
  return { salidas, enviar: (m: Msg) => { salidas.push(m); return true; } };
};

const pedir = (id: string, tipo: TipoCapacidad = "palabra"): Msg =>
  ({ t: "capacidad.pedir", id, tipo, cuerpo: {}, sesionId: "s1" });

const esError = (m: Msg): m is MsgError => m.t === "capacidad.error";
const esFin = (m: Msg): m is MsgFin => m.t === "capacidad.fin";
const esTrozo = (m: Msg): m is MsgTrozo => m.t === "capacidad.trozo";

/** Manejador que se queda colgado hasta que la prueba lo suelta por su orden. */
const colgante = () => {
  const sueltas: ((v: unknown) => void)[] = [];
  return { manejador: () => new Promise((res) => { sueltas.push(res); }), sueltas };
};

describe("cupoDePrestamos (los topes fijan el cupo)", () => {
  it("se reduce con el tanto por ciento y va a cero sin cargador", () => {
    expect(cupoDePrestamos(ofertaBase())).toBe(4);
    expect(cupoDePrestamos(ofertaBase({
      computo: { nucleos: 5, ramLibreMb: 1, gpu: false, motores: [] },
      presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 40, ramMb: 100, discoMb: 0, soloCargando: false } },
    }))).toBe(2); // 5 núcleos con el 40 % prestable: 2
    const sinCargador = ofertaBase({
      presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 100, discoMb: 0, soloCargando: true } },
      energia: { enUso: false, cargando: false },
    });
    expect(cupoDePrestamos(sinCargador)).toBe(0);
  });
});

describe("atender", () => {
  it("sirve una respuesta corta en un único capacidad.fin y anota el préstamo", async () => {
    ya = BASE;
    const s = serv({ palabra: async () => "hola" });
    const e = colector();
    await s.atender(pedir("p1"), e.enviar);
    await espera();
    expect(e.salidas).toEqual([{ t: "capacidad.fin", id: "p1", resultado: "hola" }]);
    const p = s.prestamos()[0];
    expect(p.estado).toBe("hecho");
    expect(p.invitado).toBe("par-1");
    expect(p.tipo).toBe("palabra");
    expect(p.bytes).toBe(bytesUtf8("hola"));
    expect(p.trozos).toBe(0);
  });

  it("trocea una respuesta grande y remata con un fin resumen", async () => {
    ya = BASE;
    const s = serv({ palabra: async () => "x".repeat(40_000) });
    const e = colector();
    await s.atender(pedir("p1"), e.enviar);
    await espera();
    const trozos = e.salidas.filter(esTrozo);
    expect(trozos.length).toBeGreaterThan(1);
    expect(e.salidas).toHaveLength(trozos.length + 1);
    const fin = e.salidas.find(esFin);
    expect(fin && fin.resultado).toEqual({ trozos: trozos.length, bytes: 40_000 });
    const p = s.prestamos()[0];
    expect(p.estado).toBe("hecho");
    expect(p.bytes).toBe(40_000);
    expect(p.trozos).toBe(trozos.length);
    expect(e.salidas.every((m) => m.id === "p1")).toBe(true);
  });

  it("rechaza toda petición sin prerrogativa: sesión ajena, revocada, tipo sin manejador y topes a cero", async () => {
    ya = BASE;
    const e1 = colector();
    await serv({ palabra: async () => 1 }, {}, [sesionValida()]).atender(pedir("r1", "imagen"), e1.enviar);
    expect(e1.salidas.find(esError)?.estado).toBe(404);

    const e2 = colector();
    await serv({ palabra: async () => 1 }, {}, []).atender(pedir("r2"), e2.enviar);
    expect(e2.salidas.find(esError)?.estado).toBe(403);

    const e3 = colector();
    await serv({ palabra: async () => 1 }, {}, [revocar(sesionValida())]).atender(pedir("r3"), e3.enviar);
    const expulsada = e3.salidas.find(esError);
    expect(expulsada?.estado).toBe(403);
    expect(expulsada?.mensaje).toContain("caducada o revocada");

    const e4 = colector();
    const aterrizada = serv(
      { palabra: async () => 1 },
      {
        presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 0, ramMb: 0, discoMb: 0, soloCargando: true } },
        energia: { enUso: false, cargando: false },
      },
    );
    await aterrizada.atender(pedir("r4"), e4.enviar);
    expect(e4.salidas.find(esError)?.estado).toBe(429);
    expect(e4.salidas.find(esError)?.mensaje).toContain("cero");
    expect(aterrizada.prestamos()).toEqual([]); // nada pasó, nada se anota
  });

  it("encola cuando el cupo va lleno, admite 4 como mucho y sirve al liberar", async () => {
    ya = BASE;
    const { manejador, sueltas } = colgante();
    const s = serv({ palabra: manejador }, {
      presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 25, ramMb: 4_000, discoMb: 0, soloCargando: false } },
    });
    expect(cupoDePrestamos(ofertaBase({
      presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 25, ramMb: 4_000, discoMb: 0, soloCargando: false } },
    }))).toBe(1); // el escenario: el cupo aquí es 1
    const e = colector();
    await s.atender(pedir("1"), e.enviar);
    expect(s.prestamos()[0].estado).toBe("vivo");
    for (const i of ["2", "3", "4", "5"]) await s.atender(pedir(i), e.enviar);
    expect(s.cola()).toBe(4);
    expect(s.prestamos().filter((p) => p.estado === "enCola")).toHaveLength(MAX_EN_COLA);
    await s.atender(pedir("6"), e.enviar); // la cola ya está llena
    expect(e.salidas.find(esError)?.estado).toBe(429);
    expect(s.prestamos()).toHaveLength(5);
    sueltas.shift()?.("ok");
    await espera();
    expect(s.prestamos().find((p) => p.id === "2")?.estado).toBe("vivo");
    expect(s.cola()).toBe(3);
    while (sueltas.length) { sueltas.shift()?.("fin"); await espera(); }
    expect(s.prestamos().every((p) => p.estado === "hecho")).toBe(true);
  });

  it("cancela en la cola y también cuando ya sirve; si sirve, no manda fin", async () => {
    ya = BASE;
    const { manejador, sueltas } = colgante();
    const s = serv({ palabra: manejador }, {
      presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 25, ramMb: 4_000, discoMb: 0, soloCargando: false } },
    });
    const e = colector();
    await s.atender(pedir("1"), e.enviar);
    await s.atender(pedir("2"), e.enviar); // enCola
    await s.atender({ t: "capacidad.cancelar", id: "2" }, e.enviar);
    expect(s.cola()).toBe(0);
    expect(s.prestamos().find((p) => p.id === "2")).toMatchObject({ estado: "cancelado" });
    await s.atender({ t: "capacidad.cancelar", id: "1" }, e.enviar);
    sueltas.shift()?.("nunca servido");
    await espera();
    expect(e.salidas).toEqual([]);
    expect(s.prestamos().find((p) => p.id === "1")).toMatchObject({ estado: "cancelado", motivo: "Cancelado por quien pidió." });
  });

  it("rechaza (403) la petición cuya sesión caduca mientras espera en la cola", async () => {
    ya = BASE;
    const { manejador, sueltas } = colgante();
    const s = serv({ palabra: manejador }, {
      presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 25, ramMb: 4_000, discoMb: 0, soloCargando: false } },
    }, [sesionValida(1_000)]);
    const e = colector();
    await s.atender(pedir("1"), e.enviar);
    await s.atender(pedir("2"), e.enviar); // enCola
    ya += 2_000;
    sueltas.shift()?.("ok");
    await espera();
    const error = e.salidas.find(esError);
    expect(error?.estado).toBe(403);
    expect(error?.mensaje).toContain("Caducó en la cola");
    expect(s.prestamos().find((p) => p.id === "2")?.estado).toBe("error");
  });

  it("anota y avisa cuando el manejador falla (500)", async () => {
    ya = BASE;
    const s = serv({ palabra: async () => { throw new Error("se rompió"); } });
    const e = colector();
    await s.atender(pedir("p1"), e.enviar);
    await espera();
    const error = e.salidas.find(esError);
    expect(error?.estado).toBe(500);
    expect(error?.mensaje).toContain("se rompió");
    expect(s.prestamos()[0]).toMatchObject({ estado: "error" });
    expect(s.prestamos()[0].motivo).toContain("se rompió");
  });
});
