/**
 * Red local de la app nativa como enlace del transporte universal (MLT1107A, puro): direcciones,
 * límites y ritmo, lotes de tramas, saludo firmado y ligaduras, enlaces y candidatos con la IP real.
 * Contrato: architecture/datos-por-la-malla.md §6.
 */
import { describe, expect, it } from "vitest";
import {
  CADA_HOLA_MS,
  ENTRE_HOLAS_MS,
  LIMITES_CANAL_ANTERIOR,
  MAX_POR_LOTE,
  VIDA_LIGADURA_MS,
  aceptarHola,
  armarTrama,
  bytesUtf8,
  candidatosConIp,
  claseDeTexto,
  desempaquetarLote,
  destinosHola,
  enlacesNativos,
  esEnlaceRedLocalNativa,
  esperaTrasFallo,
  holaNativa,
  idEnlaceNativo,
  ipDeEnlaceNativo,
  ipLocal,
  leerHola,
  leerLimites,
  ligaduraDeIp,
  ligaduraDeNeurona,
  ligar,
  maxTextoPorTrama,
  nuevaCubeta,
  podarLigaduras,
  tomarFicha,
  type Ligadura,
  type VinculoMinimo,
} from "@/lib/malla/red-local-nativa";

const IP_A = "192.168.1.10";
const IP_B = "192.168.1.20";

function ligadura(p: Partial<Ligadura> = {}): Ligadura {
  return { ip: IP_B, puerto: 47071, neurona: "N-B", huella: "fp-b", nombre: "Tablet", limites: { ...LIMITES_CANAL_ANTERIOR }, webrtc: true, at: 1_000, ...p };
}

describe("direcciones e ids", () => {
  it("solo la red local (espejo de ip_local de Rust)", () => {
    for (const ok of ["192.168.1.5", "10.0.0.2", "172.16.5.4", "172.31.255.1", "169.254.10.1", " 192.168.0.9 "]) expect(ipLocal(ok)).not.toBeNull();
    for (const no of ["8.8.8.8", "127.0.0.1", "0.0.0.0", "172.32.0.1", "255.255.255.255", "hola", "", "192.168.1.300", 7]) expect(ipLocal(no)).toBeNull();
  });

  it("el id del enlace lleva la IP y se reconoce el TCP y el WebRTC señalizado por la app", () => {
    expect(idEnlaceNativo(IP_B)).toBe("nativo:192.168.1.20");
    expect(ipDeEnlaceNativo("nativo:192.168.1.20")).toBe(IP_B);
    expect(ipDeEnlaceNativo("nativo:8.8.8.8")).toBeNull();
    expect(ipDeEnlaceNativo("local:abc")).toBeNull();
    expect(esEnlaceRedLocalNativa("nativo:192.168.1.20")).toBe(true);
    expect(esEnlaceRedLocalNativa("local:nativo-abc123")).toBe(true);
    expect(esEnlaceRedLocalNativa("local:abc123")).toBe(false);
    expect(esEnlaceRedLocalNativa(null)).toBe(false);
  });
});

describe("límites y ritmo — nunca se pasa del cupo del otro", () => {
  it("sin anuncio (app anterior) usa 64 KiB y 30 cada 10 s; lo absurdo se acota", () => {
    expect(leerLimites(null)).toEqual(LIMITES_CANAL_ANTERIOR);
    expect(leerLimites({ max_cuerpo: 65536 })).toEqual(LIMITES_CANAL_ANTERIOR);
    expect(leerLimites({ max_cuerpo: 65536, limite_mensajes: 300, limite_ventana_ms: 10_000 })).toEqual({ maxCuerpo: 65536, porVentana: 300, ventanaMs: 10_000 });
    expect(leerLimites({ max_cuerpo: 1e12, limite_mensajes: 1e9, limite_ventana_ms: 1 })).toEqual({ maxCuerpo: 1024 * 1024, porVentana: 1000, ventanaMs: 1000 });
    expect(maxTextoPorTrama(LIMITES_CANAL_ANTERIOR)).toBe(65536 - 512);
  });

  it("en cualquier ventana del limitador del otro se manda ≤ 90 % de su cupo", () => {
    for (const lim of [LIMITES_CANAL_ANTERIOR, { maxCuerpo: 65536, porVentana: 300, ventanaMs: 10_000 }]) {
      let c = nuevaCubeta(lim, 0);
      const envios: number[] = [];
      let t = 0;
      while (t < 60_000) {
        const r = tomarFicha(c, t);
        c = r.cubeta;
        if (r.esperaMs === 0) envios.push(t);
        else t += r.esperaMs;
      }
      for (let inicio = 0; inicio < 50_000; inicio += 1_000) {
        const dentro = envios.filter((x) => x >= inicio && x < inicio + lim.ventanaMs).length;
        expect(dentro).toBeLessThanOrEqual(Math.floor(lim.porVentana * 0.9));
      }
      // y no se queda corto: en régimen va al 60 %
      const ultimos = envios.filter((x) => x >= 40_000 && x < 50_000).length;
      expect(ultimos).toBeGreaterThanOrEqual(Math.floor(lim.porVentana * 0.6) - 1);
    }
  });

  it("tras fallos espera 0,5 s · 2ⁿ hasta 8 s", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(esperaTrasFallo)).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000]);
  });
});

describe("tramas — lotes que caben en 64 KiB", () => {
  const trozo = (i: number) => JSON.stringify({ t: "archivo.chunk", id: "f1", index: i, datosB64: "A".repeat(21_848) });

  it("un texto viaja tal cual; varios pequeños, juntos en un nl.lote que se desempaqueta igual", () => {
    expect(armarTrama([], 1000)).toEqual({ cuerpo: null, usados: 0 });
    expect(armarTrama(['{"t":"tu.msg","id":"1"}'], 1000)).toEqual({ cuerpo: '{"t":"tu.msg","id":"1"}', usados: 1 });
    const cola = ['{"a":1}', '{"b":"dos \\"comillas\\""}', '{"c":3}'];
    const r = armarTrama(cola, 1000);
    expect(r.usados).toBe(3);
    expect(desempaquetarLote(r.cuerpo as string)).toEqual(cola);
  });

  it("dos trozos de archivo de 16 KiB en base64 caben en una trama de 64 KiB; tres no", () => {
    const cola = [trozo(0), trozo(1), trozo(2)];
    const r = armarTrama(cola, maxTextoPorTrama(LIMITES_CANAL_ANTERIOR));
    expect(r.usados).toBe(2);
    expect(bytesUtf8(r.cuerpo as string)).toBeLessThanOrEqual(65536 - 512);
    expect(desempaquetarLote(r.cuerpo as string)).toEqual(cola.slice(0, 2));
  });

  it("lo que no cabe solo o no es un objeto JSON se rechaza sin atascar la cola", () => {
    expect(armarTrama(["x".repeat(10)], 1000)).toMatchObject({ cuerpo: null, usados: 1, motivo: expect.stringMatching(/objetos JSON/) });
    expect(armarTrama([`{"x":"${"a".repeat(2000)}"}`], 1000)).toMatchObject({ cuerpo: null, usados: 1, motivo: expect.stringMatching(/no cabe/) });
  });

  it("nunca más de MAX_POR_LOTE por trama; un lote no lleva lotes dentro ni basura", () => {
    const muchos = Array.from({ length: 50 }, (_, i) => `{"i":${i}}`);
    expect(armarTrama(muchos, 60_000).usados).toBe(MAX_POR_LOTE);
    expect(desempaquetarLote('{"t":"nl.lote","m":["{\\"a\\":1}","hola",3,"{\\"t\\":\\"nl.lote\\",\\"m\\":[]}"]}')).toEqual(['{"a":1}']);
    expect(desempaquetarLote('{"t":"tu.msg"}')).toBeNull();
    expect(desempaquetarLote('{"t":"nl.lote",')).toBeNull();
  });

  it("los archivos van en su propia cola (orden estricto) y lo demás pasa delante", () => {
    expect(claseDeTexto(trozo(0))).toBe("datos");
    expect(claseDeTexto('{"t":"archivo.fin","id":"f1"}')).toBe("datos");
    expect(claseDeTexto('{"t":"tu.msg"}')).toBe("control");
    expect(claseDeTexto('{"t":"nl.sen"}')).toBe("control");
  });
});

describe("saludo firmado y ligaduras — solo neuronas vinculadas, con LA MISMA huella", () => {
  const vinculos: VinculoMinimo[] = [{ neurona: "N-B", nombre: "Tablet", huella: "fp-b", ultimaIp: IP_B }];
  const hola = holaNativa({ de: { neurona: "N-B", nombre: "Tablet" }, para: "N-A", limites: { maxCuerpo: 65536, porVentana: 300, ventanaMs: 10_000 }, webrtc: true, ts: 5 });

  it("ida y vuelta del saludo; lo mal formado no se lee", () => {
    expect(leerHola(JSON.parse(JSON.stringify(hola)))).toEqual(hola);
    expect(leerHola({ ...hola, v: 2 })).toBeNull();
    expect(leerHola({ ...hola, de: {} })).toBeNull();
    expect(leerHola({ ...hola, para: "" })).toBeNull();
    expect(leerLimites(hola.lim).porVentana).toBe(300);
  });

  it("se acepta solo si es para mí, de una vinculada y firmado por la huella del vínculo", () => {
    expect(aceptarHola(hola, "fp-b", "N-A", vinculos)).toMatchObject({ ok: true, vinculo: { neurona: "N-B" } });
    expect(aceptarHola(hola, "fp-b", "N-C", vinculos)).toMatchObject({ ok: false, motivo: expect.stringMatching(/otra neurona/) });
    expect(aceptarHola(hola, "fp-x", "N-A", vinculos)).toMatchObject({ ok: false, motivo: expect.stringMatching(/no es la de la neurona vinculada/) });
    expect(aceptarHola(hola, undefined, "N-A", vinculos)).toMatchObject({ ok: false });
    expect(aceptarHola(hola, "fp-b", "N-A", [])).toMatchObject({ ok: false, motivo: expect.stringMatching(/no hay vínculo/) });
    expect(aceptarHola(hola, "fp-b", "N-A", [{ neurona: "N-B", nombre: "Tablet" }])).toMatchObject({ ok: false, motivo: expect.stringMatching(/huella/) });
    expect(aceptarHola({ ...hola, para: "N-B" }, "fp-b", "N-B", vinculos)).toMatchObject({ ok: false, motivo: expect.stringMatching(/eco/) });
  });

  it("una IP es de una neurona y una neurona de una IP; caducan sin saludo nuevo", () => {
    let l = ligar([], ligadura());
    l = ligar(l, ligadura({ ip: "192.168.1.30", neurona: "N-C", huella: "fp-c" }));
    l = ligar(l, ligadura({ ip: "192.168.1.31", at: 2_000 })); // N-B cambió de IP
    expect(l.map((x) => [x.ip, x.neurona])).toEqual([
      ["192.168.1.31", "N-B"],
      ["192.168.1.30", "N-C"],
    ]);
    expect(ligaduraDeIp(l, IP_B, 2_000)).toBeNull();
    expect(ligaduraDeNeurona(l, "N-B", 2_000)?.ip).toBe("192.168.1.31");
    expect(ligaduraDeIp(l, "192.168.1.30", 1_000 + VIDA_LIGADURA_MS + 1)).toBeNull();
    expect(podarLigaduras(l, 1_000 + VIDA_LIGADURA_MS + 1).map((x) => x.neurona)).toEqual(["N-B"]);
  });

  it("saluda a las vinculadas que el faro oye (por id o última IP), sin repetir ni a otras", () => {
    const vecinos = [
      { ip: IP_B, neurona: null, puerto: 47071, canal: true },
      { ip: "192.168.1.40", neurona: "N-D", puerto: 47071, canal: true },
      { ip: "192.168.1.41", neurona: "N-E", puerto: 47071, canal: false },
    ];
    const vinc: VinculoMinimo[] = [
      ...vinculos,
      { neurona: "N-D", nombre: "Mac", huella: "fp-d" },
      { neurona: "N-E", nombre: "Viejo", huella: "fp-e" },
      { neurona: "N-F", nombre: "Lejos", huella: "fp-f", ultimaIp: "192.168.1.40" }, // esa IP es de N-D
    ];
    const d = destinosHola({ vecinos, vinculos: vinc, ligaduras: [], ultimoHola: {}, ahora: 100_000 });
    expect(d).toEqual([
      { ip: IP_B, puerto: 47071, neurona: "N-B" },
      { ip: "192.168.1.40", puerto: 47071, neurona: "N-D" },
    ]);
    // saludada hace poco: no se repite; ligada hace poco: tampoco
    expect(destinosHola({ vecinos, vinculos: vinc, ligaduras: [], ultimoHola: { [IP_B]: 100_000 - ENTRE_HOLAS_MS + 1 }, ahora: 100_000 }).map((x) => x.ip)).toEqual(["192.168.1.40"]);
    const lig = [ligadura({ at: 100_000 - CADA_HOLA_MS + 1 })];
    expect(destinosHola({ vecinos, vinculos: vinc, ligaduras: lig, ultimoHola: {}, ahora: 100_000 }).map((x) => x.ip)).toEqual(["192.168.1.40"]);
  });
});

describe("enlaces del transporte universal", () => {
  it("uno por ligadura vigente: rango 0, sin internet, mensajes y archivos (no flujos), latencia medida o sin medir", () => {
    const l = [ligadura({ sync: "S-B", cuenta: "u1" }), ligadura({ ip: "192.168.1.30", neurona: "N-C", at: -VIDA_LIGADURA_MS })];
    const e = enlacesNativos({ ligaduras: l, ahora: 1_000, escuchando: true, caidas: {}, rtt: { [IP_B]: 7 } });
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({
      id: "nativo:192.168.1.20",
      tipo: "nativo",
      etiqueta: "Tablet · red local",
      alcanza: { neuronDeviceId: "N-B", syncDeviceId: "S-B", uid: "u1" },
      abierto: true,
      sinInternet: true,
      ruta: "misma-red-local",
      rttMs: 7,
      capacidadKbps: null,
      admite: { mensaje: true, archivo: true, flujo: false },
      consentido: true,
    });
    expect(enlacesNativos({ ligaduras: l, ahora: 1_000, escuchando: true, caidas: {}, rtt: {} })[0].rttMs).toBeNull();
    expect(enlacesNativos({ ligaduras: l, ahora: 1_000, escuchando: false, caidas: {}, rtt: {} })[0].abierto).toBe(false);
    expect(enlacesNativos({ ligaduras: l, ahora: 1_000, escuchando: true, caidas: { [IP_B]: 5_000 }, rtt: {} })[0].abierto).toBe(false);
  });
});

describe("candidatosConIp — la IP real junto al nombre mDNS", () => {
  const sdp = [
    "v=0",
    "o=- 1 2 IN IP4 127.0.0.1",
    "a=candidate:1 1 udp 2122260223 3f1c2a9e-1111-2222-3333-444455556666.local 54321 typ host generation 0",
    "a=candidate:2 1 udp 2122194687 192.168.1.20 54322 typ host generation 0",
    "a=candidate:3 1 udp 1686052607 85.0.0.1 54321 typ srflx raddr 0.0.0.0 rport 0",
    "",
  ].join("\r\n");

  it("añade una copia con la IP tras cada candidato host mDNS y deja todo lo demás igual", () => {
    const r = candidatosConIp(sdp, IP_B);
    const lineas = r.split("\r\n");
    expect(lineas.filter((l) => l.startsWith("a=candidate:"))).toEqual([
      "a=candidate:1 1 udp 2122260223 3f1c2a9e-1111-2222-3333-444455556666.local 54321 typ host generation 0",
      "a=candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host generation 0",
      "a=candidate:2 1 udp 2122194687 192.168.1.20 54322 typ host generation 0",
      "a=candidate:3 1 udp 1686052607 85.0.0.1 54321 typ srflx raddr 0.0.0.0 rport 0",
    ]);
    expect(r.endsWith("\r\n")).toBe(true);
  });

  it("con una IP que no es de la red local no toca nada", () => {
    expect(candidatosConIp(sdp, "8.8.8.8")).toBe(sdp);
    expect(candidatosConIp(sdp, IP_A)).not.toBe(sdp);
  });
});
