/**
 * Dobles de prueba comunes al editor y a la galería de iconos: los avisos (`sonner`), la Biblioteca de la
 * persona, la Librería pública y la IA. Se enganchan con `vi.mock(..., async () => (await import(...)).x)`.
 */
import { vi } from "vitest";
import type { SavedItem } from "@/lib/library/entity-library";
import type { PublicItem } from "@/lib/library/public-catalog";
import { empaquetarDiseno, empaquetarPlantilla, paqueteATexto } from "@/lib/dock/iconos/paquete";
import type { DisenoIcono, PlantillaIconos } from "@/lib/dock/iconos/modelo";

export const toastFalso = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() });

/* ───────────── Biblioteca de la persona ───────────── */

export const bib = {
    destinos: [{ ref: { kind: "user", id: "u1" }, label: "Mi biblioteca" }] as Array<{ ref: { kind: string; id: string }; label: string }>,
    cargando: false,
    items: [] as SavedItem[],
    guardados: [] as Array<Record<string, unknown>>,
};

export const entityLibraryFalsa = {
    libraryRef: (kind: string, id: string) => ({ kind, id }),
    useMyLibraryDestinations: () => ({ destinations: bib.destinos, loading: bib.cargando }),
    listLibrary: vi.fn(async () => ({ items: bib.items })),
    readLibrarySnapshot: vi.fn(() => ({ items: bib.items })),
    saveItem: vi.fn(async (_ref: unknown, input: Record<string, unknown>) => {
        bib.guardados.push(input);
        return { ok: true, id: `item-${bib.guardados.length}` };
    }),
};

/* ───────────── Librería pública ───────────── */

export const publicos = { filas: [] as PublicItem[] };
export const catalogoPublicoFalso = {
    listPublicItems: vi.fn(async () => publicos.filas),
};

/* ───────────── IA ───────────── */

export const ia = {
    /** Lo que `detectAvailability` devuelve. Vacío = «no hay ninguna IA lista». */
    disponibilidad: [] as unknown[],
    chat: vi.fn(),
};

export function fuenteIA(id: string, tier: "local" | "free-key" | "paid", ready = true, privacy: "local" | "cloud" = "cloud") {
    return { ready, source: { id, label: id.toUpperCase(), tier, privacy, models: [{ id: "m1", label: "m1", quality: 7, strengths: ["code"] }] } };
}

/* ───────────── Contenido de ejemplo ───────────── */

export function elementoGuardado(id: string, contenido: string, extra: Partial<SavedItem> = {}): SavedItem {
    return {
        id, type: "file", title: `${id}.starseed-iconos.json`, tags: ["starseed-iconos", "dock"],
        addedAt: "2026-10-20T10:00:00.000Z", addedBy: "u1", mime: "application/vnd.starseed.iconos+json", language: "json",
        content: contenido, ...extra,
    };
}

export function filaPublica(id: string, contenido: unknown, nombre = "Público"): PublicItem {
    return {
        id, owner: "otra", category: "iconos", folder: "", name: nombre, kind: "file",
        payload: { content: contenido as string, mime: "application/vnd.starseed.iconos+json" },
        tags: ["starseed-iconos"], createdAt: "2026-10-21T10:00:00.000Z", updatedAt: "2026-10-21T10:00:00.000Z",
    };
}

export const textoDePlantilla = (p: PlantillaIconos) => paqueteATexto(empaquetarPlantilla(p));
export const textoDeDiseno = (d: DisenoIcono) => paqueteATexto(empaquetarDiseno(d, new Date("2026-10-20T10:00:00Z")));

export function reiniciarMocks(): void {
    bib.destinos = [{ ref: { kind: "user", id: "u1" }, label: "Mi biblioteca" }];
    bib.cargando = false;
    bib.items = [];
    bib.guardados = [];
    publicos.filas = [];
    ia.disponibilidad = [];
    ia.chat.mockReset();
    toastFalso.mockClear();
    toastFalso.success.mockClear();
    toastFalso.error.mockClear();
    toastFalso.info.mockClear();
    entityLibraryFalsa.listLibrary.mockClear();
    entityLibraryFalsa.saveItem.mockClear();
    catalogoPublicoFalso.listPublicItems.mockClear();
}
