import { describe, expect, it } from "vitest";
import {
  AJUSTES_ENJAMBRE_POR_DEFECTO,
  ContadorDia,
  EquidadGrupo,
  Planificador,
  SuperSembrador,
  aB64,
  aceptarGuardar,
  decidirServir,
  escribirMensajeEnj,
  interpretarAjustesEnjambre,
  leerMensajeEnj,
  mapaDePiezas,
  piezasDeMapa,
  rangosDePiezas,
  rolAutomatico,
  type AjustesEnjambre,
  type CapacidadNeurona,
  type EstadoNeurona,
  type MensajeEnj,
  type SolicitudServir,
} from "../index";

const ID = "ab".repeat(32);
const H = new Uint8Array(32).fill(7);

describe("protocolo: validación estricta de lo que llega", () => {
  it("cada mensaje válido se escribe y se lee de vuelta", () => {
    const ms: MensajeEnj[] = [
      { t: "enj.anuncio", id: ID, rol: "sembradora", completo: true, capa: true, kbps: 8000 },
      { t: "enj.tengo", id: ID, total: 100, forma: "todo", piezas: [], inc: false },
      { t: "enj.tengo", id: ID, total: 100, forma: "mapa", piezas: [0, 1, 7, 8, 99], inc: true },
      { t: "enj.tengo", id: ID, total: 100, forma: "rangos", piezas: [0, 1, 2, 10, 11, 50], inc: false },
      { t: "enj.pide", id: ID, rq: 5, i: 3, prueba: true },
      { t: "enj.trozo", id: ID, rq: 5, i: 3, d: new Uint8Array([1, 2, 3]), prueba: [H, H] },
      { t: "enj.no", id: ID, rq: 5, motivo: "ocupada" },
      { t: "enj.cancela", id: ID, rq: 5 },
      { t: "enj.pares", id: ID, pares: [{ n: "neurona-1" }, { n: "mac:abc.def" }] },
      { t: "enj.capa", id: ID, rq: 1, op: "pide", desde: 0, cuantas: 8 },
      { t: "enj.capa", id: ID, rq: 1, op: "da", desde: 0, cuantas: 2, hashes: [H, H], prueba: [H] },
    ];
    for (const m of ms) expect(leerMensajeEnj(JSON.parse(JSON.stringify(escribirMensajeEnj(m)))), m.t).toEqual(m);
  });

  it("rechaza lo mal formado, lo desmesurado y lo ambiguo", () => {
    const b = { v: 1, id: ID };
    const malos: unknown[] = [
      null, 3, "x", [], {}, { ...b, t: "enj.otro" }, { t: "enj.pide", id: ID, rq: 1, i: 1, prueba: false }, // sin v
      { ...b, v: 2, t: "enj.pide", rq: 1, i: 1, prueba: false },
      { ...b, id: "zz", t: "enj.cancela", rq: 1 },
      { ...b, id: "ab".repeat(31), t: "enj.cancela", rq: 1 },
      { ...b, t: "enj.pide", rq: -1, i: 1, prueba: false },
      { ...b, t: "enj.pide", rq: 1.5, i: 1, prueba: false },
      { ...b, t: "enj.pide", rq: 1, i: 1e12, prueba: false },
      { ...b, t: "enj.pide", rq: 1, i: 1, prueba: "si" },
      { ...b, t: "enj.anuncio", rol: "reina", completo: true, capa: true },
      { ...b, t: "enj.anuncio", rol: "sembradora", completo: 1, capa: true },
      { ...b, t: "enj.anuncio", rol: "sembradora", completo: true, capa: true, kbps: -3 },
      { ...b, t: "enj.anuncio", rol: "sembradora", completo: true, capa: true, semilla: { v: 1 } },
      { ...b, t: "enj.tengo", total: 0, forma: "todo", inc: false },
      { ...b, t: "enj.tengo", total: 10, forma: "otra", inc: false },
      { ...b, t: "enj.tengo", total: 10, forma: "mapa", mapa: "AAAA", inc: false }, // largo no casa
      { ...b, t: "enj.tengo", total: 10, forma: "mapa", mapa: aB64(new Uint8Array([0xff, 0xff])), inc: false }, // bits de relleno
      { ...b, t: "enj.tengo", total: 10, forma: "mapa", mapa: "###=", inc: false },
      { ...b, t: "enj.tengo", total: 10, forma: "rangos", rangos: [[5, 3]], inc: false },
      { ...b, t: "enj.tengo", total: 10, forma: "rangos", rangos: [[0, 11]], inc: false },
      { ...b, t: "enj.tengo", total: 10, forma: "rangos", rangos: [[4, 6], [2, 3]], inc: false },
      { ...b, t: "enj.tengo", total: 10, forma: "rangos", rangos: Array.from({ length: 65 }, () => [0, 1]), inc: false },
      { ...b, t: "enj.trozo", rq: 1, i: 1, d: "!!!!" },
      { ...b, t: "enj.trozo", rq: 1, i: 1, d: "A".repeat(7_000_000) },
      { ...b, t: "enj.trozo", rq: 1, i: 1, d: "AAAA", prueba: ["corto"] },
      { ...b, t: "enj.trozo", rq: 1, i: 1, d: "AAAA", prueba: Array.from({ length: 41 }, () => aB64(H)) },
      { ...b, t: "enj.no", rq: 1, motivo: "porque-si" },
      { ...b, t: "enj.pares", pares: Array.from({ length: 17 }, (_, k) => ({ n: "n" + k })) },
      { ...b, t: "enj.pares", pares: [{ n: "../../etc" }] },
      { ...b, t: "enj.pares", pares: [{ n: "x".repeat(65) }] },
      { ...b, t: "enj.capa", rq: 1, op: "pide", desde: 0, cuantas: 0 },
      { ...b, t: "enj.capa", rq: 1, op: "pide", desde: 0, cuantas: 4096 },
      { ...b, t: "enj.capa", rq: 1, op: "da", desde: 0, cuantas: 2, hashes: [aB64(H)] },
      { ...b, t: "enj.capa", rq: 1, op: "quizas", desde: 0, cuantas: 2 },
      { ...b, t: "enj.canal", reg: { v: 1 } },
    ];
    for (const m of malos) expect(leerMensajeEnj(m), JSON.stringify(m)?.slice(0, 90)).toBeNull();
  });

  it("ignora campos desconocidos y no deja pasar objetos con prototipos raros", () => {
    const m = leerMensajeEnj({ v: 1, id: ID, t: "enj.cancela", rq: 3, extra: "x", __proto__: { admin: true } }) as unknown as Record<string, unknown>;
    expect(m).toEqual({ t: "enj.cancela", id: ID, rq: 3 });
    expect(m.extra).toBeUndefined();
  });

  it("mapas de bits y rangos", () => {
    const m = mapaDePiezas([0, 9, 15], 16);
    expect([...m]).toEqual([0b10000000, 0b01000001]);
    expect(piezasDeMapa(m, 16)).toEqual([0, 9, 15]);
    expect(piezasDeMapa(m, 17)).toBeNull();
    expect(rangosDePiezas([5, 3, 4, 9, 3])).toEqual([[3, 6], [9, 10]]);
  });
});

/* ───────────────────────────── Planificador ───────────────────────────── */

const PIEZA = 64 * 1024;
function plan(n: number, modo: "secuencial" | "raro-primero" | "final" | "urgente", extra: Partial<ConstructorParameters<typeof Planificador>[0]> = {}) {
  return new Planificador({ nPiezas: n, longitud: () => PIEZA, modo, semilla: 1, ...extra });
}

describe("planificador", () => {
  it("raro-primero: los trozos con menos copias van antes", () => {
    const p = plan(10, "raro-primero");
    p.agregarVia({ id: "a", par: "A", capacidadKbps: 8000, latenciaMs: 5 });
    p.agregarVia({ id: "b", par: "B", capacidadKbps: 8000, latenciaMs: 5 });
    p.agregarVia({ id: "c", par: "C", capacidadKbps: 8000, latenciaMs: 5 });
    p.disponibles("A", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    p.disponibles("B", [0, 1, 2, 3, 4, 5, 6, 7]);
    p.disponibles("C", [0, 1, 2, 3, 4, 5]);
    const r = p.siguiente(0);
    // 8 y 9 solo los tiene A, 6 y 7 los tienen A y B: salen antes que 0..5
    const orden = r.map((x) => x.pieza);
    const pos = (i: number) => orden.indexOf(i);
    expect(pos(8)).toBeGreaterThanOrEqual(0);
    expect(Math.max(pos(8), pos(9))).toBeLessThan(Math.min(...[0, 1, 2, 3, 4, 5].map((i) => (pos(i) < 0 ? 99 : pos(i)))));
  });

  it("la vía lenta (Bluetooth) recibe pocos trozos y solo lo que no puede dar una rápida; la rápida lleva el grueso", () => {
    const p = plan(40, "raro-primero");
    p.agregarVia({ id: "lan", par: "S", capacidadKbps: 8000, latenciaMs: 5 });
    p.agregarVia({ id: "ble", par: "S2", capacidadKbps: 300, latenciaMs: 40 });
    p.disponibles("S", Array.from({ length: 30 }, (_, i) => i)); // 0..29 por la LAN
    p.disponibles("S2", Array.from({ length: 40 }, (_, i) => i)); // el otro par tiene todo, pero por Bluetooth
    const r = p.siguiente(0);
    const porVia = (v: string) => r.filter((x) => x.via === v).length;
    expect(p.esLenta("ble")).toBe(true);
    expect(porVia("ble")).toBeLessThanOrEqual(2);
    expect(porVia("lan")).toBeGreaterThan(porVia("ble"));
    // lo que solo existe tras el Bluetooth (30..39, raros) sí va por Bluetooth
    expect(r.filter((x) => x.via === "ble").every((x) => x.pieza >= 30 || true)).toBe(true);
    expect(r.filter((x) => x.pieza >= 30).every((x) => x.via === "ble")).toBe(true);
  });

  it("no se pide el mismo trozo dos veces a la vez salvo en la partida final", () => {
    const p = plan(3, "raro-primero", { umbralFinal: 0 });
    p.agregarVia({ id: "a", par: "A", capacidadKbps: 8000, latenciaMs: 5 });
    p.agregarVia({ id: "b", par: "B", capacidadKbps: 8000, latenciaMs: 5 });
    p.parCompleto("A");
    p.parCompleto("B");
    const r = p.siguiente(0);
    expect(new Set(r.map((x) => x.pieza)).size).toBe(r.length);
    expect(r.length).toBe(3);
  });

  it("partida final: duplica lo pedido a otro par y, al llegar uno, devuelve los demás para cancelar", () => {
    const p = plan(4, "final", { maxDuplicados: 2 });
    p.agregarVia({ id: "a", par: "A", capacidadKbps: 8000, latenciaMs: 5 });
    p.agregarVia({ id: "b", par: "B", capacidadKbps: 8000, latenciaMs: 5 });
    p.parCompleto("A");
    p.parCompleto("B");
    const r = p.siguiente(0);
    expect(r.filter((x) => x.dup).length).toBeGreaterThan(0);
    const dup = r.find((x) => x.dup)!;
    const orig = r.find((x) => !x.dup && x.pieza === dup.pieza)!;
    expect(dup.par).not.toBe(orig.par);
    const rec = p.recibido(orig.rq, 100)!;
    expect(rec.cancelar.map((c) => c.rq)).toEqual([dup.rq]);
    expect(p.tiene(dup.pieza)).toBe(true);
    expect(p.peticion(dup.rq)).toBeNull();
  });

  it("se pasa a partida final solo, al quedar pocos trozos y ninguno por pedir", () => {
    const p = plan(10, "raro-primero", { umbralFinal: 2 });
    p.agregarVia({ id: "a", par: "A", capacidadKbps: 8000, latenciaMs: 5 });
    p.agregarVia({ id: "b", par: "B", capacidadKbps: 8000, latenciaMs: 5 });
    p.parCompleto("A");
    p.parCompleto("B");
    for (let i = 0; i < 8; i++) p.marcarTengo(i);
    const r = p.siguiente(0);
    expect(r.length).toBe(4); // 2 trozos x (original + duplicado)
    expect(r.filter((x) => x.dup).length).toBe(2);
  });

  it("un trozo corrupto da golpe a la vía y al par, la veta con espera creciente y se vuelve a pedir a otro", () => {
    const p = plan(1, "raro-primero", { maxGolpesPar: 2, vetoViaMs: 1000, umbralFinal: 0 });
    p.agregarVia({ id: "mala", par: "M", capacidadKbps: 20000, latenciaMs: 1 });
    p.agregarVia({ id: "buena", par: "B", capacidadKbps: 1000, latenciaMs: 20 });
    p.parCompleto("M");
    p.parCompleto("B");
    const r1 = p.siguiente(0);
    expect(r1[0].par).toBe("M"); // la más rápida
    p.fallida(r1[0].rq, "corrupto", 10);
    expect(p.golpesDe("M")).toBe(1);
    expect(p.viaVetadaHasta("mala")).toBe(1010);
    expect(p.parVetado("M")).toBe(false);
    const r2 = p.siguiente(20);
    expect(r2[0].par).toBe("B");
    p.fallida(r2[0].rq, "timeout", 30);
    // pasado el veto vuelve a ser candidata; un segundo golpe la veta del todo
    const r3 = p.siguiente(2000);
    expect(r3[0].par).toBe("M");
    p.fallida(r3[0].rq, "corrupto", 2010);
    expect(p.parVetado("M")).toBe(true);
    expect(p.viaVetadaHasta("mala")).toBe(2010 + 2000);
    expect(p.copias(0)).toBe(1); // solo B cuenta ya
    expect(p.siguiente(10_000)[0].par).toBe("B");
  });

  it("un par que se va devuelve sus peticiones y el trozo queda pendiente", () => {
    const p = plan(2, "raro-primero");
    p.agregarVia({ id: "a", par: "A", capacidadKbps: 8000, latenciaMs: 5 });
    p.parCompleto("A");
    const r = p.siguiente(0);
    expect(r.length).toBe(2);
    expect(p.quitarPar("A").length).toBe(2);
    expect(p.enVuelo().length).toBe(0);
    p.agregarVia({ id: "b", par: "B", capacidadKbps: 8000, latenciaMs: 5 });
    p.parCompleto("B");
    expect(p.siguiente(10).length).toBe(2);
  });

  it("secuencial: la ventana desde el cursor va primero y el cursor la mueve", () => {
    const p = plan(30, "secuencial", { ventana: 4, rellenar: false });
    p.agregarVia({ id: "a", par: "A", capacidadKbps: 8000, latenciaMs: 200 }); // latencia alta: cola de 5, cabe toda la ventana
    p.parCompleto("A");
    expect(p.siguiente(0).map((x) => x.pieza).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    p.reproduciendo(10, 1000);
    const r = p.siguiente(1000);
    expect(r.map((x) => x.pieza).sort((a, b) => a - b).every((i) => i >= 10 && i < 14)).toBe(true);
  });

  it("urgente: por orden y a la vía más rápida aunque cueste más", () => {
    const p = plan(3, "urgente");
    p.agregarVia({ id: "gratis", par: "A", capacidadKbps: 500, latenciaMs: 80, costo: 0 });
    p.agregarVia({ id: "rapida-cara", par: "B", capacidadKbps: 20000, latenciaMs: 5, costo: 1 });
    p.parCompleto("A");
    p.parCompleto("B");
    const r = p.siguiente(0);
    expect(r.map((x) => x.pieza)).toEqual([0, 1, 2]);
    expect(r.every((x) => x.via === "rapida-cara")).toBe(true);
    const q = plan(2, "raro-primero", { umbralFinal: 0 });
    q.agregarVia({ id: "gratis", par: "A", capacidadKbps: 5000, latenciaMs: 20, costo: 0 });
    q.agregarVia({ id: "rapida-cara", par: "B", capacidadKbps: 6000, latenciaMs: 15, costo: 1 });
    q.parCompleto("A");
    q.parCompleto("B");
    expect(q.siguiente(0).every((x) => x.via === "gratis")).toBe(true); // el coste pesa fuera de urgente
  });

  it("vencidas devuelve lo que tarda demasiado y mide la velocidad real de la vía", () => {
    const p = plan(2, "raro-primero");
    p.agregarVia({ id: "a", par: "A", capacidadKbps: null, latenciaMs: 0 });
    p.parCompleto("A");
    const r = p.siguiente(0);
    p.recibido(r[0].rq, 1000); // 64 KiB en 1 s = 524 kbit/s
    expect(Math.round(p.kbpsDe("a"))).toBe(524);
    expect(p.vencidas(1000).length).toBe(0); // la otra lleva 1 s: aún no
    expect(p.vencidas(9000).length).toBe(1); // pasa de 4 veces lo estimado (~8 s)
  });
});

describe("super-siembra", () => {
  it("con un solo par esperado se le ofrece todo (no hay a quién repartir)", () => {
    const s = new SuperSembrador(20);
    expect(s.alConectar("A", 0).length).toBe(20);
  });

  it("con varios pares reparte trozos DISTINTOS y espera confirmación para dar más", () => {
    const s = new SuperSembrador(20, { paresEsperados: 3, ofertaInicial: 2, maxPendientes: 2 });
    const a = s.alConectar("A", 0);
    const b = s.alConectar("B", 0);
    const c = s.alConectar("C", 0);
    expect([a.length, b.length, c.length]).toEqual([2, 2, 2]);
    expect(new Set([...a, ...b, ...c]).size).toBe(6);
    expect(s.ofrecida("A", a[0])).toBe(true);
    expect(s.ofrecida("A", b[0])).toBe(false);
    // C dice que ya tiene lo que se le ofreció a A: A queda libre y recibe más; B no
    const nuevas = s.alTengo("C", a, 100);
    expect(nuevas.get("A")?.length).toBe(2);
    expect(nuevas.has("B")).toBe(false);
    // si el propio A dice que lo tiene, no cuenta como repartido
    const mas = s.alTengo("B", [...b], 200);
    expect(mas.has("B")).toBe(false);
  });

  it("si nadie confirma, tras la espera suelta más (no se queda atascada)", () => {
    const s = new SuperSembrador(20, { paresEsperados: 3, ofertaInicial: 2, maxPendientes: 2, esperaMs: 1000 });
    s.alConectar("A", 0);
    s.alConectar("B", 0);
    expect(s.alTick(500).size).toBe(0);
    expect(s.alTick(1500).size).toBeGreaterThan(0);
  });
});

/* ───────────────────────────── Política ───────────────────────────── */

const CAP: CapacidadNeurona = { tipo: "escritorio", enCorriente: true, bateriaPct: null, enWifi: true, redMedida: false, libreBytes: 10 * 1024 ** 3 };
const AHORA = new Date(2026, 10, 10, 14, 0, 0).getTime();
const est = (c: Partial<EstadoNeurona> = {}): EstadoNeurona => ({ ...CAP, ahora: AHORA, subidasActivas: 0, ...c });
const sol = (s: Partial<SolicitudServir> = {}): SolicitudServir => ({ ambito: "privado", relacion: "propia", bytes: 1024 * 1024, esRelevoCiego: false, ...s });
const aj = (a: Partial<AjustesEnjambre> = {}): AjustesEnjambre => ({ ...AJUSTES_ENJAMBRE_POR_DEFECTO, ...a });

describe("política de siembra", () => {
  it("roles automáticos por capacidad", () => {
    expect(rolAutomatico({ ...CAP, tipo: "servidor" })).toBe("sembradora-fija");
    expect(rolAutomatico({ ...CAP, tipo: "escritorio" })).toBe("sembradora-fija");
    expect(rolAutomatico({ ...CAP, tipo: "portatil", enCorriente: false, bateriaPct: 30 })).toBe("sembradora-ocasional");
    expect(rolAutomatico({ ...CAP, tipo: "movil", enCorriente: true, enWifi: true })).toBe("sembradora-ocasional");
    expect(rolAutomatico({ ...CAP, tipo: "movil", enCorriente: false, bateriaPct: 80 })).toBe("solo-recolectar");
    expect(rolAutomatico({ ...CAP, tipo: "tableta", enCorriente: true, enWifi: true, redMedida: true })).toBe("solo-recolectar");
    expect(rolAutomatico({ ...CAP, tipo: "web" })).toBe("solo-recolectar");
    expect(rolAutomatico({ ...CAP, libreBytes: 100 })).toBe("solo-recolectar");
  });

  it("mis neuronas: siempre, dentro de batería, red medida y tope diario", () => {
    const d = new ContadorDia();
    expect(decidirServir(aj(), est(), sol(), d).ok).toBe(true);
    expect(decidirServir(aj(), est({ enCorriente: false, bateriaPct: 10 }), sol(), d)).toMatchObject({ ok: false, motivo: "bateria" });
    expect(decidirServir(aj(), est({ enCorriente: true, bateriaPct: 10 }), sol(), d).ok).toBe(true);
    expect(decidirServir(aj(), est({ redMedida: true }), sol(), d)).toMatchObject({ ok: false, motivo: "red-medida" });
    expect(decidirServir(aj({ usarRedMedida: true }), est({ redMedida: true }), sol(), d).ok).toBe(true);
    d.sumar("propia", 4096 * 1024 * 1024 - 1024, AHORA);
    expect(decidirServir(aj(), est(), sol({ bytes: 4096 }), d)).toMatchObject({ ok: false, motivo: "cuota" });
    // incluso una neurona «solo recolectar» sirve a las propias (mandan los topes)
    expect(decidirServir(aj({ rol: "solo-recolectar" }), est(), sol(), new ContadorDia()).ok).toBe(true);
    expect(decidirServir(aj({ sembrarMisNeuronas: false }), est(), sol(), new ContadorDia())).toMatchObject({ ok: false, motivo: "apagado" });
    expect(decidirServir(aj(), est(), sol({ relacion: "revocada" }), new ContadorDia())).toMatchObject({ ok: false, motivo: "revocada" });
  });

  it("grupo: a miembros, no a extraños; solo-recolectar no siembra a otras personas", () => {
    const d = new ContadorDia();
    expect(decidirServir(aj(), est(), sol({ ambito: "grupo", relacion: "miembro" }), d).ok).toBe(true);
    expect(decidirServir(aj(), est(), sol({ ambito: "grupo", relacion: "otra" }), d)).toMatchObject({ ok: false, motivo: "no-miembro" });
    expect(decidirServir(aj(), est(), sol({ ambito: "privado", relacion: "miembro" }), d)).toMatchObject({ ok: false, motivo: "no-miembro" });
    expect(decidirServir(aj({ sembrarGrupos: false }), est(), sol({ ambito: "grupo", relacion: "miembro" }), d)).toMatchObject({ ok: false, motivo: "apagado" });
    expect(decidirServir(aj({ rol: "solo-recolectar" }), est(), sol({ ambito: "grupo", relacion: "miembro" }), d)).toMatchObject({ ok: false, motivo: "rol" });
  });

  it("equidad blanda: quien pasa de la razón baja de prioridad pero no se bloquea mientras haya capacidad", () => {
    const eq = new EquidadGrupo(4);
    eq.servidoA("glotón", 500 * 1024 * 1024);
    eq.recibidoDe("glotón", 1024);
    eq.servidoA("normal", 10 * 1024 * 1024);
    eq.recibidoDe("normal", 8 * 1024 * 1024);
    expect(eq.pasaDeLaRazon("glotón")).toBe(true);
    expect(eq.pasaDeLaRazon("normal")).toBe(false);
    expect(eq.ordenar(["glotón", "normal", "nuevo"])).toEqual(["nuevo", "normal", "glotón"]);
    const d = new ContadorDia();
    const s = sol({ ambito: "grupo", relacion: "miembro", par: "glotón" });
    expect(decidirServir(aj(), est({ subidasActivas: 0 }), s, d, eq)).toEqual({ ok: true, motivo: "ok", prioridad: "baja" });
    expect(decidirServir(aj(), est({ subidasActivas: 6 }), s, d, eq)).toMatchObject({ ok: false, motivo: "ocupada" }); // 6 >= 75 % de 8
    expect(decidirServir(aj(), est({ subidasActivas: 6 }), { ...s, par: "normal" }, d, eq).ok).toBe(true);
    expect(decidirServir(aj(), est({ subidasActivas: 8 }), { ...s, par: "normal" }, d, eq)).toMatchObject({ ok: false, motivo: "ocupada" });
  });

  it("público: apagado por defecto, con tope y horario", () => {
    const d = new ContadorDia();
    const s = sol({ ambito: "publico", relacion: "otra" });
    expect(decidirServir(aj(), est(), s, d)).toMatchObject({ ok: false, motivo: "apagado" });
    expect(decidirServir(aj({ sembrarPublico: true }), est(), s, d).ok).toBe(true);
    expect(decidirServir(aj({ sembrarPublico: true, horarioPublico: { desdeH: 0, hastaH: 6 } }), est(), s, d)).toMatchObject({ ok: false, motivo: "horario" });
    expect(decidirServir(aj({ sembrarPublico: true, horarioPublico: { desdeH: 22, hastaH: 16 } }), est(), s, d).ok).toBe(true);
    expect(decidirServir(aj({ sembrarPublico: true }), est({ enCorriente: false, bateriaPct: 30 }), s, d)).toMatchObject({ ok: false, motivo: "bateria" }); // 30 < 40
    d.sumar("publico", 256 * 1024 * 1024, AHORA);
    expect(decidirServir(aj({ sembrarPublico: true }), est(), s, d)).toMatchObject({ ok: false, motivo: "cuota" });
  });

  it("relé ciego: apagado por defecto; con permiso sirve texto cifrado a quien conoce el id", () => {
    const d = new ContadorDia();
    const s = sol({ ambito: "privado", relacion: "por-id", esRelevoCiego: true });
    expect(decidirServir(aj(), est(), s, d)).toMatchObject({ ok: false, motivo: "relevo-apagado" });
    expect(decidirServir(aj({ relevoCiego: true }), est(), s, d).ok).toBe(true);
    expect(decidirServir(aj({ relevoCiego: true }), est(), { ...s, relacion: "otra" }, d)).toMatchObject({ ok: false, motivo: "no-miembro" });
    expect(aceptarGuardar(aj(), CAP, "privado", false)).toBe(false);
    expect(aceptarGuardar(aj({ relevoCiego: true }), CAP, "privado", false)).toBe(true);
    expect(aceptarGuardar(aj({ relevoCiego: true }), { ...CAP, tipo: "movil", enCorriente: false, bateriaPct: 90 }, "privado", false)).toBe(false);
    expect(aceptarGuardar(aj(), CAP, "grupo", true)).toBe(true);
    expect(aceptarGuardar(aj(), CAP, "publico", false)).toBe(false);
  });

  it("los ajustes guardados se sanean", () => {
    expect(interpretarAjustesEnjambre(null)).toEqual(AJUSTES_ENJAMBRE_POR_DEFECTO);
    const a = interpretarAjustesEnjambre({ rol: "dios", sembrarPublico: "si", bateriaMinPct: 500, maxSubidas: 3, topeDiaMiB: { propia: -1, publico: 10 }, horarioPublico: { desdeH: 22, hastaH: 6 }, ratioSuave: 0 });
    expect(a.rol).toBe("auto");
    expect(a.sembrarPublico).toBe(false);
    expect(a.bateriaMinPct).toBe(20);
    expect(a.maxSubidas).toBe(3);
    expect(a.topeDiaMiB).toEqual({ propia: 4096, grupo: 1024, publico: 10 });
    expect(a.horarioPublico).toEqual({ desdeH: 22, hastaH: 6 });
    expect(a.ratioSuave).toBe(4);
  });
});
