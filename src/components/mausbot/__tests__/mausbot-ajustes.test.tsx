import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MausbotAjustes } from "../mausbot-ajustes";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";
import { DISENOS_FABRICA } from "@/lib/mausbot/disenos";
import { leerConfigMausbot } from "@/lib/mausbot/config";
import { limpiarRegistro, registrarAtomo } from "@/lib/protomolecula/registro-atomos";

const OTRO_DISENO = DISENOS_FABRICA.find((d) => d.id !== "fabrica-cursor")!;

describe("MausbotAjustes", () => {
  beforeEach(() => { localStorage.clear(); limpiarRegistro(); });
  afterEach(() => { cleanup(); limpiarRegistro(); });

  it("cambiar el diseño de una personalidad lo guarda", async () => {
    const persona = listPersonalityProfiles()[0];
    render(<MausbotAjustes perfilId="p1" neuronaId="n1" />);
    fireEvent.change(await screen.findByLabelText(`Diseño para ${persona.name}`), { target: { value: OTRO_DISENO.id } });
    expect(leerConfigMausbot().porPersonalidad[persona.id]).toBe(OTRO_DISENO.id);
  });

  it("guarda en el perfil o en la neurona según el alcance elegido", async () => {
    const persona = listPersonalityProfiles()[0];
    render(<MausbotAjustes perfilId="perfil-7" neuronaId="neurona-9" />);
    fireEvent.click(screen.getByRole("button", { name: "Solo en este perfil" }));
    fireEvent.change(await screen.findByLabelText(`Diseño para ${persona.name}`), { target: { value: OTRO_DISENO.id } });
    expect(leerConfigMausbot().perfiles["perfil-7"].porPersonalidad?.[persona.id]).toBe(OTRO_DISENO.id);
    fireEvent.click(screen.getByRole("button", { name: "Solo en esta neurona" }));
    fireEvent.change(screen.getByLabelText(`Diseño para ${persona.name}`), { target: { value: "fabrica-cursor" } });
    expect(leerConfigMausbot().neuronas["neurona-9"].porPersonalidad?.[persona.id]).toBe("fabrica-cursor");
  });

  it("solo ofrece diseñar en la Protomolécula cuando el átomo existe", () => {
    render(<MausbotAjustes />);
    expect(screen.queryByRole("link", { name: /Diseñar en la Protomolécula/ })).toBeNull();
    cleanup();
    const atomo = {
      herramientaId: "mausbot", nombre: "Mausbot", categoria: "codigo" as const,
      integracion: "libreria-js" as const, control: "ninguno" as const,
      parametros: [], entradas: [], salidas: [],
    };
    expect(registrarAtomo(atomo)).toEqual({ ok: true });
    render(<MausbotAjustes />);
    expect(screen.getByRole("link", { name: /Diseñar en la Protomolécula/ }))
      .toHaveAttribute("href", "/protomolecula?atomo=mausbot");
  });
});
