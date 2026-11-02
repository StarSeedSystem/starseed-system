/**
 * Pruebas de KAL1101C: keepalive por SO (device-install.ts) y las funciones
 * puras de «Seguir trabajando con la pantalla apagada» (guardian-pantalla.tsx).
 * Solo funciones puras, sin red ni mocks de Node (reglas del repo).
 */

import { describe, expect, it } from "vitest";

import {
    avisoTapaPortatil,
    estadoKeepaliveDeLatido,
    MODOS_PANTALLA,
    modoPantalla,
    parsearAjustePantallaNeurona,
    textoSeguirTrabajando,
} from "@/components/mando/guardian-pantalla";
import { infoKeepalive } from "@/lib/install/device-install";

describe("infoKeepalive", () => {
    it("la Mac instala por Homebrew o Go", () => {
        const info = infoKeepalive("macos");
        expect(info.disponible).toBe(true);
        expect(info.comandos.some((c) => c.comando === "brew install --cask stigoleg/tap/keepalive")).toBe(true);
        expect(info.comandos.some((c) => c.comando.includes("go install"))).toBe(true);
    });

    it("Windows instala por Scoop y Linux por releases o Go", () => {
        expect(infoKeepalive("windows").comandos.some((c) => c.comando === "scoop install keepalive")).toBe(true);
        const linux = infoKeepalive("linux");
        expect(linux.disponible).toBe(true);
        expect(linux.comandos.some((c) => (c.href ?? "").includes("releases"))).toBe(true);
    });

    it("en móvil u otro sistema desconocido no promete nada", () => {
        for (const os of ["android", "ios", "unknown"] as const) {
            const info = infoKeepalive(os);
            expect(info.disponible).toBe(false);
            expect(info.comandos).toEqual([]);
        }
    });

    it("el modo sistema usa --keep-display=false y dice el límite honesto de la tapa", () => {
        const info = infoKeepalive("macos");
        expect(info.ejecucion).toContain("--keep-display=false");
        expect(info.limites).toContain("tapa");
        expect(info.limites).toContain("A1");
    });
});

describe("modoPantalla", () => {
    it("acepta ambos modos y cualquier cosa rara vale pantalla", () => {
        expect(modoPantalla("sistema")).toBe("sistema");
        expect(modoPantalla("pantalla")).toBe("pantalla");
        expect(modoPantalla("otro")).toBe("pantalla");
        expect(modoPantalla(undefined)).toBe("pantalla");
    });

    it("las dos opciones tienen etiqueta y detalle en español", () => {
        expect(MODOS_PANTALLA).toHaveLength(2);
        for (const opcion of MODOS_PANTALLA) {
            expect(opcion.etiqueta.length > 0).toBe(true);
            expect(opcion.detalle.length > 0).toBe(true);
        }
    });
});

describe("estadoKeepaliveDeLatido", () => {
    it("lee el campo keepalive de las señales del latido", () => {
        expect(estadoKeepaliveDeLatido({ keepalive: { activo: true, modo: "sistema" } })).toEqual({
            activo: true,
            modo: "sistema",
        });
    });

    it("cuerpos raros devuelven null en vez de un estado inventado", () => {
        expect(estadoKeepaliveDeLatido(null)).toBeNull();
        expect(estadoKeepaliveDeLatido("activo")).toBeNull();
        expect(estadoKeepaliveDeLatido({ keepalive: "sí" })).toBeNull();
    });

    it("sin modo en el latido vale el modo por defecto", () => {
        expect(estadoKeepaliveDeLatido({ keepalive: {} })).toEqual({ activo: false, modo: "pantalla" });
    });
});

describe("parsearAjustePantallaNeurona", () => {
    it("acepta un ajuste por neurona con modo", () => {
        expect(
            parsearAjustePantallaNeurona({ neuronaId: "alba-1", seguir: true, modo: "sistema" }),
        ).toEqual({ neuronaId: "alba-1", seguir: true, modo: "sistema" });
    });

    it("sin id de neurona no hay ajuste", () => {
        expect(parsearAjustePantallaNeurona(null)).toBeNull();
        expect(parsearAjustePantallaNeurona({ neuronaId: "  ", seguir: true })).toBeNull();
    });

    it("el seguir ausente vale false y el modo raro vale pantalla", () => {
        expect(parsearAjustePantallaNeurona({ neuronaId: "n" })).toEqual({
            neuronaId: "n",
            seguir: false,
            modo: "pantalla",
        });
    });
});

describe("textos honestos del interruptor", () => {
    it("el modo sistema habla de pantalla apagada y neurona trabajando", () => {
        expect(textoSeguirTrabajando("sistema")).toContain("se apaga");
        expect(textoSeguirTrabajando("sistema")).toContain("siguen");
    });

    it("el aviso de la tapa dice la verdad del portátil", () => {
        expect(avisoTapaPortatil("sistema")).toContain("corriente y pantalla externa");
        expect(avisoTapaPortatil("sistema")).toContain("A1");
        expect(avisoTapaPortatil("pantalla")).toContain("tapa");
    });
});
