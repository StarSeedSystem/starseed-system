// Pruebas de gestos y motor de entrada XR. Corren en node, sin navegador.
import { describe, it, expect } from "vitest";
import type { Vec3 } from "../tipos";
import {
  crearDetector,
  distanciaPellizco,
  normalDePalma,
  type Articulaciones,
} from "../gestos";
import { crearMotorEntrada, type LecturaMando } from "../entrada-eventos";
import {
  MAPAS_DEFECTO,
  claveGatillo,
  type AccionXR,
  type Gesto,
} from "../vinculos-xr";

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const VACIO: LecturaMando = { botones: [], ejes: [] };

function manoBase(): Articulaciones {
  return {
    wrist: v(0, 0, 0),
    "index-finger-metacarpal": v(0.08, 0, 0),
    "pinky-finger-metacarpal": v(0, 0.08, 0),
  };
}

function manoPellizco(d: number): Articulaciones {
  return { ...manoBase(), "thumb-tip": v(0.05, 0.05, 0), "index-finger-tip": v(0.05 + d, 0.05, 0) };
}

function manoPuno(cerrado: boolean): Articulaciones {
  const c = v(0.08 / 3, 0.08 / 3, 0);
  const d = cerrado ? 0.03 : 0.15;
  const fuera = (p: Vec3): Vec3 => v(p.x + d, p.y + d, p.z);
  return {
    ...manoBase(),
    "index-finger-tip": fuera(c),
    "middle-finger-tip": fuera(c),
    "ring-finger-tip": fuera(c),
    "pinky-finger-tip": fuera(c),
  };
}

function disparar(det: ReturnType<typeof crearDetector>, art: Articulaciones, ctx: Parameters<ReturnType<typeof crearDetector>["actualizar"]>[1], t0: number) {
  det.actualizar(art, ctx, t0);
  return det.actualizar(art, ctx, t0 + 120);
}

const CABEZA = v(0, 0, 1);

describe("gestos puros", () => {
  it("distanciaPellizco mide pulgar-índice", () => {
    expect(distanciaPellizco(manoPellizco(0.02))).toBeCloseTo(0.02);
    expect(distanciaPellizco({})).toBeNull();
  });

  it("normalDePalma devuelve null sin articulaciones y vector unitario si las hay", () => {
    expect(normalDePalma({}, "izquierda")).toBeNull();
    const n = normalDePalma(manoBase(), "izquierda");
    expect(n).not.toBeNull();
    expect(Math.hypot(n!.x, n!.y, n!.z)).toBeCloseTo(1);
  });

  it("pellizco cierra a < 1,5 cm con retención de 120 ms", () => {
    const d = crearDetector("pellizco");
    expect(d.actualizar(manoPellizco(0.01), {}, 0).flanco).toBeNull();
    expect(d.actualizar(manoPellizco(0.01), {}, 100).activo).toBe(false);
    const r = d.actualizar(manoPellizco(0.01), {}, 120);
    expect(r).toEqual({ activo: true, flanco: "sube" });
  });

  it("pellizco no parpadea en la zona muerta (2 cm)", () => {
    const d = crearDetector("pellizco");
    disparar(d, manoPellizco(0.01), {}, 0);
    for (let t = 200; t <= 400; t += 50) {
      const r = d.actualizar(manoPellizco(0.02), {}, t);
      expect(r.activo).toBe(true);
      expect(r.flanco).toBeNull();
    }
  });

  it("pellizco abre a > 3 cm con flanco baja", () => {
    const d = crearDetector("pellizco");
    disparar(d, manoPellizco(0.01), {}, 0);
    d.actualizar(manoPellizco(0.04), {}, 300);
    const r = d.actualizar(manoPellizco(0.04), {}, 420);
    expect(r).toEqual({ activo: false, flanco: "baja" });
  });

  it("puño cerrado con las cuatro puntas cerca del centro de la palma", () => {
    const d = crearDetector("puno-cerrado");
    expect(disparar(d, manoPuno(true), {}, 0).flanco).toBe("sube");
    expect(disparar(d, manoPuno(false), {}, 400).flanco).toBe("baja");
  });

  it("palma a la cara se activa con la normal hacia la cabeza", () => {
    const d = crearDetector("palma-a-la-cara");
    const art = { ...manoBase(), "thumb-tip": v(0.05, 0.05, 0.1), "index-finger-tip": v(0.06, 0.05, 0.1) };
    expect(disparar(d, art, { cabeza: CABEZA }, 0).flanco).toBe("sube");
  });

  it("tocar la muñeca con el índice de la otra mano", () => {
    const d = crearDetector("tocar-muneca");
    const art = { ...manoBase(), "index-finger-tip": v(0.5, 0, 0.01) };
    const otra = { wrist: v(0.5, 0, 0) };
    expect(disparar(d, art, { otraMano: otra }, 0).flanco).toBe("sube");
    const lejos = { wrist: v(0.9, 0, 0) };
    expect(disparar(d, art, { otraMano: lejos }, 400).flanco).toBe("baja");
  });

  it("pellizco con la palma hacia ti (gesto del sistema) no dispara", () => {
    const d = crearDetector("pellizco");
    const art: Articulaciones = {
      ...manoBase(),
      "thumb-tip": v(0.05, 0.05, 0),
      "index-finger-tip": v(0.05, 0.05, 0),
    };
    expect(disparar(d, art, { cabeza: CABEZA }, 0).flanco).toBeNull();
    expect(d.actualizar(art, { cabeza: CABEZA }, 500).activo).toBe(false);
  });
});

function accionPorPrefijo(prefijo: string) {
  const entrada = MAPAS_DEFECTO.find((e) => claveGatillo(e.gatillo).startsWith(prefijo));
  if (!entrada) throw new Error(`falta entrada ${prefijo} en MAPAS_DEFECTO`);
  return entrada.accion;
}

describe("motor de entrada", () => {
  it("un botón mantenido dispara una sola vez", () => {
    const motor = crearMotorEntrada(MAPAS_DEFECTO);
    const lectura: LecturaMando = { botones: [true], ejes: [] };
    const primera = motor.botones(VACIO, lectura, 0);
    expect(primera.length).toBeGreaterThan(0);
    expect(motor.botones(VACIO, lectura, 50)).toEqual([]);
    motor.botones(VACIO, { botones: [false], ejes: [] }, 100);
    expect(motor.botones(VACIO, lectura, 150).length).toBeGreaterThan(0);
  });

  it("las dos manos se detectan por separado", () => {
    const motor = crearMotorEntrada(MAPAS_DEFECTO);
    const izq: LecturaMando = { botones: [], ejes: [] };
    const der: LecturaMando = { botones: [false, true], ejes: [] };
    const acciones = motor.botones(izq, der, 0);
    const esperada = MAPAS_DEFECTO.find((e) => claveGatillo(e.gatillo) === "boton:derecha:1");
    if (esperada) expect(acciones).toContain(esperada.accion);
  });

  it("el eje del stick dispara giro-derecha una vez por empuje", () => {
    const motor = crearMotorEntrada(MAPAS_DEFECTO);
    const accion = accionPorPrefijo("eje:");
    const empuje: LecturaMando = { botones: [], ejes: [0, 0, 0.9, 0] };
    const reposo: LecturaMando = { botones: [], ejes: [0, 0, 0, 0] };
    expect(motor.botones(VACIO, empuje, 0)).toContain(accion);
    expect(motor.botones(VACIO, empuje, 30)).toEqual([]);
    motor.botones(VACIO, reposo, 60);
    expect(motor.botones(VACIO, empuje, 100)).toEqual([]);
    motor.botones(VACIO, reposo, 130);
    expect(motor.botones(VACIO, empuje, 400)).toContain(accion);
  });

  it("histéresis de eje: 0,5 no suelta y 0,1 sí", () => {
    const motor = crearMotorEntrada(MAPAS_DEFECTO);
    const accion = accionPorPrefijo("eje:");
    const casi: LecturaMando = { botones: [], ejes: [0, 0, 0.5, 0] };
    const suelto: LecturaMando = { botones: [], ejes: [0, 0, 0.1, 0] };
    const empuje: LecturaMando = { botones: [], ejes: [0, 0, 0.9, 0] };
    motor.botones(VACIO, empuje, 0);
    expect(motor.botones(VACIO, casi, 50)).toEqual([]);
    motor.botones(VACIO, suelto, 100);
    expect(motor.botones(VACIO, empuje, 400)).toContain(accion);
  });

  it("salir por tecla Escape", () => {
    const motor = crearMotorEntrada(MAPAS_DEFECTO);
    expect(motor.tecla("Escape", 0)).toContain(accionPorPrefijo("tecla:"));
  });

  it("salir por la frase «salir», sin importar mayúsculas", () => {
    const motor = crearMotorEntrada(MAPAS_DEFECTO);
    const accion = accionPorPrefijo("frase:");
    expect(motor.frase("salir")).toContain(accion);
    expect(motor.frase("  SALIR ")).toContain(accion);
  });

  it("los gestos solo disparan al subir", () => {
    const motor = crearMotorEntrada(MAPAS_DEFECTO);
    const entrada = MAPAS_DEFECTO.find((e) => claveGatillo(e.gatillo).startsWith("gesto:"));
    if (!entrada) return;
    const clave = claveGatillo(entrada.gatillo).split(":");
    const g = clave[1] as Gesto;
    const mano = (clave[2] === "cualquiera" ? "cualquiera" : clave[2]) as never;
    expect(motor.gesto(g, mano, true)).toContain(entrada.accion);
    expect(motor.gesto(g, mano, false)).toEqual([]);
  });

  it("MAPAS_DEFECTO: cada entrada produce su acción por su canal", () => {
    const motor = crearMotorEntrada(MAPAS_DEFECTO);
    const acciones = new Set<AccionXR>();
    for (const entrada of MAPAS_DEFECTO) {
      const partes = claveGatillo(entrada.gatillo).split(":");
      const tipo = partes[0];
      let salida: AccionXR[] = [];
      const t = Math.random() * 100000 + 1000;
      if (tipo === "boton") {
        const mano = partes[1];
        const i = Number(partes[2]);
        const lectura: LecturaMando = { botones: [], ejes: [] };
        lectura.botones[i] = true;
        salida = mano === "izquierda" ? motor.botones(lectura, VACIO, t) : motor.botones(VACIO, lectura, t);
      } else if (tipo === "eje") {
        const mano = partes[1];
        const eje = Number(partes[2]);
        const lectura: LecturaMando = { botones: [], ejes: [] };
        lectura.ejes[eje] = partes[3] === "+" ? 0.9 : -0.9;
        const antes = mano === "izquierda" ? motor.botones(lectura, VACIO, t - 400) : motor.botones(VACIO, lectura, t - 400);
        void antes;
        const reposo: LecturaMando = { botones: [], ejes: [] };
        motor.botones(reposo, reposo, t - 300);
        salida = mano === "izquierda" ? motor.botones(lectura, VACIO, t) : motor.botones(VACIO, lectura, t);
      } else if (tipo === "tecla") {
        salida = motor.tecla(partes.slice(1).join(":"), t);
      } else if (tipo === "frase") {
        salida = motor.frase(partes.slice(1).join(":"));
      } else if (tipo === "gesto") {
        salida = motor.gesto(partes[1] as Gesto, "cualquiera", true);
      }
      acciones.add(entrada.accion);
      expect(salida, `entrada ${claveGatillo(entrada.gatillo)}`).toContain(entrada.accion);
    }
    expect(acciones.size).toBeGreaterThanOrEqual(7);
  });
});
