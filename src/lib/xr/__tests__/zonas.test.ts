import { describe, it, expect } from "vitest";
import { dentroDeZona, cambiosDeZona, efectosActivos, destinoDePortal } from "../zonas";
import type { ZonaMundo, PortalMundo, DestinoPortal } from "../mundo-tipos";
import type { Vec3 } from "../tipos";

/** Vec3 helpers */
const sumar = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const restar = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// --- Test esfera ---
describe("dentroDeZona (esfera)", () => {
  const esfera: ZonaMundo = {
    id: "e1",
    nombre: "Esfera grande",
    forma: "esfera",
    pos: [0, 0, 0],
    tam: [10, 10, 10],
    efecto: "nada",
  };
  const mitad = 5;

  it("devuelve true para un punto dentro de la esfera", () => {
    expect(dentroDeZona(esfera, [0, 0, 0])).toBe(true);
  });
  it("devuelve false para un punto fuera de la esfera", () => {
    expect(dentroDeZona(esfera, [6, 0, 0])).toBe(false);
  });
  it("devuelve true para un punto en la superficie", () => {
    expect(dentroDeZona(esfera, [5, 0, 0])).toBe(true);
  });
});

// --- Test caja ---
describe("dentroDeZona (caja)", () => {
  const caja: ZonaMundo = {
    id: "c1",
    nombre: "Caja 3x3x3",
    forma: "caja",
    pos: [0, 0, 0],
    tam: [3, 3, 3],
    efecto: "nada",
  };

  it("devuelve true para un punto dentro de la caja", () => {
    expect(dentroDeZona(caja, [0.5, 0.5, 0.5])).toBe(true);
  });
  it("devuelve true para un punto en el centro", () => {
    expect(dentroDeZona(caja, [0, 0, 0])).toBe(true);
  });
  it("devuelve false para un punto fuera de la caja", () => {
    expect(dentroDeZona(caja, [2, 0, 0])).toBe(false);
  });
});

// --- Test cambiosDeZona y histéresis ---
describe("cambiosDeZona", () => {
  const zonas: ZonaMundo[] = [
    { id: "z1", nombre: "Z1", forma: "esfera", pos: [0, 0, 0], tam: [2, 2, 2], efecto: "nada" },
    { id: "z2", nombre: "Z2", forma: "caja", pos: [5, 0, 0], tam: [2, 2, 2], efecto: "nada" },
  ];

  it("devuelve un conjunto vacío para un punto fuera de todas las zonas", () => {
    const cambios = cambiosDeZona(zonas, new Set(["z1"]), [10, 10, 10]);
    expect(cambios.ahora).toEqual(new Set());
    expect(cambios.entra).toEqual([]);
    expect(cambios.sale).toEqual(["z1"]);
  });
  it("devuelve la zona a la que se está entrando", () => {
    const cambios = cambiosDeZona(zonas, new Set(), [0, 0, 0]);
    expect(cambios.ahora).toEqual(new Set(["z1"]));
    expect(cambios.entra).toEqual(["z1"]);
    expect(cambios.sale).toEqual([]);
  });
  it("devuelve ambas zonas a las que se está entrando", () => {
    const cambios = cambiosDeZona(zonas, new Set(), [4.5, 0, 0]);
    expect(cambios.ahora).toEqual(new Set(["z2"]));
    expect(cambios.entra).toEqual(["z2"]);
    expect(cambios.sale).toEqual([]);
  });
  it("devuelve la zona a la que se está saliendo", () => {
    const cambios = cambiosDeZona(zonas, new Set(["z1"]), [10, 10, 10]);
    expect(cambios.ahora).toEqual(new Set());
    expect(cambios.entra).toEqual([]);
    expect(cambios.sale).toEqual(["z1"]);
  });
  it("no cambia nada para un punto en la misma zona", () => {
    const cambios = cambiosDeZona(zonas, new Set(["z1"]), [0, 0, 0]);
    expect(cambios.ahora).toEqual(new Set(["z1"]));
    expect(cambios.entra).toEqual([]);
    expect(cambios.sale).toEqual([]);
  });
});

// --- Test efectosActivos ---
describe("efectosActivos", () => {
  const zonas: ZonaMundo[] = [
    { id: "z1", nombre: "Silencio", forma: "caja", pos: [0, 0, 0], tam: [1, 1, 1], efecto: "silencio" },
    { id: "z2", nombre: "Audio privado", forma: "caja", pos: [1, 0, 0], tam: [1, 1, 1], efecto: "audio-privado" },
    { id: "z3", nombre: "Cero gravedad", forma: "caja", pos: [2, 0, 0], tam: [1, 1, 1], efecto: "gravedad-cero" },
    { id: "z4", nombre: "Seguro", forma: "caja", pos: [3, 0, 0], tam: [1, 1, 1], efecto: "zona-segura" },
    { id: "z5", nombre: "Escenario", forma: "caja", pos: [4, 0, 0], tam: [1, 1, 1], efecto: "escenario" },
  ];
  const ahora = new Set(["z1", "z3", "z4"]);

  it("devuelve true para silencio", () => {
    expect(efectosActivos(zonas, ahora).silencio).toBe(true);
  });
  it("devuelve null para audio-privado si no está presente", () => {
    expect(efectosActivos(zonas, ahora).audioPrivado).toBe(null);
  });
  it("devuelve el nombre para audio-privado", () => {
    const efectos = efectosActivos(zonas, new Set(["z2"]));
    expect(efectos.audioPrivado).toBe("Audio privado");
  });
  it("devuelve true para gravedad cero", () => {
    expect(efectosActivos(zonas, ahora).gravedadCero).toBe(true);
  });
  it("devuelve true para zona segura", () => {
    expect(efectosActivos(zonas, ahora).zonaSegura).toBe(true);
  });
  it("devuelve null para escenario si no está presente", () => {
    expect(efectosActivos(zonas, ahora).escenario).toBe(null);
  });
  it("devuelve el nombre para escenario", () => {
    const efectos = efectosActivos(zonas, new Set(["z5"]));
    expect(efectos.escenario).toBe("Escenario");
  });
});

// --- Test destinoDePortal ---
describe("destinoDePortal", () => {
  it("devuelve un punto para un portal con destino tipo 'punto'", () => {
    const portal: PortalMundo = {
      id: "p1",
      nombre: "Entrada",
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      radio: 1,
      destino: { tipo: "punto", spawn: "sala1" },
    };
    const destino = destinoDePortal(portal);
    expect(destino.tipo).toBe("punto");
    expect(destino.spawn).toBe("sala1");
  });
it("devuelve una ruta para una sala pública", () => {
    const portal: PortalMundo = {
      id: "p4",
      nombre: "Servidor público",
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      radio: 1,
      destino: { tipo: "sala", id: "sala-publica" },
    };
    const destino = destinoDePortal(portal);
    expect(destino.tipo).toBe("ruta");
    expect(destino.ruta).toBe("/salas/sala-publica");
    expect(destino.privado).toBe(false);
  });
  it("devuelve una ruta para una sala privada", () => {
    const portal: PortalMundo = {
      id: "p3",
      nombre: "Sala privada",
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      radio: 1,
      destino: { tipo: "sala", id: ".privada" },
    };
    const destino = destinoDePortal(portal);
    expect(destino.tipo).toBe("ruta");
    expect(destino.ruta).toBe("/salas/.privada");
    expect(destino.privado).toBe(true);
  });
  it("devuelve una ruta para un servidor público", () => {
    const portal: PortalMundo = {
      id: "p6",
      nombre: "Servidor público",
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      radio: 1,
      destino: { tipo: "servidor", id: "servidor1" },
    };
    const destino = destinoDePortal(portal);
    expect(destino.tipo).toBe("ruta");
    expect(destino.ruta).toBe("/servidores");
    expect(destino.privado).toBe(false);
  });
  it("devuelve una ruta para una estación", () => {
    const portal: PortalMundo = {
      id: "p5",
      nombre: "Estación",
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      radio: 1,
      destino: { tipo: "estacion", id: "estacion2" },
    };
    const destino = destinoDePortal(portal);
    expect(destino.tipo).toBe("ruta");
    expect(destino.ruta).toBe("/estaciones/estacion2");
    expect(destino.privado).toBe(false);
  });
  it("devuelve una ruta para un mundo", () => {
    const portal: PortalMundo = {
      id: "p6",
      nombre: "Mundo",
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      radio: 1,
      destino: { tipo: "mundo", id: "mundo1" },
    };
    const destino = destinoDePortal(portal);
    expect(destino.tipo).toBe("ruta");
    expect(destino.ruta).toBe("/mundos/mundo1");
    expect(destino.privado).toBe(false);
  });
});

// --- Tests de integración ---
describe("integración", () => {
  const zonas: ZonaMundo[] = [
    { id: "z1", nombre: "Z1", forma: "esfera", pos: [0, 0, 0], tam: [2, 2, 2], efecto: "silencio" },
    { id: "z2", nombre: "Z2", forma: "caja", pos: [5, 0, 0], tam: [2, 2, 2], efecto: "zona-segura" },
  ];
  const portal: PortalMundo = {
    id: "p1",
    nombre: "Portal",
    pos: [10, 0, 0],
    rot: [0, 0, 0],
    radio: 1,
    destino: { tipo: "sala", id: "sala2" },
  };

  it("devuelve efectos cuando se entra en una zona", () => {
    const ahora = new Set(["z1"]);
    const efectos = efectosActivos(zonas, ahora);
    expect(efectos.silencio).toBe(true);
    expect(efectos.zonaSegura).toBe(false);
  });
  it("combina múltiples zonas", () => {
    const ahora = new Set(["z1", "z2"]);
    const efectos = efectosActivos(zonas, ahora);
    expect(efectos.silencio).toBe(true);
    expect(efectos.zonaSegura).toBe(true);
  });
});

// --- Test punto-reunion no cambia nada ---
describe("punto-reunion no cambia nada", () => {
  const zonas: ZonaMundo[] = [
    { id: "z1", nombre: "Punto de reunión", forma: "esfera", pos: [0, 0, 0], tam: [1, 1, 1], efecto: "punto-reunion" },
  ];
  const ahora = new Set(["z1"]);
  const efectos = efectosActivos(zonas, ahora);
  expect(efectos.silencio).toBe(false);
  expect(efectos.audioPrivado).toBe(null);
  expect(efectos.gravedadCero).toBe(false);
  expect(efectos.zonaSegura).toBe(false);
  expect(efectos.escenario).toBe(null);
});

// --- Test portal a spawn ---
describe("portal a spawn", () => {
  const portal: PortalMundo = {
    id: "p1",
    nombre: "Portal",
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    radio: 1,
    destino: { tipo: "punto", spawn: "sala1" },
  };
  const destino = destinoDePortal(portal);
  expect(destino.tipo).toBe("punto");
  expect(destino.spawn).toBe("sala1");
});

// --- Test destino sin ruta conocida -> no-disponible ---
describe("destino sin ruta conocida -> no-disponible", () => {
  const portal: PortalMundo = {
    id: "p1",
    nombre: "Portal",
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    radio: 1,
    destino: { tipo: "sala", id: "sala-externa" },
  };
  const destino = destinoDePortal(portal);
  expect(destino.tipo).toBe("ruta");
  expect(destino.ruta).toBe("/salas/sala-externa");
});

// --- Test portal público marca privado: false ---
describe("portal público marca privado: false", () => {
  const portal1: PortalMundo = {
    id: "p1",
    nombre: "Portal público",
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    radio: 1,
    destino: { tipo: "sala", id: "sala-publica" },
  };
  const portal2: PortalMundo = {
    id: "p2",
    nombre: "Portal privado",
    pos: [1, 0, 0],
    rot: [0, 0, 0],
    radio: 1,
    destino: { tipo: "sala", id: ".privada" },
  };
  const destino1 = destinoDePortal(portal1);
  const destino2 = destinoDePortal(portal2);
  expect(destino1.privado).toBe(false);
  expect(destino2.privado).toBe(true);
});