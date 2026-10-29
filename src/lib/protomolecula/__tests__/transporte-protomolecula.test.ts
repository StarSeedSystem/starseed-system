import { describe, expect, it } from "vitest";
import {
  CANAL_PROTOMOLECULA, crearEnlaceSesion, type GestoRecibido, type MensajeProtomolecula, type RelojSesion,
} from "../transporte-protomolecula";
import { ATOMO_ESTACION, parametrosDeSesion, parametrosDesdeValores } from "../adaptador-estaciones";
import type { Cambio, Molecula, Operacion, Sesion } from "../tipos";
import type { EstadoReloj } from "@/lib/estaciones/reloj-comun";
import type { ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";

interface RelojFalso extends RelojSesion { avanzar(ms: number): void }

function relojFalso(inicio = 1000): RelojFalso {
  let t = inicio;
  const estado: EstadoReloj = {
    modo: "sin-referencia", desfaseMs: 0, derivaPpm: 0, precisionMs: null, cotaMs: null,
    retardoMinMs: null, muestras: 0, ultimaMuestra: null,
  };
  return { ahora: () => t, horaLocal: () => t, estado: () => estado, avanzar(ms) { t += ms; } };
}

const sesion: Sesion = {
  id: "s1", moleculaId: "m1", ambito: "personal", anfitrion: "ana", miembros: { ana: "dueno" },
  transporte: "malla-p2p", consentimientos: [], creadaEn: 0,
};
const moleculaBase = (): Molecula => ({
  id: "m1", titulo: "Prueba", ambito: "personal", capas: [], atomos: [], valores: {}, version: 0,
  creadaEn: 0, actualizadaEn: 0,
});
const operacion = (id: string, valor: number, autorId = "ana"): Operacion => ({
  id, objetivo: { atomoId: "at", parametroId: "vol" }, accion: { tipo: "exacta", valor },
  autor: { tipo: "persona", id: autorId }, origen: "mano", t: 0,
});
const cambioDe = (op: Operacion, antes: number, despues: number): Cambio => ({
  operacion: op, antes, despues, acotado: false, reversible: true,
});

function parDeEnlaces() {
  const haciaA = new Set<(m: unknown) => void>(), haciaB = new Set<(m: unknown) => void>();
  const relojA = relojFalso(1000), relojB = relojFalso(1000);
  const enviados: MensajeProtomolecula[] = [], gestos: GestoRecibido[] = [];
  const conectar = (set: Set<(m: unknown) => void>) => (cb: (m: unknown) => void) => {
    set.add(cb);
    return () => void set.delete(cb);
  };
  const a = crearEnlaceSesion({
    sesion: { ...sesion, anfitrion: "ana" }, molecula: moleculaBase(), reloj: relojA, dispositivo: "ana",
    enviar: (m) => { enviados.push(m); if (m.tipo === "ping") relojA.avanzar(20); haciaB.forEach((f) => f(m)); },
    recibir: conectar(haciaA),
  });
  const b = crearEnlaceSesion({
    sesion: { ...sesion, anfitrion: "bea" }, molecula: moleculaBase(), reloj: relojB, dispositivo: "bea",
    enviar: (m) => { enviados.push(m); haciaA.forEach((f) => f(m)); }, recibir: conectar(haciaB),
    alGesto: (g) => gestos.push(g),
  });
  return { a, b, enviados, gestos, relojA, relojB };
}

describe("transporte de la Protomolécula", () => {
  it("dos enlaces falsos conectados convergen y la confirmación lleva la hora común", () => {
    const { a, b, enviados, relojA, relojB } = parDeEnlaces();
    const opA = operacion("a1", 0.4);
    const devuelta = a.enviarConfirmacion(opA, cambioDe(opA, 0, 0.4));
    expect(devuelta.t).toBe(1000);
    expect(enviados[0].tipo).toBe("confirmacion");
    expect(b.obtener().valores["at::vol"]).toBe(0.4);
    relojA.avanzar(10); relojB.avanzar(10);
    const opB = operacion("b1", 0.8, "bea");
    b.enviarConfirmacion(opB, cambioDe(opB, 0.4, 0.8));
    expect(a.obtener().valores["at::vol"]).toBe(0.8);
    expect(a.obtener().valores).toEqual(b.obtener().valores);
  });

  it("el gesto es efímero: se entrega una vez y no queda en la molécula; la presencia sí se ve", () => {
    const { a, b, gestos } = parDeEnlaces();
    a.enviarGesto({ atomoId: "at", parametroId: "vol" }, 0.9);
    expect(b.obtener().valores["at::vol"]).toBeUndefined();
    expect(gestos).toEqual([{ de: "ana", ref: { atomoId: "at", parametroId: "vol" }, valor: 0.9, t: 1000 }]);
    a.enviarPresencia({ atomoId: "at", parametroId: "vol" });
    expect(b.estado().presencias.ana.moviendo).toEqual({ atomoId: "at", parametroId: "vol" });
  });

  it("sin muestras no hay latencia ni precisión inventadas; con el mínimo, p50 y p95 medidos", () => {
    const { a } = parDeEnlaces();
    expect(a.medirLatencia()).toEqual({ p50Ms: null, p95Ms: null, muestras: 0, texto: "sin medir" });
    expect(a.estado().reloj).toMatchObject({ modo: "sin-referencia", precisionMs: null });
    for (let i = 0; i < 4; i++) a.ping();
    expect(a.medirLatencia().p50Ms).toBeNull();
    a.ping();
    expect(a.medirLatencia()).toMatchObject({ p50Ms: 20, p95Ms: 20, muestras: 5 });
    expect(a.estado().enlace).toBe("malla P2P");
  });
});

describe("adaptador de estaciones", () => {
  it("ida y vuelta de una entonación de Omnifrecuencias sin perder el nombre del oscilador", () => {
    const p: ParametrosSesion = { tipo: "omnifrecuencias", entonacion: { volumen: 0.8, osciladores: [
      { id: "o1", nombre: "Graves", f: 440, onda: "sine", vol: 0.5, x: 0.1, y: -0.2, z: 0, pulso: 4 },
    ] } };
    const { parametros, valores } = parametrosDeSesion(p);
    expect(valores[`${ATOMO_ESTACION}::volumen`]).toBe(0.8);
    expect(valores[`${ATOMO_ESTACION}::oscilador.o1.f`]).toBe(440);
    expect(parametros.find((pr) => pr.id === "oscilador.o1.onda")?.tipo).toBe("opcion");
    const vuelta = parametrosDesdeValores("omnifrecuencias", parametros, valores, p);
    expect(vuelta).toEqual(p);
  });

  it("ida y vuelta de Audiomorphic conserva números, booleanos y textos", () => {
    const p: ParametrosSesion = { tipo: "audiomorphic", visual: { brillo: 0.6, activo: true, modo: "calma" } };
    const { parametros, valores } = parametrosDeSesion(p);
    expect(parametros.find((pr) => pr.id === "visual.activo")?.tipo).toBe("booleano");
    expect(parametros.find((pr) => pr.id === "visual.modo")?.opciones).toEqual(["calma"]);
    expect(parametrosDesdeValores("audiomorphic", parametros, valores, p)).toEqual(p);
  });
});
