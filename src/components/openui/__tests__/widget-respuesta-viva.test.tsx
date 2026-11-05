import { describe, it, expect } from "vitest";

// Módulo puro, sin imports de Node
export const formatWidgetTitle = (title: string) => title.toUpperCase();

describe("widget-respuesta-viva", () => {
    it("debería funcionar", () => {
        expect(formatWidgetTitle("test")).toBe("TEST");
    });
});
