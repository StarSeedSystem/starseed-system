// (Ola 225) Sin DOM (node) la compresión es un no-op: todo File vuelve intacto.
import { describe, expect, it } from "vitest";
import { comprimirImagen } from "@/lib/files/comprimir-imagen";

describe("comprimirImagen (Ola 225)", () => {
    it("un archivo de texto vuelve intacto (sin canvas en node)", async () => {
        const texto = new File(["hola mundo"], "nota.txt", { type: "text/plain" });
        const out = await comprimirImagen(texto);
        expect(out).toBe(texto);
    });

    it("una imagen en SSR (node) también vuelve intacta", async () => {
        const img = new File([new Uint8Array(8)], "foto.png", { type: "image/png" });
        const out = await comprimirImagen(img);
        expect(out).toBe(img);
    });
});
