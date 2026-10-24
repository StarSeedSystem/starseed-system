// Pruebas de TarjetaVariacion (Ola 1019V · tarea P). Sin red: adaptador y datos son de
// mentira; SaveToLibrary y ShareToDialog se sustituyen (es el patrón de tarjeta-vivo.test).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { AdaptadorFamilia } from "@/lib/variaciones/familias";
import {
  TarjetaVariacion, esVariacionDeCodigo, htmlDePayload, textoVistaPrevia, itemDeBiblioteca,
  recursoDeTarjeta, type VariacionTarjeta,
} from "../tarjeta-variacion";

vi.mock("@/components/library/save-to-library", () => ({
  SaveToLibrary: (p: { item: { title: string } }) => <button type="button">Guardar en la Biblioteca · {p.item.title}</button>,
}));
vi.mock("@/components/sharing/share-to-dialog", () => ({
  ShareToDialog: (p: { open: boolean }) => (p.open ? <div role="dialog">Compartir variación</div> : null),
}));

afterEach(cleanup);

const eventos: string[] = [];
function adaptadorFalso(): AdaptadorFamilia<unknown> {
  return {
    familia: "widget", nombre: "Falso", capturar: () => null, validar: (p) => ({ ok: true, payload: p }),
    aplicar: (clave) => { eventos.push(`aplicar:${clave}`); return { deshacer: () => eventos.push("deshacer") }; },
  };
}
function variacionFalsa(extra: Partial<VariacionTarjeta> = {}): VariacionTarjeta {
  return {
    id: "v1", clave: "widget:clima", titulo: "Cristal más alto", descripcion: "Sube el desenfoque.",
    licencia: "MIT", etiquetas: ["cristal"], valoracionMedia: 4.5, valoracionCount: 2,
    payload: { tema: "Nocturno" }, ...extra,
  };
}
const tarjeta = () => within(screen.getByRole("listitem"));

describe("helpers puros de la tarjeta", () => {
  it("esVariacionDeCodigo: lo declara la familia o lo delata el payload", () => {
    expect(esVariacionDeCodigo(variacionFalsa())).toBe(false);
    expect(esVariacionDeCodigo(variacionFalsa({ codigo: true }))).toBe(true);
    expect(esVariacionDeCodigo(variacionFalsa({ payload: { html: "<p>hola</p>" } }))).toBe(true);
  });
  it("htmlDePayload y textoVistaPrevia: vista del adaptador o payload truncado", () => {
    expect(htmlDePayload({ html: "<p>hola</p>" })).toBe("<p>hola</p>");
    expect(htmlDePayload({ otra: 1 })).toBe("");
    expect(htmlDePayload("no objeto")).toBe("");
    const adaptador = { vistaPrevia: (p: unknown) => `tema ${String((p as { tema: string }).tema)}` } as AdaptadorFamilia<unknown>;
    expect(textoVistaPrevia({ tema: "Nocturno" }, adaptador)).toBe("tema Nocturno");
    const largo = JSON.stringify({ a: "x".repeat(250) });
    expect(textoVistaPrevia({ a: "x".repeat(250) }, null)).toBe(`${largo.slice(0, 200)}…`);
    expect(textoVistaPrevia(undefined, null)).toBe("");
  });
  it("itemDeBiblioteca y recursoDeTarjeta: tarjeta → Guardar y Compartir", () => {
    const item = itemDeBiblioteca(variacionFalsa());
    expect(item.type).toBe("file"); expect(item.tags).toContain("starseed-variacion"); expect(item.tags).toContain("widget");
    expect(JSON.parse(item.content)).toMatchObject({ kind: "starseed-variacion", clave: "widget:clima", licencia: "MIT" });
    expect(recursoDeTarjeta(variacionFalsa())).toMatchObject({ kind: "archivo", id: "v1", name: "Cristal más alto" });
  });
});

describe("TarjetaVariacion", () => {
  it("pinta título, licencia, valoración, etiquetas, guardar y compartir; «Ver origen» solo con https", () => {
    render(<TarjetaVariacion variacion={variacionFalsa({ enlaceOrigen: "http://inseguro.test/x" })} adaptador={adaptadorFalso()} />);
    expect(screen.getByText("Cristal más alto")).toBeTruthy();
    expect(tarjeta().getByRole("heading", { level: 4 }).textContent).toContain("Cristal más alto");
    expect(screen.getByText("MIT")).toBeTruthy();
    expect(screen.getByText(/4\.5 \(2\)/)).toBeTruthy();
    expect(screen.getByText("cristal")).toBeTruthy();
    expect(screen.getByText(/Guardar en la Biblioteca · Cristal más alto/)).toBeTruthy();
    expect(screen.queryByText("Ver origen")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("«Probar» aplica en vivo y «Quitar prueba» deshace; sin validar no se ejecuta", () => {
    eventos.length = 0;
    render(<TarjetaVariacion variacion={variacionFalsa()} adaptador={adaptadorFalso()} />);
    fireEvent.click(screen.getByRole("button", { name: /Probar/ }));
    expect(eventos).toEqual(["aplicar:widget:clima"]);
    fireEvent.click(screen.getByRole("button", { name: /Quitar prueba/ }));
    expect(eventos).toEqual(["aplicar:widget:clima", "deshacer"]);
    cleanup();
    eventos.length = 0;
    const noValida = variacionFalsa({ payload: { token: "muy-secreto" } });
    render(<TarjetaVariacion variacion={noValida} adaptador={adaptadorFalso()} />);
    fireEvent.click(screen.getByRole("button", { name: /Probar/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/token|Privacidad/i);
    expect(eventos).toEqual([]);
  });
  it("«Probar» se deshace solo al cerrar la ventana (desmontar)", () => {
    eventos.length = 0;
    const vista = render(<TarjetaVariacion variacion={variacionFalsa()} adaptador={adaptadorFalso()} />);
    fireEvent.click(screen.getByRole("button", { name: /Probar/ }));
    vista.unmount();
    expect(eventos).toEqual(["aplicar:widget:clima", "deshacer"]);
  });
  it("«Aplicar» muestra «Deshacer» visible, que deshace", () => {
    eventos.length = 0;
    render(<TarjetaVariacion variacion={variacionFalsa()} adaptador={adaptadorFalso()} />);
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByRole("button", { name: /Deshacer/ })).toBeTruthy();
    eventos.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /Deshacer/ }));
    expect(eventos).toEqual(["deshacer"]);
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
  });
  it("las de código piden confirmación, no ejecutan hasta confirmar y quedan aisladas", () => {
    eventos.length = 0;
    render(<TarjetaVariacion variacion={variacionFalsa({ codigo: true, payload: { html: "<p>temp</p>" } })} adaptador={adaptadorFalso()} />);
    expect(screen.queryByRole("listitem")?.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts");
    fireEvent.click(screen.getByRole("button", { name: /Probar/ }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/lleva código/);
    expect(eventos).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Probar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y ejecutar" }));
    expect(eventos).toEqual(["aplicar:widget:clima"]);
  });
  it("«Compartir» abre ShareToDialog y «Ver origen» solo acepta https", () => {
    render(<TarjetaVariacion variacion={variacionFalsa({ enlaceOrigen: "https://github.com/a/b" })} adaptador={adaptadorFalso()} />);
    expect(screen.getByRole("link", { name: /Ver origen/ }).getAttribute("href")).toBe("https://github.com/a/b");
    fireEvent.click(screen.getByRole("button", { name: "Compartir" }));
    expect(screen.getByRole("dialog").textContent).toMatch(/Compartir variación/);
  });
});
