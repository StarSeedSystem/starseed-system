import { describe, expect, it } from "vitest";
import {
  CALIDADES,
  MODULOS_PERMITIDOS,
  validarContratoEscena,
  validarEscena,
  type EscenaManim,
} from "../escena";

const ESCENA_2D = [
  "from manim import *",
  "class Circulo(Scene):",
  "    def construct(self):",
  "        self.play(Create(Circle()))",
].join("\n");

const ESCENA_3D = [
  "from manim import *",
  "class Cubo(ThreeDScene):",
  "    def construct(self):",
  "        cubo = Cube()",
  "        self.add(cubo)",
  "        self.begin_ambient_camera_rotation(0.2)",
  "        self.play(Rotate(cubo, angle=PI))",
].join("\n");

const ESCENA_MANIMGX = [
  "from manimgx import ThreeDScene, Cube",
  "class Vesica(ThreeDScene):",
  "    def construct(self):",
  "        self.add(Cube())",
].join("\n");

function escena(codigo: string): EscenaManim {
  return { codigo, clase: "Cubo", calidad: "720p", fps: 30, duracionMax: 10 };
}
