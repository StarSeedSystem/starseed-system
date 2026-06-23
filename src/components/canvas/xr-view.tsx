"use client";

// src/components/canvas/xr-view.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Vista inmersiva REAL (WebXR) del lienzo. Renderiza los bloques de la pizarra
// como paneles flotantes dispuestos en arco dentro de una escena three.js, y
// abre una sesión inmersiva de VR o AR usando la API WebXR del navegador.
//
// Flujo honesto:
//   1. Detecta `navigator.xr`. Si no existe → UI de fallback clara (no soportado).
//   2. `await navigator.xr.isSessionSupported('immersive-vr' | 'immersive-ar')`.
//      Solo se ofrecen los modos realmente soportados.
//   3. Al iniciar: `navigator.xr.requestSession(mode, {optionalFeatures:[…]})`,
//      se monta un `THREE.WebGLRenderer({xr:true, alpha:true})` con
//      `renderer.xr.enabled=true` y `renderer.xr.setSession(session)`.
//   4. Bucle de render vía `renderer.setAnimationLoop`.
//   5. "Salir" / fin de sesión → teardown limpio (end session, dispose, loop off).
//
// Dependencia única: three. SSR-safe: TODO acceso a WebGL / WebXR ocurre en
// efectos o handlers (nunca en el cuerpo del módulo). Español.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Glasses, X, Loader2, AlertTriangle } from "lucide-react";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import { blockKindDef } from "@/lib/canvas/canvas";

type XRMode = "immersive-vr" | "immersive-ar";

// El tipado de WebXR no siempre está en lib.dom; usamos accesos laxos pero
// guardados para no romper compilación en entornos sin los tipos `XR*`.
type XRSystemLike = {
  isSessionSupported: (mode: string) => Promise<boolean>;
  requestSession: (mode: string, opts?: Record<string, unknown>) => Promise<any>;
};

function getXR(): XRSystemLike | null {
  if (typeof navigator === "undefined") return null;
  const xr = (navigator as unknown as { xr?: XRSystemLike }).xr;
  return xr ?? null;
}

// ── Textura de panel: dibuja título + tipo del bloque en un <canvas> ──────────
function makePanelTexture(block: CanvasBlock): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const W = 512;
  const H = 320;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  const def = blockKindDef(block.kind);
  const title = block.title || def?.label || block.kind;
  const kindLabel = def?.label ?? block.kind;

  // Fondo con un degradado fucsia→ámbar (paleta StarSeed).
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#1a0b2e");
  grad.addColorStop(1, "#241018");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Borde luminoso.
  ctx.strokeStyle = "rgba(217,70,239,0.6)";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);

  // Etiqueta de tipo (chip superior).
  ctx.fillStyle = "rgba(245,158,11,0.9)";
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.fillText(kindLabel.toUpperCase(), 28, 56);

  // Título (con corte simple por palabras en varias líneas).
  ctx.fillStyle = "#fdf4ff";
  ctx.font = "700 40px system-ui, sans-serif";
  const words = String(title).split(/\s+/);
  let line = "";
  let y = 130;
  const maxW = W - 56;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, 28, y);
      line = word;
      y += 50;
      if (y > H - 70) break;
    } else {
      line = test;
    }
  }
  if (line && y <= H - 40) ctx.fillText(line, 28, y);

  // Pie: una pista del contenido (url / nombre / texto) si existe.
  const d = block.data || {};
  const hint =
    (typeof d.url === "string" && d.url) ||
    (typeof d.name === "string" && d.name) ||
    (typeof d.fileName === "string" && d.fileName) ||
    (typeof d.text === "string" && d.text) ||
    "";
  if (hint) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "400 22px system-ui, sans-serif";
    const short = hint.length > 46 ? hint.slice(0, 45) + "…" : hint;
    ctx.fillText(short, 28, H - 32);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export default function XRView({
  blocks,
  onExit,
}: {
  blocks: CanvasBlock[];
  onExit: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Capacidades detectadas (null = aún comprobando).
  const [supported, setSupported] = useState<{ vr: boolean; ar: boolean } | null>(null);
  const [hasXR, setHasXR] = useState(true);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs de three.js / sesión (todo vive aquí para un teardown limpio).
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sessionRef = useRef<any>(null);
  const disposablesRef = useRef<{ geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; textures: THREE.Texture[] }>(
    { geometries: [], materials: [], textures: [] },
  );

  // Mantén los bloques actuales accesibles sin recrear callbacks.
  const blocksRef = useRef<CanvasBlock[]>(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  // ── 1) Detección de capacidades (en efecto → SSR-safe) ──────────────────────
  useEffect(() => {
    let alive = true;
    const xr = getXR();
    if (!xr || typeof xr.isSessionSupported !== "function") {
      setHasXR(false);
      setSupported({ vr: false, ar: false });
      return;
    }
    (async () => {
      let vr = false;
      let ar = false;
      try {
        vr = await xr.isSessionSupported("immersive-vr");
      } catch {
        vr = false;
      }
      try {
        ar = await xr.isSessionSupported("immersive-ar");
      } catch {
        ar = false;
      }
      if (alive) setSupported({ vr, ar });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── Teardown limpio de la escena/sesión ─────────────────────────────────────
  const teardown = useCallback((endSession: boolean) => {
    const renderer = rendererRef.current;
    if (renderer) {
      try {
        renderer.setAnimationLoop(null);
      } catch {
        /* */
      }
    }
    const session = sessionRef.current;
    if (endSession && session) {
      try {
        session.end?.();
      } catch {
        /* */
      }
    }
    sessionRef.current = null;

    // Dispose de geometrías / materiales / texturas creados.
    const { geometries, materials, textures } = disposablesRef.current;
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    disposablesRef.current = { geometries: [], materials: [], textures: [] };

    if (sceneRef.current) {
      sceneRef.current.clear();
      sceneRef.current = null;
    }
    cameraRef.current = null;

    if (renderer) {
      try {
        renderer.dispose();
      } catch {
        /* */
      }
      const el = renderer.domElement;
      if (el && el.parentNode) el.parentNode.removeChild(el);
      rendererRef.current = null;
    }
  }, []);

  // Desmontaje del componente → asegúrate de cerrar todo.
  useEffect(() => {
    return () => teardown(true);
  }, [teardown]);

  // ── 2) Construcción de la escena con paneles flotantes en arco ──────────────
  const buildScene = useCallback(() => {
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 100);
    camera.position.set(0, 1.6, 0); // altura de ojos aprox.
    cameraRef.current = camera;

    // Iluminación suave (importa sobre todo en AR / materiales no-emisivos).
    const ambient = new THREE.HemisphereLight(0xffffff, 0x222233, 1.1);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(1, 3, 2);
    scene.add(dir);

    // Disponer los bloques como paneles en un arco frente al usuario.
    const list = blocksRef.current.slice(0, 24); // límite sano
    const count = Math.max(list.length, 1);
    const radius = 2.6;
    const arc = Math.min(Math.PI * 1.1, 0.5 + count * 0.32); // amplitud del arco
    const startAngle = -arc / 2;
    const panelW = 0.9;
    const panelH = 0.56;

    list.forEach((block, i) => {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = startAngle + t * arc;
      const x = Math.sin(angle) * radius;
      const z = -Math.cos(angle) * radius;

      const geo = new THREE.PlaneGeometry(panelW, panelH);
      const tex = makePanelTexture(block);
      const mat = new THREE.MeshBasicMaterial({
        map: tex ?? undefined,
        color: tex ? 0xffffff : 0x3a1d4d,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 1.6 + Math.sin(i * 0.9) * 0.12, z);
      mesh.lookAt(0, 1.6, 0); // orienta el panel hacia el usuario
      scene.add(mesh);

      disposablesRef.current.geometries.push(geo);
      disposablesRef.current.materials.push(mat);
      if (tex) disposablesRef.current.textures.push(tex);
    });

    // Si el lienzo está vacío, muestra un panel-aviso.
    if (list.length === 0) {
      const geo = new THREE.PlaneGeometry(1.2, 0.4);
      const placeholder: CanvasBlock = {
        id: "empty",
        kind: "text",
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        data: { text: "Lienzo vacío — añade bloques" },
        title: "Sin bloques",
      };
      const tex = makePanelTexture(placeholder);
      const mat = new THREE.MeshBasicMaterial({ map: tex ?? undefined, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 1.6, -2.4);
      scene.add(mesh);
      disposablesRef.current.geometries.push(geo);
      disposablesRef.current.materials.push(mat);
      if (tex) disposablesRef.current.textures.push(tex);
    }
  }, []);

  // ── 3) Iniciar la sesión inmersiva REAL ─────────────────────────────────────
  const startSession = useCallback(
    async (mode: XRMode) => {
      setError(null);
      const xr = getXR();
      if (!xr) {
        setHasXR(false);
        return;
      }
      setStarting(true);
      try {
        // Construye renderer (WebGL con XR habilitado y fondo transparente para AR).
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(typeof window !== "undefined" ? window.devicePixelRatio : 1);
        renderer.xr.enabled = true;
        rendererRef.current = renderer;
        if (containerRef.current) {
          renderer.domElement.style.width = "100%";
          renderer.domElement.style.height = "100%";
          containerRef.current.appendChild(renderer.domElement);
        }

        buildScene();

        // Solicita la sesión WebXR con características opcionales.
        const session = await xr.requestSession(mode, {
          optionalFeatures: ["local-floor", "hand-tracking", "bounded-floor"],
        });
        sessionRef.current = session;

        // Cuando la sesión termina (botón del visor, Salir del sistema, etc.)
        // limpiamos y volvemos a la UI normal.
        const onEnd = () => {
          teardown(false); // la sesión ya terminó: no la cerramos otra vez
          setActive(false);
          setStarting(false);
        };
        session.addEventListener?.("end", onEnd);

        await renderer.xr.setReferenceSpaceType?.("local-floor");
        await renderer.xr.setSession(session);

        // Bucle de render impulsado por WebXR.
        renderer.setAnimationLoop(() => {
          const scene = sceneRef.current;
          const camera = cameraRef.current;
          if (scene && camera) renderer.render(scene, camera);
        });

        setActive(true);
        setStarting(false);
      } catch (e) {
        teardown(true);
        setActive(false);
        setStarting(false);
        const msg = e instanceof Error ? e.message : "No se pudo iniciar la sesión WebXR.";
        setError(msg);
      }
    },
    [buildScene, teardown],
  );

  // ── 4) Salir (cierra sesión + teardown) ─────────────────────────────────────
  const exitImmersive = useCallback(() => {
    teardown(true);
    setActive(false);
    setStarting(false);
  }, [teardown]);

  // ── Render de la UI (overlay) ───────────────────────────────────────────────
  const checking = supported === null;
  const noSupport = !hasXR || (supported !== null && !supported.vr && !supported.ar);

  return (
    <div className="absolute inset-0 z-[140] flex flex-col bg-black/95 backdrop-blur-sm">
      {/* Contenedor del canvas WebGL (se llena al iniciar la sesión) */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Cabecera / controles */}
      <div className="relative z-10 flex items-center gap-3 border-b border-white/10 bg-black/60 px-4 py-2">
        <Glasses className="h-4 w-4 text-fuchsia-300" />
        <p className="text-sm font-medium text-amber-50">Lienzo inmersivo (WebXR)</p>
        {active && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200/90">
            sesión activa
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {active && (
            <Button size="sm" variant="secondary" onClick={exitImmersive}>
              <X className="h-4 w-4" /> Salir de la sesión
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onExit}>
            <X className="h-4 w-4" /> Cerrar
          </Button>
        </div>
      </div>

      {/* Panel central: lanzar / estado / fallback */}
      {!active && (
        <div className="relative z-10 flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-fuchsia-500/25 bg-zinc-950/70 p-6 text-center">
            {checking ? (
              <div className="flex flex-col items-center gap-3 text-white/70">
                <Loader2 className="h-6 w-6 animate-spin text-fuchsia-300" />
                <p className="text-sm">Comprobando soporte WebXR…</p>
              </div>
            ) : noSupport ? (
              <div className="flex flex-col items-center gap-3">
                <AlertTriangle className="h-7 w-7 text-amber-300/80" />
                <p className="text-sm font-medium text-amber-50">VR/AR no disponible</p>
                <p className="text-sm text-white/60">
                  Tu dispositivo/navegador no soporta WebXR (VR/AR). Necesitas un visor o un
                  navegador compatible.
                </p>
                <Button size="sm" variant="outline" className="mt-1" onClick={onExit}>
                  Volver al lienzo
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-tr from-fuchsia-500 to-amber-500">
                  <Glasses className="h-6 w-6 text-white" />
                </div>
                <p className="text-sm text-white/70">
                  Entra en el lienzo en realidad inmersiva. Los bloques aparecen como paneles
                  flotantes a tu alrededor.
                </p>
                {error && (
                  <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {supported?.vr && (
                    <Button
                      size="sm"
                      className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white"
                      disabled={starting}
                      onClick={() => startSession("immersive-vr")}
                    >
                      {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Glasses className="h-4 w-4" />}
                      Entrar en VR
                    </Button>
                  )}
                  {supported?.ar && (
                    <Button
                      size="sm"
                      className="gap-1.5 bg-amber-600 hover:bg-amber-500 text-white"
                      disabled={starting}
                      onClick={() => startSession("immersive-ar")}
                    >
                      {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Glasses className="h-4 w-4" />}
                      Entrar en AR
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-white/35">
                  {blocks.length} bloque{blocks.length === 1 ? "" : "s"} se mostrarán como paneles.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
