import { describe, expect, it } from "vitest";
import { RelojComun } from "@/lib/estaciones/reloj-comun";
import type { ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";
import { elementoDeOperacion } from "../sesion-sincronia";
import {
  aplicarElementos,
  crearEnlaceSesion,
  esMensajeProtomolecula,
  etiquetaEnlace,
  medirLatencia,
} from "../transporte-protomolecula";
import { parametrosDeSesion, sesionDeParametros } from "../adaptador-estaciones";
import type { Cambio, Molecula, Operacion, ParametroRef } from "../tipos";

function molecula(valores: Record<string, number>): Molecula {
  return {
    id: "m1", titulo: "Prueba", ambito: "personal",
    capas: [], atomos: [], valores,
    version: 1, creadaEn: 0, actualizadaEn: 1_000,
  };
}

const OBJETIVO: ParametroRef = { atomoId: "a1", parametroId: "vol" };

function cambioDe(valorDespues: number, tComun: number, autor = "U1"): { op: Operacion; cambio: Cambio } {
  const op: Operacion = {
    id: `op-${autor}-${tComun}`, objetivo: OBJETIVO,
    accion: { tipo: "exacta", valor: valorDespues },
    autor: { tipo: "persona", id: autor }, origen: "mano", t: tComun,
  };
  return { op, cambio: { operacion: op, antes: 0.4, despues: valorDespues, acotado: false, reversible: true } };
}

/* Tubo falso: dos enlaces sin red, reloj común simulado (mismo instante) y moléculas vivas de cada lado. */
function conectar(): {
  X: ReturnType<typeof crearEnlaceSesion>;
  Y: ReturnType<typeof crearEnlaceSesion>;
  mA: () => Molecula;
  mB: () => Molecula;
  aplicarA: (m: Molecula) => void;
  aplicarB: (m: Molecula) => void;
  t: () => number;
  avanzar: (ms: number) => void;
} {
  let mA = molecula({ "a1::vol": 0.4 });
  let mB = molecula({ "a1::vol": 0.4 });
  let ahora = 5_000;
  let aX: ((texto: string) => void) | null = null;
  let aY: ((texto: string) => void) | null = null;
  const rX = new RelojComun({ relojLocal: () => ahora, esReferencia: true, id: "X" });
  const rY = new RelojComun({ relojLocal: () => ahora, esReferencia: true, id: "Y" });
  const X = crearEnlaceSesion({
    sesion: { transporte: "malla-p2p" },
    enviar: (texto) => aY?.(texto),
    recibir: (cb) => { aX = cb; return () => { aX = null; }; },
    reloj: rX,
    molecula: () => mA,
  });
  const Y = crearEnlaceSesion({
    sesion: { transporte: "malla-p2p" },
    enviar: (texto) => aX?.(texto),
    recibir: (cb) => { aY = cb; return () => { aY = null; }; },
    reloj: rY,
    molecula: () => mB,
  });
  X.alMolecula((m) => { mA = m; });
  Y.alMolecula((m) => { mB = m; });
  return {
    X, Y,
    mA: () => mA, mB: () => mB,
    /** El «controlador» de cada lado aplicó la operación en local (así lo hace en la UI). */
    aplicarA: (m) => { mA = m; },
    aplicarB: (m) => { mB = m; },
    t: () => ahora,
    avanzar: (ms) => { ahora += ms; },
  };
}

describe("dos enlaces falsos conectados convergen", () => {
  it("una confirmación de X llega a Y con el mismo valor", () => {
    const c = conectar();
    const { op, cambio } = cambioDe(0.6, c.X.tComun(), "U1");
    c.X.confirmar(op, cambio);
    expect(c.mB().valores["a1::vol"]).toBe(0.6);
  });

  it("vuelta: Y conoce su estado (el controlador aplicó en local) y ambos convergen", () => {
    const c = conectar();
    const uno = cambioDe(0.6, c.X.tComun(), "U1");
    const dos = cambioDe(0.8, c.Y.tComun(), "U2");
    c.X.confirmar(uno.op, uno.cambio);
    // El controlador de Y ya aplicó la suya en local antes de confirmar (así lo hace mover()).
    c.aplicarB(aplicarElementos(c.mB(), [elementoDeOperacion(dos.op, dos.cambio)]));
    c.Y.confirmar(dos.op, dos.cambio);
    expect(c.mA().valores["a1::vol"]).toBe(0.8);
    expect(c.mB().valores["a1::vol"]).toBe(0.8);
    expect(JSON.stringify(c.mA().valores)).toBe(JSON.stringify(c.mB().valores));
  });

  it("el instante de la operación sale del reloj común, no de cada aparato", () => {
    const c = conectar();
    expect(c.X.tComun()).toBe(c.t());
    expect(c.Y.tComun()).toBe(c.t());
    const { op } = cambioDe(0.7, c.X.tComun(), "U1");
    expect(op.t).toBe(5_000);
  });
});

describe("gesto efímero", () => {
  it("se avisa pero NUNCA se guarda en la molécula", () => {
    const c = conectar();
    const gestos: Array<{ valor: number }> = [];
    c.Y.alGesto((g) => gestos.push(g));
    c.X.gesto(OBJETIVO, 0.9);
    expect(gestos.length).toBe(1);
    expect(gestos[0].valor).toBe(0.9);
    expect(c.mB().valores["a1::vol"]).toBe(0.4);
    expect(c.mB().actualizadaEn).toBe(1_000);
  });
});

describe("medidor de latencia", () => {
  it("con menos de 3 muestras: «sin medir»", () => {
    const m = medirLatencia([10, 11]);
    expect(m.texto).toBe("sin medir");
    expect(m.p50Ms).toBeNull();
    expect(m.p95Ms).toBeNull();
  });

  it("con muestras del reloj simulado, p50 y p95 honestos", () => {
    expect(medirLatencia([10, 11, 50]).p50Ms).toBe(11);
    expect(medirLatencia([10, 11, 50]).p95Ms).toBe(50);
  });

  it("un ping/pong real por el tubo suma una muestra (el tubo síncrono mide RTT 0)", () => {
    const c = conectar();
    c.X.medir();
    const lat = c.X.latencia();
    expect(lat.muestras).toBe(1);
    expect(lat.texto).toBe("sin medir"); // una sola muestra no basta: nada inventado
  });

  it("sin muestras el reloj común no inventa precisión, y la sesión lo enseña", () => {
    /* El reloj de la referencia ES el común: precisión 0 y lo dije. */
    const c = conectar();
    expect(c.X.estado().reloj.modo).toBe("referencia");
    expect(c.X.estado().reloj.precisionMs).toBe(0);
    expect(c.X.estado().texto).toBe("malla P2P · sin medir");
    /* Un reloj de invitado SIN muestras: ni desfase ni precisión falsos. */
    const invitado = new RelojComun({ relojLocal: () => 5_000, id: "S" });
    const E = crearEnlaceSesion({
      sesion: { transporte: "malla-p2p" },
      enviar: () => undefined,
      recibir: () => () => undefined,
      reloj: invitado,
    });
    const e = E.estado();
    expect(e.reloj.modo).toBe("sin-referencia");
    expect(e.reloj.precisionMs).toBeNull();
    expect(e.reloj.cotaMs).toBeNull();
  });
});

describe("presencia", () => {
  it("dice quién mueve qué y queda visible para la sesión", () => {
    const c = conectar();
    const vistas: Array<{ id: string; quien: string; mueve?: string; at: number }> = [];
    c.Y.alPresencia((p) => vistas.push(p));
    c.X.presencia("Ana", "a1::vol");
    expect(vistas.length).toBe(1);
    expect(vistas[0].quien).toBe("Ana");
    expect(vistas[0].id).toBe("X");
    expect(vistas[0].mueve).toBe("a1::vol");
    expect(vistas[0].at).toBe(c.t()); // el instante sale del reloj común
    expect(c.Y.estado().presencia.length).toBe(1);
  });
});

describe("etiqueta de enlace", () => {
  it("sin compañero: «solo en este aparato»; con enlace: nombre y medición", () => {
    expect(etiquetaEnlace("local", medirLatencia([]))).toBe("solo en este aparato");
    expect(etiquetaEnlace("malla-p2p", medirLatencia([1, 2, 3]))).toBe("malla P2P · 2 ms");
    expect(etiquetaEnlace("servidor-publico", medirLatencia([]))).toBe("relé cifrado del servidor · sin medir");
  });

  it("la guarda de mensajes rechaza lo que no es de la sesión", () => {
    expect(esMensajeProtomolecula({ t: "gesto" })).toBe(true);
    expect(esMensajeProtomolecula({ t: "nota" })).toBe(false);
    expect(esMensajeProtomolecula("chat")).toBe(false);
  });
});

describe("aplicarElementos (fusión de recibidos)", () => {
  it("respeta lápidas y descarta valores que no son del tipo del parámetro", () => {
    const base = molecula({ "a1::vol": 0.4 });
    const infestada = aplicarElementos(base, [
      { id: "a1::vol", tipo: "parametro", datos: { valor: false }, actualizadoEn: 2, porDispositivo: "X", borrado: false },
      { id: "a1::brillo", tipo: "parametro", datos: { valor: 0.2 }, actualizadoEn: 2, porDispositivo: "X", borrado: true },
      { id: "a1::nombre", tipo: "parametro", datos: {}, actualizadoEn: 2, porDispositivo: "X", borrado: false },
    ]);
    expect(infestada.valores["a1::vol"]).toBe(false); // booleano válido: se aplica
    expect(infestada.valores["a1::brillo"]).toBeUndefined(); // lápida: no aplica nada
    expect(infestada.valores["a1::nombre"]).toBeUndefined(); // sin valor: no toca
  });
});

describe("adaptador de estaciones: ida y vuelta", () => {
  it("entonación de Omnifrecuencias → panel y de vuelta sin tocar lo ajeno", () => {
    const base: ParametrosSesion = {
      tipo: "omnifrecuencias",
      entonacion: { osciladores: [{ id: "o1", f: 432, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 }], volumen: 0.7 },
    };
    const { parametros, valores } = parametrosDeSesion(base);
    expect(valores["o1.f"]).toBe(432);
    expect(valores["volumen"]).toBe(0.7);
    const ids = parametros.map((p) => p.id);
    expect(ids).toContain("o1.f");
    expect(ids).toContain("o1.onda");
    expect(parametros.find((p) => p.id === "o1.onda")?.opciones).toEqual(["sine", "square", "triangle", "sawtooth"]);
    const vuelta = sesionDeParametros(base, { "o1.f": 220, volumen: 0.3 });
    if (!vuelta || vuelta.tipo !== "omnifrecuencias") throw new Error("vuelta rota");
    expect(vuelta.entonacion.osciladores[0].f).toBe(220);
    expect(vuelta.entonacion.volumen).toBe(0.3);
    expect(vuelta.entonacion.osciladores[0].onda).toBe("sine"); // lo no tocado no cambia
    const intacta = sesionDeParametros(base, valores);
    expect(intacta).toEqual(base); // con los valores propios, la estación queda exacta
  });

  it("visual de Audiomorphic → panel y de vuelta", () => {
    const base: ParametrosSesion = { tipo: "audiomorphic", visual: { brillo: 0.8, tinte: true, modo: "crisal" } };
    const { valores } = parametrosDeSesion(base);
    expect(valores["visual.brillo"]).toBe(0.8);
    const vuelta = sesionDeParametros(base, { "visual.brillo": 0.2 });
    if (!vuelta || vuelta.tipo !== "audiomorphic") throw new Error("vuelta rota");
    expect(vuelta.visual.brillo).toBe(0.2);
    expect(vuelta.visual.modo).toBe("crisal");
    expect(vuelta.visual.tinte).toBe(true);
  });

  it("claves ajenas al saneo de la estación no entran al panel", () => {
    const base: ParametrosSesion = { tipo: "audiomorphic", visual: { brillo: 1, "clave rara": 2 } };
    const { parametros } = parametrosDeSesion(base);
    expect(parametros.some((p) => p.id === "visual.brillo")).toBe(true);
    expect(parametros.some((p) => p.id.includes("rara"))).toBe(false);
  });
});
