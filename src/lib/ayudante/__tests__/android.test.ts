import { describe, it, expect } from "vitest";
import {
    COMANDOS_ANDROID,
    comandoAndroid,
    comandosAndroidDisponibles,
    comandosAndroidNoDisponibles,
    esComandoAndroid,
    comandosAyudanteParaAndroid,
    textoOrdenAyudanteEnAndroid,
    ordenAyudanteDisponibleEnAndroid,
    accionAjusteAndroid,
    SISTEMA_ANDROID,
    NIVELES_TERMINAL_ANDROID,
    MODO_ADMIN_ANDROID,
    type ComandoAndroid,
} from "../android";
import { COMANDOS_AYUDANTE } from "../ordenes";

describe("android.ts · contrato de Android sin root", () => {
    it("define SISTEMA_ANDROID como 'android'", () => {
        expect(SISTEMA_ANDROID).toBe("android");
    });

    it("solo tiene nivel 'usuario' (no hay administrador en Android sin root)", () => {
        expect(NIVELES_TERMINAL_ANDROID).toEqual(["usuario"]);
        expect(NIVELES_TERMINAL_ANDROID).not.toContain("administrador");
    });

    it("solo tiene modo 'tipado' (no hay modo completo en Android sin root)", () => {
        expect(MODO_ADMIN_ANDROID).toEqual(["tipado"]);
        expect(MODO_ADMIN_ANDROID).not.toContain("completo");
    });

    describe("COMANDOS_ANDROID · catálogo completo", () => {
        it("incluye comandos de almacenamiento (SAF) que SÍ existen", () => {
            const existentes = COMANDOS_ANDROID.filter((c) => c.existe);
            const nombresAlmacen = existentes
                .filter((c) => c.nombre.startsWith("almacen-"))
                .map((c) => c.nombre);
            expect(nombresAlmacen).toEqual(["almacen-estado", "almacen-salud", "almacen-verificar"]);
        });

        it("incluye comandos de almacenamiento que NO existen (requieren root)", () => {
            const noExistentes = COMANDOS_ANDROID.filter((c) => !c.existe && c.nombre.startsWith("almacen-"));
            const nombres = noExistentes.map((c) => c.nombre);
            expect(nombres).toEqual(["almacen-formatear", "almacen-montar", "almacen-desmontar"]);
        });

        it("todos los comandos de almacenamiento que no existen tienen textoNoDisponible", () => {
            for (const cmd of COMANDOS_ANDROID) {
                if (cmd.nombre.startsWith("almacen-") && !cmd.existe) {
                    expect(cmd.textoNoDisponible).toBeTruthy();
                    expect(cmd.textoNoDisponible!.length).toBeGreaterThan(10);
                }
            }
        });

        it("incluye comandos de ajustes del sistema que SÍ existen", () => {
            const ajustes = COMANDOS_ANDROID.filter((c) => c.nombre.startsWith("ajuste-"));
            expect(ajustes.every((c) => c.existe)).toBe(true);
            expect(ajustes.length).toBe(7);
            const nombres = ajustes.map((c) => c.nombre);
            expect(nombres).toEqual([
                "ajuste-almacenamiento",
                "ajuste-accesibilidad",
                "ajuste-aplicaciones",
                "ajuste-bateria",
                "ajuste-red",
                "ajuste-seguridad",
                "ajuste-notificaciones",
            ]);
        });

        it("todos los comandos de ajustes tienen accionAjuste", () => {
            for (const cmd of COMANDOS_ANDROID) {
                if (cmd.nombre.startsWith("ajuste-")) {
                    expect(cmd.accionAjuste).toBeTruthy();
                    expect(cmd.accionAjuste!.startsWith("android.settings.")).toBe(true);
                }
            }
        });

        it("marca como no disponibles las órdenes de administrador (servicio, actualizar, registros, reiniciar-app, modo-completo)", () => {
            const adminCommands = [
                "servicio-estado",
                "servicio-reiniciar",
                "actualizar",
                "registros",
                "reiniciar-app",
                "modo-completo",
            ];
            for (const nombre of adminCommands) {
                const cmd = comandoAndroid(nombre as ComandoAndroid);
                expect(cmd).not.toBeNull();
                expect(cmd!.existe).toBe(false);
                expect(cmd!.textoNoDisponible).toBeTruthy();
            }
        });
    });

    describe("comandoAndroid", () => {
        it("busca un comando existente por nombre", () => {
            const cmd = comandoAndroid("almacen-estado");
            expect(cmd).not.toBeNull();
            expect(cmd!.nombre).toBe("almacen-estado");
            expect(cmd!.existe).toBe(true);
        });

        it("busca un comando no existente por nombre", () => {
            const cmd = comandoAndroid("almacen-formatear");
            expect(cmd).not.toBeNull();
            expect(cmd!.nombre).toBe("almacen-formatear");
            expect(cmd!.existe).toBe(false);
        });

        it("devuelve null para nombre desconocido", () => {
            expect(comandoAndroid("no-existe" as ComandoAndroid)).toBeNull();
        });
    });

    describe("comandosAndroidDisponibles / NoDisponibles", () => {
        it("filtra los disponibles", () => {
            const disp = comandosAndroidDisponibles();
            expect(disp.every((c) => c.existe)).toBe(true);
            expect(disp.length).toBeGreaterThan(0);
        });

        it("filtra los no disponibles", () => {
            const noDisp = comandosAndroidNoDisponibles();
            expect(noDisp.every((c) => !c.existe)).toBe(true);
            expect(noDisp.length).toBeGreaterThan(0);
        });

        it("la suma de disponibles y no disponibles iguala al total", () => {
            expect(comandosAndroidDisponibles().length + comandosAndroidNoDisponibles().length).toBe(COMANDOS_ANDROID.length);
        });
    });

    describe("esComandoAndroid", () => {
        it("reconoce nombres válidos", () => {
            expect(esComandoAndroid("almacen-estado")).toBe(true);
            expect(esComandoAndroid("ajuste-accesibilidad")).toBe(true);
            expect(esComandoAndroid("modo-completo")).toBe(true);
        });

        it("rechaza nombres inválidos", () => {
            expect(esComandoAndroid("no-existe")).toBe(false);
            expect(esComandoAndroid("")).toBe(false);
        });
    });

    describe("comandosAyudanteParaAndroid", () => {
        it("devuelve solo los comandos del ayudante que incluyen 'android' en sus sistemas", () => {
            const cmds = comandosAyudanteParaAndroid();
            for (const cmd of cmds) {
                expect(cmd.sistemas).toContain("android");
            }
        });

        it("coincide con los comandos de almacenamiento SAF del catálogo Android", () => {
            const cmds = comandosAyudanteParaAndroid();
            const nombres = cmds.map((c) => c.nombre);
            expect(nombres).toEqual(["almacen-estado", "almacen-salud", "almacen-verificar"]);
        });

        it("no incluye comandos que requieren admin completo o ayudante", () => {
            const cmds = comandosAyudanteParaAndroid();
            for (const cmd of cmds) {
                expect(cmd.requiereAdminCompleto).toBe(false);
                expect(cmd.requiereAyudante).toBe(false);
            }
        });
    });

    describe("textoOrdenAyudanteEnAndroid", () => {
        it("devuelve null para órdenes que SÍ existen en Android", () => {
            expect(textoOrdenAyudanteEnAndroid("almacen-estado")).toBeNull();
            expect(textoOrdenAyudanteEnAndroid("almacen-salud")).toBeNull();
            expect(textoOrdenAyudanteEnAndroid("almacen-verificar")).toBeNull();
        });

        it("devuelve texto explicativo para órdenes que NO existen en Android", () => {
            const texto = textoOrdenAyudanteEnAndroid("almacen-formatear");
            expect(texto).toBeTruthy();
            expect(texto!.toLowerCase()).toContain("android");
            expect(texto!.toLowerCase()).toContain("root");
        });

        it("devuelve null para comando desconocido del ayudante", () => {
            expect(textoOrdenAyudanteEnAndroid("no-existe")).toBeNull();
        });
    });

    describe("ordenAyudanteDisponibleEnAndroid", () => {
        it("true para comandos de almacenamiento SAF", () => {
            expect(ordenAyudanteDisponibleEnAndroid("almacen-estado")).toBe(true);
            expect(ordenAyudanteDisponibleEnAndroid("almacen-salud")).toBe(true);
            expect(ordenAyudanteDisponibleEnAndroid("almacen-verificar")).toBe(true);
        });

        it("false para comandos que requieren admin/root", () => {
            expect(ordenAyudanteDisponibleEnAndroid("almacen-formatear")).toBe(false);
            expect(ordenAyudanteDisponibleEnAndroid("servicio-reiniciar")).toBe(false);
            expect(ordenAyudanteDisponibleEnAndroid("actualizar")).toBe(false);
            expect(ordenAyudanteDisponibleEnAndroid("modo-completo")).toBe(false);
        });

        it("false para comando desconocido", () => {
            expect(ordenAyudanteDisponibleEnAndroid("no-existe")).toBe(false);
        });
    });

    describe("accionAjusteAndroid", () => {
        it("devuelve la acción de Intent para comandos de ajuste válidos", () => {
            expect(accionAjusteAndroid("ajuste-almacenamiento")).toBe("android.settings.INTERNAL_STORAGE_SETTINGS");
            expect(accionAjusteAndroid("ajuste-accesibilidad")).toBe("android.settings.ACCESSIBILITY_SETTINGS");
            expect(accionAjusteAndroid("ajuste-aplicaciones")).toBe("android.settings.APPLICATION_DETAILS_SETTINGS");
            expect(accionAjusteAndroid("ajuste-bateria")).toBe("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS");
            expect(accionAjusteAndroid("ajuste-red")).toBe("android.settings.WIRELESS_SETTINGS");
            expect(accionAjusteAndroid("ajuste-seguridad")).toBe("android.settings.SECURITY_SETTINGS");
            expect(accionAjusteAndroid("ajuste-notificaciones")).toBe("android.settings.APP_NOTIFICATION_SETTINGS");
        });

        it("devuelve null para comandos que no son de ajuste", () => {
            expect(accionAjusteAndroid("almacen-estado")).toBeNull();
            expect(accionAjusteAndroid("modo-completo")).toBeNull();
        });

        it("devuelve null para comando inexistente", () => {
            expect(accionAjusteAndroid("no-existe" as ComandoAndroid)).toBeNull();
        });
    });

    describe("consistencia con COMANDOS_AYUDANTE de ordenes.ts", () => {
        it("los comandos SAF del ayudante coinciden con los marcados como existentes en Android", () => {
            const ayudanteSAF = COMANDOS_AYUDANTE.filter((c) => c.sistemas.includes("android"));
            const androidSAF = COMANDOS_ANDROID.filter((c) => c.nombre.startsWith("almacen-") && c.existe);
            expect(ayudanteSAF.map((c) => c.nombre).sort()).toEqual(androidSAF.map((c) => c.nombre).sort());
        });

        it("ningún comando del ayudante que requiera admin/ayudante tiene 'android' en sistemas", () => {
            for (const cmd of COMANDOS_AYUDANTE) {
                if (cmd.requiereAdminCompleto || cmd.requiereAyudante) {
                    expect(cmd.sistemas).not.toContain("android");
                }
            }
        });
    });
});