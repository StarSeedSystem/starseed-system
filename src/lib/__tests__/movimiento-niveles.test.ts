import { describe, expect, it } from "vitest";

import type { Capacidades } from "../aurora/voz-starseed/capacidades";
import {
    nivelMovimientoPara,
    nivelesMovimientoDisponibles,
    siguienteNivelMovimiento,
} from "../avatares/movimiento/niveles";
import { generarClipProcedural, moverAvatar } from "../avatares/movimiento/motor";

/** Capacidades base (las más pobres): cada prueba solo toca lo que le importa. */
const base: Capacidades = {
    memoriaGB: null,
    nucleos: null,
    webgpu: false,
    wasmSimd: false,
    movil: false,
    daemonLocal: false,
};

describe("nivelMovimientoPara", () => {
    it("demonio local + 8 GB de RAM → vivo", () => {
        expect(nivelMovimientoPara({ ...base, daemonLocal: true, memoriaGB: 8 }, false)).toBe("vivo");
    });

    it("demonio local con menos de 8 GB de RAM → fluido", () => {
        expect(nivelMovimientoPara({ ...base, daemonLocal: true, memoriaGB: 4 }, false)).toBe("fluido");
    });

    it("escritorio con WebGPU y sin demonio → ligero", () => {
        expect(nivelMovimientoPara({ ...base, webgpu: true }, false)).toBe("ligero");
    });

    it("escritorio con WASM SIMD y sin WebGPU → ligero", () => {
        expect(nivelMovimientoPara({ ...base, wasmSimd: true }, false)).toBe("ligero");
    });

    it("móvil con WebGPU → quieto (el móvil manda)", () => {
        expect(nivelMovimientoPara({ ...base, movil: true, webgpu: true }, false)).toBe("quieto");
    });

    it("equipo sin nada → quieto", () => {
        expect(nivelMovimientoPara(base, false)).toBe("quieto");
    });

    it("prefers-reduced-motion fuerza «quieto» incluso con demonio potente", () => {
        expect(nivelMovimientoPara({ ...base, daemonLocal: true, memoriaGB: 16 }, true)).toBe("quieto");
    });
});

describe("siguienteNivelMovimiento", () => {
    it("recorre vivo → fluido → ligero → quieto y acaba en null", () => {
        expect(siguienteNivelMovimiento("vivo")).toBe("fluido");
        expect(siguienteNivelMovimiento("fluido")).toBe("ligero");
        expect(siguienteNivelMovimiento("ligero")).toBe("quieto");
        expect(siguienteNivelMovimiento("quieto")).toBeNull();
    });
});

describe("nivelesMovimientoDisponibles", () => {
    it("siempre incluye «quieto»", () => {
        const combinaciones: Capacidades[] = [
            { ...base, daemonLocal: true, memoriaGB: 8 },
            { ...base, daemonLocal: true },
            { ...base, webgpu: true },
            base,
        ];
        for (const c of combinaciones) {
            expect(nivelesMovimientoDisponibles(c, false)).toContain("quieto");
        }
    });
});

describe("clip procedural (nivel ligero)", () => {
    it("respeta la duración y el número de fotogramas pedidos", () => {
        const clip = generarClipProcedural({ prompt: "saluda con la mano", duracionMs: 3000 });
        expect(clip.duracionMs).toBe(3000);
        expect(clip.fps).toBe(30);
        expect(clip.rotaciones).toHaveLength(Math.round((3000 / 1000) * 30));
        expect(clip.rotaciones[0]).toHaveLength(22);
        expect(clip.raiz).toHaveLength(clip.rotaciones.length);
        expect(clip.origen).toBe("procedural");
        expect(clip.esqueleto).toBe("smplx22");
    });

    it("es determinista: el mismo gesto da el mismo clip", () => {
        const a = generarClipProcedural({ prompt: "respiro de calma", duracionMs: 1000 });
        const b = generarClipProcedural({ prompt: "respiro de calma", duracionMs: 1000 });
        expect(a.rotaciones).toEqual(b.rotaciones);
    });
});

describe("moverAvatar", () => {
    it("nivel fijado «ligero» devuelve un clip procedural sin red", async () => {
        const r = await moverAvatar({ prompt: "asiente despacio", duracionMs: 1200 }, { nivel: "ligero" });
        expect(r.nivel).toBe("ligero");
        expect(r.clip).not.toBeNull();
        expect(r.clip?.origen).toBe("procedural");
        expect(r.clip?.duracionMs).toBe(1200);
        expect(r.clip?.rotaciones).toHaveLength(Math.round((1200 / 1000) * 30));
    });

    it("nivel «quieto» devuelve clip nulo sin fallar", async () => {
        const r = await moverAvatar({ prompt: "escucha atenta" }, { nivel: "quieto" });
        expect(r.nivel).toBe("quieto");
        expect(r.clip).toBeNull();
    });
});
