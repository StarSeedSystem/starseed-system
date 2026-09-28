"use client";

/**
 * Un objeto de la escena compartida en 3D (L5 · 2026-09-28).
 *
 * La transformación se aplica en cada fotograma (no por props): así el gizmo y el agarre XR
 * pueden mover el objeto sin pelearse con React, la vista previa de quien arrastra en otra
 * pantalla se ve suave, y un cambio confirmado encaja sin saltos.
 */

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { ObjetoEscena } from "@/lib/vivo/espacial/modelo";
import type { VistaPreviaArrastre } from "@/lib/vivo/espacial/sesion";
import { crearTexturaTexto } from "./texturas";
import { cargarModelo, clonNormalizado, mensajeErrorModelo } from "./cargar-modelo";

export interface PropsObjeto3D {
    obj: ObjetoEscena;
    seleccionado: boolean;
    eco: boolean;
    reducido: boolean;
    interactivo: boolean;
    arrastres: Map<string, VistaPreviaArrastre>;
    arrastrandoLocal: Set<string>;
    registrar: (id: string, o: THREE.Object3D | null) => void;
    onSeleccionar: (id: string) => void;
    onError: (id: string, mensaje: string) => void;
}

const _pos = new THREE.Vector3();
const _esc = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function MaterialEstandar({ obj, doble = false }: { obj: ObjetoEscena; doble?: boolean }) {
    const m = obj.material;
    return (
        <meshStandardMaterial
            color={m.color}
            metalness={m.metalico}
            roughness={m.rugosidad}
            emissive={m.color}
            emissiveIntensity={m.emisivo}
            transparent={m.opacidad < 1}
            opacity={m.opacidad}
            wireframe={m.alambre}
            side={doble ? THREE.DoubleSide : THREE.FrontSide}
        />
    );
}

function Primitiva({ obj, eco }: { obj: ObjetoEscena; eco: boolean }) {
    const seg = eco ? 16 : 40;
    const sombras = !eco;
    switch (obj.tipo) {
        case "caja":
            return (
                <mesh castShadow={sombras} receiveShadow={sombras}>
                    <boxGeometry args={[1, 1, 1]} />
                    <MaterialEstandar obj={obj} />
                </mesh>
            );
        case "esfera":
            return (
                <mesh castShadow={sombras} receiveShadow={sombras}>
                    <sphereGeometry args={[0.5, seg, Math.round(seg / 2)]} />
                    <MaterialEstandar obj={obj} />
                </mesh>
            );
        case "cilindro":
            return (
                <mesh castShadow={sombras} receiveShadow={sombras}>
                    <cylinderGeometry args={[0.5, 0.5, 1, seg]} />
                    <MaterialEstandar obj={obj} />
                </mesh>
            );
        case "cono":
            return (
                <mesh castShadow={sombras} receiveShadow={sombras}>
                    <coneGeometry args={[0.5, 1, seg]} />
                    <MaterialEstandar obj={obj} />
                </mesh>
            );
        case "toro":
            return (
                <mesh castShadow={sombras} receiveShadow={sombras}>
                    <torusGeometry args={[0.4, 0.14, Math.round(seg / 2), seg]} />
                    <MaterialEstandar obj={obj} />
                </mesh>
            );
        case "plano":
            return (
                <mesh receiveShadow={sombras}>
                    <planeGeometry args={[1, 1]} />
                    <MaterialEstandar obj={obj} doble />
                </mesh>
            );
        default:
            return null;
    }
}

const PX_A_M = 0.004;

function TextoPlano({ obj }: { obj: ObjetoEscena }) {
    const tex = useMemo(
        () => crearTexturaTexto(obj.texto ?? "", { color: obj.material.color, fondo: "rgba(10,12,30,0.55)" }),
        [obj.texto, obj.material.color],
    );
    useEffect(() => () => tex?.textura.dispose(), [tex]);
    if (!tex) return null;
    const img = tex.textura.image as HTMLCanvasElement;
    const w = img.width * PX_A_M;
    const h = img.height * PX_A_M;
    return (
        <mesh>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={tex.textura} transparent side={THREE.DoubleSide} toneMapped={false} opacity={obj.material.opacidad} />
        </mesh>
    );
}

function PlanoAviso({ texto, ancho = 1.2 }: { texto: string; ancho?: number }) {
    const tex = useMemo(() => crearTexturaTexto(texto, { color: "#FFBF00", fondo: "rgba(40,12,20,0.8)", anchoMax: 700 }), [texto]);
    useEffect(() => () => tex?.textura.dispose(), [tex]);
    if (!tex) return null;
    return (
        <mesh position={[0, 0.5, 0]}>
            <planeGeometry args={[ancho, ancho / tex.aspecto]} />
            <meshBasicMaterial map={tex.textura} transparent side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
    );
}

function ImagenPlano({ obj, onError }: { obj: ObjetoEscena; onError: (m: string) => void }) {
    const [estado, setEstado] = useState<{ tex: THREE.Texture; aspecto: number } | "error" | null>(null);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    useEffect(() => {
        if (!obj.url) return;
        let vivo = true;
        let cargada: THREE.Texture | null = null;
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(
            obj.url,
            (t) => {
                if (!vivo) {
                    t.dispose();
                    return;
                }
                cargada = t;
                t.colorSpace = THREE.SRGBColorSpace;
                const img = t.image as { width?: number; height?: number };
                const aspecto = img?.width && img?.height ? img.width / img.height : 1;
                setEstado({ tex: t, aspecto });
            },
            undefined,
            () => {
                if (!vivo) return;
                setEstado("error");
                onErrorRef.current("No se pudo cargar la imagen: el servidor no la comparte con otras webs (CORS) o la dirección no responde.");
            },
        );
        return () => {
            vivo = false;
            cargada?.dispose();
        };
    }, [obj.url]);
    if (estado === "error") return <PlanoAviso texto="Imagen no disponible" />;
    if (!estado) {
        return (
            <mesh>
                <planeGeometry args={[1, 0.7]} />
                <meshBasicMaterial color="#1a1d33" transparent opacity={0.6} side={THREE.DoubleSide} />
            </mesh>
        );
    }
    return (
        <mesh>
            <planeGeometry args={[estado.aspecto, 1]} />
            <meshBasicMaterial map={estado.tex} transparent={obj.material.opacidad < 1} opacity={obj.material.opacidad} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
    );
}

function ModeloGLB({ obj, onError }: { obj: ObjetoEscena; onError: (m: string) => void }) {
    const [modelo, setModelo] = useState<THREE.Object3D | "error" | null>(null);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    useEffect(() => {
        if (!obj.url) return;
        let vivo = true;
        setModelo(null);
        cargarModelo(obj.url)
            .then((g) => clonNormalizado(g))
            .then((c) => {
                if (vivo) setModelo(c);
            })
            .catch((e) => {
                if (!vivo) return;
                setModelo("error");
                onErrorRef.current(mensajeErrorModelo(e));
            });
        return () => {
            vivo = false;
        };
    }, [obj.url]);
    if (modelo === "error") {
        return (
            <group>
                <mesh position={[0, 0.5, 0]}>
                    <boxGeometry args={[1, 1, 1]} />
                    <meshBasicMaterial color="#DC143C" wireframe />
                </mesh>
                <PlanoAviso texto="Modelo no disponible" />
            </group>
        );
    }
    if (!modelo) {
        return (
            <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="#7C5CFF" wireframe transparent opacity={0.5} />
            </mesh>
        );
    }
    return <primitive object={modelo} />;
}

function Luz({ obj, eco }: { obj: ObjetoEscena; eco: boolean }) {
    return (
        <group>
            <pointLight color={obj.material.color} intensity={obj.intensidad ?? 3} distance={obj.alcance ?? 12} decay={2} castShadow={false} />
            <mesh>
                <sphereGeometry args={[0.12, eco ? 10 : 20, eco ? 8 : 14]} />
                <meshBasicMaterial color={obj.material.color} toneMapped={false} />
            </mesh>
        </group>
    );
}

function CajaSeleccion({ objeto }: { objeto: THREE.Object3D }) {
    const ayudante = useMemo(() => new THREE.BoxHelper(objeto, new THREE.Color("#7C5CFF")), [objeto]);
    useFrame(() => ayudante.update());
    useEffect(() => () => {
        ayudante.geometry.dispose();
        (ayudante.material as THREE.Material).dispose();
    }, [ayudante]);
    return <primitive object={ayudante} />;
}

function Objeto3DBase(p: PropsObjeto3D) {
    const { obj } = p;
    const grupo = useRef<THREE.Group>(null);
    const [montado, setMontado] = useState<THREE.Group | null>(null);

    useLayoutEffect(() => {
        const g = grupo.current;
        if (!g) return;
        g.position.set(obj.pos[0], obj.pos[1], obj.pos[2]);
        g.rotation.set(obj.rot[0], obj.rot[1], obj.rot[2]);
        g.scale.set(obj.esc[0], obj.esc[1], obj.esc[2]);
        setMontado(g);
        p.registrar(obj.id, g);
        return () => p.registrar(obj.id, null);
        // Solo al montar: después manda el bucle de fotogramas.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useFrame((_, dt) => {
        const g = grupo.current;
        if (!g || p.arrastrandoLocal.has(obj.id)) return;
        let pos = obj.pos;
        let rot = obj.rot;
        let esc = obj.esc;
        const previa = p.arrastres.get(obj.id);
        if (previa) {
            // `hasta` va en el reloj de la sesión (Date.now).
            if (previa.hasta < Date.now()) {
                p.arrastres.delete(obj.id);
            } else {
                pos = previa.pos;
                rot = previa.rot;
                esc = previa.esc;
            }
        }
        const k = p.reducido ? 1 : 1 - Math.exp(-dt * 14);
        _pos.set(pos[0], pos[1], pos[2]);
        _esc.set(esc[0], esc[1], esc[2]);
        _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
        if (k >= 1 || g.position.distanceToSquared(_pos) < 1e-8) g.position.copy(_pos);
        else g.position.lerp(_pos, k);
        if (k >= 1) g.quaternion.copy(_q);
        else g.quaternion.slerp(_q, k);
        if (k >= 1) g.scale.copy(_esc);
        else g.scale.lerp(_esc, k);
    });

    const alClic = (e: ThreeEvent<MouseEvent>) => {
        if (!p.interactivo) return;
        e.stopPropagation();
        p.onSeleccionar(obj.id);
    };
    const alEncima = (e: ThreeEvent<PointerEvent>) => {
        if (!p.interactivo) return;
        e.stopPropagation();
        document.body.style.cursor = "pointer";
    };
    const alFuera = () => {
        document.body.style.cursor = "";
    };
    useEffect(() => () => {
        document.body.style.cursor = "";
    }, []);

    const onError = (m: string) => p.onError(obj.id, m);

    let contenido: React.ReactNode = null;
    if (obj.tipo === "texto") contenido = <TextoPlano obj={obj} />;
    else if (obj.tipo === "imagen") contenido = <ImagenPlano obj={obj} onError={onError} />;
    else if (obj.tipo === "modelo") contenido = <ModeloGLB obj={obj} onError={onError} />;
    else if (obj.tipo === "luz") contenido = <Luz obj={obj} eco={p.eco} />;
    else contenido = <Primitiva obj={obj} eco={p.eco} />;

    return (
        <>
            <group ref={grupo} name={`objeto:${obj.id}`} onClick={alClic} onPointerOver={alEncima} onPointerOut={alFuera}>
                {contenido}
            </group>
            {p.seleccionado && montado && <CajaSeleccion objeto={montado} />}
        </>
    );
}

export const Objeto3D = memo(Objeto3DBase);
