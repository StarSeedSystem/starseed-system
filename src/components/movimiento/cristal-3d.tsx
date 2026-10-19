import * as THREE from "three";import { Canvas, useThree, useFrame } from "@react-three/fiber";import { useEffect, useRef } from "react";
// FUNCIONES PURAS PARA PRUEBAS
const getDestino = (i, l, p) => {
  const z = i % l, y = Math.floor(i / l) % l, x = Math.floor(i / (l * l));
  return [(x - (l - 1) / 2) * p, (y - (l - 1) / 2) * p, (z - (l - 1) / 2) * p];
};
const getOrigen = (i, l, p) => {
  const [dx, dy, dz] = getDestino(i, l, p);
  const s = i * 123456789 + 987654321;
  const v1 = Math.sin(s) * 10000;
  const v2 = Math.sin(s + 1) * 10000;
  const v3 = Math.sin(s + 2) * 10000;
  const r = (v) => v - Math.floor(v);
  return [
    dx * 2.5 + (r(v1) - 0.5) * 4,
    dy * 2.5 + (r(v2) - 0.5) * 4,
    dz * 2.5 + (r(v3) - 0.5) * 4
  ];
};
const easeOut = (t) => {
  const k = Math.min(Math.max(t / 3, 0), 1);
  return 1 - Math.pow(1 - k, 3);
};
export { getDestino, getOrigen, easeOut };
export default function Cristal3D() {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{ position: [0, 1.2, 9], fov: 40 }}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
function SceneContent() {
  const { scene } = useThree();
  const diamondRef = useRef(null);
  const nodesRef = useRef(null);
  const elapsedRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const mobileRef = useRef(false);
  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mobileRef.current = window.matchMedia("(max-width: 640px)").matches;
  }, []);
  const style = getComputedStyle(document.documentElement);
  const noche = style.getPropertyValue("--ss-noche").replace(/"/g, "").trim() || "#0A0F1D";
  const nieve = style.getPropertyValue("--ss-nieve").replace(/"/g, "").trim() || "#F8F9FA";
  const horizonte = style.getPropertyValue("--ss-horizonte").replace(/"/g, "").trim() || "#10B981";
  const logica = style.getPropertyValue("--ss-logica").replace(/"/g, "").trim() || "#FFBF00";
  const zenith = style.getPropertyValue("--ss-zenith").replace(/"/g, "").trim() || "#007FFF";
  useEffect(() => {
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const key = new THREE.DirectionalLight(logica, 1.2);
    key.position.set(4, 5, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(nieve, 0.4);
    fill.position.set(-5, 2, 4);
    scene.add(fill);
    const contra = new THREE.PointLight(zenith, 30, 20);
    contra.position.set(0, 2, -4);
    scene.add(contra);
    const diamondGeo = new THREE.OctahedronGeometry(1.1, 0);
    const diamondMat = new THREE.MeshPhysicalMaterial({
      color: nieve,
      metalness: 0,
      roughness: 0.08,
      transmission: 0.9,
      thickness: 1.2,
      ior: 2.4,
      flatShading: true
    });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    diamondRef.current = diamond;
    scene.add(diamond);
    const lado = mobileRef.current ? 4 : 6;
    const paso = 0.9;
    const count = lado ** 3;
    const nodeGeo = new THREE.SphereGeometry(0.06, 12, 12);
    const nodeMat = new THREE.MeshStandardMaterial({ color: horizonte, roughness: 0.4 });
    const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, count);
    nodesRef.current = nodes;
    scene.add(nodes);
    const destino = [];
    const origen = [];
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const [dx, dy, dz] = getDestino(i, lado, paso);
      const [ox, oy, oz] = getOrigen(i, lado, paso);
      destino.push(new THREE.Vector3(dx, dy, dz));
      origen.push(new THREE.Vector3(ox, oy, oz));
    }
    nodesRef.current.destino = destino;
    nodesRef.current.origen = origen;
    nodesRef.current.matrix = matrix;
  }, [scene, noche, nieve, horizonte, logica, zenith]);
  useFrame((_, d) => {
    elapsedRef.current += d;
    const t = reducedMotionRef.current ? 99 : elapsedRef.current;
    const k = Math.min(Math.max(t / 3, 0), 1);
    const kEased = easeOut(t);
    if (nodesRef.current) {
      const { destino, origen, matrix } = nodesRef.current;
      for (let i = 0; i < destino.length; i++) {
        const p = origen[i].clone().lerp(destino[i], kEased);
        matrix.makeTranslation(p.x, p.y, p.z);
        nodesRef.current!.setMatrixAt(i, matrix);
      }
      nodesRef.current.instanceMatrix.needsUpdate = true;
    }
    if (diamondRef.current) {
      diamondRef.current.scale.setScalar(1 + 0.03 * Math.sin(t * (2 * Math.PI) / 5));
      if (!reducedMotionRef.current) diamondRef.current.rotation.y = -t * 0.3;
    }
    if (!reducedMotionRef.current && scene) scene.rotation.y = t * (2 * Math.PI) / 16;
  });
  return null;
}