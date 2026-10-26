import { describe, expect, it } from "vitest";
import { describirObjeto3d, FORMAS_3D_SOPORTADAS } from "../objeto3d";
import { PREFIJO_CAPA_FONDO, SETS_FONDO, capasConFondo, elegirSetFondo } from "../fondo";
import { EVENTO_APLICAR_FONDO } from "../fondo-evento";

describe("describirObjeto3d · solo lo que la escena sabe crear", () => {
  it.each([
    ["cubo 3D girando", "caja", "Cubo"],
    ["una esfera azul", "esfera", "Esfera azul"],
    ["un donut brillante", "toro", "Toro"],
    ["pirámide dorada", "cono", "Cono ámbar"],
    ["un tubo verde neón", "cilindro", "Cilindro verde neón"],
    ["un suelo blanco", "plano", "Plano blanco"],
  ] as const)("«%s» → %s / %s", (texto, tipo, nombre) => {
    const o = describirObjeto3d(texto);
    expect(o?.tipo).toBe(tipo);
    expect(o?.nombre).toBe(nombre);
  });

  it("el color sale de la paleta de la escena; sin color, violeta", () => {
    expect(describirObjeto3d("esfera roja")).toMatchObject({ color: "#DC143C", nombreColor: "rojo" });
    expect(describirObjeto3d("esfera")).toMatchObject({ color: "#7C5CFF", nombreColor: null });
  });

  it("alambre y brillo se detectan por palabra", () => {
    expect(describirObjeto3d("esfera de alambre")).toMatchObject({ alambre: true, brillante: false });
    expect(describirObjeto3d("esfera luminosa")).toMatchObject({ alambre: false, brillante: true });
  });

  it("una forma libre no se inventa: null", () => {
    expect(describirObjeto3d("una nave espacial con alas")).toBeNull();
    expect(describirObjeto3d("")).toBeNull();
    expect(FORMAS_3D_SOPORTADAS).toContain("cubo");
  });
});

describe("elegirSetFondo · uno de los cuatro sets oficiales", () => {
  it.each([
    ["algo más cálido y dorado", "diseno-semilla-dorada"],
    ["una aurora tranquila", "diseno-aurora-suave"],
    ["estilo cristal elegante", "diseno-vidrio-cuarzo"],
    ["noche estrellada violeta", "diseno-cosmos-violeta"],
  ])("«%s» → %s", (texto, id) => {
    const e = elegirSetFondo(texto);
    expect(e.id).toBe(id);
    expect(e.porPalabra).toBe(true);
  });

  it("sin ninguna palabra que case, el primero y se dice que no fue por palabra", () => {
    const e = elegirSetFondo("cámbialo");
    expect(e.id).toBe(SETS_FONDO[0].id);
    expect(e.porPalabra).toBe(false);
  });

  it("es determinista y no se rompe con una frase larga o con tildes", () => {
    const f = "Quiero un fondo CÁLIDO y DORADO " + "x".repeat(2000);
    expect(elegirSetFondo(f)).toEqual(elegirSetFondo(f));
    expect(elegirSetFondo(f).id).toBe("diseno-semilla-dorada");
  });
});

describe("capasConFondo · pura", () => {
  it("quita la capa que puso la petición anterior, deja las demás y pone la nueva encima", () => {
    const antes = [{ name: "Mi capa" }, { name: `${PREFIJO_CAPA_FONDO}Cosmos` }, { name: 5 }];
    const copia = JSON.stringify(antes);
    const nueva = { name: `${PREFIJO_CAPA_FONDO}Aurora` };
    const despues = capasConFondo(antes, nueva);
    expect(despues).toEqual([{ name: "Mi capa" }, { name: 5 }, nueva]);
    expect(JSON.stringify(antes)).toBe(copia);
  });

  it("con las capas vacías solo queda la nueva", () => {
    expect(capasConFondo([], { name: "x" })).toEqual([{ name: "x" }]);
  });

  it("el nombre del evento es el que escucha el proveedor de apariencia", () => {
    expect(EVENTO_APLICAR_FONDO).toBe("starseed:protomolecula-aplicar-fondo");
  });
});
