/**
 * MED1126A (parte 2): la Maggabox declara sus `discos` (interno principal y externo
 * secundario) y el medidor enseña una fila por disco. Un disco solo sirve de destino
 * si está bien Y le queda espacio por encima del umbral crítico.
 */
import { describe, expect, it } from "vitest";

import {
    filaDeNodo,
    filasDeAlmacenamiento,
    filasDeDiscos,
    leerNodosAlmacenamiento,
    type NodoAlmacenamiento,
} from "@/lib/mando/medidores";

const maggabox = (discos: unknown[]) =>
    leerNodosAlmacenamiento([{ nodoId: "maggabox", medio: "linux", discoLibreGb: 397, discoTotalGb: 453, discos }])[0];

const interno = { rol: "principal", punto: "/", libreGb: 397, totalGb: 453, estado: "ok" };
const externo = { rol: "secundario", punto: "/srv/starseed-almacen", libreGb: 120, totalGb: 916, estado: "ok", montado: true };

describe("filasDeDiscos · Maggabox interno y externo", () => {
    it("una fila por disco con su título, libres y total", () => {
        const filas = filasDeDiscos(maggabox([interno, externo]));
        expect(filas.map((f) => f.titulo)).toEqual([
            "Maggabox · interno (principal)",
            "Maggabox · disco externo (secundario)",
        ]);
        expect(filas[1].detalle).toMatchObject({ discoLibres: 120, discoTotalGb: 916 });
        expect(filas.every((f) => f.usableComoDestino)).toBe(true);
    });

    it("un disco «ok» con menos de 5 GB libres NO es destino y sale crítico", () => {
        const [, fila] = filasDeDiscos(maggabox([interno, { ...externo, libreGb: 3 }]));
        expect(fila.estado).toBe("crítico");
        expect(fila.usableComoDestino).toBe(false);
    });

    it("un disco «ok» sin cifra de libres NO es destino", () => {
        const [, fila] = filasDeDiscos(maggabox([interno, { ...externo, libreGb: undefined }]));
        expect(fila.usableComoDestino).toBe(false);
        expect(fila.estado).toBe("sin dato");
    });

    it("externo sin montar sale en «aviso» (ámbar) y no es destino", () => {
        const [, fila] = filasDeDiscos(maggabox([interno, { ...externo, estado: "aviso", montado: false }]));
        expect(fila.estado).toBe("aviso");
        expect(fila.usableComoDestino).toBe(false);
        expect(fila.porque).toContain("sin montar");
    });

    it("externo con errores sale en «error» (rojo) y no es destino", () => {
        const [, fila] = filasDeDiscos(maggabox([interno, { ...externo, estado: "error", errores: 4 }]));
        expect(fila.estado).toBe("error");
        expect(fila.usableComoDestino).toBe(false);
    });

    it("filasDeAlmacenamiento despliega los discos en lugar de la fila del nodo", () => {
        const filas = filasDeAlmacenamiento([maggabox([interno, externo])]);
        expect(filas).toHaveLength(2);
        expect(filas[0].id).toBe("maggabox:principal");
    });
});

describe("filaDeNodo · sin lista de discos", () => {
    it("la Maggabox sin discos sale como una sola fila «Maggabox»", () => {
        const filas = filasDeAlmacenamiento([maggabox([])]);
        expect(filas).toHaveLength(1);
        expect(filas[0]).toMatchObject({ titulo: "Maggabox", estado: "libre" });
    });

    it("sin libres ni uso medido NO dice «libre»: dice «sin dato»", () => {
        const nodo: NodoAlmacenamiento = { id: "maggabox", nombre: "Maggabox", medio: "linux", discoLibreGb: Number.NaN, almacen: [] };
        expect(filaDeNodo(nodo)).toMatchObject({ titulo: "Maggabox", estado: "sin dato" });
    });
});
