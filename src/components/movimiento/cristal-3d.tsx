"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useState, useRef } from "react";

export function Cristal3D() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 1.2, 9);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));

    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    const clave = new THREE.DirectionalLight(0xffbf00, 1.2);
    clave.position.set(4, 5, 6);
    scene.add(clave);

    const relleno = new THREE.DirectionalLight(0xf8f9fa, 0.4);
    relleno.position.set(-5, 2, 4);
    scene.add(relleno);

    const contra = new THREE.PointLight(0x007fff, 30, 20);
    contra.position.set(0, 2, -4);
    scene.add(contra);

    const octa = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1, 0),
      new THREE.MeshPhysicalMaterial({
        color: 0xf8f9fa,
        metalness: 0,
        roughness: 0.08,
        transmission: 0.9,
        thickness: 1.2,
        ior: 2.4,
        flatShading: true,
      })
    );
    scene.add(octa);

    const lado = reduced ? 3 : window.innerWidth > 640 ? 6 : 4;
    const paso = 0.9;
    const n = lado ** 3;
    const nodos = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4 }),
      n
    );
    scene.add(nodos);

    const origen: THREE.Vector3[] = [];
    const destino: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i % lado - (lado - 1) / 2) * paso;
      const y = Math.floor(i / lado % lado - (lado - 1) / 2) * paso;
      const z = Math.floor(i / (lado * lado) - (lado - 1) / 2) * paso;
      origen.push(new THREE.Vector3(x, y, z));
      destino.push(
        new THREE.Vector3()
          .copy(origen[i])
          .multiplyScalar(2.5)
          .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4))
      );
    }

    const suave = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

    let start = performance.now();
    useFrame((state) => {
      const t = reduced ? 99 : (state.clock.getElapsedTime() - start) / 1000;
      const k = suave(t / 3);
      for (let i = 0; i < n; i++) {
        const p = origen[i].clone().lerp(destino[i], k);
        const m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
        nodos.setMatrixAt(i, m);
      }
      nodos.instanceMatrix.needsUpdate = true;

      const respira = 1 + 0.03 * Math.sin(t * (2 * Math.PI / 5));
      octa.scale.setScalar(respira);
      if (!reduced) {
        octa.rotation.y = -t * 0.3;
        scene.rotation.y = t * (2 * Math.PI / 16);
      }
    });

    const animate = (time: number) => {
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate(0);

    return () => {
      renderer.dispose();
      nodos.geometry.dispose();
      nodos.material.dispose();
      octa.geometry.dispose();
      octa.material.dispose();
    };
  }, [reduced]);

  return <canvas ref={mountRef} style={{ width: "100%", height: "400px" }} />;
}