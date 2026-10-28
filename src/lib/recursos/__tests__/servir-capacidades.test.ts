import { describe, it, expect } from "vitest";
import { crearSesion, revocar, type Alcance, type Sesion } from "../sesion-prestamo";
import type { OfertaNeurona } from "../oferta";
import {
  crearServidor, esMensajeCapacidad, partirRespuesta, pesoBytes,
  type DepsServidorCapacidades, type ManejadorCapacidad, type MsgCapacidadPedir } from "../servir-capacidades";

let reloj = 1_000;
const ahora = () => reloj;
function oferta(extra: Partial<OfertaNeurona> = {}): OfertaNeurona {
  return {
    nodoId: "n1", cuentaId: "cuentaA", medio: "wifi",
    computo: { nucleos: 4, ramLibreMb: 2048, gpu: false, motores: ["imagen"] },
    almacen: { prestaMb: 1024, volumenes: [] },
    apps: [], enlaces: { subidaKbps: 100, bajadaKbps: 100, latenciaMs: {} },
    energia: { bateriaPct: 80, cargando: false, enUso: false },
    presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 1024, discoMb: 1024, soloCargando: false } },
    t: 1_000, ...extra,
  };
}

function sesion(tipo = "imagen", alcance: Alcance = { tipo: "capacidad", id: tipo }, duracionMs = 60_000): Sesion {
  return crearSesion({ anfitrion: "anfitrion", invitado: "invitado-1", alcance, duracionMs, ahora: reloj }, () => "s1");
}

function pedir(id: string, tipo: MsgCapacidadPedir["tipo"] = "imagen", sesionId = "s1"): MsgCapacidadPedir {
  return { t: "capacidad.pedir", id, sesion: sesionId, tipo };
}

function deps(manejadores: DepsServidorCapacidades["manejadores"], extra: Partial<DepsServidorCapacidades> = {}): DepsServidorCapacidades {
  return { manejadores, oferta: oferta(), sesiones: [sesion()], ahora, ...extra };
}

function puerta() {
  let liberar!: () => void;
  const promesa = new Promise<void>((resolver) => { liberar = resolver; });
  return { promesa, liberar };
}
describe("servir-capacidades", () => {
  it("parte la respuesta en trozos que respetan el tope y mide bytes", () => {
    expect(partirRespuesta("abcdefgh", 3)).toEqual(["abc", "def", "gh"]);
    expect(partirRespuesta("", 3)).toEqual([]);
    expect(pesoBytes("á")).toBe(2);
  });

  it("reconoce solo mensajes capacidad.* bien formados", () => {
    expect(esMensajeCapacidad(pedir("p1"))).toBe(true);
    expect(esMensajeCapacidad({ t: "capacidad.trozo", id: "p1", datos: "x" })).toBe(true);
    expect(esMensajeCapacidad({ t: "capacidad.pedir", id: "", sesion: "s1", tipo: "imagen" })).toBe(false);
    expect(esMensajeCapacidad({ t: "ia.pedir", id: "p1" })).toBe(false);
  });

  it("sirve, trocea, cierra y anota el préstamo", async () => {
    reloj = 1_000;
    const servidor = crearServidor(deps({ imagen: async () => { reloj += 7; return "hola mundo"; } }));
    const salida = await servidor.atender(pedir("p1"));
    const trozos = salida.flatMap((m) => (m.t === "capacidad.trozo" ? [m.datos] : []));
    expect(trozos.join("")).toBe("hola mundo");
    expect(salida[salida.length - 1]).toEqual({ t: "capacidad.fin", id: "p1", bytes: 10 });
    expect(servidor.prestamos()).toEqual([{ id: "p1", invitado: "invitado-1", tipo: "imagen", estado: "hecho", inicio: 1_000, fin: 1_007, ms: 7, bytes: 10 }]);
  });

  it("rechaza sin sesión, revocada, alcance ajeno o topes agotados", async () => {
    const sin = crearServidor(deps({ imagen: async () => "x" }, { sesiones: [] }));
    expect((await sin.atender(pedir("p1")))[0]).toMatchObject({ estado: 401 });
    const revocada = crearServidor(deps({ imagen: async () => "x" }, { sesiones: [revocar(sesion())] }));
    expect((await revocada.atender(pedir("p1")))[0]).toMatchObject({ estado: 401 });
    const ajena = crearServidor(deps({ imagen: async () => "x" }, { sesiones: [sesion("imagen", { tipo: "app", id: "imagen" })] }));
    expect((await ajena.atender(pedir("p1")))[0]).toMatchObject({ estado: 403 });
    const agotada = crearServidor(deps({ imagen: async () => "x" }, { oferta: oferta({ energia: { bateriaPct: 80, cargando: false, enUso: true } }) }));
    expect((await agotada.atender(pedir("p1")))[0]).toMatchObject({ estado: 503 });
  });

  it("dice 501 si no hay manejador para la capacidad", async () => {
    const servidor = crearServidor(deps({}, { sesiones: [sesion("buscar")] }));
    expect((await servidor.atender(pedir("p1", "buscar")))[0]).toMatchObject({ estado: 501 });
  });

  it("encola hasta cuatro y rechaza la quinta espera", async () => {
    const control = puerta();
    const servidor = crearServidor(deps({ imagen: async () => { await control.promesa; return "ok"; } }));
    const primera = servidor.atender(pedir("p0"));
    const esperas = [1, 2, 3, 4].map((n) => servidor.atender(pedir(`p${n}`)));
    expect((await servidor.atender(pedir("p5")))[0]).toMatchObject({ estado: 429, ocupado: true });
    control.liberar();
    for (const salida of await Promise.all([primera, ...esperas])) {
      expect(salida[salida.length - 1]).toMatchObject({ t: "capacidad.fin" });
    }
  });

  it("cancela una espera y un préstamo en curso", async () => {
    const control = puerta();
    const servidor = crearServidor(deps({ imagen: async () => { await control.promesa; return "ok"; } }));
    const primera = servidor.atender(pedir("p0"));
    const enEspera = servidor.atender(pedir("p1"));
    expect(servidor.cancelar("p1")).toBe(true);
    expect((await enEspera)[0]).toMatchObject({ t: "capacidad.error", estado: 499 });
    expect(servidor.prestamos().find((p) => p.id === "p1")?.estado).toBe("cancelado");
    control.liberar();
    await primera;

    const sinSenal: ManejadorCapacidad = (_p, { signal }) => new Promise<string>((_ok, fallo) => {
      signal.addEventListener("abort", () => fallo(new Error("cortado")));
    });
    const otro = crearServidor(deps({ imagen: sinSenal }));
    const enCurso = otro.atender(pedir("p2"));
    expect(otro.cancelar("p2")).toBe(true);
    expect((await enCurso)[0]).toMatchObject({ estado: 499 });
    expect(otro.prestamos()[0].estado).toBe("cancelado");
    expect(otro.cancelar("fantasma")).toBe(false);
  });

  it("devuelve copias del registro de préstamos", async () => {
    const servidor = crearServidor(deps({ imagen: async () => "ok" }));
    await servidor.atender(pedir("p1"));
    const copia = servidor.prestamos();
    copia[0].estado = "error";
    expect(servidor.prestamos()[0].estado).toBe("hecho");
  });
});
