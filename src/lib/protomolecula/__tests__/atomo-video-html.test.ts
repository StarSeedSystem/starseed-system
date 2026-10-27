/** Átomo «video-html» (HFR1018D): definición HyperFrames, registro en el índice y plan de render PURO.
 *  Sin red, sin navegador real y sin procesos: solo entrada → salida. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CALIDADES, DURACION_MAX, DURACION_MIN, ENTORNO_RENDER, FPS, FORMATOS, RESOLUCIONES,
  VIDEO_HTML, planRender, type ValoresRender,
} from "../atomos/video-html";
import { ATOMOS_PROPIOS } from "../atomos";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";

const valorDe = (args: string[], bandera: string): string | undefined => args[args.indexOf(bandera) + 1];

describe("átomo video-html · definición", () => {
  beforeEach(() => limpiarRegistro());

  it("declara el contrato de HyperFrames y se registra en el índice", () => {
    expect(VIDEO_HTML).toMatchObject({
      herramientaId: "hyperframes",
      categoria: "video",
      integracion: "servicio-local",
      control: "total",
      ficha: { licencia: "Apache-2.0" },
    });
    expect(VIDEO_HTML.parametros.map((p) => p.id)).toEqual(["duracion", "resolucion", "fps", "calidad", "formato", "variables"]);
    expect(VIDEO_HTML.entradas).toEqual(expect.arrayContaining(["texto", "imagen", "audio", "video", "datos", "voz"]));
    expect(VIDEO_HTML.salidas).toEqual(expect.arrayContaining(["mp4", "png-sequence", "fotogramas"]));
    expect(registrarAtomo(VIDEO_HTML)).toEqual({ ok: true });
    expect(ATOMOS_PROPIOS).toContain(VIDEO_HTML);
  });

  it("acota la duración y ofrece solo las opciones del contrato", () => {
    const duracion = VIDEO_HTML.parametros.find((p) => p.id === "duracion");
    expect([duracion?.min, duracion?.max, duracion?.unidad, duracion?.defecto]).toEqual([DURACION_MIN, DURACION_MAX, "s", 10]);
    const opciones = (id: string) => VIDEO_HTML.parametros.find((p) => p.id === id)?.opciones;
    expect(opciones("resolucion")).toEqual([...RESOLUCIONES]);
    expect(opciones("fps")).toEqual([...FPS]);
    expect(opciones("calidad")).toEqual([...CALIDADES]);
    expect(opciones("formato")).toEqual([...FORMATOS]);
  });

  it("la telemetría de HyperFrames viaja apagada siempre", () => {
    expect(ENTORNO_RENDER).toEqual({ HYPERFRAMES_NO_TELEMETRY: "1" });
  });
});

describe("planRender · argumentos en lista, sin shell", () => {
  it("con los valores por defecto produce la orden completa del render", () => {
    expect(planRender()).toEqual([
      "render", "--duration", "10", "--resolution", "landscape",
      "--fps", "30", "--quality", "draft", "--format", "mp4",
    ]);
  });

  it("acota la duración entre 1 y 600 s y redondea a una décima", () => {
    expect(valorDe(planRender({ duracion: 0 }), "--duration")).toBe("1");
    expect(valorDe(planRender({ duracion: 999 }), "--duration")).toBe("600");
    expect(valorDe(planRender({ duracion: 12.34 }), "--duration")).toBe("12.3");
    expect(valorDe(planRender({ duracion: "5" }), "--duration")).toBe("5");
    expect(valorDe(planRender({ duracion: Number.NaN }), "--duration")).toBe("10");
    expect(valorDe(planRender({ duracion: "larga" }), "--duration")).toBe("10");
  });

  it("pasa las opciones válidas tal cual (incluidos 4k, MOV y HLS)", () => {
    const args = planRender({ resolucion: "4k", fps: "60", calidad: "delivery", formato: "hls" });
    expect([valorDe(args, "--resolution"), valorDe(args, "--fps"), valorDe(args, "--quality"), valorDe(args, "--format")])
      .toEqual(["4k", "60", "delivery", "hls"]);
    expect(valorDe(planRender({ resolucion: "portrait", formato: "mov" }), "--resolution")).toBe("portrait");
  });

  it("un valor inválido vuelve al de por defecto y nunca llega al proceso", () => {
    const args = planRender({ resolucion: "vertical", fps: "120", calidad: "maxima", formato: "avi" });
    expect([valorDe(args, "--resolution"), valorDe(args, "--fps"), valorDe(args, "--quality"), valorDe(args, "--format")])
      .toEqual(["landscape", "30", "draft", "mp4"]);
  });

  it("añade --variables desde un objeto o desde JSON, y descarta lo vacío o roto", () => {
    const objeto: ValoresRender = { variables: { titulo: "Hola", repeticiones: 3, activo: true } };
    expect(valorDe(planRender(objeto), "--variables")).toBe('{"titulo":"Hola","repeticiones":3,"activo":true}');
    expect(valorDe(planRender({ variables: '{"titulo":"Hola"}' }), "--variables")).toBe('{"titulo":"Hola"}');
    expect(planRender({ variables: "ninguna" })).not.toContain("--variables");
    expect(planRender({ variables: "{}" })).not.toContain("--variables");
    expect(planRender({ variables: "{roto" })).not.toContain("--variables");
  });

  it("es puro: misma entrada, mismos argumentos, y no muta la entrada", () => {
    const valores: ValoresRender = { duracion: 12, resolucion: "square", variables: { titulo: "Hola" } };
    const copia = structuredClone(valores);
    expect(planRender(valores)).toEqual(planRender(valores));
    expect(valores).toEqual(copia);
    expect(planRender()).not.toBe(planRender());
  });
});

describe("el módulo es puro y cabe en el presupuesto", () => {
  it("≤ 120 líneas, sin React/Next/node ni red, reloj o azar", () => {
    const src = readFileSync(path.join(__dirname, "..", "atomos", "video-html.ts"), "utf8");
    expect(src.trimEnd().split("\n").length).toBeLessThanOrEqual(120);
    expect(src).not.toMatch(/from ["'](react|next|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|localStorage|setTimeout|spawn)\b|Date\.now|Math\.random|\bany\b/);
    expect(src).not.toMatch(/from ["']gsap|@hyperframes\/studio/);
    expect(src).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|sk-[A-Za-z0-9]{10}|Bearer\s/);
  });
});
