/**
 * Cifrado de punta a punta del enlace `nativo:<ip>` (CIF1108A) con DOS motores en memoria y las sesiones
 * reales: un mensaje y un trozo de archivo viajan cifrados; alteración y repetición cierran el enlace; lo
 * que llega en claro hacia quien cifra se descarta; una app anterior sigue en claro y se marca «sin cifrar»;
 * «Exigir cifrado» la bloquea; el gancho de certificado se comprueba con un verificador inyectado.
 * Contrato: architecture/datos-por-la-malla.md §6.
 */
import { describe, expect, it } from "vitest";
import { crearRedNativa, type DepsRedNativa, type RedNativa } from "@/lib/malla/red-local-nativa-motor";
import { crearSesionesCifradas } from "@/lib/malla/sesion-cifrada";
import type { LimitesCanal, VinculoMinimo } from "@/lib/malla/red-local-nativa";

const IP_A = "192.168.1.10";
const IP_B = "192.168.1.20";
// El limitador de la app real es 300 / 10 s; aquí se sube para que la prueba de 500 tramas no espere al reloj.
const LIM: LimitesCanal = { maxCuerpo: 64 * 1024, porVentana: 1_000_000, ventanaMs: 10_000 };

interface Mundo {
  ahora: number;
  redes: Record<string, RedNativa>;
  envios: Array<{ de: string; a: string; cuerpo: string }>;
  /** Para alterar lo que viaja (alteración en el aire). */
  tocar?: (cuerpo: string) => string;
}

async function calma(): Promise<void> {
  for (let i = 0; i < 80; i++) await new Promise((r) => setTimeout(r, 0));
}

function app(
  m: Mundo,
  p: { ip: string; neurona: string; huella: string; vecino: { ip: string; neurona: string }; vinculo: VinculoMinimo; cifra?: boolean; exigir?: boolean; certificado?: Record<string, unknown>; verificarCertificado?: DepsRedNativa["verificarCertificado"] },
) {
  const entregados: string[] = [];
  const archivos: string[] = [];
  const firmar = async (cuerpo: unknown) => ({ v: 2, fp: p.huella, body: cuerpo });
  const deps: DepsRedNativa = {
    ahora: () => m.ahora,
    dormir: async (ms) => {
      await calma();
      m.ahora += ms;
    },
    nuevaSesion: () => "nativo-x",
    estado: async () => ({ escuchando: true, vecinos: [{ ip: p.vecino.ip, neurona: p.vecino.neurona, puerto: 47071, canal: true }], limites: LIM }),
    enviar: async (ip, _puerto, json) => {
      const cuerpo = m.tocar && !json.startsWith('{"t":"nl.hola"') && !json.startsWith('{"t":"nl.cs"') ? m.tocar(json) : json;
      m.envios.push({ de: p.ip, a: ip, cuerpo });
      const destino = m.redes[ip];
      if (!destino) return { ok: false, motivo: "no se pudo conectar" };
      void Promise.resolve().then(() => destino.recibir(cuerpo, p.ip));
      return { ok: true, ms: 3 };
    },
    yo: async () => ({ neurona: p.neurona, nombre: p.neurona }),
    vinculos: () => [p.vinculo],
    firmar,
    verificar: async (s) => {
      const o = s as { fp?: string; body?: unknown };
      return { cuerpo: o.body, huella: o.fp, valido: typeof o.fp === "string" };
    },
    webrtc: () => false,
    enlaceLocalCon: () => false,
    ofrecer: async () => ({ ok: false, motivo: "no aplica" }),
    responder: async () => ({ ok: false, motivo: "no aplica" }),
    entregarTransporte: (texto) => entregados.push(texto),
    entregarArchivo: (_c, texto) => archivos.push(texto),
    ...(p.cifra === false ? {} : { sesiones: crearSesionesCifradas({ ahora: () => m.ahora, firmar, limites: { tramas: 25 } }) }),
    exigirCifrado: () => !!p.exigir,
    ...(p.certificado ? { certificadoPropio: async () => p.certificado ?? null } : {}),
    ...(p.verificarCertificado ? { verificarCertificado: p.verificarCertificado } : {}),
  };
  const red = crearRedNativa(deps);
  m.redes[p.ip] = red;
  return { red, entregados, archivos };
}

function par(opts: { cifraA?: boolean; cifraB?: boolean; exigirA?: boolean; certB?: Record<string, unknown>; verificarA?: DepsRedNativa["verificarCertificado"] } = {}) {
  const m: Mundo = { ahora: 1_000_000, redes: {}, envios: [] };
  const a = app(m, {
    ip: IP_A,
    neurona: "NA",
    huella: "FPA",
    vecino: { ip: IP_B, neurona: "NB" },
    vinculo: { neurona: "NB", nombre: "B", huella: "FPB" },
    cifra: opts.cifraA,
    exigir: opts.exigirA,
    verificarCertificado: opts.verificarA,
  });
  const b = app(m, { ip: IP_B, neurona: "NB", huella: "FPB", vecino: { ip: IP_A, neurona: "NA" }, vinculo: { neurona: "NA", nombre: "A", huella: "FPA" }, cifra: opts.cifraB, certificado: opts.certB });
  return { m, a, b };
}

async function ligar(x: ReturnType<typeof par>) {
  await x.a.red.refrescar();
  await calma();
  await x.b.red.refrescar();
  await calma();
}

const MSG = '{"t":"tu.msg","c":"sync","x":"texto-secreto-del-mensaje"}';

describe("dos motores con cifrado", () => {
  it("se anuncian `cif` en el saludo y el mensaje viaja cifrado hasta el otro lado", async () => {
    const x = par();
    await ligar(x);
    const holas = x.m.envios.filter((e) => e.cuerpo.startsWith('{"t":"nl.hola"'));
    expect(holas.length).toBeGreaterThan(0);
    expect(JSON.stringify(holas[0])).toContain('\\"cif\\":1');
    expect(x.a.red.cifradoDe?.("NB")).toBe("pendiente");
    const r = await x.a.red.enviarTexto(IP_B, MSG);
    expect(r.ok).toBe(true);
    await calma();
    expect(x.b.entregados).toEqual([MSG]);
    const datos = x.m.envios.filter((e) => e.de === IP_A && e.cuerpo.includes('"nl.cif"'));
    expect(datos).toHaveLength(1);
    expect(datos[0].cuerpo).not.toContain("texto-secreto");
    expect(x.m.envios.some((e) => e.cuerpo.includes("texto-secreto"))).toBe(false);
    expect(x.a.red.cifradoDe?.("NB")).toBe("cifrado");
    expect(x.b.red.cifradoDe?.("NA")).toBe("cifrado");
    expect(x.a.red.enlaces()[0].cifrado).toBe("cifrado");
  });

  it("un trozo de archivo cifrado llega al motor de archivos del otro lado, y en el otro sentido también", async () => {
    const x = par();
    await ligar(x);
    const chunk = `{"t":"archivo.chunk","id":"${"f".repeat(36)}","index":1,"datosB64":"${btoa("x".repeat(30_000))}"}`;
    expect(x.a.red.canalArchivos(IP_B).enviar(chunk)).toBe(true);
    await calma();
    expect(x.b.archivos).toEqual([chunk]);
    expect(x.m.envios.filter((e) => e.cuerpo.includes("datosB64"))).toHaveLength(0);
    // Y de B hacia A usa la otra clave.
    expect((await x.b.red.enviarTexto(IP_A, MSG)).ok).toBe(true);
    await calma();
    expect(x.a.entregados).toEqual([MSG]);
  });

  it("el trozo de archivo con cifrado es más pequeño y la trama cifrada sigue cabiendo en una", async () => {
    const x = par();
    await ligar(x);
    const claro = x.a.red.canalArchivos(IP_B).tamanoTrozo?.() ?? 0;
    expect(claro).toBeGreaterThan(30 * 1024);
    expect(claro).toBeLessThan(46 * 1024);
    const b64 = btoa("y".repeat(claro));
    const chunk = `{"t":"archivo.chunk","id":"${"f".repeat(36)}","index":7,"datosB64":"${b64}"}`;
    x.a.red.canalArchivos(IP_B).enviar(chunk);
    await calma();
    const f = x.m.envios.find((e) => e.cuerpo.includes('"nl.cif"') && e.cuerpo.length > 1000);
    expect(f).toBeTruthy();
    expect((f as { cuerpo: string }).cuerpo.length).toBeLessThanOrEqual(LIM.maxCuerpo - 512);
    expect(x.b.archivos).toEqual([chunk]);
  });

  it("una trama alterada en el aire cierra el enlace (no se entrega nada)", async () => {
    const x = par();
    await ligar(x);
    expect((await x.a.red.enviarTexto(IP_B, MSG)).ok).toBe(true);
    await calma();
    x.m.tocar = (j) => {
      if (!j.includes('"nl.cif"')) return j;
      const o = JSON.parse(j) as { c: string };
      return JSON.stringify({ ...o, c: (o.c[0] === "A" ? "B" : "A") + o.c.slice(1) });
    };
    await x.a.red.enviarTexto(IP_B, '{"t":"tu.msg","c":"sync","x":"segundo"}');
    await calma();
    expect(x.b.entregados).toEqual([MSG]);
    const inst = x.b.red.instantanea();
    expect(inst.ligaduras.find((l) => l.neurona === "NA")).toBeUndefined();
    expect(inst.ultimoRechazo).toContain("cerrado");
  });

  it("repetir una trama cifrada ya recibida cierra el enlace", async () => {
    const x = par();
    await ligar(x);
    await x.a.red.enviarTexto(IP_B, MSG);
    await calma();
    const cifrada = x.m.envios.find((e) => e.de === IP_A && e.cuerpo.includes('"nl.cif"')) as { cuerpo: string };
    await x.b.red.recibir(cifrada.cuerpo, IP_A);
    expect(x.b.entregados).toEqual([MSG]);
    expect(x.b.red.instantanea().ultimoRechazo).toContain("cerrado");
  });

  it("lo que llega en claro de quien cifra se descarta, aunque sea un mensaje válido", async () => {
    const x = par();
    await ligar(x);
    await x.a.red.enviarTexto(IP_B, MSG); // establece la sesión
    await calma();
    x.b.entregados.length = 0;
    await x.b.red.recibir('{"t":"tu.msg","c":"sync","x":"colado"}', IP_A);
    await x.b.red.recibir('{"t":"nl.lote","m":["{\\"t\\":\\"archivo.chunk\\"}"]}', IP_A);
    expect(x.b.entregados).toEqual([]);
    expect(x.b.archivos).toEqual([]);
    expect(x.b.red.instantanea().ultimoRechazo).toContain("sin cifrar");
  });

  it("se rehace el acuerdo al llegar al límite de tramas (aquí 25) sin perder ningún mensaje", async () => {
    const x = par();
    await ligar(x);
    for (let i = 0; i < 70; i++) {
      const r = await x.a.red.enviarTexto(IP_B, `{"t":"tu.msg","c":"sync","i":${i}}`);
      expect(r.ok).toBe(true);
      if (i % 40 === 0) await calma();
    }
    await calma();
    expect(x.b.entregados).toHaveLength(70);
    const acuerdos = x.m.envios.filter((e) => e.de === IP_A && e.cuerpo.startsWith('{"t":"nl.cs"'));
    expect(acuerdos.length).toBeGreaterThanOrEqual(2);
  }, 30_000);
});

describe("compatibilidad con una app anterior", () => {
  it("sin soporte en B: todo en claro, enlace «sin cifrar» y nada se rompe", async () => {
    const x = par({ cifraB: false });
    await ligar(x);
    expect(x.a.red.cifradoDe?.("NB")).toBe("sin-cifrar");
    expect(x.a.red.enlaces()[0].cifrado).toBe("sin-cifrar");
    expect((await x.a.red.enviarTexto(IP_B, MSG)).ok).toBe(true);
    await calma();
    expect(x.b.entregados).toEqual([MSG]);
    expect((await x.b.red.enviarTexto(IP_A, MSG)).ok).toBe(true);
    await calma();
    expect(x.a.entregados).toEqual([MSG]);
    expect(x.m.envios.some((e) => e.cuerpo.includes('"nl.cif"') || e.cuerpo.startsWith('{"t":"nl.cs"'))).toBe(false);
  });

  it("con «Exigir cifrado en la red local» una app anterior queda bloqueada en los dos sentidos", async () => {
    const x = par({ cifraB: false, exigirA: true });
    await ligar(x);
    const r = await x.a.red.enviarTexto(IP_B, MSG);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("Exigir cifrado");
    await x.a.red.recibir(MSG, IP_B);
    expect(x.a.entregados).toEqual([]);
    expect(x.b.entregados).toEqual([]);
  });

  it("con «Exigir cifrado» y un par que cifra todo sigue igual", async () => {
    const x = par({ exigirA: true });
    await ligar(x);
    expect((await x.a.red.enviarTexto(IP_B, MSG)).ok).toBe(true);
    await calma();
    expect(x.b.entregados).toEqual([MSG]);
  });

  it("un motor sin sesiones (como el de antes) no anuncia `cif` ni añade campos al enlace", async () => {
    const x = par({ cifraA: false, cifraB: false });
    await ligar(x);
    const hola = x.m.envios.find((e) => e.cuerpo.startsWith('{"t":"nl.hola"')) as { cuerpo: string };
    expect(hola.cuerpo).not.toContain("cif");
    expect(x.a.red.enlaces()[0].cifrado).toBeUndefined();
  });
});

describe("gancho de certificado (IDN1108A)", () => {
  it("sin verificador, el certificado del saludo se ignora (comportamiento de hoy)", async () => {
    const x = par({ certB: { v: 1, cuenta: "c1", firma: "zzz" } });
    await ligar(x);
    expect(x.a.red.instantanea().ligaduras.some((l) => l.neurona === "NB")).toBe(true);
  });

  it("con verificador, un certificado inválido rechaza el saludo y uno válido lo deja pasar", async () => {
    let visto: unknown = null;
    const malo = par({ certB: { v: 1, firma: "mala" }, verificarA: (c, ctx) => ((visto = { c, ctx }), false) });
    await ligar(malo);
    expect(malo.a.red.instantanea().ligaduras).toHaveLength(0);
    expect(malo.a.red.instantanea().ultimoRechazo).toContain("certificado");
    expect(visto).toMatchObject({ ctx: { neurona: "NB", huella: "FPB" } });
    const bueno = par({ certB: { v: 1, firma: "buena" }, verificarA: async () => true });
    await ligar(bueno);
    expect(bueno.a.red.instantanea().ligaduras).toHaveLength(1);
  });
});
