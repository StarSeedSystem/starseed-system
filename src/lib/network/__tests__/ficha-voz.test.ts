// @vitest-environment jsdom
/**
 * VZF1015Q — cada neurona anuncia su voz MEDIDA (oído y habla), nunca la declarada.
 * Contrato: architecture/voz-fusionada-astraura.md §5. Sin red, sin micrófono y sin procesos:
 * reloj, lectura de medidas y `fetch` inyectados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  crearFichaNodo, fichaCompacta, normalizarVoz, vozMedida, VOZ_MAX_MOTORES, VOZ_VIGENCIA_MS, type MedidaVozEntrada,
} from "../capacidades-nodo";
import { construirFicha, esMensajeFicha, fichaRecibida, vozDeEstaNeurona, type FichaDispositivo } from "../malla-neuronas";
import { anotarMedida } from "@/lib/aurora/medidas-voz";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";

const AHORA = 1_800_000_000_000;
const m = (motor: string, tipo: MedidaVozEntrada["tipo"], valor: number, extra: Partial<MedidaVozEntrada> = {}): MedidaVozEntrada =>
  ({ neurona: "n-yo", motor, tipo, valor, timestamp: AHORA - 1000, ...extra });

describe("vozMedida: solo lo medido", () => {
  it("sin medidas (o con basura) no se anuncia nada y nunca lanza", () => {
    expect(vozMedida([], { ahora: AHORA })).toBeUndefined();
    expect(vozMedida(null, { ahora: AHORA })).toBeUndefined();
    const basura = [null, m("", "primer-sonido", 300), m("kokoro", "primer-sonido", Number.NaN), m("kokoro", "primer-sonido", -5),
      { ...m("kokoro", "primer-sonido", 300), timestamp: "ayer" }] as unknown as MedidaVozEntrada[];
    expect(vozMedida(basura, { ahora: AHORA })).toBeUndefined();
  });

  it("oído desde tiempo-real-oido y habla desde primer-sonido, mediana por motor; lo demás no cuenta", () => {
    const voz = vozMedida([
      m("parakeet-v3", "tiempo-real-oido", 10.9), m("parakeet-v3", "tiempo-real-oido", 11.5), m("parakeet-v3", "tiempo-real-oido", 11.1),
      m("supertonic", "primer-sonido", 420), m("supertonic", "primer-sonido", 380), m("kokoro", "primer-sonido", 900),
      m("kokoro", "tiempo-real-voz", 3), m("phonon-2", "correccion", 1),
    ], { neurona: "n-yo", ahora: AHORA });
    expect(voz).toEqual({
      oido: [{ motor: "parakeet-v3", idiomas: [], tiempoReal: 11.1, flujo: false }],
      habla: [{ motor: "supertonic", primerSonidoMs: 400 }, { motor: "kokoro", primerSonidoMs: 900 }],
    });
  });

  it("idioma y flujo solo si la medida los trae: el registro diría flujo para phonon-2, pero no se midió", () => {
    const sinDato = vozMedida([m("phonon-2", "tiempo-real-oido", 6.9)], { ahora: AHORA });
    expect(sinDato?.oido[0]).toMatchObject({ idiomas: [], flujo: false });
    const conDato = vozMedida([
      m("phonon-2", "tiempo-real-oido", 7.1, { idioma: "es-ES" }), m("phonon-2", "tiempo-real-oido", 6.9, { idioma: "en", flujo: true }),
      m("phonon-2", "tiempo-real-oido", 6.4, { idioma: "ES" }),
    ], { ahora: AHORA });
    expect(conDato?.oido[0]).toEqual({ motor: "phonon-2", idiomas: ["en", "es"], tiempoReal: 6.9, flujo: true });
  });

  it("otra neurona, medidas caducadas o del futuro no cuentan; la mediana usa las 20 últimas", () => {
    const otras = [m("kokoro", "primer-sonido", 500, { neurona: "n-otra" }),
      m("kokoro", "primer-sonido", 500, { timestamp: AHORA - VOZ_VIGENCIA_MS - 1 }), m("kokoro", "primer-sonido", 500, { timestamp: AHORA + 60_000 })];
    expect(vozMedida(otras, { neurona: "n-yo", ahora: AHORA })).toBeUndefined();
    const viejas = Array.from({ length: 30 }, (_, i) => m("kokoro", "primer-sonido", i < 15 ? 5000 : 200, { timestamp: AHORA - 100_000 + i }));
    expect(vozMedida(viejas, { ahora: AHORA })?.habla).toEqual([{ motor: "kokoro", primerSonidoMs: 200 }]);
  });
});

describe("normalizarVoz y fichas recibidas (compatibles con las viejas)", () => {
  it("sanea una voz ajena: descarta lo que no encaja, quita duplicados y pone tope", () => {
    const muchos = Array.from({ length: 12 }, (_, i) => ({ motor: `m${i}`, primerSonidoMs: 100 + i }));
    const voz = normalizarVoz({ oido: [{ motor: "vibeasr-158", tiempoReal: "7" }, { motor: "a", tiempoReal: 2, idiomas: [1, "xx-yy-zz", "español"], flujo: "sí" }],
      habla: [...muchos, { motor: "m0", primerSonidoMs: 1 }] });
    expect(voz?.oido).toEqual([{ motor: "a", idiomas: ["xx"], tiempoReal: 2, flujo: false }]);
    expect(voz?.habla).toHaveLength(VOZ_MAX_MOTORES);
    expect(voz?.habla[0]).toEqual({ motor: "m0", primerSonidoMs: 100 });
    expect(normalizarVoz({ oido: [], habla: [] })).toBeUndefined();
    expect(normalizarVoz("voz")).toBeUndefined();
  });

  it("una ficha vieja sin `voz` se guarda igual y la basura se quita sin tocar lo demás", () => {
    const vieja = { v: 1, syncDeviceId: "s-b", neuronDeviceId: "n-b", nombre: "Tablet" } as FichaDispositivo;
    expect(esMensajeFicha({ t: "malla:ficha", ficha: vieja })).toBe(true);
    expect(fichaRecibida(vieja)).toBe(vieja);
    const rota = { ...vieja, voz: { oido: "mucho", habla: [{ motor: "x", primerSonidoMs: -1 }] } } as unknown as FichaDispositivo;
    expect(fichaRecibida(rota)).toEqual(vieja);
    expect("voz" in fichaRecibida(rota)).toBe(false);
    const buena = { ...vieja, voz: { oido: [], habla: [{ motor: "kokoro", primerSonidoMs: 812.4 }] } };
    expect(fichaRecibida(buena).voz).toEqual({ oido: [], habla: [{ motor: "kokoro", primerSonidoMs: 812 }] });
  });

  it("CapacidadesNodo: sin voz no hay campo, con voz se anuncia y la línea LoRa no cambia", () => {
    const base = { nodoId: "nodo-mac-1", medio: "mac" as const, ramLibreMb: 2048 };
    const sin = crearFichaNodo({ ...base, voz: { oido: [], habla: [] } });
    expect("voz" in sin).toBe(false);
    const voz = vozMedida([m("parakeet-v3", "tiempo-real-oido", 11)], { ahora: AHORA });
    const con = crearFichaNodo({ ...base, voz });
    expect(con.voz?.oido[0].motor).toBe("parakeet-v3");
    expect(fichaCompacta({ ...con, t: sin.t })).toBe(fichaCompacta(sin));
  });
});

describe("construirFicha anuncia la voz medida de ESTA neurona", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("sin red en las pruebas"))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("vozDeEstaNeurona: lectura y reloj inyectados; sin id no anuncia", () => {
    const leer = vi.fn(() => [m("kokoro", "primer-sonido", 700)]);
    expect(vozDeEstaNeurona("n-yo", leer, AHORA)?.habla).toEqual([{ motor: "kokoro", primerSonidoMs: 700 }]);
    expect(leer).toHaveBeenCalledWith("n-yo");
    expect(vozDeEstaNeurona("", leer, AHORA)).toBeUndefined();
    expect(vozDeEstaNeurona("n-yo", () => { throw new Error("almacén roto"); }, AHORA)).toBeUndefined();
  });

  it("sin medidas la ficha no lleva `voz`; con las de medidas-voz.ts, sí (y no las de otra neurona)", async () => {
    expect("voz" in (await construirFicha(null))).toBe(false);
    anotarMedida({ neurona: neuronDeviceIdActual(), motor: "supertonic", tipo: "primer-sonido", valor: 350 });
    anotarMedida({ neurona: "otra-neurona", motor: "kokoro", tipo: "primer-sonido", valor: 900 });
    const ficha = await construirFicha(null);
    expect(ficha.voz).toEqual({ oido: [], habla: [{ motor: "supertonic", primerSonidoMs: 350 }] });
  });
});
