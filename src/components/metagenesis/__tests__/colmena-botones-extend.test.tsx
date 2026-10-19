import { describe, expect, it } from "vitest";
import { botonesNeurona, type NeuronaColmena } from "@/lib/metagenesis/colmena";
import { crearSalas } from "@/lib/estaciones/salas";

describe("colmena-botones extendidos", () => {
    it("desconectando activa: botón Desconectando visible, deshabilitado", () => {
        const n: NeuronaColmena = {
            nodo: "node1",
            vivo: true,
            so: "macos",
            enCurso: 1,
            contenedor: { activo: true, agentes: 1, apto: true, motivo: "" },
            desconectando: true,
        };
        const b = botonesNeurona(n);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectando…", explica: "Guarda el trabajo a medias y lo pasa a otro contenedor." });
    });
    it("sin instalar cuando so es ‘otro’, nodo null", () => {
        const n: NeuronaColmena = {
            nodo: null,
            vivo: true,
            so: "otro",
            enCurso: 0,
        };
        const b = botonesNeurona(n);
        expect(b.instalar.visible).toBe(false);
        expect(b.instalar.habilitado).toBe(false);
    });
    it("cuando la conexión ya está en una sala devuelve motivo correcto", () => {
        const salas = crearSalas();
        const c: any = {};
        const tema = "estacion-vivo:ABCDEF12";
        const res1 = salas.entrar(tema, c);
        expect(res1.ok).toBe(true);
        const res2 = salas.entrar("estacion-vivo:ABCDEF12", c);
        expect(res2.ok).toBe(false);
        expect(res2.motivo).toBe("Conexión ya está en una sala");
    });
    it("salir sin error cuando la conexión no está en ninguna sala", () => {
        const salas = crearSalas();
        const c: any = {};
        salas.salir(c);
        // no error thrown
        expect(salas.presencia("estacion-vivo:XXX")) .toBe(0);
    });
    it("difundir pasa cuando la longitud es exactamente el límite", () => {
        const salas = crearSalas({ maxBytes: 20 });
        const tema = "estacion-vivo:ABCDEF12";
        const emisor: any = {};
        const receptor: any = {};
        salas.entrar(tema, emisor);
        salas.entrar(tema, receptor);
        const texto: string = '{"t":"est","d":"1234"}'; // length 20
        const dest = salas.difundir(emisor, texto);
        expect(dest.length).toBe(1);
        expect(dest[0]).toBe(receptor);
    });
});
