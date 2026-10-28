/**
 * Pruebas de servir-capacidades-malla (Ola 1017A · F): el anfitrión conectado a
 * la malla admite por sesión y topes, contesta por el mismo par, cancela si el
 * par se pierde y respeta el cupo de la oferta. Sin red: mesh de mentira (mismo
 * patrón que las pruebas de ia-por-malla.ts), reloj y manejadores de mentira.
 */
import { describe, it, expect } from "vitest";
import {
  adjuntarServidorCapacidadesMalla,
  servidorCapacidadesMalla,
  type DepsServirCapacidadesMalla,
} from "../servir-capacidades-malla";
import type { MeshHandle, PeerEvents, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import type { Msg, MsgError, MsgFin } from "@/lib/network/capacidad-por-malla";
import { crearSesion } from "../sesion-prestamo";
import type { OfertaNeurona } from "../oferta";

const BASE = 1_000;
const espera = () => new Promise<void>((res) => { setTimeout(res, 0); });

const ofertaConCupo = (nucleos: number): OfertaNeurona => ({
  nodoId: "nodo-1", cuentaId: "c-1", medio: "mac", t: BASE,
  computo: { nucleos, ramLibreMb: 8_000, gpu: false, motores: ["buscar"] },
  almacen: { prestaMb: 0, volumenes: [] },
  apps: [], enlaces: {}, energia: { enUso: false },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 4_000, discoMb: 0, soloCargando: false } },
});

const sesionDeBuscar = () =>
  crearSesion(
    { anfitrion: "nodo-1", invitado: "par-1", alcance: { tipo: "capacidad", id: "buscar" }, duracionMs: 60_000, ahora: BASE },
    () => "s1",
  );

const deps = (ext: Partial<DepsServirCapacidadesMalla> = {}): DepsServirCapacidadesMalla => ({
  manejadores: { buscar: async () => "hola" },
  oferta: () => ofertaConCupo(2),
  sesiones: () => [sesionDeBuscar()],
  ahora: () => BASE,
  ...ext,
});

const pedirBuscar = (id: string): string =>
  JSON.stringify({ t: "capacidad.pedir", id, tipo: "buscar", cuerpo: {}, sesionId: "s1" });

const esFin = (m: Msg): m is MsgFin => m.t === "capacidad.fin";
const esError = (m: Msg): m is MsgError => m.t === "capacidad.error";

class MeshDeMentira implements MeshHandle {
  readonly myDeviceId = "yo";
  readonly userId = "cuenta-1";
  readonly supported = true;
  readonly signalingTransport = "realtime" as const;
  enviados: Array<{ a: string; salida: Msg }> = [];
  private oyentes = new Set<PeerEvents>();
  async connectToDevice(targetDeviceId: string): Promise<PeerSnapshot> {
    return { deviceId: targetDeviceId, state: "connected", channelOpen: true, lastUpdate: BASE };
  }
  onPeer(events: PeerEvents): () => void {
    this.oyentes.add(events);
    return () => this.oyentes.delete(events);
  }
  sendToPeer(deviceId: string, data: string): boolean {
    this.enviados.push({ a: deviceId, salida: JSON.parse(data) as Msg });
    return true;
  }
  broadcast(): number { return 0; }
  getPeers(): PeerSnapshot[] { return []; }
  closeMesh(): void { /* noop */ }
  llega(de: string, data: string): void { for (const o of [...this.oyentes]) o.onMessage?.(de, data); }
  estado(de: string, state: PeerSnapshot["state"]): void {
    for (const o of [...this.oyentes]) o.onState?.({ deviceId: de, state, channelOpen: false, lastUpdate: BASE });
  }
}

describe("adjuntarServidorCapacidadesMalla (el anfitrión por la malla)", () => {
  it("atiende un capacidad.pedir del par y le contesta el fin por el mismo par", async () => {
    const mesh = new MeshDeMentira();
    const parar = adjuntarServidorCapacidadesMalla(mesh, deps());
    mesh.llega("par-1", pedirBuscar("p1"));
    await espera();
    expect(mesh.enviados.map((e) => e.salida)).toEqual([
      { t: "capacidad.fin", id: "p1", resultado: "hola" } satisfies MsgFin,
    ]);
    parar();
  });

  it("rechaza con 403 lo que llega sin sesión de préstamo", async () => {
    const mesh = new MeshDeMentira();
    const parar = adjuntarServidorCapacidadesMalla(mesh, deps({ sesiones: () => [] }));
    mesh.llega("par-1", pedirBuscar("p2"));
    await espera();
    expect(mesh.enviados.length).toBe(1);
    const salida = mesh.enviados[0]?.salida;
    expect(salida && esError(salida) && salida.estado).toBe(403);
    parar();
  });

  it("rechaza con 429 cuando los topes de la oferta no dejan cupo", async () => {
    const mesh = new MeshDeMentira();
    const parar = adjuntarServidorCapacidadesMalla(mesh, deps({ oferta: () => ofertaConCupo(0) }));
    mesh.llega("par-1", pedirBuscar("p3"));
    await espera();
    const salida = mesh.enviados[0]?.salida;
    expect(salida && esError(salida) && salida.estado).toBe(429);
    parar();
  });

  it("si el par se pierde, cancela sus préstamos: al volver el manejador queda «cancelado»", async () => {
    const mesh = new MeshDeMentira();
    const suelto: { resuelve: (v: unknown) => void } = { resuelve: () => undefined };
    const manejadorTardío = () => new Promise((res) => { suelto.resuelve = res; });
    const servidor = servidorCapacidadesMalla(deps({ manejadores: { buscar: manejadorTardío } }));
    adjuntarServidorCapacidadesMalla(mesh, deps({ manejadores: { buscar: manejadorTardío } }), servidor);
    mesh.llega("par-1", pedirBuscar("p4"));
    await espera();
    expect(servidor.prestamos()[0]?.estado).toBe("vivo");
    mesh.estado("par-1", "closed");
    suelto.resuelve("tarde");
    await espera();
    const prestamo = servidor.prestamos()[0];
    expect(prestamo?.estado).toBe("cancelado");
    expect(prestamo?.motivo).toContain("Cancelado");
  });

  it("deja pasar un capacidad.cancelar: cierra al volver el manejador y no contesta nada", async () => {
    const mesh = new MeshDeMentira();
    const suelto: { resuelve: (v: unknown) => void } = { resuelve: () => undefined };
    const manejadorTardío = () => new Promise((res) => { suelto.resuelve = res; });
    const servidor = servidorCapacidadesMalla(deps({ manejadores: { buscar: manejadorTardío } }));
    adjuntarServidorCapacidadesMalla(mesh, deps({ manejadores: { buscar: manejadorTardío } }), servidor);
    mesh.llega("par-1", pedirBuscar("p5"));
    await espera();
    mesh.llega("par-1", JSON.stringify({ t: "capacidad.cancelar", id: "p5" }));
    suelto.resuelve("tarde");
    await espera();
    expect(servidor.prestamos()[0]?.estado).toBe("cancelado");
    expect(mesh.enviados).toEqual([]); // a quien canceló no se le contesta
  });
});
