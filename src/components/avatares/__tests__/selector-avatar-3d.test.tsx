// @vitest-environment jsdom
/**
 * Selector de avatar 3D (AV1011D): elegir plantilla u orbe guarda el ADN del dueño de verdad, cambiar de avatar no apila
 * ADN huérfanos, una entidad sin papel solo ve, y el componente no se queda resolviendo fuentes en bucle.
 *
 * Integración de RTAV1011Ld (bucle de render, opción falsa fuera, peso de cada plantilla) sobre RTAV1011Dd-d1 (almacén del
 * ADN): el bucle de Ld nacía de un efecto que cargaba fuentes con listas nuevas en cada render; el selector de Dd ya no las
 * carga (lee el ADN del almacén y AvatarVivo pinta), así que las pruebas de Ld pasan de «exactamente N lecturas» a «ni una
 * lectura más del tope ni crecimiento con el tiempo», y la anti-bucle de Dd (guarda un ADN antes de montar) es la estricta.
 */
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Se mockean solo módulos del proyecto: el resolutor de la Biblioteca (cuenta las llamadas), el visor 3D (no hay WebGL en
// jsdom; cuenta cuántas veces se pinta) y la escritura de preferencias (no hay cuenta).
const h = vi.hoisted(() => ({
  espejo: vi.fn(async () => ({ ok: true, atomic: true })),
  pintado: vi.fn(),
  refs: [] as string[],
  TOPE_CORTAFUEGOS: 50,
}));
vi.mock("@/lib/avatares/adaptadores/resolver-ref-biblioteca", () => ({
  // Pasado el cortafuegos devuelve una promesa que nunca vuelve: un bucle hace FALLAR la prueba (más lecturas que el tope) en vez de colgarla.
  getFuenteParaRef: (ref: string) => {
    h.refs.push(ref);
    if (h.refs.length > h.TOPE_CORTAFUEGOS) return new Promise<never>(() => undefined);
    return Promise.resolve({ tipo: "procedural" as const, svg: "" });
  },
}));
vi.mock("@/lib/sync/user-prefs", () => ({ mergeUserPrefs: h.espejo }));
vi.mock("@/components/avatares/avatar-vivo", () => ({ AvatarVivo: (p: { adn?: { nombre: string } }) => { h.pintado(p.adn?.nombre); return <div data-testid="avatar-vivo">{p.adn?.nombre}</div>; } }));
vi.mock("@/components/ui/button", () => ({ Button: (p: { onClick?: () => void; disabled?: boolean; children?: React.ReactNode }) => <button type="button" disabled={p.disabled} onClick={p.onClick}>{p.children}</button> }));
vi.mock("@/components/ui/card", () => ({ Card: (p: { children?: React.ReactNode }) => <div>{p.children}</div>, CardContent: (p: { children?: React.ReactNode }) => <div>{p.children}</div> }));
vi.mock("@/components/ui/badge", () => ({ Badge: (p: { children?: React.ReactNode }) => <span>{p.children}</span> }));

import SelectorAvatar3d from "../selector-avatar-3d";
import { adnActualDeDueno, getSavedAdnEntries, parseAdnEntry, saveAdnToLibrary } from "@/lib/avatares/adaptadores/almacen-adn";
import { PLANTILLAS_AVATAR, adnDePlantilla } from "@/lib/avatares/plantillas";

const abrir = () => fireEvent.click(screen.getByText("Ver opciones"));

/** Una persona propia por defecto: el selector ya no se monta sin dueño (`esPropio` es obligatorio). */
const montar = (props: React.ComponentProps<typeof SelectorAvatar3d> = { profileId: "p1", esPropio: true }) =>
  render(<SelectorAvatar3d {...props} />);

/** Deja pasar `turnos` vueltas de microtareas, cada una dentro de su propio `act` para que React vuelva a renderizar entre ellas. */
async function reposar(turnos: number): Promise<void> {
  for (let i = 0; i < turnos; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  h.refs.length = 0;
  localStorage.clear();
  h.espejo.mockClear();
  h.pintado.mockClear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

/* Regresión (RTAV1011Ld): el selector declaraba sus listas de opciones DENTRO del componente y las usaba como dependencias del
 * efecto de carga. Eran arrays nuevos en cada render y el efecto hacía setState con Maps nuevos: se volvía a renderizar sin fin
 * (en una Mac de 8 GB congelaría la página en cuanto alguien lo montase). Tope de lecturas = las de antes (1 fija + 6 plantillas
 * + el avatar actual); hoy el selector no lee ninguna, y lo que importa es que NO CREZCAN con el tiempo ni al abrir las opciones. */
const TOPE_LECTURAS = 2 + PLANTILLAS_AVATAR.length;

describe("SelectorAvatar3d · carga de fuentes", () => {
  it("al montar no lee más del tope y no vuelve a leer aunque pasen muchos turnos", async () => {
    montar();
    await reposar(200);
    const tras = h.refs.length;
    expect(tras).toBeLessThanOrEqual(1 + PLANTILLAS_AVATAR.length);
    await reposar(200);
    expect(h.refs).toHaveLength(tras);
  });

  it("con un avatar ya elegido (guardado en el almacén) no lee más del tope y se queda ahí", async () => {
    await saveAdnToLibrary(adnDePlantilla("arla", { tipo: "perfil", id: "p1" }, "x1")!, "privado");
    montar();
    await reposar(200);
    const tras = h.refs.length;
    expect(tras).toBeLessThanOrEqual(TOPE_LECTURAS);
    await reposar(200);
    expect(h.refs).toHaveLength(tras);
  });

  it("abrir las opciones no relee nada", async () => {
    montar();
    await reposar(20);
    const antes = h.refs.length;
    fireEvent.click(screen.getByRole("button", { name: "Ver opciones" }));
    await reposar(200);
    expect(h.refs).toHaveLength(antes);
  });
});

describe("SelectorAvatar3d · opciones honestas", () => {
  it("ofrece el orbe y las 6 plantillas CC0, sin la falsa «Persona VRM», y cada plantilla dice lo que pesa", async () => {
    montar();
    await reposar(20);
    fireEvent.click(screen.getByRole("button", { name: "Ver opciones" }));
    expect(screen.queryByLabelText("Elegir Persona VRM")).toBeNull();
    expect(screen.getByLabelText("Elegir Orbe")).toBeTruthy();
    expect(PLANTILLAS_AVATAR).toHaveLength(6);
    for (const p of PLANTILLAS_AVATAR) {
      const tarjeta = screen.getByLabelText(`Elegir ${p.nombre}`);
      const mb = `${(p.bytesVrm / 1e6).toFixed(1).replace(".", ",")} MB`;
      expect(within(tarjeta).getByText(mb)).toBeTruthy();
    }
    expect(within(screen.getByLabelText("Elegir Avatar Senet 2026")).getByText("8,9 MB")).toBeTruthy();
  });
});

describe("SelectorAvatar3d", () => {
  it("elegir una plantilla guarda el ADN del perfil y lo muestra con su nombre", async () => {
    const onChange = vi.fn();
    render(<SelectorAvatar3d profileId="p1" esPropio onChange={onChange} />);
    abrir();
    fireEvent.click(screen.getByLabelText("Elegir Avatar Arla"));
    await waitFor(() => expect(screen.getByTestId("avatar-vivo").textContent).toBe("Avatar Arla"));
    const guardado = adnActualDeDueno({ tipo: "perfil", id: "p1" });
    expect(guardado?.title).toBe("Avatar Arla");
    expect(onChange).toHaveBeenCalledWith(`biblioteca:${guardado!.id}`);
  });

  it("cambiar de avatar actualiza el mismo ADN (revisión +1) y no apila otros", async () => {
    render(<SelectorAvatar3d profileId="p1" esPropio />);
    abrir();
    fireEvent.click(screen.getByLabelText("Elegir Avatar Arla"));
    await waitFor(() => expect(screen.getByTestId("avatar-vivo").textContent).toBe("Avatar Arla"));
    fireEvent.click(screen.getByLabelText("Elegir Avocado"));
    await waitFor(() => expect(screen.getByTestId("avatar-vivo").textContent).toBe("Avocado"));
    expect(getSavedAdnEntries()).toHaveLength(1);
    expect(getSavedAdnEntries()[0].rev).toBe(1);
  });

  it("al volver a montarlo recuerda el avatar del dueño", async () => {
    const primero = render(<SelectorAvatar3d profileId="p1" esPropio />);
    abrir();
    fireEvent.click(screen.getByLabelText("Elegir Avocado"));
    await waitFor(() => expect(screen.getByTestId("avatar-vivo").textContent).toBe("Avocado"));
    primero.unmount();
    render(<SelectorAvatar3d profileId="p1" esPropio />);
    await waitFor(() => expect(screen.getByTestId("avatar-vivo").textContent).toBe("Avocado"));
  });

  it("una entidad sin papel solo ve: los botones de elegir están deshabilitados y se dice por qué", () => {
    render(<SelectorAvatar3d entityId="mi-pagina" entityKind="pagina" />);
    abrir();
    expect((screen.getByLabelText("Elegir Avatar Arla") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Aquí solo puedes verlo/)).toBeTruthy();
  });

  it("el administrador de una página jerárquica sí aplica, y el ADN queda como de la página", async () => {
    render(<SelectorAvatar3d entityId="mi-pagina" entityKind="pagina" rol="admin" gobierno="jerarquico" />);
    abrir();
    fireEvent.click(screen.getByLabelText("Elegir Orbe"));
    await waitFor(() => expect(adnActualDeDueno({ tipo: "pagina", id: "mi-pagina" })).not.toBeNull());
    expect(adnActualDeDueno({ tipo: "comunidad", id: "mi-pagina" })).toBeNull();
  });

  it("no se queda resolviendo ni pintando en bucle (con un ADN guardado, que es cuando AvatarVivo se monta)", async () => {
    // Sin ADN guardado el componente no monta AvatarVivo y el contador valdría 0 por casualidad: se guarda uno ANTES.
    await saveAdnToLibrary(adnDePlantilla("arla", { tipo: "perfil", id: "p1" }, "x1")!, "privado");
    render(<SelectorAvatar3d profileId="p1" esPropio />);
    abrir();
    await waitFor(() => expect(screen.getByTestId("avatar-vivo").textContent).toBe("Avatar Arla"));
    await new Promise((r) => setTimeout(r, 300));
    expect(h.pintado.mock.calls.length).toBeGreaterThan(0);
    expect(h.pintado.mock.calls.length).toBeLessThan(10);
  });

  it("en el perfil de otra persona solo se ve: no se aplica nada y se dice por qué", () => {
    render(<SelectorAvatar3d profileId="p1" esPropio={false} />);
    abrir();
    expect((screen.getByLabelText("Elegir Avatar Arla") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Elegir Orbe") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Solo su dueño cambia este avatar/)).toBeTruthy();
    expect(getSavedAdnEntries()).toHaveLength(0);
  });

  it("si otra instancia cambia el avatar del mismo dueño, este selector lo muestra sin volver a montarse", async () => {
    const dueno = { tipo: "perfil" as const, id: "p1" };
    await saveAdnToLibrary({ ...adnDePlantilla("arla", dueno, "adn-ext")!, rev: 0 }, "privado");
    render(<SelectorAvatar3d profileId="p1" esPropio />);
    await waitFor(() => expect(screen.getByTestId("avatar-vivo").textContent).toBe("Avatar Arla"));
    await act(async () => { await saveAdnToLibrary({ ...adnDePlantilla("avocado", dueno, "adn-ext")!, rev: 1 }, "privado"); });
    await waitFor(() => expect(screen.getByTestId("avatar-vivo").textContent).toBe("Avocado"));
    // Y el aviso de OTRA pestaña (evento `storage`) también hace releer.
    localStorage.clear();
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: "starseed.avatar.adn.v1" })); });
    await waitFor(() => expect(screen.queryByTestId("avatar-vivo")).toBeNull());
  });

  it("los avatares nuevos reciben un id único (no la hora)", async () => {
    render(<SelectorAvatar3d entityId="mi-pagina" entityKind="pagina" rol="admin" gobierno="jerarquico" />);
    render(<SelectorAvatar3d entityId="otra-pagina" entityKind="pagina" rol="admin" gobierno="jerarquico" />);
    for (const boton of screen.getAllByText("Ver opciones")) fireEvent.click(boton);
    for (const boton of screen.getAllByLabelText("Elegir Orbe")) fireEvent.click(boton);
    await waitFor(() => expect(getSavedAdnEntries()).toHaveLength(2));
    const [a, b] = getSavedAdnEntries().map((e) => e.id);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^adn-[0-9a-f-]{36}$/);
  });

  it("en una página democrática ni el administrador aplica: se dice que proponer y votar aún no existe", () => {
    render(<SelectorAvatar3d entityId="mi-pagina" entityKind="pagina" rol="admin" gobierno="democratico" />);
    abrir();
    expect((screen.getByLabelText("Elegir Orbe") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/todavía no está disponible/)).toBeTruthy();
    expect(getSavedAdnEntries()).toHaveLength(0);
  });

  it("al cambiar de avatar conserva la visibilidad que ya tenía el ADN", async () => {
    const dueno = { tipo: "perfil" as const, id: "p1" };
    await saveAdnToLibrary({ ...adnDePlantilla("arla", dueno, "adn-previo")!, rev: 4 }, "publico");
    render(<SelectorAvatar3d profileId="p1" esPropio />);
    abrir();
    fireEvent.click(screen.getByLabelText("Elegir Avocado")); // sin esperar a que pinte el guardado: parte de lo guardado
    await waitFor(() => expect(screen.getByTestId("avatar-vivo").textContent).toBe("Avocado"));
    const entrada = adnActualDeDueno(dueno)!;
    expect([entrada.id, entrada.rev, entrada.visibilidad]).toEqual(["adn-previo", 5, "publico"]);
    expect((await parseAdnEntry(entrada))!.visibilidad).toBe("publico");
  });

  it("elegir el que ya está puesto no sube la revisión", async () => {
    render(<SelectorAvatar3d profileId="p1" esPropio />);
    abrir();
    fireEvent.click(screen.getByLabelText("Elegir Avocado"));
    await waitFor(() => expect(screen.getByTestId("avatar-vivo").textContent).toBe("Avocado"));
    fireEvent.click(screen.getByLabelText("Elegir Avocado"));
    await new Promise((r) => setTimeout(r, 50));
    expect(getSavedAdnEntries()[0].rev).toBe(0);
  });

  it("si el aparato no deja guardar lo dice y no enseña un avatar que no está guardado", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("lleno", "QuotaExceededError"); });
    render(<SelectorAvatar3d profileId="p1" esPropio />);
    abrir();
    fireEvent.click(screen.getByLabelText("Elegir Avocado"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no dejó guardar/));
    setItem.mockRestore();
    expect(screen.queryByTestId("avatar-vivo")).toBeNull();
  });
});
