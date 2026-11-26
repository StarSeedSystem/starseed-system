import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import type { RegistroEspejo } from "@/lib/chats-genesis/tipos";

import { HiloPuente } from "../hilo-puente";
import { APARATO_COMPLETO, catalogoDeEjemplo, clienteFalso, haceMin, ponerAncho, respuestaFeed } from "./ayudas";

// DIR1125X · el canal Audiovisual se lee también de la copia de la Mac («direccion» marcada).
const AUD = { id: "aud-h1", t: haceMin(3), de: "hermes", rol: "director", tipo: "respuesta", texto: "Canal Audiovisual y diseño listo.",
    canal: "hermes", fuente: "direccion", canalEspecializado: "audiovisual" } as unknown as RegistroEspejo;
const DIR = { id: "md-1", t: haceMin(2), de: "director-presidente", rol: "director", tipo: "respuesta", texto: "Mensaje de la dirección general",
    canal: "director-presidente", fuente: "direccion" } as RegistroEspejo;

describe("HiloPuente · canal Audiovisual (DIR1125X)", () => {
    afterEach(() => {
        cleanup();
        window.localStorage.clear();
    });

    it("enseña los mensajes del canal que la Mac subió y no los demás de la dirección", async () => {
        ponerAncho(1440);
        const { cliente } = clienteFalso({ feeds: { direccion: respuestaFeed([AUD, DIR], 10) } });
        render(<HiloPuente cliente={cliente} puente="peticiones" esDueno aparato={APARATO_COMPLETO} catalogo={catalogoDeEjemplo()} />);
        expect(await screen.findByText("Canal Audiovisual y diseño listo.")).toBeInTheDocument();
        expect(screen.queryByText("Mensaje de la dirección general")).toBeNull();
        expect(screen.getByTestId("cabecera-espejo")).toHaveTextContent(/Mac/);
    });

    it("el puente de Hermes no pide la copia de la dirección", async () => {
        ponerAncho(1440);
        const { cliente, feed } = clienteFalso({ feeds: { "puente:hermes-avisos": respuestaFeed([], 10) } });
        render(<HiloPuente cliente={cliente} puente="hermes-avisos" esDueno aparato={APARATO_COMPLETO} catalogo={catalogoDeEjemplo()} />);
        await screen.findByTestId("cabecera-espejo");
        expect(feed.mock.calls.some((c) => c[0].fuente === "direccion")).toBe(false);
    });
});
