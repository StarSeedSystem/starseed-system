"use client";

/**
 * StarSeed OS — Exocórtex · Aurora a pantalla completa
 * ----------------------------------------------------------------------------
 * Overlay `fixed inset-0` (z alto, cristal líquido) que aloja la vista de chat
 * de Aurora aprovechando todo el ancho: en escritorio, layout de 2 columnas
 * (árbol de contextos a la izquierda, conversación a la derecha); en móvil, una
 * sola columna a pantalla casi completa (el árbol es desplegable dentro de la
 * propia vista compartida).
 *
 * NO duplica lógica: recibe TODAS las props de la sección y las pasa a
 * <AuroraChatView twoColumn>. Aporta sólo el marco del overlay, la cabecera con
 * el orbe/estado, el cierre por botón X y por tecla Escape, y el bloqueo de
 * scroll del body mientras está abierto. SSR-safe y con reduced-motion.
 */

import { useEffect } from "react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuroraChatView, type AuroraChatViewProps } from "@/components/exocortex/aurora-chat-view";

// CSS propio del overlay (prefijo .axf-*) — complementa las clases .axc-*.
const AXF_CSS = `
.axf-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;
  padding:0;color:#eef2ff;animation:axf-fade .22s ease both;}
.axf-backdrop{position:absolute;inset:0;background:rgba(2,4,10,.72);
  backdrop-filter:blur(14px) saturate(1.15);-webkit-backdrop-filter:blur(14px) saturate(1.15);}
.axf-shell{position:relative;z-index:1;display:flex;flex-direction:column;flex:1;min-height:0;
  margin:0;border-radius:0;overflow:hidden;
  background:
    radial-gradient(120% 60% at 10% -4%, rgba(0,127,255,.14), transparent 55%),
    radial-gradient(110% 60% at 96% -2%, rgba(220,20,60,.1), transparent 55%),
    radial-gradient(140% 80% at 50% 112%, rgba(57,255,20,.05), transparent 60%),
    linear-gradient(180deg, rgba(9,13,22,.96), rgba(5,8,14,.94));
  border-top:2px solid transparent;}
.axf-shell::before{content:"";position:absolute;inset:0 0 auto 0;height:2px;z-index:3;pointer-events:none;
  background:linear-gradient(90deg, transparent, #007FFF 18%, #39FF14 42%, #FFBF00 62%, #DC143C 85%, transparent);opacity:.7;}
@media (min-width:768px){
  .axf-overlay{padding:18px;}
  .axf-shell{border-radius:26px;border:1px solid rgba(148,163,184,.16);
    box-shadow:0 40px 120px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08);}
  .axf-shell::before{border-radius:26px 26px 0 0;}
}
.axf-head{position:relative;z-index:2;display:flex;align-items:center;gap:12px;
  padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.12);
  background:linear-gradient(180deg, rgba(148,163,184,.05), transparent);}
.axf-body{position:relative;z-index:1;flex:1;min-height:0;display:flex;padding:14px 15px 15px;}
.axf-orb{width:38px;height:38px;border-radius:50%;flex:none;position:relative;display:grid;place-items:center;overflow:hidden;
  background:radial-gradient(circle at 32% 28%, rgba(255,255,255,.28), transparent 45%),
    conic-gradient(from 210deg, #007FFF, #39FF14, #FFBF00, #DC143C, #007FFF);
  box-shadow:0 0 18px rgba(0,127,255,.45), inset 0 0 8px rgba(0,0,0,.35);}
.axf-orb::after{content:"";position:absolute;inset:5px;border-radius:50%;
  background:radial-gradient(circle at 45% 38%, #101728, #05070d 75%);border:1px solid rgba(255,255,255,.22);}
.axf-orb>svg{position:relative;z-index:1;}
.axf-orb.speaking{box-shadow:0 0 26px rgba(255,191,0,.55), inset 0 0 8px rgba(0,0,0,.35);}
.axf-orb.listening{box-shadow:0 0 26px rgba(57,255,20,.5), inset 0 0 8px rgba(0,0,0,.35);}
.axf-close{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;
  width:40px;height:40px;border-radius:14px;cursor:pointer;color:#ffe4e6;
  border:1px solid rgba(220,20,60,.4);background:rgba(220,20,60,.12);
  transition:transform .18s cubic-bezier(.16,1,.3,1), background .2s, box-shadow .2s;}
.axf-close:hover{transform:translateY(-1.5px) scale(1.04);background:rgba(220,20,60,.22);box-shadow:0 6px 16px rgba(220,20,60,.22);}
.axf-close:active{transform:scale(.95);}

/* Layout de 2 columnas de la vista compartida (fullscreen). */
.axc-view-2col{display:grid;grid-template-columns:1fr;gap:14px;flex:1;min-height:0;width:100%;}
@media (min-width:768px){
  .axc-view-2col{grid-template-columns:minmax(240px,320px) 1fr;gap:16px;}
}
.axc-view-tree{min-height:0;display:none;}
@media (min-width:768px){ .axc-view-tree{display:block;} }
.axc-view-main{min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;}
.axc-view-mainhead{display:flex;align-items:center;gap:10px;}
.axc-convo-col{min-height:0;}

@keyframes axf-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){
  .axf-overlay{animation:none;}
  .axf-close:hover{transform:none;}
}
`;

export interface AuroraChatFullscreenProps extends AuroraChatViewProps {
  open: boolean;
  onClose: () => void;
  /** Estado del orbe para la cabecera. */
  speaking?: boolean;
  listening?: boolean;
  /** Línea de estado (hablando/escuchando/…). */
  statusLine?: string;
}

export function AuroraChatFullscreen(props: AuroraChatFullscreenProps) {
  const { open, onClose, speaking, listening, statusLine, auroraName } = props;

  // Cerrar con Escape + bloquear el scroll del body mientras está abierto.
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="axf-overlay" role="dialog" aria-modal="true" aria-label="Aurora · pantalla completa">
      <style>{AXF_CSS}</style>
      <div className="axf-backdrop" onClick={onClose} aria-hidden />
      <div className="axf-shell">
        <div className="axf-head">
          <div
            className={cn(
              "axf-orb",
              speaking && "speaking",
              !speaking && listening && "listening",
            )}
          >
            <Maximize2 className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-tight text-white">
              {auroraName} · Pantalla completa
            </h3>
            {statusLine && <p className="truncate text-[11px] text-white/45">{statusLine}</p>}
          </div>
          <button
            className="axf-close"
            onClick={onClose}
            title="Cerrar (Esc)"
            aria-label="Cerrar pantalla completa"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="axf-body">
          {/* La vista compartida en modo 2 columnas. onClose no se re-pasa aquí
              (el cierre principal es la X de la cabecera); pasamos undefined para
              no duplicar el botón "Cerrar" dentro de la columna. */}
          <AuroraChatView {...props} twoColumn onClose={undefined} />
        </div>
      </div>
    </div>
  );
}

export default AuroraChatFullscreen;
