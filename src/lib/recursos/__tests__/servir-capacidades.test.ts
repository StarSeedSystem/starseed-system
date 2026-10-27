import { describe, it, expect } from "vitest";
import { crearServidor } from "../servir-capacidades";
import type { OfertaNeurona } from "../oferta";
import type { Sesion } from "../sesion-prestamo";
import type { TipoCapacidad } from "@/lib/network/capacidad-por-malla";

const AHORA = 1_000;
const oferta = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "host", cuentaId: "cuenta", medio: "wifi", computo: { nucleos: 8, ramLibreMb: 8192, gpu: false, motores: ["imagen"] },
  almacen: { prestaMb: 10_000, volumenes: [] }, apps: [], enlaces: {}, energia: { enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 4096, discoMb: 10_000, soloCargando: false } },
  t: AHORA, ...o,
});
const sesion = (o: Partial<Sesion> = {}): Sesion => ({
  id: "s1", anfitrion: "host", invitado: "invitado", alcance: { tipo: "capacidad", id: "imagen" }, inicio: 0, vence: AHORA + 60_000, revocada: false, ...o,
});
const pedir = (id: string, tipo: TipoCapacidad = "imagen", extra: Record<string, unknown> = {}) =>
  ({ t: "capacidad.pedir" as const, id, tipo, cuerpo: {}, sesionId: "s1", ...extra });
const diferido = <T,>() => {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => (resolver = r));
  return { promesa, resolver };
};
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("sesión, topes y manejador", () => {
  it("exige sesión válida: presente, del anfitrión, vigente y de capacidad", async () => {
    const crear = (s: Sesion) =>
      crearServidor({ manejadores: { imagen: () => "ok" }, oferta: oferta(), sesiones: [s], ahora: AHORA });
    const s = crear(sesion());
    expect((await s.atender(pedir("a", "imagen", { sesionId: undefined })))[0]).toMatchObject({ estado: 401 });
    expect((await s.atender(pedir("b", "imagen", { sesionId: "nadie" })))[0]).toMatchObject({ estado: 403 });
    expect((await crear(sesion({ revocada: true })).atender(pedir("c")))[0]).toMatchObject({ estado: 403 });
    expect((await crear(sesion({ anfitrion: "otro" })).atender(pedir("d")))[0]).toMatchObject({ estado: 403 });
    expect((await crear(sesion({ alcance: { tipo: "app", id: "x" } })).atender(pedir("e")))[0]).toMatchObject({ estado: 403 });
    expect((await s.atender(pedir("f"))).some((m) => m.t === "capacidad.fin")).toBe(true);
  });
  it("rechaza tipo sin manejador y una neurona sin capacidad prestable", async () => {
    const sin = crearServidor({ manejadores: {}, oferta: oferta(), sesiones: [sesion()], ahora: AHORA });
    expect((await sin.atender(pedir("a")))[0]).toMatchObject({ estado: 501 });
    const apagada = oferta({ almacen: { prestaMb: 0, volumenes: [] }, energia: { enUso: true } });
    const s = crearServidor({ manejadores: { imagen: () => "ok" }, oferta: apagada, sesiones: [sesion()], ahora: AHORA });
    expect((await s.atender(pedir("b")))[0]).toMatchObject({ estado: 503 });
  });
  it("trocea la respuesta, cierra con fin y anota bytes y ms", async () => {
    const largo = "á".repeat(9_000);
    let reloj = AHORA;
    const s = crearServidor({
      manejadores: { imagen: () => { reloj = AHORA + 30; return largo; } },
      oferta: oferta(), sesiones: [sesion()], ahora: () => reloj,
    });
    const salida = await s.atender(pedir("a"));
    expect(salida[salida.length - 1]).toEqual({ t: "capacidad.fin", id: "a", resultado: largo });
    expect(salida.filter((m) => m.t === "capacidad.trozo").length).toBe(2);
    expect(s.prestamos()[0]).toMatchObject({ id: "a", invitado: "invitado", tipo: "imagen", estado: "hecho", bytes: 18_000, ms: 30 });
  });
  it("ignora mensajes ajenos y no filtra el error del manejador", async () => {
    const s = crearServidor({
      manejadores: { imagen: () => { throw new Error("ruta /Users/secreto"); } },
      oferta: oferta(), sesiones: [sesion()], ahora: AHORA,
    });
    expect(await s.atender({ t: "ia.pedir", id: "x" })).toEqual([]);
    expect(await s.atender(null)).toEqual([]);
    const salida = await s.atender(pedir("a"));
    expect(salida[0]).toMatchObject({ t: "capacidad.error", estado: 502 });
    expect(JSON.stringify(salida)).not.toContain("/Users");
    expect(s.prestamos()[0]).toMatchObject({ estado: "error", motivo: "El manejador falló." });
  });
});

describe("cola, cancelación y registro", () => {
  it("deja 1 en curso, encola hasta 4 y rechaza la sexta", async () => {
    const esperas = Array.from({ length: 4 }, () => diferido<string>());
    let i = 0;
    const s = crearServidor({ manejadores: { imagen: () => esperas[i++].promesa }, oferta: oferta(), sesiones: [sesion()], ahora: AHORA });
    const p1 = s.atender(pedir("1"));
    const p2 = s.atender(pedir("2"));
    const p3 = s.atender(pedir("3"));
    const p4 = s.atender(pedir("4"));
    const p5 = s.atender(pedir("5"));
    expect((await s.atender(pedir("1")))[0]).toMatchObject({ estado: 409 });
    expect((await s.atender(pedir("6")))[0]).toMatchObject({ estado: 429 });
    expect(s.prestamos().map((p) => p.estado)).toEqual(["en-curso", "en-cola", "en-cola", "en-cola", "en-cola"]);
    await s.atender({ t: "capacidad.cancelar", id: "3" });
    expect(s.prestamos().find((p) => p.id === "3")?.estado).toBe("cancelado");
    esperas[0].resolver("uno"); await p1;
    esperas[1].resolver("dos"); await p2;
    esperas[2].resolver("cuatro"); await p4;
    esperas[3].resolver("cinco"); await p5;
    expect(await p3).toEqual([]);
    expect(s.prestamos().filter((p) => p.estado === "hecho").length).toBe(4);
  });
  it("cancelar en curso aborta la señal y no responde", async () => {
    const d = diferido<string>();
    let señal: AbortSignal | undefined;
    const s = crearServidor({
      manejadores: { imagen: (_c, ctx) => { señal = ctx.signal; return d.promesa; } },
      oferta: oferta(), sesiones: [sesion()], ahora: AHORA,
    });
    const p = s.atender(pedir("1"));
    await flush();
    await s.atender({ t: "capacidad.cancelar", id: "1" });
    expect(señal?.aborted).toBe(true);
    d.resolver("tarde");
    expect(await p).toEqual([]);
    expect(s.prestamos()[0]).toMatchObject({ estado: "cancelado", motivo: "Cancelada por quien pedía." });
  });
  it("prestamos() mide el préstamo vivo con el reloj inyectado", async () => {
    const d = diferido<string>();
    let reloj = AHORA;
    const s = crearServidor({ manejadores: { imagen: () => d.promesa }, oferta: oferta(), sesiones: [sesion()], ahora: () => reloj });
    const p = s.atender(pedir("1"));
    await flush();
    reloj = AHORA + 250;
    expect(s.prestamos()[0]).toMatchObject({ estado: "en-curso", ms: 250, bytes: 0 });
    d.resolver("hecho");
    expect((await p).some((m) => m.t === "capacidad.fin")).toBe(true);
    expect(s.prestamos()[0].ms).toBe(250);
  });
});
