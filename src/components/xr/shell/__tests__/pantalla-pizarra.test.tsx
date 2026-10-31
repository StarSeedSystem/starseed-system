/**
 * XR1010Y · pantallas y pizarras 3D. El lienzo (three/R3F/uikit) se simula: lo que se prueba
 * es la decisión pura (qué se puede pintar, capas, roles y fusión) y las tarjetas honestas.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PantallaMundo, PizarraMundo } from "@/lib/xr/mundo-tipos";
import type { Sala } from "@/lib/salas/sala";
import type { Propiedades } from "@/lib/salas/propiedad-sala";
vi.mock("@react-three/uikit", () => ({
    Container: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <div onClick={onClick}>{children}</div>,
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@react-three/xr", () => ({ XRLayer: () => <div data-testid="xr-layer" /> }));
import { clasificarPantalla, Pantalla3D, puedeUsarCapas, suenaEnPantalla, tipoVisualDeContentType, tipoVisualDeUrl } from "../pantalla-3d";
import { agregarTrazo, cederTrazo, crearEstadoPizarra, decidirPizarra, fusionarPizarra, Pizarra3D, retirarTrazo, trazosDeEstado } from "../pizarra-3d";

const URL_WEB = "https://ejemplo.org/una/noticia";
function pantalla(fuente: PantallaMundo["fuente"]): PantallaMundo {
    return { id: "pantalla", pos: [0, 1.5, -2], rot: [0, 0, 0], ancho: 3, fuente, sonido: "mudo" };
}
function pizarraMundo(salaId?: string): PizarraMundo {
    return { id: "pizarra", pos: [0, 1, -2], rot: [0, 0, 0], ancho: 2, alto: 1.2, ...(salaId ? { salaId } : {}) };
}
function salaCompartida(): Sala {
    return { id: "sala-1", tipo: "pizarra", titulo: "Pizarra del huerto", visibilidad: "grupo", transporte: "malla-p2p", miembros: { ana: "observador", luis: "editor" }, creadaEn: 1 };
}
afterEach(cleanup);

describe("Pantalla3D · solo vídeo o imagen, nunca HTML incrustado", () => {
    it("una web normal muestra la tarjeta de solo 2D y no crea ningún iframe", () => {
        const decision = clasificarPantalla({ tipo: "https", url: URL_WEB });
        expect(decision.clase).toBe("solo-2d");
        expect(decision.titulo).toBe("Esta página solo se puede ver en 2D");
        const { container } = render(<Pantalla3D pantalla={pantalla({ tipo: "https", url: URL_WEB })} capas={false} alSalir2D={vi.fn()} />);
        expect(screen.getByText("Esta página solo se puede ver en 2D")).toBeInTheDocument();
        expect(container.querySelector("iframe")).toBeNull();
    });

    it("un .mp4 y una imagen entran; también se acepta un Content-Type visual de un HEAD con CORS", () => {
        expect(tipoVisualDeUrl("https://cdn.org/video.MP4?token=1")).toBe("video");
        expect(tipoVisualDeUrl("https://cdn.org/foto.webp")).toBe("imagen");
        expect(tipoVisualDeContentType("video/webm; charset=utf-8")).toBe("video");
        expect(tipoVisualDeContentType("image/avif")).toBe("imagen");
        expect(tipoVisualDeContentType("text/html")).toBeNull();
        expect(clasificarPantalla({ tipo: "https", url: "https://cdn.org/a.mp4" }).visible).toBe(true);
    });

    it("las capas solo se usan con la función layers concedida y nunca en Android XR ni Vision Pro", () => {
        expect(puedeUsarCapas(true, ["layers"], "quest")).toBe(true);
        expect(puedeUsarCapas(true, ["layers"], "magic-leap")).toBe(true);
        expect(puedeUsarCapas(true, [], "quest")).toBe(false);
        expect(puedeUsarCapas(false, ["layers"], "quest")).toBe(false);
        expect(puedeUsarCapas(true, ["layers"], "android-xr")).toBe(false);
        expect(puedeUsarCapas(true, ["layers"], "visionos")).toBe(false);
    });

    it("una estación sin imagen lo dice y ofrece su enlace 2D", () => {
        const decision = clasificarPantalla({ tipo: "estacion", id: "cumbre" });
        expect(decision.titulo).toBe("Esta estación no se puede ver en 3D todavía");
        expect(decision.visible).toBe(false);
        expect(decision.ruta2D).toBe("/estaciones/vivo/cumbre");
    });

    it("una app del OS tampoco se incrusta: tarjeta 2D con su ruta normal", () => {
        const decision = clasificarPantalla({ tipo: "app", ruta: "/biblioteca" });
        expect(decision.clase).toBe("app");
        expect(decision.titulo).toBe("Esta página solo se puede ver en 2D");
        expect(decision.ruta2D).toBe("/biblioteca");
    });

    it("la llamada enseña su vídeo y la ruta de sala cuando se conoce la sesión", () => {
        const decision = clasificarPantalla({ tipo: "llamada" }, { sesionLlamada: "abc" });
        expect(decision.clase).toBe("llamada");
        expect(decision.visible).toBe(true);
        expect(decision.ruta2D).toBe("/sala-xr?sesion=abc&modo=vr");
        expect(suenaEnPantalla("espacial")).toBe(true);
        expect(suenaEnPantalla("mudo")).toBe(false);
    });

    it("«Salir y abrir en 2D» tiene efecto real y no finge un botón muerto", () => {
        const alSalir2D = vi.fn();
        render(<Pantalla3D pantalla={pantalla({ tipo: "https", url: URL_WEB })} capas={false} alSalir2D={alSalir2D} />);
        fireEvent.click(screen.getByText("Salir y abrir en 2D"));
        expect(alSalir2D).toHaveBeenCalledWith(URL_WEB);
    });
});

describe("Pizarra3D · rol y fusión con lápidas", () => {
    it("el observador no dibuja; el editor y el dueño sí; sin salaId es local", () => {
        const sala = salaCompartida();
        expect(decidirPizarra(pizarraMundo("sala-1"), sala, "ana").puedeDibujar).toBe(false);
        expect(decidirPizarra(pizarraMundo("sala-1"), sala, "luis").puedeDibujar).toBe(true);
        expect(decidirPizarra(pizarraMundo(), sala, "ana").puedeDibujar).toBe(true);
        expect(decidirPizarra(pizarraMundo("sala-1"), null, "luis").puedeDibujar).toBe(false);
    });

    it("el trazo del editor llega al estado y se fusiona con el concurrente sin perder ninguno", () => {
        const mio = agregarTrazo(crearEstadoPizarra("sala-1"), { id: "mio", puntos: [[0, 0, 0], [1, 1, 1]], color: "#fff", grosor: 0.01 }, { dispositivo: "luis", ahora: 10 });
        const suyo = agregarTrazo(crearEstadoPizarra("sala-1"), { id: "suyo", puntos: [[0, 0, 0], [2, 2, 2]], color: "#0ff", grosor: 0.01 }, { dispositivo: "ana", ahora: 11 });
        expect(mio.ok && suyo.ok).toBe(true);
        const fusion = fusionarPizarra(mio.estado, suyo.estado, "luis");
        expect(Object.keys(fusion.resultado.elementos).sort()).toEqual(["mio", "suyo"]);
        expect(trazosDeEstado(fusion.resultado)).toHaveLength(2);
    });

    it("el mismo trazo tocado por dos personas no se pierde: gana el más nuevo", () => {
        const primero = agregarTrazo(crearEstadoPizarra("sala-1"), { id: "trazo-1", puntos: [[0, 0, 0], [1, 1, 1]], color: "#fff", grosor: 0.01 }, { dispositivo: "luis", ahora: 10 }).estado;
        const segundo = agregarTrazo(crearEstadoPizarra("sala-1"), { id: "trazo-1", puntos: [[0, 0, 0], [3, 3, 3]], color: "#0ff", grosor: 0.01 }, { dispositivo: "ana", ahora: 12 }).estado;
        const fusion = fusionarPizarra(primero, segundo, "luis");
        expect(trazosDeEstado(fusion.resultado)[0].puntos).toEqual([[0, 0, 0], [3, 3, 3]]);
    });

    it("el observador ve la tarjeta «Solo lectura» y el motivo de su rol", () => {
        render(<Pizarra3D pizarra={pizarraMundo("sala-1")} sala={salaCompartida()} usuarioId="ana" />);
        expect(screen.getByText("Solo lectura")).toBeInTheDocument();
        expect(screen.getByText(/miras la pizarra, no dibujas/)).toBeInTheDocument();
    });
});

describe("Pizarra3D · propiedad por épocas conectada", () => {
    it("dibujar reclama el trazo; tocar el trazo ajeno se rechaza y se explica sin tecnicismos", () => {
        const deLuis = agregarTrazo(crearEstadoPizarra("sala-1"), { id: "t-1", puntos: [[0, 0, 0], [1, 1, 1]], color: "#fff", grosor: 0.01 }, { dispositivo: "luis", ahora: 10, dueno: "luis", propiedades: {} });
        expect(deLuis.ok).toBe(true);
        expect(deLuis.propiedades?.["t-1"]).toEqual({ dueno: "luis", epoca: 1 });
        const deAna = agregarTrazo(crearEstadoPizarra("sala-1"), { id: "t-1", puntos: [[0, 0, 0], [9, 9, 9]], color: "#0ff", grosor: 0.01 }, { dispositivo: "ana", ahora: 12, dueno: "ana", propiedades: deLuis.propiedades });
        expect(deAna.ok).toBe(false);
        expect(deAna.motivo).toContain("pídesela");
        expect(deAna.motivo?.toLowerCase()).not.toContain("época");
        // El estado queda como estaba: nada de ana pisa el trazo de luis.
        expect(trazosDeEstado(deAna.estado).filter((t) => t.id === "t-1")).toHaveLength(0);
    });

    it("la decisión por elemento manda: el dueño retoca lo suyo y el otro recibe la explicación", () => {
        const sala = salaCompartida();
        const props: Propiedades = { "t-1": { dueno: "luis", epoca: 2 } };
        expect(decidirPizarra(pizarraMundo("sala-1"), sala, "luis", props, "t-1").puedeDibujar).toBe(true);
        const deniega = decidirPizarra(pizarraMundo("sala-1"), sala, "ana", props, "t-1");
        expect(deniega.puedeDibujar).toBe(false);
        expect(deniega.motivo).toContain("Esa pieza la tiene luis");
    });

    it("fusionar lleva también el mapa de propiedad: gana la época mayor en los dos órdenes", () => {
        const mio = agregarTrazo(crearEstadoPizarra("sala-1"), { id: "mio", puntos: [[0, 0, 0], [1, 1, 1]], color: "#fff", grosor: 0.01 }, { dispositivo: "luis", ahora: 10, dueno: "luis", propiedades: {} });
        const suyo = agregarTrazo(crearEstadoPizarra("sala-1"), { id: "suyo", puntos: [[0, 0, 0], [2, 2, 2]], color: "#0ff", grosor: 0.01 }, { dispositivo: "ana", ahora: 11, dueno: "ana", propiedades: {} });
        const propsMias: Propiedades = { "t-1": { dueno: "luis", epoca: 3 } };
        const propsSuyas: Propiedades = { "t-1": { dueno: "ana", epoca: 1 } };
        const ab = fusionarPizarra(mio.estado, suyo.estado, "luis", propsMias, propsSuyas);
        const ba = fusionarPizarra(suyo.estado, mio.estado, "ana", propsSuyas, propsMias);
        expect(ab.propiedades?.["t-1"].epoca).toBe(3);
        expect(ba.propiedades?.["t-1"].epoca).toBe(3);
        expect(ab.disputas).toEqual(["t-1"]);
        expect(ba.disputas).toEqual(["t-1"]);
    });

    it("ceder sube la época; retirar lo hace solo el dueño de la sala y queda registrado", () => {
        const props: Propiedades = { "t-1": { dueno: "luis", epoca: 1 } };
        const cedido = cederTrazo(props, "t-1", "luis", "ana");
        expect(cedido["t-1"]).toEqual({ dueno: "ana", epoca: 2 });
        const salaConDueno: Sala = { ...salaCompartida(), miembros: { luis: "editor", ana: "editor", pato: "dueno" } };
        const negado = retirarTrazo(salaConDueno, "luis", cedido, "t-1", "pato");
        expect(negado.ok).toBe(false);
        const forzado = retirarTrazo(salaConDueno, "pato", cedido, "t-1", "pato");
        expect(forzado.ok).toBe(true);
        if (!forzado.ok) throw new Error("el dueño de la sala debería poder");
        expect(forzado.propiedades["t-1"]).toEqual({ dueno: "pato", epoca: 3 });
        expect(forzado.porQuien).toBe("pato");
        expect(forzado.aQuien).toBe("pato");
    });
});
