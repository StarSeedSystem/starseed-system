import { describe, expect, it } from "vitest";
import {
  CALIDADES,
  IMPORTS_PERMITIDOS,
  crearEscenaManim,
  extraerClase,
  validarEscena,
  type CalidadEscena,
} from "../escena";

const ESCENA_2D = `from manim import Scene, Text, Write

class HolaStarSeed(Scene):
    def construct(self):
        self.play(Write(Text("StarSeed")))
`;

const ESCENA_3D = `from manim import ThreeDScene, Cube, Write, DEGREES

class CuboRotando(ThreeDScene):
    def construct(self):
        cubo = Cube()
        self.set_camera_orientation(phi=75 * DEGREES, theta=-45 * DEGREES)
        self.play(Write(cubo), run_time=2)
        self.begin_ambient_camera_rotation(rate=0.15)
`;

describe("contrato del módulo escena (ManimGX)", () => {
  it("calidades e imports permitidos son los del contrato", () => {
    expect(CALIDADES).toEqual(["480p", "720p", "1080p"]);
    expect(IMPORTS_PERMITIDOS).toEqual(["manimgx", "manim", "math", "numpy"]);
  });
  it("extrae la clase de escenas 2D y 3D", () => {
    expect(extraerClase(ESCENA_2D)).toBe("HolaStarSeed");
    expect(extraerClase(ESCENA_3D)).toBe("CuboRotando");
    expect(extraerClase("def construct(self):\n    pass")).toBeNull();
  });
  it("crearEscenaManim aplica defectos y topes", () => {
    const porDefecto = crearEscenaManim({ codigo: ESCENA_2D });
    expect(porDefecto).toMatchObject({ clase: "HolaStarSeed", calidad: "720p", fps: 30, duracionMax: 60 });
    const personalizada = crearEscenaManim({
      codigo: ESCENA_3D,
      clase: "CuboRotando",
      calidad: "1080p",
      fps: 60,
      duracionMax: 90,
    });
    expect(personalizada).toMatchObject({ clase: "CuboRotando", calidad: "1080p", fps: 60, duracionMax: 90 });
    const corregida = crearEscenaManim({ codigo: ESCENA_2D, clase: "HolaStarSeed", calidad: "8k" as CalidadEscena, fps: 144, duracionMax: 0 });
    expect(corregida).toMatchObject({ calidad: "720p", fps: 30, duracionMax: 60 });
    const tope = crearEscenaManim({ codigo: ESCENA_2D, clase: "HolaStarSeed", duracionMax: 500 });
    expect(tope.duracionMax).toBe(120);
  });
});

describe("validarEscena · escenas buenas", () => {
  it("acepta una escena 2D simple de Manim", () => {
    const veredicto = validarEscena(ESCENA_2D);
    expect(veredicto).toEqual({ valida: true, motivos: [] });
  });
  it("acepta una escena ThreeDScene con cubo y rotación de cámara", () => {
    const veredicto = validarEscena(ESCENA_3D);
    expect(veredicto).toEqual({ valida: true, motivos: [] });
  });
  it("no penaliza imports permitidos ni comentarios con palabras prohibidas", () => {
    const escena = `import numpy as np
import math
from manim import Scene

class ConComentario(Scene):
    # nunca es código: "os." aquí es solo texto para una persona
    def construct(self):
        self.play(Write(np.ones(3)))
`;
    expect(validarEscena(escena)).toEqual({ valida: true, motivos: [] });
  });
});

describe("validarEscena · escenas malas", () => {
  const MALA = (cuerpo: string) => `${cuerpo}\n\nclass Prueba(Scene):\n    def construct(self):\n        pass\n`;

  it("está vacía", () => {
    const veredicto = validarEscena("   \n  # solo un comentario\n");
    expect(veredicto.valida).toBe(false);
    expect(veredicto.motivos[0]).toContain("vacía");
  });

  it("no es una escena de Manim: falta la clase que hereda de Scene", () => {
    const veredicto = validarEscena("from manim import Square\n\ndef construct(self):\n    pass\n");
    expect(veredicto.valida).toBe(false);
    expect(veredicto.motivos.join(" ")).toContain("escena de Manim");
  });

  it("importa de fuera de manimgx/manim/math/numpy", () => {
    const veredicto = validarEscena(MALA("from functools import reduce"));
    expect(veredicto.valida).toBe(false);
    expect(veredicto.motivos.join("\n")).toContain("functools");
  });

  it("abre archivos del disco con open()", () => {
    const veredicto = validarEscena(MALA('open("datos.txt")'));
    expect(veredicto.valida).toBe(false);
    expect(veredicto.motivos.join(" ")).toContain("open()");
  });

  it.each(["exec('x=1')", "eval('1+1')", "__import__('antigravity')"])("ejecuta código dinámico: %s", (cuerpo) => {
    const veredicto = validarEscena(MALA(cuerpo));
    expect(veredicto.valida).toBe(false);
    expect(veredicto.motivos.join(" ")).toContain("código dinámico");
  });

  it("lanza procesos con subprocess", () => {
    const veredicto = validarEscena(MALA("import subprocess"));
    expect(veredicto.valida).toBe(false);
    expect(veredicto.motivos.join(" ")).toContain("subprocess");
  });

  it.each(["os.listdir('.')", "sys.exit(1)"])("toca el sistema: %s", (cuerpo) => {
    const veredicto = validarEscena(MALA(cuerpo));
    expect(veredicto.valida).toBe(false);
    expect(veredicto.motivos.join(" ")).toContain("sistema");
  });

  it.each(["import requests", "from urllib.request import urlopen", "import socket"])(
    "conecta a la red: %s",
    (cuerpo) => {
      const veredicto = validarEscena(MALA(cuerpo));
      expect(veredicto.valida).toBe(false);
      expect(veredicto.motivos.join(" ")).toContain("red");
    }
  );
});

