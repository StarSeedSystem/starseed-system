"use client";

import { Canvas, useFrame, useRef } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useState } from "react";

const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Cristal3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!mountRef.current) return;
    const observer = new IntersectionObserver(
      (entry) => setVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(mountRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduced) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 1.2, 9);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));

    // Luz ambiente
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    // Luz clave (cálida)
    const clave = new THREE.DirectionalLight(0xffbf00, 1.2);
    clave.position.set(4, 5, 6);
    scene.add(clave);

    // Luz de llenado
    const relleno = new THREE.DirectionalLight(0xf8f9fa, 0.4);
    relleno.position.set(-5, 2, 4);
    scene.add(relleno);

    // Luz contra (color del registro / zenith)
    const contra = new THREE.PointLight(0x007fff, 30, 20);
    contra.position.set(0, 2, -4);
    scene.add(contra);

    // Octaedro de cristal
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

    // Retícula de nodos instanciados
    const lado = reduced ? 3 : window.innerWidth > 640 ? 6 : 4;
    const paso = 0.9;
    const n = lado ** 3;
    const nodos = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4 }),
      n
    );
    scene.add(nodos);

    const origen = new Float32Array(n * 3);
    const destino = new Float32Array(n * 3);
    const destinoPos = [];
    for (let i = 0; i < n; i++) {
      const x = (i % lado - (lado - 1) / 2) * paso;
      const y = Math.floor(i / lado % lado - (lado - 1) / 2) * paso;
      const z = Math.floor(i / (lado * lado) - (lado - 1) / 2) * paso;
      origen[i * 3] = x;
      origen[i * 3 + 1] = y;
      origen[i * 3 + 2] = z;
      const p = new THREE.Vector3(x, y, z);
      destinoPos.push(p);
    }

    const suave = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

    let start = performance.now();
    useFrame((state) => {
      const t = reduced ? 99 : (state.clock.getElapsedTime() - start) / 1000;
      const k = suave(t / 3); // 3 s para cristalizar
      for (let i = 0; i < n; i++) {
        const p = new THREE.Vector3()
          .copy(destinoPos[i])
          .lerp(new THREE.Vector3().fromArray(origen, i * 3), k);
        const m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
        nodos.setMatrixAt(i, m);
      }
      nodos.instanceMatrix.needsUpdate = true;

      // Respiración del octaedro
      const respira = 1 + 0.03 * Math.sin(t * (2 * Math.PI / 5));
      octa.scale.setScalar(respira);
      // Órbita ligera solo cuando no hay reduced motion
      if (!reduced) {
        octa.rotation.y = -t * 0.3;
        scene.rotation.y = t * (2 * Math.PI / 16);
      }
    });

    // Loop de renderizado
    const animate = (time: number) => {
      if (!visible) return;
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
  }, [reduced, visible]);

  return <canvas ref={mountRef} style={{ width: "100%", height: "400px" }} />;
}