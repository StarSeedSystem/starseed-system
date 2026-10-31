/** XR1010AN · `UiSpec` → árbol 3D: vocabulario cerrado, texto limpio, imágenes https y límites. */
import { describe, expect, it } from "vitest";
import { MAXIMO_BLOQUES, type BloqueUi, type UiSpec } from "@/lib/nucleo/ui-spec";
import { aEscena3D, escenaSegura, MOTIVO_SIN_VISTA, OMITIDO } from "../uispec-mapa";

const spec = (bloques: BloqueUi[], extra: Partial<UiSpec> = {}): UiSpec => ({ version: 1, superficie: "os:prueba", bloques, ...extra });
const texto = (id: string, contenido: string): BloqueUi => ({ tipo: "texto", id, props: { contenido } });
const imagen = (id: string, url: string): BloqueUi => ({ tipo: "widget", id, props: { fuente: "imagen", titulo: "Foto", parametros: { url } } });

describe("uispec-mapa · vocabulario", () => {
    it("cada tipo de bloque produce su nodo 3D o su aviso honesto", () => {
        const casos: Array<[BloqueUi["tipo"], string]> = [
            ["panel", "tarjeta"], ["rejilla", "columna"], ["texto", "texto"], ["lista", "lista"],
            ["acciones", "fila"], ["widget", "nopintable"], ["embebido", "nopintable"],
        ];
        for (const [tipo, esperado] of casos) {
            expect(aEscena3D(spec([{ tipo, id: `b.${tipo}`, props: {} }])).hijos[0]?.tipo).toBe(esperado);
        }
    });

    it("una rejilla con alineación «fila» se pinta en fila", () => {
        expect(aEscena3D(spec([{ tipo: "rejilla", id: "r1", props: { alineacion: "fila" } }])).hijos[0]?.tipo).toBe("fila");
    });

    it("un tipo fuera del vocabulario es nopintable", () => {
        const colado = { tipo: "script", id: "colado", props: {} } as unknown as BloqueUi;
        const nodo = aEscena3D(spec([colado])).hijos[0];
        expect(nodo?.tipo).toBe("nopintable");
        expect(nodo?.motivo).toBe(MOTIVO_SIN_VISTA);
    });

    it("las acciones se convierten en botones que solo llevan su id", () => {
        const fila = aEscena3D(spec([{ tipo: "acciones", id: "a1", props: { acciones: ["abrir.sala", "crear.agente"] } }])).hijos[0];
        expect(fila?.tipo).toBe("fila");
        expect(fila?.hijos.map((h) => h.tipo)).toEqual(["boton", "boton"]);
        expect(fila?.hijos[0]?.props.id).toBe("abrir.sala");
        expect(fila?.hijos[0]?.bloqueId).toBe("abrir.sala");
        expect(Object.values(fila?.hijos[0]?.props ?? {}).some((v) => typeof v === "function")).toBe(false);
    });
});

describe("uispec-mapa · props y texto", () => {
    it("solo pasan las props declaradas en PROPS_PERMITIDAS", () => {
        const raiz = aEscena3D(spec([{ tipo: "panel", id: "p1", props: { titulo: "Hola", alSoltar: "alert(1)", dangerouslySetInnerHTML: "x" } }]));
        expect(raiz.hijos[0]?.props).toEqual({ titulo: "Hola" });
    });

    it("un texto con <script> o javascript: se sustituye por contenido omitido", () => {
        const raiz = aEscena3D(spec([texto("t1", "<script>robar()</script>"), texto("t2", "javascript:fetch('/x')")]));
        expect(raiz.hijos[0]?.props.contenido).toBe(OMITIDO);
        expect(raiz.hijos[1]?.props.contenido).toBe(OMITIDO);
        expect(JSON.stringify(raiz)).not.toContain("<script>");
    });

    it("los elementos de una lista con código se descartan", () => {
        const lista: BloqueUi = { tipo: "lista", id: "l1", props: { elementos: ["sano", "<script>x</script>", "javascript:robar()"] } };
        expect(aEscena3D(spec([lista])).hijos[0]?.props.elementos).toEqual(["sano"]);
    });
});

describe("uispec-mapa · imágenes", () => {
    it("una imagen por http no se pinta", () => {
        const nodo = aEscena3D(spec([imagen("w1", "http://cdn.org/foto.webp")])).hijos[0];
        expect(nodo?.tipo).toBe("nopintable");
        expect(nodo?.motivo).toContain("https");
    });

    it("una imagen por https sí se pinta con su URL", () => {
        const nodo = aEscena3D(spec([imagen("w2", "https://cdn.org/foto.webp")])).hijos[0];
        expect(nodo?.tipo).toBe("imagen");
        expect(nodo?.props.url).toBe("https://cdn.org/foto.webp");
        expect(nodo?.props.alt).toBe("Foto");
    });
});

describe("uispec-mapa · límites", () => {
    it("más bloques que el máximo se corta con un aviso visible", () => {
        const bloques = Array.from({ length: MAXIMO_BLOQUES + 5 }, (_, i) => texto(`t.${i}`, `línea ${i}`));
        const raiz = aEscena3D(spec(bloques));
        const ultimo = raiz.hijos[raiz.hijos.length - 1];
        expect(raiz.hijos.length).toBeLessThanOrEqual(MAXIMO_BLOQUES + 1);
        expect(ultimo?.tipo).toBe("nopintable");
        expect(ultimo?.motivo).toContain("máximo");
    });

    it("una profundidad mayor que la máxima se corta con aviso", () => {
        let bloque: BloqueUi = texto("hondo", "fin");
        for (let nivel = 8; nivel >= 1; nivel -= 1) bloque = { tipo: "panel", id: `n.${nivel}`, props: {}, hijos: [bloque] };
        expect(JSON.stringify(aEscena3D(spec([bloque])))).toContain("Profundidad");
    });
});

describe("uispec-mapa · escenaSegura", () => {
    it("valida antes de pintar: inválida no da árbol y válida conserva el título", () => {
        const invalida = escenaSegura({ version: 0, superficie: "", bloques: "no" });
        expect(invalida.raiz).toBeNull();
        expect(invalida.problemas.length).toBeGreaterThan(0);
        const valida = escenaSegura(spec([texto("t1", "Hola")], { titulo: "Mi página" }));
        expect(valida.problemas).toEqual([]);
        expect(valida.raiz?.tipo).toBe("columna");
        expect(valida.raiz?.props.titulo).toBe("Mi página");
        expect(valida.raiz?.hijos[0]?.tipo).toBe("texto");
    });
});
