import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

// Rescate RTRLB1020N · casos de la rama nube/40126871156 adaptados a la API de hoy:
// OSWindow abre SIEMPRE centrada (flex del portal) y se arrastra por la cabecera.
// La variante «hoja» de teléfono de la rama nunca entró en main → no se prueba.

/** La ventana del OS, portada igual que un anfitrión real (a document.body). */
function abrir(title = "Muestra") {
    return render(
        <OSWindow title={title} icon={Sparkles} accent="#22d3ee" onClose={() => {}}>
            <p>contenido</p>
        </OSWindow>,
    );
}

const dialogo = () => screen.getByRole("dialog");
/* El marco animado: primer hijo del envoltorio de arrastre centrado. */
const marco = (vista: ReturnType<typeof abrir>) =>
    vista.container.querySelector<HTMLElement>('[role="dialog"] div.relative > div') as HTMLElement;

describe("OSWindow · apertura centrada y arrastre (rescate RTRLB1020N)", () => {
    afterEach(() => cleanup());

    it("en escritorio la ventana abre centrada, sin anclaje de hoja", () => {
        const vista = abrir();
        const transf = marco(vista).style.transform;
        expect(marco(vista).style.opacity).toBe("0");
        expect(transf).toContain("scale(0.96)");
        expect(transf).not.toMatch(/translateY\((?!0px)/);
    });

    it("el arrastre por la cabecera sigue funcionando tras el anclaje", () => {
        const vista = abrir();
        const cabecera = screen.getByText("Muestra").closest("header") as HTMLElement;
        const envoltorio = vista.container.querySelector<HTMLElement>('[role="dialog"] div.relative') as HTMLElement;
        fireEvent.pointerDown(cabecera, { clientX: 100, clientY: 100 });
        fireEvent(window, new MouseEvent("pointermove", { clientX: 128, clientY: 60, bubbles: true }));
        fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
        expect(envoltorio.style.transform).toContain("translate(28px, -40px)");
    });
});
