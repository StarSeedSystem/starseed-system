/**
 * GRP1107A · bandeja «Por la malla» de Correos: enseña los correos guardados y reenviados con su
 * estado, sus recibos y la vía; no repite los que ya están en el buzón; vacía, no pinta nada.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CorreoMalla } from "@/lib/mail/correo-malla";

const h = vi.hoisted(() => ({ lista: [] as unknown[] }));
vi.mock("@/lib/mail/correo-malla-motor", () => ({
    useCorreosMalla: () => h.lista,
    motorCorreoMalla: () => ({ cifrado: () => true }),
}));

import { BandejaCorreosMalla, textoViaCorreo } from "@/components/messages/correos-malla";

const base: CorreoMalla = {
    id: "correo-000001",
    dir: "sale",
    de: { uid: "u-yo", nombre: "Yo" },
    para: ["u-ana"],
    paraNombres: { "u-ana": "Ana" },
    asunto: "Reunión",
    cuerpo: "Mañana a las 10.",
    creado: 1_800_000_000_000,
    estado: "entregado",
    entregadoA: ["u-ana"],
    recibos: [{ tipo: "enviado", uid: "u-ana", por: "Móvil de Ana", en: 1 }],
    via: { medio: "local", enlaceId: "local:a", etiqueta: "Móvil de Ana", en: 1 },
    intentos: 1,
};

describe("BandejaCorreosMalla", () => {
    it("enseña estado, recibos y vía; abre el cuerpo; dice que va cifrado", () => {
        h.lista = [base, { ...base, id: "correo-000002", dir: "entra", estado: "entregado", asunto: "Recibido", de: { uid: "u-ana", nombre: "Ana" } }];
        render(<BandejaCorreosMalla mallaIdsServidor={[]} />);
        expect(screen.getByText(/Por la malla · 2 correos/)).toBeTruthy();
        expect(screen.getByText("Entregado a Ana por la malla")).toBeTruthy();
        expect(screen.getByText("Recibido por la malla (guardado cifrado en este aparato)")).toBeTruthy();
        expect(screen.getByLabelText("Recibos").textContent).toContain("Enviado");
        expect(screen.getAllByTestId("via-correo-malla")[0].textContent).toContain("Mesh · Sin internet · Móvil de Ana");
        expect(screen.getByText(/Guardados cifrados en este aparato/)).toBeTruthy();
        fireEvent.click(screen.getByText("Reunión"));
        expect(screen.getByText("Mañana a las 10.")).toBeTruthy();
    });

    it("no repite los recibidos que ya están en el buzón; vacía, no pinta nada", () => {
        h.lista = [{ ...base, dir: "entra" }];
        const { container } = render(<BandejaCorreosMalla mallaIdsServidor={["correo-000001"]} />);
        expect(container.innerHTML).toBe("");
    });

    it("textoViaCorreo", () => {
        expect(textoViaCorreo({ ...base, via: { medio: "correo", etiqueta: "Buzón @star.seed", en: 1 } })).toBe("Buzón @star.seed");
        expect(textoViaCorreo({ ...base, via: undefined })).toBeNull();
    });
});
