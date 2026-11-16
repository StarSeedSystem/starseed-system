/**
 * Índice local de paquetes descargados del traductor (localStorage inyectable, try/catch, no sincroniza).
 * Pruebas con almacén falso: ida y vuelta, corrupto, espacio, quitar.
 */
import { describe, expect, test } from "vitest";
import {
    IndicePaquetes,
    type EntradaPaquete,
    type AlmacenIndice,
    crearAlmacenFalso,
} from "@/lib/traductor/indice-paquetes";

describe("IndicePaquetes", () => {
    const entradaValida: EntradaPaquete = {
        id: "pkg-1",
        par: "es-en",
        bytes: 1024,
        hash: "abc123",
        version: "1.0.0",
        instaladoEn: Date.now(),
    };

    test("listar: vacío al inicio", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        expect(indice.listar()).toEqual([]);
    });

    test("registrar y listar: ida y vuelta", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        indice.registrar(entradaValida);
        const lista = indice.listar();
        expect(lista).toHaveLength(1);
        expect(lista[0]).toEqual(entradaValida);
    });

    test("registrar: ignora valores corruptos (falta id)", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        indice.registrar({ ...entradaValida, id: undefined as never });
        expect(indice.listar()).toHaveLength(0);
    });

    test("registrar: ignora valores corruptos (bytes no numérico)", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        indice.registrar({ ...entradaValida, bytes: "muchos" as never });
        expect(indice.listar()).toHaveLength(0);
    });

    test("registrar: ignora valores corruptos (instaladoEn no numérico)", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        indice.registrar({ ...entradaValida, instaladoEn: "ayer" as never });
        expect(indice.listar()).toHaveLength(0);
    });

    test("estaInstalado: true cuando existe el par", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        indice.registrar(entradaValida);
        expect(indice.estaInstalado("es", "en")).toBe(true);
    });

    test("estaInstalado: false cuando no existe el par", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        expect(indice.estaInstalado("es", "en")).toBe(false);
    });

    test("estaInstalado: false cuando la entrada está corrupta", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        // Simular dato corrupto directamente en el almacén
        almacen.datos!.set("starseed:traductor-paquetes", JSON.stringify([{ par: "es-en" }]));
        expect(indice.estaInstalado("es", "en")).toBe(false);
    });

    test("quitar: elimina la entrada por id", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        indice.registrar(entradaValida);
        expect(indice.listar()).toHaveLength(1);
        indice.quitar("pkg-1");
        expect(indice.listar()).toHaveLength(0);
    });

    test("quitar: no falla si el id no existe", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        indice.quitar("no-existe");
        expect(indice.listar()).toHaveLength(0);
    });

    test("espacioUsado: suma los bytes de las entradas válidas", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        indice.registrar({ ...entradaValida, id: "pkg-1", bytes: 1000 });
        indice.registrar({ ...entradaValida, id: "pkg-2", par: "en-fr", bytes: 2000 });
        expect(indice.espacioUsado()).toBe(3000);
    });

    test("espacioUsado: ignora entradas corruptas", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        indice.registrar({ ...entradaValida, id: "pkg-1", bytes: 1000 });
        // Corromper directamente en el almacén
        const corrupto = JSON.parse(almacen.datos!.get("starseed:traductor-paquetes")!);
        corrupto.push({ id: "pkg-2", par: "en-fr", bytes: "no-numero", hash: "x", version: "1", instaladoEn: Date.now() });
        almacen.datos!.set("starseed:traductor-paquetes", JSON.stringify(corrupto));
        expect(indice.espacioUsado()).toBe(1000);
    });

    test("evento starseed:traductor-paquetes: se dispara al registrar", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        const eventos: string[] = [];
        const cleanup = indice.suscribir((e) => eventos.push(e));
        indice.registrar(entradaValida);
        expect(eventos).toContain("starseed:traductor-paquetes");
        cleanup();
    });

    test("evento starseed:traductor-paquetes: se dispara al quitar", () => {
        const almacen = crearAlmacenFalso();
        const indice = new IndicePaquetes(almacen);
        indice.registrar(entradaValida);
        const eventos: string[] = [];
        const cleanup = indice.suscribir((e) => eventos.push(e));
        indice.quitar("pkg-1");
        expect(eventos).toContain("starseed:traductor-paquetes");
        cleanup();
    });

    test("varias instancias comparten el mismo almacén", () => {
        const almacen = crearAlmacenFalso();
        const indice1 = new IndicePaquetes(almacen);
        const indice2 = new IndicePaquetes(almacen);
        indice1.registrar(entradaValida);
        expect(indice2.listar()).toHaveLength(1);
    });

    test("try/catch: errores de almacenamiento no lanzan", () => {
        const almacen = crearAlmacenFalso();
        almacen.romper = true;
        const indice = new IndicePaquetes(almacen);
        expect(() => indice.registrar(entradaValida)).not.toThrow();
        expect(() => indice.listar()).not.toThrow();
        expect(() => indice.quitar("pkg-1")).not.toThrow();
        expect(() => indice.espacioUsado()).not.toThrow();
        expect(() => indice.estaInstalado("es", "en")).not.toThrow();
    });
});