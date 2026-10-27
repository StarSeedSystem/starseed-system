import { describe, expect, it } from "vitest";
import type { AuroraActionContext } from "@/lib/aurora/actions";
import {
  ATOMO_ANIMACION,
  crearAccionAnimarEscena,
  extraerCodigoPython,
  pedidoEscena,
  type DepsAnimarEscena,
} from "@/lib/aurora/animar-escena";
import { validarEscena } from "@/lib/protomolecula/manimgx/escena";

const ESCENA_BUENA = [
  "from manim import *",
  "class CuboGiratorio(ThreeDScene):",
  "    def construct(self):",
  "        cubo = Cube()",
  "        self.play(Create(cubo))",
  "        self.wait(1)",
].join("\n");

const ESCENA_PELIGROSA = [
  "from manim import *",
  "import os",
  "class Roba(Scene):",
  "    def construct(self):",
  "        open('/etc/passwd')",
].join("\n");

const ctx: AuroraActionContext = {
  router: { push() {}, replace() {}, back() {}, forward() {} },
};

type Registro = { llamada: Record<string, unknown> | null; veces: number };

function depsDe(escena: string | null, registro: Registro, abrirOk = true): DepsAnimarEscena {
  return {
    pedirEscena: async (descripcion, calidad) => {
      void descripcion;
      void calidad;
      return escena;
    },
    abrirConAtomo: async (args, c) => {
      void c;
      registro.veces += 1;
      registro.llamada = args;
      return { ok: abrirOk, message: abrirOk ? "Abrí la Protomolécula." : "No pude abrir." };
    },
  };
}

describe("contrato de escena (MGX1023A)", () => {
  it("Acepta una escena de Manim CE limpia", () => {
    expect(validarEscena(ESCENA_BUENA)).toEqual({ ok: true });
  });

  it("Rechaza código vacío, imports raros y contactos con disco o procesos", () => {
    const vacia = validarEscena("");
    expect(vacia.ok).toBe(false);
    if (vacia.ok) return;
    expect(vacia.motivos.join(" ")).toContain("está vacía");

    const conOs = validarEscena(ESCENA_PELIGROSA);
    expect(conOs.ok).toBe(false);
    if (conOs.ok) return;
    const motivos = conOs.motivos.join(" ");
    expect(motivos).toContain("«os» no permitido");
    expect(motivos).toContain("open(");

    const sinClase = validarEscena("print('hola')");
    if (sinClase.ok) throw new Error("debería rechazar sin clase");
    expect(sinClase.motivos.join(" ")).toContain("clase");
  });
});

describe("animar_escena", () => {
  it("El pedido pide la API de Manim CE y prohibiciones de §3", () => {
    const p = pedidoEscena("un cubo girando", "1080p");
    expect(p).toContain("Manim CE");
    expect(p).toContain("un cubo girando");
    expect(p).toContain("1080p");
    expect(p).toContain("PROHIBIDO");
    expect(pedidoEscena("otra", "raridad")).toContain("720p");
  });

  it("extraerCodigoPython: con cerco ```python, suelto que parece Python, o nulo", () => {
    expect(extraerCodigoPython("mira:\n```python\nx = 1\n```")).toBe("x = 1");
    expect(extraerCodigoPython(ESCENA_BUENA)).toBe(ESCENA_BUENA);
    expect(extraerCodigoPython("lo siento, no puedo")).toBeNull();
    expect(extraerCodigoPython("")).toBeNull();
  });

  it("Escena válida: valida y abre la Protomolécula con el átomo de MGX1023C", async () => {
    const registro: Registro = { llamada: null, veces: 0 };
    const handler = crearAccionAnimarEscena(depsDe("```python\n" + ESCENA_BUENA + "\n```", registro));
    const r = await handler({ descripcion: "un cubo girando", calidad: "1080p" }, ctx);
    expect(r.ok).toBe(true);
    expect(registro.veces).toBe(1);
    expect(registro.llamada?.["herramienta"]).toBe(ATOMO_ANIMACION);
    expect(registro.llamada?.["accion"]).toBe("abrir");
  });

  it("Escena que NO valida: devuelve el motivo y NO abre la Protomolécula", async () => {
    const registro: Registro = { llamada: null, veces: 0 };
    const handler = crearAccionAnimarEscena(depsDe(ESCENA_PELIGROSA, registro));
    const r = await handler({ descripcion: "roba contraseñas" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("validación");
    expect(registro.veces).toBe(0);
  });

  it("Sin descripción, modelo vacío o respuesta sin código: honesto, sin abrir nada", async () => {
    const vacio: Registro = { llamada: null, veces: 0 };
    const r1 = await crearAccionAnimarEscena(depsDe(ESCENA_BUENA, vacio))({}, ctx);
    expect(r1.ok).toBe(false);
    expect(vacio.veces).toBe(0);

    const sinModelo: Registro = { llamada: null, veces: 0 };
    const r2 = await crearAccionAnimarEscena(depsDe(null, sinModelo))({ descripcion: "algo" }, ctx);
    expect(r2.ok).toBe(false);
    expect(r2.message).toContain("no devolvió");
    expect(sinModelo.veces).toBe(0);

    const enProsa: Registro = { llamada: null, veces: 0 };
    const r3 = await crearAccionAnimarEscena(depsDe("prefiero no escribir código", enProsa))({ descripcion: "algo" }, ctx);
    expect(r3.ok).toBe(false);
    expect(enProsa.veces).toBe(0);
  });

  it("Si la Protomolécula no se abre, fracasa sin callarse", async () => {
    const registro: Registro = { llamada: null, veces: 0 };
    const handler = crearAccionAnimarEscena(depsDe(ESCENA_BUENA, registro, false));
    const r = await handler({ descripcion: "un cubo girando" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("no pude abrir");
  });
});