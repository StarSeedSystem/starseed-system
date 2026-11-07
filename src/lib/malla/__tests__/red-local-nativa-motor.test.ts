/**
 * Motor del enlace `nativo:<ip>` (MLT1107A) con DOS apps en memoria: saludo firmado y ligadura solo
 * entre vinculadas, mensajes con el acuse de la otra app, archivos en lotes con freno, ritmo según el
 * limitador del otro, caída tras fallos y señalización WebRTC sin QR (quién ofrece, SDP con la IP real).
 * (MLL1107A) Dos neuronas de la MISMA cuenta sin vínculo (prueba de cuenta) y `asegurarLigadura`.
 * Contrato: architecture/datos-por-la-malla.md §6.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { crearRedNativa, hmacPruebaCuenta, type ConexionSenal, type DepsRedNativa, type RedNativa } from "@/lib/malla/red-local-nativa-motor";
import { LIMITES_CANAL_ANTERIOR, type LimitesCanal, type VinculoMinimo } from "@/lib/malla/red-local-nativa";

const IP_A = "192.168.1.10";
const IP_B = "192.168.1.20";
const NUEVOS: LimitesCanal = { maxCuerpo: 64 * 1024, porVentana: 300, ventanaMs: 10_000 };

interface Mundo {
  ahora: number;
  redes: Record<string, RedNativa>;
  /** Envíos hechos: [de, a, cuerpo, instante]. */
  envios: Array<{ de: string; a: string; cuerpo: string; at: number }>;
  falla: Set<string>;
  /** (MLL1107A) IPs con una app 0.5.0: su Rust acusa la trama, pero su web no conoce `nl.*`. */
  legados?: Set<string>;
}

interface Conexion extends ConexionSenal {
  cb: ((e: "abierta" | "cerrada" | "fallida", motivo?: string) => void) | null;
  completadaCon: string | null;
  cancelada: boolean;
}

function nuevaConexion(sdp: string, conCompletar: boolean): Conexion {
  const c: Conexion = {
    sdp,
    cb: null,
    completadaCon: null,
    cancelada: false,
    cancelar: () => {
      c.cancelada = true;
    },
    alCambiar: (cb) => {
      c.cb = cb;
      return () => {
        c.cb = null;
      };
    },
  };
  if (conCompletar) {
    c.completar = async (s) => {
      c.completadaCon = s;
      return { ok: true };
    };
  }
  return c;
}

const SDP_A = "v=0\r\na=candidate:1 1 udp 2122260223 aaaa-1111.local 50001 typ host generation 0\r\n";
const SDP_B = "v=0\r\na=candidate:1 1 udp 2122260223 bbbb-2222.local 50002 typ host generation 0\r\n";

function app(
  m: Mundo,
  p: {
    ip: string;
    neurona: string;
    huella: string;
    nombre: string;
    vinculos: VinculoMinimo[];
    vecinos: Array<{ ip: string; neurona: string | null }>;
    limites?: LimitesCanal | null;
    webrtc?: boolean;
    /** (MLL1107A) Clave de faro de la cuenta (sin ella, el saludo va sin prueba de cuenta). */
    clave?: string;
    /** Dormir deja correr lo pendiente ANTES de avanzar el reloj (para esperar a la otra app). */
    dormirConCalma?: boolean;
  },
) {
  const entregados: Array<{ texto: string; enlaceId: string; etiqueta: string }> = [];
  const archivos: string[] = [];
  const conexiones: Conexion[] = [];
  let sesiones = 0;
  const deps: DepsRedNativa = {
    ahora: () => m.ahora,
    dormir: async (ms) => {
      if (p.dormirConCalma) await calma();
      m.ahora += ms;
    },
    nuevaSesion: () => `nativo-${p.neurona.toLowerCase().replace(/[^a-z0-9]/g, "")}${String(++sesiones).padStart(6, "0")}`,
    estado: async () => ({
      escuchando: true,
      vecinos: p.vecinos.map((v) => ({ ...v, puerto: 47071, canal: true })),
      limites: p.limites === undefined ? NUEVOS : p.limites,
    }),
    enviar: async (ip, _puerto, json) => {
      m.envios.push({ de: p.ip, a: ip, cuerpo: json, at: m.ahora });
      if (m.falla.has(ip)) return { ok: false, motivo: "tiempo agotado esperando a la otra neurona" };
      if (m.legados?.has(ip)) return { ok: true, ms: 3 };
      const destino = m.redes[ip];
      if (!destino) return { ok: false, motivo: "no se pudo conectar" };
      // Como la app: acusa al guardarlo; la web del otro lo procesa después.
      void Promise.resolve().then(() => destino.recibir(json, p.ip));
      return { ok: true, ms: 3 };
    },
    yo: async () => ({ neurona: p.neurona, nombre: p.nombre }),
    vinculos: () => p.vinculos,
    firmar: async (cuerpo) => ({ v: 2, fp: p.huella, body: cuerpo }),
    verificar: async (s) => {
      const o = s as { fp?: string; body?: unknown };
      return { cuerpo: o.body, huella: o.fp, valido: typeof o.fp === "string" };
    },
    webrtc: () => p.webrtc !== false,
    enlaceLocalCon: () => false,
    ofrecer: vi.fn(async () => {
      const c = nuevaConexion(p.ip === IP_A ? SDP_A : SDP_B, true);
      conexiones.push(c);
      return { ok: true as const, ...c, alCambiar: c.alCambiar, cancelar: c.cancelar, completar: c.completar };
    }),
    responder: vi.fn(async () => {
      const c = nuevaConexion(p.ip === IP_A ? SDP_A : SDP_B, false);
      conexiones.push(c);
      return { ok: true as const, ...c, alCambiar: c.alCambiar, cancelar: c.cancelar };
    }),
    entregarTransporte: (texto, origen) => entregados.push({ texto, enlaceId: origen.enlaceId, etiqueta: origen.etiqueta }),
    entregarArchivo: (_canal, texto) => archivos.push(texto),
    ...(p.clave
      ? {
          pruebaCuenta: async (t: string) => createHmac("sha256", p.clave as string).update(t).digest("hex").slice(0, 32),
          huellaPropia: async () => p.huella,
        }
      : {}),
  };
  const red = crearRedNativa(deps);
  m.redes[p.ip] = red;
  return { red, deps, entregados, archivos, conexiones };
}

async function calma(): Promise<void> {
  for (let i = 0; i < 60; i++) await new Promise((r) => setTimeout(r, 0));
}

function dosVinculadas(o: { limitesB?: LimitesCanal | null; webrtcB?: boolean; vinculosB?: VinculoMinimo[] } = {}) {
  const m: Mundo = { ahora: 1_000_000, redes: {}, envios: [], falla: new Set() };
  const a = app(m, {
    ip: IP_A,
    neurona: "N-A",
    huella: "fp-a",
    nombre: "Mac de Alex",
    vinculos: [{ neurona: "N-B", nombre: "Tablet", huella: "fp-b", ultimaIp: IP_B }],
    vecinos: [{ ip: IP_B, neurona: null }],
  });
  const b = app(m, {
    ip: IP_B,
    neurona: "N-B",
    huella: "fp-b",
    nombre: "Tablet",
    vinculos: o.vinculosB ?? [{ neurona: "N-A", nombre: "Mac de Alex", huella: "fp-a" }],
    vecinos: [{ ip: IP_A, neurona: "N-A" }],
    limites: o.limitesB,
    webrtc: o.webrtcB,
  });
  return { m, a, b };
}

const trozo = (i: number) => JSON.stringify({ t: "archivo.chunk", id: "f1", index: i, datosB64: "A".repeat(21_848) });

describe("saludo y ligadura — solo entre neuronas vinculadas", () => {
  it("A saluda, B la liga y contesta, A liga a B: las dos ven el enlace nativo abierto", async () => {
    const { a, b } = dosVinculadas({ webrtcB: false });
    await b.red.refrescar(); // B también mira su canal (escucha)
    await a.red.refrescar();
    await calma();
    expect(b.red.instantanea().ligaduras.map((l) => [l.ip, l.neurona])).toEqual([[IP_A, "N-A"]]);
    expect(a.red.instantanea().ligaduras.map((l) => [l.ip, l.neurona, l.limites.porVentana])).toEqual([[IP_B, "N-B", 300]]);
    expect(a.red.enlaces()).toEqual([
      expect.objectContaining({ id: "nativo:192.168.1.20", tipo: "nativo", abierto: true, alcanza: { neuronDeviceId: "N-B" }, admite: { mensaje: true, archivo: true, flujo: false } }),
    ]);
    expect(b.red.enlaces().map((e) => e.id)).toEqual(["nativo:192.168.1.10"]);
  });

  it("sin vínculo no hay ligadura (y se dice por qué), y lo que llegue de esa IP se ignora", async () => {
    const { a, b } = dosVinculadas({ vinculosB: [] });
    await b.red.refrescar();
    await a.red.refrescar();
    await calma();
    expect(b.red.instantanea().ligaduras).toEqual([]);
    expect(b.red.instantanea().ultimoRechazo).toMatch(/no hay vínculo/);
    expect(a.red.instantanea().ligaduras).toEqual([]);
    await b.red.recibir('{"t":"tu.msg","v":1,"id":"x","c":"chat","b":1}', IP_A);
    await b.red.recibir(trozo(0), IP_A);
    expect(b.entregados).toEqual([]);
    expect(b.archivos).toEqual([]);
  });

  it("una firma que no es la del vínculo no liga (suplantación)", async () => {
    const { a, b } = dosVinculadas({ vinculosB: [{ neurona: "N-A", nombre: "Mac", huella: "fp-OTRA" }] });
    await b.red.refrescar();
    await a.red.refrescar();
    await calma();
    expect(b.red.instantanea().ligaduras).toEqual([]);
    expect(b.red.instantanea().ultimoRechazo).toMatch(/no es la de la neurona vinculada/);
  });
});

describe("mensajes y archivos por el canal TCP", () => {
  async function ligadas(o: Parameters<typeof dosVinculadas>[0] = {}) {
    const d = dosVinculadas({ webrtcB: false, ...o });
    await d.b.red.refrescar();
    await d.a.red.refrescar();
    await calma();
    d.m.envios.length = 0;
    return d;
  }

  it("un mensaje sale con el acuse de la otra app y llega a su transporte con la vía «red local»", async () => {
    const { a, b } = await ligadas();
    const r = await a.red.enviarTexto(IP_B, '{"t":"tu.msg","v":1,"id":"m1","c":"chat","b":{"txt":"hola"}}');
    expect(r).toEqual({ ok: true, ms: 3 });
    await calma();
    expect(b.entregados).toEqual([{ texto: '{"t":"tu.msg","v":1,"id":"m1","c":"chat","b":{"txt":"hola"}}', enlaceId: "nativo:192.168.1.10", etiqueta: "Mac de Alex · red local" }]);
    expect(a.red.enlaces()[0].rttMs).toBe(3);
  });

  it("los trozos de archivo van de dos en dos por trama, en orden, y un mensaje pasa delante", async () => {
    const { m, a, b } = await ligadas();
    const canal = a.red.canalArchivos(IP_B);
    for (let i = 0; i < 4; i++) expect(canal.enviar(trozo(i))).toBe(true);
    expect(canal.bufferedAmount?.()).toBeGreaterThan(0);
    void a.red.enviarTexto(IP_B, '{"t":"tu.msg","v":1,"id":"m2","c":"chat","b":1}');
    canal.enviar('{"t":"archivo.fin","id":"f1"}');
    await calma();
    const tipo = (c: string) => (c.startsWith('{"t":"nl.lote"') ? `lote(${(JSON.parse(c) as { m: unknown[] }).m.length})` : (JSON.parse(c) as { t: string }).t);
    // El mensaje (cola de control) sale primero; luego los trozos, dos por trama, y el fin cabe con los dos últimos.
    expect(m.envios.map((e) => tipo(e.cuerpo))).toEqual(["tu.msg", "lote(2)", "lote(3)"]);
    m.envios.length = 0;
    canal.enviar(trozo(4));
    void a.red.enviarTexto(IP_B, '{"t":"tu.msg","v":1,"id":"m3","c":"chat","b":1}');
    await calma();
    expect(m.envios.map((e) => tipo(e.cuerpo))).toEqual(["tu.msg", "archivo.chunk"]);
    expect(b.archivos.map((t) => (JSON.parse(t) as { t: string; index?: number }).index ?? "fin")).toEqual([0, 1, 2, 3, "fin", 4]);
    expect(b.entregados.map((x) => (JSON.parse(x.texto) as { id: string }).id)).toEqual(["m2", "m3"]);
    expect(canal.bufferedAmount?.()).toBe(0);
  });

  it("con una app anterior (30 cada 10 s) nunca le manda más de 27 tramas en 10 s", async () => {
    const { m, a } = await ligadas({ limitesB: null });
    expect(a.red.instantanea().ligaduras[0].limites).toEqual(LIMITES_CANAL_ANTERIOR);
    const grande = (i: number) => JSON.stringify({ t: "tu.msg", v: 1, id: `g${i}`, c: "x", b: "z".repeat(40_000) });
    await Promise.all(Array.from({ length: 60 }, (_, i) => a.red.enviarTexto(IP_B, grande(i))));
    const marcas = m.envios.filter((e) => e.a === IP_B).map((e) => e.at);
    expect(marcas).toHaveLength(60);
    for (const t0 of marcas) expect(marcas.filter((t) => t >= t0 && t < t0 + 10_000).length).toBeLessThanOrEqual(27);
  });

  it("si la otra app no acusa, reintenta y a los 6 fallos la da por caída (y lo dice)", async () => {
    const { m, a } = await ligadas();
    m.falla.add(IP_B);
    const r = await a.red.enviarTexto(IP_B, '{"t":"tu.msg","v":1,"id":"m3","c":"chat","b":1}');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/no acusa recibo/);
    expect(m.envios.filter((e) => e.a === IP_B)).toHaveLength(6);
    expect(a.red.enlaces()[0].abierto).toBe(false);
    expect((await a.red.enviarTexto(IP_B, '{"t":"tu.msg"}')).ok).toBe(false);
    expect(a.red.canalArchivos(IP_B).enviar(trozo(0))).toBe(false);
  });

  it("no encola sin fin: el motor de archivos ve la cola ×4 y por encima de 4 MiB el canal dice que no", async () => {
    const { m, a } = await ligadas();
    m.falla.add(IP_B); // nada sale: todo se queda en cola
    const canal = a.red.canalArchivos(IP_B);
    let aceptados = 0;
    for (let i = 0; i < 300 && canal.enviar(trozo(i)); i++) aceptados++;
    expect(aceptados).toBeLessThan(300);
    expect(aceptados * 21_900).toBeLessThanOrEqual(4 * 1024 * 1024 + 21_900);
    expect(canal.bufferedAmount?.()).toBe(a.red.colaBytes(IP_B) * 4);
  });
});

describe("señalización WebRTC por el canal (sin QR)", () => {
  it("ofrece la de id menor; la otra responde; a cada SDP se le añade la IP real; abierta en los dos", async () => {
    const { a, b } = dosVinculadas();
    await b.red.refrescar();
    await a.red.refrescar();
    await calma();
    await a.red.ticSenales();
    await b.red.ticSenales();
    await calma();
    expect(a.deps.ofrecer).toHaveBeenCalledTimes(1);
    expect(b.deps.ofrecer).not.toHaveBeenCalled();
    expect(b.deps.responder).toHaveBeenCalledTimes(1);
    const resp = (b.deps.responder as ReturnType<typeof vi.fn>).mock.calls[0][0] as { sesion: string; sdp: string; nombreRemoto: string };
    expect(resp.sesion).toMatch(/^nativo-/);
    expect(resp.sdp).toContain("aaaa-1111.local 50001 typ host");
    expect(resp.sdp).toContain(`${IP_A} 50001 typ host`);
    expect(resp.nombreRemoto).toBe("Mac de Alex");
    const ofertaA = a.conexiones[0];
    expect(ofertaA.completadaCon).toContain(`${IP_B} 50002 typ host`);
    expect(a.red.instantanea().senales["N-B"]).toMatchObject({ fase: "conectando", sesion: resp.sesion });
    expect(b.red.instantanea().senales["N-A"]).toMatchObject({ fase: "conectando", sesion: resp.sesion });
    ofertaA.cb?.("abierta");
    b.conexiones[0].cb?.("abierta");
    expect(a.red.instantanea().senales["N-B"].fase).toBe("abierta");
    expect(b.red.instantanea().senales["N-A"].fase).toBe("abierta");
  });

  it("si la otra app no tiene WebRTC no se intenta (todo sigue por el TCP)", async () => {
    const { a, b } = dosVinculadas({ webrtcB: false });
    await b.red.refrescar();
    await a.red.refrescar();
    await calma();
    await a.red.ticSenales();
    await calma();
    expect(a.deps.ofrecer).not.toHaveBeenCalled();
    expect(a.red.instantanea().senales["N-B"]?.fase ?? "inactiva").toBe("inactiva");
  });

  it("una señal firmada por otra identidad, o de una IP sin ligadura, se ignora", async () => {
    const { a, b } = dosVinculadas();
    await b.red.refrescar();
    await a.red.refrescar();
    await calma();
    const antes = (b.deps.responder as ReturnType<typeof vi.fn>).mock.calls.length;
    const sen = { t: "nl.sen", v: 1, k: "oferta", s: "nativo-falsa000001", de: "N-A", para: "N-B", sdp: SDP_A, ts: 1 };
    await b.red.recibir(JSON.stringify({ t: "nl.sen", s: { v: 2, fp: "fp-intrusa", body: sen } }), IP_A);
    await b.red.recibir(JSON.stringify({ t: "nl.sen", s: { v: 2, fp: "fp-a", body: sen } }), "192.168.1.99");
    await calma();
    expect((b.deps.responder as ReturnType<typeof vi.fn>).mock.calls.length).toBe(antes);
    expect(b.red.instantanea().senales["N-A"]?.sesion).not.toBe("nativo-falsa000001");
  });

  it("si la conexión falla se cancela avisando al otro y se reintenta más tarde", async () => {
    const { m, a, b } = dosVinculadas();
    await b.red.refrescar();
    await a.red.refrescar();
    await calma();
    await a.red.ticSenales();
    await calma();
    a.conexiones[0].cb?.("fallida", "ICE falló");
    await calma();
    expect(a.red.instantanea().senales["N-B"]).toMatchObject({ fase: "fallida", intentos: 1, motivo: "ICE falló" });
    expect(b.red.instantanea().senales["N-A"].fase).toBe("fallida");
    expect(b.conexiones[0].cancelada).toBe(true);
    m.ahora += 15_000;
    await a.red.ticSenales();
    await calma();
    expect(a.deps.ofrecer).toHaveBeenCalledTimes(2);
  });
});

describe("(MLL1107A) tus neuronas se ligan sin «Sincronizar ahora»: prueba de cuenta en el saludo", () => {
  function dosDeLaCuenta(o: { claveB?: string; vecinosA?: Array<{ ip: string; neurona: string | null }> } = {}) {
    const m: Mundo = { ahora: 1_000_000, redes: {}, envios: [], falla: new Set() };
    // La Mac oye el faro de la tablet (su id lo reconoce la clave de faro); la tablet no oye el de la Mac.
    const a = app(m, { ip: IP_A, neurona: "N-A", huella: "fp-a", nombre: "MaggaBook", vinculos: [], vecinos: o.vecinosA ?? [{ ip: IP_B, neurona: "N-B" }], clave: "clave-de-la-cuenta", webrtc: false });
    const b = app(m, { ip: IP_B, neurona: "N-B", huella: "fp-b", nombre: "Maggaboard", vinculos: [], vecinos: [], clave: o.claveB ?? "clave-de-la-cuenta", webrtc: false });
    return { m, a, b };
  }

  it("la Mac saluda con la prueba, las dos se ligan «por cuenta» y el mensaje va por la red local", async () => {
    const { m, a, b } = dosDeLaCuenta();
    await b.red.refrescar();
    await a.red.refrescar();
    await calma();
    const hola = JSON.parse(m.envios.find((e) => e.de === IP_A)?.cuerpo ?? "{}") as { s?: { body?: { cta?: string } } };
    expect(hola.s?.body?.cta).toMatch(/^[0-9a-f]{32}$/);
    expect(b.red.instantanea().ligaduras.map((l) => [l.ip, l.neurona, l.porCuenta])).toEqual([[IP_A, "N-A", true]]);
    expect(a.red.instantanea().ligaduras.map((l) => [l.ip, l.neurona, l.porCuenta])).toEqual([[IP_B, "N-B", true]]);
    expect(a.red.enlaces()).toEqual([expect.objectContaining({ id: "nativo:192.168.1.20", abierto: true, alcanza: { neuronDeviceId: "N-B" } })]);
    const r = await a.red.enviarTexto(IP_B, '{"t":"tu.msg","v":1,"id":"m1","c":"neurona","b":{"txt":"Prueba de malla"}}');
    expect(r.ok).toBe(true);
    await calma();
    expect(b.entregados.map((x) => x.enlaceId)).toEqual(["nativo:192.168.1.10"]);
  });

  it("otra cuenta (otra clave de faro) no liga, y lo que llegue de esa IP se ignora", async () => {
    const { a, b } = dosDeLaCuenta({ claveB: "clave-de-otra-cuenta" });
    await b.red.refrescar();
    await a.red.refrescar();
    await calma();
    expect(b.red.instantanea().ligaduras).toEqual([]);
    expect(b.red.instantanea().ultimoRechazo).toMatch(/no hay vínculo/);
    expect(a.red.instantanea().ligaduras).toEqual([]);
    await b.red.recibir('{"t":"tu.msg","v":1,"id":"x","c":"neurona","b":1}', IP_A);
    expect(b.entregados).toEqual([]);
  });

  it("copiar la prueba de un saludo ajeno a otro firmado por OTRA identidad no vale", async () => {
    const { m, a, b } = dosDeLaCuenta();
    await a.red.refrescar();
    await calma();
    const original = JSON.parse(m.envios.find((e) => e.de === IP_A)?.cuerpo ?? "{}") as { s: { body: Record<string, unknown> } };
    const intruso = "192.168.1.99";
    await b.red.recibir(JSON.stringify({ t: "nl.hola", s: { v: 2, fp: "fp-intrusa", body: original.s.body } }), intruso);
    await calma();
    expect(b.red.instantanea().ligaduras.map((l) => l.ip)).not.toContain(intruso);
  });

  it("sin la clave en ninguna de las dos (y sin vínculo) no se saluda a nadie", async () => {
    const m: Mundo = { ahora: 1_000_000, redes: {}, envios: [], falla: new Set() };
    const a = app(m, { ip: IP_A, neurona: "N-A", huella: "fp-a", nombre: "Mac", vinculos: [], vecinos: [{ ip: IP_B, neurona: "N-B" }] });
    app(m, { ip: IP_B, neurona: "N-B", huella: "fp-b", nombre: "Tablet", vinculos: [], vecinos: [] });
    await a.red.refrescar();
    await calma();
    expect(m.envios).toEqual([]);
  });

  it("hmacPruebaCuenta es HMAC-SHA256 con la clave de faro (16 bytes en hex); sin clave válida, null", async () => {
    const clave = "ab".repeat(32);
    expect(await hmacPruebaCuenta(clave, "ss-nl-cuenta-v1|x")).toBe(createHmac("sha256", Buffer.from(clave, "hex")).update("ss-nl-cuenta-v1|x").digest("hex").slice(0, 32));
    expect(await hmacPruebaCuenta("ab".repeat(31), "x")).toBeNull();
    expect(await hmacPruebaCuenta(null, "x")).toBeNull();
  });
});

describe("(MLL1107A) asegurarLigadura — antes de mandar, saludar ya y esperar un momento", () => {
  it("no espera al ciclo de 15 s: saluda y vuelve en cuanto la otra contesta", async () => {
    const m: Mundo = { ahora: 1_000_000, redes: {}, envios: [], falla: new Set() };
    const a = app(m, { ip: IP_A, neurona: "N-A", huella: "fp-a", nombre: "Mac", vinculos: [], vecinos: [{ ip: IP_B, neurona: "N-B" }], clave: "k", webrtc: false, dormirConCalma: true });
    app(m, { ip: IP_B, neurona: "N-B", huella: "fp-b", nombre: "Tablet", vinculos: [], vecinos: [], clave: "k", webrtc: false });
    const r = await a.red.asegurarLigadura("N-B", 1_500);
    expect(r).toMatchObject({ estado: "ligada", ip: IP_B });
    expect(r.esperadoMs).toBeLessThan(1_500);
    expect(a.red.enlaces().map((e) => e.id)).toEqual(["nativo:192.168.1.20"]);
    // Ya ligada: no saluda otra vez.
    const antes = m.envios.length;
    expect((await a.red.asegurarLigadura("N-B")).estado).toBe("ligada");
    expect(m.envios.length).toBe(antes);
  });

  it("con una app 0.5.0 (acusa la trama pero no contesta al saludo) espera UNA vez y lo dice; luego no vuelve a esperar", async () => {
    const m: Mundo = { ahora: 1_000_000, redes: {}, envios: [], falla: new Set(), legados: new Set([IP_B]) };
    const a = app(m, { ip: IP_A, neurona: "N-A", huella: "fp-a", nombre: "Tablet", vinculos: [], vecinos: [{ ip: IP_B, neurona: "N-B" }], clave: "k", webrtc: false, dormirConCalma: true });
    const r1 = await a.red.asegurarLigadura("N-B", 1_500);
    expect(r1).toMatchObject({ estado: "sin-respuesta", ip: IP_B, esperadoMs: 1_500, motivo: expect.stringMatching(/no contestó al saludo firmado \(app 0\.5\.0 o anterior/) });
    const holas = () => m.envios.filter((e) => e.a === IP_B && e.cuerpo.startsWith('{"t":"nl.hola"')).length;
    expect(holas()).toBe(1);
    const r2 = await a.red.asegurarLigadura("N-B", 1_500);
    expect(r2).toMatchObject({ estado: "sin-respuesta", esperadoMs: 0 });
    expect(holas()).toBe(1);
  });

  it("si su faro no se oye en esta red, ni saluda ni espera, y lo dice", async () => {
    const m: Mundo = { ahora: 1_000_000, redes: {}, envios: [], falla: new Set() };
    const a = app(m, { ip: IP_A, neurona: "N-A", huella: "fp-a", nombre: "Mac", vinculos: [], vecinos: [], clave: "k", dormirConCalma: true });
    const r = await a.red.asegurarLigadura("N-B", 1_500);
    expect(r).toMatchObject({ estado: "no-se-oye", esperadoMs: 0, motivo: expect.stringMatching(/faro no se oye/) });
    expect(m.envios).toEqual([]);
  });
});
