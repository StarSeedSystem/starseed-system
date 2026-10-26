// @vitest-environment jsdom
/**
 * aplicar-dock — escribe en el dock REAL (`loadDockConfig` / `saveDockConfig` sobre `localStorage`, sin
 * simular nada) y prueba que el diseño sobrevive al sobre versionado del dock y que se avisa a OmniDock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLAVE_PERFIL_ICONOS, leerPerfilIconos } from "@/lib/dock/iconos/almacen";
import { disenoBase } from "@/lib/dock/iconos/modelo";
import { PLANTILLAS_SERIE } from "@/lib/dock/iconos/plantillas-serie";
import { loadDockConfig } from "@/components/layout/dock-config";
import { aplicarDisenoAItem, aplicarPlantillaAlPerfil, contarDisenosPropios, itemsDelDock, quitarPlantilla } from "../aplicar-dock";
import { guardarDock, leerDockGuardado, limpiarEntorno } from "../__fixtures__/entorno";

const rojo = { ...disenoBase("#ef4444"), forma: "rombo" as const, nombre: "Rojo" };
const verde = { ...disenoBase("#22c55e"), forma: "hexagono" as const };

let avisos = 0;
const contar = () => { avisos++; };

beforeEach(() => {
    limpiarEntorno();
    guardarDock();
    // las primeras cargas del dock reescriben su propio sobre (migraciones del dock): se deja asentar
    for (let i = 0; i < 5; i++) {
        const antes = window.localStorage.getItem("starseed.dock.items.v2");
        loadDockConfig();
        if (window.localStorage.getItem("starseed.dock.items.v2") === antes) break;
    }
    avisos = 0;
    window.addEventListener("starseed:dock", contar);
});
afterEach(() => {
    window.removeEventListener("starseed:dock", contar);
    limpiarEntorno();
});

describe("aplicarDisenoAItem", () => {
    it("el diseño sobrevive al guardado y a la recarga del dock (el sobre versionado no lo pierde)", () => {
        expect(aplicarDisenoAItem("messages", rojo)).toBe(true);
        // va dentro del sobre real que se sincroniza
        const crudo = leerDockGuardado().find((i) => i.id === "messages");
        expect((crudo?.diseno as { forma?: string })?.forma).toBe("rombo");
        // y una recarga completa (migraciones incluidas) lo devuelve
        const recargado = loadDockConfig().find((i) => i.id === "messages");
        expect(recargado?.diseno?.forma).toBe("rombo");
        expect(recargado?.diseno?.nombre).toBe("Rojo");
    });

    it("avisa a OmniDock con el evento que ya escucha", () => {
        aplicarDisenoAItem("messages", rojo);
        expect(avisos).toBe(1);
    });

    it("no toca a los demás iconos", () => {
        aplicarDisenoAItem("messages", rojo);
        const otros = loadDockConfig().filter((i) => i.id !== "messages");
        expect(otros.every((i) => !i.diseno)).toBe(true);
    });

    it("con null quita el diseño propio", () => {
        aplicarDisenoAItem("messages", rojo);
        expect(aplicarDisenoAItem("messages", null)).toBe(true);
        expect(loadDockConfig().find((i) => i.id === "messages")?.diseno).toBeUndefined();
    });

    it("devuelve false, sin escribir ni avisar, si el icono ya no existe", () => {
        const antes = window.localStorage.getItem("starseed.dock.items.v2");
        expect(aplicarDisenoAItem("no-existe", rojo)).toBe(false);
        expect(window.localStorage.getItem("starseed.dock.items.v2")).toBe(antes);
        expect(avisos).toBe(0);
    });
});

describe("contarDisenosPropios e itemsDelDock", () => {
    it("cuenta solo los items con diseño propio", () => {
        expect(contarDisenosPropios(itemsDelDock())).toBe(0);
        aplicarDisenoAItem("messages", rojo);
        aplicarDisenoAItem("notifications", verde);
        expect(contarDisenosPropios()).toBe(2);
    });
});

describe("aplicarPlantillaAlPerfil", () => {
    const trinity = PLANTILLAS_SERIE[0];

    it("guarda la plantilla en el perfil (clave propia, sincronizable) y avisa", () => {
        const r = aplicarPlantillaAlPerfil(trinity);
        expect(r.ok).toBe(true);
        expect(leerPerfilIconos().plantilla?.id).toBe(trinity.id);
        expect(window.localStorage.getItem(CLAVE_PERFIL_ICONOS)).toContain(trinity.id);
        expect(avisos).toBeGreaterThan(0);
    });

    it("sin diseños sueltos no reescribe el dock (la plantilla no se copia dentro de cada item)", () => {
        const antes = window.localStorage.getItem("starseed.dock.items.v2");
        const r = aplicarPlantillaAlPerfil(trinity);
        expect(r.limpiados).toBe(0);
        expect(window.localStorage.getItem("starseed.dock.items.v2")).toBe(antes);
    });

    it("limpia los diseños sueltos por defecto…", () => {
        aplicarDisenoAItem("messages", rojo);
        const r = aplicarPlantillaAlPerfil(trinity);
        expect(r.limpiados).toBe(1);
        expect(loadDockConfig().find((i) => i.id === "messages")?.diseno).toBeUndefined();
    });

    it("…o los conserva si se pide", () => {
        aplicarDisenoAItem("messages", rojo);
        const r = aplicarPlantillaAlPerfil(trinity, { conservarManuales: true });
        expect(r.conservados).toBe(1);
        expect(loadDockConfig().find((i) => i.id === "messages")?.diseno?.forma).toBe("rombo");
    });
});

describe("quitarPlantilla", () => {
    it("quita la plantilla pero deja lo cambiado a mano", () => {
        aplicarPlantillaAlPerfil(PLANTILLAS_SERIE[1]);
        aplicarDisenoAItem("messages", rojo);
        const r = quitarPlantilla();
        expect(r.quitadosManuales).toBe(0);
        expect(leerPerfilIconos().plantilla).toBeNull();
        expect(loadDockConfig().find((i) => i.id === "messages")?.diseno?.forma).toBe("rombo");
    });

    it("escribe un perfil vacío en vez de borrar la clave (así el cambio también viaja a otros aparatos)", () => {
        aplicarPlantillaAlPerfil(PLANTILLAS_SERIE[1]);
        quitarPlantilla();
        expect(window.localStorage.getItem(CLAVE_PERFIL_ICONOS)).not.toBeNull();
    });

    it("con «también manuales» deja todo como de fábrica", () => {
        aplicarPlantillaAlPerfil(PLANTILLAS_SERIE[1]);
        aplicarDisenoAItem("messages", rojo);
        aplicarDisenoAItem("notifications", verde);
        const r = quitarPlantilla({ tambienManuales: true });
        expect(r.quitadosManuales).toBe(2);
        expect(contarDisenosPropios()).toBe(0);
        expect(leerPerfilIconos().plantilla).toBeNull();
    });
});
