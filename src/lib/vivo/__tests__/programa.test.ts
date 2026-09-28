/**
 * Contrato de app en vivo de los programas: crear el espacio en `os_spaces` (con el `kind` propio,
 * cayendo al genérico si el servidor aún no tiene la migración), su ruta, el listado y el documento
 * semilla con la plantilla elegida.
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

import { INFO_VIVO_PROGRAMA, crearVivoPrograma, docProgramaNuevo, listarMiosPrograma, rutaPrograma } from "../programa";
import { MENSAJE_NO_CREADO, MENSAJE_SIN_CUENTA_VIVO, olvidarKindsRechazados } from "../juegos/espacio-vivo";
import { reconstruir, sanearDoc } from "../juegos/registro";
import { motorPrograma } from "../programas/motor";

const fila = (id: string, kind: string, doc: Record<string, unknown>, title = "Programa") => ({ id, kind, title, doc });

beforeEach(() => {
    espacios.createSpace.mockReset();
    espacios.listOwnedSpaces.mockReset();
    sesion.uid = "u1";
    olvidarKindsRechazados();
});

describe("crearVivoPrograma", () => {
    test("crea un espacio de kind «programa» por invitación con la plantilla elegida y devuelve su ruta", async () => {
        espacios.createSpace.mockResolvedValue(fila("sp-1", "programa", {}));
        const r = await crearVivoPrograma("Encuesta del viernes", { plantilla: "encuesta" });
        expect(r).toEqual({ refId: "sp-1", ruta: "/programa/sp-1" });
        const arg = espacios.createSpace.mock.calls[0][0];
        expect(arg).toMatchObject({ kind: "programa", title: "Encuesta del viernes", access: "invite" });
        const doc = sanearDoc(arg.doc);
        expect(doc?.vivo.tipo).toBe("programa");
        expect(doc?.registro).toMatchObject({ tipo: "programa", gen: 1, log: [] });
        expect(doc?.registro?.base.creador).toBe("u1");
        // El documento es un programa que el motor entiende, con el título y los bloques de la plantilla.
        const r2 = reconstruir(motorPrograma, doc!.registro!);
        expect(r2.estado.titulo).toBe("Encuesta del viernes");
        expect(r2.estado.bloques.map((b: { tipo: string }) => b.tipo)).toEqual(["texto", "encuesta"]);
    });

    test("sin título toma el de la plantilla; sin plantilla nace en blanco", async () => {
        espacios.createSpace.mockResolvedValue(fila("sp-2", "programa", {}));
        await crearVivoPrograma("   ", { plantilla: "lista-compartida" });
        expect(espacios.createSpace.mock.calls[0][0].title).toBe("Lista compartida");
        await crearVivoPrograma("");
        expect(espacios.createSpace.mock.calls[1][0].title).toBe("Programa");
        const doc = sanearDoc(espacios.createSpace.mock.calls[1][0].doc);
        expect(reconstruir(motorPrograma, doc!.registro!).estado.bloques).toEqual([]);
    });

    test("una plantilla desconocida no rompe: cae en blanco", () => {
        const doc = docProgramaNuevo("u1", "X", { plantilla: "parchís" as never });
        expect(reconstruir(motorPrograma, doc.registro!).estado.bloques).toEqual([]);
    });

    test("si el servidor aún no tiene el kind propio cae a «dashboard» marcando el documento", async () => {
        espacios.createSpace.mockResolvedValueOnce(null).mockResolvedValueOnce(fila("sp-4", "dashboard", {}));
        const r = await crearVivoPrograma("Sala");
        expect(r.refId).toBe("sp-4");
        expect(espacios.createSpace.mock.calls.map((c) => c[0].kind)).toEqual(["programa", "dashboard"]);
        expect((espacios.createSpace.mock.calls[1][0].doc as { vivo: { tipo: string } }).vivo.tipo).toBe("programa");
    });

    test("sin sesión lanza un error claro y no toca la base; sin poder crear, otro en español", async () => {
        sesion.uid = null;
        await expect(crearVivoPrograma("P")).rejects.toThrow(MENSAJE_SIN_CUENTA_VIVO);
        expect(espacios.createSpace).not.toHaveBeenCalled();
        sesion.uid = "u1";
        espacios.createSpace.mockResolvedValue(null);
        await expect(crearVivoPrograma("P")).rejects.toThrow(MENSAJE_NO_CREADO);
    });
});

describe("listarMiosPrograma", () => {
    test("une los del kind propio y los marcados dentro de «dashboard», sin duplicados ni juegos", async () => {
        espacios.listOwnedSpaces.mockImplementation(async (kind?: string) => {
            if (kind === "programa") return [fila("a", "programa", { vivo: { tipo: "programa" } }, "P A")];
            if (kind === "dashboard") {
                return [
                    fila("b", "dashboard", { vivo: { tipo: "programa" } }, "P B"),
                    fila("c", "dashboard", { vivo: { tipo: "juego" } }, "Una sala de juegos"),
                    fila("d", "dashboard", {}, "Un tablero cualquiera"),
                    fila("a", "dashboard", { vivo: { tipo: "programa" } }, "P A"),
                ];
            }
            return [];
        });
        expect(await listarMiosPrograma()).toEqual([
            { refId: "a", titulo: "P A", ruta: "/programa/a" },
            { refId: "b", titulo: "P B", ruta: "/programa/b" },
        ]);
    });
});

describe("información y rutas", () => {
    test("INFO_VIVO_PROGRAMA tiene lo que pide el contrato", () => {
        expect(INFO_VIVO_PROGRAMA.etiqueta.length).toBeGreaterThan(2);
        expect(INFO_VIVO_PROGRAMA.descripcion.length).toBeGreaterThan(10);
        expect(INFO_VIVO_PROGRAMA.icono).toBe("AppWindow");
        expect(INFO_VIVO_PROGRAMA.color).toMatch(/^#[0-9A-F]{6}$/i);
    });
    test("la ruta codifica el id", () => {
        expect(rutaPrograma("a b")).toBe("/programa/a%20b");
    });
});
