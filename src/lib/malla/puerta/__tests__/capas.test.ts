import { describe, expect, it } from "vitest";
import {
  capaAlcanza,
  capasAnunciables,
  capasConcedidas,
  cidrDeCapaValido,
  decidirCapa,
  detectarCapas,
  evaluarDestino,
  hostEsPrivado,
  ipEnCidr,
  leerCapa,
  type CapaPuerta,
  type TipoCapa,
} from "@/lib/malla/puerta/capas";
import { AJUSTES_PUERTA_POR_DEFECTO, interpretarAjustes, type AjustesPuerta } from "@/lib/malla/puerta/politica";
import { TablaPuertas, crearAnuncioPropio, leerAnuncio } from "@/lib/malla/puerta/tabla";
import { fuentesCapasReales, interpretarCapasDeclaradas } from "@/lib/malla/puerta/capas-fuentes";

const estado = { conInternet: true, bateria: 0.9, cargando: false, medida: false };
const aj = (p: Partial<AjustesPuerta> = {}): AjustesPuerta => ({ ...AJUSTES_PUERTA_POR_DEFECTO, ...p });

const SRV: CapaPuerta = { id: "srv:192.168.1.50:8443", tipo: "servidor-propio", etiqueta: "NAS", hosts: ["192.168.1.50"], cidrs: ["192.168.1.50/32"], puertos: [8443], latenciaMs: 9 };
const SRV_NOMBRE: CapaPuerta = { id: "srv:api.casa.lan:443", tipo: "servidor-propio", etiqueta: "API", hosts: ["api.casa.lan"], cidrs: [], puertos: [443] };
const LAN: CapaPuerta = { id: "lan", tipo: "lan", etiqueta: "Red local", hosts: [], cidrs: ["192.168.1.0/24"], puertos: [] };
const RTR: CapaPuerta = { id: "rtr:192.168.1.1", tipo: "router-publico", etiqueta: "Router", hosts: ["192.168.1.1"], cidrs: ["192.168.1.1/32"], puertos: [443] };

describe("detección de capas", () => {
  it("servidores propios: solo los privados; el Supabase público ya sale por internet", () => {
    const c = detectarCapas({
      servidoresPropios: [
        { url: "https://abc.supabase.co", etiqueta: "Supabase" },
        { url: "https://192.168.1.50:8443/rest/v1", etiqueta: "NAS", latenciaMs: 9 },
        { url: "https://api.casa.lan/x" },
        { url: "http://localhost:54321" },
        { url: "no es una url" },
      ],
      vecinosLan: [],
      subredes: [],
      routers: [],
    });
    expect(c.map((x) => x.id).sort()).toEqual(["srv:127.0.0.1:54321".replace("127.0.0.1", "localhost"), "srv:192.168.1.50:8443", "srv:api.casa.lan:443"].sort());
    const nas = c.find((x) => x.id === "srv:192.168.1.50:8443");
    expect(nas).toMatchObject({ tipo: "servidor-propio", hosts: ["192.168.1.50"], cidrs: ["192.168.1.50/32"], puertos: [8443], latenciaMs: 9 });
  });

  it("LAN: subredes de las interfaces; sin ellas, la /24 de cada vecino; nunca loopback ni rangos públicos", () => {
    expect(detectarCapas({ servidoresPropios: [], vecinosLan: [], subredes: ["192.168.1.0/24", "8.8.8.0/24", "127.0.0.0/8", "0.0.0.0/0"], routers: [] })).toEqual([
      expect.objectContaining({ id: "lan", tipo: "lan", cidrs: ["192.168.1.0/24"] }),
    ]);
    const porVecinos = detectarCapas({ servidoresPropios: [], vecinosLan: ["10.0.7.12", "10.0.7.99", "8.8.8.8", "127.0.0.1"], subredes: [], routers: [] });
    expect(porVecinos[0].cidrs).toEqual(["10.0.7.0/24"]);
    expect(detectarCapas({ servidoresPropios: [], vecinosLan: [], subredes: [], routers: [] })).toEqual([]);
  });

  it("routers declarados: privados, con sus puertos", () => {
    const c = detectarCapas({ servidoresPropios: [], vecinosLan: [], subredes: [], routers: [{ host: "192.168.1.1", puertos: [443, 8080] }, { host: "openwrt.lan" }, { host: "8.8.8.8" }] });
    expect(c.map((x) => [x.id, x.tipo, x.puertos])).toEqual([
      ["rtr:192.168.1.1", "router-publico", [443, 8080]],
      ["rtr:openwrt.lan", "router-publico", [443]],
    ]);
  });

  it("utilidades IPv4 y de hosts", () => {
    expect(ipEnCidr("192.168.1.77", "192.168.1.0/24")).toBe(true);
    expect(ipEnCidr("192.168.2.77", "192.168.1.0/24")).toBe(false);
    expect(cidrDeCapaValido("10.4.0.0/16")).toBe(true);
    expect(cidrDeCapaValido("0.0.0.0/0")).toBe(false);
    expect(cidrDeCapaValido("169.254.0.0/16")).toBe(false);
    expect(cidrDeCapaValido("8.8.8.0/24")).toBe(false);
    expect(hostEsPrivado("nas")).toBe(true);
    expect(hostEsPrivado("nas.local")).toBe(true);
    expect(hostEsPrivado("example.com")).toBe(false);
    expect(hostEsPrivado("8.8.8.8")).toBe(false);
  });
});

describe("anuncio con capas", () => {
  it("el anuncio lleva el detalle y sus tipos; ida y vuelta por leerAnuncio", () => {
    const a = crearAnuncioPropio({ id: "mac", capas: ["internet"], detalle: [SRV, LAN], latenciaMs: 12, estado, ahora: 1 });
    expect(a?.capas).toEqual(["internet", "servidor-propio", "lan"]);
    const r = leerAnuncio(JSON.parse(JSON.stringify(a)));
    expect(r?.detalle?.map((c) => c.id)).toEqual(["srv:192.168.1.50:8443", "lan"]);
    expect(r?.detalle?.[0].latenciaMs).toBe(9);
  });

  it("una neurona sin internet pero con una capa SÍ anuncia; sin nada, no", () => {
    expect(crearAnuncioPropio({ id: "x", capas: [], detalle: [SRV], latenciaMs: null, estado: { ...estado, conInternet: false }, ahora: 1 })?.capas).toEqual(["servidor-propio"]);
    expect(crearAnuncioPropio({ id: "x", capas: [], latenciaMs: null, estado: { ...estado, conInternet: false }, ahora: 1 })).toBeNull();
  });

  it("capas envenenadas en un anuncio ajeno se descartan (rango público, host público, sin alcance)", () => {
    expect(leerCapa({ id: "a", tipo: "lan", etiqueta: "x", hosts: [], cidrs: ["0.0.0.0/0"], puertos: [] })).toBeNull();
    expect(leerCapa({ id: "a", tipo: "servidor-propio", etiqueta: "x", hosts: ["example.com"], cidrs: [], puertos: [443] })).toBeNull();
    expect(leerCapa({ id: "a", tipo: "otra", etiqueta: "x", hosts: ["nas.lan"], cidrs: [], puertos: [] })).toBeNull();
    expect(leerCapa({ id: "a", tipo: "lan", etiqueta: "x", hosts: [], cidrs: ["192.168.1.0/24", "8.8.8.0/24"], puertos: [99999, 443] })?.cidrs).toEqual(["192.168.1.0/24"]);
  });

  it("solo se anuncia lo que el dueño comparte (LAN apagada = ni su subred)", () => {
    expect(capasAnunciables(aj(), [SRV, LAN, RTR]).map((c) => c.id)).toEqual(["srv:192.168.1.50:8443", "rtr:192.168.1.1"]);
    expect(capasAnunciables(aj({ compartirRedLocal: true }), [SRV, LAN]).map((c) => c.id)).toEqual(["srv:192.168.1.50:8443", "lan"]);
    expect(capasAnunciables(aj({ compartirServidoresPropios: false }), [SRV, LAN])).toEqual([]);
    // Un permiso explícito a otra cuenta obliga a anunciar ese tipo aunque «mis neuronas» esté apagado.
    expect(capasAnunciables(aj({ compartirServidoresPropios: false, capasPorNeurona: { z: ["servidor-propio"] } }), [SRV]).length).toBe(1);
  });
});

describe("matriz de política: solicitante × capa × ajustes", () => {
  const tipos: TipoCapa[] = ["servidor-propio", "lan", "router-publico"];
  const esperado = (tipo: TipoCapa, mismaCuenta: boolean, a: Partial<AjustesPuerta>, explicito: boolean): boolean => {
    const cfg = aj({ ...a, capasPorNeurona: explicito ? { n1: [tipo] } : {} });
    return decidirCapa(cfg, { tipo }, { id: "n1", mismaCuenta }).ok;
  };

  it("por defecto: mis servidores y routers SÍ para mi cuenta; la LAN NO; otras cuentas nada", () => {
    expect(esperado("servidor-propio", true, {}, false)).toBe(true);
    expect(esperado("router-publico", true, {}, false)).toBe(true);
    expect(esperado("lan", true, {}, false)).toBe(false);
    for (const t of tipos) expect(esperado(t, false, {}, false)).toBe(false);
  });

  it("interruptores de mi cuenta", () => {
    expect(esperado("servidor-propio", true, { compartirServidoresPropios: false }, false)).toBe(false);
    expect(esperado("lan", true, { compartirRedLocal: true }, false)).toBe(true);
    expect(esperado("lan", true, { compartirRedLocal: true, compartirServidoresPropios: false }, false)).toBe(true); // independientes
  });

  it("otra cuenta: solo con permiso EXPLÍCITO por neurona; la LAN además exige el interruptor de la LAN", () => {
    expect(esperado("servidor-propio", false, {}, true)).toBe(true);
    expect(esperado("servidor-propio", false, { compartirServidoresPropios: false }, true)).toBe(true); // el permiso explícito manda sobre «mis neuronas»
    expect(esperado("lan", false, {}, true)).toBe(false); // LAN apagada: ni explícito
    expect(esperado("lan", false, { compartirRedLocal: true }, false)).toBe(false); // encendida pero sin permiso
    expect(esperado("lan", false, { compartirRedLocal: true }, true)).toBe(true);
  });

  it("el permiso es por tipo y por neurona", () => {
    const cfg = aj({ compartirRedLocal: true, capasPorNeurona: { n1: ["servidor-propio"] } });
    expect(decidirCapa(cfg, { tipo: "lan" }, { id: "n1", mismaCuenta: false }).ok).toBe(false);
    expect(decidirCapa(cfg, { tipo: "servidor-propio" }, { id: "n2", mismaCuenta: false }).ok).toBe(false);
  });

  it("revocada: nada, ni de mi cuenta", () => {
    expect(decidirCapa(aj({ revocadas: ["n1"] }), { tipo: "servidor-propio" }, { id: "n1", mismaCuenta: true })).toEqual({ ok: false, motivo: "revocada" });
  });

  it("capasConcedidas filtra por solicitante", () => {
    const cfg = aj({ compartirRedLocal: true });
    expect(capasConcedidas(cfg, [SRV, LAN], { id: "a", mismaCuenta: true }).length).toBe(2);
    expect(capasConcedidas(cfg, [SRV, LAN], { id: "a", mismaCuenta: false }).length).toBe(0);
  });

  it("los ajustes guardados se normalizan (sin LAN por defecto; basura se ignora; el viejo interruptor no abre nada)", () => {
    const x = interpretarAjustes(JSON.stringify({ compartirRedLocal: "si", capasPorNeurona: { a: ["lan", "xx"], b: "x", "": ["lan"] }, permitirRedPrivada: true }));
    expect(x.compartirRedLocal).toBe(false);
    expect(x.compartirServidoresPropios).toBe(true);
    expect(x.capasPorNeurona).toEqual({ a: ["lan"] });
    expect(evaluarDestino("192.168.1.50", 443, x, { id: "n", mismaCuenta: true }, [])).toEqual({ ok: false, motivo: "destino-interno" });
  });
});

describe("evaluarDestino: exactamente las capas concedidas", () => {
  const yo = { id: "n1", mismaCuenta: true };
  const otra = { id: "n9", mismaCuenta: false };

  it("destino público: puerto 443; otras cuentas respetan hostsParaOtras; sin concesión para Node", () => {
    expect(evaluarDestino("example.com", 443, aj(), yo, [SRV])).toEqual({ ok: true, capa: null, concedido: null });
    expect(evaluarDestino("example.com", 8443, aj(), yo, [SRV])).toEqual({ ok: false, motivo: "puerto-no-permitido" });
    expect(evaluarDestino("example.com", 443, aj({ hostsParaOtras: ["api.ok.com"] }), otra, [])).toEqual({ ok: false, motivo: "host-no-permitido" });
  });

  it("destino privado sin capa: destino-interno, aunque el viejo interruptor esté encendido", () => {
    for (const h of ["192.168.1.50", "10.0.0.1", "127.0.0.1", "169.254.169.254", "localhost", "nas.local", "2130706433", "0x7f.1", "017700000001", "224.0.0.1"]) {
      expect(evaluarDestino(h, 443, aj({ permitirRedPrivada: true }), yo, [])).toEqual({ ok: false, motivo: "destino-interno" });
    }
  });

  it("destino de una capa propia concedida: puerto de la capa y concesión exacta", () => {
    const r = evaluarDestino("192.168.1.50", 8443, aj(), yo, [SRV, LAN]);
    expect(r).toMatchObject({ ok: true, concedido: { cidrs: ["192.168.1.50/32"], hosts: [], puertos: [8443], subredes: false } });
    // por nombre: Node resuelve y comprueba contra las subredes de la máquina
    expect(evaluarDestino("API.casa.lan", 443, aj(), yo, [SRV_NOMBRE])).toMatchObject({ ok: true, concedido: { hosts: ["api.casa.lan"], puertos: [443], subredes: true } });
  });

  it("puertos: 443 o los declarados por la capa, nunca otro", () => {
    expect(evaluarDestino("192.168.1.50", 443, aj(), yo, [SRV]).ok).toBe(true);
    expect(evaluarDestino("192.168.1.50", 22, aj(), yo, [SRV])).toEqual({ ok: false, motivo: "destino-interno" });
    expect(evaluarDestino("192.168.1.50", 8080, aj(), yo, [SRV])).toEqual({ ok: false, motivo: "destino-interno" });
    expect(evaluarDestino("192.168.1.50", 0, aj(), yo, [SRV])).toEqual({ ok: false, motivo: "destino-no-valido" });
  });

  it("capa existente pero no concedida a ese solicitante: capa-no-concedida", () => {
    expect(evaluarDestino("192.168.1.50", 8443, aj(), otra, [SRV])).toEqual({ ok: false, motivo: "capa-no-concedida" });
    expect(evaluarDestino("192.168.1.77", 443, aj(), yo, [LAN])).toEqual({ ok: false, motivo: "capa-no-concedida" }); // LAN apagada
    expect(evaluarDestino("192.168.1.77", 443, aj({ compartirRedLocal: true }), yo, [LAN])).toMatchObject({ ok: true, concedido: { cidrs: ["192.168.1.77/32"], subredes: true } });
  });

  it("la LAN no cubre IPs de otra subred ni nombres", () => {
    const cfg = aj({ compartirRedLocal: true });
    expect(evaluarDestino("192.168.2.77", 443, cfg, yo, [LAN])).toEqual({ ok: false, motivo: "destino-interno" });
    expect(evaluarDestino("impresora.lan", 443, cfg, yo, [LAN])).toEqual({ ok: false, motivo: "destino-interno" });
  });

  it("entradas inválidas", () => {
    expect(evaluarDestino("a b", 443, aj(), yo, [])).toEqual({ ok: false, motivo: "destino-no-valido" });
    expect(evaluarDestino("x@y.com", 443, aj(), yo, [])).toEqual({ ok: false, motivo: "destino-no-valido" });
    expect(evaluarDestino(5, 443, aj(), yo, [])).toEqual({ ok: false, motivo: "destino-no-valido" });
    expect(capaAlcanza(SRV, "192.168.1.50", 8443)).toBe(true);
  });
});

describe("selección de puerta por capa (tabla)", () => {
  const ahora = (): number => 1000;
  const enlace = { tipoEnlace: "local", etiqueta: "Red local" };
  const a1 = crearAnuncioPropio({ id: "g1", capas: ["internet"], latenciaMs: 10, estado, ahora: 1000 }) as NonNullable<ReturnType<typeof crearAnuncioPropio>>;
  const a2 = crearAnuncioPropio({ id: "g2", capas: ["internet"], detalle: [SRV], latenciaMs: 60, estado, ahora: 1000 }) as NonNullable<ReturnType<typeof crearAnuncioPropio>>;
  const a3 = crearAnuncioPropio({ id: "g3", capas: [], detalle: [LAN], latenciaMs: 5, estado: { ...estado, conInternet: false }, ahora: 1000 }) as NonNullable<ReturnType<typeof crearAnuncioPropio>>;

  it("un destino público elige entre las que tienen internet (la más rápida); uno privado, la que tiene su capa", () => {
    const t = new TablaPuertas(ahora, "yo");
    t.anotar(a1, "g1", enlace);
    t.anotar(a2, "g2", enlace);
    t.anotar(a3, "g3", enlace);
    expect(t.elegir({ host: "example.com", puerto: 443 })?.anuncio.id).toBe("g1");
    expect(t.candidatas({ host: "example.com", puerto: 443 }).map((e) => e.anuncio.id)).toEqual(["g1", "g2"]); // g3 no tiene internet
    expect(t.elegir({ host: "192.168.1.50", puerto: 8443 })?.anuncio.id).toBe("g2");
    expect(t.elegir({ host: "192.168.1.77", puerto: 443 })?.anuncio.id).toBe("g3");
    expect(t.elegir({ host: "192.168.1.50", puerto: 22 })).toBeNull(); // ninguna cubre ese puerto
    expect(t.elegir({ host: "10.9.9.9", puerto: 443 })).toBeNull();
    expect(t.capaParaDestino("192.168.1.50", 8443)).toMatchObject({ puerta: "g2", capa: { id: "srv:192.168.1.50:8443" } });
    expect(t.capaParaDestino("example.com", 443)).toBeNull();
  });

  it("sin filtro de destino, todo sigue igual que antes", () => {
    const t = new TablaPuertas(ahora, "yo");
    t.anotar(a1, "g1", enlace);
    t.anotar(a3, "g3", enlace);
    expect(t.candidatas().map((e) => e.anuncio.id).sort()).toEqual(["g1", "g3"]);
  });
});

describe("fuentes reales de capas", () => {
  it("reúne Supabase autoalojado, declaradas y subredes de Node; ignora lo roto", async () => {
    const f = await fuentesCapasReales({
      env: { NEXT_PUBLIC_SUPABASE_URL: "http://192.168.1.50:8000" },
      declaradas: () => interpretarCapasDeclaradas(JSON.stringify({ servidores: [{ url: "https://nas.lan:5001", etiqueta: "NAS" }, { url: 5 }], routers: [{ host: "192.168.1.1", puertos: [443, "x"] }, {}] })),
      vecinosLan: () => ["192.168.1.7"],
      subredes: async () => ["192.168.1.0/24"],
    });
    expect(f.servidoresPropios.map((s) => s.url)).toEqual(["https://nas.lan:5001", "http://192.168.1.50:8000"]);
    expect(f.routers).toEqual([{ host: "192.168.1.1", puertos: [443] }]);
    const capas = detectarCapas(f);
    expect(capas.map((c) => c.id)).toEqual(["srv:nas.lan:5001", "srv:192.168.1.50:8000", "rtr:192.168.1.1", "lan"]);
  });

  it("una fuente que lanza no rompe la detección", async () => {
    const f = await fuentesCapasReales({
      env: {},
      declaradas: () => {
        throw new Error("x");
      },
      vecinosLan: () => {
        throw new Error("y");
      },
      subredes: () => {
        throw new Error("z");
      },
    });
    expect(f).toEqual({ servidoresPropios: [], vecinosLan: [], subredes: [], routers: [] });
  });
});
