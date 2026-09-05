import { describe, expect, it } from "vitest";

import { cuentaComoCarga } from "@/components/layout/indicador-carga-global";

describe("indicador de carga global · qué peticiones cuentan", () => {
    it("cuenta las peticiones que el usuario espera", () => {
        expect(cuentaComoCarga("/api/mando/asistente")).toBe(true);
        expect(cuentaComoCarga("/api/mando/colas")).toBe(true);
        expect(cuentaComoCarga("/api/voz-local/tts")).toBe(true);
        expect(cuentaComoCarga("https://pqzdpmedcsgcedkvndzl.supabase.co/rest/v1/os_spaces?select=*")).toBe(true);
    });
    it("ignora el sondeo de fondo (estado del Mando, salud de voz, latidos, chunks)", () => {
        expect(cuentaComoCarga("/api/mando/estado")).toBe(false);
        expect(cuentaComoCarga("/api/mando/ramificacion")).toBe(false);
        expect(cuentaComoCarga("/api/voz/salud")).toBe(false);
        expect(cuentaComoCarga("/api/voz-local/status")).toBe(false);
        expect(cuentaComoCarga("/_next/static/chunks/x.js")).toBe(false);
        expect(cuentaComoCarga("https://x.supabase.co/rest/v1/relevo_eventos?select=id")).toBe(false);
        expect(cuentaComoCarga("/api/ai/astraura-158/api/notifications")).toBe(false);
    });
});
