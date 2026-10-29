/**
 * UIG1029C: «Bloqueadas y rechazadas» por causa, cada una en su ventana plegable. Solo
 * arranca abierta la causa con más tareas, cada cabecera lleva su «Cerrar lista» y la
 * acción automática que ya la está tratando. El medidor del pulso y Ramificación pintan
 * el MISMO componente, así que la vista es la misma por construcción.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
    BloqueadasGrupos,
    accionDeGrupo,
    accionQueLaTrata,
    agruparPorCausa,
    causaDeFila,
} from "@/components/mando/bloqueadas-grupos";
import { SeccionBloqueadasReintentos } from "@/components/mando/ramificacion-agentes";
import type { DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";
import type { ResumenBloqueadas } from "@/lib/mando/bloqueadas";

function fila(id: string, estado: string, porque: string, grupo: FilaMedidor["grupo"] = "atascada"): FilaMedidor {
    return { id, titulo: `tarea ${id}`, estado, porque, grupo, acciones: [] };
}

const filas: FilaMedidor[] = [
    fila("D1", "bloqueada", "espera a A0"),
    fila("D2", "bloqueada", "espera a A1"),
    fila("D3", "bloqueada", "espera a A2"),
    fila("R1", "rechazada", "objeción de la revisión", "sin-resolver"),
    fila("R2", "rechazada", "objeción de la revisión", "sin-resolver"),
    fila("F1", "fallo_tsc", "tsc rojo", "sin-resolver"),
];

const resumen: ResumenBloqueadas = {
    valor: 6, enCadena: 0, atascadas: 3, alex: 0, sinResolver: 3, sinResolverEnMarcha: 0,
    transformadasHoy: 0, pastilla: "", texto: "", textoCadena: "", cadenas: [], transformadas: [],
    preguntas: [], revisorAlDia: true,
};

const detalle: DetalleMedidor = {
    clave: "bloqueadas", titulo: "Bloqueadas y rechazadas", resumen: "6 paradas",
    filas, acciones: [], bloqueadas: resumen,
};

afterEach(() => {
    cleanup();
    window.localStorage.clear();
});

describe("agrupar por causa", () => {
    it("nombra la causa de cada fila en castellano", () => {
        expect(causaDeFila(filas[0])).toEqual({
            clave: "dependencia",
            titulo: "Esperando una dependencia viva",
            accion: "Se desbloquean solas cuando su dependencia llega a main",
        });
        expect(causaDeFila(filas[3]).titulo).toBe("Rechazadas por la revisión");
        expect(causaDeFila(filas[5]).clave).toBe("fallo");
        expect(causaDeFila(fila("X", "bloqueante", "agotó los reintentos gratuitos: necesita una persona")).clave)
            .toBe("bloqueante");
        expect(causaDeFila(fila("Y", "bloqueada sin salida", "espera a nadie")).clave).toBe("sin-salida");
    });

    it("agrupa y pone primero la causa con más tareas", () => {
        const grupos = agruparPorCausa(filas);
        expect(grupos.map((g) => g.causa.clave)).toEqual(["dependencia", "rechazada", "fallo"]);
        expect(grupos.map((g) => g.filas.length)).toEqual([3, 2, 1]);
    });

    it("la acción automática sale del porqué que ya la está tratando", () => {
        const rehace = agruparPorCausa([fila("R9", "rechazada", "la rehace R9b (en_curso)")])[0];
        expect(accionQueLaTrata(rehace.filas[0])).toBe("La rehace R9b");
        expect(accionDeGrupo(rehace)).toBe("La rehace R9b");
        expect(accionQueLaTrata(fila("E1", "bloqueada", "la lleva la escalera del director"))).toContain("escalera");
    });
});

describe("BloqueadasGrupos por causa", () => {
    it("una sección por causa: solo la mayor abierta, con contador, acción y «Cerrar lista»", () => {
        render(<BloqueadasGrupos detalle={detalle} />);

        const dependencia = screen.getByRole("region", { name: "Esperando una dependencia viva" });
        expect(within(dependencia).getByTestId("bloqueada-panel-D1")).toBeInTheDocument();
        expect(within(dependencia).getByText("3")).toBeInTheDocument();
        expect(within(dependencia).getByText("Se desbloquean solas cuando su dependencia llega a main"))
            .toBeInTheDocument();
        expect(within(dependencia).getByRole("button", { name: /Cerrar lista/ })).toBeInTheDocument();

        const rechazadas = screen.getByRole("region", { name: "Rechazadas por la revisión" });
        expect(within(rechazadas).queryByTestId("bloqueada-panel-R1")).toBeNull();
        expect(within(rechazadas).getByText("2 en esta causa")).toBeInTheDocument();
        expect(within(rechazadas).getByRole("button", { name: /Abrir lista/ })).toBeInTheDocument();
    });

    it("Ramificación pinta las mismas causas que el medidor", () => {
        render(<SeccionBloqueadasReintentos olas={[]} onVer={() => undefined} onHecho={() => undefined} detalle={detalle} />);
        expect(screen.getByRole("region", { name: "Esperando una dependencia viva" })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Rechazadas por la revisión" })).toBeInTheDocument();
        expect(screen.queryByText("R1")).toBeNull();
    });
});
