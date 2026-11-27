import { describe, it, expect } from "vitest";
import {
    COMANDOS_ANDROID,
    validarArgsAndroid,
    sistemasComandoAndroid,
    requiereRoot,
    catalogoAndroid,
    COMANDOS_NO_DISPONIBLES_ANDROID,
    CAPABILITY_ANDROID,
    INVENTARIO_PERMISOS_ANDROID,
    COMANDOS_APP_ANDROID,
    type ComandoAndroid,
    type SistemaAndroid,
} from "../android";

describe("android.ts · órdenes que una app sin root puede hacer en Android", () => {
    it("define el catálogo de comandos Android (sin root)", () => {
        const nombres = COMANDOS_ANDROID.map((c) => c.nombre);
        expect(nombres).toEqual([
            "almacen-estado",
            "almacen-salud",
            "almacen-acceder",
            "ajustes-abrir",
            "pantalla-proyectar",
            "accesibilidad-estado",
            "superposicion-estado",
            "bateria-estado",
            "red-estado",
            "notificaciones-leer",
            "ajustes-rapidos-toggle",
        ]);
    });

    it("cada comando Android tiene sistemas = ['android'] y no requiere root", () => {
        for (const cmd of COMANDOS_ANDROID) {
            expect(cmd.sistemas).toEqual(["android"]);
            expect(cmd.requiereRoot).toBe(false);
            expect(cmd.requiereAyudante).toBe(false);
        }
    });

    it("validarArgsAndroid acepta argumentos válidos", () => {
        expect(validarArgsAndroid("almacen-estado", {})).toEqual({});
        expect(validarArgsAndroid("almacen-salud", { disco: "ABC123" })).toEqual({ disco: "ABC123" });
        expect(validarArgsAndroid("almacen-acceder", { uri: "content://com.android.externalstorage.documents/tree/primary%3ADocuments" })).toEqual({ uri: "content://com.android.externalstorage.documents/tree/primary%3ADocuments" });
        expect(validarArgsAndroid("ajustes-abrir", { pantalla: "accesibilidad" })).toEqual({ pantalla: "accesibilidad" });
        expect(validarArgsAndroid("pantalla-proyectar", { calidad: 80, ladoMax: 1280 })).toEqual({ calidad: 80, ladoMax: 1280 });
        expect(validarArgsAndroid("accesibilidad-estado", {})).toEqual({});
        expect(validarArgsAndroid("superposicion-estado", {})).toEqual({});
        expect(validarArgsAndroid("bateria-estado", {})).toEqual({});
        expect(validarArgsAndroid("red-estado", {})).toEqual({});
        expect(validarArgsAndroid("notificaciones-leer", { limite: 50 })).toEqual({ limite: 50 });
        expect(validarArgsAndroid("ajustes-rapidos-toggle", { tile: "wifi", activar: true })).toEqual({ tile: "wifi", activar: true });
    });

    it("validarArgsAndroid rechaza argumentos inválidos o extra", () => {
        expect(validarArgsAndroid("almacen-salud", {})).toBeNull();
        expect(validarArgsAndroid("almacen-salud", { disco: "ABC123", extra: true })).toBeNull();
        expect(validarArgsAndroid("almacen-acceder", { uri: "" })).toBeNull();
        expect(validarArgsAndroid("ajustes-abrir", { pantalla: "inexistente" })).toBeNull();
        expect(validarArgsAndroid("pantalla-proyectar", { calidad: 150 })).toBeNull();
        expect(validarArgsAndroid("pantalla-proyectar", { ladoMax: 100 })).toBeNull();
        expect(validarArgsAndroid("notificaciones-leer", { limite: 0 })).toBeNull();
        expect(validarArgsAndroid("ajustes-rapidos-toggle", { tile: "wifi" })).toBeNull();
        expect(validarArgsAndroid("ajustes-rapidos-toggle", { tile: "wifi", activar: "si" })).toBeNull();
    });

    it("comando desconocido devuelve null", () => {
        expect(validarArgsAndroid("inexistente", {})).toBeNull();
        expect(sistemasComandoAndroid("inexistente")).toEqual([]);
        expect(requiereRoot("inexistente")).toBe(false);
    });

    it("catalogoAndroid filtra solo Android", () => {
        const cat = catalogoAndroid();
        expect(cat.every((c) => c.sistemas.includes("android"))).toBe(true);
        expect(cat.map((c) => c.nombre)).toContain("almacen-acceder");
    });
});

describe("android.ts · qué NO se puede hacer en Android sin root (texto para la persona)", () => {
    it("COMANDOS_NO_DISPONIBLES_ANDROID lista lo que requiere root/admin y el texto visible", () => {
        expect(COMANDOS_NO_DISPONIBLES_ANDROID.length).toBeGreaterThan(0);
        for (const item of COMANDOS_NO_DISPONIBLES_ANDROID) {
            expect(item.comando).toBeTruthy();
            expect(item.motivo).toBeTruthy();
            expect(item.textoVisible).toBeTruthy();
            expect(item.textoVisible.length).toBeGreaterThan(10);
        }
    });

    it("incluye al menos: formatear, montar, desmontar, servicio-reiniciar, actualizar, modo-completo", () => {
        const comandos = COMANDOS_NO_DISPONIBLES_ANDROID.map((c) => c.comando);
        expect(comandos).toContain("almacen-formatear");
        expect(comandos).toContain("almacen-montar");
        expect(comandos).toContain("almacen-desmontar");
        expect(comandos).toContain("servicio-reiniciar");
        expect(comandos).toContain("actualizar");
        expect(comandos).toContain("modo-completo");
    });
});

describe("android.ts · capability e inventario de permisos", () => {
    it("CAPABILITY_ANDROID registra los permisos nativos que la app declara", () => {
        expect(CAPABILITY_ANDROID.permisos).toBeDefined();
        expect(Array.isArray(CAPABILITY_ANDROID.permisos)).toBe(true);
        expect(CAPABILITY_ANDROID.permisos.length).toBeGreaterThan(0);
        for (const p of CAPABILITY_ANDROID.permisos) {
            expect(p.nombre).toBeTruthy();
            expect(p.descripcion).toBeTruthy();
            expect(["normal", "dangerous", "signature", "special"]).toContain(p.tipo);
        }
    });

    it("INVENTARIO_PERMISOS_ANDROID mapea cada orden a los permisos que necesita", () => {
        expect(INVENTARIO_PERMISOS_ANDROID).toBeDefined();
        for (const [orden, permisos] of Object.entries(INVENTARIO_PERMISOS_ANDROID)) {
            // Algunas órdenes no requieren permisos especiales (ej. almacen-estado, ajustes-abrir)
            for (const p of permisos) {
                expect(CAPABILITY_ANDROID.permisos.some((cp) => cp.nombre === p)).toBe(true);
            }
        }
        // Verificar que las órdenes que SÍ necesitan permisos los tienen mapeados
        expect(INVENTARIO_PERMISOS_ANDROID["pantalla-proyectar"].length).toBeGreaterThan(0);
        expect(INVENTARIO_PERMISOS_ANDROID["red-estado"].length).toBeGreaterThan(0);
        expect(INVENTARIO_PERMISOS_ANDROID["notificaciones-leer"].length).toBeGreaterThan(0);
    });
});

describe("android.ts · COMANDOS_APP incluye los nuevos comandos nativos Android", () => {
    it("COMANDOS_APP_ANDROID registra los comandos Tauri/Kotlin nativos", () => {
        expect(COMANDOS_APP_ANDROID.length).toBeGreaterThan(0);
        for (const cmd of COMANDOS_APP_ANDROID) {
            expect(cmd.nombre).toBeTruthy();
            expect(cmd.args).toBeDefined();
            expect(cmd.devuelve).toBeDefined();
        }
    });
});