import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CodeRunner } from "../code-runner";

afterEach(cleanup);

/* Escenas y código de apoyo para el veredicto de ManimGX en el ejecutor. */
const ESCENA_BUENA_3D = `from manim import ThreeDScene, Cube, Rotate, DEGREES, ORIGIN

class CuboGiratorio(ThreeDScene):
    def construct(self):
        cubo = Cube()
        self.set_camera_orientation(phi=75 * DEGREES, theta=30 * DEGREES)
        self.play(Rotate(cubo, angle=360 * DEGREES, about_point=ORIGIN))
`;

const ESCENA_MALA = `from manim import Scene
import subprocess
subprocess.run(["ls"])
class Malicioso(Scene):
    def construct(self):
        open("/etc/passwd")
`;

const PY_SIN_MANIM = `import collections

def cuanta(palabras):
    return collections.Counter(palabras)
`;

describe("CodeRunner · veredicto del contrato de escena de ManimGX", () => {
    it("un bloque de Python que es una escena de Manim válida se acepta, con su clase, sin ejecutarla", () => {
        render(<CodeRunner lang="python" code={ESCENA_BUENA_3D} />);
        const veredicto = screen.getByText(/Escena de ManimGX aceptada por el contrato/);
        expect(veredicto.textContent).toContain("CuboGiratorio");
        expect(screen.queryByText(/No pasa el contrato de escena/)).toBeNull();
    });

    it("una escena rechazada enseña los motivos y NO ofrece mandarla al backend soberano", () => {
        render(<CodeRunner lang="python" code={ESCENA_MALA} />);
        expect(screen.getByText(/No pasa el contrato de escena de ManimGX/)).toBeTruthy();
        expect(screen.getByText(/«open\(» abre archivos del disco/)).toBeTruthy();
        expect(screen.getByText(/«subprocess» lanza procesos/)).toBeTruthy();
        expect(screen.queryByRole("link", { name: /Terminal/ })).toBeNull();
    });

    it("un bloque de Python que no pinta ser escena de Manim no recibe veredicto", () => {
        render(<CodeRunner lang="python" code={PY_SIN_MANIM} />);
        expect(screen.queryByText(/Escena de ManimGX aceptada/)).toBeNull();
        expect(screen.queryByText(/No pasa el contrato de escena/)).toBeNull();
    });

    it("el veredicto es solo para bloques de Python: en shell no se aplica", () => {
        render(<CodeRunner lang="bash" code={ESCENA_BUENA_3D} />);
        expect(screen.queryByText(/Escena de ManimGX aceptada/)).toBeNull();
        expect(screen.queryByText(/No pasa el contrato/)).toBeNull();
    });
});
