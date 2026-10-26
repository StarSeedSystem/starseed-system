"use client";

/**
 * Entrar al mundo en VR/AR (Ola 1025U · U1). Reutiliza la cadena XR del OS sin copiarla:
 * `useCapacidadesXR` + `textoEntrada` deciden qué botones hay, y `obtenerAlmacenXR` da el almacén de
 * `@react-three/xr` (el mismo singleton que el resto del OS).
 *
 * Reglas:
 *  · Los botones salen SOLO si el aparato ofrece VR o AR. Sin XR no se pinta nada: ni botón ni aviso
 *    «no tienes VR» (el aviso honesto vive en los ajustes de XR, donde alguien lo busca a propósito).
 *  · `enterVR`/`enterAR` rechazan sin un `<XR>` conectado, y el navegador pide un gesto de la persona en
 *    el mismo clic. Por eso el almacén y el componente `XR` se cargan ANTES de pintar el botón y el clic
 *    llama directo, sin `await import()` por medio.
 *  · Todo se carga con `import()`: la librería XR no entra en el paquete de quien no tiene un visor.
 */
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Glasses } from "lucide-react";
import type { XRStore } from "@react-three/xr";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import { useCapacidadesXR } from "@/components/xr/shell/use-capacidades-xr";
import { textoEntrada, type BotonEntrada, type ModoBotonXR } from "@/components/xr/shell/texto-entrada";
import { registrarFallo } from "@/lib/avatares/movimiento/daemon";

type ComponenteXR = ComponentType<{ store: XRStore; children?: ReactNode }>;
type Fase = "listo" | "entrando" | "error";

export interface EntradaXRMundo {
  /** Ya se sabe si hay VR/AR y, si lo hay, el almacén está listo: se puede montar la escena sin remontarla después. */
  decidido: boolean;
  /** Vacío si el aparato no ofrece VR ni AR (y entonces no se pinta nada). */
  botones: BotonEntrada[];
  fase: Fase;
  error: string | null;
  /** Hay una sesión inmersiva abierta. */
  enXR: boolean;
  almacen: XRStore | null;
  XR: ComponenteXR | null;
  entrar: (modo: ModoBotonXR) => Promise<void>;
}

export function useEntradaXRMundo(activo = true): EntradaXRMundo {
  const { estado, datos, capacidades, plan } = useCapacidadesXR();
  const texto = useMemo(
    () => textoEntrada(capacidades, plan, estado === "sondeando", !datos.seguro),
    [capacidades, plan, estado, datos.seguro],
  );
  // Sin escena 3D (crónica de texto) no hay a dónde conectar un visor: ni se carga la librería ni se pinta nada.
  const hayXR = activo && estado === "listo" && texto.botones.length > 0;

  const [carga, setCarga] = useState<{ almacen: XRStore; XR: ComponenteXR } | null>(null);
  const [fallo, setFallo] = useState(false);
  const [fase, setFase] = useState<Fase>("listo");
  const [error, setError] = useState<string | null>(null);
  const [enXR, setEnXR] = useState(false);

  // Con un visor a la vista, se prepara el almacén y el componente <XR> antes de que nadie pulse.
  useEffect(() => {
    if (!hayXR) return;
    let vivo = true;
    (async () => {
      try {
        const { obtenerAlmacenXR } = await import("@/components/xr/shell/almacen-xr");
        const [almacen, libreria] = await Promise.all([
          obtenerAlmacenXR({ perfil: PERFILES.media, capacidades }),
          import("@react-three/xr"),
        ]);
        if (vivo) setCarga({ almacen, XR: libreria.XR as ComponenteXR });
      } catch (e) {
        registrarFallo("mundo-avatares.xr", e);
        if (vivo) setFallo(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [hayXR, capacidades]);

  // ¿Hay sesión abierta? Con ella, los habitantes pasan de tarjeta DOM a cuerpo 3D.
  const almacen = carga?.almacen ?? null;
  useEffect(() => {
    if (!almacen) return;
    setEnXR(!!almacen.getState().session);
    return almacen.subscribe((s) => setEnXR(!!s.session));
  }, [almacen]);

  const entrar = useCallback(
    async (modo: ModoBotonXR) => {
      if (!almacen) return;
      setFase("entrando");
      setError(null);
      try {
        // Sin `await` antes: el navegador solo abre XR dentro del gesto del clic.
        const sesion = await (modo === "vr-inmersivo" ? almacen.enterVR() : almacen.enterAR());
        if (!sesion) throw new Error("No se pudo abrir la sesión inmersiva.");
        setFase("listo");
      } catch (e) {
        setError(mensajeErrorXR(e));
        setFase("error");
      }
    },
    [almacen],
  );

  const listoParaPintar = hayXR && carga !== null && !fallo;
  return {
    decidido: !activo || (estado === "listo" && (!hayXR || carga !== null || fallo)),
    botones: listoParaPintar ? texto.botones : [],
    fase,
    error: fallo && hayXR ? "No se pudo preparar la realidad virtual en este aparato." : error,
    enXR,
    almacen,
    XR: carga?.XR ?? null,
    entrar,
  };
}

/** Dentro del `<Canvas>`: conecta la escena al almacén XR si lo hay; si no, deja la escena tal cual. */
export function EntornoXR({ xr, children }: { xr: Pick<EntradaXRMundo, "almacen" | "XR">; children: ReactNode }) {
  const { almacen, XR } = xr;
  if (almacen && XR) return <XR store={almacen}>{children}</XR>;
  return <>{children}</>;
}

/** Los botones «Entrar en VR/AR». Sin modo inmersivo no pinta NADA. */
export function BotonesEntradaXR({ xr }: { xr: Pick<EntradaXRMundo, "botones" | "fase" | "error" | "entrar"> }) {
  const { botones, fase, error, entrar } = xr;
  if (botones.length === 0 && !error) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="entrada-xr-mundo">
      {botones.map((b) => (
        <button
          key={b.modo}
          type="button"
          title={b.descripcion}
          aria-label={b.etiqueta}
          disabled={fase === "entrando"}
          onClick={() => void entrar(b.modo)}
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#39FF14]/40 bg-[rgba(16,185,129,0.18)] px-4 font-headline text-sm font-bold uppercase tracking-wide text-[#B8FFD0] backdrop-blur-xl transition duration-150 hover:bg-[rgba(16,185,129,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/70 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Glasses className="size-4 shrink-0" aria-hidden="true" />
          {fase === "entrando" ? "Entrando…" : b.etiqueta}
        </button>
      ))}
      {error && (
        <p role="alert" data-testid="error-entrada-xr-mundo" className="text-xs text-[#ff8aa1]">
          {error}
        </p>
      )}
    </div>
  );
}
