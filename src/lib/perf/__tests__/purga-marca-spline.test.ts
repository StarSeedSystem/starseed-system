// @vitest-environment jsdom
/** DIR1125A · la purga de la marca de Spline hace lo mismo que antes y cuesta lo que mide el texto, no (elementos × texto). */
import { afterEach, describe, expect, it } from "vitest";
import { ESPERA_PURGA_MS, TOPE_RAICES, crearPurgador, esTextoDeMarca, purgarProfundo, purgarRaiz, purgarSubarbol, type RelojPurga } from "../purga-marca-spline";

const LARGO = "un texto largo de la página que no tiene nada que ver con la marca de agua";

afterEach(() => {
    document.body.innerHTML = "";
});

function relojFalso(): RelojPurga & { correr(): void; programados: number; ultimaEspera: number } {
    let fn: (() => void) | null = null;
    const r = {
        programados: 0,
        ultimaEspera: 0,
        programar(f: () => void, ms: number) {
            fn = f;
            r.programados += 1;
            r.ultimaEspera = ms;
            return 1;
        },
        cancelar() {
            fn = null;
        },
        correr() {
            const f = fn;
            fn = null;
            f?.();
        },
    };
    return r;
}

describe("purgarRaiz", () => {
    it("reconoce el rótulo entero y partido", () => {
        expect(esTextoDeMarca("built with spline")).toBe(true);
        expect(esTextoDeMarca("built by spline")).toBe(true);
        expect(esTextoDeMarca("spline")).toBe(false);
        expect(esTextoDeMarca("")).toBe(false);
    });

    it("quita el enlace que apunta a spline.design", () => {
        document.body.innerHTML = `<div id="caja"><a id="logo" href="https://spline.design/?ref=x">logo</a><p id="otro">${LARGO}</p></div>`;
        expect(purgarRaiz(document)).toBeGreaterThan(0);
        expect(document.getElementById("logo")).toBeNull();
        expect(document.getElementById("otro")).not.toBeNull();
    });

    it("quita la píldora con el rótulo partido en dos nodos y deja lo demás", () => {
        document.body.innerHTML = `<div id="fondo"><div id="pildora"><span>Built with</span><span> Spline</span></div><p id="otro">${LARGO}</p></div>`;
        purgarRaiz(document);
        expect(document.getElementById("pildora")).toBeNull();
        expect(document.getElementById("fondo")).not.toBeNull();
        expect(document.getElementById("otro")).not.toBeNull();
    });

    it("no toca un texto largo que menciona Spline", () => {
        document.body.innerHTML = `<p id="p">Este fondo usa una escena hecha con Spline, built with mucho cariño por la comunidad de StarSeed OS</p>`;
        expect(purgarRaiz(document)).toBe(0);
        expect(document.getElementById("p")).not.toBeNull();
    });

    it("atraviesa los shadow roots abiertos", () => {
        const anfitrion = document.createElement("div");
        document.body.appendChild(anfitrion);
        anfitrion.attachShadow({ mode: "open" }).innerHTML = `<div><span id="marca">Built with Spline</span></div>`;
        expect(purgarProfundo(document)).toBeGreaterThan(0);
        expect(anfitrion.shadowRoot?.getElementById("marca")).toBeNull();
    });

    it("en una página grande sin la marca no lee textContent ni una vez (antes: una lectura por cada elemento)", () => {
        const partes: string[] = [];
        for (let i = 0; i < 400; i++) partes.push(`<div><div><span>dato ${i}</span><p>${LARGO}</p><button>abrir</button></div></div>`);
        document.body.innerHTML = `<div id="pagina">${partes.join("")}</div>`;
        const desc = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
        expect(desc?.get).toBeTypeOf("function");
        let lecturas = 0;
        Object.defineProperty(Node.prototype, "textContent", {
            configurable: true,
            get(this: Node) {
                lecturas += 1;
                return desc?.get?.call(this);
            },
            set(this: Node, v: string | null) {
                desc?.set?.call(this, v);
            },
        });
        try {
            expect(purgarRaiz(document)).toBe(0);
        } finally {
            if (desc) Object.defineProperty(Node.prototype, "textContent", desc);
        }
        expect(lecturas).toBe(0);
        expect(document.querySelectorAll("#pagina span").length).toBe(400);
    });

    it("un subárbol nuevo que ES la marca se quita él mismo", () => {
        document.body.innerHTML = `<div id="caja"></div>`;
        const a = document.createElement("a");
        a.id = "logo";
        a.setAttribute("href", "https://app.spline.design/x");
        document.getElementById("caja")?.appendChild(a);
        expect(purgarSubarbol(a)).toBe(1);
        expect(document.getElementById("logo")).toBeNull();
    });
});

describe("crearPurgador", () => {
    it("cien mutaciones seguidas son una sola pasada programada", () => {
        const reloj = relojFalso();
        const p = crearPurgador(document, reloj);
        document.body.innerHTML = `<div id="caja"></div>`;
        const caja = document.getElementById("caja") as HTMLElement;
        for (let i = 0; i < 100; i++) {
            const s = document.createElement("span");
            s.textContent = i === 57 ? "Built with Spline" : `dato ${i}`;
            caja.appendChild(s);
            p.alMutar([{ addedNodes: [s] }]);
        }
        expect(reloj.programados).toBe(1);
        expect(reloj.ultimaEspera).toBe(ESPERA_PURGA_MS);
        expect(p.pasadas()).toBe(0);
        reloj.correr();
        expect(p.pasadas()).toBe(1);
        expect(Array.from(caja.querySelectorAll("span")).some((s) => /spline/i.test(s.textContent ?? ""))).toBe(false);
        expect(caja.querySelectorAll("span").length).toBe(99);
        expect(100).toBeGreaterThan(TOPE_RAICES);
    });

    it("una mutación sin nodos nuevos no programa nada (quitar la marca no vuelve a disparar la purga)", () => {
        const reloj = relojFalso();
        const p = crearPurgador(document, reloj);
        p.alMutar([{ addedNodes: [] }]);
        expect(reloj.programados).toBe(0);
    });

    it("parar cancela lo pendiente", () => {
        const reloj = relojFalso();
        const p = crearPurgador(document, reloj);
        const s = document.createElement("span");
        document.body.appendChild(s);
        p.alMutar([{ addedNodes: [s] }]);
        p.parar();
        reloj.correr();
        expect(p.pasadas()).toBe(0);
    });
});
