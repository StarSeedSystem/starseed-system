// @vitest-environment jsdom
/**
 * Pruebas de la conexión «página entera en vivo» (TRD1020C): la raíz queda
 * traducida, los textos nuevos se traducen solos y `parar` lo devuelve todo
 * exacto a cómo estaba. Sin red: el cliente traduce en memoria.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { crearPaginaViva, type ClienteTraduccion } from "../pagina-viva";

function montar(html: string): HTMLElement {
    const raiz = document.createElement("div");
    raiz.innerHTML = html;
    document.body.appendChild(raiz);
    return raiz;
}

function clienteFalso(mapa: Record<string, string>): ClienteTraduccion {
    return {
        traducir: vi.fn(async ({ q }: { q: string[] }) => ({
            translatedText: q.map((texto) => mapa[texto] ?? texto),
        })),
    };
}

afterEach(() => { document.body.innerHTML = ""; });

describe("crearPaginaViva", () => {
    it("traduce la página al llegar y devuelve el original con parar (ida y vuelta exacta)", async () => {
        const raiz = montar('<p title="casa">Hola mundo</p><p>señaliza subida</p>');
        const viva = crearPaginaViva({
            cliente: clienteFalso({ "Hola mundo": "Hello world", "casa": "house", "señaliza subida": "signaling upload" }),
            raiz,
            idioma: "en",
        });
        await viva.listo;
        expect(raiz.querySelector("p")?.textContent).toContain("Hello world");
        expect(raiz.querySelector("p")?.getAttribute("title")).toBe("house");
        viva.parar();
        expect(raiz.querySelector("p")?.textContent).toContain("Hola mundo");
        expect(raiz.querySelector("p")?.getAttribute("title")).toBe("casa");
    });

    it("parte por caracteres (no por cantidad de textos) y respeta el orden", async () => {
        const largos = ["a".repeat(2_500), "b".repeat(2_500), "c".repeat(2_500)];
        const raiz = montar(largos.map((texto) => `<p>${texto}</p>`).join(""));
        const llamadas: string[][] = [];
        const cliente: ClienteTraduccion = {
            traducir: async ({ q }) => {
                llamadas.push(q);
                return { translatedText: q.map((texto) => texto.toUpperCase()) };
            },
        };
        const viva = crearPaginaViva({ cliente, raiz, idioma: "en" });
        await viva.listo;
        expect(llamadas.map((grupo) => grupo.length)).toEqual([1, 1, 1]);
        expect(llamadas.map((grupo) => grupo[0]?.[0])).toEqual(["a", "b", "c"]);
        expect(raiz.querySelectorAll("p")[2]?.textContent).toBe(largos[2]?.toUpperCase());
        viva.parar();
    });

    it("sigue los textos nuevos que aparecen y deja quieto lo prohibido", async () => {
        const raiz = montar("<p>primero</p><code>prohibido()</code>");
        const viva = crearPaginaViva({ cliente: clienteFalso({ primero: "uno", segundo: "dos" }), raiz, idioma: "en" });
        await viva.listo;
        expect(raiz.querySelectorAll("p")[0]?.textContent).toBe("uno");
        const nuevo = document.createElement("p");
        nuevo.textContent = "segundo";
        raiz.appendChild(nuevo);
        await vi.waitFor(() => expect(nuevo.textContent).toBe("dos"));
        expect(raiz.querySelector("code")?.textContent).toBe("prohibido()");
        viva.parar();
        expect(nuevo.textContent).toBe("segundo");
    });
});
