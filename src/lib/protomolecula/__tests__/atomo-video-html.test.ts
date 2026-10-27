/** Átomo «video-html» (HFR1018D): definición HyperFrames y plan de render puro (argv sin shell). Sin red, disco ni procesos. */
import { beforeEach, describe, expect, it } from "vitest";
import { VIDEO_HTML, ENTORNO_RENDER, planRender } from "../atomos/video-html";
import { ATOMOS_PROPIOS } from "../atomos";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";

const parametro = (id: string) => VIDEO_HTML.parametros.find((p) => p.id === id);
const valor = (args: string[], bandera: string): string =>
  args[args.indexOf(bandera) + 1] ?? "";
const variables = (args: string[]): Record<string, unknown> =>
  JSON.parse(valor(args, "--variables")) as Record<string, unknown>;

describe("átomo video-html · definición", () => {
  it("declara el contrato de HyperFrames y se registra en el índice", () => {
    expect(VIDEO_HTML).toMatchObject({
      herramientaId: "hyperframes",
      categoria: "video",
      integracion: "servicio-local",
      control: "total",
      ficha: { licencia: "Apache-2.0" },
    });
    expect(VIDEO_HTML.parametros.map((p) => p.id)).toEqual([
      "duracion", "resolucion", "fps", "calidad", "formato", "variables",
    ]);
    expect(VIDEO_HTML.entradas).toEqual(["texto", "imagen", "audio", "vídeo", "datos", "voz"]);
    expect(VIDEO_HTML.salidas).toEqual(["vídeo", "fotogramas"]);
    limpiarRegistro();
    expect(registrarAtomo(VIDEO_HTML)).toEqual({ ok: true });
    expect(ATOMOS_PROPIOS).toContain(VIDEO_HTML);
  });

  it("acota la duración y ofrece las opciones exactas del contrato", () => {
    expect(parametro("duracion")).toMatchObject({ tipo: "numero", min: 1, max: 600, defecto: 10, unidad: "s" });
    expect(parametro("resolucion")?.opciones).toEqual(["landscape", "portrait", "square", "4k"]);
    expect(parametro("fps")?.opciones).toEqual(["24", "25", "30", "60"]);
    expect(parametro("calidad")?.opciones).toEqual(["draft", "looks", "delivery"]);
    expect(parametro("formato")?.opciones).toEqual(["mp4", "webm", "mov", "gif", "hls"]);
    expect(parametro("variables")?.defecto).toBe("{}");
  });

  it("la telemetría de HyperFrames va siempre apagada", () => {
    expect(ENTORNO_RENDER).toEqual({ HYPERFRAMES_NO_TELEMETRY: "1" });
  });
});

describe("planRender", () => {
  it("usa los valores por defecto y pasa la duración como variable", () => {
    const args = planRender();
    expect(args.slice(0, 10)).toEqual([
      "render", "--format", "mp4", "--fps", "30", "--quality", "looks", "--resolution", "landscape", "--variables",
    ]);
    expect(variables(args)).toEqual({ duracion: 10 });
  });

  it("traduce cada parámetro a su bandera y conserva las variables propias", () => {
    const args = planRender({
      duracion: 42.5, resolucion: "portrait", fps: "60", calidad: "delivery", formato: "webm",
      variables: '{"titulo":"Hola","acento":"#fff"}',
    });
    expect(valor(args, "--format")).toBe("webm");
    expect(valor(args, "--fps")).toBe("60");
    expect(valor(args, "--quality")).toBe("delivery");
    expect(valor(args, "--resolution")).toBe("portrait");
    expect(variables(args)).toEqual({ titulo: "Hola", acento: "#fff", duracion: 42.5 });
  });

  it("acota la duración y vuelve al defecto ante valores inválidos", () => {
    const raro = planRender({ duracion: 999, resolucion: "raro", fps: "29", calidad: "max", formato: "exe" });
    expect(valor(raro, "--resolution")).toBe("landscape");
    expect(valor(raro, "--fps")).toBe("30");
    expect(valor(raro, "--quality")).toBe("looks");
    expect(valor(raro, "--format")).toBe("mp4");
    expect(variables(raro).duracion).toBe(600);
    expect(variables(planRender({ duracion: -3 })).duracion).toBe(1);
    expect(variables(planRender({ duracion: Number.NaN })).duracion).toBe(10);
  });

  it("admite el fps como número y la duración manda sobre la variable homónima", () => {
    expect(valor(planRender({ fps: 60 }), "--fps")).toBe("60");
    expect(variables(planRender({ duracion: 30, variables: '{"duracion":99,"titulo":"x"}' })))
      .toEqual({ duracion: 30, titulo: "x" });
  });

  it("ignora variables que no son un objeto JSON", () => {
    expect(variables(planRender({ variables: "{roto" }))).toEqual({ duracion: 10 });
    expect(variables(planRender({ variables: "[1,2]" }))).toEqual({ duracion: 10 });
    expect(variables(planRender({ variables: { titulo: "Hola" } }))).toEqual({ titulo: "Hola", duracion: 10 });
  });

  it("es puro y nunca usa una shell: el texto peligroso sigue siendo un solo argumento", () => {
    const entrada = { duracion: 12, resolucion: "square", fps: "60", calidad: "draft", formato: "gif", variables: '{"titulo":"x"}' };
    const copia = structuredClone(entrada);
    expect(planRender(entrada)).toEqual(planRender(entrada));
    expect(entrada).toEqual(copia);

    const peligro = 'Hola"; rm -rf /; echo `x`';
    const args = planRender({ variables: JSON.stringify({ titulo: peligro }) });
    expect(variables(args).titulo).toBe(peligro);
    expect(args).not.toContain("rm");
    expect(args).not.toContain("-rf");
  });
});
