import { describe, it, expect } from "vitest";
import type { NivelCalidad } from "@/lib/xr/tipos";

import {
  seleccionarCuerpos,
  mundoCon,
  obj,
  cuerpo,
  crearMundoFisico,
  MAX_PASOS_FOTOGRAMA,
  codificarPoses,
  decodificarPoses,
  interpolarPoses,
  type PosesRecibidas,
  type Vec3,
} from "../fisica-rapier";

describe("fisica-rapier", () => {
  it("respeta cuerposMax y se queda con los más cercanos al spawn", () => {
    const lejos: ReturnType<typeof obj>[] = [1, 2, 3, 4, 5].map((d) =>
      obj(`lejos-${d}`, [d * 10, 0, 0] as Vec3, cuerpo("dinamico"))
    );
    const fijos = [
      obj("suelo-a", [0, -1, 0] as Vec3, cuerpo("fijo", "caja")),
      obj("suelo-b", [1, -1, 0] as Vec3, cuerpo("fijo", "caja")),
    ];
    const r = seleccionarCuerpos(mundoCon([...fijos, ...lejos]), 2);
    expect(r.recortados).toBe(3);
    expect(r.cuerpos.filter((o) => o.id.startsWith("lejos-")).map((o) => o.id)).toEqual(["lejos-1", "lejos-2"]);
    expect(r.cuerpos.filter((o) => o.cuerpo?.tipo === "fijo")).toHaveLength(2);
  });

  it("sin exceso no recorta nada", () => {
    const r = seleccionarCuerpos(
      mundoCon([
        obj("a", [0, 1, 0] as Vec3, cuerpo("dinamico")),
        obj("b", [5, 1, 0] as Vec3, cuerpo("fijo", "caja")),
      ]),
      20
    );
    expect(r.cuerpos).toHaveLength(2);
    expect(r.recortados).toBe(0);
  });

  it("avanza los pasos esperados y acota un dt enorme a 4 (no espiral)", () => {
    const m = crearMundoFisico(false, mundoCon([], { gravedad: -9.81, suelo: false }), "minima");
    expect(m.paso(3 / 30)).toBe(3);
    let pasos = 0;
    // monkey-patch to capture steps
    const originalPaso = m.paso.bind(m);
    m.paso = (dt) => {
      const steps = originalPaso(dt);
      pasos = steps;
      return steps;
    };
    expect(m.paso(9)).toBe(MAX_PASOS_FOTOGRAMA);
    expect(pasos).toBe(MAX_PASOS_FOTOGRAMA);
  });

  it("codificar y decodificar van y vuelven, y lo basura se queda fuera", () => {
    const poses = new Map<Vec3, { pos: Vec3; rot: [number, number, number, number] }>();
    poses.set("pelota", { pos: [1, 2, 3], rot: [0, 0, 0, 1] });
    const cod = codificarPoses(poses);
    expect(cod.pelota).toEqual([1, 2, 3, 0, 0, 0, 1]);
    expect(decodificarPoses(null)).toEqual({});
    expect(decodificarPoses({ a: [1, 2, 3], b: [1, 2, 3, 0, 0, 0, 1] })).toEqual({ b: [1, 2, 3, 0, 0, 0, 1] });
    expect(decodificarPoses({ c: [1, 2, 3, 0, 0, 0, true] as any, d: [1, 2, 3, 0, 0, 0, NaN] })).toEqual({});
  });

  it("interpolarPoses acerca al objetivo y acepta quien llega nuevo", () => {
    const actuales: PosesRecibidas = { pelota: [0, 0, 0, 0, 0, 0, 1] };
    const recibidas: PosesRecibidas = { pelota: [2, 0, 0, 0, 0, 0, 1], nuevo: [1, 1, 1, 0, 0, 0, 1] };
    const r = interpolarPoses(actuales, recibidas, 0.5);
    expect(r.pelota).toEqual([1, 0, 0, 0, 0, 0, 1]);
    expect(r.nuevo).toEqual([1, 1, 1, 0, 0, 0, 1]);
    expect(interpolarPoses(actuales, recibidas, 9).pelota).toEqual([2, 0, 0, 0, 0, 0, 1]);
  });
});