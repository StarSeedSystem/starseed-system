import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { PanelTeToca } from "../panel-te-toca";

describe("PanelTeToca", () => {
    afterEach(() => {
        cleanup();
    });

    it("anuncia las acciones que esperan a Maggasukha, no a Alex", () => {
        render(<PanelTeToca acciones={[]} alCerrar={() => {}} alCambiar={() => {}} />);
        const panel = screen.getByTestId("panel-te-toca");
        expect(panel).toHaveAttribute("aria-label", "Acciones que esperan a Maggasukha");
        expect(panel.getAttribute("aria-label")).not.toContain("Alex");
    });
});
