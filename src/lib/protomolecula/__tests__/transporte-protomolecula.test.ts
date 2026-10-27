import { describe, it, expect } from "vitest";
import {
  crearEnlaceSesion,
  estamparOperacion,
  MIN_MUESTRAS_LATENCIA,
  type RelojComun,
} from "@/lib/protomolecula/transporte-protomolecula";
import { parametrosDeSesion, sesionDeParametros } from "@/lib/protomolecula/adaptador-estaciones";
import type { Cambio, Operacion, Sesion, ValorParametro } from "@/lib/protomolecula/tipos";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import type { EstadoReloj } from "@/lib/estaciones/reloj-comun";
import type { EstadoValores } from "@/lib/protomolecula/tipos";

const sesion: Sesion = {
  id: "ses-1",
  moleculaId: "mol-1",
  ambito: "personal",
  anfitrion: "dev-a",
  miembros: { "dev-a": "dueno", "dev-b": "editor" },
  transporte: "malla-p2p",
  consentimientos: [],
  creadaEn: 1000,
};

/** Reloj común simulado: hora controlable y precisión honesta. */
function relojFalso(
  ops: { precisionMs: number | null; muestras: number; tik?: number } = { precisionMs: null, muestras: 0 },
) {
  let ahora = 10_000;
  const tik = ops.tik ?? 0;
  const estado: EstadoReloj = {
    modo: ops.muestras > 0 ? "sincronizado" : "sin-referencia",
    desfaseMs: 0,
    derivaPpm: 0,
    precisionMs: ops.precisionMs,
    cotaMs: ops.muestras > 0 ? 5 : null,
    retardoMinMs: null,
    muestras: ops.muestras,
    ultimaMuestra: null,
  };
  return {
    ahora: () => {
      ahora += tik;
      return ahora;
    },
    estado: () => ({ ...estado }),
    avanzar: (ms: number) => {
      ahora += ms;
    },
  };
}

/** Dos enlaces falsos conectados por cable entre A y B (sin red). */
function parDeEnlaces(
  reloj: RelojComun,
  handlers: { alGesto?: (el: ElementoSala) => void; alPresencia?: (de: string, mueve: string[]) => void } = {},
) {
  const cbA: Array<(t: string) => void> = [];
  const cbB: Array<(t: string) => void> = [];
  const a = crearEnlaceSesion({
    sesion,
    dispositivo: "dev-a",
    etiquetaEnlace: "WebRTC local",
    reloj,
    enviar: (texto) => {
      for (const cb of cbB) cb(texto);
      return true;
    },
    recibir: (cb) => {
      cbA.push(cb);
      return () => {
        cbA.splice(cbA.indexOf(cb), 1);
      };
    },
  });
  const b = crearEnlaceSesion({
    sesion,
    dispositivo: "dev-b",
    etiquetaEnlace: "WebRTC local",
    reloj,
    enviar: (texto) => {
      for (const cb of cbA) cb(texto);
      return true;
    },
    recibir: (cb) => {
      cbB.push(cb);
      return () => undefined;
    },
    alGesto: handlers.alGesto,
    alPresencia: handlers.alPresencia,
  });
  return { a, b };
}

const op2 = (clave: string, valor: ValorParametro, t: number): Operacion => ({
  id: `op-${clave}`,
  objetivo: { atomoId: "ato-1", parametroId: clave },
  accion: { tipo: "exacta", valor },
  autor: { tipo: "persona", id: "dev-a" },
  origen: "mano",
  t,
});
const cambioDe = (op: Operacion, antes: ValorParametro): Cambio => ({
  operacion: op,
  antes,
  despues: (op.accion.tipo === "exacta" ? op.accion.valor : antes) as ValorParametro,
  acotado: false,
  reversible: true,
});

/** Aplica un elemento recibido a un estado de valores (lo mismo que hace el controlador). */
function aplicarEn(hacia: EstadoValores, el: ElementoSala): void {
  if (el.tipo !== "parametro" || typeof el.datos.valor === "undefined") return;
  hacia[el.id] = el.datos.valor as ValorParametro;
}

describe("transporte de la sesión", () => {
  it("dos enlaces falsos conectados convergen al mismo estado", () => {
    const r = relojFalso({ precisionMs: 2, muestras: 6 });
    const { a, b } = parDeEnlaces(r);
    const estadoA: EstadoValores = {};
    const estadoB: EstadoValores = {};
    for (const el of a.elementosRecibidos()) aplicarEn(estadoA, el);
    for (const el of b.elementosRecibidos()) aplicarEn(estadoB, el);

    const opA = estamparOperacion(op2("brillo", 0.6, 0), r);
    expect(a.confirmar(opA, cambioDe(opA, 0.2))).toBe(true);
    aplicarEn(estadoB, b.elementosRecibidos()[0]);

    const opB: Operacion = {
      id: "op-b",
      objetivo: { atomoId: "ato-1", parametroId: "tono" },
      accion: { tipo: "exacta", valor: 220 },
      autor: { tipo: "persona", id: "dev-b" },
      origen: "mano",
      t: estamparOperacion(op2("tono", 220, 0), r).t,
    };
    expect(b.confirmar(opB, cambioDe(opB, 440))).toBe(true);
    aplicarEn(estadoA, a.elementosRecibidos()[0]);

    expect(estadoA).toEqual({ "ato-1::tono": 220 });
    expect(estadoB).toEqual({ "ato-1::brillo": 0.6 });
  });

  it("el gesto efímero se enseña pero NUNCA se guarda", () => {
    const gestos: string[] = [];
    const { a, b } = parDeEnlaces(relojFalso(), { alGesto: (e) => gestos.push(e.id) });
    const el: ElementoSala = {
      id: "ato-1::volumen",
      tipo: "gesto",
      datos: { valor: 0.9 },
      actualizadoEn: 5000,
      porDispositivo: "dev-a",
    };
    expect(a.gesto(el)).toBe(true);
    expect(gestos).toEqual(["ato-1::volumen"]);
    // el gesto NO entra en los elementos guardados: se suelta al asentar la operación
    expect(b.elementosRecibidos()).toEqual([]);
    expect(b.latencia().p50Ms).toBeNull();
  });

  it("la presencia llega con quién mueve qué", () => {
    const presencia: Array<[string, string[]]> = [];
    const { a } = parDeEnlaces(relojFalso(), { alPresencia: (de, mueve) => presencia.push([de, mueve]) });
    expect(a.presencia(["ato-1::brillo"])).toBe(true);
    expect(presencia).toEqual([["dev-a", ["ato-1::brillo"]]]);
  });

  it("latencia: sin muestras se dice «sin medir», nunca una cifra inventada", () => {
    const { a } = parDeEnlaces(relojFalso());
    expect(a.latencia().p50Ms).toBeNull();
    expect(a.latencia().p95Ms).toBeNull();
    expect(a.describirLatencia()).toContain("sin medir");
  });

  it("con muestras suficientes mide la latencia y el reloj enseña su precisión", () => {
    const r = relojFalso({ precisionMs: 1, muestras: 10, tik: 10 });
    const { a } = parDeEnlaces(r);
    for (let i = 0; i < MIN_MUESTRAS_LATENCIA; i += 1) a.ping();
    const l = a.latencia();
    expect(l.enlace).toBe("WebRTC local");
    expect(l.muestras).toBe(MIN_MUESTRAS_LATENCIA);
    expect(l.p50Ms ?? NaN).toBe(20);
    expect(l.p95Ms ?? NaN).toBe(20);
    expect(a.describirLatencia()).toContain("20 ms (p95 20 ms) por WebRTC local");
  });

  it("el reloj común sin muestras NO inventa precisión", () => {
    const { a } = parDeEnlaces(relojFalso());
    expect(a.precisionReloj()).toBe("reloj común sin muestras de 0 → precisión desconocida");
  });

  it("«solo en este aparato» cuando no hay enlace", () => {
    const r = relojFalso();
    const local = crearEnlaceSesion({
      sesion,
      dispositivo: "dev-a",
      etiquetaEnlace: "solo en este aparato",
      reloj: r,
      enviar: () => false,
      recibir: () => () => undefined,
    });
    expect(local.latencia().enlace).toBe("solo en este aparato");
  });

  it("el t de la operación sale del reloj común", () => {
    const r = relojFalso({ precisionMs: 2, muestras: 3 });
    r.avanzar(1234);
    const op = estamparOperacion(op2("x", 1, -1), r);
    expect(op.t).toBe(11_234);
    expect(op.id).toBe("op-x");
  });
});

describe("adaptador de estaciones", () => {
  const entonacion = {
    tipo: "omnifrecuencias" as const,
    entonacion: {
      osciladores: [
        { id: "o0", f: 432, onda: "sine" as const, vol: 0.5, x: 0, y: 0, z: 0 },
        { id: "o1", f: 528, onda: "triangle" as const, vol: 0.2, x: -1, y: 0.5, z: 1, mezcla: 0.3, pulso: 7.5 },
      ],
      volumen: 0.8,
    },
  };

  it("ida y vuelta en omnifrecuencias", () => {
    const { parametros, valores } = parametrosDeSesion(entonacion);
    // 2 osciladores: 6 fijos cada uno + mezcla y pulso del segundo + el volumen general
    expect(parametros.length).toBe(6 + 8 + 1);
    expect(valores["osc1.frecuencia"]).toBe(528);
    expect(valores.volumen).toBe(0.8);
    const vuelta = sesionDeParametros(parametros, valores);
    expect(vuelta).not.toBeNull();
    if (!vuelta || vuelta.tipo !== "omnifrecuencias") throw new Error("tipo perdido");
    const osc = vuelta.entonacion.osciladores;
    expect(osc[0]).toMatchObject({ f: 432, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 });
    expect(osc[1]).toMatchObject({ f: 528, vol: 0.2, x: -1, y: 0.5, z: 1, mezcla: 0.3, pulso: 7.5 });
    expect(vuelta.entonacion.volumen).toBe(0.8);
  });

  it("un cambio en el panel se ve en la vuelta", () => {
    const { parametros, valores } = parametrosDeSesion(entonacion);
    valores["osc0.frecuencia"] = 440;
    valores.volumen = 0.1;
    const vuelta = sesionDeParametros(parametros, valores);
    if (!vuelta || vuelta.tipo !== "omnifrecuencias") throw new Error("tipo perdido");
    expect(vuelta.entonacion.osciladores[0].f).toBe(440);
    expect(vuelta.entonacion.volumen).toBe(0.1);
  });

  it("ida y vuelta en audiomorphic", () => {
    const p = parametrosDeSesion({ tipo: "audiomorphic", visual: { espiral: 0.42, giro: true, modo: "par" } });
    expect(p.valores).toEqual({ "vis.espiral": 0.42, "vis.giro": true, "vis.modo": "par" });
    const vuelta = sesionDeParametros(p.parametros, p.valores);
    expect(vuelta).toEqual({ tipo: "audiomorphic", visual: { espiral: 0.42, giro: true, modo: "par" } });
  });

  it("con parámetros ajenos devuelve null, no inventa", () => {
    expect(sesionDeParametros([{ id: "otro", nombre: "Otro", tipo: "numero" }], {})).toBeNull();
  });
});
