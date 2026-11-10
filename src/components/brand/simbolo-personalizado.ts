// ════════════════════════════════════════════════════════════════
// StarSeed OS — Símbolo propio en 3D (ESC1110B)
// ----------------------------------------------------------------
// Convierte la fuente de un archivo de símbolo YA VALIDADO
// (`simbolo-archivo.ts`) en un objeto three listo para la escena:
//   · glTF/GLB incrustado → GLTFLoader.parse (sin red: todo va en data:);
//   · SVG → formas extruidas con bisel (SVGLoader), con sus colores o el del material;
//   · imagen → relieve iluminado (plano subdividido desplazado por la luminancia).
// Todo se encaja en la caja del símbolo oficial (1 × 1,497, centrado en el
// ojo) con escala uniforme: nada se deforma. Se carga en diferido (solo si
// alguien usa un símbolo propio).
// ════════════════════════════════════════════════════════════════

import * as THREE from "three";
import type { ArchivoSimbolo } from "./simbolo-archivo";
import { revisarImagen, revisarModelo, revisarSvg } from "./simbolo-archivo";
import { PROPORCION } from "./simbolo-starseed-medidas";

/** Caja del símbolo oficial en unidades del modelo. */
const CAJA = { ancho: 1, alto: PROPORCION };

function material(a: ArchivoSimbolo, color?: THREE.ColorRepresentation): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
        color: color ?? a.material.color,
        roughness: a.material.rugosidad,
        metalness: a.material.metalico,
        clearcoat: a.material.laca,
        clearcoatRoughness: 0.2,
        side: THREE.DoubleSide,
    });
}

/** Encaja el objeto en la caja del símbolo, centrado en el origen, con escala uniforme. */
export function encajar(objeto: THREE.Object3D): THREE.Object3D {
    const caja = new THREE.Box3().setFromObject(objeto);
    if (caja.isEmpty()) return objeto;
    const tam = caja.getSize(new THREE.Vector3());
    const centro = caja.getCenter(new THREE.Vector3());
    const k = Math.min(CAJA.ancho / Math.max(1e-6, tam.x), CAJA.alto / Math.max(1e-6, tam.y));
    const envoltorio = new THREE.Group();
    objeto.position.sub(centro);
    envoltorio.add(objeto);
    envoltorio.scale.setScalar(k);
    envoltorio.name = "simbolo-propio";
    return envoltorio;
}

function base64ABufer(datos: string): ArrayBuffer {
    const b64 = datos.slice(datos.indexOf(",") + 1).replace(/\s+/g, "");
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
}

async function desdeGltf(datos: string): Promise<THREE.Object3D> {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const cargador = new GLTFLoader();
    const bufer = base64ABufer(datos);
    const fuente = datos.startsWith("data:model/gltf+json") ? new TextDecoder().decode(bufer) : bufer;
    const gltf = await cargador.parseAsync(fuente, "");
    gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    return gltf.scene;
}

async function desdeSvg(a: ArchivoSimbolo, svg: string, profundidad: number): Promise<THREE.Object3D> {
    const { SVGLoader } = await import("three/examples/jsm/loaders/SVGLoader.js");
    const datos = new SVGLoader().parse(svg);
    const grupo = new THREE.Group();
    const formas: Array<{ geo: THREE.ExtrudeGeometry; color: THREE.Color | null }> = [];
    for (const ruta of datos.paths) {
        const relleno = ruta.userData?.style?.fill;
        if (relleno === "none") continue;
        const color = ruta.color && relleno && relleno !== "none" ? ruta.color.clone() : null;
        for (const forma of SVGLoader.createShapes(ruta)) {
            formas.push({ geo: new THREE.ExtrudeGeometry(forma, { depth: 1, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3, curveSegments: 24 }), color });
        }
    }
    if (formas.length === 0) throw new Error("el SVG no tiene formas rellenas");
    // El SVG va en px con y hacia abajo: se voltea y luego se escala la profundidad a la del archivo.
    const plano = new THREE.Group();
    formas.forEach(({ geo, color }, i) => {
        const m = new THREE.Mesh(geo, material(a, color ?? undefined));
        m.position.z = i * 0.01; // capas en orden, sin parpadeo de profundidad
        m.castShadow = true;
        m.receiveShadow = true;
        plano.add(m);
    });
    plano.scale.y = -1;
    const caja = new THREE.Box3().setFromObject(plano);
    const tam = caja.getSize(new THREE.Vector3());
    const escalaXY = Math.min(CAJA.ancho / Math.max(1e-6, tam.x), CAJA.alto / Math.max(1e-6, tam.y));
    // Profundidad real en unidades del modelo: se compensa la escala uniforme que aplicará `encajar`.
    plano.scale.z = tam.z > 0 ? profundidad / (tam.z * escalaXY) : 1;
    grupo.add(plano);
    return grupo;
}

async function desdeImagen(a: ArchivoSimbolo, datos: string, relieve: number): Promise<THREE.Object3D> {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => mal(new Error("la imagen no se pudo leer"));
        i.src = datos; // data: ya validado (sin red)
    });
    const ancho = img.naturalWidth || 1;
    const alto = img.naturalHeight || 1;
    const k = Math.min(CAJA.ancho / ancho, CAJA.alto / alto);
    const textura = new THREE.Texture(img);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(ancho * k, alto * k, 160, Math.round(160 * (alto / ancho)) || 1);
    const mat = new THREE.MeshPhysicalMaterial({
        map: textura,
        displacementMap: textura,
        displacementScale: relieve,
        alphaMap: textura,
        transparent: true,
        alphaTest: 0.02,
        roughness: a.material.rugosidad,
        metalness: a.material.metalico,
        clearcoat: a.material.laca,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

/** Carga el símbolo propio. Lanza con un motivo legible si no se puede. */
export async function cargarModeloPropio(a: ArchivoSimbolo): Promise<THREE.Object3D> {
    const f = a.fuente;
    // Defensa en profundidad: se revalida aunque el archivo ya pasara el validador.
    if (f.tipo === "gltf") {
        const m = revisarModelo(f.datos);
        if (m) throw new Error(m);
        return encajar(await desdeGltf(f.datos));
    }
    if (f.tipo === "svg") {
        const m = revisarSvg(f.datos);
        if (m) throw new Error(m);
        return encajar(await desdeSvg(a, f.datos, f.profundidad));
    }
    if (f.tipo === "imagen") {
        const m = revisarImagen(f.datos);
        if (m) throw new Error(m);
        return encajar(await desdeImagen(a, f.datos, f.relieve));
    }
    throw new Error("el símbolo oficial no se carga como modelo propio");
}

/** Libera geometrías, materiales y texturas de un modelo propio. */
export function liberarModelo(o: THREE.Object3D): void {
    o.traverse((x) => {
        const m = x as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            const conMapas = mat as THREE.MeshPhysicalMaterial;
            conMapas.map?.dispose();
            mat.dispose();
        }
    });
}
