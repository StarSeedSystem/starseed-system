import { describe, expect, it, vi } from "vitest";
import {
  LIMITE_CUERPO_BYTES, fueraDelProyecto, manejar, rutaPeligrosa, sinRutas, tamanoCuerpo, validarOrdenes,
} from "../../../servicios/hyperframes/src/rutas.mjs";

const HTML = "<div data-composition-id=\"a\"></div>";
const deps = () => ({
  version: "0.8.172",
  navegador: true,
  ffmpeg: false,
  lint: vi.fn(async () => ({ errores: [], avisos: [] })),
  editar: vi.fn(async (c: string) => `${c}<!-- editada -->`),
  vista: vi.fn(async (id: string) => (id === "existe" ? { html: HTML } : null)),
  cola: { encolar: vi.fn(async () => "t1"), estado: vi.fn(async (id: string) => (id === "t1" ? { estado: "en-cola" } : null)) },
});

describe("servicio hyperframes · rutas puras", () => {
  it("salud: versión, navegador, FFmpeg y telemetría apagada (también en /health)", async () => {
    for (const ruta of ["/salud", "/health"]) {
      const r = await manejar({ metodo: "GET", ruta }, deps());
      expect(r.estado).toBe(200);
      expect(r.cuerpo).toMatchObject({ version: "0.8.172", navegador: true, ffmpeg: false, telemetria: "apagada" });
    }
  });

  it("rechaza cuerpos de más de 8 MB y rutas desconocidas", async () => {
    const grande = { composicion: "x".repeat(LIMITE_CUERPO_BYTES + 1) };
    expect((await manejar({ metodo: "POST", ruta: "/lint", cuerpo: grande }, deps())).estado).toBe(413);
    expect((await manejar({ metodo: "GET", ruta: "/nada" }, deps())).estado).toBe(404);
    expect((await manejar({ metodo: "DELETE", ruta: "/salud" }, deps())).estado).toBe(404);
  });

  it("rechaza cualquier ruta de disco fuera del proyecto", async () => {
    for (const valor of ["/etc/passwd", "~/x", "C:\\x", "a/../../b", "\\\\srv\\x"]) expect(fueraDelProyecto(valor)).toBe(true);
    for (const valor of ["recursos/a.png", "https://x.org/a.png", "a.mp4"]) expect(fueraDelProyecto(valor)).toBe(false);
    expect(rutaPeligrosa({ capas: [{ src: "../../secreto" }] })).toBe("src");
    const r = await manejar({ metodo: "POST", ruta: "/render", cuerpo: { composicion: HTML, recursos: [{ ruta: "/Users/a/x" }] } }, deps());
    expect(r.estado).toBe(400);
    expect((await manejar({ metodo: "GET", ruta: "/vista/..%2F" }, deps())).estado).toBe(400);
  });

  it("lint y editar delegan en las dependencias y validan las órdenes", async () => {
    const d = deps();
    expect((await manejar({ metodo: "POST", ruta: "/lint", cuerpo: { composicion: HTML } }, d)).estado).toBe(200);
    expect(d.lint).toHaveBeenCalledWith(HTML);
    const ordenes = [{ type: "setText", target: "#t", value: "Hola" }];
    const r = await manejar({ metodo: "POST", ruta: "/editar", cuerpo: { composicion: HTML, ordenes } }, d);
    expect(r).toEqual({ estado: 200, cuerpo: { composicion: `${HTML}<!-- editada -->` } });
    expect(validarOrdenes([])).toBe("faltan las órdenes");
    expect(validarOrdenes([{ type: "borrarTodo", target: "#t" }])).toBe("orden desconocida");
    expect(validarOrdenes([{ type: "setStyle", target: "#t", styles: { animation: "gsap.to" } }])).toMatch(/GSAP/);
    expect((await manejar({ metodo: "POST", ruta: "/editar", cuerpo: { composicion: HTML, ordenes: [] } }, d)).estado).toBe(400);
  });

  it("vista y trabajos: 404 honesto si no existen, 400 si el id no es válido", async () => {
    expect((await manejar({ metodo: "GET", ruta: "/vista/existe" }, deps())).estado).toBe(200);
    expect((await manejar({ metodo: "GET", ruta: "/vista/otra" }, deps())).estado).toBe(404);
    expect((await manejar({ metodo: "GET", ruta: "/vista/a b" }, deps())).estado).toBe(400);
    const d = deps();
    const r = await manejar({ metodo: "POST", ruta: "/render", cuerpo: { composicion: HTML } }, d);
    expect(r).toEqual({ estado: 202, cuerpo: { id: "t1" } });
    expect(d.cola.encolar).toHaveBeenCalledWith({ composicion: HTML, formato: "mp4" });
    expect((await manejar({ metodo: "GET", ruta: "/trabajos/t1" }, d)).cuerpo).toEqual({ estado: "en-cola" });
    expect((await manejar({ metodo: "GET", ruta: "/trabajos/t9" }, d)).estado).toBe(404);
  });

  it("sin dependencia dice 503 y nunca inventa resultados; los errores no llevan rutas", async () => {
    expect((await manejar({ metodo: "POST", ruta: "/lint", cuerpo: { composicion: HTML } }, { version: "x" })).estado).toBe(503);
    const d = { ...deps(), lint: async () => { throw new Error("falló /Users/alex/x/y.html"); } };
    const r = await manejar({ metodo: "POST", ruta: "/lint", cuerpo: { composicion: HTML } }, d);
    expect(r.estado).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toContain("/Users/");
    expect(sinRutas("en /home/a/b")).toBe("en <ruta>");
    expect(tamanoCuerpo(null)).toBe(0);
  });
});
