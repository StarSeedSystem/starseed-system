import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CLAVE_TRADUCCION, preferenciasPorDefecto } from "@/lib/traduccion/preferencias";
import { PreferenciasTraduccionCard } from "../account-sync-panel";

function guardarEnAlmacen(perfilId: string, prefs: unknown): void {
    window.localStorage.setItem(CLAVE_TRADUCCION, JSON.stringify({ [perfilId]: prefs }));
}

function leerDelAlmacen(perfilId: string): Record<string, unknown> {
    const mapa = JSON.parse(window.localStorage.getItem(CLAVE_TRADUCCION) ?? "{}") as Record<string, Record<string, unknown>>;
    return mapa[perfilId];
}

const CON_FR = {
    ...preferenciasPorDefecto("es"),
    entiende: ["es"],
    auto: { ...preferenciasPorDefecto("es").auto, paginas: "preguntar" as const },
};

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe("PreferenciasTraduccionCard", () => {
    it("lee las preferencias del perfil y guarda al cambiar el idioma", async () => {
        guardarEnAlmacen("ana", CON_FR);
        render(<PreferenciasTraduccionCard perfilId="ana" />);

        const idioma = await screen.findByLabelText("Idioma de lectura") as HTMLSelectElement;
        await waitFor(() => expect(idioma.value).toBe("es"));

        fireEvent.change(idioma, { target: { value: "pt" } });
        await waitFor(() => expect(leerDelAlmacen("ana").idioma).toBe("pt"));
        expect(leerDelAlmacen("ana").entiende).toContain("pt");
    });

    it("guarda el modo por contexto y avisa cuándo traduciría solo", async () => {
        guardarEnAlmacen("ana", CON_FR);
        render(<PreferenciasTraduccionCard perfilId="ana" />);

        const paginas = await screen.findByLabelText("Autotraducción en paginas");
        fireEvent.change(paginas, { target: { value: "siempre" } });

        await waitFor(() => {
            const auto = leerDelAlmacen("ana").auto as Record<string, string>;
            expect(auto.paginas).toBe("siempre");
        });
        expect(screen.getByText("Traduciría un texto en «fr»")).toBeInTheDocument();
    });

    it("no traduce solo el contexto que sigue en «preguntar» y respeta lo que ya entiende", async () => {
        guardarEnAlmacen("ana", { ...CON_FR, entiende: ["es", "fr"], auto: { ...CON_FR.auto, mensajes: "siempre" } });
        render(<PreferenciasTraduccionCard perfilId="ana" />);

        expect((await screen.findAllByText("Preguntaría antes de traducir")).length).toBeGreaterThan(0);
        expect(screen.getAllByText("No: ya lo entiendes").length).toBeGreaterThan(0);
    });

    it("restablece todo a «preguntar» y se refresca cuando llega de otro medio", async () => {
        guardarEnAlmacen("ana", { ...CON_FR, auto: { ...CON_FR.auto, paginas: "siempre" } });
        render(<PreferenciasTraduccionCard perfilId="ana" />);

        fireEvent.click(await screen.findByRole("button", { name: "Restablecer" }));
        await waitFor(() => {
            const auto = leerDelAlmacen("ana").auto as Record<string, string>;
            expect(Object.values(auto).every((modo) => modo === "preguntar")).toBe(true);
        });

        guardarEnAlmacen("ana", { ...CON_FR, idioma: "pt", entiende: ["pt"] });
        fireEvent(window, new Event("starseed:traduccion"));
        const idioma = screen.getByLabelText("Idioma de lectura") as HTMLSelectElement;
        await waitFor(() => expect(idioma.value).toBe("pt"));
    });
});
