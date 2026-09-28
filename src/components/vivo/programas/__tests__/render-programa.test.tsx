/**
 * El renderizador seguro: recorre el vocabulario cerrado y pinta todo lo que ponen las personas
 * como TEXTO; un bloque desconocido se avisa y no se ejecuta.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { BloqueProg, ProgramaSpec } from "@/lib/vivo/programas/tipos";
import { K } from "@/lib/vivo/programas/tipos";
import { estadoDe, estadoPlantilla, hacer } from "@/lib/vivo/__tests__/programa-utiles";
import { RenderPrograma } from "../render-programa";

afterEach(cleanup);

const spec = (bloques: BloqueProg[]): ProgramaSpec => ({ v: 1, titulo: "Prueba", descripcion: "", abierto: false, bloques });

function pintar(estado: ReturnType<typeof estadoDe>, extra: Partial<Parameters<typeof RenderPrograma>[0]> = {}) {
    const enviar = vi.fn(() => true);
    const r = render(<RenderPrograma estado={estado} yoUid="ana" yoNombre="Ana" puedeParticipar enviar={enviar} {...extra} />);
    return { ...r, enviar };
}

describe("RenderPrograma", () => {
    test("un programa sin bloques lo dice y orienta según pueda editar o no", () => {
        const vacio = estadoDe(spec([]));
        const a = pintar(vacio);
        expect(screen.getByText(/Este programa aún no tiene bloques/)).toBeInTheDocument();
        expect(screen.getByText(/Pulsa «Editar programa»/)).toBeInTheDocument();
        a.unmount();
        pintar(vacio, { yoUid: "beto", yoNombre: "Beto" });
        expect(screen.getByText(/Quien lo creó puede añadirlos/)).toBeInTheDocument();
    });

    test("los siete tipos de bloque se pintan a partir de la especificación", () => {
        const e = estadoDe(
            spec([
                { id: "b1", tipo: "titulo", texto: "Cena", nivel: 1 },
                { id: "b2", tipo: "texto", texto: "Traed algo de beber." },
                { id: "b3", tipo: "tareas", titulo: "Compras", iniciales: ["Pan"] },
                { id: "b4", tipo: "contador", titulo: "Vasos", inicial: 0, paso: 1, min: 0, max: null, unidad: "vasos", porPersona: null },
                { id: "b5", tipo: "encuesta", titulo: "Hora", pregunta: "¿A qué hora?", opciones: [{ id: "o1", texto: "20:00" }, { id: "o2", texto: "21:00" }], maxElecciones: 1 },
                { id: "b6", tipo: "kanban", titulo: "Reparto", columnas: [{ id: "c1", titulo: "Pendiente" }, { id: "c2", titulo: "Listo" }], iniciales: [{ col: "c1", texto: "Postre" }] },
                { id: "b7", tipo: "formulario", titulo: "Apuntarse", descripcion: "", campos: [{ id: "f1", etiqueta: "Nombre", tipo: "texto", obligatorio: true }], cupo: null, confirmacion: "Hecho" },
            ]),
        );
        pintar(e);
        expect(screen.getByRole("heading", { level: 2, name: "Cena" })).toBeInTheDocument();
        expect(screen.getByText("Traed algo de beber.")).toBeInTheDocument();
        expect(screen.getByText("Pan")).toBeInTheDocument();
        for (const nombre of ["Compras", "Vasos", "Hora", "Reparto", "Apuntarse"]) expect(screen.getByRole("region", { name: nombre })).toBeInTheDocument();
        expect(screen.getByText("Postre")).toBeInTheDocument();
    });

    test("un tipo de bloque desconocido se avisa y se omite, sin romper los demás ni ejecutar nada", () => {
        const e = estadoPlantilla("lista-compartida");
        const raro = { id: "zz", tipo: "iframe", src: "javascript:alert(1)" } as unknown as BloqueProg;
        const conRaro = { ...e, bloques: [...e.bloques, raro] };
        const { container } = pintar(conRaro);
        expect(screen.getByText(/tipo que esta versión no conoce/)).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Por hacer" })).toBeInTheDocument();
        expect(container.querySelector("iframe, script, a[href^='javascript']")).toBeNull();
    });

    test("todo lo que escriben las personas se pinta como texto, nunca como HTML", () => {
        const hostil = '<img src=x onerror="alert(1)"><script>robar()</script>';
        let e = estadoPlantilla("tablero-kanban");
        e = hacer(e, K.tarjetaAdd, "beto", { b: "b1", col: "c1", texto: hostil, nom: "Beto" });
        e = hacer(e, K.tarjetaAdd, "beto", { b: "b1", col: "c2", texto: "javascript:alert(1)", nom: "Beto" });
        const { container } = pintar(e);
        expect(screen.getByText(hostil)).toBeInTheDocument();
        expect(container.querySelector("script, img")).toBeNull();
        expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
        expect(container.querySelector("a[href^='javascript']")).toBeNull();
    });

    test("sin permiso de participar, los controles de participación quedan desactivados y las acciones no salen", () => {
        const e = estadoPlantilla("encuesta");
        const { enviar } = pintar(e, { puedeParticipar: false, yoUid: null });
        for (const op of screen.getAllByRole("radio")) {
            expect(op).toBeDisabled();
            fireEvent.click(op);
        }
        expect(enviar).not.toHaveBeenCalled();
    });

    test("el modo edición enseña los controles de estructura solo a quien puede cambiarla", () => {
        const e = estadoPlantilla("lista-compartida", "ana");
        const a = pintar(e, { modoEdicion: true });
        expect(screen.getAllByRole("button", { name: /^Editar el bloque/ }).length).toBeGreaterThan(0);
        a.unmount();
        pintar(e, { modoEdicion: true, yoUid: "beto", yoNombre: "Beto" });
        expect(screen.queryByRole("button", { name: /^Editar el bloque/ })).toBeNull();
    });
});
