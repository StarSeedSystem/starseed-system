/**
 * Un diagrama de Diagram Design incrustado en una publicación se muestra con
 * VistaDiagrama (zoom, desplazamiento, piel clara/oscura y exportar SVG/PNG),
 * dentro de su iframe aislado; el código que no es diagrama y los SVG que no
 * validan siguen como estaban.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EmbeddedContentWindow, type EmbeddedItem } from "../embedded-content-window";
import { SANDBOX_CODIGO } from "@/lib/variaciones/validar";

afterEach(cleanup);

const DIAGRAMA = `<!DOCTYPE html>
<html lang="es"><head><title>Informe</title></head>
<body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" /></svg></body></html>`;

function item(extra: Partial<EmbeddedItem> = {}): EmbeddedItem {
    return { id: "dgm-1", kind: "programa", title: "Informe", content: DIAGRAMA, ...extra };
}

function abrir(extra: Partial<EmbeddedItem> = {}) {
    return render(<EmbeddedContentWindow item={item(extra)} defaultOpen />);
}

describe("diagrama incrustado en publicaciones", () => {
    it("abre un diagrama válido con VistaDiagrama y sus controles", () => {
        abrir();
        expect(screen.getByRole("toolbar", { name: "Controles de Informe" })).toBeInTheDocument();
        for (const control of ["Alejar", "Acercar", "Restablecer la vista", "Piel oscura", "Exportar SVG", "Exportar PNG"]) {
            expect(screen.getByRole("button", { name: control })).toBeInTheDocument();
        }
        expect(screen.getByTitle("Informe")).toBeInTheDocument();
    });

    it("conserva el aislamiento: sin scripts, sandbox vacío; con animación, solo allow-scripts", () => {
        const { unmount } = abrir();
        expect(screen.getByTitle("Informe")).toHaveAttribute("sandbox", "");
        unmount();

        abrir({ content: DIAGRAMA.replace("</body>", "<script>void 0</script></body>") });
        expect(screen.getByTitle("Informe")).toHaveAttribute("sandbox", "allow-scripts");
    });

    it("el código que no es diagrama sigue en el iframe del Lienzo", () => {
        abrir({ content: "<!DOCTYPE html><html><body><div>Hola</div></body></html>" });
        expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
        expect(screen.getByTitle("Informe")).toHaveAttribute("sandbox", SANDBOX_CODIGO);
    });

    it("un SVG sin documento válido se rechaza y no se pinta", () => {
        abrir({ content: "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"4\" height=\"4\" /></svg>" });
        expect(screen.getByText("Diagrama rechazado")).toBeInTheDocument();
        expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    });
});
