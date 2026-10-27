/**
 * SP092940b (2026-10-27): los selectores toggle del Centro de Creación no
 * anunciaban su estado a lectores de pantalla ni siquiera antes de actos
 * irreversibles (cirospost a redes externas). El patrón correcto ya existía en
 * TagSelector (aria-pressed); este test exige el patrón unificado:
 *   · lista de opción única y siempre marcada → role="radiogroup" + role="radio"
 *     con aria-checked en cada opción;
 *   · chips multi-selección o con des-selección → role="group" + aria-pressed.
 */
import { fireEvent, render, screen, cleanup, within } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

import { AppearanceProvider } from "@/context/appearance-context";

import {
    DestSelector,
    TipoSelector,
    TagSelector,
    type OwnEntityOption,
} from "../creation-fields";
import { LibraryLocationPicker, type LibraryLocation } from "../library-location-picker";
import { SocialCrosspost } from "../social-crosspost";

expect.extend(matchers);

vi.mock("@/lib/os-social", () => ({
    fetchMyEntities: vi.fn().mockResolvedValue({
        pages: [{ slug: "mi-sala", name: "Mi Sala", kind: "sala" }],
        groups: [],
    }),
}));

vi.mock("@/lib/library/entity-library", () => ({
    useMyLibraryDestinations: () => ({
        destinations: [{ ref: { kind: "user", id: "cuenta" }, label: "Mi biblioteca" }],
        loading: false,
    }),
    useEntityLibrary: () => ({
        doc: {
            folders: [
                { id: "f1", name: "Ideas", parentId: null, createdAt: "2026-01-01", createdBy: "yo" },
            ],
            items: [],
        },
        loading: false,
    }),
}));

vi.mock("@/lib/integrations/registry", () => ({
    loadIntegrationConfig: vi.fn().mockReturnValue({ enabled: true, apiKey: "clave-de-prueba" }),
}));

vi.mock("@/lib/integrations/run", () => ({
    runIntegration: vi.fn().mockResolvedValue({
        ok: true,
        data: { channels: [{ id: "c1", name: "Canal Uno", platform: "x", disabled: false }] },
    }),
}));

afterEach(cleanup);

describe("DestSelector · radiogroup de destino", () => {
    const dests: Array<"perfil" | "biblioteca"> = ["perfil", "biblioteca"];

    it("anuncia qué destino está marcado con aria-checked", () => {
        render(<DestSelector value="perfil" onChange={() => {}} dests={dests} />);
        const grupo = screen.getByRole("radiogroup", { name: "Destino de la publicación" });
        const perfil = within(grupo).getByRole("radio", { name: /Mi Perfil/ });
        const biblioteca = within(grupo).getByRole("radio", { name: /Biblioteca/ });
        expect(perfil).toHaveAttribute("aria-checked", "true");
        expect(biblioteca).toHaveAttribute("aria-checked", "false");
    });

    it("los botones son radio de verdad, no botones sueltos sin estado", () => {
        render(<DestSelector value="biblioteca" onChange={() => {}} dests={dests} />);
        const biblioteca = screen.getByRole("radio", { name: /Biblioteca/ });
        expect(biblioteca).toHaveAttribute("aria-checked", "true");
        expect(screen.getAllByRole("radio")).toHaveLength(2);
    });

    it("cambiar de destino es visible para el lector (radio actúa como tal)", () => {
        const onChange = vi.fn();
        render(<DestSelector value="perfil" onChange={onChange} dests={dests} />);
        fireEvent.click(screen.getByRole("radio", { name: /Biblioteca/ }));
        expect(onChange).toHaveBeenCalledWith("biblioteca");
    });
});

describe("DestSelector · entidad propia", () => {
    function montar(onOwnChange: (own: OwnEntityOption | null) => void) {
        return render(
            <DestSelector
                value="propia"
                onChange={() => {}}
                dests={["propia"]}
                ownValue={null}
                onOwnChange={onOwnChange}
            />,
        );
    }

    it("los chips de página/grupo propia son group con aria-pressed (se pueden des-seleccionar)", async () => {
        montar(() => {});
        await screen.findByRole("group", { name: "Selecciona página o grupo propio" });
        const grupo = screen.getByRole("group", { name: "Selecciona página o grupo propio" });
        const chip = within(grupo).getByRole("button", { name: /Mi Sala/ });
        expect(chip).toHaveAttribute("aria-pressed", "false");
    });

    it("pulsar el chip activo lo des-selecciona (por eso no es radio)", async () => {
        const onOwnChange = vi.fn();
        render(
            <DestSelector
                value="propia"
                onChange={() => {}}
                dests={["propia"]}
                ownValue={{ entityType: "page", entitySlug: "mi-sala", name: "Mi Sala", kind: "sala" }}
                onOwnChange={onOwnChange}
            />,
        );
        const chip = await screen.findByRole("button", { name: /Mi Sala/ });
        expect(chip).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(chip);
        expect(onOwnChange).toHaveBeenCalledWith(null);
    });
});

describe("TipoSelector · radiogroup de tipo", () => {
    it("anuncia el tipo marcado y el grupo con su etiqueta", () => {
        render(<TipoSelector dest="politica" value="propuesta" onChange={() => {}} />);
        const grupo = screen.getByRole("radiogroup", { name: "Tipo de contenido" });
        const propuesta = within(grupo).getByRole("radio", { name: /Propuesta/ });
        expect(propuesta).toHaveAttribute("aria-checked", "true");
        const votacion = within(grupo).getByRole("radio", { name: /Votación/ });
        expect(votacion).toHaveAttribute("aria-checked", "false");
    });

    it("elegir otro tipo pasa su id al padre", () => {
        const onChange = vi.fn();
        render(<TipoSelector dest="politica" value="propuesta" onChange={onChange} />);
        fireEvent.click(screen.getByRole("radio", { name: /Votación/ }));
        expect(onChange).toHaveBeenCalledWith("votacion");
    });
});

describe("TagSelector · patrón de referencia", () => {
    it("los chips multi-selección están unificados sobre aria-pressed", () => {
        const onChange = vi.fn();
        render(<TagSelector dest="cultura" value={["obra"]} onChange={onChange} />);
        const obra = screen.getByRole("button", { name: /Obra/ });
        expect(obra).toHaveAttribute("aria-pressed", "true");
        const general = screen.getByRole("button", { name: /General/ });
        expect(general).toHaveAttribute("aria-pressed", "false");
        fireEvent.click(general);
        expect(onChange).toHaveBeenCalledWith(["obra", "general"]);
    });
});

describe("LibraryLocationPicker · radiogroups de biblioteca y folder", () => {
    const raiz: LibraryLocation = {
        ref: { kind: "user", id: "cuenta" },
        libraryLabel: "Mi biblioteca",
        folderId: null,
    };

    it("la biblioteca marcada y la raíz se anuncian con aria-checked", () => {
        render(<LibraryLocationPicker value={raiz} onChange={() => {}} />);
        const grupoBiblio = screen.getByRole("radiogroup", { name: "Biblioteca destino" });
        const miBiblioteca = within(grupoBiblio).getByRole("radio", { name: /Mi biblioteca/ });
        expect(miBiblioteca).toHaveAttribute("aria-checked", "true");
        const grupoFolders = screen.getByRole("radiogroup", { name: "Folder destino" });
        const raizRadio = within(grupoFolders).getByRole("radio", { name: /Raíz de la biblioteca/ });
        expect(raizRadio).toHaveAttribute("aria-checked", "true");
        const ideas = within(grupoFolders).getByRole("radio", { name: /Ideas/ });
        expect(ideas).toHaveAttribute("aria-checked", "false");
    });

    it("elegir un folder pasa ubicación completa (referencia + folder, sin duplicar el contenido)", () => {
        const onChange = vi.fn();
        render(<LibraryLocationPicker value={raiz} onChange={onChange} />);
        fireEvent.click(screen.getByRole("radio", { name: /Ideas/ }));
        expect(onChange).toHaveBeenCalledWith({
            ref: { kind: "user", id: "cuenta" },
            libraryLabel: "Mi biblioteca",
            folderId: "f1",
            folderLabel: "Ideas",
        });
    });
});

describe("SocialCrosspost · chips de canal antes de un acto irreversible", () => {
    it("cada canal anuncia con aria-pressed si va a salir fuera de la red", async () => {
        render(
            <AppearanceProvider>
                <SocialCrosspost getText={() => "hola mundo"} />
            </AppearanceProvider>,
        );
        const grupo = await screen.findByRole("group", { name: "Canales donde publicar" });
        const chip = within(grupo).getByRole("button", { name: /Canal Uno/ });
        expect(chip).toHaveAttribute("aria-pressed", "false");
        fireEvent.click(chip);
        expect(chip).toHaveAttribute("aria-pressed", "true");
    });
});
