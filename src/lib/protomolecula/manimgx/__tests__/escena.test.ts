import { describe, it, expect } from "vitest";
import {
  clasesEscena,
  validarEscena,
  type EscenaManimContrato,
} from "../escena";

const CUBO_TRES_DE: string[] = [
  "from manim import ThreeDScene, Cube, Rotate, deg",
  "",
  "class CuboProtomolecula(ThreeDScene):",
  "    def construct(self):",
  "        cubo = Cube(side_length=2.0)",
  "        self.set_camera_orientation(phi=75 * deg, theta=30 * deg)",
  "        self.add(cubo)",
  "        self.play(Rotate(cubo, axis=[0, 1, 0], angle=2)),",
];

const ESCENA_PLANA: string[] = [
  "import numpy as np",
  "from manim import Scene, Circle",
  "",
  "class CirculoVesica(Scene):",
  "    def construct(self):",
  "        self.add(Circle(radius=1.618))",
];

describe("validarEscena", () => {
  it("acepta una escena ThreeDScene con cubo y rotación de cámara", () => {
    const resultado = validarEscena(CUBO_TRES_DE.join("\n"));
    expect(resultado).toEqual({ ok: true });
  });

  it("acepta una escena plana de Scene con numpy", () => {
    const resultado = validarEscena(ESCENA_PLANA.join("\n"));
    expect(resultado).toEqual({ ok: true });
  });

  it("rechaza el código vacío", () => {
    const resultado = validarEscena("   \n  ");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivos[0]).toContain("vacía");
  });

  it("rechaza imports fuera de los módulos permitidos", () => {
    const codigo = [
      "from scipy import spatial",
      "class Escena(Scene):",
      "    def construct(self):",
      "        pass",
    ].join("\n");
    const resultado = validarEscena(codigo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivos.some((m) => m.includes("scipy"))).toBe(true);
    }
  });
});

describe("prohibiciones de validarEscena", () => {
  const casos: { nombre: string; fragmento: string }[] = [
    { nombre: "open(", fragmento: "open('/etc/passwd')" },
    { nombre: "exec(", fragmento: "exec('pass')" },
    { nombre: "eval(", fragmento: "eval('2+2')" },
    { nombre: "__import__", fragmento: "__import__('os')" },
    { nombre: "subprocess", fragmento: "import subprocess" },
    { nombre: "os.", fragmento: "import os\nos.environ" },
    { nombre: "sys.", fragmento: "import sys\nsys.argv" },
    { nombre: "networking", fragmento: "import socket" },
  ];

  for (const caso of casos) {
    it(`rechaza ${caso.nombre} con motivo legible`, () => {
      const codigo = [
        "from manim import Scene",
        "class Escena(Scene):",
        "    def construct(self):",
        `        ${caso.fragmento}`,
      ].join("\n");
      const resultado = validarEscena(codigo);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.motivos.length).toBeGreaterThan(0);
        if (caso.nombre === "__import__") {
          expect(resultado.motivos.some((m) => m.includes("__import__"))).toBe(true);
        }
      }
    });
  }
});

describe("clasesEscena y contrato", () => {
  it("devuelve los nombres de las clases en orden", () => {
    expect(clasesEscena(CUBO_TRES_DE.join("\n"))).toEqual(["CuboProtomolecula"]);
  });

  it("un contrato válido respeta los tipos declarados", () => {
    const contrato: EscenaManimContrato = {
      codigo: CUBO_TRES_DE.join("\n"),
      clase: "CuboProtomolecula",
      calidad: "1080p",
      fps: 30,
      duracionMax: 12,
    };
    expect(contrato.calidad).toBe("1080p");
    expect(contrato.fps).toBe(30);
  });
});
