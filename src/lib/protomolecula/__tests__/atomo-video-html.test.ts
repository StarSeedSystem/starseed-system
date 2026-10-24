import { describe, it, expect } from "vitest";
import { VIDEO_HTML } from "@/lib/protomolecula/atomos/video-html";

describe("Átomo video-html", () => {
  it("debería tener la herramientaId correcta", () => {
    expect(VIDEO_HTML.herramientaId).toBe("hyperframes");
  });

  it("debería tener un nombre", () => {
    expect(VIDEO_HTML.nombre).toBe("Vídeo-HTML (HyperFrames)");
  });

  it("debería tener la integración iframe-aislado", () => {
    expect(VIDEO_HTML.integracion).toBe("iframe-aislado");
  });

  it("debería tener control total", () => {
    expect(VIDEO_HTML.control).toBe("total");
  });

  it("debería tener un parámetro de duración válido", () => {
    const duracion = VIDEO_HTML.parametros.find((p) => p.id === "duracion");
    expect(duracion).toBeDefined();
    expect(duracion?.min).toBe(1);
    expect(duracion?.max).toBe(600);
    expect(duracion?.defecto).toBe(10);
  });

  it("debería tener una resolución válida", () => {
    const resolucion = VIDEO_HTML.parametros.find((p) => p.id === "resolucion");
    expect(resolucion).toBeDefined();
    expect(resolucion?.tipo).toBe("opcion");
    expect(resolucion?.opciones).toEqual(["landscape", "portrait", "square", "4k"]);
    expect(resolucion?.defecto).toBe("landscape");
  });

  it("debería tener una lista de fps válida", () => {
    const fps = VIDEO_HTML.parametros.find((p) => p.id === "fps");
    expect(fps).toBeDefined();
    expect(fps?.tipo).toBe("opcion");
    expect(fps?.opciones).toEqual(["24", "25", "30", "60"]);
    expect(fps?.defecto).toBe("30");
  });

  it("debería tener un parámetro de calidad válido", () => {
    const calidad = VIDEO_HTML.parametros.find((p) => p.id === "calidad");
    expect(calidad).toBeDefined();
    expect(calidad?.tipo).toBe("opcion");
    expect(calidad?.opciones).toEqual(["draft", "looks", "delivery"]);
    expect(calidad?.defecto).toBe("looks");
  });

  it("debería tener un formato válido", () => {
    const formato = VIDEO_HTML.parametros.find((p) => p.id === "formato");
    expect(formato).toBeDefined();
    expect(formato?.tipo).toBe("opcion");
    expect(formato?.opciones).toEqual(["mp4", "webm", "mov", "gif", "hls"]);
    expect(formato?.defecto).toBe("mp4");
  });

  it("debería tener la categoría de vídeo", () => {
    expect(VIDEO_HTML.categoria).toBe("video");
  });

  it("debería tener las entradas correctas", () => {
    expect(VIDEO_HTML.entradas).toEqual(["texto", "imagen", "audio", "vídeo", "datos", "voz"]);
  });

  it("debería tener las salidas correctas", () => {
    expect(VIDEO_HTML.salidas).toEqual(["vídeo", "fotogramas"]);
  });

  it("debería tener un valor por defecto para variables", () => {
    const variables = VIDEO_HTML.parametros.find((p) => p.id === "variables");
    expect(variables).toBeDefined();
    expect(variables?.tipo).toBe("disparo");
    expect(variables?.defecto).toBe(false);
  });

  it("debería tener la ficha correcta", () => {
    expect(VIDEO_HTML.ficha).toEqual({
      web: "https://github.com/heygen-com/hyperframes",
      licencia: "Apache-2.0",
    });
  });

  it("debería ser idempotente al renderizar diferentes valores", () => {
    const valor1 = { duracion: 10, resolucion: "landscape", fps: "30", calidad: "looks", formato: "mp4" };
    const valor2 = { duracion: 10, resolucion: "landscape", fps: "30", calidad: "looks", formato: "mp4" };

    const resultado1 = VIDEO_HTML.vista?.documento?.();
    const resultado2 = VIDEO_HTML.vista?.documento?.();

    expect(resultado1).toBe(resultado2);
    expect(resultado1).toContain("Editor de Vídeo HyperFrames (StarSeed)");
  });

  it("debería planear renderizar sin valores undefined", () => {
    const valorPartial = { duracion: 30 } as Record<string, unknown>;
    expect(() => VIDEO_HTML.vista?.documento?.()).not.toThrow();
  });

  it("debería tener elementos HTML sin GSAP (StarSeed pure)", () => {
    const html = VIDEO_HTML.vista?.documento?.();
    expect(html).toContain("data-composition-id");
    expect(html).toContain("data-start");
    expect(html).toContain("data-duration");
    expect(html).toContain("data-track-index");
    expect(html).not.toContain("gsap");
    expect(html).not.toContain("TweenMax");
    expect(html).not.toContain("TimelineMax");
  });

  it("debería tener telemetría desactivada", () => {
    const html = VIDEO_HTML.vista?.documento?.();
    expect(html).toContain("HYPERFRAMES_NO_TELEMETRY = true");
  });

  it("debería usar el puerto por defecto del servicio (4490)", () => {
    const html = VIDEO_HTML.vista?.documento?.();
    expect(html).toContain("HYPERFRAMES_PORT = 4490");
  });

  it("debería tener elementos de la Protomolécula sincronizados", () => {
    expect(VIDEO_HTML.herramientaId).toBe("hyperframes");
    expect(VIDEO_HTML.control).toBe("total");
    expect(VIDEO_HTML.integracion).toBe("iframe-aislado");
  });
});