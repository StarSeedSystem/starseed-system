import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render as renderCrudo, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";

import { SugerenciaModoBanco } from "../sugerencia-modo-banco";

const textosBase = {
  sugerirTitulo: "Conexión limitada detectada",
  sugerirCuerpo: "Se ha detectado que tu conexión a internet es limitada. Considera activar el modo banco para gestionar mejor los datos.",
  sugerirActivar: "Activar modo banco",
  sugerirAhoraNo: "Ahora no",
};

const render = (ui: any) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

afterEach(() => cleanup());

describe("SugerenciaModoBanco", () => {
  it("no pinta nada cuando visible es false", () => {
    const { unmount } = render(
      <SugerenciaModoBanco visible={false} onActivar={() => {}} onAhoraNo={() => {}} textos={textosBase} />
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();
  });

  it("muestra título y cuerpo al montar", () => {
    const { rerender } = render(
      <SugerenciaModoBanco visible={true} onActivar={() => {}} onAhoraNo={() => {}} textos={textosBase} />
    );
    const status = screen.getByRole("status", { name: /Conexión limitada/i });
    expect(status).toBeInTheDocument();
    expect(screen.getByText(/Se ha detectado/i)).toBeInTheDocument();
    rerender(
      <SugerenciaModoBanco visible={false} onActivar={() => {}} onAhoraNo={() => {}} textos={textosBase} />
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("botón Activar modo banco llama SOLO a onActivar", () => {
    const onActivar = vi.fn();
    const onAhoraNo = vi.fn();
    render(
      <SugerenciaModoBanco visible={true} onActivar={onActivar} onAhoraNo={onAhoraNo} textos={textosBase} />
    );
    const btnActivar = screen.getByRole("button", { name: /Activar modo banco/i });
    fireEvent.click(btnActivar);
    expect(onActivar).toHaveBeenCalledTimes(1);
    expect(onAhoraNo).not.toHaveBeenCalled();
  });

  it("botón Ahora no llama SOLO a onAhoraNo", () => {
    const onActivar = vi.fn();
    const onAhoraNo = vi.fn();
    render(
      <SugerenciaModoBanco visible={true} onActivar={onActivar} onAhoraNo={onAhoraNo} textos={textosBase} />
    );
    const btnAhoraNo = screen.getByRole("button", { name: /Ahora no/i });
    fireEvent.click(btnAhoraNo);
    expect(onAhoraNo).toHaveBeenCalledTimes(1);
    expect(onActivar).not.toHaveBeenCalled();
  });

  it("Escape no activa ningún botón", () => {
    const onActivar = vi.fn();
    const onAhoraNo = vi.fn();
    render(
      <SugerenciaModoBanco visible={true} onActivar={onActivar} onAhoraNo={onAhoraNo} textos={textosBase} />
    );
    const btnActivar = screen.getByRole("button", { name: /Activar modo banco/i });
    fireEvent.keyDown(btnActivar, { key: "Escape" });
    expect(onActivar).not.toHaveBeenCalled();
    expect(onAhoraNo).not.toHaveBeenCalled();
  });

  it("montar y desmontar no llaman a ninguna función", () => {
    const onActivar = vi.fn();
    const onAhoraNo = vi.fn();
    const { unmount } = render(
      <SugerenciaModoBanco visible={true} onActivar={onActivar} onAhoraNo={onAhoraNo} textos={textosBase} />
    );
    expect(onActivar).not.toHaveBeenCalled();
    expect(onAhoraNo).not.toHaveBeenCalled();
    unmount();
    expect(onActivar).not.toHaveBeenCalled();
    expect(onAhoraNo).not.toHaveBeenCalled();
  });

  it("los botones son alcanzables con Tab", () => {
    render(
      <SugerenciaModoBanco visible={true} onActivar={() => {}} onAhoraNo={() => {}} textos={textosBase} />
    );
    const btnActivar = screen.getByRole("button", { name: /Activar modo banco/i });
    const btnAhoraNo = screen.getByRole("button", { name: /Ahora no/i });
    expect(btnActivar).toBeInTheDocument();
    expect(btnAhoraNo).toBeInTheDocument();
  });
});