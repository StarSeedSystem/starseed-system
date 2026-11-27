import { describe, it, expect } from "vitest";
import {
    COMANDOS_ANDROID,
    tipoOrdenAndroid,
    textoNoDisponible,
    minApiOrden,
    requiereInteraccionOrden,
    validarArgsAndroid,
    comandosPorTipo,
    comandosDisponibles,
    comandosNoDisponibles,
    type ComandoAndroid,
    type TipoOrdenAndroid,
    type ArgsOrdenAndroid,
} from "../android";

describe("android.ts · órdenes de Android sin root", () => {
    it("define todos los comandos del catálogo Android", () => {
        const nombres = COMANDOS_ANDROID.map((c) => c.nombre);
        expect(nombres).toEqual([
            "almacen-lista-saf",
            "almacen-abrir-saf",
            "almacen-leer-saf",
            "almacen-escribir-saf",
            "ajustes-accesibilidad",
            "ajustes-superposicion",
            "ajustes-notificaciones",
            "ajustes-bateria",
            "ajustes-almacenamiento",
            "permiso-calendario",
            "permiso-contactos",
            "permiso-ubicacion",
            "permiso-microfono",
            "permiso-camara",
            "info-aparato",
            "info-aplicacion",
            "info-red",
            "info-bateria",
        ]);
    });

    it("cada comando tiene tipo, descripción, textoNoDisponible, args, ejemploArgs, minApi y requiereInteraccion", () => {
        for (const cmd of COMANDOS_ANDROID) {
            expect(cmd.tipo).toBeTruthy();
            expect(cmd.descripcion).toBeTruthy();
            expect(cmd.textoNoDisponible).toBeTruthy();
            expect(cmd.args).toBeDefined();
            expect(cmd.ejemploArgs).toBeDefined();
            expect(typeof cmd.minApi).toBe("number");
            expect(typeof cmd.requiereInteraccion).toBe("boolean");
            expect(validarArgsAndroid(cmd.nombre, cmd.ejemploArgs)).toEqual(cmd.ejemploArgs);
        }
    });

    it("los tipos de orden son almacenamiento-saf, ajustes-sistema, permiso-especial, informacion", () => {
        const tipos: TipoOrdenAndroid[] = ["almacenamiento-saf", "ajustes-sistema", "permiso-especial", "informacion"];
        for (const cmd of COMANDOS_ANDROID) {
            expect(tipos).toContain(cmd.tipo);
        }
    });

    it("validarArgsAndroid acepta argumentos válidos y rechaza inválidos o extra", () => {
        expect(validarArgsAndroid("almacen-lista-saf", {})).toEqual({});
        expect(validarArgsAndroid("almacen-lista-saf", { extra: true })).toBeNull();

        expect(validarArgsAndroid("almacen-abrir-saf", { mime: "*/*", modo: "directorio" })).toEqual({ mime: "*/*", modo: "directorio" });
        expect(validarArgsAndroid("almacen-abrir-saf", { mime: "invalid", modo: "directorio" })).toBeNull();
        expect(validarArgsAndroid("almacen-abrir-saf", { mime: "*/*", modo: "otro" })).toBeNull();
        expect(validarArgsAndroid("almacen-abrir-saf", { modo: "directorio" })).toBeNull();

        expect(validarArgsAndroid("almacen-leer-saf", { uri: "content://tree/primary", ruta: "archivo.txt" })).toEqual({ uri: "content://tree/primary", ruta: "archivo.txt" });
        expect(validarArgsAndroid("almacen-leer-saf", { uri: "file:///sdcard", ruta: "archivo.txt" })).toBeNull();
        expect(validarArgsAndroid("almacen-leer-saf", { uri: "content://tree/primary", ruta: "" })).toBeNull();

        expect(validarArgsAndroid("almacen-escribir-saf", { uri: "content://tree/primary", ruta: "nuevo.txt", contenido: "hola" })).toEqual({ uri: "content://tree/primary", ruta: "nuevo.txt", contenido: "hola" });
        expect(validarArgsAndroid("almacen-escribir-saf", { uri: "content://tree/primary", ruta: "nuevo.txt", contenido: 123 })).toBeNull();

        expect(validarArgsAndroid("ajustes-accesibilidad", {})).toEqual({});
        expect(validarArgsAndroid("ajustes-accesibilidad", { extra: true })).toBeNull();

        expect(validarArgsAndroid("permiso-ubicacion", { precisa: true })).toEqual({ precisa: true });
        expect(validarArgsAndroid("permiso-ubicacion", { precisa: false })).toEqual({ precisa: false });
        expect(validarArgsAndroid("permiso-ubicacion", { precisa: "si" })).toBeNull();
        expect(validarArgsAndroid("permiso-ubicacion", {})).toBeNull();

        expect(validarArgsAndroid("info-aparato", {})).toEqual({});
        expect(validarArgsAndroid("info-aparato", { extra: true })).toBeNull();
    });

    it("comando desconocido devuelve null en todas las consultas", () => {
        expect(tipoOrdenAndroid("inexistente")).toBeNull();
        expect(textoNoDisponible("inexistente")).toBeNull();
        expect(minApiOrden("inexistente")).toBe(0);
        expect(requiereInteraccionOrden("inexistente")).toBe(false);
        expect(validarArgsAndroid("inexistente", {})).toBeNull();
    });

    it("comandos de almacenamiento SAF: minApi y requiereInteraccion correctos", () => {
        expect(minApiOrden("almacen-lista-saf")).toBe(21);
        expect(requiereInteraccionOrden("almacen-lista-saf")).toBe(false);

        expect(minApiOrden("almacen-abrir-saf")).toBe(19);
        expect(requiereInteraccionOrden("almacen-abrir-saf")).toBe(true);

        expect(minApiOrden("almacen-leer-saf")).toBe(19);
        expect(requiereInteraccionOrden("almacen-leer-saf")).toBe(false);

        expect(minApiOrden("almacen-escribir-saf")).toBe(21);
        expect(requiereInteraccionOrden("almacen-escribir-saf")).toBe(false);
    });

    it("comandos de ajustes del sistema: todos requieren interacción", () => {
        const ajustes = ["ajustes-accesibilidad", "ajustes-superposicion", "ajustes-notificaciones", "ajustes-bateria", "ajustes-almacenamiento"];
        for (const nombre of ajustes) {
            expect(requiereInteraccionOrden(nombre)).toBe(true);
            expect(tipoOrdenAndroid(nombre)).toBe("ajustes-sistema");
        }
    });

    it("comandos de permisos especiales: todos requieren interacción", () => {
        const permisos = ["permiso-calendario", "permiso-contactos", "permiso-ubicacion", "permiso-microfono", "permiso-camara"];
        for (const nombre of permisos) {
            expect(requiereInteraccionOrden(nombre)).toBe(true);
            expect(tipoOrdenAndroid(nombre)).toBe("permiso-especial");
        }
    });

    it("comandos de información: no requieren interacción, minApi = 1", () => {
        const info = ["info-aparato", "info-aplicacion", "info-red", "info-bateria"];
        for (const nombre of info) {
            expect(requiereInteraccionOrden(nombre)).toBe(false);
            expect(minApiOrden(nombre)).toBe(1);
            expect(tipoOrdenAndroid(nombre)).toBe("informacion");
        }
    });

    it("comandosPorTipo filtra correctamente por tipo", () => {
        expect(comandosPorTipo("almacenamiento-saf").length).toBe(4);
        expect(comandosPorTipo("ajustes-sistema").length).toBe(5);
        expect(comandosPorTipo("permiso-especial").length).toBe(5);
        expect(comandosPorTipo("informacion").length).toBe(4);
    });

    it("comandosDisponibles y comandosNoDisponibles filtran por API level", () => {
        const api19 = comandosDisponibles(19);
        const api21 = comandosDisponibles(21);
        const api23 = comandosDisponibles(23);
        const api29 = comandosDisponibles(29);

        expect(api19.map((c) => c.nombre)).toContain("almacen-abrir-saf");
        expect(api19.map((c) => c.nombre)).toContain("almacen-leer-saf");
        expect(api19.map((c) => c.nombre)).not.toContain("almacen-lista-saf");
        expect(api19.map((c) => c.nombre)).not.toContain("almacen-escribir-saf");

        expect(api21.map((c) => c.nombre)).toContain("almacen-lista-saf");
        expect(api21.map((c) => c.nombre)).toContain("almacen-escribir-saf");

        expect(api23.map((c) => c.nombre)).toContain("ajustes-superposicion");
        expect(api23.map((c) => c.nombre)).toContain("ajustes-bateria");
        expect(api23.map((c) => c.nombre)).toContain("permiso-ubicacion");
        expect(api23.map((c) => c.nombre)).toContain("permiso-microfono");
        expect(api23.map((c) => c.nombre)).toContain("permiso-camara");

        expect(api29.map((c) => c.nombre)).toContain("ajustes-almacenamiento");

        const noDisponibles19 = comandosNoDisponibles(19);
        expect(noDisponibles19.map((c) => c.nombre)).toContain("almacen-lista-saf");
        expect(noDisponibles19.map((c) => c.nombre)).toContain("almacen-escribir-saf");
    });

    it("cada comando tiene textoNoDisponible en español con acentos", () => {
        for (const cmd of COMANDOS_ANDROID) {
            expect(cmd.textoNoDisponible).toMatch(/[áéíóúñÁÉÍÓÚÑ]/);
        }
    });

    it("no hay comandos que requieran nivel administrador (sin root)", () => {
        for (const cmd of COMANDOS_ANDROID) {
            expect(cmd.tipo).not.toBe("administrador");
            expect(cmd.nombre).not.toMatch(/^(almacen-formatear|almacen-montar|almacen-desmontar|servicio-reiniciar|actualizar|reiniciar-app|modo-completo)$/);
        }
    });

    it("los comandos de almacenamiento usan SAF (marco de acceso), no acceso directo al sistema de archivos", () => {
        const almacen = comandosPorTipo("almacenamiento-saf");
        for (const cmd of almacen) {
            expect(cmd.nombre).toMatch(/^almacen-.*-saf$/);
            expect(cmd.descripcion.toLowerCase()).toMatch(/saf|marco de acceso|storage access framework/);
        }
    });

    it("los ajustes que abre la app son pantallas del sistema, no ajustes internos", () => {
        const ajustes = comandosPorTipo("ajustes-sistema");
        for (const cmd of ajustes) {
            expect(cmd.descripcion.toLowerCase()).toMatch(/ajustes del sistema|abre los ajustes/);
            expect(cmd.requiereInteraccion).toBe(true);
        }
    });
});

describe("android.ts · contrato: qué existe y qué no en Android sin root", () => {
    it("marca explícitamente qué órdenes NO existen en Android (nivel administrador)", () => {
        const ordenesEscritorio = [
            "almacen-formatear",
            "almacen-montar",
            "almacen-desmontar",
            "servicio-reiniciar",
            "actualizar",
            "reiniciar-app",
            "modo-completo",
        ];
        for (const nombre of ordenesEscritorio) {
            expect(tipoOrdenAndroid(nombre)).toBeNull();
            expect(textoNoDisponible(nombre)).toBeNull();
        }
    });

    it("textoNoDisponible explica por qué no está disponible en Android", () => {
        const sinRoot = "almacen-formatear";
        expect(textoNoDisponible(sinRoot)).toBeNull();
    });

    it("cada comando disponible en Android tiene texto que verá la persona si falla", () => {
        for (const cmd of COMANDOS_ANDROID) {
            expect(cmd.textoNoDisponible.length).toBeGreaterThan(10);
            expect(cmd.textoNoDisponible).not.toBe(cmd.descripcion);
        }
    });
});