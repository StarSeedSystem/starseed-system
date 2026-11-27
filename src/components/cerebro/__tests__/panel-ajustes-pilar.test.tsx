import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { AppearanceProvider } from "@/context/appearance-context";
import PanelAjustesPilar, {
  enlaceAjustes,
  seccionesVisibles,
  seccionDesdeUrl,
  urlConAjustes,
  valoresRecomendadosDeSeccion,
  type SeccionAjustesPilar,
} from "../panel-ajustes-pilar";
import { ProcesosAjustesContenido } from "../procesos-ajustes";

expect.extend(matchers);
afterEach(cleanup);

beforeEach(() => {
  window.history.replaceState(null, "", "/cerebro");
  vi.resetModules();
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

function montar(props: { seccionInicial?: SeccionAjustesPilar | null } = {}) {
  const renderContenido = vi.fn((seccion: SeccionAjustesPilar) => (
    <div data-testid={`contenido-${seccion}`}>Contenido de {seccion}</div>
  ));
  const onVolverRecomendado = vi.fn();
  const onSeccionChange = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AppearanceProvider>
      <PanelAjustesPilar
        open
        onOpenChange={onOpenChange}
        pilar="memoria"
        pilarEtiqueta="Memorias"
        seccionInicial={props.seccionInicial}
        renderContenido={renderContenido}
        onVolverRecomendado={onVolverRecomendado}
        onSeccionChange={onSeccionChange}
      />
    </AppearanceProvider>,
  );
  return { renderContenido, onVolverRecomendado, onSeccionChange, onOpenChange };
}

function montarProcesos(seccionInicial?: SeccionAjustesPilar | null) {
  const onVolverRecomendado = vi.fn();
  const onSeccionChange = vi.fn();
  const onOpenChange = vi.fn();
  const renderContenido = vi.fn((seccion: SeccionAjustesPilar) => (
    <ProcesosAjustesContenido key={seccion} seccion={seccion} brainId={null} />
  ));
  render(
    <AppearanceProvider>
      <PanelAjustesPilar
        open
        onOpenChange={onOpenChange}
        pilar="procesos"
        pilarEtiqueta="Procesos activos"
        seccionInicial={seccionInicial}
        renderContenido={renderContenido}
        onVolverRecomendado={onVolverRecomendado}
        onSeccionChange={onSeccionChange}
      />
    </AppearanceProvider>,
  );
  return { renderContenido, onVolverRecomendado, onSeccionChange, onOpenChange };
}

describe("enlace directo de los ajustes del pilar", () => {
  it("lee y escribe ?tab=<pilar>&ajustes=<seccion> sin perder otros parámetros", () => {
    expect(seccionDesdeUrl("privacidad")).toBe("privacidad");
    expect(seccionDesdeUrl("Sincronía")).toBe("sincronia");
    expect(seccionDesdeUrl("permisos")).toBe("privacidad");
    expect(seccionDesdeUrl("otra")).toBeNull();
    expect(seccionDesdeUrl(null)).toBeNull();

    expect(enlaceAjustes("memoria", "sincronia")).toBe("?tab=memoria&ajustes=sincronia");
    expect(urlConAjustes("/cerebro?brain=x&tab=egos", "contexto", "privacidad"))
      .toBe("/cerebro?brain=x&tab=contexto&ajustes=privacidad");
  });

  it("busca por título, descripción y palabras clave", () => {
    expect(seccionesVisibles("")).toEqual(["general", "privacidad", "sincronia", "avanzado"]);
    expect(seccionesVisibles("permisos")).toEqual(["privacidad"]);
    expect(seccionesVisibles("sincro")).toEqual(["sincronia"]);
    expect(seccionesVisibles("cifrado")).toEqual(["privacidad"]);
    expect(seccionesVisibles("zzz")).toEqual([]);
  });

  it("los recomendados son solo de la sección pedida", () => {
    expect(valoresRecomendadosDeSeccion("general", "account")).toHaveProperty("medios");
    expect(valoresRecomendadosDeSeccion("privacidad", "group")).toMatchObject({ privacidad: "grupo" });
    expect(valoresRecomendadosDeSeccion("sincronia", "account")).toHaveProperty("sync");
    expect(valoresRecomendadosDeSeccion("avanzado")).toEqual({});
  });
});

describe("PanelAjustesPilar", () => {
  it("monta con las cuatro secciones en orden y filtra la búsqueda", () => {
    const { renderContenido } = montar();
    expect(screen.getByTestId("panel-ajustes-pilar")).toBeInTheDocument();
    for (const nombre of ["General", "Privacidad y permisos", "Sincronía", "Avanzado"]) {
      expect(screen.getByRole("button", { name: nombre })).toBeInTheDocument();
    }
    expect(renderContenido).toHaveBeenLastCalledWith("general");
    expect(screen.getByTestId("contenido-general")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Buscar en los ajustes"), { target: { value: "sincro" } });
    expect(screen.getByRole("button", { name: "Sincronía" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "General" })).toBeNull();
    expect(renderContenido).toHaveBeenLastCalledWith("sincronia");

    fireEvent.change(screen.getByLabelText("Buscar en los ajustes"), { target: { value: "zzz" } });
    expect(screen.getByText("No hay ajustes que coincidan.")).toBeInTheDocument();
  });

  it("abre la sección del enlace directo y actualiza la URL al cambiar", () => {
    window.history.replaceState(null, "", "/cerebro?tab=memoria&ajustes=sincronia");
    const { renderContenido, onSeccionChange } = montar();
    expect(renderContenido).toHaveBeenLastCalledWith("sincronia");
    expect(screen.getByTestId("contenido-sincronia")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Privacidad y permisos" }));
    expect(onSeccionChange).toHaveBeenLastCalledWith("privacidad");
    expect(renderContenido).toHaveBeenLastCalledWith("privacidad");
    expect(window.location.search).toContain("tab=memoria");
    expect(window.location.search).toContain("ajustes=privacidad");
  });

  it("vuelve a lo recomendado solo de la sección activa y pide confirmación", () => {
    const { onVolverRecomendado } = montar({ seccionInicial: "privacidad" });
    fireEvent.click(screen.getByRole("button", { name: /Volver a lo recomendado/ }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onVolverRecomendado).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onVolverRecomendado).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Volver a lo recomendado/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, volver" }));
    expect(onVolverRecomendado).toHaveBeenCalledTimes(1);
    expect(onVolverRecomendado).toHaveBeenCalledWith("privacidad");
  });
});

describe("PanelAjustesPilar con pilar Procesos", () => {
  it("monta y muestra contenido de General (tipos visibles, intervalo, servidores ocultos)", () => {
    const { renderContenido } = montarProcesos();
    expect(screen.getByTestId("panel-ajustes-pilar")).toBeInTheDocument();
    expect(screen.getByText("Tipos visibles")).toBeInTheDocument();
    expect(screen.getByText("Intervalo de monitoreo")).toBeInTheDocument();
    expect(screen.getByText("Servidores ocultos")).toBeInTheDocument();
    expect(renderContenido).toHaveBeenLastCalledWith("general");
  });

  it("abre la sección Avanzado por enlace directo ?tab=procesos&ajustes=avanzado", () => {
    window.history.replaceState(null, "", "/cerebro?tab=procesos&ajustes=avanzado");
    const { renderContenido } = montarProcesos();
    expect(renderContenido).toHaveBeenLastCalledWith("avanzado");
    expect(screen.getByText("Umbrales de aviso")).toBeInTheDocument();
  });

  it("filtra la búsqueda en el pilar Procesos", () => {
    montarProcesos();
    fireEvent.change(screen.getByLabelText("Buscar en los ajustes"), { target: { value: "avanzado" } });
    expect(screen.getByRole("button", { name: "Avanzado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "General" })).toBeNull();
  });

  it("enlace directo genera URL correcta para procesos", () => {
    expect(enlaceAjustes("procesos", "avanzado")).toBe("?tab=procesos&ajustes=avanzado");
    expect(urlConAjustes("/cerebro?brain=x", "procesos", "general")).toBe("/cerebro?brain=x&tab=procesos&ajustes=general");
  });
});
