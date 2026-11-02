/**
 * Pruebas del guardián de pantalla (Ola 1005P · PA1005Ds) y de su ampliación
 * keepalive (KAL1101C): se cubren SOLO las funciones puras exportadas de
 * `guardian-pantalla.tsx` (textos de estado, modo pantalla/sistema, orden
 * keepalive y el saneado del cuerpo de la API) y la ficha de instalación de
 * keepalive por sistema (`instalacionKeepalive` de `device-install.ts`).
 * El hook y las lecturas contra la red no se prueban aquí (reglas del repo:
 * nada de mocks de módulos ni de red en tests).
 */

import { describe, expect, it } from "vitest";

import {
    estadoMac,
    estadoPantalla,
    modoDesdeValor,
    ordenKeepalive,
    parsearEstadoPantalla,
    PANTALLA_DEFECTO,
    textoModo,
    textoTapa,
} from "@/components/mando/guardian-pantalla";
import {
    instalacionKeepalive,
    KEEPALIVE_REPO_URL,
} from "@/lib/install/device-install";

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
            modo: "pantalla",
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
            modo: "pantalla",
        });
    });

    it("encendido por defecto: el valor inicial del cliente es activa", () => {
        expect(PANTALLA_DEFECTO.activa).toBe(true);
        expect(PANTALLA_DEFECTO.desde).toBeNull();
    });

    it("el modo que falta en el cuerpo es «pantalla» (comportamiento de siempre)", () => {
        expect(parsearEstadoPantalla({ activa: true })?.modo).toBe("pantalla");
    });

    it("acepta el modo que viaja en el ajuste del latido (KAL1101B)", () => {
        const estado = parsearEstadoPantalla({
            activa: true,
            modo: "sistema",
            mac: { servicio_vivo: false, pid: null },
        });
        expect(estado?.modo).toBe("sistema");
        // Un valor desconocido en el campo no lo convierte en modo sistema.
        expect(parsearEstadoPantalla({ activa: true, modo: 7 })?.modo).toBe("pantalla");
        expect(PANTALLA_DEFECTO.modo).toBe("pantalla");
    });
});

describe("modo desde el latido (KAL1101C)", () => {
    it("solo el valor «sistema» cambia la costumbre de mantener la pantalla", () => {
        expect(modoDesdeValor("sistema")).toBe("sistema");
        expect(modoDesdeValor("pantalla")).toBe("pantalla");
        expect(modoDesdeValor(undefined)).toBe("pantalla");
        expect(modoDesdeValor(null)).toBe("pantalla");
        expect(modoDesdeValor("raro")).toBe("pantalla");
        expect(modoDesdeValor(0)).toBe("pantalla");
    });

    it("cada modo se explica en una línea honesta", () => {
        expect(textoModo("sistema")).toContain("Sistema");
        expect(textoModo("sistema")).toContain("se apaga sola");
        expect(textoModo("pantalla")).toContain("encendidos");
    });
});

describe("orden keepalive por modo (KAL1101C)", () => {
    it("modo sistema: solo el aparato despierto (--keep-display=false)", () => {
        expect(ordenKeepalive("sistema")).toBe("keepalive --keep-display=false");
    });

    it("modo pantalla: keepalive en su defecto (también la pantalla)", () => {
        expect(ordenKeepalive("pantalla")).toBe("keepalive");
    });
});

describe("verdad por sistema sobre la tapa (KAL1101C)", () => {
    it("portátil Mac: la tapa duerme salvo corriente y pantalla externa; si duerme, relevo al A1", () => {
        const t = textoTapa("macos");
        expect(t).toContain("corriente y pantalla externa");
        expect(t).toContain("A1");
    });

    it("Windows y Linux: KeepAlive sostiene el sistema y el A1 es el relevo", () => {
        expect(textoTapa("windows")).toContain("A1");
        expect(textoTapa("linux")).toContain("systemd-logind");
    });

    it("móvil: no se permite y se dice; desconocido: avisa del relevo al A1", () => {
        expect(textoTapa("android")).toContain("no permiten");
        expect(textoTapa("ios")).toContain("A1");
        expect(textoTapa("unknown")).toContain("A1");
    });
});

describe("instalación de keepalive por sistema (KAL1101C)", () => {
    it("macOS: cask de Homebrew y nota honesta sobre la tapa", () => {
        const m = instalacionKeepalive("macos");
        expect(m.disponible).toBe(true);
        expect(m.comando).toBe("brew install --cask stigoleg/tap/keepalive");
        expect(m.href).toBe(KEEPALIVE_REPO_URL);
        expect(m.nota).toContain("tapa");
    });

    it("Windows: scoop y honestidad sobre suspensión forzada", () => {
        const w = instalacionKeepalive("windows");
        expect(w.disponible).toBe(true);
        expect(w.comando).toBe("scoop install keepalive");
        expect(w.nota).toContain("suspensión");
    });

    it("Linux: go install como orden única y releases para los paquetes", () => {
        const l = instalacionKeepalive("linux");
        expect(l.disponible).toBe(true);
        expect(l.comando).toBe(
            "go install github.com/stigoleg/keep-alive/v2/cmd/keepalive@latest",
        );
        expect(l.href).toBe(`${KEEPALIVE_REPO_URL}/releases`);
        expect(l.nota).toContain(".deb");
    });

    it("móvil: no disponible y sin comando; desconocido: vía universal", () => {
        const a = instalacionKeepalive("android");
        expect(a.disponible).toBe(false);
        expect(a.comando).toBeNull();
        expect(instalacionKeepalive("ios").comando).toBeNull();
        const u = instalacionKeepalive("unknown");
        expect(u.disponible).toBe(true);
        expect(u.comando).toContain("go install");
        expect(u.nota.length).toBeGreaterThan(0);
    });

    it("ninguna ficha promete sin decir sus límites (nota siempre presente)", () => {
        for (const os of ["macos", "windows", "linux", "android", "ios", "unknown"] as const) {
            expect(instalacionKeepalive(os).nota.length).toBeGreaterThan(10);
        }
    });
});
