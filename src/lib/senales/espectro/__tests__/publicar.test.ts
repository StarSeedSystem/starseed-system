/**
 * Tests para publicar señales.
 */
import { describe, it, expect, vi } from "vitest";
import { publicarSenales, FilaPublicable } from "../publicar";

describe("publicarSenales", () => {
    it("debe rechazar si no hay uid", async () => {
        const res = await publicarSenales({ uid: null, filas: [], ahora: new Date() });
        expect(res.ok).toBe(false);
        expect(res.motivo).toBe("Sin sesión");
    });

    it("debe realizar upsert con el uid correcto", async () => {
        const mockSupabase = {
            from: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockResolvedValue({ error: null }),
        };

        const filas: FilaPublicable[] = [{
            device_id: "dev1",
            capa: "publica",
            comunidad: null,
            medio: "lora",
            banda: "868",
            frecuencia_khz: 868000,
            ancho_khz: 125,
            fuerza_dbm: -100,
            calidad: 1,
            origen: "medida",
            zona: "A",
            ficha: null,
            medido_en: new Date().toISOString(),
        }];

        // Avanzar el tiempo para evitar el periodo
        const ahora = new Date(Date.now() + 60000);

        const res = await publicarSenales({
            cliente: mockSupabase as any,
            uid: "user123",
            filas,
            ahora,
        });

        expect(res.ok).toBe(true);
        expect(mockSupabase.from).toHaveBeenCalledWith("os_senales_publicas");
        
        // Verificar que owner_id fue inyectado
        const callArgs = mockSupabase.upsert.mock.calls[0][0];
        expect(callArgs[0].owner_id).toBe("user123");
    });
});
