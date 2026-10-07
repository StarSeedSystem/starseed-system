import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    haceCuanto,
    informeVigente,
    leerInformeReactivador,
    msDeInforme,
    puedeLanzar,
    tonoDelInforme,
    type InformeReactivador,
} from "../reactivador";

const T = "2026-10-06 23:20:00";
const AHORA = msDeInforme(T)!;
const base: InformeReactivador = {
    t: T,
    enMarcha: false,
    resumen: "1 reparado(s) · 3 bien",
    pasos: [
        { paso: "Servicios del Mando", estado: "ok", detalle: "21 servicios vivos" },
        { paso: "Directores de autocuración", estado: "reparado", detalle: "orden de refrescar proveedores" },
    ],
};

describe("reactivador", () => {
    it("un parte en marcha de hace más de 10 min se da por cortado y deja relanzar", () => {
        const enMarcha = { ...base, enMarcha: true };
        expect(informeVigente(enMarcha, AHORA + 5 * 60_000)?.enMarcha).toBe(true);
        expect(puedeLanzar(enMarcha, AHORA + 5 * 60_000)).toBe(false);
        const cortado = informeVigente(enMarcha, AHORA + 11 * 60_000);
        expect(cortado?.enMarcha).toBe(false);
        expect(cortado?.colgado).toBe(true);
        expect(puedeLanzar(enMarcha, AHORA + 11 * 60_000)).toBe(true);
        expect(puedeLanzar(null, AHORA)).toBe(true);
    });

    it("el tono es el peor paso", () => {
        expect(tonoDelInforme(base)).toBe("reparado");
        expect(tonoDelInforme({ ...base, pasos: [...base.pasos, { paso: "x", estado: "fallo" }] })).toBe("fallo");
        expect(tonoDelInforme(null)).toBe("nada");
    });

    it("dice hace cuánto", () => {
        expect(haceCuanto(T, AHORA + 20_000)).toBe("ahora");
        expect(haceCuanto(T, AHORA + 7 * 60_000)).toBe("hace 7 min");
        expect(haceCuanto(T, AHORA + 3 * 3_600_000)).toBe("hace 3 h");
        expect(haceCuanto("no es fecha", AHORA)).toBe("");
    });

    it("lee el parte del disco y tolera basura", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "reactivador-"));
        const ruta = path.join(dir, "r.json");
        await writeFile(ruta, JSON.stringify({ ...base, pasos: [...base.pasos, null, { nada: 1 }] }));
        const leido = await leerInformeReactivador(ruta);
        expect(leido?.pasos).toHaveLength(2);
        await writeFile(ruta, "{roto");
        expect(await leerInformeReactivador(ruta)).toBeNull();
        expect(await leerInformeReactivador(path.join(dir, "no-existe.json"))).toBeNull();
    });
});
