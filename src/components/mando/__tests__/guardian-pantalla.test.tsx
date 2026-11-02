/**
 * Pruebas del guardián de pantalla (Ola 1005P · PA1005Ds): se cubren SOLO las
 * funciones puras exportadas de `guardian-pantalla.tsx` (textos de estado y el
 * saneado del cuerpo de la API). El hook y las lecturas contra la red no se
 * prueban aquí (reglas del repo: nada de mocks de módulos ni de red en tests).
 */

import { describe, expect, it } from "vitest";

import {
    estadoMac,
    estadoPantalla,
    leerSegundoPlano,
    parsearDespierto,
    parsearEstadoPantalla,
    PANTALLA_DEFECTO,
    textoSegundoPlano,
    type DespiertoLatido,
} from "@/components/mando/guardian-pantalla";
import {
    COMANDO_KEEPALIVE_GO,
    instalarKeepalive,
    KEEPALIVE_REPO_URL,
    resumenKeepalive,
} from "@/lib/install/device-install";

/** El `salud.despierto` del latido tal como lo publica nodo_metagenesis (KAL1101B). */
const LATIDO: DespiertoLatido = {
    despierta: true,
    herramienta: "caffeinate",
    bateria: 92,
    enchufada: true,
    tapa: "duerme",
    va_a_dormir: true,
    se_va_a_dormir: false,
    umbral_bateria: 25,
};

describe("estadoPantalla", () => {
    it("describe cada estado del bloqueo de este dispositivo", () => {
        expect(estadoPantalla("activo")).toContain("mantiene la pantalla");
        expect(estadoPantalla("oculta")).toContain("segundo plano");
        expect(estadoPantalla("sin-soporte")).toContain("no permite");
        expect(estadoPantalla("suelto")).toContain("suelto");
    });
});

describe("estadoMac", () => {
    it("enseña el PID cuando el servicio está vivo", () => {
        expect(estadoMac({ servicio_vivo: true, pid: 1234 })).toBe(
            "Mac: servicio activo (PID 1234)",
        );
    });

    it("dice apagado si el servicio no vive o falta el PID", () => {
        expect(estadoMac({ servicio_vivo: false, pid: null })).toBe(
            "Mac: servicio apagado",
        );
        expect(estadoMac({ servicio_vivo: true, pid: null })).toBe(
            "Mac: servicio apagado",
        );
    });
});

describe("parsearEstadoPantalla", () => {
    it("acepta el cuerpo completo del GET", () => {
        const estado = parsearEstadoPantalla({
            activa: false,
            desde: 1728000000000,
            mac: { servicio_vivo: true, pid: 42 },
        });
        expect(estado).toEqual({
            activa: false,
            desde: 1728000000000,
            mac: { servicio_vivo: true, pid: 42 },
        });
    });

    it("devuelve null si `activa` no es boolean (cuerpo roto)", () => {
        expect(parsearEstadoPantalla(null)).toBeNull();
        expect(parsearEstadoPantalla("activa")).toBeNull();
        expect(parsearEstadoPantalla({ activa: "si" })).toBeNull();
    });

    it("tolera campos ausentes con valores seguros", () => {
        expect(parsearEstadoPantalla({ activa: true })).toEqual({
            activa: true,
            desde: null,
            mac: { servicio_vivo: false, pid: null },
        });
    });

    it("encendido por defecto: el valor inicial del cliente es activa", () => {
        expect(PANTALLA_DEFECTO.activa).toBe(true);
        expect(PANTALLA_DEFECTO.desde).toBeNull();
    });
});

describe("parsearDespierto (KAL1101B)", () => {
    it("sanea el objeto despierto y la raíz del latido con salud.despierto", () => {
        expect(parsearDespierto({ ...LATIDO })).toEqual(LATIDO);
        expect(parsearDespierto({ salud: { despierto: LATIDO } })).toEqual(LATIDO);
    });

    it("devuelve null ante basura o latidos sin la capacidad", () => {
        expect(parsearDespierto(null)).toBeNull();
        expect(parsearDespierto("duerme")).toBeNull();
        expect(parsearDespierto({ salud: {} })).toBeNull();
        expect(parsearDespierto({ despierta: true, tapa: "otra" })).toBeNull();
    });

    it("fe de errores: falta de datos honesta, nada inventado", () => {
        const d = parsearDespierto({ despierta: false, tapa: "sin-tapa" });
        expect(d).toEqual({
            despierta: false, herramienta: null, bateria: null, enchufada: false,
            tapa: "sin-tapa", va_a_dormir: false, se_va_a_dormir: false, umbral_bateria: 25,
        });
    });
});

describe("textoSegundoPlano", () => {
    it("dice la verdad del latido e incluye herramienta y batería cuando hay", () => {
        const conDato = textoSegundoPlano(parsearDespierto(LATIDO));
        expect(conDato).toContain("cerrar la tapa duerme el equipo");
        expect(conDato).toContain("A1");
        expect(conDato).toContain("caffeinate");
        expect(conDato).toContain("92%");
    });

    it("cada tapa y el sin-latido tienen su frase honesta", () => {
        expect(textoSegundoPlano(null)).toContain("todavía no informa");
        const tapa = (t: string): string =>
            textoSegundoPlano(parsearDespierto({ despierta: false, tapa: t })!);
        expect(tapa("desactivada")).toContain("desactivó");
        expect(tapa("sin-tapa")).toContain("sin tapa");
        expect(tapa("clamshell")).toContain("Clamshell");
        const durmiendo = textoSegundoPlano(
            parsearDespierto({ ...LATIDO, se_va_a_dormir: true, bateria: 20 })!,
        );
        expect(durmiendo).toContain("se anuncia");
    });
});

describe("leerSegundoPlano (ajuste por neurona)", () => {
    it("solo «true» enciende; null, basura o «false» quedan apagados", () => {
        expect(leerSegundoPlano("true")).toBe(true);
        expect(leerSegundoPlano("false")).toBe(false);
        expect(leerSegundoPlano(null)).toBe(false);
        expect(leerSegundoPlano("si")).toBe(false);
    });
});

describe("instalarKeepalive por sistema operativo (device-install)", () => {
    it("macOS: Homebrew primero, con la verdad de la tapa cerrada", () => {
        const [brew] = instalarKeepalive("macos");
        expect(brew?.comando).toBe("brew install --cask stigoleg/tap/keepalive");
        expect(brew?.nota).toMatch(/tap.*/);
        expect(brew?.nota).toMatch(/pantalla externa/);
        expect(instalarKeepalive("macos").some((o) => o.comando === COMANDO_KEEPALIVE_GO)).toBe(true);
    });

    it("Windows: Scoop con bucket y Go como respaldo", () => {
        const opciones = instalarKeepalive("windows");
        expect(opciones[0]?.comando).toMatch(/scoop bucket add stigoleg .* && scoop install keepalive/);
        expect(opciones.some((o) => o.comando === COMANDO_KEEPALIVE_GO)).toBe(true);
    });

    it("Linux: paquetes de Releases (sin comando) más la vía Go", () => {
        const opciones = instalarKeepalive("linux");
        expect(opciones[0]?.comando).toBe("");
        expect(opciones[0]?.href).toBe("https://github.com/stigoleg/keep-alive/releases");
        expect(opciones.some((o) => o.comando === COMANDO_KEEPALIVE_GO)).toBe(true);
    });

    it("móvil: no hay keepalive (honesto) y desconocido cae a Go", () => {
        expect(instalarKeepalive("android")).toEqual([]);
        expect(instalarKeepalive("ios")).toEqual([]);
        const soloGo = instalarKeepalive("unknown");
        expect(soloGo).toHaveLength(1);
        expect(soloGo[0]?.comando).toBe(COMANDO_KEEPALIVE_GO);
    });

    it("resumenKeepalive lleva el comando principal o el enlace de descarga", () => {
        expect(resumenKeepalive("macos")).toContain("brew install --cask stigoleg/tap/keepalive");
        expect(resumenKeepalive("linux")).toContain(KEEPALIVE_REPO_URL);
        expect(resumenKeepalive("android")).toMatch(/no hay keepalive/);
    });
});
