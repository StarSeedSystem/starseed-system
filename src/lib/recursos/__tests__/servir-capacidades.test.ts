import { describe, it, expect, beforeEach } from "vitest";
import { crearServidor, MAX_COLA, type ManejadorCapacidad, type ResultadoAtencion } from "../servir-capacidades";
import { crearSesion, type Sesion } from "../sesion-prestamo";
import type { OfertaNeurona } from "../oferta";
import { CAPACIDAD_MALLA_MAX_BYTES, type Msg } from "../../network/capacidad-por-malla";

const AHORA = 1_700_000_000_000;
let reloj = AHORA;
const ahora = (): number => reloj;

const oferta = (extra: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: "n1", cuentaId: "cuentaA", medio: "wifi",
  computo: { nucleos: 8, ramLibreMb: 4096, gpu: true, vramMb: 8192, motores: ["imagen"] },
  almacen: { prestaMb: 512, volumenes: [] }, apps: [], enlaces: {},
  energia: { bateriaPct: 90, cargando: false, enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 2048, discoMb: 512, soloCargando: false } },
  t: AHORA, ...extra,
});

const sesionNueva = (): Sesion => crearSesion({ anfitrion: "n1", invitado: "inv1", alcance: { tipo: "capacidad", id: "cap-voz" }, duracionMs: 60_000, ahora: reloj });

const pedir = (id: string, sesionId: string, tipo: string = "voz"): unknown => ({ t: "capacidad.pedir", id, tipo, cuerpo: {}, sesionId });

const estadoError = (r: ResultadoAtencion): number => { const m = r.mensajes[0] as Msg | undefined; return m && m.t === "capacidad.error" ? m.estado : 0; };

const ok0: ManejadorCapacidad = () => "ok";
const servidorDe = (s: Sesion, manejador: ManejadorCapacidad, o: Partial<OfertaNeurona> = {}) =>
  crearServidor({ manejadores: { voz: manejador }, oferta: oferta(o), sesiones: [s], ahora });

describe("atender · admisión", () => {
  beforeEach(() => { reloj = AHORA; });

  it("rechaza sin sesión válida (401), de otro anfitrión o revocada", async () => {
    const s = sesionNueva();
    expect(estadoError(await servidorDe(s, ok0).atender(pedir("a", "no-existe")))).toBe(401);
    expect(estadoError(await servidorDe({ ...s, anfitrion: "otro-nodo" }, ok0).atender(pedir("b", s.id)))).toBe(401);
    expect(estadoError(await servidorDe({ ...s, revocada: true }, ok0).atender(pedir("c", s.id)))).toBe(401);
  });

  it("rechaza sesión expirada por el reloj (401)", async () => {
    const s = sesionNueva(); reloj += 70_000;
    expect(estadoError(await servidorDe(s, ok0).atender(pedir("d", s.id)))).toBe(401);
  });

  it("rechaza topes agotados de `capacidadPrestable` (403), tipo sin manejador (501) y desconocido (404)", async () => {
    const s = sesionNueva();
    expect(estadoError(await servidorDe(s, ok0, { energia: { bateriaPct: 20, enUso: true } }).atender(pedir("e", s.id)))).toBe(403);
    const normal = servidorDe(s, ok0);
    expect(estadoError(await normal.atender(pedir("f", s.id, "render")))).toBe(501);
    expect(estadoError(await normal.atender(pedir("g", s.id, "desconocido")))).toBe(404);
  });

  it("rechaza mensaje mal formado en silencio", async () => {
    expect(await servidorDe(sesionNueva(), ok0).atender({ raro: true })).toEqual({ mensajes: [], prestamo: null });
  });
});

describe("atender · ejecución, troceo y cola", () => {
  it("corre el manejador, trocea la respuesta al límite y anuncia el fin", async () => {
    const s = sesionNueva();
    const servidor = servidorDe(s, () => ({ texto: "x".repeat(40_000) }));
    const r = await servidor.atender(pedir("h", s.id));
    const trozos = r.mensajes.filter((m) => m.t === "capacidad.trozo"); const fin = r.mensajes.find((m) => m.t === "capacidad.fin");
    expect(trozos.length).toBeGreaterThan(1);
    expect(trozos.every((m) => m.t === "capacidad.trozo" && m.texto.length <= CAPACIDAD_MALLA_MAX_BYTES - 256)).toBe(true);
    expect(fin && fin.t === "capacidad.fin" ? fin.resultado : null).toEqual({ texto: "x".repeat(40_000) });
    expect(servidor.prestamos().vivos).toEqual([]);
    const hecho = servidor.prestamos().hechos[0];
    expect(hecho).toMatchObject({ id: "h", tipo: "voz", invitado: "inv1", estado: "hecho" });
    expect(hecho.bytes).toBeGreaterThan(1_000); expect(hecho.ms).toBeGreaterThanOrEqual(0);
  });

  it("encola si está ocupado, rechaza al rebasar 4 y desencola en orden", async () => {
    const s = sesionNueva();
    let llamadas = 0; let soltar: (v: unknown) => void = () => {};
    const colgador: ManejadorCapacidad = () =>
      ++llamadas === 1 ? new Promise((r) => { soltar = r; }) : Promise.resolve("ok");
    const servidor = servidorDe(s, colgador);
    const peticiones = ["i1", "i2", "i3", "i4", "i5", "i6"].map((id) => servidor.atender(pedir(id, s.id)));
    expect(estadoError(await peticiones[5])).toBe(429);
    const { vivos } = servidor.prestamos();
    expect(vivos.length).toBe(5); expect(vivos.filter((p) => p.estado === "encolado").length).toBe(4);
    soltar("listo"); await Promise.all(peticiones);
    expect(servidor.prestamos().hechos.filter((p) => p.estado === "hecho").length).toBe(5);
  });

  it("acepta JSON crudo por string y error del manejador (500)", async () => {
    const s = sesionNueva();
    const servidor = servidorDe(s, () => { throw new Error("fallo inyectado"); });
    expect(estadoError(await servidor.atender(JSON.stringify(pedir("j", s.id))))).toBe(500);
    expect(servidor.prestamos().hechos[0]).toMatchObject({ estado: "error" });
  });
});

describe("cancelar y préstamos", () => {
  it("cancela un préstamo encolado y lo aparta de la cola", async () => {
    const s = sesionNueva();
    let soltar: (v: unknown) => void = () => {};
    const servidor = servidorDe(s, () => new Promise((r) => { soltar = r; }));
    const p1 = servidor.atender(pedir("k1", s.id)); const p2 = servidor.atender(pedir("k2", s.id));
    expect((await servidor.cancelar("k2")).prestamo).toMatchObject({ id: "k2", estado: "cancelado" });
    expect(servidor.prestamos().hechos[0]).toMatchObject({ id: "k2", estado: "cancelado" });
    soltar("listo"); await Promise.all([p1, p2]);
    expect(servidor.prestamos().hechos.length).toBe(2);  });

  it("cancela un préstamo activo de forma cooperativa vía ctx.cancelada()", async () => {
    const s = sesionNueva();
    const servidor = servidorDe(s, (_cuerpo, ctx) => new Promise((resolver) => {
      const t = setInterval(() => { if (ctx.cancelada()) { clearInterval(t); resolver("cortado"); } }, 1);
    }));
    const r = servidor.atender(pedir("k3", s.id)); await servidor.cancelar("k3");
    expect((await r).prestamo).toMatchObject({ id: "k3", estado: "cancelado" });
  });

  it("ignora cancelar tardías o desconocidas sin tocar nada", async () => {
    const servidor = servidorDe(sesionNueva(), ok0);
    expect((await servidor.cancelar("desconocido")).prestamo).toBeNull();
    expect((await servidor.atender({ t: "capacidad.cancelar", id: "desconocido" })).mensajes).toEqual([]);
  });
});
