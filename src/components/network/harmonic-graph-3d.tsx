/**
 * 🌌 StarSeed OS — Three.js Graph (Pure Imperative)
 *
 * Usa Three.js directamente SIN @react-three/fiber.
 * Todo el WebGL se inicializa en useEffect, igual que el
 * HolographicGraph original pero con 3D real.
 *
 * Importa three dinámicamente para evitar problemas de SSR.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { hermes } from '@/hermes-integration';
import { HarmonicForceEngine } from '@/hermes-integration/05-force-graph-engine';
import { LayerSelector } from './layer-selector';
import { NodeDetailPanel } from './node-detail-panel';
import type { MemoryLayer, GraphNode3D, GraphEdge3D } from '@/hermes-integration/01-types';
import { Loader2, Maximize2, Minimize2 } from 'lucide-react';

// ========================================================================
// Colores por tipo de nodo
// ========================================================================

const COLORS: Record<string, number> = {
  conversation: 0x38bdf8, message: 0x38bdf8, memory_fact: 0x38bdf8,
  skill: 0xa78bfa, tool: 0x39FF14, agent: 0xFFBF00,
  provider: 0xf472b6, model: 0xf472b6, api_key: 0xfb923c,
  mcp_server: 0x34d399, user_preference: 0x38bdf8,
  log_entry: 0x818cf8, discovery: 0xfbbf24,
};

// ========================================================================
// Harmonic Graph — Componente principal
// ========================================================================

export function HarmonicGraph3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<MemoryLayer>('all');
  const [selected, setSelected] = useState<GraphNode3D | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const engineRef = useRef<HarmonicForceEngine | null>(null);
  const graphDataRef = useRef<{ nodes: GraphNode3D[]; edges: GraphEdge3D[] }>({ nodes: [], edges: [] });
  const selectedIdRef = useRef<string | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  // ====================================================================
  // Cargar datos cuando cambia la capa
  // ====================================================================

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      await hermes.init();
      const data = await hermes.buildGraph(layer);
      if (cancelled) return;

      const engine = new HarmonicForceEngine();
      const n3d = data.nodes.map((n, i) => {
        const a = (i / Math.max(data.nodes.length, 1)) * Math.PI * 2;
        const r = 100 + Math.random() * 150;
        return {
          ...n,
          position: {
            x: Math.cos(a) * r + (Math.random() - 0.5) * 50,
            y: Math.sin(a) * r * 0.6 + (Math.random() - 0.5) * 50,
            z: (Math.random() - 0.5) * 150,
          },
          velocity: { x: 0, y: 0, z: 0 },
          mass: Math.max(1, n.size * 0.8),
        };
      });
      engine.load(n3d, data.edges);
      engineRef.current = engine;
      graphDataRef.current = data;
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [layer]);

  // ====================================================================
  // Loop de renderizado Three.js
  // ====================================================================

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let THREE: any = null;
    let renderer: any = null;
    let scene: any = null;
    let camera: any = null;
    let animId = 0;
    let mounted = true;

    async function init() {
      // Dynamic import de Three.js — cero riesgos de SSR
      THREE = await import('three');

      const w = container.clientWidth;
      const h = container.clientHeight;

      // Renderer
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;

      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0f);

      // Camera
      camera = new THREE.PerspectiveCamera(50, w / h, 10, 2000);
      camera.position.set(0, 0, 500);

      // Lights
      const ambient = new THREE.AmbientLight(0x8888ff, 0.4);
      scene.add(ambient);
      const light1 = new THREE.PointLight(0x007FFF, 0.6, 800);
      light1.position.set(200, 300, 300);
      scene.add(light1);
      const light2 = new THREE.PointLight(0xa78bfa, 0.3, 800);
      light2.position.set(-200, -150, 200);
      scene.add(light2);
      const light3 = new THREE.PointLight(0x39FF14, 0.2, 800);
      light3.position.set(300, -100, -100);
      scene.add(light3);

      // Grid
      const gridHelper = new THREE.GridHelper(600, 30, 0x1a1a3e, 0x111133);
      scene.add(gridHelper);

      // Stars background
      const starsGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(2000 * 3);
      for (let i = 0; i < 2000 * 3; i++) starPos[i] = (Math.random() - 0.5) * 2000;
      starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starsMat = new THREE.PointsMaterial({ color: 0x444488, size: 0.5, transparent: true, opacity: 0.6 });
      const stars = new THREE.Points(starsGeo, starsMat);
      scene.add(stars);

      // Start loop
      if (mounted) loop();
    }

    // ================================================================
    // Animation loop
    // ================================================================

    const nodeMeshes = new Map<string, any>();
    const edgeLines: any[] = [];
    const particleSystems: any[] = [];

    function buildGraph() {
      // Clear old
      nodeMeshes.forEach(m => { scene.remove(m.group); });
      nodeMeshes.clear();
      edgeLines.forEach(l => scene.remove(l));
      edgeLines.length = 0;
      particleSystems.forEach(p => scene.remove(p));
      particleSystems.length = 0;

      const engine = engineRef.current;
      if (!engine) return;
      const state = engine.getRenderState();
      const { nodes, edges } = state;

      // Build nodes
      for (const node of nodes) {
        const group = new THREE.Group();
        group.position.set(node.position.x, node.position.y, node.position.z);

        // Glow
        const glowGeo = new THREE.SphereGeometry(1, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
          color: COLORS[node.type] || 0x888888,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.scale.setScalar(2.5);
        group.add(glow);

        // Main node geometry by type
        let geo: any;
        const t = node.type;
        if (['skill', 'discovery'].includes(t)) geo = new THREE.OctahedronGeometry(1);
        else if (t === 'tool') geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        else if (t === 'agent') geo = new THREE.TetrahedronGeometry(1);
        else if (['mcp_server', 'api_key', 'model'].includes(t)) geo = new THREE.IcosahedronGeometry(1);
        else if (t === 'provider') geo = new THREE.DodecahedronGeometry(1);
        else geo = new THREE.SphereGeometry(1, 24, 24);

        const mat = new THREE.MeshPhysicalMaterial({
          color: COLORS[t] || 0x888888,
          emissive: COLORS[t] || 0x888888,
          emissiveIntensity: 0.15,
          metalness: 0.3,
          roughness: 0.15,
          transparent: true,
          opacity: 0.85,
          clearcoat: 0.1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const s = node.size || 4;
        mesh.scale.setScalar(s);
        group.add(mesh);

        // Sprite label (using canvas texture for text)
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 256;
        labelCanvas.height = 64;
        const ctx = labelCanvas.getContext('2d')!;
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#888888';
        ctx.font = '24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(node.label.slice(0, 15), 128, 40);
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, opacity: 0.7, depthWrite: false });
        const label = new THREE.Sprite(labelMat);
        label.position.set(0, -s - 6, 0);
        label.scale.setScalar(12);
        group.add(label);

        scene.add(group);

        nodeMeshes.set(node.id, {
          group, mesh, glow, label, labelTex, labelCanvas,
          baseColor: COLORS[t] || 0x888888,
          freq: node.frequency || 432,
          isPolyhedron: t !== 'conversation' && t !== 'message' && t !== 'memory_fact' && t !== 'user_preference' && t !== 'log_entry',
          size: s,
          data: node,
        });
      }

      // Build edges
      for (const edge of edges) {
        if (!edge.source || !edge.target) continue;
        const s = edge.source;
        const t = edge.target;

        // Bezier curve
        const sp = new THREE.Vector3(s.position.x, s.position.y, s.position.z);
        const tp = new THREE.Vector3(t.position.x, t.position.y, t.position.z);
        const mid = new THREE.Vector3().addVectors(sp, tp).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(tp, sp);
        const perp = new THREE.Vector3(-dir.y, dir.x, dir.z * 0.3).normalize();
        mid.add(perp.multiplyScalar((1 - edge.weight) * 30 + 10));

        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 1; i += 0.03) {
          const q0 = new THREE.Vector3().copy(sp).lerp(mid, i);
          const q1 = new THREE.Vector3().copy(mid).lerp(tp, i);
          pts.push(new THREE.Vector3().lerpVectors(q0, q1, i));
        }

        const curveGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const ec = { used_in: 0x38bdf8, depends_on: 0xa78bfa, configured_for: 0xf472b6, discovered_at: 0x34d399, related_to: 0xfbbf24, created_by: 0xfb923c, references: 0x818cf8 }[edge.type] || 0x666688;
        const curveMat = new THREE.LineBasicMaterial({
          color: ec,
          transparent: true,
          opacity: 0.2 + edge.weight * 0.3,
        });
        const line = new THREE.Line(curveGeo, curveMat);
        scene.add(line);
        edgeLines.push(line);

        // Particles along curve
        const particleCount = Math.max(3, Math.floor((edge.frequency || 432) / 200));
        const pPositions = new Float32Array(particleCount * 3);
        const pGeo = new THREE.BufferGeometry();
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
        const pMat = new THREE.PointsMaterial({
          color: 0x88ddff,
          size: 2.5,
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const particles = new THREE.Points(pGeo, pMat);
        scene.add(particles);
        particleSystems.push({
          mesh: particles,
          points: pts,
          freq: edge.frequency || 432,
          speed: 0.3 + edge.weight * 0.5,
          count: particleCount,
        });
      }
    }

    let autoRotateAngle = 0;

    function loop() {
      if (!mounted) return;
      animId = requestAnimationFrame(loop);

      if (!engineRef.current || !scene || !camera || !renderer) return;

      // Physics tick
      engineRef.current.tick();

      // Update node positions and animations
      const state = engineRef.current.getRenderState();
      const time = performance.now() / 1000;

      for (const node3d of state.nodes) {
        const meshData = nodeMeshes.get(node3d.id);
        if (!meshData) continue;

        const { group, mesh, glow, isPolyhedron, freq, baseColor, size } = meshData;

        // Position from physics engine
        group.position.set(node3d.position.x, node3d.position.y, node3d.position.z);

        // Pulse
        const pulse = 1 + Math.sin(time * freq * 0.005) * 0.08;
        mesh.scale.setScalar(size * pulse);

        // Glow
        const glowPulse = 0.3 + Math.sin(time * freq * 0.003 + 1) * 0.3;
        glow.material.opacity = glowPulse * 0.25;

        // Rotation for polyhedra
        if (isPolyhedron) {
          mesh.rotation.x += 0.003;
          mesh.rotation.y += 0.005;
        }

        // Selection highlighting
        const isSelected = node3d.id === selectedIdRef.current;
        mesh.material.emissiveIntensity = isSelected ? 0.4 : 0.15;
        mesh.material.opacity = isSelected ? 1.0 : 0.85;
        mesh.material.emissive = new THREE.Color(isSelected ? 0xffffff : baseColor);
        glow.material.opacity = isSelected ? 0.6 : glowPulse * 0.25;
      }

      // Update edge highlights
      for (let i = 0; i < edgeLines.length && i < state.edges.length; i++) {
        const edge = state.edges[i];
        if (!edge.source || !edge.target) continue;
        const h = engineRef.current.isEdgeHighlighted(edge);
        edgeLines[i].material.opacity = Math.max(0.02, h * (0.2 + edge.weight * 0.3));
      }

      // Update particles
      for (const ps of particleSystems) {
        const pos = ps.mesh.geometry.attributes.position.array;
        for (let i = 0; i < ps.count; i++) {
          const p = ((time * ps.speed * ps.freq * 0.005 + i / ps.count) % 1) * (ps.points.length - 1);
          const idx = Math.min(Math.floor(p), ps.points.length - 2);
          const lt = p - idx;
          const v = new THREE.Vector3().copy(ps.points[idx]).lerp(ps.points[Math.min(idx + 1, ps.points.length - 1)], lt);
          pos[i * 3] = v.x;
          pos[i * 3 + 1] = v.y;
          pos[i * 3 + 2] = v.z;
        }
        ps.mesh.geometry.attributes.position.needsUpdate = true;
      }

      // Auto-rotate camera
      autoRotateAngle += 0.001;
      const radius = 500;
      camera.position.x = Math.sin(autoRotateAngle) * radius;
      camera.position.z = Math.cos(autoRotateAngle) * radius;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }

    // ================================================================
    // Mouse interaction for selection (raycaster)
    // ================================================================

    function onMouseDown(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Simple distance-based selection
      let closest: string | null = null;
      let closestDist = Infinity;

      for (const [id, data] of nodeMeshes) {
        const pos = data.group.position;
        const dx = mx * (rect.width / 2) - pos.x;
        const dy = my * (rect.height / 2) - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 30 && dist < closestDist) {
          closestDist = dist;
          closest = id;
        }
      }

      if (closest) {
        selectedIdRef.current = selectedIdRef.current === closest ? null : closest;
        const nodeData = graphDataRef.current.nodes.find(n => n.id === closest);
        setSelected(nodeData || null);
      } else {
        selectedIdRef.current = null;
        setSelected(null);
      }
    }

    canvas.addEventListener('mousedown', onMouseDown);

    // ================================================================
    // Resize
    // ================================================================

    function onResize() {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);

    // ================================================================
    // Init
    // ================================================================

    init();

    // Build graph when data is ready
    const checkInterval = setInterval(() => {
      if (engineRef.current && scene) {
        buildGraph();
        clearInterval(checkInterval);
      }
    }, 100);

    return () => {
      mounted = false;
      cancelAnimationFrame(animId);
      clearInterval(checkInterval);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('resize', onResize);
      if (renderer) renderer.dispose();
    };
  }, []);

  // ====================================================================
  // Rebuild graph when layer changes (after data loads)
  // ====================================================================

  useEffect(() => {
    if (!loading && engineRef.current && canvasRef.current) {
      // The rebuild happens in the buildGraph interval check
    }
  }, [loading]);

  // ====================================================================
  // Render
  // ====================================================================

  return (
    <div className={`${fullscreen ? 'fixed inset-0 z-50 bg-black p-4' : ''}`}>
      <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-black/90"
        style={{ height: fullscreen ? 'calc(100vh - 80px)' : '600px' }}
        ref={containerRef}>

        {/* Layer selector */}
        <LayerSelector activeLayer={layer} onLayerChange={setLayer} />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80">
            <div className="text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Tejiendo la gráfica armónica...</p>
              <p className="text-xs text-muted-foreground/40">Three.js · WebGL</p>
            </div>
          </div>
        )}

        {/* Canvas */}
        <canvas ref={canvasRef} className="w-full h-full block cursor-pointer" />

        {/* Footer */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 text-[10px] text-muted-foreground/50 font-mono pointer-events-none">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400/50" /> Armónico 3D</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" /> VIVO</span>
        </div>

        {/* Controls */}
        <div className="absolute bottom-4 right-4 z-10 flex gap-2">
          {[
            ['🌌', 'all' as MemoryLayer],
            ['🧠', 'memory' as MemoryLayer],
            ['⚡', 'skills' as MemoryLayer],
            ['🔧', 'tools' as MemoryLayer],
          ].map(([emoji, l]) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              className={`px-2 py-1 text-[10px] bg-black/60 backdrop-blur border rounded-md transition-colors ${
                layer === l ? 'border-primary/50 text-primary' : 'border-white/10 text-muted-foreground hover:text-foreground'
              }`}
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="px-2 py-1 text-[10px] bg-black/60 backdrop-blur border border-white/10 rounded-md text-muted-foreground hover:text-foreground"
          >
            {fullscreen ? '⊠' : '⊡'}
          </button>
        </div>
      </div>
    </div>
  );
}