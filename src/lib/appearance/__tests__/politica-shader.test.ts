import { describe, expect, it } from "vitest";
import {
  FPS_CON_BATERIA,
  UMBRAL_BATERIA_BAJA,
  intervaloFotogramaMs,
  modoDeCapa,
  necesitaMotor,
  type EntornoCapa,
} from "../politica-shader";

const base: EntornoCapa = { webgpu: true, reducirMovimiento: false, ahorroBateria: false, bateriaPct: null, visible: true };
const con = (cambios: Partial<EntornoCapa>): EntornoCapa => ({ ...base, ...cambios });

describe("modoDeCapa", () => {
  it("enchufado, visible y con WebGPU → vivo", () => {
    expect(modoDeCapa(base)).toBe("vivo");
  });

  it("sin WebGPU → fijo (no hay camino WebGL)", () => {
    expect(modoDeCapa(con({ webgpu: false }))).toBe("fijo");
  });

  it("«reducir movimiento» → fijo", () => {
    expect(modoDeCapa(con({ reducirMovimiento: true }))).toBe("fijo");
  });

  it("ahorro de batería → fijo, aunque esté enchufado", () => {
    expect(modoDeCapa(con({ ahorroBateria: true }))).toBe("fijo");
  });

  it("con batería y carga suficiente → vivo a 30 fps", () => {
    expect(modoDeCapa(con({ bateriaPct: 80 }))).toBe("vivo-30fps");
    expect(modoDeCapa(con({ bateriaPct: UMBRAL_BATERIA_BAJA + 1 }))).toBe("vivo-30fps");
  });

  it("con la batería baja → fijo", () => {
    expect(modoDeCapa(con({ bateriaPct: UMBRAL_BATERIA_BAJA }))).toBe("fijo");
    expect(modoDeCapa(con({ bateriaPct: 3 }))).toBe("fijo");
  });

  it("oculta → pausado, enchufada o con batería", () => {
    expect(modoDeCapa(con({ visible: false }))).toBe("pausado");
    expect(modoDeCapa(con({ visible: false, bateriaPct: 70 }))).toBe("pausado");
  });

  it("lo fijo gana a lo oculto: una imagen fija no gasta nada", () => {
    expect(modoDeCapa(con({ visible: false, webgpu: false }))).toBe("fijo");
    expect(modoDeCapa(con({ visible: false, reducirMovimiento: true }))).toBe("fijo");
  });

  it("una carga no numérica cuenta como «no se sabe» (enchufado)", () => {
    expect(modoDeCapa(con({ bateriaPct: Number.NaN }))).toBe("vivo");
  });
});

describe("intervaloFotogramaMs y necesitaMotor", () => {
  it("30 fps → unos 33 ms entre fotogramas; vivo sin tope", () => {
    expect(intervaloFotogramaMs("vivo-30fps")).toBe(Math.round(1000 / FPS_CON_BATERIA));
    expect(intervaloFotogramaMs("vivo")).toBe(0);
  });

  it("solo el modo fijo prescinde del motor WebGPU", () => {
    expect(necesitaMotor("fijo")).toBe(false);
    expect(necesitaMotor("pausado")).toBe(true);
    expect(necesitaMotor("vivo")).toBe(true);
    expect(necesitaMotor("vivo-30fps")).toBe(true);
  });
});
