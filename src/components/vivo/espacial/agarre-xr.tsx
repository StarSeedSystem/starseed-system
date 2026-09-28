"use client";

/**
 * Agarrar y mover objetos con los mandos del visor (o tocando la pantalla en AR) — L5 · 2026-09-28.
 *
 * Sin `@react-three/xr` (no está en el proyecto): se usan directamente los mandos de three
 * (`gl.xr.getController(i)`), que cubren mandos de Quest/Pico, manos con «pellizco» y los toques
 * de pantalla de la AR del móvil (fuentes transitorias). Apuntar + gatillo = agarrar; soltar = el
 * cambio se guarda y viaja a todos. Mientras se sujeta, la vista previa sale estrangulada a 10 Hz.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "@/lib/vivo/espacial/modelo";

export interface TransformacionXR {
    pos: Vec3;
    rot: Vec3;
    esc: Vec3;
}

interface Agarre {
    id: string;
    raiz: THREE.Object3D;
    desfase: THREE.Matrix4;
}

export function transformacionDe(o: THREE.Object3D): TransformacionXR {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return {
        pos: [r(o.position.x), r(o.position.y), r(o.position.z)],
        rot: [r(o.rotation.x), r(o.rotation.y), r(o.rotation.z)],
        esc: [r(o.scale.x), r(o.scale.y), r(o.scale.z)],
    };
}

export function AgarreXR({
    registro,
    puedeAgarrar,
    onInicio,
    onMover,
    onFin,
}: {
    registro: React.MutableRefObject<Map<string, THREE.Object3D>>;
    /** ¿Se puede mover este objeto? (permiso y no bloqueado) */
    puedeAgarrar: (id: string) => boolean;
    onInicio: (id: string) => void;
    onMover: (id: string, t: TransformacionXR) => void;
    onFin: (id: string, t: TransformacionXR) => void;
}) {
    const { gl, scene } = useThree();
    const agarres = useRef(new Map<THREE.Object3D, Agarre>());
    const cb = useRef({ puedeAgarrar, onInicio, onMover, onFin });
    cb.current = { puedeAgarrar, onInicio, onMover, onFin };

    useEffect(() => {
        const controles = [0, 1].map((i) => gl.xr.getController(i));
        const rayo = new THREE.Raycaster();
        const rot = new THREE.Matrix4();
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
        const mat = new THREE.LineBasicMaterial({ color: "#7C5CFF", transparent: true, opacity: 0.8 });
        const lineas = controles.map((c) => {
            const l = new THREE.Line(geo, mat);
            l.scale.z = 4;
            c.add(l);
            scene.add(c);
            return l;
        });

        const idDe = (o: THREE.Object3D | null): { id: string; raiz: THREE.Object3D } | null => {
            const raices = new Map<THREE.Object3D, string>();
            for (const [id, r] of registro.current) raices.set(r, id);
            let x: THREE.Object3D | null = o;
            while (x) {
                const id = raices.get(x);
                if (id) return { id, raiz: x };
                x = x.parent;
            }
            return null;
        };

        const alEmpezar = (ev: { target: THREE.Object3D }) => {
            const c = ev.target;
            c.updateMatrixWorld(true);
            rot.identity().extractRotation(c.matrixWorld);
            rayo.ray.origin.setFromMatrixPosition(c.matrixWorld);
            rayo.ray.direction.set(0, 0, -1).applyMatrix4(rot);
            const golpes = rayo.intersectObjects(Array.from(registro.current.values()), true);
            for (const g of golpes) {
                const encontrado = idDe(g.object);
                if (!encontrado || !cb.current.puedeAgarrar(encontrado.id)) continue;
                encontrado.raiz.updateMatrixWorld(true);
                const desfase = new THREE.Matrix4().copy(c.matrixWorld).invert().multiply(encontrado.raiz.matrixWorld);
                agarres.current.set(c, { id: encontrado.id, raiz: encontrado.raiz, desfase });
                cb.current.onInicio(encontrado.id);
                return;
            }
        };
        const alSoltar = (ev: { target: THREE.Object3D }) => {
            const a = agarres.current.get(ev.target);
            if (!a) return;
            agarres.current.delete(ev.target);
            cb.current.onFin(a.id, transformacionDe(a.raiz));
        };
        const escuchas = controles.map((c) => {
            const ini = (e: unknown) => alEmpezar(e as { target: THREE.Object3D });
            const fin = (e: unknown) => alSoltar(e as { target: THREE.Object3D });
            (c as unknown as THREE.EventDispatcher<Record<string, unknown>>).addEventListener("selectstart", ini as never);
            (c as unknown as THREE.EventDispatcher<Record<string, unknown>>).addEventListener("selectend", fin as never);
            return { c, ini, fin };
        });
        const agarresActuales = agarres.current;
        return () => {
            for (const { c, ini, fin } of escuchas) {
                (c as unknown as THREE.EventDispatcher<Record<string, unknown>>).removeEventListener("selectstart", ini as never);
                (c as unknown as THREE.EventDispatcher<Record<string, unknown>>).removeEventListener("selectend", fin as never);
            }
            lineas.forEach((l, i) => controles[i].remove(l));
            controles.forEach((c) => scene.remove(c));
            geo.dispose();
            mat.dispose();
            // Lo que se estuviera sujetando se suelta donde esté.
            for (const a of agarresActuales.values()) cb.current.onFin(a.id, transformacionDe(a.raiz));
            agarresActuales.clear();
        };
    }, [gl, scene, registro]);

    const _m = useRef(new THREE.Matrix4());
    const _inv = useRef(new THREE.Matrix4());
    useFrame(() => {
        for (const [c, a] of agarres.current) {
            const m = _m.current.copy(c.matrixWorld).multiply(a.desfase);
            // A coordenadas del padre (el «mundo», que en XR va desplazado delante de ti).
            if (a.raiz.parent) m.premultiply(_inv.current.copy(a.raiz.parent.matrixWorld).invert());
            m.decompose(a.raiz.position, a.raiz.quaternion, a.raiz.scale);
            cb.current.onMover(a.id, transformacionDe(a.raiz));
        }
    });
    return null;
}
