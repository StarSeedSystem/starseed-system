/**
 * Capas en la puerta (PTA1108C): selección de puerta por capa, política aplicada de verdad en el túnel y la concesión
 * que llega a `abrirTcp`. Red en memoria como en `tunel.test.ts`.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { CapaPuerta, Concesion } from "@/lib/malla/puerta/capas";
import { capasAnunciables } from "@/lib/malla/puerta/capas";
import { AJUSTES_PUERTA_POR_DEFECTO, type AjustesPuerta, type EstadoPropio } from "@/lib/malla/puerta/politica";
import { TablaPuertas, crearAnuncioPropio } from "@/lib/malla/puerta/tabla";
import { crearGestorPuerta, type GestorPuerta, type MetaVecino, type SocketSalida, type Trama, type TransportePuerta } from "@/lib/malla/puerta/tunel";

const SRV: CapaPuerta = { id: "srv:192.168.1.50:8443", tipo: "servidor-propio", etiqueta: "NAS", hosts: ["192.168.1.50"], cidrs: ["192.168.1.50/32"], puertos: [8443] };
const LAN: CapaPuerta = { id: "lan", tipo: "lan", etiqueta: "Red local", hosts: [], cidrs: ["192.168.1.0/24"], puertos: [] };
const CON: EstadoPropio = { conInternet: true, bateria: 0.9, cargando: false, medida: false };
const SIN: EstadoPropio = { conInternet: false, bateria: 0.9, cargando: false, medida: false };

class Sock implements SocketSalida {
  cerrado = false;
  constructor(public host: string, public port: number, public concedido: Concesion | null | undefined) {}
  async escribir(): Promise<void> {}
  alDatos(): void {}
  alCerrar(): void {}
  cerrar(): void {
    this.cerrado = true;
  }
}

interface Nodo {
  id: string;
  gestor: GestorPuerta;
  tabla: TablaPuertas;
  aj: AjustesPuerta;
  sockets: Sock[];
}

function red() {
  const nodos = new Map<string, Nodo>();
  const oyentes = new Map<string, (v: string, t: Trama, m: MetaVecino) => void>();
  const enlaces = new Set<string>();
  const cuenta = new Map<string, string>();
  const k = (a: string, b: string): string => [a, b].sort().join("|");
  return {
    nodos,
    enlazar: (a: string, b: string) => {
      enlaces.add(k(a, b));
      setTimeout(() => nodos.forEach((n) => n.gestor.anunciar()), 0); // los anuncios salen al haber enlace
    },
    cuenta: (id: string, c: string) => cuenta.set(id, c),
    nodo(id: string, o: { tcp?: boolean; est?: EstadoPropio; aj?: Partial<AjustesPuerta>; capas?: CapaPuerta[]; capasVisibles?: CapaPuerta[] } = {}): Nodo {
      const tabla = new TablaPuertas(() => Date.now(), id);
      const n = { id, tabla, aj: { ...AJUSTES_PUERTA_POR_DEFECTO, ...(o.aj ?? {}) }, sockets: [] } as unknown as Nodo;
      const est = o.est ?? SIN;
      cuenta.set(id, cuenta.get(id) ?? "yo");
      const t: TransportePuerta = {
        yo: () => id,
        vecinos: () => [...nodos.keys()].filter((x) => x !== id && enlaces.has(k(id, x))),
        tamTrozo: () => 1024,
        async enviar(v, tr) {
          if (!enlaces.has(k(id, v))) return false;
          queueMicrotask(() => oyentes.get(v)?.(id, JSON.parse(JSON.stringify(tr)) as Trama, { mismaCuenta: cuenta.get(id) === cuenta.get(v), tipoEnlace: "local", etiqueta: "local" }));
          return true;
        },
        alRecibir(cb) {
          oyentes.set(id, cb);
          return () => oyentes.delete(id);
        },
      };
      const capas = o.capas ?? [];
      n.gestor = crearGestorPuerta({
        transporte: t,
        tabla,
        ajustes: () => n.aj,
        cambiarAjustes: (f) => {
          n.aj = f(n.aj);
        },
        estado: () => est,
        miCuenta: () => cuenta.get(id) ?? null, // PTA1110B
        // Se anuncia solo lo que el dueño comparte, como hace el servicio real.
        anuncioPropio: () => {
          const detalle = capasAnunciables(n.aj, capas);
          return crearAnuncioPropio({ id, uid: cuenta.get(id), capas: est.conInternet ? ["internet"] : [], detalle, latenciaMs: 20, estado: est, ahora: Date.now() });
        },
        capasPropias: () => capas,
        abrirTcp: o.tcp
          ? async (host, port, op) => {
              const s = new Sock(host, port, op.concedido);
              n.sockets.push(s);
              return s;
            }
          : undefined,
        preguntar: async () => "denegar",
        plazoAperturaMs: 400,
        plazoPreguntaMs: 800,
        plazoAckMs: 1500,
      });
      nodos.set(id, n);
      n.gestor.iniciar();
      return n;
    },
  };
}

const pausa = (ms = 15): Promise<void> => new Promise((r) => setTimeout(r, ms));
const vivos: GestorPuerta[] = [];
afterEach(() => {
  for (const g of vivos.splice(0)) g.detener();
});
const listo = <T extends Nodo>(n: T): T => {
  vivos.push(n.gestor);
  return n;
};

describe("selección de gateway por capa en el túnel", () => {
  it("un servidor propio se pide a la neurona que lo alcanza, aunque otra vecina tenga internet y mejor puntuación", async () => {
    const r = red();
    const tablet = listo(r.nodo("tablet"));
    const g1 = listo(r.nodo("g1", { tcp: true, est: CON })); // internet, sin capas
    const g2 = listo(r.nodo("g2", { tcp: true, est: CON, capas: [SRV] }));
    r.enlazar("tablet", "g1");
    r.enlazar("tablet", "g2");
    await pausa(60);
    const t = await tablet.gestor.abrirTunel("192.168.1.50", 8443);
    expect("error" in t).toBe(false);
    expect(g2.sockets.length).toBe(1);
    expect(g1.sockets.length).toBe(0);
    expect(g2.sockets[0]).toMatchObject({ host: "192.168.1.50", port: 8443, concedido: { cidrs: ["192.168.1.50/32"], puertos: [8443], hosts: [], subredes: false } });
    // Y lo público sigue saliendo por la mejor puerta de internet.
    const p = await tablet.gestor.abrirTunel("example.com", 443);
    expect("error" in p).toBe(false);
    expect(g1.sockets.length + g2.sockets.length).toBe(2);
    expect(g2.sockets[1]?.concedido ?? null).toBeNull(); // público: Node no recibe ninguna concesión privada
  });

  it("una neurona SIN internet pero con la capa también sirve de puerta", async () => {
    const r = red();
    const tablet = listo(r.nodo("tablet"));
    const casa = listo(r.nodo("casa", { tcp: true, est: SIN, capas: [SRV] }));
    r.enlazar("tablet", "casa");
    await pausa(60);
    const t = await tablet.gestor.abrirTunel("192.168.1.50", 8443);
    expect("error" in t).toBe(false);
    expect(casa.sockets.length).toBe(1);
    // Pero a internet no: no tiene.
    const p = await tablet.gestor.abrirTunel("example.com", 443);
    expect(p).toEqual({ error: "sin-puertas" });
  });

  it("sin ninguna puerta con la capa: sin-puertas (no se prueba por internet)", async () => {
    const r = red();
    const tablet = listo(r.nodo("tablet"));
    listo(r.nodo("g1", { tcp: true, est: CON }));
    r.enlazar("tablet", "g1");
    await pausa(60);
    expect(await tablet.gestor.abrirTunel("192.168.1.50", 8443)).toEqual({ error: "sin-capa" });
  });

  it("un relé sin la capa pasa la petición a la puerta que la tiene", async () => {
    const r = red();
    const tablet = listo(r.nodo("tablet"));
    const rele = listo(r.nodo("rele", { est: SIN }));
    const casa = listo(r.nodo("casa", { tcp: true, est: CON, capas: [SRV] }));
    r.enlazar("tablet", "rele");
    r.enlazar("rele", "casa");
    await pausa(120);
    expect(tablet.tabla.capaParaDestino("192.168.1.50", 8443)?.puerta).toBe("casa");
    const t = await tablet.gestor.abrirTunel("192.168.1.50", 8443);
    expect("error" in t).toBe(false);
    expect(casa.sockets.length).toBe(1);
  });
});

describe("política aplicada en la puerta", () => {
  it("la LAN apagada por defecto: ni se anuncia ni se sirve; encendida, sí (solo mi cuenta)", async () => {
    const r = red();
    const tablet = listo(r.nodo("tablet"));
    const casa = listo(r.nodo("casa", { tcp: true, est: CON, capas: [LAN] }));
    r.enlazar("tablet", "casa");
    await pausa(60);
    expect(tablet.tabla.capaParaDestino("192.168.1.77", 443)).toBeNull();
    expect(await tablet.gestor.abrirTunel("192.168.1.77", 443)).toEqual({ error: "sin-capa" });
    casa.aj = { ...casa.aj, compartirRedLocal: true };
    casa.gestor.anunciar();
    await pausa(60);
    const t = await tablet.gestor.abrirTunel("192.168.1.77", 443);
    expect("error" in t).toBe(false);
    expect(casa.sockets[0].concedido).toMatchObject({ cidrs: ["192.168.1.77/32"], puertos: [443], subredes: true });
  });

  it("aunque un vecino fuerce la petición (sin anuncio), la puerta rechaza lo que no concede", async () => {
    const r = red();
    const tablet = listo(r.nodo("tablet"));
    const casa = listo(r.nodo("casa", { tcp: true, est: CON, capas: [SRV, LAN] }));
    r.enlazar("tablet", "casa");
    await pausa(60);
    // La tabla de la tablet no filtra a mano: se le fuerza una entrada con detalle falso para saltarse la selección.
    const falso = crearAnuncioPropio({ id: "casa", capas: ["internet"], detalle: [{ ...LAN, cidrs: ["192.168.1.0/24"] }], latenciaMs: 1, estado: CON, ahora: Date.now() });
    tablet.tabla.anotar(falso as NonNullable<typeof falso>, "casa", { tipoEnlace: "local", etiqueta: "x" });
    const t = await tablet.gestor.abrirTunel("192.168.1.77", 443); // LAN no concedida en `casa`
    expect(t).toEqual({ error: "capa-no-concedida" });
    expect(casa.sockets.length).toBe(0);
    // Un puerto que la capa no declara
    expect(await tablet.gestor.abrirTunel("192.168.1.50", 22)).toMatchObject({ error: expect.any(String) });
    expect(casa.sockets.length).toBe(0);
    // Un destino privado que ninguna capa cubre
    expect((await tablet.gestor.abrirTunel("10.9.9.9", 443)) as { error: string }).toHaveProperty("error");
    expect(casa.sockets.length).toBe(0);
  });

  it("otra cuenta nunca llega a mis servidores sin permiso explícito; con él, sí", async () => {
    const r = red();
    r.cuenta("ajena", "otra");
    const ajena = listo(r.nodo("ajena"));
    const casa = listo(r.nodo("casa", { tcp: true, est: CON, capas: [SRV] }));
    r.enlazar("ajena", "casa");
    await pausa(60);
    // Anunciar al público no es conceder: el anuncio solo sale si el dueño comparte algo, pero la puerta decide al abrir.
    const falso = crearAnuncioPropio({ id: "casa", capas: ["internet"], detalle: [SRV], latenciaMs: 1, estado: CON, ahora: Date.now() });
    ajena.tabla.anotar(falso as NonNullable<typeof falso>, "casa", { tipoEnlace: "local", etiqueta: "x" });
    expect(await ajena.gestor.abrirTunel("192.168.1.50", 8443)).toEqual({ error: "capa-no-concedida" });
    expect(casa.sockets.length).toBe(0);
    casa.aj = { ...casa.aj, capasPorNeurona: { ajena: ["servidor-propio"] }, otrasCuentas: "automatico" };
    ajena.tabla.marcarAcierto("casa"); // el rechazo anterior vetó la puerta unos segundos
    const t = await ajena.gestor.abrirTunel("192.168.1.50", 8443);
    expect(t).not.toHaveProperty("error");
    expect(casa.sockets.length).toBe(1);
  });

  it("el viejo interruptor permitirRedPrivada ya no abre nada", async () => {
    const r = red();
    const tablet = listo(r.nodo("tablet"));
    const casa = listo(r.nodo("casa", { tcp: true, est: CON, aj: { permitirRedPrivada: true } }));
    r.enlazar("tablet", "casa");
    await pausa(60);
    const falso = crearAnuncioPropio({ id: "casa", capas: ["internet"], detalle: [LAN], latenciaMs: 1, estado: CON, ahora: Date.now() });
    tablet.tabla.anotar(falso as NonNullable<typeof falso>, "casa", { tipoEnlace: "local", etiqueta: "x" });
    expect(await tablet.gestor.abrirTunel("192.168.1.77", 443)).toMatchObject({ error: "destino-interno" });
    expect(casa.sockets.length).toBe(0);
  });
});
