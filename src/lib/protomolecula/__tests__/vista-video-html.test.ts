import { describe, expect, it } from "vitest";
import { VIDEO_HTML, ValoresVideoHtml, planRender } from "../atomos/video-html";
import { elegirVista } from "../bloque-protomolecula";

describe("elegirVista (video-html) · qué mostrar", () => {
  it("devuelve 'loading' cuando el servicio no está vivo ni hay render hecho", () => {
    const result = elegirVista("video-html-1", false, false, {});
    expect(result).toBe("loading");
  });

  it("devuelve 'preview' cuando el servicio está vivo", () => {
    const result = elegirVista("video-html-1", true, false, {});
    expect(result).toBe("preview");
  });

  it("devuelve 'video' cuando hay vídeo ya renderizado", () => {
    const result = elegirVista("video-html-1", false, true, { urlPoster: "https://ejemplo.com/video.mp4" });
    expect(result).toBe("video");
  });

  it("devuelve 'loading' cuando no hay poster pero el servicio no está vivo", () => {
    const result = elegirVista("video-html-1", false, false, {});
    expect(result).toBe("loading");
  });

  it("devuelve 'preview' cuando hay un poster pero el servicio está vivo", () => {
    const result = elegirVista("video-html-1", true, false, { urlPoster: "https://ejemplo.com/poster.jpg" });
    expect(result).toBe("preview");
  });
});

describe("planRender (video-html)", () => {
  it("devuelve un array con 'render', '--format' y el formato por defecto 'mp4'", () => {
    const args = planRender({});
    expect(args).toContain("render");
    expect(args).toContain("--format");
    expect(args).toContain("mp4");
  });

  it("es puro: misma entrada, mismo plan, y la entrada no cambia", () => {
    const valores = { duracion: 5, resolucion: "landscape", fps: "30", calidad: "delivery", formato: "mp4" };
    const copia = structuredClone(valores);
    expect(planRender(valores)).toEqual(planRender(valores));
    expect(valores).toEqual(copia);
  });

  it("incluye tamaño según resolución", () => {
    expect(planRender({ resolucion: "landscape" })).toEqual(expect.arrayContaining(["--size", "1280x720"]));
    expect(planRender({ resolucion: "portrait" })).toEqual(expect.arrayContaining(["--size", "720x1280"]));
    expect(planRender({ resolucion: "square" })).toEqual(expect.arrayContaining(["--size", "720x720"]));
    expect(planRender({ resolucion: "4k" })).toEqual(expect.arrayContaining(["--size", "3840x2160"]));
  });

  it("incluye duración válida y acota fuera de rango", () => {
    expect(planRender({ duracion: 30 })).toEqual(expect.arrayContaining(["--duration", "30"]));
    expect(planRender({ duracion: 0 })).not.toContain("--duration");
    expect(planRender({ duracion: 601 })).not.toContain("--duration");
  });

  it("usa workers según calidad", () => {
    const argsDraft = planRender({ calidad: "draft" });
    expect(argsDraft).toContain("--workers");
    expect(argsDraft).toContain("1");

    const argsDelivery = planRender({ calidad: "delivery" });
    expect(argsDelivery).toContain("--workers");
    expect(argsDelivery).toContain("2");
  });
});
