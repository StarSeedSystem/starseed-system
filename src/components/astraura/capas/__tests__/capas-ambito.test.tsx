// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapasAmbito, type AlmacenCapasAmbito } from "../capas-ambito";
import { resolverAmbito } from "@/lib/astraura/capas/ambito";

const perfil = resolverAmbito({ ambito: {
  coleccionMemoria: "memoria del huerto",
  adaptador: "needle-huerto",
  aprende: true,
  comparteCon: "ambito",
} });

let guardar: ReturnType<typeof vi.fn>;
let almacen: AlmacenCapasAmbito;

beforeEach(() => {
  guardar = vi.fn().mockResolvedValue(null);
  almacen = { leer: vi.fn().mockResolvedValue(null), guardar };
});

afterEach(cleanup);

describe("CapasAmbito", () => {
  it("muestra todas las opciones y guarda el perfil en entity_state", () => {
    render(<CapasAmbito nombre="Huerto común"
      ambito={{ tipo: "grupo", id: "huerto" }}
      persona={{ id: "ana", rol: "admin" }} gobierno="jerarquico"
      perfilInicial={perfil} almacen={almacen} />);

    expect(screen.getByText("Capas de Huerto común")).toBeTruthy();
    expect(screen.getByLabelText("Capas preferidas").children).toHaveLength(6);
    expect(screen.getByDisplayValue("memoria del huerto")).toBeTruthy();
    expect(screen.getByDisplayValue("needle-huerto")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Compartir aprendizaje" })).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Colección de memoria" }),
      { target: { value: "memoria viva" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar ajustes" }));
    expect(guardar).toHaveBeenCalledWith(
      { kind: "group", id: "huerto" },
      "astraura:capas-ambito",
      expect.objectContaining({ coleccionMemoria: "memoria viva" }),
    );
  });

  it("avisa y solicita votación en un ámbito democrático", () => {
    const votar = vi.fn();
    render(<CapasAmbito nombre="Comunidad Sur"
      ambito={{ tipo: "comunidad", id: "sur" }}
      persona={{ id: "ana", rol: "owner" }} gobierno="democratico"
      perfilInicial={perfil} almacen={almacen} alRequerirVotacion={votar} />);

    expect(screen.getByRole("status").textContent).toContain("necesita una votación");
    fireEvent.click(screen.getByRole("button", { name: "Guardar ajustes" }));
    expect(votar).toHaveBeenCalledWith(perfil);
    expect(guardar).not.toHaveBeenCalled();
  });

  it("solo deja a una persona no administradora apagar su aprendizaje", () => {
    render(<CapasAmbito nombre="Perfil de Ana"
      ambito={{ tipo: "personal", id: "ana" }}
      persona={{ id: "ana", rol: "member" }} gobierno="democratico"
      perfilInicial={perfil} almacen={almacen} />);

    expect((screen.getByRole("button", { name: "Guardar ajustes" }) as HTMLButtonElement).disabled).toBe(true);
    const aprender = screen.getByRole("checkbox", { name: "Aprender de las correcciones" });
    expect((aprender as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(aprender);
    expect(guardar).toHaveBeenCalledWith(
      { kind: "profile", id: "ana" },
      "astraura:capas-ambito",
      expect.objectContaining({ aprende: false }),
    );
  });
});
