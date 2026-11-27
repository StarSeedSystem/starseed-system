import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import type { Brain } from "@/lib/brains/brains";
import PanelAjustesPilar, {
  SECCIONES,
  reinicioDeSeccion,
  seccionDesdeUrl,
  seccionesVisibles,
} from "../panel-ajustes-pilar";

expect.extend(matchers);
afterEach(cleanup);

const montar = (el: ReactElement) =>
  render(
    <AppearanceProvider>
      <ConfirmProvider>{el}</ConfirmProvider>
    </AppearanceProvider>,
  );

const cerebro: Brain = {
  id: "b1",
  name: "Cerebro de prueba",
  scope: "account",
  scope_ref: null,
  description: "",
  config: {},
  includes: {
    vaults: [],
    backends: [],
    personalities: [],
    runtimes: [],
    tokens: [],
    memories: [],
    connections: [],
    bindScope: false,
    permissions: [],
  },
  servers: [],
};

describe("panel-ajustes-pilar · lógica pura", () => {
  it("seccionDesdeUrl acepta las cuatro secciones y rechaza lo demás", () => {
    expect(seccionDesdeUrl("general")).toBe("general");
    expect(seccionDesdeUrl("privacidad")).toBe("privacidad");
    expect(seccionDesdeUrl("sincronia")).toBe("sincronia");
    expect(seccionDesdeUrl("avanzado")).toBe("avanzado");
    expect(seccionDesdeUrl("  SINCRONIA ")).toBe("sincronia");
    expect(seccionDesdeUrl("noexiste")).toBeNull();
    expect(seccionDesdeUrl(null)).toBeNull();
  });

  it("seccionesVisibles filtra por etiqueta, ayuda y claves", () => {
    expect(seccionesVisibles("")).toHaveLength(SECCIONES.length);
    const soloPriv = seccionesVisibles("cifrado");
    expect(soloPriv.map((s) => s.id)).toEqual(["privacidad"]);
    expect(seccionesVisibles("telepatia").map((s) => s.id)).toEqual(["sincronia"]);
    expect(seccionesVisibles("capacidad").map((s) => s.id)).toEqual(["avanzado"]);
  });

  it("reinicioDeSeccion devuelve solo los campos de esa sección", () => {
    expect(reinicioDeSeccion("privacidad")).toEqual({
      privacidad: "privado",
      cifradoLocal: false,
      acceso: [],
    });
    expect(reinicioDeSeccion("sincronia")).toEqual({
      sync: { direccion: "ambas", auto: true, destinos: [] },
    });
    expect(reinicioDeSeccion("avanzado")).toEqual({
      medios: { capacidades: {}, almacenamiento: [] },
    });
    expect(reinicioDeSeccion("general")).toEqual({});
  });
});

describe("panel-ajustes-pilar · montaje y enlace directo", () => {
  it("abre en General y muestra el selector «Aplicar a»", () => {
    montar(
      <PanelAjustesPilar pilar="memoria" cerebro={cerebro} onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/Ajustes · Memorias/)).toBeInTheDocument();
    expect(screen.getByLabelText("Aplicar a")).toBeInTheDocument();
    for (const s of SECCIONES) {
      expect(screen.getByRole("button", { name: s.etiqueta })).toBeInTheDocument();
    }
  });

  it("el enlace directo ?ajustes=privacidad abre esa sección", () => {
    montar(
      <PanelAjustesPilar
        pilar="memoria"
        cerebro={cerebro}
        seccionInicial="privacidad"
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText("Privacidad")).toBeInTheDocument();
    expect(screen.getByText("Cifrado local")).toBeInTheDocument();
  });

  it("la búsqueda filtra las secciones visibles", () => {
    montar(
      <PanelAjustesPilar pilar="memoria" cerebro={cerebro} onOpenChange={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText("Buscar en los ajustes"), {
      target: { value: "cifrado" },
    });
    expect(screen.getByRole("button", { name: "Privacidad y permisos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Avanzado" })).toBeNull();
  });
});