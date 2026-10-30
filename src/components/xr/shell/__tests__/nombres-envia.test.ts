import { describe, it, expect } from "vitest";
import type { PasoVoz } from "../../../../lib/xr/intenciones-tipos";
import { nombresEnviaA } from "../nombres-envia";

const paso = (intencion: PasoVoz["intencion"]): PasoVoz => ({ intencion, capa: "reflejo" });

describe("nombresEnviaA", () => {
    it("invitar lista los grupos personas", () => {
        const n = nombresEnviaA([paso({ tipo: "invitar", a: [{ tipo: "grupo", id: "b", nombre: "Banda", miembros: 6 }], sobre: "lo-creado" })]);
        expect(n).toEqual(["Banda"]);
    });

    it("subir a la biblioteca NO sale de la cuenta: sin nombres", () => {
        const n = nombresEnviaA([paso({ tipo: "subir", destino: { donde: "biblioteca" }, sobre: "lo-creado" })]);
        expect(n).toEqual([]);
    });

    it("subir a estación lista su nombre", () => {
        const n = nombresEnviaA([paso({ tipo: "subir", destino: { donde: "estacion", ref: { tipo: "estacion", id: "c", nombre: "Cumbre" }, nueva: false }, sobre: "lo-creado" })]);
        expect(n).toEqual(["Cumbre"]);
    });

    it("publicación para todo el mundo lo dice sin nombre; la del grupo su nombre", () => {
        expect(nombresEnviaA([paso({ tipo: "subir", destino: { donde: "publicacion", visibilidad: "publica", ref: null }, sobre: "lo-creado" })])).toEqual(["todo el mundo"]);
        expect(nombresEnviaA([paso({ tipo: "subir", destino: { donde: "publicacion", visibilidad: "grupo", ref: { tipo: "grupo", id: "b", nombre: "Banda" } }, sobre: "lo-creado" })])).toEqual(["Banda"]);
    });

    it("mensaje con varios destinatarios los lista", () => {
        const n = nombresEnviaA([paso({ tipo: "subir", destino: { donde: "mensaje", para: [{ tipo: "persona", id: "1", nombre: "Álex" }, { tipo: "persona", id: "2", nombre: "Ana" }] }, sobre: "lo-creado" })]);
        expect(n).toEqual(["Álex", "Ana"]);
    });

    it("sin nombres repetidos y con el resto de pasos fuera", () => {
        const n = nombresEnviaA([
            paso({ tipo: "crear-mundo", descripcion: "", caracteristicas: [], modo: "vr", libre: false }),
            paso({ tipo: "invitar", a: [{ tipo: "grupo", id: "b", nombre: "Banda" }], sobre: "lo-creado" }),
            paso({ tipo: "invitar", a: [{ tipo: "grupo", id: "b", nombre: "Banda" }], sobre: "lo-creado" }),
        ]);
        expect(n).toEqual(["Banda"]);
    });
});
