/**
 * Contrato de app en vivo de los juegos: crear la sala en `os_spaces` (con el `kind` propio, y
 * cayendo al genérico si el servidor aún no tiene la migración), su ruta, el listado y los
 * documentos semilla.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const espacios = vi.hoisted(() => ({
    createSpace: vi.fn(),
    listOwnedSpaces: vi.fn(),
}));
vi.mock("@/lib/spaces/spaces", () => espacios);
const sesion = vi.hoisted(() => ({ uid: "u1" as string | null }));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: { getSession: async () => ({ data: { session: sesion.uid ? { user: { id: sesion.uid } } : null } }) },
    }),
}));

import { INFO_VIVO_JUEGO, crearVivoJuego, docJuegoNuevo, listarMiosJuego, rutaJuego } from "../juego";
import { JUEGOS_DISPONIBLES } from "../juegos/catalogo";
import { olvidarKindsRechazados, MENSAJE_NO_CREADO, MENSAJE_SIN_CUENTA_VIVO } from "../juegos/espacio-vivo";
import { sanearDoc } from "../juegos/registro";

const fila = (id: string, kind: string, doc: Record<string, unknown>, title = "Sala") => ({ id, kind, title, doc });

beforeEach(() => {
    espacios.createSpace.mockReset();
    espacios.listOwnedSpaces.mockReset();
    sesion.uid = "u1";
    olvidarKindsRechazados();
});

describe("crearVivoJuego", () => {
    test("crea un espacio de kind «juego» por invitación y devuelve su ruta", async () => {
        espacios.createSpace.mockResolvedValue(fila("sp-1", "juego", {}));
        const r = await crearVivoJuego("Tarde de juegos");
        expect(r).toEqual({ refId: "sp-1", ruta: "/juego/sp-1" });
        const arg = espacios.createSpace.mock.calls[0][0];
        expect(arg).toMatchObject({ kind: "juego", title: "Tarde de juegos", access: "invite" });
        // El documento semilla es una sala de juego válida y vacía.
        const doc = sanearDoc(arg.doc);
        expect(doc?.vivo.tipo).toBe("juego");
        expect(doc?.registro).toBeNull();
    });

    test("sin título usa un nombre por defecto", async () => {
        espacios.createSpace.mockResolvedValue(fila("sp-2", "juego", {}));
        await crearVivoJuego("   ");
        expect(espacios.createSpace.mock.calls[0][0].title).toBe("Sala de juegos");
    });

    test("con un juego elegido la sala nace con la primera partida preparada", async () => {
        espacios.createSpace.mockResolvedValue(fila("sp-3", "juego", {}));
        await crearVivoJuego("Ajedrez", { juego: "ajedrez" });
        const doc = sanearDoc(espacios.createSpace.mock.calls[0][0].doc);
        expect(doc?.registro).toMatchObject({ tipo: "ajedrez", gen: 1, log: [] });
        expect(doc?.registro?.base).toMatchObject({ juego: "ajedrez", creador: "u1" });
    });

    test("si el servidor aún no tiene el kind propio (migración sin aplicar) cae a «dashboard» y lo recuerda", async () => {
        espacios.createSpace.mockResolvedValueOnce(null).mockResolvedValueOnce(fila("sp-4", "dashboard", {}));
        const r = await crearVivoJuego("Sala");
        expect(r.refId).toBe("sp-4");
        expect(espacios.createSpace.mock.calls.map((c) => c[0].kind)).toEqual(["juego", "dashboard"]);
        // La segunda vez no vuelve a probar el kind que ya falló.
        espacios.createSpace.mockResolvedValueOnce(fila("sp-5", "dashboard", {}));
        await crearVivoJuego("Otra");
        expect(espacios.createSpace.mock.calls.map((c) => c[0].kind)).toEqual(["juego", "dashboard", "dashboard"]);
        // El documento lleva la marca para reconocerlo en el listado.
        expect((espacios.createSpace.mock.calls[1][0].doc as { vivo: { tipo: string } }).vivo.tipo).toBe("juego");
    });

    test("sin sesión lanza un error claro y no toca la base", async () => {
        sesion.uid = null;
        await expect(crearVivoJuego("Sala")).rejects.toThrow(MENSAJE_SIN_CUENTA_VIVO);
        expect(espacios.createSpace).not.toHaveBeenCalled();
    });

    test("si no hay manera de crearlo, lanza un error en español", async () => {
        espacios.createSpace.mockResolvedValue(null);
        await expect(crearVivoJuego("Sala")).rejects.toThrow(MENSAJE_NO_CREADO);
    });
});

describe("listarMiosJuego", () => {
    test("une las salas del kind propio y las marcadas dentro de «dashboard», sin duplicados ni ajenas", async () => {
        espacios.listOwnedSpaces.mockImplementation(async (kind?: string) => {
            if (kind === "juego") return [fila("a", "juego", { vivo: { tipo: "juego" } }, "Sala A")];
            if (kind === "dashboard") {
                return [
                    fila("b", "dashboard", { vivo: { tipo: "juego" } }, "Sala B"),
                    fila("c", "dashboard", { sharing: { resource: { type: "brain" } } }, "Un cerebro compartido"),
                    fila("d", "dashboard", { vivo: { tipo: "programa" } }, "Un programa"),
                    fila("a", "dashboard", { vivo: { tipo: "juego" } }, "Sala A"),
                ];
            }
            return [];
        });
        const r = await listarMiosJuego();
        expect(r).toEqual([
            { refId: "a", titulo: "Sala A", ruta: "/juego/a" },
            { refId: "b", titulo: "Sala B", ruta: "/juego/b" },
        ]);
    });

    test("si no hay ninguna devuelve una lista vacía", async () => {
        espacios.listOwnedSpaces.mockResolvedValue([]);
        expect(await listarMiosJuego()).toEqual([]);
    });
});

describe("información y rutas", () => {
    test("INFO_VIVO_JUEGO tiene lo que pide el contrato", () => {
        expect(INFO_VIVO_JUEGO.etiqueta.length).toBeGreaterThan(2);
        expect(INFO_VIVO_JUEGO.descripcion.length).toBeGreaterThan(10);
        expect(INFO_VIVO_JUEGO.icono).toBe("Gamepad2");
        expect(INFO_VIVO_JUEGO.color).toMatch(/^#[0-9A-F]{6}$/i);
    });

    test("la ruta codifica el id y admite ?sesion= sin más", () => {
        expect(rutaJuego("a b")).toBe("/juego/a%20b");
    });

    test("los cuatro juegos están descritos, con color y número de personas", () => {
        expect(JUEGOS_DISPONIBLES.map((j) => j.id).sort()).toEqual(["ajedrez", "conecta-4", "dibujo", "tres-en-raya"]);
        for (const j of JUEGOS_DISPONIBLES) {
            expect(j.descripcion.length).toBeGreaterThan(10);
            expect(j.color).toMatch(/^#[0-9A-F]{6}$/i);
            expect(j.jugadores).toMatch(/persona/);
        }
    });

    test("docJuegoNuevo ignora un juego desconocido", () => {
        const doc = docJuegoNuevo("u1", { juego: "parchís" as never });
        expect(doc.registro).toBeNull();
    });
});
