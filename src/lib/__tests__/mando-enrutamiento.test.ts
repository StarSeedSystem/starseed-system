/**
 * Enrutamiento visible de la flota (2026-09-09 · Ola 301 · RT2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Prueba el módulo PURO `src/lib/mando/enrutamiento.ts`: quién escribe ahora,
 * quién entra si el activo se agota y por qué queda fuera cada eslabón. Nada de
 * red ni de disco: solo catálogo y salud como datos de entrada.
 */

import { describe, it, expect } from "vitest";

import type { ModeloDisponible, SaludProveedor } from "@/lib/mando/modelos-disponibles";
import {
    etiquetaPosicion,
    planDeRuta,
    resumenDeFlota,
    TEXTO_ESTADO_RUTA,
} from "@/lib/mando/enrutamiento";

/** Momento fijo del reloj para que «sin cupo hasta» no dependa de cuándo se pruebe. */
const AHORA = Date.parse("2026-09-09T12:00:00Z");

/** Ficha de salud mínima del supervisor, con lo que cada caso necesite. */
function salud(parcial: Partial<SaludProveedor>): SaludProveedor {
    return {
        estado: null,
        sinCupoHasta: null,
        motivo: null,
        ultimo429: null,
        claves: [],
        clavesActiva: null,
        t: "2026-09-09 11:59:00",
        ...parcial,
    };
}

/** Un modelo del catálogo vivo, con lo justo para situarlo en una cadena. */
function modelo(parcial: Partial<ModeloDisponible> & { id: string; proveedor: string }): ModeloDisponible {
    return {
        nombre: parcial.id,
        gratis: true,
        contexto: null,
        salud: "vivo",
        papel: "escritor",
        ...parcial,
    };
}

const CATALOGO: ModeloDisponible[] = [
    modelo({ id: "nim/kimi-k3", proveedor: "nim", papel: "escritor", escritor: true }),
    modelo({ id: "tokenrouter/glm-5.3", proveedor: "tokenrouter", papel: "revisor", escritor: true }),
    modelo({ id: "llm7/gpt-oss", proveedor: "llm7", papel: "escritor", escritor: true, soloMarkdown: true }),
    modelo({ id: "aihubmix/glm-5.3", proveedor: "aihubmix", papel: "revisor" }),
    modelo({ id: "gemini/flash-lite", proveedor: "gemini", papel: "revisor", salud: "sin-clave" }),
    modelo({ id: "ollama/astraura", proveedor: "ollama", papel: "local" }),
];

const CLAVES = ["nim", "tokenrouter", "aihubmix"];

describe("planDeRuta", () => {
    it("ordena la cadena de escritores y deja fuera a los de solo Markdown", () => {
        const plan = planDeRuta(CATALOGO, {}, CLAVES, "escritor", AHORA);
        expect(plan.cadena.map((e) => e.id)).toEqual(["nim/kimi-k3", "tokenrouter/glm-5.3"]);
        expect(plan.activo?.id).toBe("nim/kimi-k3");
        expect(plan.siguiente?.id).toBe("tokenrouter/glm-5.3");
        expect(plan.cadena[1].posicion).toBe(2);
    });

    it("pasa el turno al siguiente cuando el activo se queda sin cupo", () => {
        const conCupo: Record<string, SaludProveedor> = {
            nim: salud({ estado: "vivo", sinCupoHasta: "2026-09-09 13:00:00", motivo: "429 del proveedor" }),
        };
        const plan = planDeRuta(CATALOGO, conCupo, CLAVES, "escritor", AHORA);
        expect(plan.cadena[0].estado).toBe("sin_cupo");
        expect(plan.activo?.id).toBe("tokenrouter/glm-5.3");
        expect(plan.siguiente).toBeNull();
        expect(plan.porque).toContain("porque es el primero vivo de la cadena");
        expect(plan.porque).toContain("Fuera 1: 1 sin cupo");
    });

    it("marca «mudo» a quien responde vacío y «sin clave» a quien no la tiene", () => {
        const mala: Record<string, SaludProveedor> = {
            aihubmix: salud({ estado: "mudo", motivo: "respuesta vacía tres veces seguidas" }),
        };
        const plan = planDeRuta(CATALOGO, mala, CLAVES, "revisor", AHORA);
        const porId = new Map(plan.cadena.map((e) => [e.id, e]));
        expect(porId.get("aihubmix/glm-5.3")?.estado).toBe("mudo");
        expect(porId.get("gemini/flash-lite")?.estado).toBe("sin_clave");
        expect(plan.activo?.id).toBe("tokenrouter/glm-5.3");
        expect(TEXTO_ESTADO_RUTA.mudo).toBe("mudo");
    });

    it("dice claramente cuándo un papel se queda sin nadie", () => {
        const plan = planDeRuta([], {}, CLAVES, "director", AHORA);
        expect(plan.cadena).toHaveLength(0);
        expect(plan.activo).toBeNull();
        expect(plan.porque).toContain("Todavía no hay ningún modelo declarado");
    });
});

describe("resumenDeFlota", () => {
    it("cuenta cuántos escriben de todos los modelos y trae los tres planes", () => {
        const resumen = resumenDeFlota(CATALOGO, {}, CLAVES, AHORA);
        expect(resumen.frase).toBe("escriben 2 de 6 modelos");
        expect(resumen.escriben).toBe(2);
        expect(resumen.total).toBe(6);
        expect(resumen.planes.map((p) => p.papel)).toEqual(["escritor", "revisor", "director"]);
        expect(resumen.planes[2].activo?.id).toBe("ollama/astraura");
    });
});

describe("etiquetaPosicion", () => {
    it("nombra el sitio de cada proveedor en la cadena", () => {
        const { planes } = resumenDeFlota(CATALOGO, {}, CLAVES, AHORA);
        expect(etiquetaPosicion(planes, "nim")).toBe("escritor 1.º");
        expect(etiquetaPosicion(planes, "aihubmix")).toBe("revisor 2.º");
        expect(etiquetaPosicion(planes, "ollama")).toBe("director");
        expect(etiquetaPosicion(planes, "inexistente")).toBeNull();
    });
});
