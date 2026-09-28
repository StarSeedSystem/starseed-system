// @vitest-environment jsdom
/**
 * TarjetaLlamada — cómo se ve una llamada en el chat en cada estado. La presencia y las
 * acciones van mockeadas: aquí se prueba la interfaz, no la red.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaPresencia } from "@/lib/llamadas/tipos";
import type { DmAttachment } from "@/lib/messages/dm";

const h = vi.hoisted(() => ({
    presentes: null as MetaPresencia[] | null,
    unirse: vi.fn(async () => null as string | null),
    minimizar: vi.fn(),
}));

vi.mock("@/lib/llamadas/use-presencia", () => ({
    usePresentesLlamada: () => h.presentes,
    useEnPantalla: () => true,
}));

vi.mock("@/lib/llamadas/acciones", () => ({
    unirseALlamada: h.unirse,
    minimizarLlamada: h.minimizar,
}));

import { TarjetaLlamada } from "@/components/llamadas/tarjeta-llamada";

const ID = "3f1c2a9e-7b1d-4c3e-9f00-1234567890ab";

function meta(id: string, nombre: string): MetaPresencia {
    return { id, uid: id.split(":")[0], nombre, avatar: null, invitado: false, micro: true, camara: false, pantalla: false, unido: 1 };
}

function adjunto(extra: Record<string, unknown> = {}, haceMs = 5_000, tipo = "video") {
    return {
        kind: "llamada",
        tipoLlamada: tipo,
        sesionId: ID,
        route: `/llamada/${ID}`,
        name: "Llamada de vídeo",
        iniciada: new Date(Date.now() - haceMs).toISOString(),
        ...extra,
    };
}

beforeEach(() => {
    h.presentes = null;
    h.unirse.mockClear();
    h.minimizar.mockClear();
});

afterEach(() => cleanup());

describe("TarjetaLlamada", () => {
    it("sonando: lo dice y deja unirse", () => {
        render(<TarjetaLlamada adjunto={adjunto()} mio={false} />);
        expect(screen.getByText("Llamada de vídeo")).toBeInTheDocument();
        expect(screen.getByText("Sonando…")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Unirse a la llamada de vídeo/ })).toBeInTheDocument();
    });

    it("quien llama ve «Llamando…»", () => {
        render(<TarjetaLlamada adjunto={adjunto()} mio />);
        expect(screen.getByText("Llamando…")).toBeInTheDocument();
    });

    it("en curso: cuenta personas dentro y [Unirse] entra en la llamada", () => {
        h.presentes = [meta("a:1", "Ana"), meta("b:1", "Luis"), meta("c:1", "Eva")];
        render(<TarjetaLlamada adjunto={adjunto({}, 10 * 60_000)} mio={false} />);
        expect(screen.getByText("En curso · 3 personas")).toBeInTheDocument();
        expect(screen.getByLabelText("Dentro: Ana, Luis, Eva")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Unirse/ }));
        expect(h.unirse).toHaveBeenCalledWith(expect.objectContaining({ sesionId: ID, tipo: "video", camara: true }));
    });

    it("terminada: enseña la duración y ya no ofrece unirse", () => {
        render(
            <TarjetaLlamada
                adjunto={adjunto({ fin: new Date().toISOString(), duracionMs: 12 * 60_000, contestada: true }, 20 * 60_000)}
                mio
            />,
        );
        expect(screen.getByRole("status")).toHaveTextContent("Terminada · 12 min");
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("perdida para quien la recibe, sin respuesta para quien llamó", () => {
        const a = adjunto({ fin: new Date().toISOString(), contestada: false }, 70_000, "audio");
        const { unmount } = render(<TarjetaLlamada adjunto={a} mio={false} />);
        expect(screen.getByRole("status")).toHaveTextContent("Perdida");
        unmount();
        render(<TarjetaLlamada adjunto={a} mio />);
        expect(screen.getByRole("status")).toHaveTextContent("Sin respuesta");
        expect(screen.getByText("Llamada de voz")).toBeInTheDocument();
    });

    it("pasado el timbre y sin nadie dentro: finalizada", () => {
        h.presentes = [];
        render(<TarjetaLlamada adjunto={adjunto({}, 5 * 60_000)} mio={false} />);
        expect(screen.getByRole("status")).toHaveTextContent("Finalizada");
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("un adjunto roto se pinta como una llamada genérica, sin romper el chat", () => {
        const roto = { kind: "llamada", sesionId: "../x" } as unknown as DmAttachment;
        render(<TarjetaLlamada adjunto={roto} mio={false} />);
        expect(screen.getByText("Llamada")).toBeInTheDocument();
    });
});
