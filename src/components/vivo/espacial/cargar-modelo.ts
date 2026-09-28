"use client";

/**
 * Carga de modelos GLB por dirección https (L5 · 2026-09-28).
 *
 * · Solo GLB (binario autocontenido, cabecera «glTF»): un .gltf con recursos externos podría
 *   pedir cosas a cualquier servidor. Y aun dentro de un GLB, cualquier recurso externo que no sea
 *   https del MISMO servidor que el modelo se bloquea (el gestor de carga lo sustituye).
 * · Tope de 40 MB leído en flujo (no se descarga más aunque el servidor mienta en la cabecera).
 * · Sin Draco/KTX2 todavía: el error lo dice con palabras claras.
 * · Un GLB es DATO (mallas, materiales, texturas): three.js lo interpreta, nada se ejecuta.
 * · Caché por dirección; cada objeto usa su propio clon.
 */

import * as THREE from "three";

export const LIMITE_MODELO_BYTES = 40 * 1024 * 1024;

const cache = new Map<string, Promise<THREE.Group>>();

async function leerConLimite(res: Response, limite: number): Promise<ArrayBuffer> {
    const cabecera = Number(res.headers.get("content-length") ?? "0");
    if (cabecera > limite) throw new Error("El modelo pesa más de 40 MB: redúcelo para que todos puedan cargarlo.");
    if (!res.body) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > limite) throw new Error("El modelo pesa más de 40 MB.");
        return buf;
    }
    const lector = res.body.getReader();
    const trozos: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.byteLength;
        if (total > limite) {
            void lector.cancel();
            throw new Error("El modelo pesa más de 40 MB.");
        }
        trozos.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const t of trozos) {
        out.set(t, o);
        o += t.byteLength;
    }
    return out.buffer;
}

export function esGlb(buf: ArrayBuffer): boolean {
    if (buf.byteLength < 12) return false;
    return new DataView(buf).getUint32(0, true) === 0x46546c67; // «glTF»
}

export function mensajeErrorModelo(e: unknown): string {
    const m = e instanceof Error ? e.message : String(e ?? "");
    if (/draco/i.test(m)) return "Este modelo usa compresión Draco, que aún no se admite. Expórtalo sin compresión.";
    if (/ktx|basis/i.test(m)) return "Este modelo usa texturas KTX2, que aún no se admiten.";
    if (/meshopt/i.test(m)) return "Este modelo usa compresión Meshopt, que aún no se admite.";
    if (/failed to fetch|networkerror|load failed|cors/i.test(m)) {
        return "No se pudo descargar: el servidor no lo permite desde otras webs (CORS) o la dirección no responde.";
    }
    return m || "No se pudo cargar el modelo.";
}

function gestorSeguro(urlModelo: string): THREE.LoadingManager {
    const origen = new URL(urlModelo).origin;
    const gestor = new THREE.LoadingManager();
    gestor.setURLModifier((u) => {
        if (u.startsWith("data:") || u.startsWith("blob:")) return u;
        try {
            const abs = new URL(u, urlModelo);
            if (abs.protocol === "https:" && abs.origin === origen) return abs.toString();
        } catch {
            /* cae abajo */
        }
        // Recurso de otro servidor dentro del modelo: bloqueado (1 píxel transparente en su lugar).
        return "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    });
    return gestor;
}

export function cargarModelo(url: string): Promise<THREE.Group> {
    const previo = cache.get(url);
    if (previo) return previo;
    const p = (async () => {
        const res = await fetch(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
        if (!res.ok) throw new Error(`El servidor del modelo respondió ${res.status}.`);
        const buf = await leerConLimite(res, LIMITE_MODELO_BYTES);
        if (!esGlb(buf)) throw new Error("No es un archivo GLB. Usa un modelo .glb (glTF binario).");
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const loader = new GLTFLoader(gestorSeguro(url));
        const base = url.slice(0, url.lastIndexOf("/") + 1);
        const gltf = await loader.parseAsync(buf, base);
        return gltf.scene;
    })();
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
}

/**
 * Clon listo para colocar: centrado sobre su base y escalado para que su lado mayor mida 1 m
 * (la escala del objeto de la escena multiplica a partir de ahí).
 */
export async function clonNormalizado(original: THREE.Group): Promise<THREE.Object3D> {
    const { clone } = await import("three/examples/jsm/utils/SkeletonUtils.js");
    const copia = clone(original);
    copia.updateMatrixWorld(true);
    const caja = new THREE.Box3().setFromObject(copia);
    const tam = caja.getSize(new THREE.Vector3());
    const mayor = Math.max(tam.x, tam.y, tam.z);
    const envoltura = new THREE.Group();
    if (Number.isFinite(mayor) && mayor > 0) {
        const centro = caja.getCenter(new THREE.Vector3());
        copia.position.x -= centro.x;
        copia.position.y -= caja.min.y;
        copia.position.z -= centro.z;
        envoltura.scale.setScalar(1 / mayor);
    }
    envoltura.add(copia);
    return envoltura;
}
