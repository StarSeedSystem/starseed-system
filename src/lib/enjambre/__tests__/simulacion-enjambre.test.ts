/**
 * Simulación determinista del Enjambre (ENJ1110A). Red en memoria con tiempo virtual (ver red-simulada.ts):
 * sesiones reales de `SesionEnjambre` hablándose por enlaces con capacidad y latencia, sin temporizadores reales.
 * Las líneas «SIM:» del registro dejan las cifras que cita el contrato.
 */

import { describe, expect, it } from "vitest";
import {
  AlmacenCanales,
  AlmacenMemoria,
  FuenteEspejo,
  cargarContenido,
  capaDePiezas,
  crearClaveSellado,
  crearFirmante,
  crearSecretoEnjambre,
  crearSemillaDeBytes,
  crearVerificador,
  firmarCanal,
  formatearIman,
  generarParFirma,
  geometriaDeSemilla,
  idEnjambre,
  parsearIman,
  sellarTodo,
  semillaMinima,
} from "../index";
import { RedSim, bytesDePrueba, iguales, type Nodo } from "./red-simulada";

const U = 64 * 1024;
const LAN = { via: "lan", kbps: 20_000, latMs: 2 };
const BT = { via: "bt", kbps: 300, latMs: 40 };

async function publico(n: number, semilla = 3) {
  const claro = bytesDePrueba(n, semilla);
  const r = (await crearSemillaDeBytes(claro, { ambito: "publico", nombre: "v.bin", mime: "application/octet-stream", tamanoPieza: U, creada: 1 }))!;
  return { claro, semilla: r.semilla, arbol: r.arbol };
}

type Contenido = Awaited<ReturnType<typeof publico>>;

async function sembradora(red: RedSim, id: string, c: Contenido, extra: Record<string, unknown> = {}): Promise<Nodo> {
  const al = new AlmacenMemoria();
  expect(await cargarContenido(al, c.semilla, c.claro)).toBe(true);
  return red.nodo(id, { semilla: c.semilla, ...extra } as never, al);
}

function corromper(b64: string): string {
  return (b64[0] === "A" ? "B" : "A") + b64.slice(1);
}

function bytesDe(red: RedSim, prefijo: string): number {
  let t = 0;
  for (const [k, v] of red.bytesPorVia) if (k.startsWith(prefijo)) t += v;
  return t;
}

describe("simulación: 1 sembradora + 4 recolectoras con vías mezcladas", () => {
  it("todas completan verificadas aunque una se vaya a mitad y otra mande un trozo corrupto; la mala queda golpeada", async () => {
    const c = await publico(1 << 20);
    const red = new RedSim();
    await sembradora(red, "sem", c);
    const ids = ["rec1", "rec2", "rec3", "rec4"];
    for (const id of ids) await red.nodo(id, { semilla: c.semilla });
    red.nodos.get("rec4")!.interceptar = (m) => (m.t === "enj.trozo" ? { ...m, d: corromper(m.d as string) } : m);
    // rec3 está al otro lado de un Bluetooth lento; con los demás tiene también red local.
    red.enlazar("sem", "rec1", [LAN]);
    red.enlazar("sem", "rec2", [LAN]);
    red.enlazar("sem", "rec3", [BT]);
    red.enlazar("sem", "rec4", [LAN]);
    red.enlazar("rec1", "rec2", [LAN]);
    red.enlazar("rec1", "rec3", [BT, LAN]);
    red.enlazar("rec1", "rec4", [LAN]);
    red.enlazar("rec2", "rec3", [BT, LAN]);
    red.enlazar("rec2", "rec4", [LAN]);
    red.enlazar("rec3", "rec4", [BT, LAN]);
    red.en(300, () => red.matar("rec2"));
    const vivas = ["rec1", "rec3", "rec4"].map((i) => red.nodos.get(i)!);
    const t = await red.correr(120_000, () => vivas.every((n) => n.sesion!.completo));
    for (const n of vivas) {
      expect(n.sesion!.completo).toBe(true);
      expect(iguales(await n.sesion!.contenido(), c.claro)).toBe(true);
    }
    const golpesRec4 = vivas.filter((n) => n.id !== "rec4").reduce((s, n) => s + (n.sesion!.resumen().golpes["rec4"] ?? 0), 0);
    expect(golpesRec4).toBeGreaterThan(0);
    // el Bluetooth no lleva el grueso: rec3 recibe más por la red local que por Bluetooth
    const btHaciaRec3 = bytesDe(red, "sem>rec3:bt") + bytesDe(red, "rec1>rec3:bt") + bytesDe(red, "rec4>rec3:bt");
    const lanHaciaRec3 = bytesDe(red, "rec1>rec3:lan") + bytesDe(red, "rec4>rec3:lan");
    expect(lanHaciaRec3).toBeGreaterThan(btHaciaRec3);
    console.log(`SIM: 4 recolectoras (1 se va, 1 corrupta) completas en ${t} ms virtuales; golpes a la corrupta=${golpesRec4}; hacia rec3 por LAN=${lanHaciaRec3} B, por Bluetooth=${btHaciaRec3} B`);
  });

  it("es determinista: dos ejecuciones dan los mismos tiempos y bytes", async () => {
    const c = await publico(512 * 1024, 5);
    const una = async () => {
      const red = new RedSim();
      await sembradora(red, "sem", c);
      for (const id of ["a", "b"]) await red.nodo(id, { semilla: c.semilla });
      red.enlazar("sem", "a", [LAN]);
      red.enlazar("sem", "b", [BT]);
      red.enlazar("a", "b", [LAN]);
      const t = await red.correr(60_000, () => red.nodos.get("a")!.sesion!.completo && red.nodos.get("b")!.sesion!.completo);
      return `${t}|${bytesDe(red, "sem>")}|${bytesDe(red, "a>")}`;
    };
    expect(await una()).toBe(await una());
  });
});

describe("simulación: super-siembra frente a siembra ingenua", () => {
  async function envio(super_: boolean) {
    const c = await publico(1 << 20, 9);
    const red = new RedSim();
    const origen = await sembradora(red, "origen", c, super_ ? { superSiembra: { paresEsperados: 4, ofertaInicial: 2, maxPendientes: 2 } } : {});
    const ids = ["g1", "g2", "g3", "g4"];
    for (const id of ids) await red.nodo(id, { semilla: c.semilla });
    for (const id of ids) red.enlazar("origen", id, [{ via: "lan", kbps: 4000, latMs: 2 }]);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) red.enlazar(ids[i], ids[j], [LAN]);
    const t = await red.correr(120_000, () => ids.every((i) => red.nodos.get(i)!.sesion!.completo));
    for (const i of ids) expect(iguales(await red.nodos.get(i)!.sesion!.contenido(), c.claro)).toBe(true);
    return { t, subidos: origen.sesion!.bytesSubidos, enviados: origen.enviados };
  }

  it("el origen sube menos bytes con super-siembra y todas completan", async () => {
    const ingenua = await envio(false);
    const sup = await envio(true);
    console.log(`SIM: grupo de 4 sobre 1 MiB — ingenua: origen sube ${ingenua.subidos} B de trozos (${(ingenua.subidos / (1 << 20)).toFixed(2)}x) en ${ingenua.t} ms; super-siembra: ${sup.subidos} B (${(sup.subidos / (1 << 20)).toFixed(2)}x) en ${sup.t} ms`);
    expect(sup.subidos).toBeLessThan(ingenua.subidos);
    expect(sup.subidos).toBeLessThan(2 * (1 << 20));
  });
});

describe("simulación: modo secuencial (ver mientras se baja)", () => {
  async function corre(modo: "secuencial" | "raro-primero") {
    const c = await publico(2 << 20, 21);
    const red = new RedSim();
    await sembradora(red, "sem", c);
    const ritmo = 96 * 1024; // B/s a los que se reproduce
    const v = await red.nodo("ver", { semilla: c.semilla, modo, ventana: 4, ritmoBps: ritmo });
    red.enlazar("sem", "ver", [{ via: "lan", kbps: 3000, latMs: 20 }]);
    const g = geometriaDeSemilla(c.semilla)!;
    const adelante: number[] = [];
    for (let t = 250; t <= 4000; t += 250) {
      red.en(t, () => {
        const cursor = Math.min(g.nPiezas - 1, Math.floor((t * ritmo) / 1000 / U));
        v.sesion!.plan.reproduciendo(cursor, t);
        let k = 0;
        while (cursor + k < g.nPiezas && v.sesion!.plan.tiene(cursor + k)) k++;
        adelante.push(k);
      });
    }
    await red.correr(4001);
    return adelante;
  }

  it("la ventana de reproducción va siempre por delante; raro-primero no lo garantiza", async () => {
    const seq = await corre("secuencial");
    const raro = await corre("raro-primero");
    console.log(`SIM: trozos contiguos por delante del cursor cada 250 ms — secuencial=[${seq.join(",")}] raro-primero=[${raro.join(",")}]`);
    expect(seq.length).toBeGreaterThan(10);
    expect(Math.min(...seq.slice(3))).toBeGreaterThanOrEqual(2); // nunca se queda sin lo siguiente que va a reproducir
    expect(seq.reduce((a, b) => a + b, 0)).toBeGreaterThan(raro.reduce((a, b) => a + b, 0));
  });
});

describe("simulación: ámbito privado con relé ciego", () => {
  it("el relé re-siembra texto cifrado que no puede leer, un miembro lo abre desde el relé y un ajeno ni reconoce el enjambre", async () => {
    const claro = new TextEncoder().encode("SECRETO-PRIVADO ".repeat(20_000));
    const clave = (await crearClaveSellado())!;
    const secreto = crearSecretoEnjambre();
    const cifrado = (await sellarTodo(clave, claro, U))!;
    const marca = new TextEncoder().encode("SECRETO-PRIVADO");
    expect(Buffer.from(cifrado).includes(Buffer.from(marca))).toBe(false);
    const { semilla } = (await crearSemillaDeBytes(cifrado, { ambito: "privado", tamanoPieza: U, creada: 1 }))!;
    const red = new RedSim();
    const al = new AlmacenMemoria();
    expect(await cargarContenido(al, semilla, cifrado)).toBe(true);
    const origen = await red.nodo("origen", { semilla, secreto, clave }, al);
    // el relé: no tiene la clave, solo el id del enjambre; acepta hacer de relé ciego
    const rele = await red.nodo("rele", {
      semilla,
      secreto,
      clave: null,
      ajustes: { ...(await import("../index")).AJUSTES_ENJAMBRE_POR_DEFECTO, relevoCiego: true },
      relacionDe: () => "por-id",
    });
    const ajeno = await red.nodo("ajeno", { semilla }); // sin secreto: su id de enjambre es otro
    red.enlazar("origen", "rele", [LAN]);
    red.enlazar("origen", "ajeno", [LAN]);
    await red.correr(60_000, () => rele.sesion!.completo);
    expect(rele.sesion!.completo).toBe(true);
    expect(await rele.sesion!.contenido()).toBeNull(); // no puede leer
    expect(iguales(await rele.sesion!.flujo(), cifrado)).toBe(true); // pero lo guarda y lo puede dar
    expect(ajeno.sesion!.completo).toBe(false);
    expect(ajeno.sesion!.id).not.toBe(origen.sesion!.id);
    expect(origen.sesion!.id).not.toBe(await idEnjambre(semilla.raiz, null));
    expect(origen.sesion!.id).not.toBe(semilla.raiz);
    // el origen se apaga; un miembro llega después y solo habla con el relé
    red.matar("origen");
    const miembro = await red.nodo("miembro", { semilla, secreto, clave });
    red.enlazar("rele", "miembro", [LAN]);
    await red.correr(120_000, () => miembro.sesion!.completo);
    expect(miembro.sesion!.completo).toBe(true);
    expect(iguales(await miembro.sesion!.contenido(), claro)).toBe(true);
    // nada de lo que viajó delata el texto claro ni la raíz en claro
    const todo = red.trafico.map((t) => t.json).join("");
    expect(todo.includes(semilla.raiz)).toBe(false);
    expect(todo.includes("SECRETO")).toBe(false);
    console.log(`SIM: privado — relé ciego completo (no lee), miembro abre el contenido desde el relé con el origen caído; ${red.trafico.length} mensajes, ninguno con la raíz ni el claro`);
  });
});

describe("simulación: canales firmados por el enjambre", () => {
  it("se difunde la secuencia más nueva y se ignoran la antigua y la firma mala", async () => {
    const c = await publico(128 * 1024, 31);
    const par = await generarParFirma();
    const firmar = crearFirmante(par);
    const fp = (await firmar(new Uint8Array(1)))!.fp;
    const verificar = crearVerificador();
    const reloj = () => 10_000;
    const red = new RedSim();
    const mk = async (id: string) => red.nodo(id, { semilla: c.semilla, canales: new AlmacenCanales(verificar, reloj), verificar });
    const a = await mk("ca");
    const b = await mk("cb");
    const d = await mk("cd");
    red.enlazar("ca", "cb", [LAN]);
    red.enlazar("cb", "cd", [LAN]); // ca y cd no se ven: el registro pasa por cb
    const R1 = "11".repeat(32);
    const R2 = "22".repeat(32);
    const r1 = (await firmarCanal(fp, { nombre: "android/ultima", seq: 1, raiz: R1, tamano: 100, ts: 1000, ambito: "publico" }, firmar))!;
    const r2 = (await firmarCanal(fp, { nombre: "android/ultima", seq: 2, raiz: R2, tamano: 100, ts: 2000, ambito: "publico" }, firmar))!;
    expect(await a.sesion!.publicarCanal(r2)).toBe("nuevo");
    await red.correr(2000);
    expect(d.sesion!.canales!.actual(fp, "android/ultima")!.raiz).toBe(R2);
    // reenvío de la versión vieja (repetición) y de una con la raíz cambiada
    expect(await b.sesion!.publicarCanal(r1)).toBe("viejo");
    expect(await b.sesion!.publicarCanal({ ...r2, seq: 3, raiz: R1 })).toBe("firma-mala");
    await red.correr(4000);
    for (const n of [a, b, d]) expect(n.sesion!.canales!.actual(fp, "android/ultima")!.seq).toBe(2);
  });
});

describe("simulación: arrancar solo con un imán", () => {
  it("un imán basta: la capa de piezas se pide a los pares y todo se verifica contra la raíz", async () => {
    const c = await publico(700_000, 41);
    const imanTexto = formatearIman({ raiz: c.semilla.raiz, nombre: "v.bin", tamano: c.semilla.tamano, ambito: "publico", espejos: [], rastreadores: [], tamanoPieza: U })!;
    expect(imanTexto.startsWith("starseed:?xt=urn:ss256:")).toBe(true);
    const im = parsearIman(imanTexto)!;
    expect(im.raiz).toBe(c.semilla.raiz);
    const minima = semillaMinima(im.raiz, im.tamano!, im.ambito!, im.nombre, im.tamanoPieza)!;
    const red = new RedSim();
    await sembradora(red, "sem", c);
    const r = await red.nodo("rec", { semilla: minima });
    red.enlazar("sem", "rec", [LAN]);
    await red.correr(60_000, () => r.sesion!.completo);
    expect(r.sesion!.completo).toBe(true);
    expect(r.sesion!.capaCompletaYa).toBe(true);
    expect(iguales(await r.sesion!.contenido(), c.claro)).toBe(true);
  });

  it("rechaza imanes hostiles", () => {
    const raiz = "ab".repeat(32);
    const malos = [
      "",
      "magnet:?xt=urn:btih:abc",
      "starseed:?",
      `starseed:?xt=urn:ss256:${raiz}&xt=urn:ss256:${raiz}`,
      `starseed:?xt=urn:ss256:${"zz".repeat(32)}`,
      `starseed:?xt=urn:ss256:${raiz}&es=javascript:alert(1)`,
      `starseed:?xt=urn:ss256:${raiz}&es=http://127.0.0.1/x`,
      `starseed:?xt=urn:ss256:${raiz}&k=clave-secreta`,
      `starseed:?xt=urn:ss256:${raiz}&dn=%00x`,
      `starseed:?xt=urn:ss256:${raiz}&xl=-5`,
      `starseed:?xt=urn:ss256:${raiz}&am=cualquiera`,
      `starseed:?xt=urn:ss256:${raiz}&dn=${"a".repeat(3000)}`,
      `starseed:?xt=urn:ss256:${raiz}&dn=%E2%80%AEfdp.exe`,
    ];
    for (const m of malos) expect(parsearIman(m), m.slice(0, 60)).toBeNull();
    expect(parsearIman(null)).toBeNull();
    expect(parsearIman({})).toBeNull();
  });
});

describe("simulación: espejo y pares a la vez", () => {
  async function conEspejo(corrompe: boolean) {
    const c = await publico(1 << 20, 51);
    const g = geometriaDeSemilla(c.semilla)!;
    const capa = new Uint8Array(g.nPiezas * 32);
    capaDePiezas(c.arbol, g).forEach((h, i) => capa.set(h, i * 32));
    const red = new RedSim();
    await sembradora(red, "sem", c);
    const http = red.espejoHttp(c.claro, { kbps: 6000, latMs: 30, corromper: corrompe, capa });
    const fuente = new FuenteEspejo("https://espejo.ejemplo/v.bin", http, c.claro.length);
    const r = await red.nodo("rec", { semilla: c.semilla, espejos: [fuente] });
    red.enlazar("sem", "rec", [{ via: "lan", kbps: 2000, latMs: 10 }]);
    const t = await red.correr(120_000, () => r.sesion!.completo);
    return { r, fuente, http, t, c };
  }

  it("los trozos llegan de los dos orígenes y se verifican igual", async () => {
    const { r, http, t, c } = await conEspejo(false);
    expect(r.sesion!.completo).toBe(true);
    expect(iguales(await r.sesion!.contenido(), c.claro)).toBe(true);
    const f = r.sesion!.resumen().porFuente;
    expect(f["sem"]).toBeGreaterThan(0);
    expect(f["espejo:0"]).toBeGreaterThan(0);
    console.log(`SIM: espejo+par — completo en ${t} ms; del par ${f["sem"]} B, del espejo ${f["espejo:0"]} B (${http.peticiones()} peticiones Range)`);
  });

  it("un espejo que miente se descarta y la descarga termina con el par", async () => {
    const { r, fuente, c } = await conEspejo(true);
    expect(r.sesion!.completo).toBe(true);
    expect(iguales(await r.sesion!.contenido(), c.claro)).toBe(true);
    expect(fuente.vivo).toBe(false);
    expect(r.sesion!.resumen().porFuente["espejo:0"] ?? 0).toBe(0);
  });
});
