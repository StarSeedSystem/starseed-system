import { describe, expect, it } from "vitest";
import { crearCliente, type MensajeVentana } from "../cliente";
import {
  adjuntarAnfitrionMalla,
  crearAnfitrionMalla,
  parseMensajeAnfitrion,
  type ConfigAnfitrion,
  type DepsAnfitrionMalla,
  type MensajeServidorVentana,
} from "../anfitrion-malla";
import type { MeshHandle } from "@/lib/network/webrtc-mesh";
import type { OrdenVentana, PistaAnfitriona } from "../anfitrion";

const INICIO = 1_000;
const CUENTA = "cuenta-1";

function montar(extra: Partial<DepsAnfitrionMalla> = {}) {
  let ahora = INICIO;
  let cuentaDe: (de: string) => string | null = (de) => (de === "cliente" ? CUENTA : "otra");
  const ordenes: OrdenVentana[] = [];
  const pistas: (PistaAnfitriona & { parada: boolean })[] = [];
  let abierta: { de: string; app: string } | null = null;
  const abrir = async (pedido: { de: string; app: string }): Promise<ConfigAnfitrion | null> => {
    abierta = pedido;
    return {
      ventana: "v1",
      capturar: (orden) => {
        ordenes.push(orden);
        return orden.comando === "capturar_ventana" ? { ancho: 1280, alto: 720, datos: "falso" } : { aceptada: true };
      },
      crearPista: () => {
        const pista = { parada: false, stop() { pista.parada = true; } };
        pistas.push(pista);
        return pista;
      },
      sesionNativa: () => true,
      duracionMs: 60_000,
    };
  };
  const alCliente: MensajeServidorVentana[] = [];
  let enVuelo: Promise<boolean> | null = null;
  const deps: DepsAnfitrionMalla = {
    cuentaActual: () => CUENTA,
    cuentaDe: (de) => cuentaDe(de),
    abrir,
    enviar: (_de, m) => { alCliente.push(m); },
    fps: 30, anchoMax: 1280, anchoBanda: () => Number.POSITIVE_INFINITY,
    reloj: () => ahora,
    ...extra,
  };
  const servidor = crearAnfitrionMalla(deps);
  // El cliente que YA existe (cliente.ts) envía sus entradas por el canal en memoria.
  const cliente = crearCliente({
    sesionId: "s1",
    enviar: (m: MensajeVentana) => { enVuelo = servidor.atender("cliente", m); },
  });
  return {
    servidor, cliente, ordenes, pistas, alCliente,
    abierta: () => abierta,
    esperar: async (): Promise<boolean> => { const p = enVuelo; enVuelo = null; return p ? await p : false; },
    avanzar: (ms: number) => { ahora += ms; },
    denegarVecinos: () => { cuentaDe = () => null; },
  };
}

const PEDIR = { t: "ventana.pedir", sesion: "s1", app: "editor" };

describe("crearAnfitrionMalla", () => {
  it("sin petición no hace nada: tic parado y las entradas no llegan a ninguna ventana", async () => {
    const m = montar();
    expect(await m.servidor.tic(INICIO)).toBe(false);
    expect(m.cliente.entrar({ tipo: "raton", accion: "pulsar", x: 20, y: 30, boton: 0 }, { left: 0, top: 0, width: 640, height: 360 }, { ancho: 1280, alto: 720 }, INICIO)).toBe(true);
    expect(await m.esperar()).toBe(false);
    expect(m.alCliente).toHaveLength(0);
    expect(m.abierta()).toBeNull();
    expect(m.servidor.estado()).toEqual({ activo: false, de: null, sesion: null, app: null, cuadros: 0 });
  });

  it("deniega a una neurona que no es de la misma cuenta", async () => {
    const m = montar();
    expect(await m.servidor.atender("ajena", { t: "ventana.pedir", sesion: "s2", app: "editor" })).toBe(true);
    expect(m.alCliente[0]).toMatchObject({ t: "ventana.denegado", sesion: "s2" });
    expect(m.abierta()).toBeNull();
  });

  it("pedir → aceptada → captura cuadros para el cliente", async () => {
    const m = montar();
    expect(await m.servidor.atender("cliente", PEDIR)).toBe(true);
    expect(m.abierta()).toEqual({ de: "cliente", app: "editor" });
    expect(m.alCliente[0]).toEqual({ t: "ventana.aceptada", sesion: "s1", app: "editor" });
    expect(await m.servidor.tic(INICIO)).toBe(true);
    expect(m.ordenes[0]).toEqual({ comando: "capturar_ventana", ventana: "v1", ancho: 1280, alto: 720, fps: 30 });
    expect(m.alCliente[1]).toMatchObject({ t: "ventana.cuadro", sesion: "s1", fotograma: { ancho: 1280, alto: 720 } });
    expect(await m.servidor.tic(INICIO + 10)).toBe(true);
    expect(m.alCliente.filter((x) => x.t === "ventana.cuadro")).toHaveLength(2);
    expect(m.servidor.estado()).toEqual({ activo: true, de: "cliente", sesion: "s1", app: "editor", cuadros: 2 });
  });

  it("las entradas del cliente que ya existe vuelven a la ventana prestada", async () => {
    const m = montar();
    await m.servidor.atender("cliente", PEDIR);
    m.cliente.entrar({ tipo: "raton", accion: "pulsar", x: 20, y: 30, boton: 0 }, { left: 0, top: 0, width: 640, height: 360 }, { ancho: 1280, alto: 720 }, INICIO);
    expect(await m.esperar()).toBe(true);
    expect(m.ordenes.at(-1)).toEqual({ comando: "entrada_ventana", ventana: "v1", entrada: { tipo: "raton", accion: "pulsar", x: 40, y: 60, boton: 0 } });
  });

  it("cortar cierra, para la pista y deja de aceptar entradas", async () => {
    const m = montar();
    await m.servidor.atender("cliente", PEDIR);
    expect(await m.servidor.atender("cliente", { t: "ventana.cortar", sesion: "s1" })).toBe(true);
    expect(m.alCliente.at(-1)).toMatchObject({ t: "ventana.cerrada", sesion: "s1" });
    expect(m.pistas[0].parada).toBe(true);
    expect(m.servidor.estado().activo).toBe(false);
    expect(await m.servidor.tic(INICIO + 1)).toBe(false);
  });

  it("una segunda petición mientras transmite se deniega", async () => {
    const m = montar();
    await m.servidor.atender("cliente", PEDIR);
    expect(await m.servidor.atender("cliente", { t: "ventana.pedir", sesion: "s2", app: "otra" })).toBe(true);
    expect(m.alCliente.at(-1)).toMatchObject({ t: "ventana.denegado", sesion: "s2" });
    expect(m.servidor.estado().sesion).toBe("s1");
  });

  it("cuando la sesión vence se cierra sola y avisa al cliente", async () => {
    const m = montar();
    await m.servidor.atender("cliente", PEDIR);
    m.avanzar(60_001);
    expect(await m.servidor.tic(INICIO + 60_001)).toBe(false);
    expect(m.alCliente.at(-1)).toMatchObject({ t: "ventana.cerrada", sesion: "s1" });
    expect(m.pistas[0].parada).toBe(true);
  });

  it("si la persona no presta la sesión se deniega sin abrir nada", async () => {
    const m = montar({ abrir: async () => null });
    expect(await m.servidor.atender("cliente", PEDIR)).toBe(true);
    expect(m.alCliente[0]).toMatchObject({ t: "ventana.denegado", sesion: "s1" });
  });
});

describe("parseMensajeAnfitrion", () => {
  it("lee JSON del canal y rechaza lo que no es ventana.*", () => {
    expect(parseMensajeAnfitrion('{"t":"ventana.pedir","sesion":"s1","app":"editor"}')).toEqual(PEDIR);
    expect(parseMensajeAnfitrion('{"t":"otro"}')).toBeNull();
    expect(parseMensajeAnfitrion('{"t":"ventana.pedir","sesion":"","app":"editor"}')).toBeNull();
    expect(parseMensajeAnfitrion("no es json")).toBeNull();
    expect(parseMensajeAnfitrion(null)).toBeNull();
  });
});

describe("adjuntarAnfitrionMalla", () => {
  function mallaDeMentira(enviados: { id: string; m: unknown }[]): { mesh: MeshHandle; onMessage: (de: string, data: string) => void; onState: (s: { deviceId: string; state: string }) => void } {
    let eventos: Parameters<MeshHandle["onPeer"]>[0] | null = null;
    const mesh = {
      userId: CUENTA,
      onPeer: (ev: Parameters<MeshHandle["onPeer"]>[0]) => { eventos = ev; return () => {}; },
      sendToPeer: (id: string, data: string) => { enviados.push({ id, m: JSON.parse(data) as unknown }); return true; },
    } as unknown as MeshHandle;
    return {
      mesh,
      onMessage: (de, data) => { eventos?.onMessage?.(de, data); },
      onState: (s) => { eventos?.onState?.(s as never); },
    };
  }

  it("por el mesh: pedir, cuadros solo al que pidió y cerrar al perder al peer", async () => {
    const enviados: { id: string; m: unknown }[] = [];
    const { mesh, onMessage, onState } = mallaDeMentira(enviados);
    const atado = adjuntarAnfitrionMalla(mesh, {
      cuentaActual: () => CUENTA,
      cuentaDe: (de) => (de === "cliente" ? CUENTA : null),
      abrir: async () => ({ capturar: () => ({ ancho: 640, alto: 360, datos: "falso" }), crearPista: () => ({ stop() {} }), sesionNativa: () => true }),
      fps: 30, anchoMax: 1280, reloj: () => INICIO,
    });
    onMessage("cliente", JSON.stringify(PEDIR));
    await new Promise<void>((r) => { setTimeout(r, 0); });
    expect(enviados[0]).toEqual({ id: "cliente", m: { t: "ventana.aceptada", sesion: "s1", app: "editor" } });
    await atado.servidor.tic(INICIO);
    expect(enviados.filter((e) => e.id === "cliente" && (e.m as { t: string }).t === "ventana.cuadro")).toHaveLength(1);
    onState({ deviceId: "cliente", state: "disconnected" });
    expect(enviados.at(-1)).toEqual({ id: "cliente", m: { t: "ventana.cerrada", sesion: "s1", motivo: "Se perdió la neurona que usaba la ventana." } });
    expect(atado.servidor.estado().activo).toBe(false);
  });
});
