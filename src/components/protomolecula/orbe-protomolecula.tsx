"use client";
/**
 * Orbe 4D de la Protomolécula · un «bot de diseño 4D» junto a la orbe de Astraura (petición de Alex del
 * 2026-10-20). La forma la decide `orbe4d/coreografia.ts` y la dibuja `orbe4d/motor.ts` (three.js, cargado
 * a demanda): geometría sagrada que se transforma (merkaba, jitterbug, teseracto girando en 4D, dodecaedro,
 * matriz isotrópica, icosaedro), siembra al encenderse, carga con el cubo de Metatrón y transformación
 * hacia cualquier diseño 3D generado.
 *
 * Se arrastra como la de Astraura y tiene SU zona para soltarla y apagarla (el borde izquierdo, el lado de
 * la creación). Se enciende y se apaga también desde el lienzo de creación de la Trinidad izquierda, desde
 * su propio panel y pidiéndoselo a Astraura; la preferencia viaja con la cuenta a todas las neuronas.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROTO_ORB_ABRIR_EVENT,
  PROTO_ORB_FAB_EVENT,
  PROTO_ORB_FAB_KEY,
  PROTO_ORB_POS_KEY,
  guardarActivada,
  guardarPosicion,
  leerActivada,
  leerPosicion,
  limitarPosicion,
  medidasOrbe,
  type Punto,
} from "@/lib/protomolecula/orbe-bus";
import { registroPorRuta, type Estilo, type IdForma } from "@/lib/protomolecula/orbe4d/coreografia";
import {
  PROTO_ORB_CERRAR_EVENT,
  PROTO_ORB_ESTADO_EVENT,
  PROTO_ORB_ESTILO_KEY,
  dentroDeZona,
  guardarEstilo,
  leerDetalle,
  leerEstilo,
  nivelDeVoz,
  zonaApagado,
} from "@/lib/protomolecula/orbe4d/eventos";
import type { MotorOrbe } from "@/lib/protomolecula/orbe4d/motor";
import { PanelOrbe } from "./panel-orbe";
import { iniciarEscuchaContexto } from "./ventana/contexto-anunciado";
import { usePerimeterOpcional } from "@/context/perimeter-context";

// El tamaño no es fijo (PRO1025M): `medidasOrbe(ancho)` da el dibujo, la diana táctil (≥ 44 px, puede ser mayor
// que el dibujo) y el lienzo, que es el doble del dibujo: el halo y la flor de la vida respiran fuera del círculo.
const SLOP = 5;
const SYNC_APPLY_EVENT = "starseed:sync:apply";
const AURORA_SPEAK_EVENT = "aurora:speak";

function viewport() {
  return { ancho: window.innerWidth, alto: window.innerHeight };
}

/** Avisa al resto del OS (botón del lienzo de creación, otras pestañas) de que la orbe cambió. */
function emitirActivada(activada: boolean) {
  try {
    window.dispatchEvent(new CustomEvent(PROTO_ORB_FAB_EVENT, { detail: { activada } }));
  } catch {
    /* defensivo */
  }
}

export function OrbeProtomolecula() {
  const ruta = usePathname();
  const router = useRouter();
  const [montada, setMontada] = useState(false);
  const [activada, setActivada] = useState(false);
  const [pos, setPos] = useState<Punto>({ x: 0, y: 0 });
  const [panel, setPanel] = useState<{ abierto: boolean; molecula?: string; completo?: boolean }>({ abierto: false });
  const perimetro = usePerimeterOpcional();
  const tapada = Boolean(perimetro?.activeEdge);
  const [arrastrando, setArrastrando] = useState(false);
  const [sobreZona, setSobreZona] = useState(false);
  const [estilo, setEstilo] = useState<Estilo>("expresiva");
  const [fijada, setFijada] = useState<IdForma | null>(null);
  const [forma, setForma] = useState<IdForma>("semilla");
  const [sinWebGL, setSinWebGL] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reducido, setReducido] = useState(false);
  // Ancho de la pantalla: decide el tamaño de la orbe y se recalcula al rotar o redimensionar.
  const [ancho, setAncho] = useState(1024);
  const medidas = medidasOrbe(ancho);
  const medidasRef = useRef(medidas);
  medidasRef.current = medidas;

  const lienzo = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const motor = useRef<MotorOrbe | null>(null);
  const gesto = useRef<{ id: number; x0: number; y0: number; px: number; py: number; t: number; movido: boolean; origen: Punto } | null>(null);
  const temporizadorModo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apagando = useRef(false);
  const fijadaRef = useRef<IdForma | null>(null);
  fijadaRef.current = fijada;

  // ── arranque: preferencia, posición, estilo y movimiento reducido ─────────
  useEffect(() => {
    setActivada(leerActivada(window.localStorage));
    setAncho(window.innerWidth);
    setPos(leerPosicion(window.localStorage, viewport(), medidasOrbe(window.innerWidth).diana));
    setEstilo(leerEstilo(window.localStorage));
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setReducido(Boolean(mq?.matches));
    const cambio = () => setReducido(Boolean(mq?.matches));
    mq?.addEventListener?.("change", cambio);
    setMontada(true);
    return () => mq?.removeEventListener?.("change", cambio);
  }, []);

  // La ventana de la orbe necesita saber qué pantalla había delante AUNQUE se abra después de que ella anunciara su
  // contexto (EVENTO_CONTEXTO_PROTO): la orbe escucha mientras vive y guarda el último.
  useEffect(() => iniciarEscuchaContexto(), []);

  // ── motor three.js, a demanda (el layout raíz no carga motores pesados) ───
  useEffect(() => {
    if (!activada || !montada || !lienzo.current) return;
    let vivo = true;
    import("@/lib/protomolecula/orbe4d/motor")
      .then(({ crearMotor }) => {
        if (!vivo || !lienzo.current) return;
        const m = crearMotor(lienzo.current, { estilo: leerEstilo(window.localStorage), registro: registroPorRuta(window.location.pathname), reducido, tamano: medidasRef.current.lienzo });
        if (!m) { setSinWebGL(true); return; }
        motor.current = m;
        if (fijadaRef.current) m.fijarForma(fijadaRef.current);
      })
      .catch(() => setSinWebGL(true));
    return () => {
      vivo = false;
      motor.current?.destruir();
      motor.current = null;
    };
    // `reducido` cambia el bucle entero: se rehace el motor.
  }, [activada, montada, reducido]);

  // Al cambiar el ancho (rotar, redimensionar) el lienzo se redibuja al tamaño nuevo sin rehacer el motor.
  useEffect(() => { motor.current?.redimensionar(medidas.lienzo); }, [medidas.lienzo]);
  useEffect(() => { motor.current?.fijarRegistro(registroPorRuta(ruta)); }, [ruta]);
  useEffect(() => { motor.current?.fijarEstilo(estilo); }, [estilo]);
  useEffect(() => { motor.current?.fijarForma(fijada); }, [fijada]);

  // Nombre de la forma para el panel (se lee del motor sin re-renderizar en cada cuadro).
  useEffect(() => {
    if (!panel.abierto) return;
    const leer = () => motor.current && setForma(motor.current.formaActual());
    leer();
    const id = setInterval(leer, 500);
    return () => clearInterval(id);
  }, [panel.abierto]);

  const modoTemporal = useCallback((modo: Parameters<MotorOrbe["fijarModo"]>[0], ms: number) => {
    motor.current?.fijarModo(modo);
    if (temporizadorModo.current) clearTimeout(temporizadorModo.current);
    temporizadorModo.current = setTimeout(() => motor.current?.fijarModo("reposo"), ms);
  }, []);

  // ── encender y apagar ──────────────────────────────────────────────────────
  const apagar = useCallback(async (origen: "zona" | "panel" | "fuera") => {
    if (apagando.current) return;
    apagando.current = true;
    setPanel({ abierto: false });
    if (origen !== "fuera") {
      guardarActivada(window.localStorage, false);
      emitirActivada(false);
    }
    try { await motor.current?.apagar(); } catch { /* defensivo */ }
    setActivada(false);
    apagando.current = false;
    if (origen !== "fuera") setAviso("Protomolécula apagada. Enciéndela desde el lienzo de creación (izquierda) o pídeselo a Astraura.");
  }, []);

  const encender = useCallback(() => {
    guardarActivada(window.localStorage, true);
    emitirActivada(true);
    setActivada(true);
    setAviso(null);
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  // ── eventos del OS: activar/desactivar, abrir, cerrar, estado, voz y sincronía ──
  useEffect(() => {
    const deFab = (e: Event) => {
      const d = (e as CustomEvent<{ activada?: unknown } | boolean | undefined>).detail;
      const valor = typeof d === "boolean" ? d : d && typeof d === "object" && typeof d.activada === "boolean" ? d.activada : leerActivada(window.localStorage);
      if (valor && !activada) { setActivada(true); setAviso(null); }
      if (!valor && activada && !apagando.current) void apagar("fuera");
    };
    const deAbrir = (e: Event) => {
      if (!activada) return;
      e.preventDefault();
      const d = (e as CustomEvent<{ molecula?: unknown } | undefined>).detail;
      const molecula = d && typeof d.molecula === "string" ? d.molecula : undefined;
      setPanel({ abierto: true, molecula, completo: Boolean(molecula) });
    };
    const deCerrar = () => setPanel({ abierto: false });
    const deEstado = (e: Event) => {
      const d = leerDetalle((e as CustomEvent).detail);
      if (!d || !activada) return;
      e.preventDefault();
      const m = motor.current;
      switch (d.estado) {
        case "cargando":
          m?.fijarProgreso(d.progreso ?? null);
          m?.fijarModo("cargando");
          if (temporizadorModo.current) clearTimeout(temporizadorModo.current);
          break;
        case "creando": m?.pulso(); modoTemporal("creando", 3000); break;
        case "pensando": m?.voz(0.5); modoTemporal("hablando", 2100); break;
        case "listo": m?.fijarProgreso(null); m?.fijarModo("reposo"); break;
        case "forma": setFijada(d.forma); break;
        case "estilo": setEstilo(d.estilo); guardarEstilo(window.localStorage, d.estilo); break;
        case "transformar":
          m?.fijarProgreso(1);
          void m?.transformarEn(d.modelo).then((ok) => {
            m.fijarProgreso(null);
            if (ok) modoTemporal("transformando", 21000);
            else m.fijarModo("reposo");
          });
          break;
      }
    };
    const deVoz = (e: Event) => {
      const n = nivelDeVoz((e as CustomEvent).detail);
      if (n > 0) { motor.current?.voz(n); modoTemporal("hablando", 1300); }
    };
    const deAlmacen = (e: StorageEvent) => {
      if (e.key === PROTO_ORB_FAB_KEY) deFab(new CustomEvent("x", { detail: e.newValue !== "false" }));
      if (e.key === PROTO_ORB_POS_KEY) setPos(leerPosicion(window.localStorage, viewport(), medidasRef.current.diana));
      if (e.key === PROTO_ORB_ESTILO_KEY) setEstilo(leerEstilo(window.localStorage));
    };
    const deSync = () => {
      deFab(new CustomEvent("x", { detail: leerActivada(window.localStorage) }));
      setEstilo(leerEstilo(window.localStorage));
    };
    window.addEventListener(PROTO_ORB_FAB_EVENT, deFab);
    window.addEventListener(PROTO_ORB_ABRIR_EVENT, deAbrir);
    window.addEventListener(PROTO_ORB_CERRAR_EVENT, deCerrar);
    window.addEventListener(PROTO_ORB_ESTADO_EVENT, deEstado);
    window.addEventListener(AURORA_SPEAK_EVENT, deVoz);
    window.addEventListener(SYNC_APPLY_EVENT, deSync);
    window.addEventListener("storage", deAlmacen);
    return () => {
      window.removeEventListener(PROTO_ORB_FAB_EVENT, deFab);
      window.removeEventListener(PROTO_ORB_ABRIR_EVENT, deAbrir);
      window.removeEventListener(PROTO_ORB_CERRAR_EVENT, deCerrar);
      window.removeEventListener(PROTO_ORB_ESTADO_EVENT, deEstado);
      window.removeEventListener(AURORA_SPEAK_EVENT, deVoz);
      window.removeEventListener(SYNC_APPLY_EVENT, deSync);
      window.removeEventListener("storage", deAlmacen);
    };
  }, [activada, apagar, modoTemporal]);

  // La Protomolécula crea (cualquier controlador activo cambia algo) → pulso de alquimia.
  useEffect(() => {
    if (!activada) return;
    let quitar: (() => void) | null = null;
    let actual: unknown = null;
    let vivo = true;
    const mirar = async () => {
      try {
        const { controladorActivo } = await import("@/lib/protomolecula/controlador-activo");
        const c = controladorActivo();
        if (!vivo || c === actual) return;
        quitar?.();
        actual = c;
        let primero = true;
        quitar = c ? c.suscribir(() => { if (primero) { primero = false; return; } motor.current?.pulso(); modoTemporal("creando", 2500); }) : null;
      } catch { /* sin Protomolécula abierta */ }
    };
    void mirar();
    const id = setInterval(mirar, 3000);
    return () => { vivo = false; clearInterval(id); quitar?.(); };
  }, [activada, modoTemporal]);

  // El puntero cerca: la orbe «te nota» antes de que la toques y te mira.
  useEffect(() => {
    if (!activada) return;
    let pendiente = 0;
    const mover = (e: PointerEvent) => {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        const r = caja.current?.getBoundingClientRect();
        if (!r || gesto.current) return;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(e.clientX - cx, e.clientY - cy);
        const cercania = Math.max(0, 1 - Math.max(0, d - medidasRef.current.diana / 2) / 180);
        motor.current?.fijarAtencion(cercania, (e.clientX - cx) / 180, (e.clientY - cy) / 180);
      });
    };
    window.addEventListener("pointermove", mover, { passive: true });
    return () => { window.removeEventListener("pointermove", mover); if (pendiente) cancelAnimationFrame(pendiente); };
  }, [activada]);

  // Mantener dentro de la pantalla al girar o redimensionar, y con el tamaño que toca a ese ancho.
  useEffect(() => {
    const ajustar = () => {
      const a = window.innerWidth;
      setAncho(a);
      setPos((p) => limitarPosicion(p, viewport(), medidasOrbe(a).diana));
    };
    window.addEventListener("resize", ajustar);
    window.addEventListener("orientationchange", ajustar);
    return () => { window.removeEventListener("resize", ajustar); window.removeEventListener("orientationchange", ajustar); };
  }, []);

  useEffect(() => {
    if (!panel.abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setPanel({ abierto: false });
    const fuera = (e: PointerEvent) => { if (caja.current && !caja.current.parentElement?.contains(e.target as Node)) setPanel({ abierto: false }); };
    window.addEventListener("keydown", tecla);
    window.addEventListener("pointerdown", fuera);
    return () => { window.removeEventListener("keydown", tecla); window.removeEventListener("pointerdown", fuera); };
  }, [panel.abierto]);

  // ── arrastre (mismo concepto que la orbe de Astraura) ─────────────────────
  /** Soltar en la zona apaga; si la orbe ya descansaba en la zona, hace falta un arrastre de verdad (≥ 80 px)
   *  para que recolocarla unos píxeles no la apague sin querer. */
  const soltarApaga = (g: { x0: number; y0: number }, x: number, y: number): boolean => {
    const v = viewport();
    const z = zonaApagado(v.ancho, v.alto);
    if (!dentroDeZona(x, y, z)) return false;
    return !dentroDeZona(g.x0, g.y0, z) || Math.hypot(x - g.x0, y - g.y0) >= 80;
  };
  const alBajar = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    gesto.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, px: e.clientX, py: e.clientY, t: performance.now(), movido: false, origen: pos };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
  };
  const alMover = (e: React.PointerEvent) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.movido && Math.hypot(dx, dy) > SLOP) { g.movido = true; setArrastrando(true); setPanel({ abierto: false }); }
    if (!g.movido) return;
    const ahora = performance.now();
    const dt = Math.max(1, ahora - g.t) / 1000;
    motor.current?.fijarArrastre((e.clientX - g.px) / dt, (e.clientY - g.py) / dt);
    g.px = e.clientX; g.py = e.clientY; g.t = ahora;
    setPos(limitarPosicion({ x: g.origen.x + dx, y: g.origen.y + dy }, viewport(), medidasRef.current.diana));
    setSobreZona(soltarApaga(g, e.clientX, e.clientY));
  };
  const alSoltar = (e: React.PointerEvent) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    gesto.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
    if (!g.movido) { setPanel((p) => ({ abierto: !p.abierto })); return; }
    setArrastrando(false);
    if (soltarApaga(g, e.clientX, e.clientY)) {
      setSobreZona(false);
      setPos(g.origen);
      void apagar("zona");
      return;
    }
    setSobreZona(false);
    setPos((p) => { guardarPosicion(window.localStorage, p); return p; });
  };
  const alCancelar = () => { gesto.current = null; setArrastrando(false); setSobreZona(false); };

  const alTeclado = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPanel((p) => ({ abierto: !p.abierto })); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); void apagar("panel"); }
  };

  if (!montada) return null;

  const v = typeof window !== "undefined" ? viewport() : { ancho: 1024, alto: 768 };
  const zona = zonaApagado(v.ancho, v.alto);
  const lado = {
    horizontal: (pos.x > v.ancho / 2 ? "izquierda" : "derecha") as "izquierda" | "derecha",
    vertical: (pos.y > v.alto / 2 ? "arriba" : "abajo") as "arriba" | "abajo",
  };

  return (
    <>
      {aviso && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[1002] flex max-w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-[#0A0F1D]/85 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-[16px]">
          <span>{aviso}</span>
          <button type="button" onClick={encender} className="min-h-[36px] shrink-0 cursor-pointer rounded-full bg-[#10B981] px-3 text-xs font-semibold text-[#0A0F1D] transition-opacity duration-150 hover:opacity-90">
            Deshacer
          </button>
        </div>
      )}

      {activada && arrastrando && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none fixed z-[999] flex items-center justify-center rounded-r-3xl border border-l-0 backdrop-blur-[16px] transition-all duration-200",
            sobreZona ? "border-[#DC143C]/60 bg-[#DC143C]/20" : "border-[#10B981]/40 bg-[#0A0F1D]/70",
          )}
          style={{ left: zona.x, top: zona.y, width: zona.ancho, height: zona.alto, transform: sobreZona ? "scale(1.04)" : "scale(1)", transformOrigin: "left center" }}
        >
          <div className="flex flex-col items-center gap-2 px-2 text-center text-[11px] font-medium leading-tight text-white">
            <Power className={cn("h-5 w-5", sobreZona ? "text-[#DC143C]" : "text-[#10B981]")} />
            {sobreZona ? "Suelta para apagar la Protomolécula" : "Arrastra aquí para apagar la Protomolécula"}
          </div>
        </div>
      )}

      {activada && (
        <div
          data-testid="protomolecula-orbe"
          data-tapada={tapada ? "si" : undefined}
          // Con una cortina Trinity abierta, la orbe pasa detrás de ella y de su velo (z 89–90): antes quedaba
          // encima del título del Centro de Creación. La cortina Horizon la enseña en su propia tarjeta.
          className={cn("fixed", tapada ? "z-[80]" : "z-[1000]")}
          style={{ left: pos.x, top: pos.y, width: medidas.diana, height: medidas.diana }}>
          {sinWebGL ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-full bg-[conic-gradient(from_0deg,#10B981,#A855F7,#00F0FF,#D4AF37,#10B981)] opacity-80 [mask:radial-gradient(circle,transparent_38%,#000_40%)] motion-safe:animate-[spin_13s_linear_infinite]"
              style={{ width: medidas.dibujo, height: medidas.dibujo, left: (medidas.diana - medidas.dibujo) / 2, top: (medidas.diana - medidas.dibujo) / 2 }}
            />
          ) : (
            <canvas
              ref={lienzo}
              aria-hidden="true"
              className="pointer-events-none absolute"
              style={{ width: medidas.lienzo, height: medidas.lienzo, left: (medidas.diana - medidas.lienzo) / 2, top: (medidas.diana - medidas.lienzo) / 2 }}
            />
          )}
          <div
            ref={caja}
            role="button"
            tabIndex={0}
            aria-label="Protomolécula: orbe de creación. Pulsa para abrir su panel, arrástrala para moverla o suéltala en el borde izquierdo para apagarla."
            aria-expanded={panel.abierto}
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alCancelar}
            onKeyDown={alTeclado}
            onPointerEnter={() => motor.current?.fijarAtencion(1, 0, 0)}
            className={cn(
              "absolute inset-0 cursor-grab touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80",
              arrastrando && "cursor-grabbing",
            )}
          />
          {panel.abierto && (
            <PanelOrbe
              forma={forma}
              fijada={fijada}
              estilo={estilo}
              moleculaId={panel.molecula}
              completoInicial={panel.completo}
              ruta={ruta ?? undefined}
              lado={lado}
              alElegirForma={(f) => setFijada(f)}
              alElegirEstilo={(e) => { setEstilo(e); guardarEstilo(window.localStorage, e); }}
              alAbrirLienzo={() => { setPanel({ abierto: false }); router.push(panel.molecula ? `/protomolecula?molecula=${encodeURIComponent(panel.molecula)}` : "/protomolecula"); }}
              alApagar={() => void apagar("panel")}
              alCerrar={() => setPanel({ abierto: false })}
            />
          )}
        </div>
      )}
    </>
  );
}

export default OrbeProtomolecula;
