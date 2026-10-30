import { describe, it, expect } from "vitest";

import {
    leerOfertas,
    leerPrestamos,
    leerVolumenes,
    prestamosVivos,
    resumirRecursosRed,
    volumenesBajos,
} from "../recursos-red";

describe("leerOfertas", () => {
    it("lee fichas de nodos, marca lo medido y ordena por medio y nodo", () => {
        const ofertas = leerOfertas({
            nodos: [
                { nodoId: "mac-1", medio: "mac", ramLibreMb: 512, cpu: 20, ambitos: ["cuenta"] },
                { nodoId: "nube-1", medio: "nube", apps: ["a", "b"], capas: ["x"], publico: true },
                { nodoId: "rota", medio: "nube" },
                { medio: "mac" },
            ],
        });
        expect(ofertas.map((o) => o.nodoId)).toEqual(["mac-1", "nube-1", "rota"]);
        expect(ofertas[0]).toMatchObject({ medido: true, publica: false, apps: null, capas: null });
        expect(ofertas[1]).toMatchObject({ medido: false, publica: true, apps: 2, capas: 1 });
        expect(ofertas[2]).toMatchObject({ medio: "nube", medido: false });
    });

    it("acepta { ofertas } y descarta lo ilegible sin romperse", () => {
        expect(leerOfertas({ ofertas: [{ id: "n1", medio: "linux", nucleos: 4 }] })).toEqual([
            { nodoId: "n1", medio: "linux", medido: true, publica: false, apps: null, capas: null },
        ]);
        expect(leerOfertas(null)).toEqual([]);
        expect(leerOfertas({ nodos: "no-es-lista" })).toEqual([]);
    });
});

describe("leerPrestamos y prestamosVivos", () => {
    const ahora = 1_000_000;

    it("lee sesiones de préstamo y solo deja vivas las no revocadas ni caducadas", () => {
        const sesiones = leerPrestamos({
            sesiones: [
                { id: "s1", anfitrion: "a", invitado: "b", alcance: { tipo: "capacidad", id: "imagen" }, inicio: ahora - 5000, vence: ahora + 5000 },
                { id: "s2", alcance: { tipo: "app", id: "editor" }, inicio: ahora - 9000, vence: ahora - 1 },
                { id: "s3", alcance: { tipo: "volumen", id: "v1" }, vence: ahora + 5000, revocada: true },
            ],
        });
        expect(sesiones[0]).toMatchObject({ recurso: "imagen", tipo: "capacidad", anfitrion: "a", invitado: "b" });
        const vivos = prestamosVivos(sesiones, ahora);
        expect(vivos.map((p) => p.id)).toEqual(["s1"]);
        expect(vivos[0]).toMatchObject({ desdeHaceMs: 5000, restanteMs: 5000 });
    });

    it("lee préstamos sirviendo (estado activo) y su consumo medido o «sin medir»", () => {
        const [p] = leerPrestamos([{ id: "p1", tipo: "voz", invitado: "x", estado: "activo", inicioMs: ahora - 1000, bytes: 42 }]);
        expect(p).toMatchObject({ recurso: "voz", tipo: "voz", activo: true, consumoBytes: 42, vence: null });
        expect(prestamosVivos([p], ahora)[0].restanteMs).toBeNull();
    });

    it("un préstamo sin reloj ni estado no se inventa como vivo", () => {
        const [p] = leerPrestamos([{ id: "p2" }]);
        expect(prestamosVivos([p], ahora)).toEqual([]);
    });
});

describe("leerVolumenes y volumenesBajos", () => {
    it("usa replicasDeseadas del manifiesto y cuenta tenedores únicos", () => {
        const volumenes = leerVolumenes({
            volumenes: [
                { id: "privado", privado: true, importancia: 3, tenedores: [{ nodo: "n1" }, { nodo: "n1" }, { nodo: "n2" }] },
                { id: "publico", privado: false, importancia: 1, tenedores: ["n1"], bandas: [1, 2, 3] },
                { id: "publico-lleno", privado: false, importancia: 9, replicas: 5 },
            ],
        });
        expect(volumenes.find((v) => v.id === "privado")).toMatchObject({ replicasActuales: 2, replicasDeseadas: 2, faltan: 0 });
        expect(volumenes.find((v) => v.id === "publico")).toMatchObject({ bandas: 3, replicasActuales: 1, replicasDeseadas: 3, faltan: 2 });
        expect(volumenes.find((v) => v.id === "publico-lleno")).toMatchObject({ replicasActuales: 5, replicasDeseadas: 5 });
        expect(volumenesBajos(volumenes).map((v) => v.id)).toEqual(["publico"]);
        expect(leerVolumenes("roto")).toEqual([]);
    });
});

describe("resumirRecursosRed", () => {
    it("junta las tres listas y cuenta medidos y sin medir por medio", () => {
        const resumen = resumirRecursosRed({
            ofertas: [
                { id: "n1", medio: "mac", ramLibreMb: 10 },
                { id: "n2", medio: "mac" },
                { id: "n3", medio: "nube", cpu: 5 },
            ],
            prestamos: [{ id: "p1", estado: "activo", vence: 2000 }],
            volumenes: [{ id: "v1", privado: false, importancia: 2, replicas: 1 }],
            ahora: 1000,
        });
        expect(resumen.ofertasPorMedio).toEqual([
            { medio: "mac", total: 2, medidos: 1, sinMedir: 1 },
            { medio: "nube", total: 1, medidos: 1, sinMedir: 0 },
        ]);
        expect(resumen.prestamosVivos.map((p) => p.id)).toEqual(["p1"]);
        expect(resumen.volumenesBajos.map((v) => v.id)).toEqual(["v1"]);
    });
});
