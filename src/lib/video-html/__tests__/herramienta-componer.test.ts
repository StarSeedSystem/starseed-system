import { describe, it, expect } from "vitest";
import {
    componerVideo,
    DURACION_DEFECTO,
    DURACION_MAX,
    DURACION_MIN,
    FORMATOS_VIDEO,
} from "../herramienta-componer";

const limpio = { pedido: "Bienvenida a StarSeed", duracion: 5, formato: "mp4" as const };

describe("video.componer · composición desde la plantilla", () => {
    it("genera un HTML HyperFrames determinista, sin GSAP y sin avisos", () => {
        const r = componerVideo(limpio);
        expect(r.html).toContain('data-composition-id="main"');
        expect(r.html).toContain("Bienvenida a StarSeed");
        expect(r.html).toContain("data-duration=\"5\"");
        expect(r.html).not.toMatch(/gsap|TweenMax|TimelineMax/i);
        expect(r.avisos).toEqual([]);
        expect(r.siguiente).toBe("render");
        expect(r.peticionVoz).toBeNull();
        expect(componerVideo(limpio)).toEqual(r);
    });

    it("escapa el texto del pedido: nunca inyecta HTML", () => {
        const r = componerVideo({ pedido: '<script>alert("x")</script>', duracion: 3, formato: "webm" });
        expect(r.html).not.toContain("<script>alert");
        expect(r.html).toContain("&#60;script&#62;");
    });

    it("con texto para narrar devuelve la PETICIÓN a la puerta única y no sintetiza", () => {
        const r = componerVideo({
            pedido: { titulo: "Lanzamiento", narracion: "Hoy abre StarSeed." },
            duracion: 8,
            formato: "mp4",
            voz: "em_alex",
        });
        expect(r.peticionVoz).toEqual({ texto: "Hoy abre StarSeed.", contexto: "lectura", persona: "em_alex" });
        expect(r.html).toContain("Lanzamiento");
        expect(r.avisos).toEqual([]);
    });

    it("acepta `texto` como título y narración, y `voz` sin narración avisa", () => {
        const r = componerVideo({ pedido: { texto: "Una sola frase" }, duracion: 3, formato: "mov" });
        expect(r.peticionVoz).toEqual({ texto: "Una sola frase", contexto: "lectura" });
        expect(r.html).toContain("Una sola frase");
        const sinTexto = componerVideo({ pedido: "Solo título", duracion: 3, formato: "gif", voz: "ef_dora" });
        expect(sinTexto.peticionVoz).toBeNull();
        expect(sinTexto.avisos.join(" ")).toContain("no trae texto para narrar");
    });

    it("acota la duración y sustituye un formato desconocido con aviso", () => {
        const corta = componerVideo({ ...limpio, duracion: 0 });
        expect(corta.html).toContain(`data-duration="${DURACION_MIN}"`);
        expect(corta.avisos.join(" ")).toContain("Duración ajustada");
        const larga = componerVideo({ ...limpio, duracion: 9_999 });
        expect(larga.html).toContain(`data-duration="${DURACION_MAX}"`);
        const rara = componerVideo({ ...limpio, formato: "avi" });
        expect(rara.avisos.join(" ")).toContain("no lo renderiza HyperFrames");
        expect(rara.html).toContain("data-composition-id=\"main\"");
        expect(FORMATOS_VIDEO).toContain("png-sequence");
    });

    it("sin título usa «StarSeed» y lo dice; una duración no numérica cae al defecto", () => {
        const r = componerVideo({ pedido: "   ", duracion: Number.NaN, formato: "" });
        expect(r.html).toContain("StarSeed");
        expect(r.html).toContain(`data-duration="${DURACION_DEFECTO}"`);
        expect(r.avisos.join(" ")).toContain("no trae título");
        expect(r.avisos.join(" ")).toContain("Duración no válida");
    });
});

describe("acción de agente `video.componer`", () => {
    it("compone sin exigir molécula abierta y devuelve html y petición de voz en `datos`", async () => {
        const { manejarAccionProtomolecula } = await import("@/lib/protomolecula/accion-agente");
        const r = manejarAccionProtomolecula({
            accion: "video.componer",
            pedido: { titulo: "Hola", narracion: "Texto narrado" },
            duracion: 4,
            formato: "mp4",
        });
        expect(r.ok).toBe(true);
        expect(r.message).toContain("Siguiente:");
        const datos = r.datos as { html: string; peticionVoz: unknown };
        expect(datos.html).toContain("Hola");
        expect(datos.peticionVoz).toEqual({ texto: "Texto narrado", contexto: "lectura" });
    });
});
