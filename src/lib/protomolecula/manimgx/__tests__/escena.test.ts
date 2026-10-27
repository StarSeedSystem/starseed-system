import { describe, it, expect } from "vitest";
import { validarEscena, clasesEscena, type EscenaManim } from "../escena";

const ESCENA_2D = [
  "from manim import Scene, Circle, Create, Wait",
  "",
  "class CirculoAparece(Scene):",
  "    def construct(self):",
  "        circulo = Circle()",
  "        self.play(Create(circulo))",
  "        self.wait(1)",
].join("\n");

const ESCENA_3D = [
  "import numpy as np",
  "from manim import ThreeDScene, Cube, ThreeDAxes, DEGREES, RIGHT",
  "",
  "class CuboGiratorio(ThreeDScene):",
  "    def construct(self):",
  "        cubo = Cube().set_fill(np.array([0.2, 0.6, 1.0]))",
  "        self.set_camera_orientation(phi=75 * DEGREES)",
  "        self.begin_ambient_camera_rotation(rate=0.2)",
  "        self.play(cubo.animate.rotate(0.5, RIGHT), run_time=2)",
].join("\n");

const escenaReal: EscenaManim = {
  codigo: ESCENA_3D,
  clase: "CuboGiratorio",
  calidad: "1080p",
  fps: 60,
  duracionMax: 30,
};

describe("clasesEscena", () => {
  it("lee los nombres de las clases en orden", () => {
    expect(clasesEscena(ESCENA_3D)).toEqual(["CuboGiratorio"]);
  });

  it("admite clases ayudantes junto a la escena", () => {
    const codigo = [
      "class Cubo(Cube):",
      "    pass",
      "",
      "class Fin(Scene):",
      "    pass",
    ].join("\n");
    expect(clasesEscena(codigo)).toEqual(["Cubo", "Fin"]);
  });

  it("devuelve vacío si no hay clases", () => {
    expect(clasesEscena("x = 1")).toEqual([]);
  });
});

describe("validarEscena · escenas buenas", () => {
  it("acepta una escena 2D simple", () => {
    expect(validarEscena(ESCENA_2D)).toEqual({ ok: true });
  });

  it("acepta una ThreeDScene con cubo y rotación de cámara", () => {
    expect(validarEscena(ESCENA_3D)).toEqual({ ok: true });
  });

  it("acepta imports con alias y de varios módulos permitidos", () => {
    const codigo = [
      "import numpy as np",
      "import math",
      "from manimgx import EscenaBase",
      "from manim import Scene",
      "",
      "class Todo(Scene):",
      "    def construct(self):",
      "        self.play(Create(Circle().set_fill(np.array(math.tau))))",
    ].join("\n");
    expect(validarEscena(codigo)).toEqual({ ok: true });
  });

  it("acepta una escena con clase ayudante que no es de Manim", () => {
    const codigo = [
      "from manim import Scene, Square",
      "",
      "class Cuadrado(Square):",
      "    pass",
      "",
      "class Final(Scene):",
      "    def construct(self):",
      "        self.play(Create(Cuadrado()))",
    ].join("\n");
    expect(validarEscena(codigo)).toEqual({ ok: true });
  });

  it("la ficha tipo EscenaManim queda rellena con la escena 3D", () => {
    expect(escenaReal.clase).toBe("CuboGiratorio");
    expect(escenaReal.calidad).toBe("1080p");
    expect(escenaReal.fps).toBe(60);
    expect(escenaReal.duracionMax).toBe(30);
    expect(validarEscena(escenaReal.codigo)).toEqual({ ok: true });
  });
});

describe("validarEscena · escenas malas", () => {
  it("rechaza código vacío", () => {
    const resultado = validarEscena("   \n  ");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivos[0]).toMatch(/está vacía/);
  });

  it("rechaza imports fuera de lo permitido, con el módulo en el motivo", () => {
    const codigo = [
      "import os",
      "",
      "class UsaSolo(Scene):",
      "    def construct(self):",
      "        self.wait(1)",
    ].join("\n");
    const resultado = validarEscena(codigo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivos.join(" ")).toMatch(/«os» no permitido/);
  });

  it("rechaza ejecución de código: exec, eval y __import__", () => {
    for (const trampa of ["exec(entrada)", "eval('1+1')", "__import__('os')"]) {
      const codigo = [
        "from manim import Scene",
        "",
        "class Trampa(Scene):",
        "    def construct(self):",
        `        ${trampa}`,
      ].join("\n");
      const resultado = validarEscena(codigo);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.motivos.join(" ")).toContain(trampa.split("(")[0]);
      }
    }
  });

  it("rechaza disco («open(»), procesos (subprocess) y sistema (os., sys.)", () => {
    const codigo = [
      "import subprocess",
      "import os",
      "import sys",
      "",
      "class Peligro(Scene):",
      "    def construct(self):",
      "        datos = open('secreto.txt')",
      "        subprocess.run(['ls'])",
      "        os.system('ls')",
      "        sys.exit(1)",
    ].join("\n");
    const resultado = validarEscena(codigo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivos.join(" ")).toMatch(/open\(/);
      expect(resultado.motivos.join(" ")).toMatch(/subprocess/);
      expect(resultado.motivos.join(" ")).toMatch(/os\./);
      expect(resultado.motivos.join(" ")).toMatch(/sys\./);
    }
  });

  it("rechaza red: requests, urllib, socket y fetch", () => {
    const codigos = [
      [
        "import requests",
        "from manim import Scene",
        "",
        "class VoyPorRed(Scene):",
        "    def construct(self):",
        "        requests.get('https://ejemplo.com')",
      ].join("\n"),
      [
        "import urllib.request",
        "from manim import Scene",
        "",
        "class Volcado(Scene):",
        "    def construct(self):",
        "        urlopen('http://ejemplo.com')",
      ].join("\n"),
      [
        "import socket",
        "from manim import Scene",
        "",
        "class Escucha(Scene):",
        "    def construct(self):",
        "        bocina = socket.socket()",
      ].join("\n"),
      [
        "from manim import Scene",
        "",
        "class Grito(Scene):",
        "    def construct(self):",
        "        fetch('http://ejemplo.com')",
      ].join("\n"),
    ];
    for (const codigo of codigos) {
      const resultado = validarEscena(codigo);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) expect(resultado.motivos.join(" ")).toMatch(/red/);
    }
  });

  it("rechaza imports relativos a secretos", () => {
    const codigo = [
      "from .secreto import CLAVE",
      "",
      "class OjoCiego(Scene):",
      "    def construct(self):",
      "        self.wait(1)",
    ].join("\n");
    const resultado = validarEscena(codigo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivos.join(" ")).toMatch(/«\.secreto»/);
  });

  it("rechaza código sin clases y clases que no heredan de escena", () => {
    expect(validarEscena("x = 1").ok).toBe(false);
    const sinEscena = [
      "from manim import Circle",
      "",
      "class Algo:",
      "    pass",
    ].join("\n");
    const resultado = validarEscena(sinEscena);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivos.join(" ")).toMatch(/Ninguna clase hereda/);
  });

  it("acumula varios motivos distintos a la vez", () => {
    const codigo = [
      "import os",
      "from manim import Scene",
      "",
      "class Mal(Scene):",
      "    def construct(self):",
      "        open('a.txt')",
      "        eval('1')",
    ].join("\n");
    const resultado = validarEscena(codigo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivos.length).toBeGreaterThanOrEqual(3);
  });
});
