/**
 * PTA1108C: (1) la clave de un saludo con certificado verificado se guarda como «certificada»; (2) relé de dos vías y
 * adaptador del servidor propio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registrarClaveDeHolaCertificada, registrarHolaArchivo } from "@/lib/malla/archivo-seguro-real";
import { fuenteCertificado, olvidarClavesVivas, resolverClaves, fuenteVivo, fuenteServidor } from "@/lib/malla/claves-destinatario";
import { crearRetornoRele, envolverRele, leerReleEnvuelto } from "@/lib/malla/rele-bidireccional";
import { CLAVE_RELE_PROPIO, crearClienteRelePropio, guardarConfigRelePropio, iniciarRecepcionRelePropio, leerConfigRelePropio, urlRelePropioValida } from "@/lib/malla/rele-propio";

const CLAVE: JsonWebKey = { kty: "EC", crv: "P-256", x: "AAAA-x", y: "BBBB-y" };
const verificar = (estado: string, ok = true) => vi.fn(async () => ({ ok, estado }));
const memoria = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("clave de cifrado desde un saludo con certificado verificado", () => {
  beforeEach(() => olvidarClavesVivas());

  const buscarCert = async (n: string) => (await resolverClaves([n], [fuenteCertificado])).origenes[n];

  it("verificado contra el ancla (valido): se guarda y sirve sin red ni saludo vivo", async () => {
    const v = verificar("valido");
    expect(await registrarClaveDeHolaCertificada("n-cert-1", CLAVE, { cert: 1 }, "id:abc", v)).toBe(true);
    expect(v).toHaveBeenCalledWith({ certificado: { cert: 1 }, neurona: "n-cert-1", huella: "id:abc" });
    expect(await buscarCert("n-cert-1")).toBe("certificado");
    // Orden de resolución: vivo → … → certificado → servidor. Sin saludo vivo ni servidor, la certificada responde.
    const r = await resolverClaves(["n-cert-1"], [fuenteVivo, fuenteCertificado, fuenteServidor(() => false, () => null)]);
    expect(r.origenes["n-cert-1"]).toBe("certificado");
    expect(r.destinatarios).toHaveLength(1);
  });

  it("sin ancla, inválido, sin huella probada, sin certificado o clave rota: no se guarda nada", async () => {
    expect(await registrarClaveDeHolaCertificada("n-x1", CLAVE, {}, "id:abc", verificar("sin-ancla"))).toBe(false);
    expect(await registrarClaveDeHolaCertificada("n-x2", CLAVE, {}, "id:abc", verificar("invalido", false))).toBe(false);
    expect(await registrarClaveDeHolaCertificada("n-x3", CLAVE, {}, "id:abc", verificar("sin-certificado"))).toBe(false);
    expect(await registrarClaveDeHolaCertificada("n-x4", CLAVE, {}, undefined, verificar("valido"))).toBe(false);
    expect(await registrarClaveDeHolaCertificada("n-x5", CLAVE, null, "id:abc", verificar("valido"))).toBe(false);
    expect(await registrarClaveDeHolaCertificada("n-x6", { kty: "EC", crv: "P-256", x: "a", y: "b", d: "privada" }, {}, "id:abc", verificar("valido"))).toBe(false);
    expect(await registrarClaveDeHolaCertificada("n-x7", "no-es-clave", {}, "id:abc", verificar("valido"))).toBe(false);
    const lanza = vi.fn(async () => {
      throw new Error("boom");
    });
    expect(await registrarClaveDeHolaCertificada("n-x8", CLAVE, {}, "id:abc", lanza as never)).toBe(false);
    for (const n of ["n-x1", "n-x2", "n-x3", "n-x4", "n-x5", "n-x6", "n-x7", "n-x8"]) expect(await buscarCert(n)).toBeUndefined();
  });

  it("registrarHolaArchivo: la clave viva se anota siempre; la certificada solo si el certificado verifica (certificado ajeno falso → ignorado)", async () => {
    // El verificador real rechaza un certificado de forma inválida (no hay ancla ni firma): la clave certificada NO se anota.
    registrarHolaArchivo("n-hola-1", ["archivo.e2e.v1"], CLAVE, { certificado: { falso: true }, huella: "id:zzz" });
    await new Promise((r) => setTimeout(r, 30));
    expect(await buscarCert("n-hola-1")).toBeUndefined();
    expect((await resolverClaves(["n-hola-1"], [fuenteVivo])).origenes["n-hola-1"]).toBe("vivo");
  });
});

describe("relé de dos vías", () => {
  it("envuelve y lee el remitente; lo ajeno o desmedido se ignora", () => {
    const t = envolverRele('{"t":"archivo.aceptar"}', { rele: "fp:abc", uid: "u1" });
    expect(leerReleEnvuelto(t)).toEqual({ p: '{"t":"archivo.aceptar"}', de: { rele: "fp:abc", uid: "u1" } });
    expect(leerReleEnvuelto(JSON.parse(t))).not.toBeNull();
    expect(leerReleEnvuelto('{"t":"archivo.aceptar"}')).toBeNull();
    expect(leerReleEnvuelto("no json")).toBeNull();
    expect(leerReleEnvuelto({ t: "archivo.rele2", fr: "", p: "x" })).toBeNull();
    expect(leerReleEnvuelto({ t: "archivo.rele2", fr: "a", p: 5 })).toBeNull();
    expect(leerReleEnvuelto({ t: "archivo.rele2", fr: "a".repeat(200), p: "x" })).toBeNull();
    expect(leerReleEnvuelto({ t: "archivo.rele2", fr: "a", p: "x".repeat(200_000) })).toBeNull();
  });

  it("A manda por el relé y B contesta por el MISMO relé hacia A (acuse/reanudar), sin vías directas", async () => {
    // Un «relé» en memoria con dos buzones.
    const buzon: Record<string, string[]> = { A: [], B: [] };
    const mk = (yo: string) =>
      crearRetornoRele({
        yo: () => ({ rele: yo, uid: `u-${yo}` }),
        enviar: (para, txt) => {
          buzon[para.rele].push(txt);
          return true;
        },
      });
    const A = mk("A");
    const B = mk("B");
    // A → B: un trozo sellado, envuelto con la identidad de A.
    buzon.B.push(await A.envolverIda('{"t":"archivo.trozo","i":0}'));
    const llegada = leerReleEnvuelto(buzon.B[0]);
    expect(llegada?.de).toEqual({ rele: "A", uid: "u-A" });
    // B arma el canal de vuelta hacia A y contesta.
    const canalB = B.canalDe(llegada!.de);
    expect(B.canalDe(llegada!.de)).toBe(canalB); // mismo objeto: el motor guarda estado por canal
    expect(canalB.enviar('{"t":"archivo.aceptar","id":"x","desde":3}')).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    const vuelta = leerReleEnvuelto(buzon.A[0]);
    expect(vuelta?.p).toBe('{"t":"archivo.aceptar","id":"x","desde":3}');
    expect(vuelta?.de.rele).toBe("B");
    // Y A puede contestar a B por la vuelta de la vuelta.
    expect(A.canalDe(vuelta!.de).enviar('{"t":"archivo.fin"}')).toBe(true);
  });

  it("sin identidad propia: el trozo sale tal cual (relé de ida, como antes) y no se contesta", async () => {
    const R = crearRetornoRele({ yo: () => null, enviar: () => true });
    expect(await R.envolverIda("hola")).toBe("hola");
    const enviado = vi.fn(() => true);
    const R2 = crearRetornoRele({ yo: () => null, enviar: enviado });
    R2.canalDe({ rele: "X" }).enviar("x");
    await new Promise((r) => setTimeout(r, 10));
    expect(enviado).not.toHaveBeenCalled();
  });

  it("el tope de canales de vuelta guardados", () => {
    const R = crearRetornoRele({ yo: () => ({ rele: "yo" }), enviar: () => true, maxCanales: 2 });
    const c1 = R.canalDe({ rele: "1" });
    R.canalDe({ rele: "2" });
    R.canalDe({ rele: "3" });
    expect(R.canalDe({ rele: "1" })).not.toBe(c1); // el más viejo se olvidó
  });
});

describe("rele-propio: adaptador del servidor propio", () => {
  afterEach(() => vi.restoreAllMocks());

  it("configuración: https, o http solo a hosts privados; sin credenciales en la URL; se guarda y se lee", () => {
    for (const u of ["https://relay.midominio.com", "http://192.168.1.50:8090", "http://nas.local", "https://a.b/c"]) expect(urlRelePropioValida(u), u).toBe(true);
    for (const u of ["http://example.com", "ftp://x", "https://u:p@x.com", "https://x.com/?t=1", 5, null, "no url"]) expect(urlRelePropioValida(u as never), String(u)).toBe(false);
    const m = memoria();
    expect(leerConfigRelePropio(m)).toBeNull();
    expect(guardarConfigRelePropio({ url: "https://relay.midominio.com/", token: "t0k" }, m)).toBe(true);
    expect(leerConfigRelePropio(m)).toEqual({ url: "https://relay.midominio.com", token: "t0k" });
    m.setItem(CLAVE_RELE_PROPIO, JSON.stringify({ url: "http://example.com" }));
    expect(leerConfigRelePropio(m)).toBeNull();
  });

  it("enviar y recibir contra un servidor simulado (cabeceras, cursor y saneado)", async () => {
    const cola: Array<{ id: string; de: { rele: string; uid?: string }; p: string }> = [];
    const llamadas: Array<{ url: string; init?: RequestInit }> = [];
    const servidor = (async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init });
      if (url.endsWith("/v1/rele/enviar")) {
        const b = JSON.parse(String(init?.body));
        cola.push({ id: b.id, de: b.de, p: b.p });
        return new Response(JSON.stringify({ ok: true }));
      }
      return new Response(JSON.stringify({ mensajes: [...cola.splice(0), { id: 5, p: "roto" }, { id: "z", p: "x", de: {} }], sig: "c2" }));
    }) as unknown as typeof fetch;
    const cli = crearClienteRelePropio({ url: "https://r.test", token: "T" }, servidor);
    const env = envolverRele('{"t":"archivo.oferta"}', { rele: "A" });
    expect(await cli.enviar("m1", "B", { rele: "A", uid: "uA" }, env)).toBe(true);
    expect((llamadas[0].init?.headers as Record<string, string>).authorization).toBe("Bearer T");
    const r = await cli.recibir("B", "c1");
    expect(llamadas[1].url).toBe("https://r.test/v1/rele/recibir?yo=B&desde=c1");
    expect(r.sig).toBe("c2");
    expect(r.mensajes).toEqual([{ id: "m1", de: { rele: "A", uid: "uA" }, p: env }]);
  });

  it("errores de red: enviar → false; recibir → vacío y conserva el cursor; trozo desmedido no sale", async () => {
    const roto = (async () => {
      throw new TypeError("sin red");
    }) as unknown as typeof fetch;
    const cli = crearClienteRelePropio({ url: "https://r.test" }, roto);
    expect(await cli.enviar("i", "B", { rele: "A" }, "x")).toBe(false);
    expect(await cli.recibir("B", "c9")).toEqual({ mensajes: [], sig: "c9" });
    expect(await cli.enviar("i", "B", { rele: "A" }, "x".repeat(200_000))).toBe(false);
    expect(await cli.enviar("i", "", { rele: "A" }, "x")).toBe(false);
  });

  it("el bucle de recepción entrega solo trozos de esta capa y avanza el cursor", async () => {
    const entregados: string[] = [];
    const cursores: Array<string | null> = [];
    let n = 0;
    let parar = (): void => undefined;
    const cliente = {
      enviar: async () => true,
      recibir: async (_yo: string, desde: string | null) => {
        cursores.push(desde);
        n++;
        if (n === 2) parar();
        return {
          mensajes: n === 1 ? [{ id: "1", de: { rele: "A" }, p: envolverRele('{"t":"archivo.trozo"}', { rele: "A" }) }, { id: "2", de: { rele: "A" }, p: "basura ajena" }, { id: "3", de: { rele: "A" }, p: '{"t":"archivo.directo"}' }] : [],
          sig: `c${n}`,
        };
      },
    };
    parar = iniciarRecepcionRelePropio({ cliente, yo: () => "B", alMensaje: (m) => entregados.push(m.id), esperar: () => new Promise((r) => setTimeout(r, 1)) });
    await new Promise((r) => setTimeout(r, 40));
    expect(entregados).toEqual(["1", "3"]);
    expect(cursores.slice(0, 2)).toEqual([null, "c1"]);
  });
});
