import { describe, it, expect } from "vitest";
import { crearServidor, type MsgCapacidadPedir, type Prestamo } from "../servir-capacidades";
import { crearSesion, revocar, type Sesion } from "../sesion-prestamo";
import type { OfertaNeurona } from "../oferta";

const AHORA = 1_000_000;
const ahora = () => AHORA;

const oferta = (sobre?: Partial<OfertaNeurona>): OfertaNeurona => ({
  nodoId: "nodo-anfitrion", cuentaId: "cuenta-1", medio: "mac",
  computo: { nucleos: 4, ramLibreMb: 2048, gpu: false, motores: ["imagen"] },
  almacen: { prestaMb: 0, volumenes: [] },
  apps: [], enlaces: {}, energia: { enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 1024, discoMb: 0, soloCargando: false } },
  t: AHORA,
  ...sobre,
});

const sesion = (id: string, capacidad: string = "imagen"): Sesion =>
  crearSesion({ anfitrion: "nodo-anfitrion", invitado: "invitado-1", alcance: { tipo: "capacidad", id: capacidad }, duracionMs: 60_000, ahora: AHORA }, () => id);

const pedir = (sobre?: Partial<MsgCapacidadPedir>): MsgCapacidadPedir => ({
  t: "capacidad.pedir", id: "p1", sesionId: "s1", capacidad: "imagen", ...sobre,
});

const denegacion = (sobre?: Partial<OfertaNeurona>, sobrePedir?: Partial<MsgCapacidadPedir>, sesiones = [sesion("s1")]) => {
  const servidor = crearServidor({ manejadores: { imagen: () => "x" }, oferta: oferta(sobre), sesiones, ahora, salidas: () => {} });
  return servidor.atender(pedir(sobrePedir));
};

const diferido = () => {
  const pendiente: { resolver: (texto: string) => void; promesa: Promise<string> } = { resolver: () => {}, promesa: Promise.resolve("") };
  pendiente.promesa = new Promise<string>((res) => { pendiente.resolver = res; });
  return pendiente;
};

const esperar = () => new Promise<void>((res) => setTimeout(res, 0));

describe("servir-capacidades · admisión", () => {
  it("deniega si no hay sesión, la sesión es de otra neurona o está revocada", async () => {
    expect((await denegacion(undefined, { sesionId: "nadie" })).t).toBe("denegado");
    const otra = crearSesion({ anfitrion: "otro-nodo", invitado: "invitado-1", alcance: { tipo: "capacidad", id: "imagen" }, duracionMs: 60_000, ahora: AHORA }, () => "s1");
    expect((await denegacion(undefined, undefined, [otra])).t).toBe("denegado");
    expect((await denegacion(undefined, undefined, [revocar(sesion("s1"))])).t).toBe("denegado");
  });

  it("deniega si la sesión no cubre la capacidad o el anfitrión no la sirve", async () => {
    expect((await denegacion(undefined, undefined, [sesion("s1", "voz")])).t).toBe("denegado");
    const servidor = crearServidor({ manejadores: {}, oferta: oferta(), sesiones: [sesion("s1")], ahora });
    expect((await servidor.atender(pedir())).t).toBe("denegado");
  });

  it("deniega por los topes de capacidadPrestable: neurona en uso o batería baja", async () => {
    expect((await denegacion({ energia: { enUso: true } })).t).toBe("denegado");
    expect((await denegacion({ energia: { enUso: false, bateriaPct: 10 } })).t).toBe("denegado");
  });

  it("acepta un préstamo válido y registra quién pide", async () => {
    const servidor = crearServidor({ manejadores: { imagen: () => "hola" }, oferta: oferta(), sesiones: [sesion("s1")], ahora });
    expect(await servidor.atender(pedir())).toEqual({ t: "acepta" });
    expect(servidor.prestamos()).toEqual([{
      id: "p1", capacidad: "imagen", invitado: "invitado-1", sesionId: "s1",
      estado: "hecho", inicio: AHORA, fin: AHORA, bytes: 4,
    }]);
  });
});

describe("servir-capacidades · troceo y errores", () => {
  it("sirve la respuesta troceada y acaba con su fin de bytes", async () => {
    const salidas: Array<{ t: string; texto?: string; bytes?: number }> = [];
    const servidor = crearServidor({
      manejadores: { imagen: () => "abcdefghij" }, oferta: oferta(), sesiones: [sesion("s1")],
      ahora, tamanyoTrozoBytes: 4, salidas: (m) => salidas.push(m),
    });
    expect(await servidor.atender(pedir())).toEqual({ t: "acepta" });
    expect(salidas).toEqual([
      { t: "capacidad.trozo", id: "p1", texto: "abcd" },
      { t: "capacidad.trozo", id: "p1", texto: "efgh" },
      { t: "capacidad.trozo", id: "p1", texto: "ij" },
      { t: "capacidad.fin", id: "p1", bytes: 10 },
    ]);
    expect(servidor.prestamos()[0].estado).toBe("hecho");
  });

  it("manda capacidad.error si el manejador falla y no deja el préstamo vivo", async () => {
    const salidas: Array<{ t: string; texto?: string; bytes?: number; estado?: number; mensaje?: string }> = [];
    const servidor = crearServidor({
      manejadores: { imagen: () => { throw new Error("motor roto"); } }, oferta: oferta(),
      sesiones: [sesion("s1")], ahora, salidas: (m) => salidas.push(m),
    });
    await servidor.atender(pedir());
    expect(salidas).toEqual([{ t: "capacidad.error", id: "p1", estado: 500, mensaje: "motor roto" }]);
    expect(servidor.prestamos()[0].estado).toBe("cancelado");
  });
});

describe("servir-capacidades · cola", () => {
  it("encola cuando está lleno el curso y la despacha al terminar", async () => {
    const d1 = diferido();
    const d2 = diferido();
    const manejadores = { imagen: (datos?: string) => (datos === "uno" ? d1.promesa : d2.promesa) };
    const servidor = crearServidor({ manejadores, oferta: oferta(), sesiones: [sesion("s1")], ahora, salidas: () => {} });
    expect((await servidor.atender(pedir({ id: "p1", datos: "uno" }))).t).toBe("acepta");
    expect(await servidor.atender(pedir({ id: "p2", datos: "dos" }))).toEqual({ t: "en cola", posicion: 1 });
    expect(servidor.prestamos().map((p) => p.estado)).toEqual(["en curso", "colada"]);
    d1.resolver("hola");
    await esperar();
    expect(servidor.prestamos().map((p) => p.estado)).toEqual(["hecho", "en curso"]);
    d2.resolver("chau");
    await esperar();
    expect(servidor.prestamos().map((p) => p.estado)).toEqual(["hecho", "hecho"]);
  });

  it("deniega cuando la cola alcanza su máximo", async () => {
    const d1 = diferido();
    const servidor = crearServidor({
      manejadores: { imagen: () => d1.promesa }, oferta: oferta(), sesiones: [sesion("s1")],
      ahora, maxEnCurso: 1, maxEnCola: 1, salidas: () => {},
    });
    expect((await servidor.atender(pedir({ id: "p1" }))).t).toBe("acepta");
    expect(await servidor.atender(pedir({ id: "p2" }))).toEqual({ t: "en cola", posicion: 1 });
    const tercero = await servidor.atender(pedir({ id: "p3" }));
    expect(tercero).toEqual({ t: "denegado", mensaje: expect.stringContaining("llena") });
    expect(servidor.prestamos()).toHaveLength(2);
    d1.resolver("ok");
  });
});

describe("servir-capacidades · cancelación", () => {
  it("corta un préstamo en curso vía capacidad.cancelar y lo anota", async () => {
    // El manejador honra la señal: al abort, rechaza (así lo hará un manejador real).
    const manejador = (_datos: string | undefined, { signal }: { signal: AbortSignal }) =>
      new Promise<string>((_ok, romper) => signal.addEventListener("abort", () => romper(new Error("abortado"))));
    const salidas: Array<{ t: string; texto?: string; bytes?: number; estado?: number; mensaje?: string }> = [];
    const servidor = crearServidor({
      manejadores: { imagen: manejador }, oferta: oferta(), sesiones: [sesion("s1")],
      ahora, salidas: (m) => salidas.push(m),
    });
    await servidor.atender(pedir({ id: "p1" }));
    expect(await servidor.atender({ t: "capacidad.cancelar", id: "p1" })).toEqual({ t: "acepta" });
    await esperar();
    expect(servidor.prestamos()[0].estado).toBe("cancelado");
    expect(salidas).toEqual([{ t: "capacidad.error", id: "p1", estado: 499, mensaje: "Préstamo cancelado." }]);
    expect(servidor.cancelar("desaparecido")).toBe(false);
  });

  it("quita de la cola un préstamo cancelado sin arrancarlo", async () => {
    const d1 = diferido();
    const servidor = crearServidor({
      manejadores: { imagen: () => d1.promesa }, oferta: oferta(), sesiones: [sesion("s1")],
      ahora, maxEnCurso: 1, salidas: () => {},
    });
    await servidor.atender(pedir({ id: "p1" }));
    expect(await servidor.atender(pedir({ id: "p2" }))).toEqual({ t: "en cola", posicion: 1 });
    expect(await servidor.atender({ t: "capacidad.cancelar", id: "p2" })).toEqual({ t: "acepta" });
    const prestamo = servidor.prestamos().find((p) => p.id === "p2") as Prestamo;
    expect(prestamo.estado).toBe("cancelado");
    d1.resolver("ok");
    await esperar();
    expect(servidor.prestamos().map((p) => p.estado)).toEqual(["hecho", "cancelado"]);
  });
});
