/**
 * El medidor «Contenedores en la nube» (2026-09-22).
 *
 * Alex lo pidió en tres mensajes seguidos: un medidor en el pulso con su ventana como los
 * demás, un botón para buscar contenedores a mano desde la ventana de agentes, y que la
 * información de cada servicio la usen también los directores para enrutar.
 *
 * La regla que estos tests defienden: NINGÚN número de esta ventana se calcula aquí. Todos
 * vienen medidos de `contenedores_nube.py`, el mismo archivo que lee el director de la nube
 * para decidir dónde desplegar. Si la ventana calculara por su cuenta, volveríamos a tener
 * dos verdades sobre la misma capacidad.
 */
import { describe, expect, it } from "vitest";

import { detalleDeMedidor, libresDeContenedores, type DatosMedidores } from "@/lib/mando/medidores";

const GH = {
    id: "nube-gh",
    servicio: "GitHub Actions",
    proveedor: "GitHub (repo público)",
    estado: "usable",
    maquina: "4 vCPU · 16 GB · 6 h por job",
    jobs_simultaneos: 3,
    agentes_por_job: 4,
    agentes_ahora: 4,
    runs_ahora: 1,
    agentes_libres: 8,
    coste: "gratis y sin tope de minutos (repo público)",
    detalle: "9 clave(s) de proveedor · 1 ejecución(es) en marcha",
    falta: "",
    siguiente_paso: "python3 scripts/puente/nube-gh.py lanzar",
    lanza: "python3 scripts/puente/nube-gh.py lanzar",
    desplegable: true,
};

const HF = {
    ...GH,
    id: "hf",
    servicio: "Hugging Face Spaces",
    proveedor: "Hugging Face",
    estado: "requiere_alex",
    jobs_simultaneos: 0,
    agentes_por_job: 0,
    agentes_ahora: 0,
    runs_ahora: 0,
    agentes_libres: 0,
    falta: "exige PRO (HTTP 402)",
    siguiente_paso: "solo con PRO (9 $/mes)",
    desplegable: false,
};

const inventario: DatosMedidores["contenedores"] = {
    generado: "2026-09-22 22:30:00",
    contenedores: [GH, HF],
    resumen: { contenedores: 2, usables: 1, agentes_ahora: 4, agentes_libres: 8, agentes_tope: 12, por_hacer: 1 },
};

describe("medidor de contenedores", () => {
    it("el resumen dice lo que hay, lo libre y el tope, con la hora de la medida", () => {
        const d = detalleDeMedidor("contenedores", { contenedores: inventario });
        expect(d.titulo).toBe("Contenedores en la nube");
        expect(d.resumen).toContain("4 agente(s) trabajando");
        expect(d.resumen).toContain("8 libre(s) de 12");
        expect(d.resumen).toContain("1 de 2 servicio(s) usable(s)");
        expect(d.resumen).toContain("22:30:00");
    });

    it("cada servicio trae su ficha completa: proveedor, máquina, capacidad y coste", () => {
        const d = detalleDeMedidor("contenedores", { contenedores: inventario });
        const fila = d.filas.find((f) => f.id === "nube-gh");
        const etiquetas = (fila?.ficha ?? []).map((x) => x.etiqueta);
        expect(etiquetas).toEqual(
            expect.arrayContaining(["Servicio", "Proveedor", "Máquina", "Capacidad", "Agentes ahora", "Sitio libre", "Coste"]),
        );
        const cap = fila?.ficha?.find((x) => x.etiqueta === "Capacidad");
        expect(cap?.valor).toContain("3 job(s) simultáneo(s) × 4 agentes = 12");
    });

    it("solo ofrece desplegar donde hay sitio", () => {
        const d = detalleDeMedidor("contenedores", { contenedores: inventario });
        const gh = d.filas.find((f) => f.id === "nube-gh");
        const hf = d.filas.find((f) => f.id === "hf");
        expect(gh?.acciones.map((a) => a.clase)).toContain("desplegar-nube");
        expect(hf?.acciones).toEqual([]);
    });

    it("un servicio que requiere a Alex dice QUÉ falta y el paso que lo arregla", () => {
        const d = detalleDeMedidor("contenedores", { contenedores: inventario });
        const hf = d.filas.find((f) => f.id === "hf");
        expect(hf?.porque).toContain("PRO");
        const falta = hf?.ficha?.find((x) => x.etiqueta === "Falta");
        expect(falta?.aviso).toBe(true);
        expect(hf?.ficha?.find((x) => x.etiqueta === "Siguiente paso")?.valor).toContain("PRO");
    });

    it("siempre se puede volver a buscar contenedores", () => {
        const d = detalleDeMedidor("contenedores", { contenedores: inventario });
        expect(d.acciones.map((a) => a.clase)).toContain("sondear-contenedores");
    });

    it("sin medida no promete capacidad: lo dice y no ofrece desplegar", () => {
        const d = detalleDeMedidor("contenedores", { contenedores: null });
        expect(d.resumen).toContain("sin medir");
        expect(d.acciones.map((a) => a.clase)).toContain("sondear-contenedores");
        expect(d.acciones.map((a) => a.clase)).not.toContain("desplegar-nube");
        expect(d.filas).toEqual([]);
    });

    it("con todo lleno no ofrece desplegar y marca el aviso en la ficha", () => {
        const lleno: DatosMedidores["contenedores"] = {
            contenedores: [{ ...GH, agentes_ahora: 12, runs_ahora: 3, agentes_libres: 0, desplegable: false }],
            resumen: { contenedores: 1, usables: 1, agentes_ahora: 12, agentes_libres: 0, agentes_tope: 12 },
        };
        const d = detalleDeMedidor("contenedores", { contenedores: lleno });
        expect(d.acciones.map((a) => a.clase)).not.toContain("desplegar-nube");
        expect(d.filas[0].ficha?.find((x) => x.etiqueta === "Sitio libre")?.aviso).toBe(true);
    });
});

describe("el botón que Alex pidió en la ventana de agentes", () => {
    const latidos = [{ tarea: "T1", fase: "escribiendo", modelo: "nim/kimi-k3", minutos: 2, donde: "mac" }];

    it("la ventana de agentes puede buscar contenedores y desplegar si hay sitio", () => {
        const d = detalleDeMedidor("agentes", { latidos, contenedores: inventario });
        const clases = d.acciones.map((a) => a.clase);
        expect(clases).toContain("sondear-contenedores");
        expect(clases).toContain("desplegar-nube");
        expect(d.acciones.find((a) => a.clase === "desplegar-nube")?.texto).toContain("8 libres");
    });

    it("sin sitio medido ofrece buscar, pero no desplegar", () => {
        const d = detalleDeMedidor("agentes", { latidos, contenedores: null });
        const clases = d.acciones.map((a) => a.clase);
        expect(clases).toContain("sondear-contenedores");
        expect(clases).not.toContain("desplegar-nube");
    });
});

describe("libresDeContenedores", () => {
    it("devuelve el sitio libre medido", () => {
        expect(libresDeContenedores(inventario)).toBe(8);
    });

    it("sin inventario vale 0: no se promete capacidad sin medirla", () => {
        expect(libresDeContenedores(null)).toBe(0);
        expect(libresDeContenedores(undefined)).toBe(0);
    });

    it("un número absurdo no se cuela", () => {
        expect(libresDeContenedores({ contenedores: [], resumen: { agentes_libres: -5 } })).toBe(0);
        expect(libresDeContenedores({ contenedores: [], resumen: { agentes_libres: Number.NaN } })).toBe(0);
    });
});
