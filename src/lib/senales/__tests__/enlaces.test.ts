import { describe, expect, it } from "vitest";
import type { RutaEnlace } from "@/lib/network/estadisticas-enlace";
import { ESTILO_ENLACE, ETIQUETA_CLASE, clasificarEnlace, enlaceDeSenal, valorEnlace, type ContextoEnlace } from "../enlaces";
import type { ClaseEnlace, VivoMapa } from "../tipos-vivo";
import { AHORA, aparato, enlaceLocal, fila, medioPresencia, senal } from "../__fixtures__/vivo";

const ruta = (clase: RutaEnlace["clase"], rttMs: number | null = 7): RutaEnlace => ({
  clase, tipoLocal: "host", tipoRemoto: "srflx", protocolo: "udp", rttMs, bytesEnviados: 2048, bytesRecibidos: 4096, medidoEn: AHORA,
});
const ctx: ContextoEnlace = { medios: [], faroEnRele: false, ahora: AHORA };

describe("cómo llega un aparato hasta ti (clasificarEnlace)", () => {
  it("P2P en la misma red local, con la latencia del canal", () => {
    const e = clasificarEnlace(fila("a", { enlace: { estado: "conectado", latenciaMs: 12, ruta: ruta("misma-red-local") } }), ctx);
    expect(e).toMatchObject({ clase: "p2p-red-local", latenciaMs: 12, etiqueta: ETIQUETA_CLASE["p2p-red-local"] });
    expect(e.ruta?.clase).toBe("misma-red-local");
  });

  it("P2P por internet atravesando NAT", () => {
    expect(clasificarEnlace(fila("a", { enlace: { estado: "conectado", ruta: ruta("internet-directo", 40) } }), ctx)).toMatchObject({ clase: "p2p-internet", latenciaMs: 40 });
  });

  it("P2P reenviado por TURN", () => {
    expect(clasificarEnlace(fila("a", { enlace: { estado: "conectado", latenciaMs: 90, ruta: ruta("reenviado-turn") } }), ctx).clase).toBe("p2p-turn");
  });

  it("canal conectado con la ruta aún sin medir: P2P genérico, y sin latencia se dice null (no se inventa)", () => {
    expect(clasificarEnlace(fila("a", { enlace: { estado: "conectado" } }), ctx)).toMatchObject({ clase: "p2p", latenciaMs: null });
    expect(clasificarEnlace(fila("a", { enlace: { estado: "conectado", ruta: ruta("desconocida", null) } }), ctx)).toMatchObject({ clase: "p2p", latenciaMs: null });
  });

  it("enlace directo sin internet: manda sobre el resto y trae su propia latencia", () => {
    const e = clasificarEnlace(fila("a", { enlace: { estado: "conectado", ruta: ruta("internet-directo") } }), { ...ctx, enlaceLocal: enlaceLocal("local:1", { rttMs: 5 }) });
    expect(e).toMatchObject({ clase: "directo-sin-internet", latenciaMs: 5, claseRuta: "misma-red-local" });
  });

  it("sin canal pero con faro en el relé: relé cifrado, latencia no medida y el motivo lo dice", () => {
    const e = clasificarEnlace(fila("a"), { ...ctx, faroEnRele: true });
    expect(e).toMatchObject({ clase: "rele", latenciaMs: null });
    expect(e.motivo).toMatch(/latencia no medida/);
  });

  it("sin enlace SIEMPRE explica por qué", () => {
    const motivo = (f: ReturnType<typeof fila> | null, c = ctx) => {
      const e = clasificarEnlace(f, c);
      expect(e.clase).toBe("sin-enlace");
      expect(e.latenciaMs).toBeNull();
      expect(e.motivo).toBeTruthy();
      return e.motivo!;
    };
    expect(motivo(fila("a", { enlace: { estado: "conectando" } }))).toMatch(/negociando/);
    expect(motivo(fila("a", { enlace: { estado: "fallido", motivo: "ICE falló" } }))).toContain("ICE falló");
    expect(motivo(fila("a", { enlace: { estado: "fallido" } }))).toMatch(/sin motivo informado/);
    expect(motivo(fila("a", { online: false }))).toMatch(/desconectada \(último latido hace 1 min\)/);
    expect(motivo(fila("a", { online: true }))).toMatch(/en línea, pero todavía no hay canal/);
    expect(motivo(null)).toMatch(/desconectada/);
    expect(motivo(null, { ...ctx, medios: [medioPresencia("a", "m1")] })).toMatch(/en línea/);
  });
});

describe("valor corto y estilo de cada clase", () => {
  it("«12 ms · red local», «latencia sin medir» y los sin enlace", () => {
    expect(valorEnlace({ clase: "p2p-red-local", etiqueta: "", latenciaMs: 11.6 })).toBe("12 ms · red local");
    expect(valorEnlace({ clase: "p2p-turn", etiqueta: "", latenciaMs: null })).toBe("latencia sin medir · TURN");
    expect(valorEnlace({ clase: "sin-enlace", etiqueta: "", latenciaMs: null }, "desconectada")).toBe("desconectada");
    expect(valorEnlace({ clase: "sin-enlace", etiqueta: "", latenciaMs: null }, "activa")).toBe("sin enlace");
  });

  it("cada clase tiene etiqueta y estilo propios; sin enlace es punteada y tenue; los canales P2P, continuos", () => {
    const clases = Object.keys(ETIQUETA_CLASE) as ClaseEnlace[];
    expect(new Set(clases.map((c) => ESTILO_ENLACE[c].color + ESTILO_ENLACE[c].discontinua)).size).toBe(clases.length);
    expect(ESTILO_ENLACE["sin-enlace"]).toMatchObject({ discontinua: true });
    expect(ESTILO_ENLACE["sin-enlace"].opacidad).toBeLessThan(ESTILO_ENLACE["p2p-red-local"].opacidad);
    for (const c of ["p2p-red-local", "p2p-internet", "p2p-turn", "p2p", "directo-sin-internet"] as const) expect(ESTILO_ENLACE[c].discontinua).toBe(false);
    for (const c of ["rele", "rf-lora"] as const) expect(ESTILO_ENLACE[c].discontinua).toBe(true);
  });
});

describe("enlaceDeSenal", () => {
  const vivo = (e: Record<string, ReturnType<typeof clasificarEnlace>>): VivoMapa => ({
    enlaces: new Map(Object.entries(e)), estados: new Map(), medios: [], extras: [], oidas: new Map(), presenciaConectada: true,
  });

  it("un nodo LoRa que oye TU radio es rf-lora con su SNR/RSSI medidos, sin latencia inventada", () => {
    const e = enlaceDeSenal(senal("lora:7", { antenna: "lora", metrics: [{ label: "SNR", value: "-7.5 dB" }, { label: "RSSI", value: "-98 dBm" }] }), null);
    expect(e).toMatchObject({ clase: "rf-lora", latenciaMs: null, detalle: "SNR -7.5 dB · RSSI -98 dBm" });
  });

  it("lo simulado o lo que oye otra neurona no es un enlace", () => {
    expect(enlaceDeSenal(senal("lora:7", { antenna: "lora", simulated: true }), null)).toBeNull();
    expect(enlaceDeSenal(senal("remoto:n1:lora:7", { antenna: "lora" }), null)).toBeNull();
  });

  it("BLE, Wi-Fi, serie, faros y topologías no son un camino hasta ti", () => {
    for (const [id, antenna] of [["ble:1", "ble"], ["ip:external", "ip"], ["serial:0", "serial"], ["beacon:1", "relay"], ["federated:1", "account"]] as const) {
      expect(enlaceDeSenal(senal(id, { antenna }), vivo({}))).toBeNull();
    }
  });

  it("un aparato toma el enlace que clasificó la vista en vivo; sin ella, solo si ya hay canal conectado", () => {
    const real = { clase: "p2p-turn" as const, etiqueta: "x", latenciaMs: 80 };
    expect(enlaceDeSenal(aparato("1"), vivo({ "neuron:1": real }))).toBe(real);
    expect(enlaceDeSenal(aparato("2"), vivo({}))).toBeNull();
    const con = (v: string) => aparato("3", { metrics: [{ label: "Enlace P2P", value: v }] });
    expect(enlaceDeSenal(con("conectado · 42 ms"), null)).toMatchObject({ clase: "p2p", latenciaMs: 42 });
    expect(enlaceDeSenal(con("conectado"), null)).toMatchObject({ clase: "p2p", latenciaMs: null });
    for (const v of ["conectando", "fallido: x", "sin vínculo"]) expect(enlaceDeSenal(con(v), null)).toBeNull();
  });
});
