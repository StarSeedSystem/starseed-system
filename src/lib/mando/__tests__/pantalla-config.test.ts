import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    PANTALLA_POR_DEFECTO,
    estadoServicioMac,
    guardarPantalla,
    leerDespierto,
    leerPantalla,
    senalesDespierto,
    validarPantalla,
} from "../pantalla-config";

let carpeta: string;
let ruta: string;

beforeEach(async () => {
    carpeta = await mkdtemp(path.join(os.tmpdir(), "pantalla-"));
    ruta = path.join(carpeta, "pantalla.json");
});

afterEach(async () => {
    await rm(carpeta, { recursive: true, force: true });
});

describe("pantalla-config", () => {
    it("sin archivo vale por defecto: activa", async () => {
        expect(await leerPantalla(ruta)).toEqual(PANTALLA_POR_DEFECTO);
    });

    it("guardar y leer devuelve lo guardado", async () => {
        const guardado = await guardarPantalla(false, "prueba", ruta);
        expect(guardado.activa).toBe(false);
        expect(guardado.quien).toBe("prueba");
        expect(typeof guardado.desde).toBe("number");

        const leido = await leerPantalla(ruta);
        expect(leido).toEqual(guardado);
    });

    it("un archivo roto vale por defecto", async () => {
        await writeFile(ruta, "{no es json", "utf-8");
        expect(await leerPantalla(ruta)).toEqual(PANTALLA_POR_DEFECTO);
    });

    it("validarPantalla sanea valores fuera de forma", () => {
        expect(validarPantalla(null)).toEqual(PANTALLA_POR_DEFECTO);
        expect(validarPantalla("activa")).toEqual(PANTALLA_POR_DEFECTO);
        expect(validarPantalla({ activa: "sí", desde: "ayer", quien: 7 }))
            .toEqual(PANTALLA_POR_DEFECTO);
        expect(validarPantalla({ activa: false, desde: 123, quien: "mando" }))
            .toEqual({ activa: false, desde: 123, quien: "mando" });
    });

    it("estadoServicioMac nunca lanza y devuelve la forma del contrato", async () => {
        const estado = await estadoServicioMac();
        expect(typeof estado.servicio_vivo).toBe("boolean");
        expect(estado.pid === null || typeof estado.pid === "number").toBe(true);
    });

    /* ─── KAL1101C: el modo keepalive y el estado del latido local ─── */

    it("guarda el modo y lo vuelve a leer (modo sistema)", async () => {
        const guardado = await guardarPantalla(true, "prueba", ruta, "sistema");
        expect(guardado.modo).toBe("sistema");
        expect(await leerPantalla(ruta)).toEqual(guardado);
    });

    it("apagado no deja modo que pueda dejar el servicio despierto", async () => {
        const guardado = await guardarPantalla(false, "prueba", ruta, "sistema");
        expect("modo" in guardado).toBe(false);
    });

    it("validarPantalla descarta modos que no sean pantalla o sistema", () => {
        expect(validarPantalla({ activa: true, modo: "siesta" })).toEqual(PANTALLA_POR_DEFECTO);
        expect(validarPantalla({ activa: true, modo: "sistema" })).toEqual({
            activa: true,
            modo: "sistema",
            desde: null,
            quien: "defecto",
        });
        expect(validarPantalla({ activa: false, modo: "sistema" })).toEqual({
            activa: false,
            desde: null,
            quien: "defecto",
        });
    });

    it("leerDespierto devuelve el latido crudo, y null sin dato", async () => {
        const rutaDespierto = path.join(carpeta, "despierto.json");
        expect(await leerDespierto(rutaDespierto)).toBeNull();
        await writeFile(
            rutaDespierto,
            JSON.stringify({ modo: "sistema", herramienta: "keepalive", pid: 123 }),
            "utf-8",
        );
        expect(await leerDespierto(rutaDespierto)).toEqual({
            modo: "sistema",
            herramienta: "keepalive",
            pid: 123,
        });
    });

    it("senalesDespierto mapea el latido al contrato keepalive sin inventar nada", () => {
        expect(senalesDespierto(null)).toBeNull();
        expect(senalesDespierto("latido")).toBeNull();
        expect(senalesDespierto({})).toBeNull();
        expect(senalesDespierto({ modo: "sistema", herramienta: "keepalive", pid: 123 })).toEqual({
            keepalive: { activo: true, modo: "sistema" },
        });
        expect(senalesDespierto({ modo: "sistema", herramienta: "caffeinate" })).toEqual({
            keepalive: { activo: false, modo: "sistema" },
        });
        expect(senalesDespierto({ herramienta: "keepalive" })).toEqual({
            keepalive: { activo: true },
        });
    });
});
