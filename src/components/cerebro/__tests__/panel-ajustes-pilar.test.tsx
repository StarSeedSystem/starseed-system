import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import type { Brain } from "@/lib/brains/brains";
import PanelAjustesPilar, {
  SECCIONES_AJUSTES,
  ajustesDesdeBusqueda,
  buscarAjustes,
  enlaceAjustes,
  seccionAjustesDesdeUrl,
  type SeccionAjustes,
} from "../panel-ajustes-pilar";

expect.extend(matchers);
afterEach(cleanup);

vi.mock("@/lib/cerebro/memory-files", () => ({
  listMemoryFiles: vi.fn().mockResolvedValue([]),
}));

const cerebro: Brain = {
  id: "c1",
  owner: "u1",
  name: "Cerebro uno",
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

function montar(seccionInicial: SeccionAjustes) {
  return render(
    <AppearanceProvider>
      <ConfirmProvider>
        <PanelAjustesPilar open onOpenChange={() => {}} pilar="memoria" cerebro={cerebro} seccionInicial={seccionInicial} />
      </ConfirmProvider>
    </AppearanceProvider>,
  );
}

describe("catálogo de ajustes por pilar", () => {
  it("mantiene el orden General → Privacidad → Sincronía → Avanzado", () => {
    expect(SECCIONES_AJUSTES.map((s) => s.etiqueta)).toEqual([
      "General",
      "Privacidad y permisos",
      "Sincronía",
      "Avanzado",
    ]);
  });

  it("entiende el id, la etiqueta y los alias de la URL", () => {
    expect(seccionAjustesDesdeUrl("privacidad")).toBe("privacidad");
    expect(seccionAjustesDesdeUrl("seguridad")).toBe("privacidad");
    expect(seccionAjustesDesdeUrl("sincronización")).toBe("sincronia");
    expect(seccionAjustesDesdeUrl("no-existe")).toBeNull();
    expect(seccionAjustesDesdeUrl(null)).toBeNull();
  });

  it("busca por palabra dentro de los ajustes", () => {
    expect(buscarAjustes("telepatia")).toEqual(["sincronia"]);
    expect(buscarAjustes("cifrado")).toEqual(["privacidad"]);
    expect(buscarAjustes("almacenamiento")).toEqual(["general"]);
    expect(buscarAjustes("")).toEqual(["general", "privacidad", "sincronia", "avanzado"]);
    expect(buscarAjustes("zzz")).toEqual([]);
  });

  it("construye y lee el enlace directo ?tab=<pilar>&ajustes=<seccion>", () => {
    expect(enlaceAjustes("memoria", "privacidad")).toBe("?tab=memoria&ajustes=privacidad");
    expect(ajustesDesdeBusqueda("?tab=neuronas&ajustes=avanzado")).toEqual({ pilar: "neuronas", seccion: "avanzado" });
    expect(ajustesDesdeBusqueda("?tab=memoria&ajustes=no-existe")).toEqual({ pilar: "memoria", seccion: null });
  });
});

describe("PanelAjustesPilar", () => {
  it("monta las cuatro secciones y muestra la pedida", () => {
    montar("privacidad");
    expect(screen.getByRole("heading", { name: /Ajustes · Memorias/ })).toBeInTheDocument();
    for (const etiqueta of ["General", "Privacidad y permisos", "Sincronía", "Avanzado"]) {
      expect(screen.getByRole("button", { name: etiqueta })).toBeInTheDocument();
    }
    expect(screen.getByRole("region", { name: "Seguridad y privacidad" })).toBeInTheDocument();
  });

  it("abre la sección que pide el enlace directo", () => {
    const { seccion } = ajustesDesdeBusqueda("?tab=memoria&ajustes=sincronia");
    montar(seccion ?? "general");
    expect(screen.getByRole("region", { name: "Vinculación y sincronización" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronía" })).toHaveAttribute("aria-pressed", "true");
  });
});
