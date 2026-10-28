import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MausbotAvatar } from "../mausbot-avatar";
import { DISENOS_FABRICA } from "@/lib/mausbot/disenos";

describe("MausbotAvatar", () => {
  afterEach(() => {
    cleanup();
  });

  it("pinta el cuerpo pedido", () => {
    const diseno = DISENOS_FABRICA.find((d) => d.cuerpo === "circle");
    expect(diseno).toBeDefined();
    const { getByTestId } = render(<MausbotAvatar diseno={diseno!} estado="idle" />);
    const svg = getByTestId("mausbot-avatar");
    expect(svg).toBeInTheDocument();
    expect(svg.getAttribute("data-cuerpo")).toBe("circle");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("cambia los ojos con el estado", () => {
    const diseno = DISENOS_FABRICA.find((d) => d.cuerpo === "cursor");
    expect(diseno).toBeDefined();
    const { getByTestId } = render(<MausbotAvatar diseno={diseno!} estado="idle" />);
    const ojosIdle = getByTestId("mausbot-ojos");
    const pathsIdle = ojosIdle.querySelectorAll("path");
    expect(pathsIdle.length).toBeGreaterThan(0);
    cleanup();
    const { getByTestId: getByTestId2 } = render(<MausbotAvatar diseno={diseno!} estado="angry" />);
    const ojosAngry = getByTestId2("mausbot-ojos");
    const pathsAngry = ojosAngry.querySelectorAll("path");
    expect(pathsAngry.length).toBeGreaterThan(0);
  });
});
