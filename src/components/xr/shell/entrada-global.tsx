"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { esInmersivo } from "@/lib/xr/tipos";
import type { ModoXR } from "@/lib/xr/tipos";
import { DatosNavegador, evaluarCapacidades, planificarEntrada } from "@/lib/xr/capacidades";

interface EntradaGlobalXRProps {
  datosIniciales?: Partial<DatosNavegador>;
  ocultoPorDefecto?: boolean;
}

export function EntradaGlobalXR({ datosIniciales, ocultoPorDefecto = false }: EntradaGlobalXRProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    const actualizarOculto = () => {
      try {
        const guardado = localStorage.getItem("starseed.xr.boton.oculto.v1");
        if (guardado !== null) {
          setOculto(guardado === "true");
          return;
        }
      } catch {
      }
      setOculto(ocultoPorDefecto);
    };

    actualizarOculto();
  }, [ocultoPorDefecto]);

  const ocultarBoton = () => {
    try {
      localStorage.setItem("starseed.xr.boton.oculto.v1", "true");
      setOculto(true);
    } catch {
    }
  };

  const mostrarBoton = () => {
    try {
      localStorage.removeItem("starseed.xr.boton.oculto.v1");
      setOculto(false);
    } catch {
    }
  };

  const cerrar = () => ocultarBoton();

  useEffect(() => {
    if (oculto || pathname === "/genesis" || pathname === "/xr/os") {
      return;
    }

    const evaluar = (): { inmersivo?: boolean; modo?: ModoXR } => {
      const datos = {
        ua: navigator.userAgent,
        seguro: window.isSecureContext,
        tieneXR: "xr" in navigator,
        vr: null,
        ar: null,
        ofreceSesion: false,
        tactil: "ontouchstart" in window,
        webgl2: !!window.WebGLRenderingContext,
        webgpu: "gpu" in navigator,
        instalada: false,
        ...datosIniciales,
      };

      if (datos.tieneXR) {
        try {
          datos.vr = isSessionSupported("immersive-vr");
          datos.ar = isSessionSupported("immersive-ar");
        } catch {
          datos.vr = false;
          datos.ar = false;
        }
      }

      const capacidades = evaluarCapacidades(datos);
      const plan = planificarEntrada(capacidades, { instalada: datos.instalada, gesto: false });
      const inmersivo = plan.modo && esInmersivo(plan.modo);

      return { inmersivo, modo: plan.modo };
    };

    const { inmersivo, modo } = evaluar();
    const esRutaCorrecta = pathname === "/xr/os" && modo && modo !== "2d" && modo !== "3d-pantalla";

    if (!inmersivo || esRutaCorrecta) {
      return;
    }

    const handledPaths = new Set<string>();

    const handleClick = () => {
      const key = `click-${Date.now()}`;
      if (handledPaths.has(key)) return;
      handledPaths.add(key);

      router.push("/xr/os?modo=vr");
    };

    const boton = document.createElement("button");
    boton.innerText = "Entrar en VR/AR";
    boton.className = "fixed bottom-4 left-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors cursor-pointer";
    boton.setAttribute("aria-label", "Entrar en VR/AR");
    boton.onclick = handleClick;

    const cerrarBtn = document.createElement("button");
    cerrarBtn.innerText = "×";
    cerrarBtn.className = "absolute top-1 right-1 w-6 h-6 text-white hover:text-gray-200 cursor-pointer";
    cerrarBtn.setAttribute("aria-label", "Ocultar botón de entrada");
    cerrarBtn.onclick = (e) => {
      e.stopPropagation();
      ocultarBoton();
    };

    boton.appendChild(cerrarBtn);
    document.body.appendChild(boton);

    return () => {
      if (document.body.contains(boton)) {
        document.body.removeChild(boton);
      }
    };
  }, [oculto, pathname, ocultoPorDefecto, router, datosIniciales]);

  return null;
}
