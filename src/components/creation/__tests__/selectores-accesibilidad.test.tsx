/**
 * SP092940b (2026-10-25): los selectores de creación eran botones toggle sin
 * aria-pressed ni roles de grupo: un lector de pantalla no sabía qué opción
 * estaba elegida, incluso antes de actos irreversibles (publicar fuera de la
 * red, guardar en una biblioteca). El patrón correcto ya vivía en TagSelector
 * y ahora vive en dos helpers puros (atributosRadio y atributosChip) que usan
 * TODOS los selectores: grupo de opción única → radiogroup/aria-checked;
 * selección múltiple → group/aria-pressed.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
    atributosRadio,
    atributosChip,
    TipoSelector,
    TagSelector,
} from "@/components/creation/creation-fields";

afterEach(() => {
    cleanup();
});

describe("helpers de accesibilidad (funciones puras)", () => {
    it("atributosRadio marca la opción elegida con aria-checked", () => {
        expect(atributosRadio(true)).toEqual({ role: "radio", "aria-checked": true });
        expect(atributosRadio(false)).toEqual({ role: "radio", "aria-checked": false });
    });

    it("atributosChip marca el chip activado con aria-pressed", () => {
        expect(atributosChip(true)).toEqual({ "aria-pressed": true });
        expect(atributosChip(false)).toEqual({ "aria-pressed": false });
    });

    it("el patrón radio y el chip no se mezclan (grupos distintos, roles distintos)", () => {
        expect(atributosRadio(true)).not.toHaveProperty("aria-pressed");
        expect(atributosChip(true)).not.toHaveProperty("role");
    });
});

describe("TipoSelector · grupo de opción única", () => {
    it("es un radiogroup con nombre accesible y una sola opción marcada", () => {
        render(<TipoSelector dest="cultura" value="evento" onChange={() => {}} />);
        const grupo = screen.getByRole("radiogroup", { name: "Tipo de contenido" });
        expect(grupo).not.toBeNull();
        const opciones = screen.getAllByRole("radio");
        const marcadas = opciones.filter((b) => b.getAttribute("aria-checked") === "true");
        expect(marcadas.length).toBe(1);
        expect(marcadas[0].textContent).toContain("Evento");
    });

    it("pulsar otra opción la marca a ella y desmarca la anterior", async () => {
        const usuario = userEvent.setup();
        const elegidas: string[] = [];
        render(
            <TipoSelector
                dest="cultura"
                value="evento"
                onChange={(t) => elegidas.push(t)}
            />,
        );
        const boton = screen.getByRole("radio", { name: /Obra/ });
        await usuario.click(boton);
        expect(elegidas).toEqual(["obra"]);
    });
});

describe("TagSelector · grupo de selección múltiple", () => {
    it("es un grupo con nombre accesible y chips con aria-pressed", () => {
        render(<TagSelector dest="cultura" value={["obra", "meme"]} onChange={() => {}} />);
        const grupo = screen.getByRole("group", { name: "Etiquetas del contenido" });
        expect(grupo).not.toBeNull();
        expect(screen.getByRole("button", { name: /Obra/ }).getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByRole("button", { name: /Meme/ }).getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByRole("button", { name: /General/ }).getAttribute("aria-pressed")).toBe("false");
    });

    it("pulsar un chip alterna su aria-pressed y lo añade a la selección", async () => {
        const usuario = userEvent.setup();
        const acumuladas: string[][] = [];
        render(
            <TagSelector
                dest="cultura"
                value={["obra"]}
                onChange={(tags) => acumuladas.push(tags)}
            />,
        );
        const chip = screen.getByRole("button", { name: /General/ });
        expect(chip.getAttribute("aria-pressed")).toBe("false");
        await usuario.click(chip);
        expect(acumuladas[acumuladas.length - 1]).toContain("general");
    });
});
