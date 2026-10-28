/**
 * Pruebas de `MausbotAjustes` y de su lógica pura: el alcance del cambio (cuenta ›
 * perfil › neurona), el gauge de diseños por personalidad (lo guarda) y del nivel
 * `aplicar` con su aviso. Sin red, sin disco y sin `route.ts` (reglas del repo).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ATOMO_MAUSBOT, hayAtomoMausbot, MausbotAjustes, parcheAjusteMausbot } from "../mausbot-ajustes";
import { normalizarConfigMausbot, CONFIG_MAUSBOT_DEFECTO, CLAVE_MAUSBOT, leerConfigMausbot, type ConfigMausbot } from "@/lib/mausbot/config";
import { CLAVE_DISENOS, DISENOS_FABRICA } from "@/lib/mausbot/disenos";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";

const cfg = (extras: Partial<ConfigMausbot> = {}): ConfigMausbot =>
  normalizarConfigMausbot({ ...CONFIG_MAUSBOT_DEFECTO, ...extras });

beforeEach(() => {
  window.localStorage.removeItem(CLAVE_MAUSBOT);
  window.localStorage.removeItem(CLAVE_DISENOS);
});

describe("parcheAjusteMausbot · el alcance del cambio", () => {
  const base = cfg({ porPersonalidad: { aurora: "v1" }, perfiles: { p1: { encendido: true } } });

  it("en la cuenta fusiona porPersonalidad sin pisar a los demás y conserva lo ausente", () => {
    const p = parcheAjusteMausbot(base, "cuenta", {}, { porPersonalidad: { nueva: "v2" }, modo: "cursor" });
    expect(p.porPersonalidad).toEqual({ aurora: "v1", nueva: "v2" });
    expect(p.modo).toBe("cursor");
    expect(p.perfiles).toBeUndefined();
  });

  it("en una capa escribe solo esa entrada y sin id no escribe nada", () => {
    const p = parcheAjusteMausbot(base, "perfil", { perfilId: "p1" }, { porPersonalidad: { nueva: "v2" } });
    expect(p.perfiles?.p1?.porPersonalidad).toEqual({ nueva: "v2" });
    expect(p.neuronas).toBeUndefined();
    const n = parcheAjusteMausbot(base, "neurona", { neuronaId: "n1" }, { actuar: "aplicar" });
    expect(n.neuronas?.n1?.actuar).toBe("aplicar");
    expect(parcheAjusteMausbot(base, "perfil", {}, { encendido: true })).toEqual({});
    expect(parcheAjusteMausbot(base, "neurona", {}, { encendido: true })).toEqual({});
  });

  it("fusiona con lo que la capa ya tenía en porPersonalidad", () => {
    const conCapa = cfg({ perfiles: { p1: { porPersonalidad: { aurora: "v0" } } } });
    const p = parcheAjusteMausbot(conCapa, "perfil", { perfilId: "p1" }, { porPersonalidad: { b: "v2" } });
    expect(p.perfiles?.p1?.porPersonalidad).toEqual({ aurora: "v0", b: "v2" });
  });
});

describe("hayAtomoMausbot · la puerta del botón de la Protomolécula", () => {
  it("responde sí con el átomo registrado y no sin él", () => {
    expect(hayAtomoMausbot(() => undefined, [])).toBe(false);
    expect(hayAtomoMausbot(() => ({ herramientaId: ATOMO_MAUSBOT }), [])).toBe(true);
    expect(hayAtomoMausbot(() => undefined, [{ herramientaId: ATOMO_MAUSBOT }])).toBe(true);
  });
});

describe("MausbotAjustes (panel)", () => {
  const personalidad = listPersonalityProfiles()[0];

  it("el cambio de diseño de una personalidad se guarda y queda visible", () => {
    expect(personalidad).toBeTruthy();
    const otro = DISENOS_FABRICA.find((d) => d.id !== "fabrica-cursor");
    expect(otro).toBeTruthy();
    render(<MausbotAjustes />);
    const sel = screen.getByTestId(`mausbot-diseno-${personalidad.id}`) as HTMLSelectElement;
    expect(sel.value).toBe("fabrica-cursor");
    fireEvent.change(sel, { target: { value: otro!.id } });
    expect(leerConfigMausbot().porPersonalidad[personalidad.id]).toBe(otro!.id);
    expect((screen.getByTestId(`mausbot-diseno-${personalidad.id}`) as HTMLSelectElement).value).toBe(otro!.id);
    cleanup();
  });

  it("el alcance «solo en este perfil» escribe en perfiles y deja la cuenta intacta", () => {
    const otro = DISENOS_FABRICA.find((d) => d.id !== "fabrica-cursor")!;
    render(<MausbotAjustes perfilId="perfil-x" nombrePerfil="Mac" />);
    fireEvent.click(screen.getByTestId("mausbot-destino-perfil"));
    fireEvent.change(screen.getByTestId(`mausbot-diseno-${personalidad.id}`), { target: { value: otro.id } });
    const g = leerConfigMausbot();
    expect(g.perfiles["perfil-x"]?.porPersonalidad?.[personalidad.id]).toBe(otro.id);
    expect(g.porPersonalidad[personalidad.id]).toBeUndefined();
    cleanup();
  });

  it("el encendido viene apagado y el nivel «aplicar» guarda y avisa de los clics", () => {
    render(<MausbotAjustes />);
    const caja = screen.getByTestId("mausbot-encendido") as HTMLInputElement;
    expect(caja.checked).toBe(false);
    fireEvent.click(caja);
    expect(leerConfigMausbot().encendido).toBe(true);
    expect(leerConfigMausbot().actuar).toBe("proponer");
    fireEvent.click(screen.getByTestId("mausbot-nivel-aplicar"));
    expect(leerConfigMausbot().actuar).toBe("aplicar");
    expect(screen.getByTestId("mausbot-aviso-aplicar")).toBeInTheDocument();
    cleanup();
  });

  it("sin perfil ni neurona el alcance solo ofrece la cuenta", () => {
    render(<MausbotAjustes />);
    expect(screen.getByTestId("mausbot-destino-cuenta")).toBeInTheDocument();
    expect(screen.queryByTestId("mausbot-destino-perfil")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mausbot-destino-neurona")).not.toBeInTheDocument();
    cleanup();
  });
});
