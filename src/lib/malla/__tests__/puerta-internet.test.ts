/**
 * Puerta de internet por la malla (MPT1108A, primera rebanada): proxy GET cifrado de punta a punta, opt-in, topes,
 * anti-SSRF y anuncio en el registro de conectores.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  anuncioDePuertaLocal,
  crearPuertaInternet,
  hostInterno,
  pedirPorPuerta,
  registrarConectorPuerta,
  urlDePuerta,
  type EstadoPuerta,
} from "@/lib/malla/puerta-internet";
import { abrirSobreCon } from "@/lib/malla/cifrado-archivo";
import { encryptEnvelopeFor } from "@/ai/astraura/mesh/recipient-crypto";
import { __vaciarConectores, conectoresRegistrados } from "@/lib/malla/conectores/registro";
import { identidadEcdh } from "./ayudas-cifrado";

afterEach(() => __vaciarConectores());

const respuesta = (cuerpo: string, extra: ResponseInit = {}) => new Response(cuerpo, { status: 200, headers: { "content-type": "application/json" }, ...extra });

async function montar(opts: { estado?: Partial<EstadoPuerta>; fetchFn?: (u: string) => Promise<Response>; topes?: Record<string, number> } = {}) {
  const puerta = await identidadEcdh();
  const cliente = await identidadEcdh();
  const vistos: string[] = [];
  const llamadas: string[] = [];
  const estado: EstadoPuerta = { activa: true, bateria: 0.9, cargando: false, conInternet: true, ...opts.estado };
  const servidor = crearPuertaInternet({
    abrir: abrirSobreCon(puerta.priv),
    hostsPermitidos: ["updates.starseed.red", "*.capas.starseed.red"],
    estado: () => estado,
    topes: opts.topes,
    fetchFn: async (u) => {
      llamadas.push(u);
      return (opts.fetchFn ?? (async () => respuesta('{"version":"1.2.3"}')))(u);
    },
  });
  const pedir = (url: string) =>
    pedirPorPuerta(url, {
      puertas: [{ id: "neurona-puerta", pub: puerta.pub }],
      miPub: async () => cliente.pub,
      abrir: abrirSobreCon(cliente.priv),
      transporte: async (_p, sobre) => {
        vistos.push(JSON.stringify(sobre)); // lo que ve el relé / otras neuronas
        return servidor.atender(sobre);
      },
    });
  return { servidor, pedir, vistos, llamadas, estado };
}

describe("puerta de internet", () => {
  it("sirve un GET https permitido; los intermedios solo ven texto cifrado", async () => {
    const m = await montar();
    const r = await m.pedir("https://updates.starseed.red/manifiesto.json");
    expect(r.ok).toBe(true);
    expect(new TextDecoder().decode(r.cuerpo)).toBe('{"version":"1.2.3"}');
    expect(r.estado).toBe(200);
    expect(r.puerta).toBe("neurona-puerta");
    expect(m.llamadas).toEqual(["https://updates.starseed.red/manifiesto.json"]);
    expect(m.vistos[0]).not.toContain("manifiesto.json");
    expect(m.vistos[0]).not.toContain("starseed.red");
    expect(m.servidor.servidoHoy()).toBe(19);
    expect((await m.pedir("https://x.capas.starseed.red/capa.bin")).ok).toBe(true);
  });

  it("opt-in, sin internet, batería baja (salvo cargando), cuota diaria y tamaño", async () => {
    expect((await (await montar({ estado: { activa: false } })).pedir("https://updates.starseed.red/a")).motivo).toBe("apagada");
    expect((await (await montar({ estado: { conInternet: false } })).pedir("https://updates.starseed.red/a")).motivo).toBe("sin-internet");
    expect((await (await montar({ estado: { bateria: 0.1 } })).pedir("https://updates.starseed.red/a")).motivo).toBe("bateria");
    expect((await (await montar({ estado: { bateria: 0.1, cargando: true } })).pedir("https://updates.starseed.red/a")).ok).toBe(true);
    const grande = await montar({ topes: { maxBytesRespuesta: 10 }, fetchFn: async () => respuesta("x".repeat(50)) });
    expect((await grande.pedir("https://updates.starseed.red/a")).motivo).toBe("tamano");
    const cuota = await montar({ topes: { cuotaBytesDia: 30 }, fetchFn: async () => respuesta("y".repeat(20)) });
    expect((await cuota.pedir("https://updates.starseed.red/a")).ok).toBe(true);
    expect((await cuota.pedir("https://updates.starseed.red/b")).motivo).toBe("cuota");
  });

  it("solo https a hosts de la lista; nunca direcciones internas; nada de credenciales ni puertos raros", async () => {
    const m = await montar();
    for (const u of ["http://updates.starseed.red/a", "https://otro.com/a", "https://localhost/a", "https://192.168.1.5/a", "https://[::1]/a", "https://u:p@updates.starseed.red/a", "https://updates.starseed.red:8443/a", "ftp://x"]) {
      const r = await m.pedir(u);
      expect(r.ok, u).toBe(false);
    }
    expect(m.llamadas).toEqual([]);
    expect(hostInterno("10.0.0.1")).toBe(true);
    expect(hostInterno("172.20.1.1")).toBe(true);
    expect(hostInterno("169.254.1.1")).toBe(true);
    expect(hostInterno("8.8.8.8")).toBe(false);
    expect(hostInterno("impresora.local")).toBe(true);
    expect("url" in urlDePuerta("https://updates.starseed.red/a?b=1", ["updates.starseed.red"])).toBe(true);
    expect("url" in urlDePuerta("https://starseed.red/a", ["*.starseed.red"])).toBe(false);
  });

  it("un sobre que no es para la puerta se ignora; un fallo de red se informa; la respuesta es para quien pidió", async () => {
    const m = await montar({ fetchFn: async () => Promise.reject(new Error("caída")) });
    expect((await m.pedir("https://updates.starseed.red/a")).motivo).toBe("red");
    const otra = await identidadEcdh();
    const ajeno = (await encryptEnvelopeFor(otra.pub, { t: "puerta.get", v: 1, id: "x", url: "https://updates.starseed.red/a", respuestaPub: otra.pub }))!;
    expect(await m.servidor.atender(ajeno)).toBeNull();
  });

  it("se anuncia en el registro de conectores sin aportar enlaces de datos", async () => {
    const m = await montar();
    const baja = registrarConectorPuerta(m.servidor);
    const c = conectoresRegistrados().find((x) => x.id === "puerta-internet")!;
    expect(c.tipo).toBe("puerta-internet");
    expect(await c.descubrir()).toEqual([]);
    expect(c.ficha().cifrado).toBe("cifrado");
    const an = anuncioDePuertaLocal(conectoresRegistrados())!;
    expect(an.capacidad).toBe("puerta.http.v1");
    expect(an.activa).toBe(true);
    expect(an.hosts).toContain("updates.starseed.red");
    baja();
    expect(conectoresRegistrados().some((x) => x.id === "puerta-internet")).toBe(false);
  });
});
