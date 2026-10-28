import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { VIDEO_HTML, planRender } from "../atomos/video-html";
import { ATOMOS_PROPIOS } from "../atomos";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";

describe("átomo video-html · definición", () => {
  beforeEach(() => limpiarRegistro());
  
  it("declara el contrato de HyperFrames, se registra y está en el índice", () => {
    expect(VIDEO_HTML).toMatchObject({ 
      herramientaId: "hyperframes", 
      categoria: "video", 
      integracion: "servicio-local", 
      control: "total",
      ficha: { licencia: "Apache-2.0" }
    });
    expect(VIDEO_HTML.parametros.map((p) => p.id)).toEqual(["duracion", "resolucion", "fps", "calidad", "formato", "variables"]);
    expect(VIDEO_HTML.entradas).toEqual(expect.arrayContaining(["texto", "imagen", "audio", "vídeo", "datos", "voz"]));
    expect(VIDEO_HTML.salidas).toEqual(expect.arrayContaining(["vídeo", "fotogramas"]));
    expect(VIDEO_HTML.parametros.find((p) => p.id === "duracion")?.defecto).toBe(3);
    expect(registrarAtomo(VIDEO_HTML)).toEqual({ ok: true });
    expect(ATOMOS_PROPIOS).toContain(VIDEO_HTML);
  });
  
  it("el módulo es puro, sin claves ni IPs, y cabe en 120 líneas", () => {
    const src = readFileSync(path.join(__dirname, "..", "atomos", "video-html.ts"), "utf8");
    expect(src.trimEnd().split("\n").length).toBeLessThanOrEqual(120);
    expect(src).not.toMatch(/from ["'](react|next|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|localStorage|navigator|setTimeout|spawn)\b|Date\.now|Math\.random|\bany\b/);
    expect(src).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|sk-[A-Za-z0-9]{10}|Bearer\s/);
  });
});

describe("planRender de HyperFrames", () => {
  it("devuelve argumentos básicos con valores por defecto", () => {
    const args = planRender({});
    expect(args).toContain("render");
    expect(args).toContain("--format");
    expect(args).toContain("mp4");
    expect(args).toContain("--fps");
    expect(args).toContain("24");
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
    expect(argsDraft.filter(a => a === "1").length).toBeGreaterThan(0);
    
    const argsDelivery = planRender({ calidad: "delivery" });
    expect(argsDelivery).toContain("--workers");
    expect(argsDelivery).toContain("2");
  });

  it("no genera flags --workers duplicados", () => {
    const argsDraft = planRender({ calidad: "draft" });
    const workersCount = argsDraft.filter(a => a === "--workers").length;
    expect(workersCount).toBe(1);
    expect(argsDraft[argsDraft.indexOf("--workers") + 1]).toBe("1");
    
    const argsDelivery = planRender({ calidad: "delivery" });
    const workersCountDelivery = argsDelivery.filter(a => a === "--workers").length;
    expect(workersCountDelivery).toBe(1);
    expect(argsDelivery[argsDelivery.indexOf("--workers") + 1]).toBe("2");
    
    const argsLooks = planRender({ calidad: "looks" });
    const workersCountLooks = argsLooks.filter(a => a === "--workers").length;
    expect(workersCountLooks).toBe(1);
    expect(argsLooks[argsLooks.indexOf("--workers") + 1]).toBe("2");
  });
  
  it("acepta todos los formatos soportados", () => {
    for (const formato of ["mp4", "webm", "mov", "gif", "hls"]) {
      const args = planRender({ formato });
      expect(args).toEqual(expect.arrayContaining(["--format", formato]));
    }
  });
  
  it("acepta todos los fps soportados", () => {
    for (const fps of ["24", "25", "30", "60"]) {
      const args = planRender({ fps });
      expect(args).toEqual(expect.arrayContaining(["--fps", fps]));
    }
  });
});
