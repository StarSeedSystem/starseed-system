// Tarea SGO1024G · Diagramas incrustados en publicaciones.
// Comprueba que CodeSandboxBody (src/components/posts/embedded-content-window.tsx)
// pinta un diagrama de Diagram Design (HTML con <svg>) con VistaDiagrama —zoom,
// piel clara/oscura y exportar SVG/PNG, sobre iframe aislado— y que el resto del
// código en línea sigue en el iframe `srcdoc` de siempre.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EmbeddedContentWindow, type EmbeddedItem } from "../embedded-content-window";

const DIAGRAMA = `<!DOCTYPE html>
<html>
<head><style>:root { --color-paper: #f5f5f5; }</style></head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
  <rect width="100%" height="100%" fill="#f5f5f5"></rect>
  <text x="10" y="30">A → B</text>
</svg>
</body>
</html>`;

const DIAGRAMA_INVALIDO = `<html>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><text>y</text></svg>
</body>
</html>`;

const CODIGO_PLANO = `<!DOCTYPE html>
<html><body><h1>Hola</h1><p>Widget del Lienzo, sin svg.</p></body></html>`;

const item = (extra: Partial<EmbeddedItem>): EmbeddedItem => ({
    kind: "programa",
    name: "flujo.html",
    ...extra,
});

describe("Diagrama incrustado en publicación (EmbeddedContentWindow)", () => {
    afterEach(() => {
        cleanup();
    });

    it("se pinta con VistaDiagrama: barra de zoom, piel y exportar SVG/PNG", () => {
        render(<EmbeddedContentWindow item={item({ content: DIAGRAMA })} defaultOpen />);
        expect(screen.queryByRole("toolbar")).not.toBeNull();
        expect(screen.queryByRole("button", { name: "Exportar SVG" })).not.toBeNull();
        expect(screen.queryByRole("button", { name: "Exportar PNG" })).not.toBeNull();
        expect(screen.queryByRole("button", { name: "Acercar" })).not.toBeNull();
        expect(screen.queryByRole("button", { name: "Piel oscura" })).not.toBeNull();
    });

    it("mantiene el iframe aislado de siempre: sin allow-same-origin, con CSP", () => {
        render(<EmbeddedContentWindow item={item({ content: DIAGRAMA })} defaultOpen />);
        const iframe = document.querySelector<HTMLIFrameElement>("iframe[title='flujo.html']");
        expect(iframe).not.toBeNull();
        const sandbox = iframe?.getAttribute("sandbox") ?? "";
        expect(sandbox.includes("allow-same-origin")).toBe(false);
        const srcdoc = iframe?.getAttribute("srcdoc") ?? "";
        expect(srcdoc.includes("Content-Security-Policy")).toBe(true);
        expect(srcdoc.includes("<svg")).toBe(true);
    });

    it("un diagrama invalidado muestra los motivos y no se pinta", () => {
        render(<EmbeddedContentWindow item={item({ content: DIAGRAMA_INVALIDO })} defaultOpen />);
        expect(screen.queryByText("Diagrama rechazado")).not.toBeNull();
        expect(screen.queryByText(/espera exactamente un documento HTML/)).not.toBeNull();
        expect(document.querySelector("iframe")).toBeNull();
    });

    it("código sin svg sigue en el iframe srcdoc mínimo (sin barra de diagrama)", () => {
        render(<EmbeddedContentWindow item={item({ content: CODIGO_PLANO })} defaultOpen />);
        expect(screen.queryByRole("toolbar")).toBeNull();
        const iframe = document.querySelector<HTMLIFrameElement>("iframe[title='flujo.html']");
        expect(iframe).not.toBeNull();
        expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
        expect((iframe?.getAttribute("srcdoc") ?? "").includes("Hola")).toBe(true);
    });
});
