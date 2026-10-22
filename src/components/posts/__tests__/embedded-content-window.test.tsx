import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmbeddedContentWindow } from "../embedded-content-window";

// HTML de diagrama con la misma forma que la plantilla de
// vendor/habilidades/diagram-design/assets/template.html (MIT): enlace remoto a
// Google Fonts y un `<svg>` dentro. Debe pasar por `prepararDiagrama` antes de
// mostrarse (architecture/diagramas.md §3).
const DIAGRAMA_VENDOR =
  '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
  '<link href="https://fonts.googleapis.com/css2?family=Geist&display=swap" rel="stylesheet">' +
  '<style>:root{--font-sans:"Geist",system-ui,sans-serif}</style></head>' +
  '<body><svg viewBox="0 0 100 100"><rect width="100" height="100"></rect></svg>' +
  '<iframe src="https://malo.example"></iframe></body></html>';

afterEach(cleanup);

describe("<EmbeddedContentWindow /> · diagramas", () => {
  it("muestra el diagrama validado, sin red y sin allow-same-origin", () => {
    const { container } = render(
      <EmbeddedContentWindow
        item={{ kind: "programa", name: "Diagrama", content: DIAGRAMA_VENDOR }}
        defaultOpen
      />,
    );
    const marco = container.querySelector("iframe");
    expect(marco).toBeTruthy();
    expect(marco?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(marco?.getAttribute("sandbox")?.includes("same-origin")).toBe(false);

    const doc = marco?.getAttribute("srcdoc") ?? "";
    expect(doc).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("<svg");
    expect(doc).not.toContain("fonts.googleapis.com");
    expect(doc).not.toContain("<link");
    expect(doc).not.toContain("<iframe");
  });

  it("si el diagrama no pasa la validación muestra el motivo y no lo ejecuta", () => {
    const { container } = render(
      <EmbeddedContentWindow
        item={{ kind: "programa", name: "Diagrama roto", content: "<svg></svg>" }}
        defaultOpen
      />,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Diagrama rechazado");
    expect(screen.getByRole("alert").textContent).toContain("espera exactamente");
  });

  it("el HTML en línea que no es diagrama conserva su vista previa", () => {
    const pagina = "<!DOCTYPE html><html><body><h1>Hola</h1><script>console.log(1)</script></body></html>";
    const { container } = render(
      <EmbeddedContentWindow
        item={{ kind: "programa", name: "Página", content: pagina }}
        defaultOpen
      />,
    );
    const marco = container.querySelector("iframe");
    expect(marco?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(marco?.getAttribute("srcdoc")).toBe(pagina);
  });
});
