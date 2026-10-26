/**
 * Protomolécula · Tests del átomo "video-html" (HFR1018D · Ola 1018H · Vídeo con HyperFrames).
 * Verifies `planRender` y `VIDEO_HTML` cumplen el patrón DefinicionAtomo y la lógica de render de HyperFrames.
 * Contrato: architecture/video-hyperframes.md §1-§7.
 *
 * Importa a través del índice para evitar problemas con el cargador del puente, al estilo de atomos.test.ts.
 */
import { describe, it, expect } from "vitest";
import { VIDEO_HTML, planRender } from "../atomos/video-html";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";

/** Valores estándar de resolución de la definición del átomo (decodificados a qué espera HyperFrames). */
const RESOLUCIONES: Record<string, string> = {
  landscape: "1920x1080",
  portrait: "1080x1920",
  square: "1080x1080",
  "4k": "3840x2160",
};

/** Valores estándar de fps (decodificados a opción CLI). */
const FPS: Record<string, string> = { 24: "24", 25: "25", 30: "30", 60: "60" };

/** Valores estándar de calidad (decodificados a opción CLI). */
const CALIDADES: Record<string, string> = { draft: "draft", looks: "looks", delivery: "delivery" };

/** Valores estándar de formato (decodificados a opción CLI). */
const FORMATOS: Record<string, string> = { mp4: "mp4", webm: "webm", mov: "mov", gif: "gif", hls: "hls" };

describe("video-html", () => {
  it("la DefinicionAtomo declara los parámetros correctos", () => {
    expect(VIDEO_HTML.herramientaId).toBe("hyperframes");
    expect(VIDEO_HTML.nombre).toBe("Vídeo HTML (HyperFrames)");
    expect(VIDEO_HTML.categoria).toBe("video");
    expect(VIDEO_HTML.integracion).toBe("servicio-local");
    expect(VIDEO_HTML.control).toBe("total");
    expect(VIDEO_HTML.entradas).toEqual(["texto", "imagen", "audio", "vídeo", "datos", "voz"]);
    expect(VIDEO_HTML.salidas).toEqual(["vídeo", "fotogramas"]);

    const parametros = VIDEO_HTML.parametros;
    expect(parametros).toHaveLength(6);
    const porId = (id: string) => parametros.find((p) => p.id === id);

    expect(porId("duracion")).toEqual(expect.objectContaining({ tipo: "numero", min: 1, max: 600, defecto: 30 }));
    expect(porId("resolucion")).toEqual(expect.objectContaining({ tipo: "opcion", opciones: ["landscape", "portrait", "square", "4k"], defecto: "landscape" }));
    expect(porId("fps")).toEqual(expect.objectContaining({ tipo: "opcion", opciones: ["24", "25", "30", "60"], defecto: "30" }));
    expect(porId("calidad")).toEqual(expect.objectContaining({ tipo: "opcion", opciones: ["draft", "looks", "delivery"], defecto: "looks" }));
    expect(porId("formato")).toEqual(expect.objectContaining({ tipo: "opcion", opciones: ["mp4", "webm", "mov", "gif", "hls"], defecto: "mp4" }));
    expect(porId("variables")).toEqual(expect.objectContaining({ tipo: "disparo", defecto: false }));
  });

  it("el registro acepta el átomo (sin duplicado)", () => {
    limpiarRegistro();
    expect(registrarAtomo(VIDEO_HTML)).toEqual({ ok: true });
    limpiarRegistro();
  });
});

describe("planRender", () => {
  it("construye los argumentos correctos de hyperframes render para valores por defecto", () => {
    const valores: Record<string, unknown> = {};
    const args = planRender(valores);
    expect(args).toEqual([
      "--duration", "30",
      "--resolution", "1920x1080",
      "--fps", "30",
      "--quality", "looks",
      "--format", "mp4",
    ]);
  });

  it("respeta duración personalizada dentro de los límites", () => {
    const valores: Record<string, unknown> = { duracion: 120 };
    const args = planRender(valores);
    expect(args).toContain("--duration");
    expect(args[args.indexOf("--duration") + 1]).toBe("120");
  });

  it("rechaza duración fuera de rango (≤0 o >600)", () => {
    const a = planRender({ duracion: 0 });
    expect(a).not.toContain("--duration");
    const b = planRender({ duracion: 601 });
    expect(b).not.toContain("--duration");
  });

  it("mapea las resoluciones a sus valores ancho×alto", () => {
    const casos = [
      ["landscape", "1920x1080"],
      ["portrait", "1080x1920"],
      ["square", "1080x1080"],
      ["4k", "3840x2160"],
    ];
    for (const [clave, esperado] of casos) {
      const args = planRender({ resolucion: clave });
      const idx = args.indexOf("--resolution");
      expect(args[idx + 1]).toBe(esperado);
    }
  });

  it("mapea fps a opción CLI", () => {
    const casos = [
      ["24", "24"],
      ["25", "25"],
      ["30", "30"],
      ["60", "60"],
    ];
    for (const [clave, esperado] of casos) {
      const args = planRender({ fps: clave });
      const idx = args.indexOf("--fps");
      expect(args[idx + 1]).toBe(esperado);
    }
  });

  it("mapea calidad a opción CLI", () => {
    const casos = [
      ["draft", "draft"],
      ["looks", "looks"],
      ["delivery", "delivery"],
    ];
    for (const [clave, esperado] of casos) {
      const args = planRender({ calidad: clave });
      const idx = args.indexOf("--quality");
      expect(args[idx + 1]).toBe(esperado);
    }
  });

  it("mapea formato a opción CLI", () => {
    const casos = [
      ["mp4", "mp4"],
      ["webm", "webm"],
      ["mov", "mov"],
      ["gif", "gif"],
      ["hls", "hls"],
    ];
    for (const [clave, esperado] of casos) {
      const args = planRender({ formato: clave });
      const idx = args.indexOf("--format");
      expect(args[idx + 1]).toBe(esperado);
    }
  });

  it("añade bandera --variable cuando variables=true, pero no cuando variables=false", () => {
    let args = planRender({ variables: true });
    expect(args).toContain("--variable");
    expect(args).toContain("timeAnchored=true");
    args = planRender({ variables: false });
    expect(args).not.toContain("--variable");
    args = planRender({});
    expect(args).not.toContain("--variable");
  });

  it("no añade nada inesperado (no hay duplicados)", () => {
    const valores: Record<string, unknown> = {};
    const args = planRender(valores);
    // contar ocurrencias de cada clave
    const visto = new Set<string>();
    for (let i = 0; i < args.length; i += 2) {
      const clave = args[i];
      if (visto.has(clave)) fail(`Clave duplicada: ${clave}`);
      visto.add(clave);
    }
  });

  it("es una función pura: misma entrada → misma salida (sin estado externo)", () => {
    const entradas: Record<string, unknown>[] = [
      {},
      { duracion: 60 },
      { resolucion: "square", fps: "25" },
      { calidad: "delivery", variables: true },
      { variables: false, duracion: 1 },
    ];
    for (const entrada of entradas) {
      expect(planRender(entrada)).toEqual(planRender(entrada));
    }
  });
});

// Verificación rápida: planRender nunca ejecuta nada (sin imports de node:*, route.ts)
describe("planRender » pureza", () => {
  it("no importa ningún módulo bloqueado (node:*, route.ts)", () => {
    const fnString = planRender.toString();
    expect(fnString).not.toContain("require");
    expect(fnString).not.toContain("import");
  });
});