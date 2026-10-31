import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { RedisenoFondoPanel } from "../rediseno-fondo-panel";
import { registerTheme, type ThemePack } from "@/lib/design/theme-engine";

const PACK: ThemePack = {
  id: "tema-prueba",
  name: "Tema de prueba",
  description: "para el panel",
  style: "profesional",
  modes: { dark: { vars: { radius: "1.25rem", primary: "#123456" }, fontFamily: "Inter", motion: 1 } },
};

const pintar = (host?: string) =>
  render(
    <AppearanceProvider>
      <RedisenoFondoPanel host={host} />
    </AppearanceProvider>,
  );

describe("RedisenoFondoPanel (conexión de rediseno-desde-fondo)", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-ss-material");
    localStorage.clear();
    registerTheme(PACK);
  });
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-ss-material");
    localStorage.clear();
  });

  it("conecta el módulo puro: enseña las TRES propuestas con motivo y contraste AA", async () => {
    pintar();
    for (const nombre of ["Sobria", "Armonía", "Atrevida"]) await screen.findByText(nombre);
    const panel = screen.getByLabelText(/Rediseño sugerido/i);
    expect(panel.textContent).toContain("Contraste AA");
    expect(panel.textContent).toContain("escala φ");
  });

  it("aplica una propuesta real (tokens en :root) y «Deshacer» la revierte del todo", async () => {
    document.documentElement.style.setProperty("--radius", "1.25rem");
    document.documentElement.dataset.ssMaterial = "ss-metal";
    pintar();
    await screen.findByText("Atrevida");
    const antes = document.documentElement.style.getPropertyValue("--radius");
    fireEvent.click(screen.getAllByText("Aplicar")[2]); // atrevida: vidrio + motion 2
    expect(document.documentElement.getAttribute("data-ss-material")).toBe("ss-crystal");
    expect(document.documentElement.style.getPropertyValue("--ss-motion")).toBe("2");
    expect(document.documentElement.style.getPropertyValue("--radius")).not.toBe(antes);
    fireEvent.click(screen.getByText("Deshacer"));
    expect(document.documentElement.getAttribute("data-ss-material")).toBe("ss-metal");
    expect(document.documentElement.style.getPropertyValue("--ss-motion")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--radius")).toBe(antes);
  });

  it("arma el pedido al Director con pedidoParaIA (texto y modo del sistema)", async () => {
    pintar();
    await screen.findByText("Sobria");
    fireEvent.click(screen.getByTitle(/Armar el pedido al Director/i));
    await waitFor(() => {
      const area = screen.getByLabelText(/Pedido al Director/i) as HTMLTextAreaElement;
      expect(area.value).toContain("sobria, armónica, atrevida");
      expect(area.value).toContain("Modo oscuro");
      expect(area.value).toContain("AA");
    });
  });

  it("en localhost dice que puede pedir; fuera de una neurona de la persona, no introduce lo privado", async () => {
    pintar("starseed-os.vercel.app");
    await screen.findByText("Sobria");
    fireEvent.click(screen.getByTitle(/Armar el pedido al Director/i));
    await screen.findByLabelText(/Pedido al Director/i);
    expect(screen.getByText(/instancia compartida/i)).toBeInTheDocument();
  });
});
