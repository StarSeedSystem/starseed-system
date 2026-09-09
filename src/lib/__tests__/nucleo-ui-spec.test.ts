/**
 * TESTS DE UISPEC (Ola 307 · Tarea zN2)
 * La interfaz es un DATO: la IA la reescribe entera en vivo y el OS la valida
 * antes de renderizar. Aquí se comprueba que el vocabulario está cerrado, que
 * nada que parezca código entra, y que el usuario puede ver el diff antes.
 */

import { describe, expect, it } from "vitest";

import {
    diffUiSpec,
    superficiesDe,
    superficiesQuitadas,
    validarUiSpec,
    type UiSpec,
} from "@/lib/nucleo/ui-spec";

function specBase(): UiSpec {
    return {
        version: 1,
        superficie: "os:escritorio",
        titulo: "Escritorio de Alex",
        bloques: [
            {
                tipo: "panel",
                id: "panel-inicio",
                props: { titulo: "Inicio", icono: "home" },
                hijos: [
                    { tipo: "texto", id: "saludo", props: { contenido: "Hola, red StarSeed" } },
                    { tipo: "acciones", id: "atajos", props: { acciones: ["abrir.sala", "crear.agente"] } },
                ],
            },
        ],
    };
}

describe("validarUiSpec", () => {
    it("acepta una especificación sana y la devuelve depurada", () => {
        const { spec, problemas } = validarUiSpec(specBase());
        expect(problemas).toEqual([]);
        expect(spec?.superficie).toBe("os:escritorio");
        expect(spec?.bloques[0]?.hijos?.length).toBe(2);
    });
});

describe("validarUiSpec · desconfía de todo", () => {
    it("rechaza una prop con aspecto de código y lo nombra", () => {
        const bruto = specBase();
        bruto.bloques[0].props.titulo = "<script>robar()</script>";
        const { spec, problemas } = validarUiSpec(bruto);
        expect(spec).toBeNull();
        expect(problemas.some((p) => p.includes("aspecto de código"))).toBe(true);
        expect(problemas.some((p) => p.includes("panel-inicio"))).toBe(true);
    });

    it("rechaza manejadores en línea y URLs de guion", () => {
        const conManejador = specBase();
        conManejador.bloques[0].props.subtitulo = 'onclick=alert(1)';
        expect(validarUiSpec(conManejador).spec).toBeNull();

        const conGuion = specBase();
        conGuion.bloques[0].props.subtitulo = "javascript:fetch('/robar')";
        expect(validarUiSpec(conGuion).spec).toBeNull();
    });

    it("recorta las props no declaradas en PROPS_PERMITIDAS", () => {
        const bruto = specBase();
        bruto.bloques[0].props.alSoltar = "ejecutar";
        bruto.bloques[0].props.dangerouslySetInnerHTML = "x";
        const { spec, problemas } = validarUiSpec(bruto);
        expect(spec).not.toBeNull();
        expect(spec?.bloques[0]?.props).toEqual({ titulo: "Inicio", icono: "home" });
        expect(problemas.some((p) => p.includes("alSoltar"))).toBe(true);
    });

    it("rechaza identificadores duplicados", () => {
        const bruto = specBase();
        bruto.bloques.push({ tipo: "texto", id: "saludo", props: { contenido: "otro" } });
        const { spec, problemas } = validarUiSpec(bruto);
        expect(spec).toBeNull();
        expect(problemas.some((p) => p.includes("duplicado"))).toBe(true);
    });

    it("rechaza tipos fuera del vocabulario cerrado", () => {
        const bruto = specBase();
        bruto.bloques.push({
            tipo: "script" as unknown as "texto",
            id: "colado",
            props: {},
        });
        const { spec, problemas } = validarUiSpec(bruto);
        expect(spec).toBeNull();
        expect(problemas.some((p) => p.includes("Tipo de bloque desconocido"))).toBe(true);
    });
});

describe("validarUiSpec · límites del árbol", () => {
    it("rechaza una profundidad excesiva", () => {
        let hoja: Record<string, unknown> = { tipo: "texto", id: "hoja", props: { contenido: "fin" } };
        for (let nivel = 8; nivel >= 1; nivel -= 1) {
            hoja = { tipo: "panel", id: `nivel-${nivel}`, props: {}, hijos: [hoja] };
        }
        const { spec, problemas } = validarUiSpec({
            version: 1,
            superficie: "os:escritorio",
            bloques: [hoja],
        });
        expect(spec).toBeNull();
        expect(problemas.some((p) => p.includes("Profundidad excesiva"))).toBe(true);
    });

    it("rechaza versiones y superficies inválidas sin lanzar", () => {
        expect(validarUiSpec(null).spec).toBeNull();
        expect(validarUiSpec({ version: 0, superficie: "os:x", bloques: [] }).spec).toBeNull();
        expect(validarUiSpec({ version: 1, superficie: "", bloques: [] }).spec).toBeNull();
        expect(validarUiSpec({ version: 1, superficie: "os:x" }).spec).toBeNull();
    });
});

describe("diffUiSpec", () => {
    it("detecta añadidos, quitados y cambiados", () => {
        const antes = specBase();
        const despues = specBase();
        despues.bloques[0].props.titulo = "Inicio renovado";
        despues.bloques[0].hijos = [
            despues.bloques[0].hijos![0],
            { tipo: "widget", id: "reloj", props: { fuente: "os.reloj" } },
        ];
        const { anadidos, quitados, cambiados } = diffUiSpec(antes, despues);
        expect(anadidos).toEqual(["reloj"]);
        expect(quitados).toEqual(["atajos"]);
        expect(cambiados).toEqual(["panel-inicio"]);
    });

    it("no marca cambios cuando la especificación es la misma", () => {
        expect(diffUiSpec(specBase(), specBase())).toEqual({
            anadidos: [],
            quitados: [],
            cambiados: [],
        });
    });
});

describe("superficiesQuitadas", () => {
    it("delata la desaparición de una superficie fundamental", () => {
        const antes = specBase();
        antes.bloques[0].hijos!.push({
            tipo: "embebido",
            id: "identidad",
            props: { superficie: "os:identidad", ruta: "/identidad" },
        });
        const despues = specBase();
        expect(superficiesDe(antes)).toEqual(["os:escritorio", "os:identidad"]);
        expect(superficiesQuitadas(antes, despues)).toEqual(["os:identidad"]);
        expect(superficiesQuitadas(despues, antes)).toEqual([]);
    });

    it("descarta rutas externas en los bloques embebidos", () => {
        const bruto = specBase();
        bruto.bloques.push({
            tipo: "embebido",
            id: "externo",
            props: { superficie: "os:salas", ruta: "https://ejemplo.invalido/panel" },
        });
        const { spec, problemas } = validarUiSpec(bruto);
        expect(spec).not.toBeNull();
        expect(spec?.bloques[1]?.props.ruta).toBeUndefined();
        expect(problemas.some((p) => p.includes("Ruta no interna"))).toBe(true);
    });
});
