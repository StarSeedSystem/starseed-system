import { describe, it, expect } from "vitest";
import { crearServidor, type ManejadorCapacidad } from "../servir-capacidades";
import { crearSesion, revocar, type Sesion } from "../sesion-prestamo";
import type { OfertaNeurona } from "../oferta";
import type { MsgCancelar, MsgPedir, MsgTrozo, TipoCapacidad } from "@/lib/network/capacidad-por-malla";

const ANFITRION = "nodo-anfitrion";
const INVITADO = "nodo-invitado";

function oferta(extra: Partial<OfertaNeurona> = {}): OfertaNeurona {
  return {
    nodoId: ANFITRION,
    cuentaId: "cuenta-a",
    medio: "lan",
    computo: {
      nucleos: 4,
      ramLibreMb: 4096,
      gpu: true,
      vramMb: 8192,
      motores: ["imagen", "voz", "oido", "palabra", "transcodificar", "render"],
    },
    almacen: { prestaMb: 1024, volumenes: [] },
    apps: [],
    enlaces: {},
    energia: { bateriaPct: 90, cargando: false, enUso: false },
    presta: {
      cuenta: true,
      grupos: [],
      publico: false,
      topes: { cpuPct: 100, ramMb: 4096, discoMb: 1024, soloCargando: false },
    },
    t: new Date(2026, 9, 18, 10, 0, 0).getTime(),
    ...extra,
  };
}

function sesion(ahora: number, alcanceId = "imagen", anfitrion = ANFITRION): Sesion {
  return crearSesion(
    {
      anfitrion,
      invitado: INVITADO,
      alcance: { tipo: "capacidad", id: alcanceId },
      duracionMs: 60_000,
      ahora,
    },
    () => "ses-1",
  );
}

const pedir = (id: string, tipo: TipoCapacidad = "imagen", sesionId = "ses-1"): MsgPedir => ({
  t: "capacidad.pedir",
  id,
  tipo,
  cuerpo: {},
  sesionId,
});

function aplazar(): { promesa: Promise<void>; liberar: () => void } {
  let liberar: () => void = () => {};
  const promesa = new Promise<void>((resolver) => {
    liberar = () => resolver();
  });
  return { promesa, liberar };
}

function montar(extra: {
  manejadores?: Partial<Record<TipoCapacidad, ManejadorCapacidad>>;
  oferta?: OfertaNeurona;
  sesiones?: Sesion[];
  reloj?: { v: number };
} = {}) {
  const reloj = extra.reloj ?? { v: 1000 };
  const servidor = crearServidor({
    manejadores: extra.manejadores ?? {},
    oferta: extra.oferta ?? oferta(),
    sesiones: extra.sesiones ?? [sesion(reloj.v)],
    ahora: () => reloj.v,
  });
  return { servidor, reloj };
}

describe("crearServidor · admisión", () => {
  it("sirve la capacidad y anota el préstamo hecho con bytes", async () => {
    const { servidor, reloj } = montar({
      manejadores: {
        imagen: async () => {
          reloj.v += 250;
          return { ok: true };
        },
      },
    });
    const respuestas = await servidor.atender(pedir("p1"));
    expect(respuestas[respuestas.length - 1]).toEqual({
      t: "capacidad.fin",
      id: "p1",
      resultado: { ok: true },
    });
    const [prestamo] = servidor.prestamos();
    expect(prestamo).toMatchObject({
      id: "p1",
      invitado: INVITADO,
      tipo: "imagen",
      estado: "hecho",
      ms: 250,
    });
    expect(prestamo.bytes).toBe(JSON.stringify({ ok: true }).length);
  });

  it("acepta un reloj fijo además de una función", async () => {
    const servidor = crearServidor({
      manejadores: { imagen: async () => 1 },
      oferta: oferta(),
      sesiones: [sesion(5000)],
      ahora: 5000,
    });
    expect((await servidor.atender(pedir("fijo")))[0]).toMatchObject({ t: "capacidad.fin" });
  });

  it("rechaza sin sesión válida, revocada, vencida o de otro anfitrión", async () => {
    const { servidor, reloj } = montar({ manejadores: { imagen: async () => 1 } });
    reloj.v = 1000 + 60_001;
    expect((await servidor.atender(pedir("a")))[0]).toMatchObject({ t: "capacidad.error", estado: 403 });
    expect((await servidor.atender(pedir("b", "imagen", "otra")))[0]).toMatchObject({ estado: 403 });

    const revocada = montar({ manejadores: { imagen: async () => 1 }, sesiones: [revocar(sesion(1000))] });
    expect((await revocada.servidor.atender(pedir("c")))[0]).toMatchObject({ estado: 403 });

    const ajena = montar({ manejadores: { imagen: async () => 1 }, sesiones: [sesion(1000, "imagen", "otro")] });
    expect((await ajena.servidor.atender(pedir("d")))[0]).toMatchObject({ estado: 403 });
  });

  it("rechaza una capacidad que la neurona no ofrece o no presta", async () => {
    expect((await montar().servidor.atender(pedir("sin-motor-registrado")))[0]).toMatchObject({
      t: "capacidad.error",
      estado: 404,
    });

    const apagada = oferta({ energia: { bateriaPct: 10, cargando: false, enUso: false } });
    const porBateria = montar({ manejadores: { imagen: async () => 1 }, oferta: apagada });
    expect((await porBateria.servidor.atender(pedir("bateria")))[0]).toMatchObject({ estado: 503 });

    const sinMotor = oferta({ computo: { ...oferta().computo, motores: ["voz"] } });
    const porMotor = montar({ manejadores: { imagen: async () => 1 }, oferta: sinMotor });
    expect((await porMotor.servidor.atender(pedir("motor")))[0]).toMatchObject({ estado: 503 });
  });

  it("rechaza un id repetido mientras está vivo", async () => {
    const puerta = aplazar();
    const { servidor } = montar({
      manejadores: { imagen: async () => { await puerta.promesa; return "ok"; } },
    });
    const primero = servidor.atender(pedir("repetido"));
    await Promise.resolve();
    expect((await servidor.atender(pedir("repetido")))[0]).toMatchObject({
      t: "capacidad.error",
      estado: 409,
    });
    puerta.liberar();
    await primero;
  });
});

describe("crearServidor · cola y cancelación", () => {
  it("encola hasta cuatro y responde 429 a la quinta espera", async () => {
    const puerta = aplazar();
    const { servidor } = montar({
      manejadores: { imagen: async () => { await puerta.promesa; return "ok"; } },
    });
    const primero = servidor.atender(pedir("1"));
    const enCola = ["2", "3", "4", "5"].map((id) => servidor.atender(pedir(id)));
    await Promise.resolve();

    expect(servidor.prestamos().filter((p) => p.estado === "en-cola")).toHaveLength(4);
    expect((await servidor.atender(pedir("6")))[0]).toMatchObject({ t: "capacidad.error", estado: 429 });
    expect(servidor.prestamos().some((p) => p.id === "6")).toBe(false);

    puerta.liberar();
    await Promise.all([primero, ...enCola]);
    expect(servidor.prestamos().filter((p) => p.estado === "hecho")).toHaveLength(5);
  });

  it("cancela el préstamo en curso y avisa con 499", async () => {
    let senal: AbortSignal | undefined;
    const puerta = aplazar();
    const { servidor } = montar({
      manejadores: {
        imagen: async (_cuerpo, opts) => {
          senal = opts.signal;
          await puerta.promesa;
          return "tarde";
        },
      },
    });
    const pendiente = servidor.atender(pedir("c1"));
    await Promise.resolve();

    const cancelar: MsgCancelar = { t: "capacidad.cancelar", id: "c1" };
    expect(await servidor.atender(cancelar)).toEqual([]);
    await expect(pendiente).resolves.toEqual([
      { t: "capacidad.error", id: "c1", estado: 499, mensaje: expect.any(String) },
    ]);
    expect(senal?.aborted).toBe(true);
    expect(servidor.prestamos()[0]).toMatchObject({ id: "c1", estado: "cancelado" });
  });

  it("cancela una petición que aún espera en cola", async () => {
    const puerta = aplazar();
    const { servidor } = montar({
      manejadores: { imagen: async () => { await puerta.promesa; return "ok"; } },
    });
    const primero = servidor.atender(pedir("activo"));
    const esperando = servidor.atender(pedir("cola-1"));
    await Promise.resolve();

    await servidor.atender({ t: "capacidad.cancelar", id: "cola-1" });
    await expect(esperando).resolves.toMatchObject([{ t: "capacidad.error", estado: 499 }]);
    expect(servidor.prestamos().find((p) => p.id === "cola-1")?.estado).toBe("cancelado");

    puerta.liberar();
    await primero;
  });
});

describe("crearServidor · respuestas", () => {
  it("trocea una respuesta que no cabe en un mensaje", async () => {
    const grande = "x".repeat(20_000);
    const { servidor } = montar({ manejadores: { imagen: async () => grande } });
    const respuestas = await servidor.atender(pedir("g"));

    expect(respuestas[respuestas.length - 1]).toMatchObject({
      t: "capacidad.fin",
      resultado: { troceado: true, trozos: 2 },
    });
    const texto = respuestas
      .filter((m): m is MsgTrozo => m.t === "capacidad.trozo")
      .map((m) => m.texto)
      .join("");
    expect(JSON.parse(texto)).toBe(grande);
  });

  it("convierte un fallo del manejador en error 502 y préstamo fallido", async () => {
    const { servidor } = montar({
      manejadores: { imagen: async () => { throw new Error("sin GPU"); } },
    });
    expect((await servidor.atender(pedir("e")))[0]).toMatchObject({
      t: "capacidad.error",
      estado: 502,
      mensaje: "sin GPU",
    });
    expect(servidor.prestamos()[0]).toMatchObject({ estado: "error", motivo: "sin GPU", bytes: 0 });
  });
});
