import { beforeEach, describe, expect, it } from "vitest";

import { TIMBRES } from "@/lib/aurora/timbres";
import {
    cargarVoces,
    clonarVoz,
    exportarVoces,
    guardarVoz,
    importarVoces,
    restablecerVoz,
    vocesDefecto,
} from "@/lib/aurora/voces-catalogo";

// Mock mínimo de localStorage (entorno de pruebas sin navegador)
class LocalStorageMock {
    private datos = new Map<string, string>();
    getItem(k: string): string | null { return this.datos.get(k) ?? null; }
    setItem(k: string, v: string): void { this.datos.set(k, v); }
    removeItem(k: string): void { this.datos.delete(k); }
    clear(): void { this.datos.clear(); }
}

beforeEach(() => {
    const ls = new LocalStorageMock();
    Object.defineProperty(globalThis, "window", { value: { localStorage: ls }, configurable: true });
});

describe("vocesDefecto", () => {
    it("devuelve las 12 voces de TIMBRES con ids únicos", () => {
        const voces = vocesDefecto();
        expect(voces).toHaveLength(12);
        expect(new Set(voces.map((v) => v.id)).size).toBe(12);
        expect(voces.every((v) => v.archivoCodigo === "src/lib/aurora/timbres.ts")).toBe(true);
    });
});

describe("guardarVoz y cargarVoces", () => {
    it("guardarVoz marca la voz como editada y cargarVoces la devuelve", () => {
        const voz = { ...vocesDefecto()[0], desc: "Editada en la prueba" };
        guardarVoz(voz);
        const cargada = cargarVoces().find((v) => v.id === voz.id);
        expect(cargada?.desc).toBe("Editada en la prueba");
        expect(cargada?.origen).toBe("editada");
    });
});

describe("clonarVoz", () => {
    it("crea un id nuevo sin tocar la original", () => {
        const clon = clonarVoz("fem-aurora", "Aurora Prima");
        expect(clon).not.toBeNull();
        expect(clon?.id).toBe("clon-fem-aurora-1");
        expect(clon?.origen).toBe("clon");
        expect(clon?.base).toBe("fem-aurora");
        const voces = cargarVoces();
        expect(voces).toHaveLength(13);
        expect(voces.find((v) => v.id === "fem-aurora")?.origen).toBe("defecto");
    });
});

describe("restablecerVoz", () => {
    it("vuelve al valor de TIMBRES", () => {
        const original = TIMBRES.find((t) => t.id === "fem-aurora");
        expect(original).toBeDefined();
        guardarVoz({ ...vocesDefecto()[0], desc: "Cambiada" });
        const restaurada = restablecerVoz("fem-aurora");
        expect(restaurada?.desc).toBe(original!.desc);
        expect(restaurada?.origen).toBe("defecto");
        expect(cargarVoces().find((v) => v.id === "fem-aurora")?.desc).toBe(original!.desc);
    });
});

describe("exportar e importar", () => {
    it("exportar→importar conserva el número de voces", () => {
        clonarVoz("neu-eco", "Eco Doble");
        const json = exportarVoces();
        window.localStorage.clear();
        expect(cargarVoces()).toHaveLength(12);
        const r = importarVoces(json);
        expect(r.ok).toBe(true);
        expect(cargarVoces().length).toBe(13);
    });

    it("JSON inválido devuelve { ok: false } sin lanzar", () => {
        const r = importarVoces("{no es json");
        expect(r.ok).toBe(false);
        expect(r.importadas).toBe(0);
        expect(typeof r.error).toBe("string");
    });
});
