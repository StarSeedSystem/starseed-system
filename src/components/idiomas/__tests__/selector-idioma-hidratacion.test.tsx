import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { act, waitFor } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import { SelectorIdioma } from "../selector-idioma";
import { CLAVE_IDIOMA_NEURONA } from "@/lib/idiomas/estado";

describe("SelectorIdioma - hidratación (SSR → CSR) con neurona establecida", () => {
    it("no falla por hidratación y el texto del primer render del cliente coincide con el del servidor", async () => {
        const errorMock = vi.spyOn(console, "error").mockImplementation(() => {});

        if (typeof navigator !== "undefined") {
            Object.defineProperty(navigator, "language", {
                configurable: true,
                value: "fr-FR"
            });
        }

        const neuronaChoice = "en";
        const fakeStorage = {
            getItem: (key: string): string | null => {
                if (key === CLAVE_IDIOMA_NEURONA) {
                    return JSON.stringify({
                        codigo: neuronaChoice,
                        elegidoEn: new Date().toISOString(),
                    });
                }
                return null;
            },
            setItem: () => {},
        };

        const SSRHTML = renderToString(
            <SelectorIdioma
                abiertoAlInicio={false}
                alElegir={() => {}}
            />
        );

        const root = document.body.appendChild(document.createElement("div"));
        root.innerHTML = SSRHTML;

        const rootClient = createRoot(root);

        await act(async () => {
            rootClient.render(<SelectorIdioma abiertoAlInicio={false} alElegir={() => {}} />);
        });

        await waitFor(() => {
            expect(errorMock).not.toHaveBeenCalledWith(expect.stringContaining("Hydration"), expect.anything());
            expect(errorMock).not.toHaveBeenCalledWith(expect.stringMatching(/hydrat/, "i"), expect.anything());
            expect(errorMock).not.toHaveBeenCalledWith(expect.stringContaining("418"), expect.anything());
        });

        const rotuloPrincipal = root.querySelector<HTMLElement>("[data-testid=\"rotulo-idioma\"]");
        const SSRRotulo = SSRHTML.match(/<span[^>]*data-testid="rotulo-idioma"[^>]*>([^<]+)<\/span>/s)?.[1];

        expect(rotuloPrincipal?.textContent).toBe(SSRRotulo);

        vi.restoreAllMocks();
    });
});