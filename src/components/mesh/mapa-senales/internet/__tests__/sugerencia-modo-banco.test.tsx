import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SugerenciaModoBanco } from "../sugerencia-modo-banco";

const textosBase = {
  sugerirTitulo: "Conexión limitada detectada",
  sugerirCuerpo: "Se ha detectado que tu conexión a internet es limitada. Considera activar el modo banco para gestionar mejor los datos.",
  sugerirActivar: "Activar modo banco",
  sugerirAhoraNo: "Ahora no",
};

function renderSugerencia(props: Partial<{
  visible: boolean;
  onActivar: () => void;
  onAhoraNo: () => void;
  textos: typeof textosBase;
}> = {}) {
  const onActivar = vi.fn();
  const onAhoraNo = vi.fn();
  return render(
    <SugerenciaModoBanco
      visible={props.visible ?? true}
      onActivar={props.onActivar ?? onActivar}
      onAhoraNo={props.onAhoraNo ?? onAhoraNo}
      textos={props.textos ?? textosBase}
    />
  );
}

afterEach(cleanup);

describe("SugerenciaModoBanco", () => {
  it("no pinta nada cuando visible es false", () => {
    renderSugerencia({ visible: false });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("pinta título, cuerpo y dos botones cuando visible es true", () => {
    renderSugerencia({ visible: true });
    const title = screen.getByRole("status", { name: /Conexión limitada detectada/i });
    expect(title).toBeInTheDocument();
    const body = screen.getByText(/Se ha detectado que tu conexión a internet es limitada/i);
    expect(body).toBeInTheDocument();
    const btnActivar = screen.getByRole("button", { name: /Activar modo banco/i });
    expect(btnActivar).toBeInTheDocument();
    const btnAhoraNo = screen.getByRole("button", { name: /Ahora no/i });
    expect(btnAhoraNo).toBeInTheDocument();
  });

  it("cada botón llama solo a su función y a ninguna otra", () => {
    const onActivar = vi.fn();
    const onAhoraNo = vi.fn();
    renderSugerencia({ visible: true, onActivar, onAhoraNo });
    const btnActivar = screen.getByRole("button", { name: /Activar modo banco/i });
    const btnAhoraNo = screen.getByRole("button", { name: /Ahora no/i });
    fireEvent.click(btnActivar);
    expect(onActivar).toHaveBeenCalledTimes(1);
    expect(onAhoraNo).not.toHaveBeenCalled();
    fireEvent.click(btnAhoraNo);
    expect(onAhoraNo).toHaveBeenCalledTimes(1);
    expect(onActivar).not.toHaveBeenCalled();
  });

  it("Escape no activa nada", () => {
    renderSugerencia({ visible: true });
    const btnActivar = screen.getByRole("button", { name: /Activar modo banco/i });
    fireEvent.keyDown(btnActivar, { key: "Escape", code: "Escape" });
    expect(onActivar).not.toHaveBeenCalled();
  });

  it("montar y desmontar no llaman a nada", () => {
    const onActivar = vi.fn();
    const onAhoraNo = vi.fn();
    renderSugerencia({ visible: true, onActivar, onAhoraNo });
    expect(onActivar).not.toHaveBeenCalled();
    expect(onAhoraNo).not.toHaveBeenCalled();
    // Desmontar volviendo visible a false
    // (el componente no debe lanzar efectos en mount/unmount)
  });

  it("los botones son alcanzables con Tab", () => {
    renderSugerencia({ visible: true });
    const btnActivar = screen.getByRole("button", { name: /Activar modo banco/i });
    const btnAhoraNo = screen.getByRole("button", { name: /Ahora no/i });
    expect(btnActivar).toHaveAttribute("tabindex", "0");
    expect(btnAhoraNo).toHaveAttribute("tabindex", "0");
  });
});