import { describe, it, expect } from "vitest";
import { getSandboxAttributes, SANDBOX_CAPABILITIES } from "../sandbox-config";

describe("sandbox-config", () => {
    describe("getSandboxAttributes", () => {
        it("returns the hardened sandbox string without allow-popups", () => {
            const sandbox = getSandboxAttributes();
            expect(sandbox).toBe("allow-scripts allow-modals");
        });

        it("does not contain allow-popups", () => {
            const sandbox = getSandboxAttributes();
            expect(sandbox).not.toContain("allow-popups");
        });

        it("does not contain allow-same-origin", () => {
            const sandbox = getSandboxAttributes();
            expect(sandbox).not.toContain("allow-same-origin");
        });

        it("contains allow-scripts for code execution", () => {
            const sandbox = getSandboxAttributes();
            expect(sandbox).toContain("allow-scripts");
        });

        it("contains allow-modals for alert/confirm/prompt", () => {
            const sandbox = getSandboxAttributes();
            expect(sandbox).toContain("allow-modals");
        });
    });

    describe("SANDBOX_CAPABILITIES", () => {
        it("documents the granted capabilities", () => {
            expect(SANDBOX_CAPABILITIES).toEqual(
                expect.arrayContaining([
                    "allow-scripts: permite ejecutar JavaScript en el iframe",
                    "allow-modals: permite alert(), confirm(), prompt()",
                ])
            );
        });

        it("documents that allow-popups is explicitly denied", () => {
            expect(SANDBOX_CAPABILITIES).toEqual(
                expect.arrayContaining([
                    "allow-popups: DENEGADO — previene phishing y redirecciones no deseadas",
                ])
            );
        });

        it("documents that allow-same-origin is explicitly denied", () => {
            expect(SANDBOX_CAPABILITIES).toEqual(
                expect.arrayContaining([
                    "allow-same-origin: DENEGADO — origen opaco, sin acceso a cookies/localStorage/sesión",
                ])
            );
        });
    });
});