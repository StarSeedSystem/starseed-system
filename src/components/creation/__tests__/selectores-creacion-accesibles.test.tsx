// @vitest-environment jsdom
/**
 * SP092940b · Patrón toggle accesible en los selectores de creación.
 *
 * Los lectores de pantalla deben saber qué está seleccionado en cada
 * selector del Lienzo: radios con aria-checked en selección única,
 * botones con aria-pressed en selección múltiple, y grupos con
 * role="radiogroup"/"group" y aria-label. Comprueba también que el
 * clic actualiza el estado anunciado.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { AppearanceProvider } from "@/context/appearance-context";

afterEach(cleanup);

const FALSOS = vi.hoisted(() => ({
    canales: [
        { id: "c-x", name: "Cuenta X", platform: "x" },
        { id: "c-mastodon", name: "Mastodon", platform: "mastodon" },
    ],
    carpetas: [
        { id: "f-poesia", name: "Poesía", parentId: null },
        { id: "f-ensayo", name: "Ensayo", parentId: null },
    ],
    carpetasGrupo: [{ id: "f-joint", name: "Cuadernos joint", parentId: null }],
}));

vi.mock("@/lib/os-social", () => ({
    fetchMyEntities: vi.fn(async () => ({ pages: [], groups: [] })),
}));

vi.mock("@/lib/library/entity-library", () => ({
    useMyLibraryDestinations: vi.fn(() => ({
        destinations: [
            { ref: { kind: "personal", id: "u1" }, label: "Mi biblioteca" },
            { ref: { kind: "group", id: "g9" }, label: "Biblioteca del grupo" },
        ],
        loading: false,
    })),
    useEntityLibrary: vi.fn((ref: { id: string } | null) => ({
        doc: { folders: ref?.id === "u1" ? FALSOS.carpetas : FALSOS.carpetasGrupo },
        loading: false,
    })),
}));

vi.mock("@/lib/integrations/registry", () => ({
    loadIntegrationConfig: vi.fn(() => ({ enabled: true, apiKey: "clave-de-prueba" })),
}));

vi.mock("@/lib/integrations/run", () => ({
    runIntegration: vi.fn(async () => ({ ok: true, data: { channels: FALSOS.canales } })),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

// ── datos falsos compartidos ─────────────────────────────────────────────────

import { DestSelector, TipoSelector, TagSelector } from "@/components/creation/creation-fields";
import { LibraryLocationPicker } from "@/components/creation/library-location-picker";
import { SocialCrosspost } from "@/components/creation/social-crosspost";

describe("DestSelector · radiogroup accesible", () => {
    it("anuncia el radiogroup y qué destino está marcado", () => {
        render(<DestSelector value="perfil" onChange={vi.fn()} />);

        const grupo = screen.getByRole("radiogroup", { name: "Destino de la publicación" });
        const radios = within(grupo).getAllByRole("radio");
        expect(radios.length).toBeGreaterThan(1);

        const perfilMarcado = within(grupo).getByRole("radio", { name: /Mi Perfil/ });
        expect(perfilMarcado).toHaveAttribute("aria-checked", "true");

        const otro = radios.find((r) => r !== perfilMarcado) as HTMLElement;
        expect(otro).toHaveAttribute("aria-checked", "false");
    });

    it("el clic cambia el radio anunciado", () => {
        const onChange = vi.fn();
        render(<DestSelector value="perfil" onChange={onChange} />);

        const grupo = screen.getByRole("radiogroup", { name: "Destino de la publicación" });
        const politica = within(grupo).getByRole("radio", { name: /Política/ });
        expect(politica).toHaveAttribute("aria-checked", "false");
        fireEvent.click(politica);
        expect(onChange).toHaveBeenCalledWith("politica");
    });
});

describe("TipoSelector · radiogroup accesible", () => {
    it("marca el tipo activo con aria-checked", () => {
        render(<TipoSelector dest="politica" value="votacion" onChange={vi.fn()} />);

        const grupo = screen.getByRole("radiogroup", { name: "Tipo" });
        const votacion = within(grupo).getByRole("radio", { name: "Votación" });
        expect(votacion).toHaveAttribute("aria-checked", "true");

        for (const radio of within(grupo).getAllByRole("radio")) {
            expect(radio).toHaveAttribute("role", "radio");
        }
    });
});

describe("TagSelector · chips con aria-pressed", () => {
    it("anuncia las etiquetas seleccionadas con aria-pressed", () => {
        render(<TagSelector dest="politica" value={["propuesta"]} onChange={vi.fn()} />);

        const propuesta = screen.getByRole("button", { name: /Propuesta/ });
        expect(propuesta).toHaveAttribute("aria-pressed", "true");
    });

    it("el clic alterna aria-pressed", () => {
        const onChange = vi.fn();
        render(<TagSelector dest="politica" value={[]} onChange={onChange} />);

        const etiqueta = screen.getByRole("button", { name: /Propuesta/ });
        fireEvent.click(etiqueta);
        expect(onChange).toHaveBeenCalledWith(["propuesta"]);
    });
});

describe("LibraryLocationPicker · biblioteca y folder como radios", () => {
    it("anuncia qué biblioteca y qué folder están marcados", () => {
        render(<LibraryLocationPicker value={null} onChange={vi.fn()} />);

        const bibs = screen.getByRole("radiogroup", { name: "Biblioteca" });
        const miBib = within(bibs).getByRole("radio", { name: /Mi biblioteca/ });
        const bibGrupo = within(bibs).getByRole("radio", { name: /Biblioteca del grupo/ });
        expect(miBib).toHaveAttribute("aria-checked", "true");
        expect(bibGrupo).toHaveAttribute("aria-checked", "false");

        const folders = screen.getByRole("radiogroup", { name: "Folder destino" });
        const raiz = within(folders).getByRole("radio", { name: /Raíz de la biblioteca/ });
        expect(raiz).toHaveAttribute("aria-checked", "true");
        const poesia = within(folders).getByRole("radio", { name: /Poesía/ });
        expect(poesia).toHaveAttribute("aria-checked", "false");
    });

    it("el clic marca el folder elegido y avisa el cambio", () => {
        const onChange = vi.fn();
        render(<LibraryLocationPicker value={null} onChange={onChange} />);

        const folders = screen.getByRole("radiogroup", { name: "Folder destino" });
        const ensayo = within(folders).getByRole("radio", { name: /Ensayo/ });
        expect(ensayo).toHaveAttribute("aria-checked", "false");
        fireEvent.click(ensayo);
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ folderId: "f-ensayo", folderLabel: "Ensayo" }),
        );
    });
});

describe("SocialCrosspost · canales con aria-pressed", () => {
    it("anuncia el grupo de canales y qué canal está activado", async () => {
        render(
            <AppearanceProvider>
                <SocialCrosspost getText={() => "Hola mundo"} />
            </AppearanceProvider>,
        );

        const grupo = await screen.findByRole("group", { name: "Canales externos" });
        const cuentaX = within(grupo).getByRole("button", { name: /Cuenta X/ });
        expect(cuentaX).toHaveAttribute("aria-pressed", "false");

        fireEvent.click(cuentaX);
        expect(cuentaX).toHaveAttribute("aria-pressed", "true");
    });
});
