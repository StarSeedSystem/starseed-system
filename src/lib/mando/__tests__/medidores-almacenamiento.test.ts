import { describe, expect, it } from "vitest";

import {
    detalleDeMedidor,
    filasDeAlmacenamiento,
    leerNodosAlmacenamiento,
    nombreDeNodoAlmacenamiento,
    type DiscoNodo,
    type NodoAlmacenamiento,
} from "@/lib/mando/medidores";

import { pastillaDeAlmacenamiento } from "@/components/mando/centro-mando";

describe("leerNodosAlmacenamiento", () => {
    it("lee los tres nodos con disco y ordena Mac, Maggabox, A1", () => {
        const nodos = leerNodosAlmacenamiento({
            nodos: [
                { nodoId: "a1-oracle", medio: "nube", discoLibreGb: 80 },
                { nodoId: "maggabox", medio: "linux", discoLibreGb: 120.5 },
                { nodoId: "mac-local", medio: "mac", discoLibreGb: 42 },
            ],
        });
        expect(nodos.map((n) => n.nombre)).toEqual(["Mac", "Maggabox", "A1"]);
        expect(nodos[1].discoLibreGb).toBe(120.5);
    });

    it("acepta el array directo y las variantes de nombre de la medida", () => {
        const nodos = leerNodosAlmacenamiento([
            { id: "mac-1", medio: "mac", disco_libre_gb: 10 },
            { id: "a1", medio: "nube", discoLibreGB: 20 },
        ]);
        expect(nodos.map((n) => [n.id, n.discoLibreGb])).toEqual([
            ["mac-1", 10],
            ["a1", 20],
        ]);
    });

    it("descarta lo que no trae disco medido y no inventa ceros", () => {
        const nodos = leerNodosAlmacenamiento({
            nodos: [
                { nodoId: "sin-disco", medio: "mac" },
                { nodoId: "roto", medio: "linux", discoLibreGb: "mucho" },
                { nodoId: "", medio: "mac", discoLibreGb: 3 },
                null,
                "no-es-nodo",
            ],
        });
        expect(nodos).toEqual([]);
        expect(leerNodosAlmacenamiento(null)).toEqual([]);
        expect(leerNodosAlmacenamiento({ nodos: "no-es-lista" })).toEqual([]);
    });

    it("conserva el cero medido: un disco sin espacio no es «sin dato»", () => {
        const [nodo] = leerNodosAlmacenamiento([{ nodoId: "mac-local", medio: "mac", discoLibreGb: 0 }]);
        expect(nodo.discoLibreGb).toBe(0);
    });
});

describe("nombreDeNodoAlmacenamiento", () => {
    it("traduce los ids reales y deja los desconocidos tal cual", () => {
        expect(nombreDeNodoAlmacenamiento("mac-local")).toBe("Mac");
        expect(nombreDeNodoAlmacenamiento("maggabox")).toBe("Maggabox");
        expect(nombreDeNodoAlmacenamiento("a1-oracle")).toBe("A1");
        expect(nombreDeNodoAlmacenamiento("nodo-x", "linux")).toBe("Linux");
        expect(nombreDeNodoAlmacenamiento("nodo-x", "nube")).toBe("Nube");
        expect(nombreDeNodoAlmacenamiento("nodo-x", "otro")).toBe("nodo-x");
    });
});

describe("detalleDeMedidor · almacenamiento", () => {
    it("resume los discos libres con sus nombres y ofrece el mapa de medios", () => {
        const d = detalleDeMedidor("almacenamiento", {
            almacenamiento: {
                nodos: [
                    { id: "mac-local", nombre: "Mac", medio: "mac", discoLibreGb: 42, almacen: [] },
                    { id: "maggabox", nombre: "Maggabox", medio: "linux", discoLibreGb: 120, almacen: [] },
                    { id: "a1-oracle", nombre: "A1", medio: "nube", discoLibreGb: 80, almacen: [] },
                ],
            },
        });
        expect(d.titulo).toBe("Almacenamiento");
        expect(d.resumen).toBe("Nodos con disco libre: Mac (42 GB), Maggabox (120 GB), A1 (80 GB)");
        expect(d.filas.map((f) => f.id)).toEqual(["mac-local", "maggabox", "a1-oracle"]);
        expect(d.filas[0].detalle).toEqual({ discoLibres: 42, origen: "mac", almacen: [] });
        expect(d.acciones).toEqual([
            { clase: "ir-a", texto: "Ver mapa de medios", destino: "mapa-medios", destructiva: false },
        ]);
    });

    it("avisa de medio único cuando solo un nodo declara disco", () => {
        const d = detalleDeMedidor("almacenamiento", {
            almacenamiento: {
                nodos: [{ id: "mac-local", nombre: "Mac", medio: "mac", discoLibreGb: 8, almacen: [] }],
            },
        });
        expect(d.aviso).toContain("Medio único");
        expect(d.filas[0].estado).toBe("bajo");
    });

    it("sin nodos no inventa cifras y explica de dónde saldrían", () => {
        const d = detalleDeMedidor("almacenamiento", {});
        expect(d.resumen).toBe("sin dato");
        expect(d.filas).toEqual([]);
        expect(d.vacio).toBeTruthy();
        expect(d.aviso).toBeUndefined();
    });
});

describe("filasDeAlmacenamiento", () => {
    it("marca bajo y crítico según el disco que queda", () => {
        const filas = filasDeAlmacenamiento([
            { id: "a", nombre: "A", medio: "mac", discoLibreGb: 3, almacen: [] },
            { id: "b", nombre: "B", medio: "linux", discoLibreGb: 10, almacen: [] },
            { id: "c", nombre: "C", medio: "nube", discoLibreGb: 30, almacen: [] },
        ]);
        expect(filas.map((f) => f.estado)).toEqual(["crítico", "bajo", "libre"]);
    });

    it("crea filas separadas para disco interno principal y externo secundario de Maggabox", () => {
        const discos: DiscoNodo[] = [
            { rol: "principal", libreGb: 397, totalGb: 453, estado: "ok", montado: true, punto: "/" },
            { rol: "secundario", libreGb: 418, totalGb: 500, estado: "ok", montado: true, punto: "/srv/starseed-almacen" },
        ];
        const nodos: NodoAlmacenamiento[] = [
            {
                id: "maggabox",
                nombre: "Maggabox",
                medio: "linux",
                discoLibreGb: 397,
                almacen: [],
                discos,
            },
        ];
        const filas = filasDeAlmacenamiento(nodos);
        expect(filas.length).toBe(2);
        expect(filas[0].titulo).toBe("Maggabox · interno (principal)");
        expect(filas[0].detalle?.discoLibres).toBe(397);
        expect(filas[0].detalle?.rol).toBe("principal");
        expect(filas[1].titulo).toBe("Maggabox · disco externo (secundario)");
        expect(filas[1].detalle?.discoLibres).toBe(418);
        expect(filas[1].detalle?.rol).toBe("secundario: respaldos y datos no fundamentales");
    });

    it("marca el disco externo en aviso cuando no está montado y en rojo con errores", () => {
        const discosAviso: DiscoNodo[] = [
            { rol: "principal", libreGb: 397, totalGb: 453, estado: "ok", montado: true },
            { rol: "secundario", libreGb: 0, totalGb: 500, estado: "aviso", montado: false },
        ];
        const nodosAviso: NodoAlmacenamiento[] = [
            {
                id: "maggabox",
                nombre: "Maggabox",
                medio: "linux",
                discoLibreGb: 397,
                almacen: [],
                discos: discosAviso,
            },
        ];
        const filasAviso = filasDeAlmacenamiento(nodosAviso);
        expect(filasAviso[1].estado).toBe("aviso");
        expect(filasAviso[1].porque).toContain("sin montar");
        expect(filasAviso[1].usableComoDestino).toBe(false);

        const discosError: DiscoNodo[] = [
            { rol: "principal", libreGb: 397, totalGb: 453, estado: "ok", montado: true },
            { rol: "secundario", libreGb: 100, totalGb: 500, estado: "error", montado: true, errores: 5 },
        ];
        const nodosError: NodoAlmacenamiento[] = [
            {
                id: "maggabox",
                nombre: "Maggabox",
                medio: "linux",
                discoLibreGb: 397,
                almacen: [],
                discos: discosError,
            },
        ];
        const filasError = filasDeAlmacenamiento(nodosError);
        expect(filasError[1].estado).toBe("error");
        expect(filasError[1].porque).toContain("5 errores");
        expect(filasError[1].usableComoDestino).toBe(false);
    });
});

describe("pastillaDeAlmacenamiento", () => {
    it("devuelve null sin filas", () => {
        const pastilla = pastillaDeAlmacenamiento([]);
        expect(pastilla).toBeNull();
    });

    it("muestra Maggabox principal como valor y los demás nodos en el detalle", () => {
        const filas = [
            { titulo: "Mac", detalle: { discoLibres: 13 }, estado: "libre" },
            { titulo: "Maggabox", detalle: { discoLibres: 397 }, estado: "libre" },
            { titulo: "A1", detalle: { discoLibres: 9 }, estado: "libre" },
            { titulo: "Drive", detalle: { discoLibres: 0 }, estado: "libre" },
        ] as any;
        const pastilla = pastillaDeAlmacenamiento(filas);
        expect(pastilla).not.toBeNull();
        expect(pastilla!.valor).toBe("Maggabox 397 GB libres");
        expect(pastilla!.detalle).toContain("Mac 13 GB");
        expect(pastilla!.detalle).toContain("A1 9 GB");
        expect(pastilla!.detalle).toContain("Drive 0 GB");
        expect(pastilla!.tono).toBe("ok");
    });

    it("usa tono crítico si algún nodo está crítico", () => {
        const filas = [
            { titulo: "Mac", detalle: { discoLibres: 2 }, estado: "crítico" },
            { titulo: "Maggabox", detalle: { discoLibres: 397 }, estado: "libre" },
        ] as any;
        const pastilla = pastillaDeAlmacenamiento(filas);
        expect(pastilla!.tono).toBe("peligro");
    });

    it("usa tono aviso si algún nodo está bajo", () => {
        const filas = [
            { titulo: "Mac", detalle: { discoLibres: 10 }, estado: "bajo" },
            { titulo: "Maggabox", detalle: { discoLibres: 397 }, estado: "libre" },
        ] as any;
        const pastilla = pastillaDeAlmacenamiento(filas);
        expect(pastilla!.tono).toBe("aviso");
    });
});
