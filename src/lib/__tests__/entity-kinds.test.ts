// src/lib/__tests__/entity-kinds.test.ts
// -----------------------------------------------------------------------------
// Registro canónico de tipos de entidad (ENTIDAD ÚNICA de tipos del OS):
// `normalizeEntityKind` tolera los vocabularios de rutas, widgets y os_*; el
// Centro de Creación referencia `entityCreationOptions()` en vez de duplicar
// etiquetas, iconos y rutas.
//
// Funciones puras: sin red, sin disco, sin Supabase.
// -----------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
    ENTITY_KINDS,
    ENTITY_CREATE_ORDER,
    ENTITY_CREATE_TARGETS,
    entityCreationOptions,
    entityKindMeta,
    normalizeEntityKind,
    type EntityKind,
} from "@/lib/entity-kinds";

describe("normalizeEntityKind · vocabularios tolerantes", () => {
    it("reconoce las claves canónicas tal cual", () => {
        expect(normalizeEntityKind("personal")).toBe("personal");
        expect(normalizeEntityKind("comunidad")).toBe("comunidad");
        expect(normalizeEntityKind("partido")).toBe("partido");
        expect(normalizeEntityKind("proyecto")).toBe("proyecto");
    });

    it("acepta los sinónimos históricos de las rutas y los widgets", () => {
        expect(normalizeEntityKind("perfil")).toBe("personal");
        expect(normalizeEntityKind("sangha")).toBe("comunidad");
        expect(normalizeEntityKind("Partido Político")).toBe("partido");
        expect(normalizeEntityKind("Círculo")).toBe("grupo");
        expect(normalizeEntityKind("consejo")).toBe("asamblea");
        expect(normalizeEntityKind("festival")).toBe("evento");
        expect(normalizeEntityKind("Entidad Federativa")).toBe("ef");
    });

    it("reconoce los tipos reales del Centro de Creación y del Lienzo", () => {
        const reales: Array<[string, EntityKind]> = [
            ["grupo", "grupo"],
            ["pagina", "pagina"],
            ["evento", "evento"],
            ["partido", "partido"],
            ["ef", "ef"],
            ["asamblea", "asamblea"],
            ["comunidad", "comunidad"],
            ["entidad", "ef"],
            ["proyecto", "proyecto"],
        ];
        for (const [entrada, canonica] of reales) {
            expect(normalizeEntityKind(entrada)).toBe(canonica);
            expect(ENTITY_KINDS[canonica].key).toBe(canonica);
        }
    });

    it("«entidad» (kind vivo de os_pages) resuelve a la E.F. canónica", () => {
        expect(normalizeEntityKind("entidad")).toBe("ef");
        expect(normalizeEntityKind("Entidad")).toBe("ef");
        expect(entityKindMeta("entidad")).toBe(ENTITY_KINDS.ef);
    });

    it("cae a «pagina» con vacío o desconocido, sin lanzar", () => {
        expect(normalizeEntityKind(null)).toBe("pagina");
        expect(normalizeEntityKind(undefined)).toBe("pagina");
        expect(normalizeEntityKind("   ")).toBe("pagina");
        expect(normalizeEntityKind("cualquier-cosa")).toBe("pagina");
    });
});

describe("entityKindMeta · metadato visual", () => {
    it("devuelve el metadato del registro canónico", () => {
        expect(entityKindMeta("partido")).toBe(ENTITY_KINDS.partido);
        expect(entityKindMeta("E.F.")).toBe(ENTITY_KINDS.ef);
        expect(entityKindMeta("desconocido")).toBe(ENTITY_KINDS.pagina);
    });

    it("cada tipo declara icono, acento y sistema", () => {
        for (const meta of Object.values(ENTITY_KINDS)) {
            expect(meta.icon).toBeTruthy();
            expect(meta.accent).toMatch(/^#[0-9a-f]{6}$/i);
            expect(["politico", "cultural", "educativo", "social"]).toContain(meta.system);
        }
    });
});

describe("entityCreationOptions · Centro de Creación sin duplicar", () => {
    it("cubre todo tipo del registro con un destino de creación", () => {
        for (const key of Object.keys(ENTITY_KINDS) as Array<keyof typeof ENTITY_KINDS>) {
            expect(ENTITY_CREATE_TARGETS[key]).toBeTruthy();
            expect(ENTITY_CREATE_TARGETS[key].hint.length).toBeGreaterThan(0);
        }
    });

    it("respeta el orden estable y no repite tipos", () => {
        const claves = entityCreationOptions().map((o) => o.key);
        expect(claves).toEqual(ENTITY_CREATE_ORDER);
        expect(new Set(claves).size).toBe(claves.length);
    });

    it("cada opción mezcla metadato e icono del registro con su destino", () => {
        const proyecto = entityCreationOptions().find((o) => o.key === "proyecto");
        expect(proyecto?.label).toBe(ENTITY_KINDS.proyecto.label);
        expect(proyecto?.icon).toBe(ENTITY_KINDS.proyecto.icon);
        expect(proyecto?.createEntity).toBe("group");
        expect(proyecto?.hint).toBe(ENTITY_CREATE_TARGETS.proyecto.hint);
    });
});

describe("destinos de creación · evento y partido", () => {
    it("el evento usa el flujo de evento, nunca «page»", () => {
        expect(ENTITY_CREATE_TARGETS.evento.createEntity).toBe("event");
    });

    it("cada tipo declara al menos un destino de creación válido", () => {
        for (const target of Object.values(ENTITY_CREATE_TARGETS)) {
            const flujoValido =
                target.createEntity === "page" ||
                target.createEntity === "group" ||
                target.createEntity === "event";
            const rutaValida = typeof target.href === "string" && target.href.startsWith("/");
            expect(flujoValido || rutaValida).toBe(true);
        }
    });

    it("el partido político conserva un destino válido y su pista", () => {
        const partido = ENTITY_CREATE_TARGETS.partido;
        expect(partido.createEntity ?? partido.href).toBeTruthy();
        expect(partido.hint.length).toBeGreaterThan(0);
    });
});
