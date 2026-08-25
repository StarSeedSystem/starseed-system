/**
 * oficina-ocupantes.test.ts — Las dos derivaciones puras que el encargo pide
 * medir con números: ocupante→posición (agrupar, filotaxis, vestíbulo para
 * referencias colgantes) y actividad→animación (y su apagado total sin
 * `datosReales`, que es justo lo que `oficina-honestidad.ts` exige que
 * respete todo lo demás).
 */
import { describe, it, expect } from "vitest";
import {
  agruparPorSala,
  contarPorSala,
  describirOcupante,
  formatoTranscurrido,
  parametrosActividad,
  posicionEnPatron,
  posicionOcupante,
} from "../oficina-ocupantes";
import { disponerSalas } from "../oficina-salas";
import type { ActividadOcupante, OcupanteOficina, SalaOficina } from "@/lib/astraura/genesis-types";

function ocupante(parcial: Partial<OcupanteOficina> & { serId: string }): OcupanteOficina {
  return { salaId: null, actividad: "inactivo", procesoId: null, detalle: null, desde: 0, ...parcial };
}

function sala(parcial: Partial<SalaOficina> & { id: string }): SalaOficina {
  return { nombre: parcial.id, procesoTipoId: null, actividad: 0, color: null, ...parcial };
}

const ACTIVIDADES: readonly ActividadOcupante[] = ["pensando", "hablando", "trabajando", "inactivo"];

// ─────────────────────────────────────────────────────── agruparPorSala / contarPorSala

describe("agruparPorSala", () => {
  it("sin ocupantes, no crea ni siquiera el grupo del vestíbulo", () => {
    expect(agruparPorSala([], new Set()).size).toBe(0);
  });

  it("agrupa por sala válida y ordena cada grupo por serId (estable, no por llegada)", () => {
    const grupo = agruparPorSala(
      [ocupante({ serId: "z", salaId: "a" }), ocupante({ serId: "a", salaId: "a" }), ocupante({ serId: "m", salaId: "a" })],
      new Set(["a"]),
    );
    expect(grupo.get("a")!.map((o) => o.serId)).toEqual(["a", "m", "z"]);
  });

  it("una sala inexistente (referencia colgante) cae en el grupo null junto a los sin sala", () => {
    const grupo = agruparPorSala(
      [ocupante({ serId: "1", salaId: "fantasma" }), ocupante({ serId: "2", salaId: null })],
      new Set(["real"]),
    );
    expect(grupo.get("real")).toBeUndefined();
    expect(grupo.get(null)!.map((o) => o.serId)).toEqual(["1", "2"]);
  });
});

describe("contarPorSala", () => {
  it("cuenta cada sala real y excluye el vestíbulo", () => {
    const grupo = agruparPorSala(
      [ocupante({ serId: "1", salaId: "a" }), ocupante({ serId: "2", salaId: "a" }), ocupante({ serId: "3", salaId: null })],
      new Set(["a"]),
    );
    const conteo = contarPorSala(grupo);
    expect(conteo.get("a")).toBe(2);
    expect([...conteo.keys()]).toEqual(["a"]); // el vestíbulo (null) nunca aparece aquí
  });
});

// ─────────────────────────────────────────────────────── posición

describe("posicionEnPatron", () => {
  const centro = { x: 5, y: 0, z: -3 };

  it("es determinista: mismo índice y total, siempre el mismo punto", () => {
    expect(posicionEnPatron(centro, 3, 2, 10)).toEqual(posicionEnPatron(centro, 3, 2, 10));
  });

  it("índices distintos dentro del mismo total producen puntos distintos (nadie se solapa por construcción)", () => {
    const puntos = Array.from({ length: 12 }, (_, i) => posicionEnPatron(centro, 3, i, 12));
    const claves = new Set(puntos.map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`));
    expect(claves.size).toBe(12);
  });

  it("ningún punto se sale del radio útil dado", () => {
    for (let i = 0; i < 20; i++) {
      const p = posicionEnPatron(centro, 4, i, 20);
      expect(Math.hypot(p.x - centro.x, p.z - centro.z)).toBeLessThanOrEqual(4 + 1e-9);
    }
  });
});

describe("posicionOcupante", () => {
  const salas = [sala({ id: "a" }), sala({ id: "b" })];
  const disposicion = disponerSalas(salas, new Map([["a", 2]]));

  it("con sala válida, la posición cae dentro de esa sala", () => {
    const p = posicionOcupante({ salaId: "a" }, 0, 2, disposicion);
    const centroA = disposicion.salas.get("a")!.centro;
    expect(Math.hypot(p.x - centroA.x, p.z - centroA.z)).toBeLessThan(disposicion.salas.get("a")!.radio);
  });

  it("sin sala (null), cae en el vestíbulo, no en el origen ni en ninguna sala", () => {
    const p = posicionOcupante({ salaId: null }, 0, 1, disposicion);
    expect(Math.hypot(p.x - disposicion.centroVestibulo.x, p.z - disposicion.centroVestibulo.z)).toBeLessThan(disposicion.radioVestibulo);
  });

  it("con una sala que no existe en la disposición, también cae en el vestíbulo (no rompe)", () => {
    const p = posicionOcupante({ salaId: "no-existe" }, 0, 1, disposicion);
    expect(Math.hypot(p.x - disposicion.centroVestibulo.x, p.z - disposicion.centroVestibulo.z)).toBeLessThan(disposicion.radioVestibulo);
  });
});

// ─────────────────────────────────────────────────────── actividad → animación

describe("parametrosActividad", () => {
  it("sin datos reales, TODO es cero — sin importar la actividad declarada", () => {
    for (const actividad of ACTIVIDADES) {
      expect(parametrosActividad(actividad, false)).toEqual({
        amplitudBob: 0,
        frecuenciaBobHz: 0,
        oscilacionLateral: 0,
        velocidadGiroExtra: 0,
        escalaExtra: 0,
      });
    }
  });

  it("inactivo, incluso con datos reales, no añade animación extra", () => {
    const p = parametrosActividad("inactivo", true);
    expect(p.amplitudBob).toBe(0);
    expect(p.oscilacionLateral).toBe(0);
    expect(p.velocidadGiroExtra).toBe(0);
    expect(p.escalaExtra).toBe(0);
  });

  it("hablando es el único que balancea lateralmente (gesticular)", () => {
    for (const actividad of ACTIVIDADES) {
      const p = parametrosActividad(actividad, true);
      if (actividad === "hablando") expect(p.oscilacionLateral).toBeGreaterThan(0);
      else expect(p.oscilacionLateral).toBe(0);
    }
  });

  it("pensando es el único con giro extra continuo (contemplativo)", () => {
    for (const actividad of ACTIVIDADES) {
      const p = parametrosActividad(actividad, true);
      if (actividad === "pensando") expect(p.velocidadGiroExtra).toBeGreaterThan(0);
      else expect(p.velocidadGiroExtra).toBe(0);
    }
  });

  it("trabajando tiene el vaivén más marcado — foco constante, más que pensar", () => {
    const trabajando = parametrosActividad("trabajando", true);
    const pensando = parametrosActividad("pensando", true);
    expect(trabajando.amplitudBob).toBeGreaterThan(pensando.amplitudBob);
    expect(trabajando.frecuenciaBobHz).toBeGreaterThan(pensando.frecuenciaBobHz);
  });
});

// ─────────────────────────────────────────────────────── texto accesible

describe("formatoTranscurrido", () => {
  it("menos de 5s: 'justo ahora'", () => {
    expect(formatoTranscurrido(1000, 1000)).toBe("justo ahora");
    expect(formatoTranscurrido(1000, 1004)).toBe("justo ahora");
  });

  it("segundos, minutos, horas y días, en epoch-milisegundos", () => {
    const ahora = 1_700_000_000_000;
    expect(formatoTranscurrido(ahora - 30_000, ahora)).toBe("hace 30 s");
    expect(formatoTranscurrido(ahora - 5 * 60_000, ahora)).toBe("hace 5 min");
    expect(formatoTranscurrido(ahora - 3 * 3_600_000, ahora)).toBe("hace 3 h");
    expect(formatoTranscurrido(ahora - 5 * 86_400_000, ahora)).toBe("hace 5 d");
  });

  it("el mismo resultado si `desde`/`ahora` llegan en epoch-segundos en vez de milisegundos", () => {
    const ahoraMs = 1_700_000_000_000;
    const ahoraS = Math.floor(ahoraMs / 1000);
    expect(formatoTranscurrido(ahoraS - 300, ahoraS)).toBe(formatoTranscurrido(ahoraMs - 300_000, ahoraMs));
  });

  it("nunca da un transcurrido negativo aunque `desde` sea posterior a `ahora` (reloj desincronizado)", () => {
    expect(formatoTranscurrido(2000, 1000)).toBe("justo ahora");
  });
});

describe("describirOcupante", () => {
  it("combina nombre, actividad, detalle y transcurrido en una sola frase", () => {
    const texto = describirOcupante({ actividad: "trabajando", detalle: "compilando el módulo", desde: 1000 }, "Aurora", 1000);
    expect(texto).toContain("Aurora");
    expect(texto).toContain("trabajando");
    expect(texto).toContain("compilando el módulo");
  });

  it("sin detalle, no deja un ': ' colgando", () => {
    const texto = describirOcupante({ actividad: "pensando", detalle: null, desde: 1000 }, "Hermes", 1000);
    expect(texto).not.toContain(": justo");
    expect(texto).toContain("Hermes — pensando");
  });
});
