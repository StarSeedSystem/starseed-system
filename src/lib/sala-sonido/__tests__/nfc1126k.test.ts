/**
 * NFC1126K · Sala de sonido compartida — motor, reloj común y mezcla.
 * Contrato: architecture/nfc-neuronas.md §11. Todo es PURO y determinista:
 * relojes y transportes simulados, sin navegador, red ni disco.
 */
import { describe, it, expect } from "vitest";
import {
  OBJETIVO_DESFASE_MS,
  corregirDeriva,
  elegirMuestra,
  horaLocalARemota,
  horaRemotaALocal,
  medirDesfase,
  type MuestraReloj,
} from "../reloj";
import {
  anadirACola,
  avanzar,
  cambiarControl,
  controladoresEfectivos,
  crearSala,
  posicionEn,
  puedeControlar,
  saltarA,
  siguienteEntrada,
  visibilidadPermitida,
  type FuenteAudio,
} from "../motor";
import {
  PROPORCION_AUREA,
  SILENCIO_DB,
  crearCanal,
  dbDesdeGanancia,
  gananciaEfectiva,
  gananciaLineal,
  limitarPico,
  parametrosWebAudio,
  resolverMezcla,
  siguienteTurno,
} from "../mezcla";

function fuente(id: string, duracionMs = 5_000): FuenteAudio {
  return { id, tipo: "archivo", nombre: `Pista ${id}`, duracionMs, aportadaPor: "ana" };
}

describe("reloj común", () => {
  it("estima el desfase remoto-local y lo acota con el error de ida y vuelta", () => {
    const t0 = 1_000_000;
    const desfaseReal = 12_345;
    const ida = 30;
    const proceso = 2;
    const vuelta = 50;
    const muestra: MuestraReloj = {
      t0,
      t1: t0 + ida + desfaseReal,
      t2: t0 + ida + proceso + desfaseReal,
      t3: t0 + ida + proceso + vuelta,
    };
    const d = medirDesfase(muestra);
    expect(Math.abs(d.desfaseMs - desfaseReal)).toBeLessThanOrEqual(d.errorMs);
    expect(d.errorMs).toBeCloseTo(40, 6);
    expect(Math.abs(d.desfaseMs - desfaseReal)).toBeLessThan(OBJETIVO_DESFASE_MS);
  });

  it("se queda con la muestra más fiable y traduce la posición entre relojes", () => {
    const buena: MuestraReloj = { t0: 0, t1: 10 + 5_000, t2: 12 + 5_000, t3: 10 + 2 + 8 };
    const lenta: MuestraReloj = { t0: 0, t1: 600 + 5_000, t2: 602 + 5_000, t3: 1_000 };
    const elegida = elegirMuestra([lenta, buena]);
    expect(elegida?.desfaseMs).toBeCloseTo(medirDesfase(buena).desfaseMs, 6);
    expect(elegida?.errorMs).toBeCloseTo(9, 6);
    expect(elegirMuestra([])).toBeNull();

    const desfaseEstimado = 5_011;
    const posicionRemota = 50_000;
    const local = horaRemotaALocal(posicionRemota, desfaseEstimado);
    expect(Math.abs(local - (posicionRemota - 5_000))).toBeLessThan(OBJETIVO_DESFASE_MS);
    expect(horaLocalARemota(local, desfaseEstimado)).toBe(posicionRemota);
  });

  it("corrige sin cortar dentro de 50 ms y salta solo cuando la deriva es mayor", () => {
    expect(corregirDeriva(500, 500).accion).toBe("mantener");
    expect(corregirDeriva(514, 500).accion).toBe("mantener");

    const atrasar = corregirDeriva(1_040, 1_000);
    expect(atrasar.accion).toBe("atrasar");
    expect(atrasar.velocidad).toBeLessThan(1);
    expect(1_040 + 2_000 * atrasar.velocidad).toBeCloseTo(3_000, 6);

    const adelantar = corregirDeriva(960, 1_000);
    expect(adelantar.accion).toBe("adelantar");
    expect(adelantar.velocidad).toBeGreaterThan(1);
    expect(960 + 2_000 * adelantar.velocidad).toBeCloseTo(3_000, 6);

    const saltar = corregirDeriva(1_100, 1_000);
    expect(saltar.accion).toBe("saltar");
    expect(saltar.ajusteMs).toBe(-100);
    expect(saltar.velocidad).toBe(1);
  });
});

describe("cola común y control de la sala", () => {
  it("cualquiera añade a la cola y la primera suena con el reloj común", () => {
    const base = crearSala("sala-1", { creador: "ana", oyentes: ["ana", "bruno", "carla"] });
    const conAna = anadirACola(base, fuente("a"), "ana", 1_000);
    const conBruno = anadirACola(conAna, fuente("b"), "bruno", 1_200);

    expect(conBruno.cola.map((e) => e.orden)).toEqual([1, 2]);
    expect(conBruno.cola.map((e) => e.anadidaPor)).toEqual(["ana", "bruno"]);
    expect(conBruno.reproduccion.entradaId).toBe("sala-1:a:1");
    expect(conBruno.reproduccion.reproduciendo).toBe(true);
    expect(posicionEn(conBruno, 1_500)).toBe(500);
    expect(siguienteEntrada(conBruno)?.fuente.id).toBe("b");
  });

  it("no pasa de la duración conocida y la posición se congela en pausa", () => {
    const sala = anadirACola(crearSala("sala-2", { creador: "ana" }), fuente("corta", 800), "ana", 100);
    expect(posicionEn(sala, 2_000)).toBe(800);
    const enPausa = {
      ...sala,
      reproduccion: { ...sala.reproduccion, posicionMs: 300, reproduciendo: false, actualizadoEn: 1_000 },
    };
    expect(posicionEn(enPausa, 9_000)).toBe(300);
  });

  it("solo quien controla salta o avanza, y al saltar la posición vuelve a cero", () => {
    const conDos = anadirACola(
      anadirACola(crearSala("sala-3", { creador: "ana", oyentes: ["ana", "bruno"] }), fuente("a"), "ana", 1_000),
      fuente("b"),
      "bruno",
      1_100,
    );
    expect(saltarA(conDos, "sala-3:b:2", "bruno", 2_000)).toBe(conDos);

    const conAna = saltarA(conDos, "sala-3:b:2", "ana", 2_000);
    expect(conAna.reproduccion.entradaId).toBe("sala-3:b:2");
    expect(posicionEn(conAna, 2_500)).toBe(500);

    const avanzada = avanzar(conAna, "ana", 3_000);
    expect(avanzada.reproduccion.entradaId).toBe("sala-3:a:1");
    expect(posicionEn(avanzada, 3_000)).toBe(0);
  });

  it("recorre los tres modos de control: una, las elegidas y todas", () => {
    const una = crearSala("sala-4", {
      creador: "ana",
      oyentes: ["ana", "bruno", "carla"],
      control: "una",
      controladores: ["ana"],
    });
    expect(puedeControlar(una, "ana")).toBe(true);
    expect(puedeControlar(una, "bruno")).toBe(false);

    const elegidas = cambiarControl(una, "ana", "elegidas", ["ana", "bruno"]);
    expect(controladoresEfectivos(elegidas)).toEqual(["ana", "bruno"]);
    expect(puedeControlar(elegidas, "bruno")).toBe(true);
    expect(puedeControlar(elegidas, "carla")).toBe(false);

    const todas = cambiarControl(elegidas, "bruno", "todas", []);
    expect(controladoresEfectivos(todas)).toEqual(["ana", "bruno", "carla"]);
    expect(puedeControlar(todas, "carla")).toBe(true);

    const fuera = cambiarControl(todas, "dani", "una", ["dani"]);
    expect(fuera).toBe(todas);
  });

  it("la visibilidad decide entre público, contactos, sala y nada", () => {
    const base = crearSala("sala-5", { creador: "ana", oyentes: ["ana", "bruno"] });
    expect(visibilidadPermitida({ ...base, visibilidad: "publico" }, "zoe")).toBe(true);
    expect(visibilidadPermitida({ ...base, visibilidad: "contactos" }, "zoe", true)).toBe(true);
    expect(visibilidadPermitida({ ...base, visibilidad: "contactos" }, "zoe", false)).toBe(false);
    expect(visibilidadPermitida({ ...base, visibilidad: "sala" }, "bruno")).toBe(true);
    expect(visibilidadPermitida({ ...base, visibilidad: "sala" }, "zoe")).toBe(false);
    expect(visibilidadPermitida({ ...base, visibilidad: "nada" }, "ana")).toBe(false);
  });
});

describe("mezcla de fuentes con Web Audio", () => {
  it("convierte niveles en ganancia lineal y trata el silencio como cero", () => {
    expect(gananciaLineal(0)).toBe(1);
    expect(gananciaLineal(-6)).toBeCloseTo(0.501187, 5);
    expect(gananciaLineal(SILENCIO_DB)).toBe(0);
    expect(dbDesdeGanancia(1)).toBeCloseTo(0, 6);
    expect(dbDesdeGanancia(0.5)).toBeCloseTo(-6.0206, 4);
    expect(dbDesdeGanancia(0)).toBe(SILENCIO_DB);
  });

  it("en turnos solo suena el canal de turno; en mezcla suenan todos los activos", () => {
    const a = crearCanal("a");
    const b = crearCanal("b", { nivelDb: -6 });
    const mudo = crearCanal("c", { activo: false });
    const turnos = { modo: "turnos" as const, canales: [a, b, mudo], turnoDe: "a" };
    expect(gananciaEfectiva(a, turnos)).toBe(1);
    expect(gananciaEfectiva(b, turnos)).toBe(0);
    expect(gananciaEfectiva(mudo, turnos)).toBe(0);

    const mezcla = { modo: "mezcla" as const, canales: [a, b, mudo], turnoDe: null };
    expect(gananciaEfectiva(a, mezcla)).toBe(1);
    expect(gananciaEfectiva(b, mezcla)).toBeCloseTo(0.501187, 5);
    expect(gananciaEfectiva(mudo, mezcla)).toBe(0);
  });

  it("limita los picos por encima del umbral con la curva del compresor", () => {
    const canal = crearCanal("a", {
      limitador: { umbralDb: -6, ratio: 4, ataqueMs: 5, liberacionMs: 250 },
    });
    const dentro = limitarPico(-9, canal.limitador);
    expect(dentro.reduccionDb).toBe(0);
    expect(dentro.atacando).toBe(false);

    const fuera = limitarPico(0, canal.limitador);
    expect(fuera.reduccionDb).toBeCloseTo(-4.5, 6);
    expect(fuera.picoSalidaDb).toBeCloseTo(-4.5, 6);
    expect(fuera.atacando).toBe(true);
  });

  it("mapea a Web Audio con ataque y liberación en segundos y Q áureo", () => {
    const canal = crearCanal("a", {
      limitador: { umbralDb: -3, ratio: 12, ataqueMs: 5, liberacionMs: 250 },
    });
    const p = parametrosWebAudio(canal);
    expect(p.ganancia).toBe(1);
    expect(p.bandas.map((b) => b.frequency)).toEqual([89, 233, 610, 1597, 4181]);
    expect(p.bandas.every((b) => b.Q === PROPORCION_AUREA)).toBe(true);
    expect(p.bandas.every((b) => b.type === "peaking")).toBe(true);
    expect(p.compresor.attack).toBe(0.005);
    expect(p.compresor.release).toBe(0.25);
    expect(p.compresor.threshold).toBe(-3);
    expect(p.compresor.ratio).toBe(12);
  });

  it("reparte la ganancia maestra para que varias fuentes no sumen más de uno", () => {
    const a = crearCanal("a");
    const b = crearCanal("b");
    const resuelta = resolverMezcla({ modo: "mezcla", canales: [a, b], turnoDe: null });
    expect(resuelta.gananciaMaestra).toBeCloseTo(1 / Math.SQRT2, 6);
    expect(resuelta.canales.find((c) => c.fuenteId === "a")?.ganancia).toBe(1);
    expect(resuelta.canales.find((c) => c.fuenteId === "b")?.ganancia).toBe(1);
  });

  it("rota los turnos entre los canales activos y salta los apagados", () => {
    const a = crearCanal("a");
    const b = crearCanal("b");
    const c = crearCanal("c", { activo: false });
    const m0 = { modo: "turnos" as const, canales: [a, b, c], turnoDe: "a" };
    const m1 = siguienteTurno(m0);
    expect(m1.turnoDe).toBe("b");
    const m2 = siguienteTurno(m1);
    expect(m2.turnoDe).toBe("a");
    expect(siguienteTurno({ ...m2, canales: [c], turnoDe: "a" }).turnoDe).toBeNull();
  });
});
