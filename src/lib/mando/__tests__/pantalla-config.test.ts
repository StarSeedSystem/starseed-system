import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    PANTALLA_POR_DEFECTO,
    estadoServicioMac,
    guardarPantalla,
    leerPantalla,
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
});
