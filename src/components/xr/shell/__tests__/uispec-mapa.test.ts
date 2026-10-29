/** Pruebas de `uispec-mapa.ts` (XR1010AN): módulo PURO, en node. El núcleo «validarUiSpec»
 *  manda; aquí se comprueba el MAPEO y sus límites honestos. */
import { describe, it, expect } from "vitest";
import { MAXIMO_BLOQUES, PROFUNDIDAD_MAXIMA, type BloqueUi, type UiSpec } from "@/lib/nucleo/ui-spec";
import { MOTIVO_NOPINTABLE, aEscena3D, arbolDe, bloqueANodo, textoSeguro, urlImagenSegura } from "../uispec-mapa";

const bl = (tipo: string, id: string, props: Record<string, unknown> = {}, hijos: BloqueUi[] = []): BloqueUi =>
    ({ tipo, id, props, hijos }) as unknown as BloqueUi;
const espejo = (bloques: BloqueUi[]): UiSpec => ({ version: 1, superficie: "xr:v", bloques }) as unknown as UiSpec;
const hijos = (n: { hijos: readonly unknown[] }) => n.hijos as Array<{ tipo: string; props: Record<string, unknown> }>;
const todo = (n: { hijos: readonly unknown[] }): Array<{ tipo: string; props: Record<string, unknown> }> =>
    hijos(n).flatMap((h) => [h, ...todo(h)]);

describe("cada tipo de bloque del vocabulario produce su nodo", () => {
    it.each([
        ["panel", "tarjeta"], ["rejilla", "fila"], ["lista", "lista"], ["texto", "texto"],
        ["acciones", "fila"], ["widget", "nopintable"], ["embebido", "nopintable"],
    ] as const)("%s → %s", (origen, esperado) => {
        const nodo = arbolDe(espejo([bl(origen, `b-${origen}`, {})]));
        const hijo = hijos(nodo)[0];
        expect(nodo.tipo).toBe("columna");
        expect(hijo.tipo).toBe(esperado);
        if (esperado === "nopintable") expect(hijo.props.motivo).toBe(MOTIVO_NOPINTABLE);
    });

    it("un tipo desconocido es «nopintable» con el motivo", () => {
        const nodo = bloqueANodo(bl("carta-prohibida", "x", {}));
        expect(nodo.tipo).toBe("nopintable");
        expect(nodo.props.motivo).toBe(MOTIVO_NOPINTABLE);
        expect(nodo.hijos).toEqual([]);
    });
});

describe("el vocabulario es cerrado: props y textos", () => {
    it("una prop no permitida se descarta al mapear", () => {
        const nodo = arbolDe(espejo([bl("texto", "t", { contenido: "hola", dictador: "nadie" })]));
        const t = hijos(nodo)[0];
        expect(t.props.contenido).toBe("hola");
        expect(t.props.dictador).toBeUndefined();
    });

    it("un texto con aspecto de código se limpia (y la spec con código no llega al árbol)", () => {
        expect(textoSeguro("<script>alert(1)</script>")).toBe("[contenido omitido]");
        expect(textoSeguro("eval(mal())")).toBe("[contenido omitido]");
        expect(textoSeguro("Ana evaluó el plan")).toBe("Ana evaluó el plan"); // solo huelen a código los patrones del núcleo
        const viaNodo = arbolDe(espejo([bl("texto", "t2", { contenido: "<script>roba()</script>" })]));
        expect(hijos(viaNodo)[0].props.contenido).toBe("[contenido omitido]");
    });

    it("la lista sanea cada elemento", () => {
        const nodo = arbolDe(espejo([bl("lista", "l", { elementos: ["[x] tarea", 5, "<script>r()</script>"], vacio: "Vacío." })]));
        expect(nodo.hijos.length).toBe(1);
        expect(hijos(nodo)[0].props.elementos).toEqual(["[x] tarea", "[contenido omitido]"]);
        expect(hijos(nodo)[0].props.vacio).toBe("Vacío.");
    });
});

describe("imágenes y botones: nada ejecutable", () => {
    it("solo https es una imagen dibujable; http fuera", () => {
        expect(urlImagenSegura("https://servidor/x.png")).toBe(true);
        expect(urlImagenSegura("http://servidor/x.png")).toBe(false);
        expect(urlImagenSegura("javascript:alerta")).toBe(false);
    });

    it("panel con icono https añade «imagen»; con icono http no", () => {
        const con = arbolDe(espejo([bl("panel", "p", { icono: "https://s.x/v.png" })]));
        expect(hijos(con)[0].tipo).toBe("tarjeta");
        expect(hijos(hijos(con)[0]).some((h) => h.tipo === "imagen" && h.props.url === "https://s.x/v.png")).toBe(true);
        const sin = arbolDe(espejo([bl("panel", "p2", { icono: "http://s.x/v.png" })]));
        expect(hijos(hijos(sin)[0]).some((h) => h.tipo === "imagen")).toBe(false);
    });

    it("cada botón es datos: etiqueta, acción y el id del bloque que emite", () => {
        const fila = bloqueANodo(bl("acciones", "acc", { acciones: ["guardar", "cancelar"] }));
        const botones = hijos(fila);
        expect(fila.tipo).toBe("fila");
        expect(botones.length).toBe(2);
        expect(botones.map((b) => b.props.bloque)).toEqual(["acc", "acc"]);
        expect(botones.map((b) => b.props.accion)).toEqual(["guardar", "cancelar"]);
    });
});

describe("límites del árbol en el visor", () => {
    it("más bloques que el máximo se cortan con un aviso", () => {
        const sobran = 3;
        const bloques = Array.from({ length: MAXIMO_BLOQUES + sobran }, (_, i) => bl("texto", `n${i}`, { contenido: "x" }));
        const avisos: string[] = [];
        const nodo = arbolDe(espejo(bloques), avisos);
        const mostrados = hijos(nodo).filter((h) => h.tipo === "texto").length;
        const cortados = hijos(nodo).filter((h) => h.tipo === "nopintable").length;
        expect(mostrados).toBe(MAXIMO_BLOQUES);
        expect(cortados).toBe(sobran);
        expect(avisos.some((a) => a.includes("Se cortaron bloques"))).toBe(true);
    });

    it("lo que supera PROFUNDIDAD_MAXIMA no se pinta y dice por qué", () => {
        let final: BloqueUi = bl("texto", "hoja", { contenido: "fondo" });
        for (let i = 0; i < PROFUNDIDAD_MAXIMA + 2; i++) final = bl("panel", `n${i}`, { titulo: `N${i}` }, [final]);
        const exceso = todo(arbolDe(espejo([final]))).filter((h) => h.tipo === "nopintable" && h.props.motivo?.includes("profundidad máxima"));
        expect(exceso.length).toBe(1);
    });

    it("un spec inválido devuelve problemas y NO árbol", () => {
        expect(aEscena3D(null)).toMatchObject({ raiz: null });
        const mala = aEscena3D({ version: 0, superficie: "xr:v", bloques: [] });
        expect(mala.raiz).toBeNull();
        expect(mala.avisos.length).toBeGreaterThan(0);
    });

    it("una verdad entera la responde aEscena3D con raíz, título y avisos", () => {
        const { raiz, avisos } = aEscena3D({ version: 1, superficie: "programa/prueba", titulo: "Junta", bloques: [bl("panel", "p", { titulo: "Panel" })] });
        const deRaiz = hijos(raiz ?? { hijos: [] });
        expect(raiz?.tipo).toBe("columna");
        expect(deRaiz[0]?.tipo).toBe("texto");
        expect(deRaiz[0]?.props.contenido).toBe("Junta");
        expect(deRaiz[1]?.tipo).toBe("tarjeta");
        expect(avisos).toEqual([]);
    });
});
