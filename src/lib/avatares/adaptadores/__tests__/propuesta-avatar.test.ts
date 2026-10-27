import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambios, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { proponerCambioAvatar, resolverCambioAvatar } from "@/lib/avatares/adaptadores/propuesta-avatar";
import { describirOperacion, type Ambito, type AvatarCambioDatos } from "@/lib/genesis/operaciones";

const GRUPO: Ambito = { tipo: "entidad", entidad: { tipo: "grupo", id: "g1", slug: "circulo-sur", nombre: "Círculo Sur" } };
const PERSONA: Ambito = { tipo: "persona" };

const avatar = (rev = 3): AdnAvatar => ({
  ...adnPorDefecto("adn-av1", "Círculo", { tipo: "grupo", id: "g1" }, 200),
  rev,
});

const propuesta = (actual: AdnAvatar, cambios: readonly CambioAvatar[], revBase = actual.rev): AvatarCambioDatos => ({
  ref: actual.id,
  revBase,
  cambios: [...cambios],
});

describe("proponer un cambio de avatar en una entidad democrática", () => {
  it("registra la operación avatar.cambiar con el diff y la revisión base", () => {
    const actual = avatar();
    const propuesto = aplicarCambios(actual, [{ op: "nombre", valor: "Círculo Azul" }]);
    const r = proponerCambioAvatar({
      actual, propuesto, motivo: "El grupo lo pidió", ambito: GRUPO,
      rol: "admin", gobierno: "democratico",
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.op.tipo !== "avatar.cambiar") return;
    expect(r.op.datos.ref).toBe(actual.id);
    expect(r.op.datos.revBase).toBe(3);
    expect(r.op.datos.cambios).toEqual([{ op: "nombre", valor: "Círculo Azul" }]);
    expect(r.decision.requiere).toBe("votacion");
  });

  it("no propone si el gobierno no es democrático, si es tu avatar o si no hay cambios", () => {
    const actual = avatar();
    const propuesto = aplicarCambios(actual, [{ op: "nombre", valor: "Otro" }]);
    const jerarquico = proponerCambioAvatar({ actual, propuesto, motivo: "m", ambito: GRUPO, rol: "admin", gobierno: "jerarquico" });
    expect(jerarquico.ok).toBe(false);
    if (!jerarquico.ok) expect(jerarquico.motivos.join(" ")).toMatch(/No se vota/);

    const propio = { ...adnPorDefecto("adn-p1", "Ana", { tipo: "perfil", id: "p1" }), rev: 2 };
    const persona = proponerCambioAvatar({ actual: propio, propuesto: { ...propio, nombre: "Ana 2" }, motivo: "m", ambito: PERSONA, rol: "dueno" });
    expect(persona.ok).toBe(false);

    const iguales = proponerCambioAvatar({ actual, propuesto: { ...actual }, motivo: "m", ambito: GRUPO, rol: "admin", gobierno: "democratico" });
    expect(iguales.ok).toBe(false);
    if (!iguales.ok) expect(iguales.motivos.join(" ")).toMatch(/no hay nada que votar/i);
  });

  it("rechaza un avatar de otra entidad o de otro dueño", () => {
    const actual = avatar();
    const propuesto = aplicarCambios(actual, [{ op: "nombre", valor: "Otro" }]);
    const otraEntidad: Ambito = { tipo: "entidad", entidad: { tipo: "grupo", id: "g2", slug: "otro", nombre: "Otro" } };
    expect(proponerCambioAvatar({ actual, propuesto, motivo: "m", ambito: otraEntidad, rol: "admin", gobierno: "democratico" }).ok).toBe(false);
    const otroDueno = { ...propuesto, dueno: { tipo: "grupo" as const, id: "g2" } };
    expect(proponerCambioAvatar({ actual, propuesto: otroDueno, motivo: "m", ambito: GRUPO, rol: "admin", gobierno: "democratico" }).ok).toBe(false);
  });

  it("cuenta en palabras el cambio que se vota", () => {
    const actual = avatar();
    const propuesto = aplicarCambios(actual, [{ op: "nombre", valor: "Círculo Azul" }, { op: "aura", campo: "tono", valor: 100 }]);
    const r = proponerCambioAvatar({ actual, propuesto, motivo: "m", ambito: GRUPO, rol: "admin", gobierno: "democratico" });
    if (!r.ok) throw new Error("La propuesta debería ser válida");
    const vista = describirOperacion(r.op, GRUPO);
    expect(vista.titulo).toMatch(/avatar/i);
    expect(vista.detalles.join(" · ")).toContain("Círculo Azul");
    expect(vista.detalles.join(" · ")).toContain("100°");
  });
});

describe("aplicar la propuesta al aprobarse (rebase)", () => {
  const nombre: CambioAvatar[] = [{ op: "nombre", valor: "Círculo Azul" }];

  it("si la revisión coincide, aplica los cambios sin rebasar", () => {
    const actual = avatar(3);
    const r = resolverCambioAvatar(actual, propuesta(actual, nombre));
    expect(r.ok).toBe(true);
    expect(r.rebasado).toBe(false);
    expect(r.aviso).toBeNull();
    expect(r.adn.nombre).toBe("Círculo Azul");
    expect(r.adn.rev).toBe(4);
    expect(r.cambios).toEqual(nombre);
  });

  it("si el avatar ya cambió y el valor ya está puesto, no reaplica nada y avisa", () => {
    const base = avatar(3);
    const actual = aplicarCambios(base, nombre);
    const r = resolverCambioAvatar(actual, propuesta(base, nombre, 3));
    expect(r.ok).toBe(true);
    expect(r.rebasado).toBe(true);
    expect(r.cambios).toEqual([]);
    expect(r.adn).toBe(actual);
    expect(r.aviso).toMatch(/ya está como se propuso/i);
  });

  it("si el avatar cambió por otro lado, recalcula el diff sobre la revisión actual", () => {
    const base = avatar(3);
    const actual = aplicarCambios(base, [{ op: "aura", campo: "tono", valor: 50 }]);
    const r = resolverCambioAvatar(actual, propuesta(base, [
      { op: "nombre", valor: "Círculo Azul" },
      { op: "aura", campo: "tono", valor: 100 },
    ], 3));
    expect(r.ok).toBe(true);
    expect(r.rebasado).toBe(true);
    expect(r.adn.nombre).toBe("Círculo Azul");
    expect(r.adn.aura.tono).toBe(100);
    expect(r.cambios.map((c) => c.op).sort()).toEqual(["aura", "nombre"]);
    expect(r.aviso).toMatch(/3 → 4/);
  });

  it("no aplica propuestas de otro avatar ni sin cambios válidos, y una revisión distinta se rebasa", () => {
    const actual = avatar(3);
    expect(resolverCambioAvatar(actual, { ...propuesta(actual, nombre), ref: "adn-otro" }).ok).toBe(false);
    const otraRevision = resolverCambioAvatar(actual, { ...propuesta(actual, nombre), revBase: 9 });
    expect(otraRevision.ok).toBe(true);
    expect(otraRevision.rebasado).toBe(true);
    expect(otraRevision.adn.nombre).toBe("Círculo Azul");
    const sinCambios = resolverCambioAvatar(actual, { ...propuesta(actual, nombre), cambios: [] });
    expect(sinCambios.ok).toBe(false);
    if (!sinCambios.ok) expect(sinCambios.motivo).toMatch(/ningún cambio válido/i);
  });
});
