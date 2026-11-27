import { describe, expect, it } from "vitest";

import {
    detalleDeMedidor,
    filasDeAlmacenamiento,
    leerNodosAlmacenamiento,
    textoDiscoAlmacenamiento,
} from "@/lib/mando/medidores";

const CONECTADO = "Maggabox · almacén USB (btrfs) · libre 418 GB · desde 25-11 10:32";
const DESCONECTADO = "Maggabox · almacén USB (btrfs) · desconectado desde 26-11 18:05";

function nodoMaggabox(almacen: string[]) {
    return { nodoId: "maggabox", medio: "linux", discoLibreGb: 405, almacen };
}

describe("ALC1125Js · almacén USB de la Maggabox como medio propio", () => {
    it("separa el almacén USB del disco interno y conserva libre, desde y su ruta", () => {
        const nodos = leerNodosAlmacenamiento({
            nodos: [nodoMaggabox(["~/StarSeed-almacen/respaldos", CONECTADO])],
        });
        expect(nodos.map((n) => n.nombre)).toEqual(["Maggabox", "Maggabox · almacén USB (btrfs)"]);
        const srv = nodos[1];
        expect(srv.id).toBe("maggabox-almacen-usb");
        expect(srv.medio).toBe("btrfs");
        expect(srv.discoLibreGb).toBe(418);
        expect(srv.conectado).toBe(true);
        expect(srv.desde).toBe("25-11 10:32");
        expect(srv.almacen).toEqual(["/srv/starseed-almacen"]);
        expect(nodos[0].almacen).toEqual(["~/StarSeed-almacen/respaldos"]);
    });

    it("desconectado dice desde cuándo y nunca inventa 0 GB", () => {
        const nodos = leerNodosAlmacenamiento({ nodos: [nodoMaggabox([DESCONECTADO])] });
        const srv = nodos[1];
        expect(srv.conectado).toBe(false);
        expect(Number.isNaN(srv.discoLibreGb)).toBe(true);
        expect(srv.desde).toBe("26-11 18:05");
        expect(textoDiscoAlmacenamiento(srv)).toBe("desconectado desde 26-11 18:05");

        const [fila] = filasDeAlmacenamiento([srv]);
        expect(fila.estado).toBe("desconectado");
        expect(fila.porque).toContain("desconectado desde 26-11 18:05");
        expect(fila.detalle?.discoLibres).toBeUndefined();
    });

    it("un libre ilegible tampoco se convierte en 0", () => {
        const raro = "Maggabox · almacén USB (btrfs) · libre sin dato GB · desde 25-11";
        const nodos = leerNodosAlmacenamiento({ nodos: [nodoMaggabox([raro])] });
        expect(Number.isNaN(nodos[1].discoLibreGb)).toBe(true);
        expect(filasDeAlmacenamiento([nodos[1]])[0].detalle?.discoLibres).toBeUndefined();
    });

    it("el medidor muestra el USB tras la Maggabox y con su propio estado", () => {
        const nodos = leerNodosAlmacenamiento({
            nodos: [
                { nodoId: "a1-oracle", medio: "nube", discoLibreGb: 80 },
                nodoMaggabox([DESCONECTADO]),
                { nodoId: "mac-local", medio: "mac", discoLibreGb: 42 },
            ],
        });
        expect(nodos.map((n) => n.nombre)).toEqual([
            "Mac",
            "Maggabox",
            "Maggabox · almacén USB (btrfs)",
            "A1",
        ]);

        const d = detalleDeMedidor("almacenamiento", { almacenamiento: { nodos } });
        expect(d.filas.map((f) => f.id)).toEqual(["mac-local", "maggabox", "maggabox-almacen-usb", "a1-oracle"]);
        expect(d.filas[2].estado).toBe("desconectado");
        expect(d.filas[2].desde).toBe("26-11 18:05");
        expect(d.resumen).toContain("Maggabox · almacén USB (btrfs) (desconectado desde 26-11 18:05)");
        expect(d.resumen).not.toContain("0 GB");
    });

    it("sin la línea del almacén USB no añade un medio que nadie midió", () => {
        const nodos = leerNodosAlmacenamiento({ nodos: [nodoMaggabox(["~/StarSeed-almacen/espejo"])] });
        expect(nodos).toHaveLength(1);
        expect(nodos[0].almacen).toEqual(["~/StarSeed-almacen/espejo"]);
    });
});
