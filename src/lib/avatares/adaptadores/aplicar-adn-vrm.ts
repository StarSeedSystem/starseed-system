/**
 * Avatares 3D · APLICAR EL ADN A UN VRM VIVO (AV1011A · contrato architecture/astraura-avatares-3d.md §2, §3 y §6).
 * Toca SOLO lo que cambió desde el ADN anterior (`diffAdn`): materiales por ranura (MToon o estándar), expresiones,
 * escalas ACOTADAS de huesos humanoides, piezas en el hueso de su ranura y el aura como halo. Idempotente y sin red.
 * Sin aplicar todavía: «cintura» y «estilizado» (ningún hueso los representa sin deformar todo el cuerpo). */
import { AdditiveBlending, BackSide, Mesh, MeshBasicMaterial, SphereGeometry, type Color, type Material, type Object3D } from "three";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { SLOTS_PIEZA, adnPorDefecto, type AdnAvatar, type Material as MaterialAdn, type Morfologia, type SlotMaterial, type SlotPieza } from "../adn/adn";
import { diffAdn } from "../adn/cambios";

/** Lo mínimo de un VRM de three-vrm: un VRM real encaja; en las pruebas bastan objetos simples. */
export interface VrmAplicable {
  scene: Object3D;
  humanoid?: { getRawBoneNode(nombre: VRMHumanBoneName): Object3D | null } | null;
  expressionManager?: { setValue(nombre: string, peso: number): void } | null;
}
export interface ResultadoAplicar { tocado: string[]; piezasPendientes: string[]; recargar: boolean }
export type CargarPieza = (ref: string) => Object3D | null;
type Tintable = Material & { color?: Color; emissive?: Color; emissiveIntensity?: number; metalness?: number; roughness?: number; isMToonMaterial?: boolean; shadeColorFactor?: Color };
type ConMaterial = Object3D & { material?: Material | Material[] }; type V3 = [number, number, number];
export const NOMBRE_AURA = "adn-aura", ESCALA_MIN = 0.8, ESCALA_MAX = 1.25;
const ALCANCE: Partial<Record<Morfologia, number>> = { altura: 0.3, cabeza: 0.4, hombros: 0.25, brazos: 0.2, piernas: 0.3, complexion: 0.2 }; // por deslizador
const HUESO_PIEZA: Record<SlotPieza, VRMHumanBoneName | null> = { cabeza: "head", cabello: "head", cara: "head", torso: "chest", piernas: "hips",
  pies: "hips", manos: "rightHand", "accesorio-1": "head", espalda: "chest", "accesorio-2": "leftHand", mascota: null };
/** Convenciones de VRoid y nombres en español. `null` = no se tiñe nunca (cejas, pestañas, delineado). */
const REGLAS: [RegExp, SlotMaterial | null][] = [[/brow|lash|eyeline|ceja|pesta/i, null], [/iris|pupil|ojo/i, "ojos"], [/hair|pelo|cabello/i, "cabello"],
  [/accessor|accent|acento|joya/i, "acento"], [/bottom|pant|skirt|shoe|boot|falda|zapat|calzado/i, "ropa-2"],
  [/top|shirt|cloth|dress|jacket|onepiece|ropa|camis/i, "ropa-1"], [/skin|body|face|piel|cuerpo|cara/i, "piel"]];
/** Ranura de un material por su nombre; `undefined` si el nombre no dice nada. */
export const slotDeMaterial = (nombre: string): SlotMaterial | null | undefined => REGLAS.find(([re]) => re.test(nombre))?.[1];
const materiales = (o: Object3D): Material[] => { const m = (o as ConMaterial).material; return m ? (Array.isArray(m) ? m : [m]) : []; };
export const factorMorfologia = (adn: AdnAvatar, k: Morfologia): number =>
  Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, 1 + ((adn.morfologia[k] ?? 0.5) - 0.5) * (ALCANCE[k] ?? 0)));

const indices = new WeakMap<Object3D, Map<SlotMaterial, Tintable[]>>();
/** Índice ranura → materiales, hecho UNA vez por VRM (antes de enganchar piezas y halo). */
function indice(vrm: VrmAplicable): Map<SlotMaterial, Tintable[]> {
  const ix = indices.get(vrm.scene) ?? new Map<SlotMaterial, Tintable[]>();
  if (!indices.has(vrm.scene)) vrm.scene.traverse((o) => materiales(o).forEach((m) => {
    const s = slotDeMaterial(m.name), slot = s === undefined ? slotDeMaterial(o.name) ?? null : s;
    if (slot) ix.set(slot, [...(ix.get(slot) ?? []), m as Tintable]);
  }));
  indices.set(vrm.scene, ix); return ix;
}
function pintar(m: Tintable, mat: MaterialAdn): void {
  m.color?.set(mat.color);
  if (m.emissive) { m.emissive.set(mat.color); m.emissiveIntensity = mat.emisivo; }
  if (m.isMToonMaterial) m.shadeColorFactor?.set(mat.color).multiplyScalar(0.7); // MToon: sin metal ni rugosidad; su sombra sigue al color
  else { if (typeof m.metalness === "number") m.metalness = mat.metal; if (typeof m.roughness === "number") m.roughness = mat.rugosidad; }
}
/** Escalas desde cero sobre la escala de reposo guardada: solo se escribe la que cambia. */
function escalar(vrm: VrmAplicable, adn: AdnAvatar, tocado: string[]): void {
  const f = (k: Morfologia) => factorMorfologia(adn, k);
  const obj = new Map<Object3D, V3>([[vrm.scene, [f("altura"), f("altura"), f("altura")]]]);
  const mult = (n: VRMHumanBoneName, x: number, y: number, z: number): boolean => {
    const h = vrm.humanoid?.getRawBoneNode(n); if (h) { const v = obj.get(h) ?? [1, 1, 1]; obj.set(h, [v[0] * x, v[1] * y, v[2] * z]); } return !!h; };
  const c = f("cabeza"), u = f("hombros") * f("brazos"), b = f("brazos"), p = f("piernas"), k = f("complexion");
  mult("head", c, c, c);
  for (const l of ["left", "right"] as const) { mult(`${l}UpperArm`, u, u, u); mult(`${l}LowerArm`, b, b, b); mult(`${l}UpperLeg`, p, p, p); mult(`${l}LowerLeg`, p, p, p); }
  const n = (["spine", "chest"] as const).filter((h) => mult(h, k, 1, k)).length;
  // La complexión ensancha el tronco, no la cabeza ni el largo de los brazos: se compensa en el primer hijo que haya.
  for (const cadena of [["neck", "head"], ["leftShoulder", "leftUpperArm"], ["rightShoulder", "rightUpperArm"]] as const) cadena.some((h) => mult(h, k ** -n, 1, k ** -n));
  for (const [o, [x, y, z]] of obj) {
    const r = (o.userData.adnReposo ??= [o.scale.x, o.scale.y, o.scale.z]) as V3;
    if (o.scale.x !== r[0] * x || o.scale.y !== r[1] * y || o.scale.z !== r[2] * z) { o.scale.set(r[0] * x, r[1] * y, r[2] * z); tocado.push(`escala.${o === vrm.scene ? "raiz" : o.name}`); }
  }
}

const puestas = new WeakMap<Object3D, Map<SlotPieza, Object3D>>();
/** Deja cada ranura con la pieza que pide el ADN. Si aún no está cargada, conserva la anterior y la pide. */
export function colocarPiezas(vrm: VrmAplicable, adn: AdnAvatar, cargar: CargarPieza, slots: readonly SlotPieza[] = SLOTS_PIEZA): { tocado: string[]; pendientes: string[] } {
  const mapa = puestas.get(vrm.scene) ?? new Map<SlotPieza, Object3D>(), out = { tocado: [] as string[], pendientes: [] as string[] };
  puestas.set(vrm.scene, mapa);
  for (const slot of slots) {
    const quiere = adn.piezas.find((x) => x.slot === slot), actual = mapa.get(slot), tinte = quiere?.tinte;
    if (actual ? actual.userData.adnRef === quiere?.ref && actual.userData.adnTinte === tinte : !quiere) continue;
    const original = quiere ? cargar(quiere.ref) : null;
    if (quiere && !original) { out.pendientes.push(quiere.ref); continue; }
    actual?.removeFromParent(); mapa.delete(slot); out.tocado.push(`pieza.${slot}`); // su copia teñida se libera; lo de la caché, nunca
    if (actual?.userData.adnTinte) actual.traverse((o) => materiales(o).forEach((m) => m.dispose()));
    if (!quiere || !original) continue;
    const copia = original.clone(); copia.userData = { adnPieza: slot, adnRef: quiere.ref, adnTinte: tinte };
    if (tinte) copia.traverse((o) => { // el tinte va en una copia del material: el original en caché queda intacto
      const ms = materiales(o).map((m) => { const t = m.clone() as Tintable; t.color?.set(tinte); return t; });
      if (ms.length) (o as ConMaterial).material = ms.length === 1 ? ms[0] : ms;
    });
    const hueso = HUESO_PIEZA[slot]; (hueso ? vrm.humanoid?.getRawBoneNode(hueso) ?? vrm.scene : vrm.scene).add(copia); mapa.set(slot, copia);
  }
  return out;
}
function ponerAura(vrm: VrmAplicable, aura: AdnAvatar["aura"]): void {
  let halo = vrm.scene.getObjectByName(NOMBRE_AURA) as Mesh<SphereGeometry, MeshBasicMaterial> | undefined;
  if (!halo) {
    halo = new Mesh(new SphereGeometry(1, 24, 16), new MeshBasicMaterial({ transparent: true, side: BackSide, blending: AdditiveBlending, depthWrite: false }));
    halo.name = NOMBRE_AURA; halo.scale.set(0.55, 0.95, 0.55); halo.position.y = 0.85; vrm.scene.add(halo);
  }
  halo.material.color.setHSL(aura.tono / 360, 0.8, 0.6); halo.material.opacity = aura.intensidad * 0.35; halo.visible = aura.intensidad > 0;
}

/** Aplica `adn` a `vrm` partiendo de `anterior` (o de lo neutro la primera vez). Si cambió la base, pide recargar. */
export function aplicarAdnVrm(vrm: VrmAplicable, anterior: AdnAvatar | null, adn: AdnAvatar, op: { pieza?: CargarPieza } = {}): ResultadoAplicar {
  const r: ResultadoAplicar = { tocado: [], piezasPendientes: [], recargar: false };
  const cambios = diffAdn(anterior ?? { ...adnPorDefecto(adn.id, adn.nombre, adn.dueno), base: adn.base }, adn);
  if (cambios.some((c) => c.op === "base")) return { ...r, recargar: true };
  const ix = indice(vrm), slots = new Set<SlotMaterial>(), piezas = new Set<SlotPieza>();
  let morfologia = false, aura = anterior === null;
  for (const c of cambios) {
    if (c.op === "morfologia") morfologia = true;
    else if (c.op === "material") slots.add(c.slot);
    else if (c.op === "pieza") piezas.add(c.slot);
    else if (c.op === "aura") aura = true;
    else if (c.op === "expresion" && vrm.expressionManager) { vrm.expressionManager.setValue(c.clave, c.valor); r.tocado.push(`expresion.${c.clave}`); }
  }
  for (const s of slots) { const mat = adn.materiales[s], ms = ix.get(s) ?? [];
    if (mat && ms.length) { ms.forEach((m) => pintar(m, mat)); r.tocado.push(`material.${s}`); } }
  if (morfologia) escalar(vrm, adn, r.tocado);
  if (piezas.size) { const p = colocarPiezas(vrm, adn, op.pieza ?? (() => null), [...piezas]); r.tocado.push(...p.tocado); r.piezasPendientes.push(...p.pendientes); }
  if (aura) { ponerAura(vrm, adn.aura); r.tocado.push("aura"); }
  return r;
}
