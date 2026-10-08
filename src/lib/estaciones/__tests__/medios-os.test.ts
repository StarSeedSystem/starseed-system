// Pruebas del registro de Estaciones en los medios del OS (§11 · Ola 1010E):
// entrada en el catálogo de apps del launcher y paquete de la Biblioteca.
// Solo datos puros: sin red, sin disco, sin procesos.
import { describe, it, expect } from "vitest";
import { Cast } from "lucide-react";
import {
    APP_CATALOG,
    APP_COLLECTIONS,
    getApp,
} from "@/components/dashboard/apps/app-catalog";
import { STARSEED_CORE_REPO } from "@/lib/library/packages";

describe("Estaciones en el catálogo de apps (§11)", () => {
    it("existe la app estaciones copiando la forma de canales", () => {
        const app = getApp("estaciones");
        expect(app).toBeDefined();
        expect(app!.name).toBe("Estaciones");
        expect(app!.status).toBe("native");
        expect(app!.category).toBe("starseed");
        expect(app!.accent).toBe("#FB7185");
        expect(app!.icon).toBe(Cast);
        expect(app!.open).toEqual({
            primary: "route",
            allowed: ["route", "window", "tab"],
            route: "/estaciones",
        });
    });

    it("radio pasa a nativa y abre las estaciones de audio", () => {
        const radio = getApp("radio");
        expect(radio).toBeDefined();
        expect(radio!.status).toBe("native");
        expect(radio!.open.primary).toBe("route");
        expect(radio!.open.route).toBe("/estaciones?tipo=audio");
    });

    it("estaciones está en las colecciones starseed y media", () => {
        expect(APP_COLLECTIONS.starseed).toContain("estaciones");
        expect(APP_COLLECTIONS.media).toContain("estaciones");
    });

    it("los ids del catálogo siguen siendo únicos", () => {
        const ids = APP_CATALOG.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("Estaciones en la Biblioteca (§11)", () => {
    it("existe el paquete app-estaciones con ruta real y honesta", () => {
        const pkg = STARSEED_CORE_REPO.packages.find((p) => p.id === "app-estaciones");
        expect(pkg).toBeDefined();
        expect(pkg!.kind).toBe("app");
        expect(pkg!.free).toBe(true);
        expect(pkg!.comingSoon).not.toBe(true);
        expect(pkg!.payload.route).toBe("/estaciones");
    });

    it("lleva las etiquetas del directo y un icono que ya resuelve la Biblioteca", () => {
        const pkg = STARSEED_CORE_REPO.packages.find((p) => p.id === "app-estaciones");
        expect(pkg!.tags).toEqual(["directo", "radio", "vídeo", "xr", "malla", "estudio"]);
        // «Radio» ya está en el ICON_MAP de package-store.tsx: la ficha no
        // cae al icono de respaldo.
        expect(pkg!.icon).toBe("Radio");
    });
});
