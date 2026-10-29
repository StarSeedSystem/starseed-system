import { describe, expect, it } from "vitest";
import type { BloqueUi, UiSpec } from "@/lib/nucleo/ui-spec";
import { MAXIMO_BLOQUES, PROFUNDIDAD_MAXIMA } from "@/lib/nucleo/ui-spec";
import {
    MOTIVO_SIN_VISTA, aEscena3D, escena3DDesde, limpiarTexto, urlImagenSegura, type Nodo,
} from "../uispec-mapa";

const bloque = (tipo: BloqueUi["tipo"], id: string, props: Record<string, unknown> = {}, hijos?: BloqueUi[]): BloqueUi =>
    ({ tipo, id, props, ...(hijos ? { hijos } : {}) });
const spec = (bloques: BloqueUi[]): UiSpec => ({ version: 1, superficie: "os:prueba", bloques });
const primero = (bloques: BloqueUi[]): Nodo => aEscena3D(spec(bloques)).arbol[0];

describe("UiSpec → escena 3D", () => {
    it("cada tipo de bloque del vocabulario produce su nodo", () => {
        const casos: [BloqueUi["tipo"], string][] = [
            ["panel", "tarjeta"], ["rejilla", "fila"], ["texto", "texto"], ["acciones", "fila"],
            ["lista", "lista"], ["widget", "nopintable"], ["embebido", "nopintable"],
        ];
        for (const [tipo, esperado] of casos) expect(primero([bloque(tipo, `b.${tipo}`)]).tipo).toBe(esperado);
    });

    it("un panel conserva título y hijos; una rejilla de una columna se apila", () => {
        const hijo = bloque("texto", "b.hijo", { contenido: "Dentro" });
        const panel = primero([bloque("panel", "b.panel", { titulo: "Ajustes" }, [hijo])]);
        expect(panel.tipo).toBe("tarjeta");
        expect(panel.props.titulo).toBe("Ajustes");
        expect(panel.hijos[0].tipo).toBe("texto");
        expect(primero([bloque("rejilla", "b.uno", { columnas: 1 })]).tipo).toBe("columna");
        expect(primero([bloque("rejilla", "b.dos", { columnas: 3 })]).tipo).toBe("fila");
    });

    it("acciones se convierte en botones que solo llevan el id de la acción", () => {
        const fila = primero([bloque("acciones", "b.acciones", { acciones: ["abrir", "cerrar.js"] })]);
        expect(fila.tipo).toBe("fila");
        expect(fila.hijos.map((b) => b.tipo)).toEqual(["boton", "boton"]);
        expect(fila.hijos[0].props).toMatchObject({ accion: "abrir", etiqueta: "abrir" });
    });

    it("una acción con identificador inválido no se pinta", () => {
        const fila = primero([bloque("acciones", "b.mala", { acciones: ["<script>"] })]);
        expect(fila.hijos).toEqual([]);
    });

    it("la lista lleva sus elementos y su texto vacío", () => {
        const lista = primero([bloque("lista", "b.lista", { titulo: "Tareas", elementos: ["una", "dos"], vacio: "Nada" })]);
        expect(lista.tipo).toBe("lista");
        expect(lista.props.elementos).toEqual(["una", "dos"]);
        expect(lista.props.vacio).toBe("Nada");
    });

    it("un tipo desconocido es nopintable con el motivo del contrato", () => {
        const raro = { tipo: "script", id: "b.raro", props: {} } as unknown as BloqueUi;
        expect(primero([raro])).toMatchObject({ tipo: "nopintable", props: { motivo: MOTIVO_SIN_VISTA } });
    });

    it("las props no declaradas se descartan y se avisa", () => {
        const r = aEscena3D(spec([bloque("texto", "b.texto", { contenido: "Hola", nivel: 2, onClick: "alert(1)" })]));
        expect(r.arbol[0].props).toEqual({ contenido: "Hola", nivel: 2 });
        expect(r.avisos.join(" ")).toContain("onClick");
    });

    it("el texto con etiquetas o forma de código se limpia", () => {
        expect(limpiarTexto("<b>Hola</b> mundo")).toBe("Hola mundo");
        expect(limpiarTexto("<script>alert(1)</script>")).not.toContain("<script>");
        const nodo = primero([bloque("texto", "b.codigo", { contenido: "eval(1)" })]);
        expect(String(nodo.props.contenido)).not.toContain("eval(");
    });

    it("una imagen solo pasa si es https; el http se queda sin vista 3D", () => {
        const buena = primero([bloque("widget", "b.foto", { fuente: "https://cdn.example/foto.png", titulo: "Foto" })]);
        expect(buena.tipo).toBe("imagen");
        expect(buena.props.src).toBe("https://cdn.example/foto.png");
        const mala = primero([bloque("widget", "b.http", { fuente: "http://cdn.example/foto.png" })]);
        expect(mala.tipo).toBe("nopintable");
        expect(JSON.stringify(mala)).not.toContain("http://");
        expect(urlImagenSegura("javascript:alert(1)")).toBeNull();
    });

    it("un panel de variante separador se pinta como separador", () => {
        expect(primero([bloque("panel", "b.sep", { variante: "separador" })]).tipo).toBe("separador");
    });

    it("más bloques que el máximo se cortan con aviso, sin lanzar", () => {
        const muchos: BloqueUi[] = [];
        for (let i = 0; i < MAXIMO_BLOQUES + 7; i += 1) muchos.push(bloque("texto", `b.${i}`));
        const r = aEscena3D(spec(muchos));
        expect(r.arbol).toHaveLength(MAXIMO_BLOQUES);
        expect(r.avisos.join(" ")).toContain(`Máximo de ${MAXIMO_BLOQUES} bloques`);
    });

    it("la profundidad se corta en el máximo y lo dice", () => {
        const anidar = (n: number): BloqueUi => ({ tipo: "panel", id: `b.${n}`, props: {}, hijos: n > 1 ? [anidar(n - 1)] : [] });
        const r = aEscena3D(spec([anidar(PROFUNDIDAD_MAXIMA + 3)]));
        const medir = (n: Nodo): number => (n.hijos.length ? 1 + Math.max(...n.hijos.map(medir)) : 1);
        expect(medir(r.arbol[0])).toBeLessThanOrEqual(PROFUNDIDAD_MAXIMA);
        expect(r.avisos.join(" ")).toContain("Profundidad máxima");
    });

    it("una spec válida devuelve árbol y una inválida devuelve problemas sin árbol", () => {
        const buena = escena3DDesde({ version: 1, superficie: "os:prueba", bloques: [bloque("texto", "b.ok", { contenido: "Hola" })] });
        expect(buena.arbol?.[0].tipo).toBe("texto");
        expect(buena.spec).not.toBeNull();
        expect(buena.problemas).toEqual([]);
        const mala = escena3DDesde({ version: 0, superficie: "", bloques: "no-es-lista" });
        expect(mala.arbol).toBeNull();
        expect(mala.spec).toBeNull();
        expect(mala.problemas.length).toBeGreaterThan(0);
    });
});
