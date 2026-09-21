import { describe, expect, it } from "vitest";
import { marcoDeAdjunto } from "../message-bubble";
import type { DmAttachment } from "@/lib/messages/dm";

describe("marcoDeAdjunto en MessageBubble", () => {
    it("devuelve el marco cuando el adjunto contiene un objeto marco", () => {
        const attachment: DmAttachment & { marco: unknown } = {
            kind: "image",
            url: "https://ejemplo.com/foto.png",
            marco: { forma: "estrella", escala: 1.2, x: 0, y: 0, borde: 2 },
        };
        const m = marcoDeAdjunto(attachment);
        expect(m).not.toBeNull();
        expect((m as { forma?: string }).forma).toBe("estrella");
    });

    it("devuelve null cuando el adjunto no tiene marco o es inválido", () => {
        const sinMarco: DmAttachment = {
            kind: "image",
            url: "https://ejemplo.com/foto.png",
        };
        expect(marcoDeAdjunto(sinMarco)).toBeNull();

        const marcoInvalido = {
            kind: "image",
            url: "https://ejemplo.com/foto.png",
            marco: "no-un-objeto",
        } as unknown as DmAttachment;
        expect(marcoDeAdjunto(marcoInvalido)).toBeNull();
    });
});
