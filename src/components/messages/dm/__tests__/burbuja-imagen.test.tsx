// @vitest-environment jsdom
/**
 * Una imagen adjunta cuya URL ya no existe (proyecto de Supabase antiguo) nunca se ve como un
 * icono roto: se sustituye por una tarjeta con su nombre y un aviso claro.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const adjuntos = vi.hoisted(() => ({ urlVigenteAdjunto: vi.fn((u?: string | null) => u ?? undefined) }));
vi.mock("@/lib/mensajeria/adjuntos", () => adjuntos);
vi.mock("@/components/messages/rico/mensaje-formateado", () => ({ MensajeFormateado: ({ textoPlano }: { textoPlano: string }) => <p>{textoPlano}</p>, superficiePropia: () => false }));
vi.mock("@/components/llamadas/tarjeta-llamada", () => ({ TarjetaLlamada: () => <div>llamada</div> }));
vi.mock("@/components/messages/vivo/tarjeta-vivo", () => ({ TarjetaVivo: () => <div>vivo</div> }));
vi.mock("@/components/aurora/message-renderer", () => ({ MessageRenderer: ({ text }: { text: string }) => <p>{text}</p> }));
vi.mock("@/components/library/save-to-library", () => ({ SaveToLibrary: () => null }));
vi.mock("@/components/files/universal-attachment-view", () => ({ UniversalAttachmentView: () => null, isInviteLike: () => false, isNetworkRefLike: () => false }));
vi.mock("@/components/files/file-preview", () => ({ FilePreview: () => null }));
vi.mock("@/components/profile/foto-con-marco", () => ({ FotoConMarco: () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true, usePrompt: () => async () => null }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={String(href)}>{children}</a> }));

import { MessageBubble } from "@/components/messages/dm/message-bubble";
import type { DmMessage } from "@/lib/messages/dm";

const AVISO = "Esta imagen ya no está disponible en el almacenamiento";

const mensaje = (over: Partial<DmMessage> = {}): DmMessage => ({
    id: "m1",
    threadId: "h1",
    sender: "ana",
    body: "",
    attachments: [{ kind: "image", name: "atardecer.jpg", url: "https://viejo.supabase.co/storage/v1/object/public/os-files/a.jpg" }],
    replyTo: null,
    kind: "user",
    editedAt: null,
    deleted: false,
    createdAt: "2026-09-28T10:00:00.000Z",
    formato: null,
    ...over,
});

const pintar = (m: DmMessage) =>
    render(
        <MessageBubble
            message={m}
            isMine={false}
            sender={null}
            senderName="Ana"
            replyToMessage={null}
            isAgentThread={false}
            onReply={() => {}}
            onEdit={async () => {}}
            onDelete={async () => {}}
        />,
    );

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("MessageBubble · imágenes que ya no existen", () => {
    it("usa la URL vigente y, si falla la carga, enseña la tarjeta de reserva (sin <img> roto)", () => {
        adjuntos.urlVigenteAdjunto.mockImplementation((u?: string | null) => (u ? u.replace("viejo", "nuevo") : undefined));
        const { container } = pintar(mensaje());
        const img = container.querySelector("img");
        expect(img?.getAttribute("src")).toContain("nuevo.supabase.co");
        fireEvent.error(img!);
        expect(container.querySelector("img")).toBeNull();
        expect(screen.getByText(AVISO)).toBeTruthy();
        expect(screen.getByText("atardecer.jpg")).toBeTruthy();
        expect(screen.getByRole("img", { name: /atardecer\.jpg/ })).toBeTruthy();
    });

    it("sin URL utilizable, la tarjeta aparece directamente", () => {
        adjuntos.urlVigenteAdjunto.mockReturnValue(undefined);
        const { container } = pintar(mensaje());
        expect(container.querySelector("img")).toBeNull();
        expect(screen.getByText(AVISO)).toBeTruthy();
    });

    it("con la carga de multimedia en «al tocar», no descarga hasta que se pide", () => {
        adjuntos.urlVigenteAdjunto.mockImplementation((u?: string | null) => u ?? undefined);
        const { container } = render(
            <MessageBubble
                message={mensaje()}
                isMine
                sender={null}
                replyToMessage={null}
                isAgentThread={false}
                onReply={() => {}}
                onEdit={async () => {}}
                onDelete={async () => {}}
                cargarMultimedia={false}
            />,
        );
        expect(container.querySelector("img")).toBeNull();
        fireEvent.click(screen.getByText("Toca para cargar la imagen"));
        expect(container.querySelector("img")).not.toBeNull();
    });
});
