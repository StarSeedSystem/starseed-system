/**
 * relevo (REL1111I): la tabla de alcance y su caducidad, la elección de ruta con histéresis, la supresión de duplicados,
 * el sobre sellado y el motor de tres y cuatro neuronas sobre carriles en memoria (claves y firmas reales de WebCrypto).
 */
import { afterEach, describe, expect, it } from "vitest";
import { CADUCA_MS, crearAnuncio, leerAnuncio, leerClaveEc, TablaAlcance } from "@/lib/malla/relevo/tabla";
import { costeRuta, costeTramo, elegirRuta, HISTERESIS } from "@/lib/malla/relevo/ruta";
import { abrirMensaje, leerTramaDatos, MAX_SALTOS, sellarMensaje, T_DATOS, VistosAcotados, type TramaDatos } from "@/lib/malla/relevo/sobre";
import { crearEnviador, type DepsEnvio, type EnlaceDisponible } from "@/lib/malla/transporte-universal";
import { RedPrueba, sobreDe } from "./ayudas-relevo";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function hasta(f: () => boolean, ms = 4000): Promise<boolean> {
  const fin = Date.now() + ms;
  while (!f() && Date.now() < fin) await espera(10);
  return f();
}

describe("tabla de alcance", () => {
  const anuncioDe = (n: string, vs: Array<{ n: string; r?: 0 | 1; h?: string }>, s = 1, rel = true) =>
    crearAnuncio({ yo: n, seq: s, ofrezco: rel, vecinas: vs.map((v) => ({ n: v.n, c: "ble", k: 100, l: 50, r: v.r ?? 1, ...(v.h ? { h: v.h } : {}) })) });

  it("solo acepta el anuncio de la neurona que probó el carril", () => {
    const t = new TablaAlcance();
    expect(t.registrar("B", anuncioDe("X", [{ n: "C" }]), 0)).toBe("rechazado");
    expect(t.registrar("B", anuncioDe("B", [{ n: "C" }]), 0)).toBe("nuevo");
    expect(t.relevosHacia("C", 10).map((r) => r.relevo)).toEqual(["B"]);
  });

  it("caduca, se olvida al caer el carril y un anuncio nuevo sustituye al viejo", () => {
    const t = new TablaAlcance();
    t.registrar("B", anuncioDe("B", [{ n: "C" }]), 0);
    expect(t.registrar("B", anuncioDe("B", [], 2), 1000)).toBe("cambio");
    expect(t.relevosHacia("C", 1000)).toEqual([]);
    t.registrar("B", anuncioDe("B", [{ n: "C" }], 3), 2000);
    expect(t.caducar(2000 + CADUCA_MS - 1)).toEqual([]);
    expect(t.caducar(2000 + CADUCA_MS + 1)).toEqual(["B"]);
    t.registrar("D", anuncioDe("D", [{ n: "C" }]), 0);
    expect(t.olvidar("D")).toBe(true);
    expect(t.relevosHacia("C", 0)).toEqual([]);
  });

  it("un destino que no habla relevo (app anterior) nunca es destino; un relevo que no ofrece se marca", () => {
    const t = new TablaAlcance();
    t.registrar("B", anuncioDe("B", [{ n: "VIEJA", r: 0 }, { n: "C" }], 1, false), 0);
    expect(t.relevosHacia("VIEJA", 0)).toEqual([]);
    expect(t.relevosHacia("C", 0)[0]?.ofrece).toBe(false);
    expect(t.destinos(0)).toEqual([]);
  });

  it("huellas y claves anunciadas: si dos vecinas no coinciden no se fía de ninguna", () => {
    const t = new TablaAlcance();
    t.registrar("B", anuncioDe("B", [{ n: "C", h: "id:uno" }]), 0);
    expect(t.huellaDe("C", 0)).toBe("id:uno");
    t.registrar("D", anuncioDe("D", [{ n: "C", h: "id:otra" }]), 0);
    expect(t.huellaDe("C", 0)).toBeNull();
    expect(leerClaveEc({ kty: "EC", crv: "P-256", x: "a", y: "b", d: "secreto" })).toBeNull();
    const a = leerAnuncio(JSON.parse(JSON.stringify(crearAnuncio({ yo: "B", seq: 1, ofrezco: true, clave: { kty: "EC", crv: "P-256", x: "a", y: "b" }, vecinas: [] }))));
    expect(a?.e).toEqual({ kty: "EC", crv: "P-256", x: "a", y: "b" });
  });
});

describe("elección de ruta", () => {
  const rapido = { carril: "nativo", kbps: 20_000, rttMs: 8 };
  const ble = { carril: "ble", kbps: 150, rttMs: 90 };
  it("el directo gana siempre", () => {
    const d = elegirRuta([{ relevo: "B", tramos: [rapido, rapido] }, { relevo: null, tramos: [ble] }], null);
    expect(d.ruta?.relevo).toBeNull();
    expect(d.motivo).toBe("directo");
  });
  it("histéresis: un relevo algo mejor no desplaza al actual; uno claramente mejor sí", () => {
    const b = { relevo: "B", tramos: [ble, ble] };
    const casi = { relevo: "D", tramos: [ble, { ...ble, kbps: 170 }] };
    expect(costeRuta(casi)).toBeGreaterThan(costeRuta(b) * (1 - HISTERESIS));
    expect(elegirRuta([b, casi], { relevo: "B" }).motivo).toBe("se-mantiene");
    const mucho = { relevo: "D", tramos: [rapido, rapido] };
    const d = elegirRuta([b, mucho], { relevo: "B" });
    expect(d.ruta?.relevo).toBe("D");
    expect(d.motivo).toBe("mejor");
  });
  it("vetado o caído: la siguiente; sin nada: sin ruta", () => {
    const b = { relevo: "B", tramos: [ble, ble] };
    const d = { relevo: "D", tramos: [ble, ble] };
    expect(elegirRuta([b, d], { relevo: "B" }, new Set(["B"])).motivo).toBe("vetada");
    expect(elegirRuta([d], { relevo: "B" }).motivo).toBe("caida");
    expect(elegirRuta([], { relevo: "B" }).motivo).toBe("sin-ruta");
    expect(costeTramo({ carril: "ble", kbps: null, rttMs: null })).toBeGreaterThan(costeTramo({ carril: "nativo", kbps: null, rttMs: null }));
  });
});

describe("tramas y duplicados", () => {
  const base: TramaDatos = { t: T_DATOS, v: 1, id: "x", o: "A", d: "C", r: ["A"], ttl: MAX_SALTOS, k: "m", p: "{}" };
  it("rechaza rutas que no empiezan por el origen, ttl fuera de rango y rutas largas", () => {
    expect(leerTramaDatos(base)).not.toBeNull();
    expect(leerTramaDatos({ ...base, r: ["B"] })).toBeNull();
    expect(leerTramaDatos({ ...base, ttl: 9 })).toBeNull();
    expect(leerTramaDatos({ ...base, r: ["A", "B", "D", "E"] })).toBeNull();
  });
  it("VistosAcotados: una vez, con tope y edad", () => {
    const v = new VistosAcotados(2, 1000);
    expect(v.visto("a", 0)).toBe(false);
    expect(v.visto("a", 10)).toBe(true);
    v.visto("b", 20);
    v.visto("c", 30);
    expect(v.tamano).toBe(2);
    expect(v.visto("c", 2000)).toBe(false);
  });
});

describe("motor: A → B → C (misma cuenta)", () => {
  let red: RedPrueba;
  afterEach(() => red?.parar());

  it("un mensaje llega a C por B, una sola vez, con acuse sellado; B no ve el texto", async () => {
    red = new RedPrueba();
    const A = await red.neurona("A", "Mac");
    const B = await red.neurona("B", "Tableta");
    const C = await red.neurona("C", "Teléfono");
    red.unir("A", "B");
    red.unir("B", "C");
    await red.asentar();
    expect(A.motor.alcanza("C")?.relevo).toBe("B");
    const r = await A.motor.enviarMensaje("C", sobreDe("m1", "SECRETO-1"));
    expect(r.ok && r.confirmado).toBe(true);
    expect(r.relevo).toBe("B");
    expect(r.nombreRelevo).toBe("Tableta");
    expect(C.recibidos).toHaveLength(1);
    expect(C.recibidos[0].relevo).toBe("B");
    expect(JSON.stringify(B.relevadas)).not.toContain("SECRETO-1");
    expect(B.relevadas.length).toBeGreaterThan(0);
    // reenvío del mismo id (otro intento): se acusa otra vez y no se entrega dos veces
    const r2 = await A.motor.enviarMensaje("C", sobreDe("m1", "SECRETO-1"));
    expect(r2.ok).toBe(true);
    expect(C.recibidos).toHaveLength(1);
    expect(A.lineas.some((l) => l.startsWith("ruta destino=C de=- a=Tableta motivo=inicial"))).toBe(true);
  });

  it("sin clave «en vivo», la clave anunciada por la cuenta basta; un firmante falso se rechaza", async () => {
    red = new RedPrueba();
    red.clavesEnVivo = false;
    const A = await red.neurona("A");
    await red.neurona("B");
    const C = await red.neurona("C");
    red.unir("A", "B");
    red.unir("B", "C");
    await red.asentar(200);
    const r = await A.motor.enviarMensaje("C", sobreDe("m2", "hola"));
    expect(r.ok).toBe(true);
    expect(C.recibidos).toHaveLength(1);
    red.huellas.set("A", "id:otra-cuenta");
    const r3 = await A.motor.enviarMensaje("C", sobreDe("m3", "falso"), { plazoMs: 1500, esperaAcuseMs: 500 });
    expect(r3.ok).toBe(false);
    expect(C.recibidos).toHaveLength(1);
    expect(C.lineas.some((l) => l.startsWith("rechazado"))).toBe(true);
  });

  it("dos relevos: el mejor; si cae, sigue por el otro; si vuelve el directo, va directo", async () => {
    red = new RedPrueba();
    const A = await red.neurona("A");
    await red.neurona("B");
    await red.neurona("D");
    const C = await red.neurona("C");
    red.unir("A", "B", "nativo", 20_000, 8);
    red.unir("B", "C", "nativo", 20_000, 8);
    red.unir("A", "D", "ble", 120, 80);
    red.unir("D", "C", "ble", 120, 80);
    await red.asentar(200);
    expect(A.motor.alcanza("C")?.relevo).toBe("B");
    expect((await A.motor.enviarMensaje("C", sobreDe("m4a", "x"))).relevo).toBe("B");
    red.cortar("A", "B");
    expect(A.motor.alcanza("C")?.relevo).toBe("D");
    const r = await A.motor.enviarMensaje("C", sobreDe("m4", "x"));
    expect(r.relevo).toBe("D");
    expect(A.lineas.some((l) => /a=D motivo=caida/.test(l))).toBe(true);
    red.unir("A", "C", "nativo", 20_000, 8);
    await red.asentar(100);
    expect(A.motor.alcanza("C")?.relevo).toBeNull();
    expect(A.lineas.some((l) => /a=directo motivo=directo/.test(l))).toBe(true);
    expect(C.recibidos).toHaveLength(2);
  });

  it("sin nadie: espera y reanuda cuando vuelve el relevo", async () => {
    red = new RedPrueba();
    const A = await red.neurona("A");
    await red.neurona("B");
    const C = await red.neurona("C");
    red.unir("A", "B");
    red.unir("B", "C");
    await red.asentar();
    red.cortar("B", "C");
    const p = A.motor.enviarMensaje("C", sobreDe("m5", "x"), { plazoMs: 5000 });
    await espera(600);
    red.unir("B", "C");
    const r = await p;
    if (!r.ok) console.log(A.lineas.join("\n"), "\n--B\n", red.neuronas.get("B")!.lineas.join("\n"), "\n--C\n", C.lineas.join("\n"));
    expect(r.ok).toBe(true);
    expect(C.recibidos).toHaveLength(1);
    expect(A.lineas.some((l) => l.startsWith("en-espera"))).toBe(true);
    expect(A.lineas.some((l) => l.startsWith("reanuda"))).toBe(true);
  });

  it("un relevo que dice que no: negativa, veto y el otro", async () => {
    red = new RedPrueba();
    const A = await red.neurona("A");
    const B = await red.neurona("B");
    await red.neurona("D");
    const C = await red.neurona("C");
    red.unir("A", "B", "nativo", 20_000, 8);
    red.unir("B", "C", "nativo", 20_000, 8);
    red.unir("A", "D", "ble", 120, 80);
    red.unir("D", "C", "ble", 120, 80);
    await red.asentar(200);
    B.releva = { ok: false, motivo: "batería por debajo del mínimo" }; // aún anunciaba que sí
    const r = await A.motor.enviarMensaje("C", sobreDe("m6", "x"));
    expect(r.ok).toBe(true);
    expect(r.relevo).toBe("D");
    expect(B.motor.estadisticas().negativasDadas).toBeGreaterThanOrEqual(1); // y otra al acuse de C si C también probó por B
    expect(A.lineas.some((l) => l.startsWith("veto destino=C relevo=B"))).toBe(true);
    expect(C.recibidos).toHaveLength(1);
  });

  it("no se forma un bucle: una trama que ya pasó por el relevo se corta y un relevo nunca reenvía a otro relevo", async () => {
    red = new RedPrueba();
    const A = await red.neurona("A");
    const B = await red.neurona("B");
    const D = await red.neurona("D");
    await red.neurona("C");
    red.unir("A", "B");
    red.unir("B", "D");
    red.unir("D", "C");
    await red.asentar(200);
    // B no tiene carril con C (solo D lo tiene): A no tiene ruta (fase 1 = un relevo), B no reenvía a D.
    expect(A.motor.alcanza("C")).toBeNull();
    const t: TramaDatos = { t: T_DATOS, v: 1, id: "bucle", o: "A", d: "C", r: ["A", "B"], ttl: 1, k: "m", p: "{}" };
    red.enviar("D", "ble:D>B", JSON.stringify({ ...t, r: ["A", "B", "D"].slice(0, 2) }));
    await espera(50);
    expect(B.motor.estadisticas().bucles).toBe(1);
    const antes = red.tramas;
    const t2: TramaDatos = { t: T_DATOS, v: 1, id: "dos", o: "A", d: "C", r: ["A"], ttl: 2, k: "m", p: "{}" };
    red.enviar("A", "ble:A>B", JSON.stringify(t2));
    await espera(100);
    expect(B.motor.estadisticas().negativasDadas).toBe(1); // «no tengo carril directo con C»
    expect(D.motor.estadisticas().relevadas).toBe(0);
    expect(red.tramas - antes).toBeLessThanOrEqual(3);
  });
});

describe("transporte: crearEnviador con relevo", () => {
  const ble = (id: string, n: string): EnlaceDisponible => ({ id, tipo: "ble", etiqueta: n, alcanza: { neuronDeviceId: n }, abierto: true, sinInternet: true, admite: { mensaje: true, archivo: true, flujo: false } });
  function deps(lista: EnlaceDisponible[], relevo?: DepsEnvio["relevo"]): DepsEnvio {
    return {
      listar: async () => lista,
      enviarP2P: () => false,
      enviarRele: async () => ({ ok: false, detalle: "" }),
      enviarLora: async () => ({ ok: false, detalle: "" }),
      esperarAcuse: async () => false,
      nuevoId: () => "id-1",
      origen: () => ({}),
      enviarBle: async () => ({ ok: true, detalle: "acusado" }),
      ...(relevo ? { relevo } : {}),
    };
  }
  it("con carril directo no se toca el relevo", async () => {
    let llamado = false;
    const env = crearEnviador(deps([ble("ble:b1", "C")], async () => {
      llamado = true;
      return null;
    }));
    const r = await env({ neuronDeviceId: "C" }, "nota", { x: 1 });
    expect(r.enlace?.id).toBe("ble:b1");
    expect(llamado).toBe(false);
  });
  it("sin carril directo va por relevo y lo dice", async () => {
    const env = crearEnviador(
      deps([ble("ble:b1", "B")], async () => ({ ok: true, confirmado: true, enlace: { id: "relevo:B", tipo: "ble", etiqueta: "por relevo de Tableta" }, relevo: { neurona: "B", nombre: "Tableta" }, detalle: "ok" })),
    );
    const r = await env({ neuronDeviceId: "C" }, "nota", { x: 1 });
    expect(r.ok && r.confirmado).toBe(true);
    expect(r.enlace?.etiqueta).toBe("por relevo de Tableta");
    expect(r.relevo?.nombre).toBe("Tableta");
  });
  it("sin dependencia de relevo, como antes", async () => {
    const r = await crearEnviador(deps([ble("ble:b1", "B")]))({ neuronDeviceId: "C" }, "nota", {});
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("Ningún enlace abierto llega a ese destino.");
  });
});

describe("sellarMensaje / abrirMensaje", () => {
  it("un relevo con su propia clave no lo abre", async () => {
    const red = new RedPrueba();
    const A = await red.neurona("A");
    await red.neurona("B");
    await red.neurona("C");
    red.unir("A", "B");
    red.unir("B", "C");
    await red.asentar();
    const B = red.neuronas.get("B")!;
    const r = await A.motor.enviarMensaje("C", sobreDe("m7", "PRIVADO"));
    expect(r.ok).toBe(true);
    const t = B.relevadas.find((x) => x.k === "m")!;
    // B intenta abrirlo como si fuera para ella: no puede.
    const criptoB = { cifrar: async () => null, abrir: async () => null, firmar: async () => null, verificar: async () => false };
    expect(await abrirMensaje(criptoB, { ...t, d: "B" }, "B")).toBeNull();
    expect(await sellarMensaje(criptoB, A.pub, "A", "C", sobreDe("m8", "x"))).toBeNull();
    red.parar();
  });
});
