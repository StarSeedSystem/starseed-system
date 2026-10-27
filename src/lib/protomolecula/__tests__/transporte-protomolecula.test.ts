import { describe, it, expect } from "vitest";
import { crearEnlaceSesion, medirLatencia, MUESTRAS_MIN_LATENCIA } from "../transporte-protomolecula";
import { parametrosDeSesion, sesionDeParametros } from "../adaptador-estaciones";
import { RelojComun } from "@/lib/estaciones/reloj-comun";
import type { Operacion, Cambio, Sesion } from "@/lib/protomolecula/tipos";
import type { ParametrosSesion, EntonacionParam } from "@/lib/estaciones/transmision-parametrica";

const sesionFalsa = (id: string): Sesion =>
  ({ id, moleculaId: `mol-${id}`, ambito: "grupo", anfitrion: "u-a", miembros: { "u-a": "dueno" }, transporte: "malla-p2p", consentimientos: [], creadaEn: 0 });
type Saca = ((c: never) => void) | null;

/** Dos enlaces falsos unidos por una cola: el envío encola y `entregar` lo reparte. */
function parConectado(ts: { v: number }) {
  const colas = { a: [] as unknown[], b: [] as unknown[] };
  let sacaA: Saca = null;
  let sacaB: Saca = null;
  const relojes = { a: new RelojComun({ relojLocal: () => ts.v, id: "A" }), b: new RelojComun({ relojLocal: () => ts.v, id: "B" }) };
  const enlace = (suyo: "a" | "b") =>
    crearEnlaceSesion({
      sesion: sesionFalsa(`ses-${suyo}`),
      reloj: relojes[suyo],
      enviar: (c) => { (suyo === "a" ? colas.b : colas.a).push(c); return "malla directa"; },
      recibir: (cb) => {
        if (suyo === "a") sacaA = cb; else sacaB = cb;
        return () => { if (suyo === "a") sacaA = null; else sacaB = null; };
      },
    });
  const a = enlace("a");
  const b = enlace("b");
  const entregar = (): void => { (sacaB as Saca | null)?.(undefined as never); (sacaA as Saca | null)?.(undefined as never); };
  return { a, b, entregar };
}

const confirmacion = (id: string, valor: number, t: number): { op: Operacion; cambio: Cambio } => {
  const autor = { tipo: "persona" as const, id: id === "o1" ? "u-a" : "u-b" };
  const objetivo = { atomoId: "a1", parametroId: "brillo" };
  const op: Operacion = { id, objetivo, accion: { tipo: "exacta", valor }, autor, origen: "mano", t };
  return { op, cambio: { operacion: op, antes: 0, despues: valor, acotado: false, reversible: true } };
};

describe("transporte-protomolecula", () => {
  it("dos enlaces falsos conectados convergen al mismo estado", () => {
    const { a, b, entregar } = parConectado({ v: 1000 });
    const c1 = confirmacion("o1", 1, 5000);
    const vistos: unknown[] = [];
    b.alEstado((m) => vistos.push(m.valores["a1::brillo"] ?? -1));
    a.enviarConfirmacion(c1.op, c1.cambio);
    entregar();
    expect(b.valores()["a1::brillo"]).toBe(1);
    expect(vistos).toEqual([1]);
    const c2 = confirmacion("o2", 0.5, 6000);
    b.enviarConfirmacion(c2.op, c2.cambio);
    entregar();
    expect(a.valores()).toEqual(b.valores());
  });

  it("lo vencido no pisa: mismo instante gana el dispositivo mayor, y lo viejo nada", () => {
    const { a, b, entregar } = parConectado({ v: 0 });
    const c1 = confirmacion("o1", 1, 5000);
    a.enviarConfirmacion(c1.op, c1.cambio);
    entregar();
    const c3 = confirmacion("o3", 0.2, 5000); // misma t, autor u-b < u-a: NO gana
    const c4 = confirmacion("o4", 0.3, 3000); // más vieja: tampoco
    b.enviarConfirmacion(c3.op, c3.cambio);
    entregar();
    b.enviarConfirmacion(c4.op, c4.cambio);
    entregar();
    expect(a.valores()["a1::brillo"]).toBe(1);
    expect(b.valores()["a1::brillo"]).toBe(1);
  });

  it("el gesto efímero viaja y avisa, pero no se guarda", () => {
    const { a, b, entregar } = parConectado({ v: 0 });
    const gesto: Array<{ valor: number; de: string }> = [];
    b.alGesto((g) => gesto.push({ valor: g.valor, de: g.de }));
    a.enviarGesto("a1::brillo", 42);
    entregar();
    expect(gesto).toEqual([{ valor: 42, de: "A" }]);
    expect(b.valores()).toEqual({});
  });

  it("la presencia avisa quién mueve qué y cómo se suelta", () => {
    const { a, b, entregar } = parConectado({ v: 0 });
    const vi: Array<string | null> = [];
    b.alPresencia((p) => vi.push(p.mueve));
    a.enviarPresencia("a1");
    entregar();
    a.enviarPresencia(null);
    entregar();
    expect(vi).toEqual(["a1", null]);
  });
});

describe("medidor de latencia", () => {
  it("sin muestras mínimas está «sin medir»", () => {
    expect(medirLatencia([10, 20, 30])).toEqual({ p50Ms: null, p95Ms: null });
    expect(MUESTRAS_MIN_LATENCIA).toBe(5);
    const { a } = parConectado({ v: 0 });
    expect(a.latencia()).toEqual({ p50Ms: null, p95Ms: null, muestras: 0, texto: "sin medir" });
  });

  it("con reloj simulado mide p50 y p95 por ping/pong", () => {
    expect(medirLatencia([10, 20, 30, 40, 50])).toEqual({ p50Ms: 30, p95Ms: 50 });
    const ts = { v: 1000 };
    const { a, entregar } = parConectado(ts);
    for (let i = 0; i < 6; i += 1) {
      a.sondear();
      ts.v += 50;
      entregar();
    }
    const l = a.latencia();
    expect({ muestras: l.muestras, p50Ms: l.p50Ms, p95Ms: l.p95Ms }).toEqual({ muestras: 6, p50Ms: 50, p95Ms: 50 });
    expect(l.texto).toBe("p50 50 ms · p95 50 ms");
    expect(a.info().porEnlace).toBe("malla directa");
  });
});

describe("adaptador de estaciones", () => {
  it("ParametrosSesion omnifrecuencias → Parametro[] ida y vuelta", () => {
    const entonacion: EntonacionParam = {
      volumen: 0.4,
      osciladores: [{ id: "o1", f: 432, onda: "sine", vol: 0.8, x: 0, y: 0, z: 0 }, { id: "o2", f: 528, onda: "sawtooth", vol: 0.5, x: -0.3, y: 0.1, z: 0.2, pulso: 2 }],
    };
    const p: ParametrosSesion = { tipo: "omnifrecuencias", entonacion };
    const { parametros, valores } = parametrosDeSesion(p);
    expect(parametros.map((x) => x.id)).toContain("o1.frecuencia");
    expect(valores["estacion::o1.frecuencia"]).toBe(432);
    expect(sesionDeParametros(parametros, valores)).toEqual(p);
  });

  it("ida y vuelta de la visual de Audiomorphic (número, booleano y opción)", () => {
    const p: ParametrosSesion = { tipo: "audiomorphic", visual: { radio: 0.5, girar: true, paleta: "aurora" } };
    const { parametros, valores } = parametrosDeSesion(p);
    expect(parametros.find((x) => x.id === "paleta")?.tipo).toBe("opcion");
    expect(valores["estacion::girar"]).toBe(true);
    expect(sesionDeParametros(parametros, valores)).toEqual(p);
  });
});
