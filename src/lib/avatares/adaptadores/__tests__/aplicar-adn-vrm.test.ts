/** Visor VRM vivo (AV1011A): el adaptador con un VRM FALSO (objetos de three sin WebGL, sin red ni disco) comprueba qué toca y
 * qué no; el resolutor de «biblioteca:» se prueba con un catálogo inyectado. */
import { describe, expect, it, vi } from "vitest";
import { Color, Mesh, MeshStandardMaterial, Object3D, type MeshBasicMaterial } from "three";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { adnPorDefecto, type AdnAvatar } from "../../adn/adn";
import { aplicarCambio } from "../../adn/cambios";
import { ESCALA_MAX, ESCALA_MIN, NOMBRE_AURA, aplicarAdnVrm, colocarPiezas, factorMorfologia, slotDeMaterial } from "../aplicar-adn-vrm";
import { almacenPublico, resolverRefBiblioteca, soloMismoOrigen, type ItemBiblioteca } from "../resolver-ref-biblioteca";
const HUESOS: VRMHumanBoneName[] = ["hips", "spine", "chest", "neck", "head", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg"];
function vrmFalso() {
  const scene = new Object3D();
  const huesos = new Map(HUESOS.map((n) => [n, Object.assign(new Object3D(), { name: n })]));
  const mat = (name: string) => new MeshStandardMaterial({ name });
  const pelo = mat("N00_000_Hair_00_HAIR"), cejas = mat("N00_000_00_FaceBrow_00_FACE"), ojos = mat("N00_000_00_EyeIris_00_EYE");
  const ropa = Object.assign(mat("N00_002_01_Tops_01_CLOTH"), { isMToonMaterial: true, shadeColorFactor: new Color(1, 1, 1) }), suelto = mat("Material.001");
  for (const m of [pelo, cejas, ojos, ropa, suelto]) scene.add(new Mesh(undefined, m));
  const setValue = vi.fn();
  const vrm = { scene, humanoid: { getRawBoneNode: (n: VRMHumanBoneName) => huesos.get(n) ?? null }, expressionManager: { setValue } };
  return { vrm, huesos, setValue, pelo, cejas, ojos, ropa, suelto };
}
const base = (): AdnAvatar => ({ ...adnPorDefecto("a1", "Prueba", { tipo: "perfil", id: "p1" }), base: { tipo: "vrm", ref: "biblioteca:avatares/plantillas/arla.vrm" }, esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 } });
const adnCompleto = (): AdnAvatar => ({ ...base(), morfologia: { cabeza: 1, altura: 0 }, expresionBase: { happy: 0.8 },
  materiales: { cabello: { color: "#3366ff", metal: 0.4, rugosidad: 0.2, emisivo: 0 }, "ropa-1": { color: "#ff0000", metal: 0.9, rugosidad: 0.1, emisivo: 0.5 } },
  piezas: [{ slot: "cabeza", ref: "biblioteca:avatares/piezas/gorro.glb", tinte: "#00ff00" }], aura: { tono: 120, intensidad: 1, ligadaEmocion: true } });
describe("slotDeMaterial", () => {
  it("reconoce VRoid y nunca tiñe cejas", () => expect(["N00_000_Hair_00_HAIR", "N00_000_00_EyeIris_00_EYE", "N00_000_00_FaceBrow_00_FACE", "Material.001"].map(slotDeMaterial)).toEqual(["cabello", "ojos", null, undefined]));
});
describe("aplicarAdnVrm con un VRM falso", () => {
  it("la primera vez aplica materiales, expresiones, escalas acotadas, piezas y aura", () => {
    const { vrm, huesos, setValue, pelo, cejas, ropa, suelto } = vrmFalso();
    const gorro = new Mesh(undefined, new MeshStandardMaterial({ name: "gorro" }));
    const r = aplicarAdnVrm(vrm, null, adnCompleto(), { pieza: (ref) => (ref.endsWith("gorro.glb") ? gorro : null) });
    expect([pelo.color.getHexString(), pelo.metalness, pelo.roughness]).toEqual(["3366ff", 0.4, 0.2]);
    expect([ropa.color.getHexString(), ropa.metalness, ropa.emissiveIntensity, ropa.shadeColorFactor.r]).toEqual(["ff0000", 0, 0.5, expect.closeTo(0.7)]); // MToon: sin metal, con emisivo y sombra del color
    expect([cejas.color.getHexString(), suelto.color.getHexString()]).toEqual(["ffffff", "ffffff"]); // cejas y sin ranura: intactos
    expect(setValue).toHaveBeenCalledWith("happy", 0.8);
    expect([huesos.get("head")!.scale.x, vrm.scene.scale.y, huesos.get("spine")!.scale.x]).toEqual([expect.closeTo(1.2), expect.closeTo(0.85), 1]);
    const puesta = huesos.get("head")!.children[0] as Mesh;
    expect(puesta.userData).toMatchObject({ adnPieza: "cabeza", adnRef: "biblioteca:avatares/piezas/gorro.glb" });
    expect((puesta.material as MeshStandardMaterial).color.getHexString()).toBe("00ff00");
    expect((gorro.material as MeshStandardMaterial).color.getHexString()).toBe("ffffff"); // el original de la caché, intacto
    const halo = vrm.scene.getObjectByName(NOMBRE_AURA) as Mesh<never, MeshBasicMaterial>;
    expect(halo.material.opacity).toBeCloseTo(0.35);
    expect(r.tocado).toEqual(expect.arrayContaining(["material.cabello", "material.ropa-1", "expresion.happy", "escala.head", "escala.raiz", "pieza.cabeza", "aura"]));
    expect(r.tocado).not.toContain("escala.spine");
  });
  it("es idempotente: el mismo ADN no toca nada y repetir desde cero no duplica piezas ni halo", () => {
    const { vrm, huesos, setValue } = vrmFalso(), adn = adnCompleto(), pieza = () => new Object3D();
    aplicarAdnVrm(vrm, null, adn, { pieza });
    setValue.mockClear();
    expect(aplicarAdnVrm(vrm, adn, adn, { pieza }).tocado).toEqual([]);
    expect(setValue).not.toHaveBeenCalled();
    aplicarAdnVrm(vrm, null, adn, { pieza });
    expect(huesos.get("head")!.children).toHaveLength(1);
    expect(vrm.scene.children.filter((o) => o.name === NOMBRE_AURA)).toHaveLength(1);
  });
  it("solo toca lo que cambió entre dos ADN", () => {
    const { vrm, pelo, ojos, setValue } = vrmFalso(), a = adnCompleto();
    aplicarAdnVrm(vrm, null, a, { pieza: () => new Object3D() });
    setValue.mockClear();
    const espia = vi.spyOn(pelo.color, "set");
    const b = aplicarCambio(a, { op: "material", slot: "ojos", campo: "color", valor: "#00ff00" });
    expect(aplicarAdnVrm(vrm, a, b).tocado).toEqual(["material.ojos"]);
    expect(ojos.color.getHexString()).toBe("00ff00");
    expect(espia).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
  });
  it("la complexión ensancha el tronco y se compensa en el cuello y los brazos", () => {
    const { vrm, huesos } = vrmFalso();
    aplicarAdnVrm(vrm, null, { ...base(), morfologia: { complexion: 1 } });
    expect(huesos.get("spine")!.scale.toArray()).toEqual([1.1, 1, 1.1]);
    expect(huesos.get("chest")!.scale.x).toBeCloseTo(1.1);
    expect(huesos.get("neck")!.scale.x).toBeCloseTo(1 / 1.21);
    expect(huesos.get("leftUpperArm")!.scale.z).toBeCloseTo(1 / 1.21);
    expect(huesos.get("head")!.scale.x).toBe(1);
  });
  it("cada deslizador queda acotado y un cambio de base pide recargar sin tocar nada", () => {
    for (const v of [0, 1]) for (const k of ["altura", "cabeza", "hombros", "brazos", "piernas", "complexion"] as const) {
      const f = factorMorfologia({ ...base(), morfologia: { [k]: v } }, k);
      expect(f).toBeGreaterThanOrEqual(ESCALA_MIN); expect(f).toBeLessThanOrEqual(ESCALA_MAX);
    }
    const { vrm } = vrmFalso();
    const a = base(), b = aplicarCambio(a, { op: "base", tipo: "vrm", ref: "biblioteca:avatares/plantillas/procyon.vrm" });
    expect(aplicarAdnVrm(vrm, a, b)).toEqual({ tocado: [], piezasPendientes: [], recargar: true });
  });
  it("una pieza sin cargar queda pendiente y se coloca al llegar; quitarla la suelta del hueso", () => {
    const { vrm, huesos } = vrmFalso(), a = adnCompleto(), gorro = new Mesh(undefined, new MeshStandardMaterial()), enCache = vi.spyOn(gorro.material, "dispose");
    expect(aplicarAdnVrm(vrm, null, a).piezasPendientes).toEqual(["biblioteca:avatares/piezas/gorro.glb"]);
    expect(colocarPiezas(vrm, a, () => gorro).tocado).toEqual(["pieza.cabeza"]);
    expect(huesos.get("head")!.children).toHaveLength(1); const copia = vi.spyOn((huesos.get("head")!.children[0] as Mesh<never, MeshStandardMaterial>).material, "dispose");
    expect(aplicarAdnVrm(vrm, a, aplicarCambio(a, { op: "pieza", slot: "cabeza", ref: null })).tocado).toEqual(["pieza.cabeza"]);
    expect([huesos.get("head")!.children.length, copia.mock.calls.length, enCache.mock.calls.length]).toEqual([0, 1, 0]); // se libera la copia teñida, no la de la caché
  });
});
describe("resolverRefBiblioteca", () => {
  const ALM = almacenPublico("https://almacen.ejemplo/"), arla = `${ALM}os-files/plantillas-avatares/avatar-arla.vrm`, P = "avatares/plantillas";
  const item = (name: string, url: string, folder = P): ItemBiblioteca => ({ name, folder, payload: { url } }); // catálogo: del más nuevo al más viejo
  const items = [item("Avatar Arla", "https://ajeno.ejemplo/storage/v1/object/public/arla.vrm"), item("Avatar Arla", `${ALM}os-files/uid-ajeno/arla.vrm`), item("Avatar Arla", arla),
    item("Avatar Arla", `${ALM}os-files/plantillas-avatares/../uid-ajeno/arla.vrm`), item("gorro", `${ALM}os-files/u2/gorro.glb`, "avatares/piezas"), item("gorro", `${ALM}os-files/u1/gorro.glb`, "avatares/piezas"),
    item("Avocado", "http://almacen.ejemplo/storage/v1/object/public/avocado.vrm"), item("Avatar Procyon", "https://ajeno.ejemplo/procyon.vrm")]; // ni de fuera, ni de otra cuenta, ni con «..» tapan al bueno
  it("resuelve plantillas del almacén con UNA lectura por carpeta y dice el motivo de lo que no puede", async () => {
    const listar = vi.fn(async () => items), r = (ref: string, alm = ALM) => resolverRefBiblioteca(ref, listar, alm);
    expect(await r("biblioteca:avatares/plantillas/arla.vrm")).toEqual({ ok: true, url: arla });
    expect((await r("biblioteca:avatares/plantillas/avocado.vrm")).ok).toBe(false);
    expect(await r("biblioteca:avatares/plantillas/procyon.vrm")).toMatchObject({ ok: false, motivo: expect.stringMatching(/de fuera/) });
    expect(await r("biblioteca:avatares/plantillas/senet.vrm")).toMatchObject({ ok: false, motivo: expect.stringMatching(/no aparece/) });
    expect(listar).toHaveBeenCalledTimes(1);
    expect(await r("biblioteca:avatares/piezas/gorro.glb")).toEqual({ ok: true, url: `${ALM}os-files/u1/gorro.glb` }); // vale el más viejo
    expect(await r("genesis:avatares/x.vrm")).toMatchObject({ ok: false, motivo: expect.stringMatching(/genesis/) });
    expect((await r("https://ajeno.ejemplo/x.vrm")).ok).toBe(false);
    expect([almacenPublico(""), almacenPublico("http://almacen.ejemplo")]).toEqual(["", ""]);
    expect(await r("biblioteca:avatares/plantillas/arla.vrm", "")).toMatchObject({ ok: false, motivo: expect.stringMatching(/NEXT_PUBLIC_SUPABASE_URL/) });
  });
  it("dentro del VRM solo deja pasar data:, blob: y https del mismo servidor", () => {
    const m = soloMismoOrigen(arla);
    expect([m("data:x"), m("textura.png"), m("https://almacen.ejemplo/otra.png")]).toEqual(["data:x", `${ALM}os-files/plantillas-avatares/textura.png`, "https://almacen.ejemplo/otra.png"]);
    expect([m("https://ajeno.ejemplo/t.png"), m("http://almacen.ejemplo/t.png")].every((u) => u.startsWith("data:image/gif"))).toBe(true);
  });
});
