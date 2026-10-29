/**
 * Pruebas de XR1010AN · UiSpec → 3D. Sólo módulos puros: nada de WebGL, red ni
 * render en estos tests; el cascarón de uikit se mira con tsc, como manda el contrato §3 b.
 */
import { describe, expect, it } from "vitest";
import { MAXIMO_BLOQUES, PROFUNDIDAD_MAXIMA, type BloqueUi, type UiSpec } from "../../../lib/nucleo/ui-spec";
import type { NodoEscena3D } from "../uispec-mapa";
import { MOTIVO_NO_VISTA, aEscena3D, prepararVista } from "../uispec-mapa";

function spec(bloques: BloqueUi[], extra: Partial<UiSpec> = {}): UiSpec {
    return { version: 1, superficie: "os:prueba-ui-spec", titulo: "Prueba", bloques, ...extra };
}

function bloque(tipo: BloqueUi["tipo"], id: string, props: Record<string, unknown> = {}, hijos?: BloqueUi[]): BloqueUi {
    return hijos ? { tipo, id, props, hijos } : { tipo, id, props };
}

function hijoDe(espec: UiSpec, indice: number): NodoEscena3D {
    const hijo = espec.bloques[indice];
    if (!hijo) throw new Error(`No hay bloque ${indice} en el spec de prueba`);
    return aEscena3D(espec).raiz.hijos[indice];
}

describe("aEscena3D · cada tipo del vocabulario produce su nodo", () => {
    it("panel → tarjeta con su título y sus hijos", () => {
        const s = spec([bloque("panel", "p1", { titulo: "Mundo" }, [bloque("texto", "t1", { contenido: "Hola" })])]);
        const resultado = aEscena3D(s);
        expect(resultado.avisos).toEqual([]);
        expect(resultado.raiz.tipo).toBe("tarjeta");
        expect(resultado.raiz.props.titulo).toBe("Prueba");
        expect(hijoDe(s, 0)).toMatchObject({
            tipo: "tarjeta",
            props: { titulo: "Mundo" },
            hijos: [{ tipo: "texto", props: { contenido: "Hola" }, hijos: [] }],
        });
    });

    it("rejilla → columna que hereda sus hijos y las columnas", () => {
        const s = spec([bloque("rejilla", "r", { columnas: 3 }, [bloque("texto", "t", { contenido: "x" })])]);
        expect(hijoDe(s, 0)).toMatchObject({ tipo: "columna", props: { columnas: 3 } });
        expect(hijoDe(s, 0).hijos[0].tipo).toBe("texto");
    });

    it("lista → lista con sus elementos ya limpios", () => {
        const s = spec([bloque("lista", "l", { titulo: "Tareas", elementos: ["a", "b"], vacio: "Vacía." })]);
        expect(hijoDe(s, 0)).toMatchObject({
            tipo: "lista",
            props: { titulo: "Tareas", elementos: ["a", "b"], vacio: "Vacía." },
        });
    });

    it("texto → texto con su contenido y su nivel", () => {
        const s = spec([bloque("texto", "t", { contenido: "Como en casa", nivel: 2 })]);
        expect(hijoDe(s, 0)).toMatchObject({ tipo: "texto", props: { contenido: "Como en casa", nivel: 2 } });
    });

    it("acciones → fila de botones que sólo llevan el id, sin código", () => {
        const s = spec([bloque("acciones", "a", { acciones: ["hola", "salir"] })]);
        const fila = hijoDe(s, 0);
        expect(fila.tipo).toBe("fila");
        expect(fila.hijos).toEqual([
            { tipo: "boton", props: { accion: "hola", etiqueta: "hola" }, hijos: [] },
            { tipo: "boton", props: { accion: "salir", etiqueta: "salir" }, hijos: [] },
        ]);
    });

    it("widget y embebido → nopintable con el motivo honesto", () => {
        const s = spec([bloque("widget", "w", {}), bloque("embebido", "e", { ruta: "/salas/3d" })]);
        const nodos = aEscena3D(s).raiz.hijos;
        expect(nodos).toHaveLength(2);
        for (const n of nodos) expect(n).toMatchObject({ tipo: "nopintable", props: { motivo: MOTIVO_NO_VISTA } });
    });
});

describe("aEscena3D · defensas", () => {
    it("un tipo desconocido es nopintable", () => {
        const s = spec([{ tipo: "lluvia", id: "x1", props: {} } as unknown as BloqueUi]);
        expect(aEscena3D(s).raiz.hijos[0]).toMatchObject({ tipo: "nopintable", props: { motivo: MOTIVO_NO_VISTA } });
    });

    it("una prop no declarada no llega al árbol y prepararVista lo avisa", () => {
        const s = spec([bloque("texto", "t", { contenido: "Hola", onclick: "eval(1)" })]);
        expect(hijoDe(s, 0).props).not.toHaveProperty("onclick");
        const vista = prepararVista(s);
        expect(vista.problemas.some((p) => p.includes("onclick"))).toBe(true);
    });

    it("el texto con <script> o con aire de código se limpia", () => {
        const s = spec([
            bloque("texto", "a", { contenido: "<script>alert(1)</script>" }),
            bloque("texto", "b", { contenido: "eval(algo)" }),
            bloque("texto", "c", { contenido: "Texto <b>rico</b> normal" }),
        ]);
        const nodos = aEscena3D(s).raiz.hijos;
        expect(nodos[0].props.contenido).toBe("[texto omitido]");
        expect(nodos[1].props.contenido).toBe("[texto omitido]");
        expect(nodos[2].props.contenido).toBe("Texto rico normal");
    });

    it("una imagen http no se pinta; una https sí", () => {
        const s = spec([bloque("panel", "malo", { icono: "http://mala.org/i.png" }), bloque("panel", "bueno", { icono: "https://bueno.org/i.png" })]);
        const nodos = aEscena3D(s).raiz.hijos;
        expect(nodos[0].hijos).toEqual([]);
        expect(nodos[1].hijos[0]).toMatchObject({ tipo: "imagen", props: { src: "https://bueno.org/i.png" } });
    });

    it("más bloques que el máximo: se corta con un único aviso", () => {
        const s = spec(Array.from({ length: MAXIMO_BLOQUES + 1 }, (_, i) => bloque("texto", `b${i}`, { contenido: `t${i}` })));
        const resultado = aEscena3D(s);
        expect(resultado.avisos).toHaveLength(1);
        expect(resultado.raiz.hijos[MAXIMO_BLOQUES]).toMatchObject({ tipo: "nopintable" });
        expect(resultado.raiz.hijos[MAXIMO_BLOQUES - 1].tipo).toBe("texto");
    });

    it("más profundidad que la máxima: nopintable con aviso, el resto se pinta", () => {
        let profundo: BloqueUi = bloque("panel", "base");
        for (let i = 0; i <= PROFUNDIDAD_MAXIMA; i++) profundo = bloque("panel", `n${i}`, {}, [profundo]);
        const resultado = aEscena3D(spec([profundo]));
        expect(resultado.avisos).toHaveLength(1);
        expect(resultado.raiz.hijos[0]).toMatchObject({ tipo: "nopintable" });
    });
});

describe("prepararVista · la puerta de entrada del componente", () => {
    it("un spec inválido devuelve problemas y no árbol", () => {
        const vista = prepararVista({ version: 0 });
        expect(vista.raiz).toBeNull();
        expect(vista.problemas.length).toBeGreaterThan(0);
        expect(vista.avisos).toEqual([]);
    });

    it("un spec válido devuelve el árbol con el título de la página y sin problemas", () => {
        const vista = prepararVista(spec([bloque("texto", "t", { contenido: "Bien" })]));
        expect(vista.problemas).toEqual([]);
        expect(vista.raiz?.tipo).toBe("tarjeta");
        expect(vista.raiz?.props.titulo).toBe("Prueba");
        expect(vista.raiz?.hijos[0].props.contenido).toBe("Bien");
    });
});
