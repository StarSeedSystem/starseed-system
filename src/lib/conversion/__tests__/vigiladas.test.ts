import { describe, expect, it } from "vitest";

import {
    CLAVE_VIGILADAS,
    TOPE_HECHAS,
    agregarRegla,
    alternarRegla,
    estadoInicial,
    escribirEstado,
    leerEstado,
    marcarHechas,
    pendientes,
    quitarRegla,
    reglaDe,
} from "../vigiladas";

describe("estado guardado", () => {
    it("usa la clave `starseed.conversion.vigiladas.v1`", () => {
        expect(CLAVE_VIGILADAS).toBe("starseed.conversion.vigiladas.v1");
    });

    it("un JSON roto o basura devuelve el estado vacío, sin lanzar", () => {
        expect(leerEstado("")).toEqual(estadoInicial());
        expect(leerEstado("{no es json")).toEqual(estadoInicial());
        expect(leerEstado("42")).toEqual(estadoInicial());
        expect(leerEstado(null as unknown as string)).toEqual(estadoInicial());
    });

    it("descarta reglas sin carpeta o con destino inválido y deja una regla por carpeta", () => {
        const e = leerEstado(
            JSON.stringify({
                version: 1,
                reglas: [
                    { id: "r1", carpeta: "Fotos del móvil", destino: "JPG", activa: true, creada: 100 },
                    { id: "r2", carpeta: "Fotos del móvil/", destino: "pdf", activa: false, creada: 200 },
                    { id: "r3", carpeta: "Doc", destino: "no!!", activa: true },
                    { id: "r4", carpeta: "", destino: "pdf" },
                ],
                hechas: [],
            })
        );
        expect(e.reglas).toHaveLength(1);
        expect(e.reglas[0]).toMatchObject({ id: "r1", carpeta: "Fotos del móvil", destino: "jpg", activa: true });
    });

    it("ida y vuelta: escribir y volver a leer da lo mismo", () => {
        let e = agregarRegla(estadoInicial(), "Fotos del móvil", "jpg", 1);
        e = marcarHechas(e, [{ regla: e.reglas[0].id, salida: "Viaje a Oaxaca.jpg" }], 2);
        const deVuelta = leerEstado(escribirEstado(e));
        expect(deVuelta).toEqual(e);
    });
});

describe("agregarRegla / alternarRegla / quitarRegla", () => {
    it("crea la regla activa de una carpeta y no deja dos para la misma", () => {
        let e = agregarRegla(estadoInicial(), "Fotos del móvil", "jpg", 7);
        expect(e.reglas).toHaveLength(1);
        expect(e.reglas[0]).toMatchObject({ carpeta: "Fotos del móvil", destino: "jpg", activa: true, creada: 7 });
        // «Fotos» ya convertido a pdf: se sustituye la regla y sus marcas se van con ella
        e = marcarHechas(e, [{ regla: e.reglas[0].id, salida: "X.jpg" }], 8);
        expect(e.hechas).toHaveLength(1);
        e = agregarRegla(e, "Fotos del móvil/", "pdf", 9);
        expect(e.reglas).toHaveLength(1);
        expect(e.reglas[0]).toMatchObject({ destino: "pdf" });
        expect(e.hechas).toHaveLength(0);
    });

    it("ids de carpeta distintas con el mismo nombre no chocan", () => {
        const e = agregarRegla(
            agregarRegla(estadoInicial(), "Fotos", "jpg", 1),
            "Álbum/Fotos",
            "png",
            2
        );
        expect(e.reglas.map((r) => r.id)).toEqual(["fotos", "fotos-2"]);
    });

    it("carpeta vacía o formato inválido lanzan, como el resto del OS", () => {
        expect(() => agregarRegla(estadoInicial(), "  ", "jpg")).toThrow(/carpeta/);
        expect(() => agregarRegla(estadoInicial(), "Fotos", "JPG!")).toThrow(/destino/);
    });

    it("desactivar detiene (sin borrar nada) y quitar borra también sus marcas", () => {
        let e = agregarRegla(estadoInicial(), "Fotos", "jpg", 1);
        const id = e.reglas[0].id;
        e = marcarHechas(e, [{ regla: id, salida: "a.jpg" }], 2);
        e = alternarRegla(e, id, false);
        expect(reglaDe(e, "Fotos")).toBeNull();
        expect(e.reglas[0].activa).toBe(false);
        e = quitarRegla(e, id);
        expect(e).toEqual(estadoInicial());
    });
});

describe("reglaDe", () => {
    it("encuentra la regla exacta y también la de la carpeta madre", () => {
        let e = agregarRegla(estadoInicial(), "Fotos del móvil", "jpg", 1);
        expect(reglaDe(e, "Fotos del móvil")!.destino).toBe("jpg");
        expect(reglaDe(e, "Fotos del móvil/Octubre")!.id).toBe(e.reglas[0].id);
        expect(reglaDe(e, "Fotos del móvil aliadas")).toBeNull();
        expect(reglaDe(e, "Personal")).toBeNull();
        expect(reglaDe(e, "")).toBeNull();
    });
});

describe("pendientes / marcarHechas (sin repetir, sin bucles)", () => {
    it("convierte lo nuevo: nombre, destino y salida", () => {
        const e = agregarRegla(estadoInicial(), "Fotos del móvil", "jpg", 1);
        expect(pendientes(e, "Fotos del móvil", ["Viaje a Oaxaca.HEIC", "Foto 2.heic"])).toEqual([
            { regla: "fotos-del-movil", origen: "Viaje a Oaxaca.HEIC", destino: "jpg", salida: "Viaje a Oaxaca.jpg" },
            { regla: "fotos-del-movil", origen: "Foto 2.heic", destino: "jpg", salida: "Foto 2.jpg" },
        ]);
    });

    it("cada nombre una sola vez, aunque la lista venga duplicada", () => {
        const e = agregarRegla(estadoInicial(), "Fotos", "jpg", 1);
        expect(pendientes(e, "Fotos", ["a.heic", "a.heic"])).toHaveLength(1);
    });

    it("nunca toca lo que ya está en el formato destino (el resultado de la conversión)", () => {
        const e = agregarRegla(estadoInicial(), "Fotos", "jpg", 1);
        expect(pendientes(e, "Fotos", ["X.JPG", "y.jpeg"])).toEqual([
            { regla: "fotos", origen: "y.jpeg", destino: "jpg", salida: "y.jpg" },
        ]);
        expect(pendientes(e, "Fotos", ["X.jpg"])).toEqual([]); // ya convertido antes: sin bucle
    });

    it("si la salida ya existe en la carpeta, no la repite", () => {
        const e = agregarRegla(estadoInicial(), "Fotos", "jpg", 1);
        expect(pendientes(e, "Fotos", ["X.heic", "X.jpg", "Y.HEIC"])).toEqual([
            { regla: "fotos", origen: "Y.HEIC", destino: "jpg", salida: "Y.jpg" },
        ]);
    });

    it("lo ya registrado como hecho no vuelve, aunque el resultado tarde en aparecer", () => {
        let e = agregarRegla(estadoInicial(), "Fotos", "jpg", 1);
        e = marcarHechas(e, [{ regla: "fotos", salida: "X.jpg" }], 2);
        expect(pendientes(e, "Fotos", ["X.heic"])).toEqual([]);
        // y si la salida ya está anotada, marcarla de nuevo no crece el registro
        expect(marcarHechas(e, [{ regla: "fotos", salida: "x.jpg" }], 3).hechas).toHaveLength(1);
    });

    it("vigila subcarpetas con la regla de la madre, y carpetas ajenas siguen suyas", () => {
        let e = agregarRegla(estadoInicial(), "Fotos del móvil", "jpg", 1);
        e = agregarRegla(e, "Documentos", "pdf", 2);
        expect(pendientes(e, "Fotos del móvil/Octubre/", ["a.heic"])[0].salida).toBe("a.jpg");
        expect(pendientes(e, "Documentos/Día", ["a.md"])[0].salida).toBe("a.pdf");
        expect(pendientes(e, "Personal", ["a.heic"])).toEqual([]);
    });

    it("las marcas de la regla anterior no bloquean la nueva", () => {
        let e = agregarRegla(estadoInicial(), "Fotos", "jpg", 1);
        e = marcarHechas(e, [{ regla: "fotos", salida: "X.jpg" }], 2);
        e = agregarRegla(e, "Fotos", "pdf", 3);
        expect(pendientes(e, "Fotos", ["X.heic"])[0].salida).toBe("X.pdf");
    });

    it("el registro tiene tope y las marcas inválidas no entran", () => {
        const sin = marcarHechas(estadoInicial(), [{ regla: "fotos", salida: "  " }, { regla: "", salida: "a.jpg" }]);
        expect(sin).toEqual(estadoInicial());
        let e = estadoInicial();
        for (let i = 0; i < TOPE_HECHAS + 10; i++) e = marcarHechas(e, [{ regla: "fotos", salida: `f${i}.jpg` }], i + 1);
        expect(e.hechas).toHaveLength(TOPE_HECHAS);
        expect(e.hechas[0].salida).toBe("f10.jpg");
        expect(e.hechas[TOPE_HECHAS - 1].salida).toBe(`f${TOPE_HECHAS + 9}.jpg`);
    });
});
