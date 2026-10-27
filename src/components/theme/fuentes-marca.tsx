"use client";

import { useEffect, useRef, useState } from "react";
import {
  URL_SATOSHI,
  URL_QUICKSAND,
  FuenteMarcaEstado,
  requiereSatoshi,
  requiereQuicksand,
  variablesCSS,
  respaldos,
  duplicadosInsertados,
  insertarEnlace,
} from "@/lib/theme/fuentes-marca-lib";

export interface FuentesMarcaProps {
  papelEditorial?: boolean;
  temaNatural?: boolean;
}

export default function FuentesMarca({ papelEditorial = false, temaNatural = false }: FuentesMarcaProps) {
  const [estado, setEstado] = useState<FuenteMarcaEstado>({
    papelEditorial,
    temaNatural,
    enlacesInsertados: [],
  });
  const montado = useRef(false);

  useEffect(() => {
    if (montado.current) {
      // Si las props cambian después del primer montaje, actualizamos el estado.
      setEstado((prev) => {
        let s = { ...prev, papelEditorial, temaNatural };
        if (requiereSatoshi(s) && !prev.enlacesInsertados.includes(URL_SATOSHI)) s = insertarEnlace(s, URL_SATOSHI);
        if (requiereQuicksand(s) && !prev.enlacesInsertados.includes(URL_QUICKSAND)) s = insertarEnlace(s, URL_QUICKSAND);
        return s;
      });
      return;
    }
    montado.current = true;
    setEstado((prev) => {
      let s = { ...prev, papelEditorial, temaNatural };
      if (requiereSatoshi(s)) s = insertarEnlace(s, URL_SATOSHI);
      if (requiereQuicksand(s)) s = insertarEnlace(s, URL_QUICKSAND);
      return s;
    });
  }, [papelEditorial, temaNatural]);

  // Inserta los enlaces en <head> una sola vez, sin duplicados.
  useEffect(() => {
    const vars = variablesCSS();
    const estilosPrevios = document.querySelectorAll('style[data-ss-fonts]');
    if (estilosPrevios.length > 0) return; // ya cargado en esta página

    const cabezas = document.head.querySelectorAll('link[data-ss-font]');
    const urlsPrevias = Array.from(cabezas).map((n) => (n as HTMLLinkElement).href);
    const dups = duplicadosInsertados([...urlsPrevias, ...estado.enlacesInsertados]);
    if (dups.length > 0) {
      // No se insertan duplicados: ya existen en el DOM.
      return;
    }

    estado.enlacesInsertados.forEach((url) => {
      if (!document.querySelector(`link[href="${url}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url;
        link.setAttribute("data-ss-font", "true");
        document.head.appendChild(link);
      }
    });

    // Variables CSS expuestas en :root.
    const style = document.createElement("style");
    style.setAttribute("data-ss-fonts", "true");
    const reglas = Object.entries(vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join("\n");
    style.textContent = `:root { ${reglas} }`;
    document.head.appendChild(style);
  }, [estado.enlacesInsertados]);

  // Respaldo accesible: expone variables como propiedades CSS en línea
  // para que cualquier componente que use var(--ss-font-display) funcione.
  return (
    <div aria-hidden="true" style={{ display: "none" }}>
      <span style={{ fontFamily: variablesCSS()["--ss-font-display"] }}>Satoshi</span>
      <span style={{ fontFamily: variablesCSS()["--ss-font-titular"] }}>Rajdhani</span>
      <span style={{ fontFamily: variablesCSS()["--ss-font-organica"] }}>Quicksand</span>
    </div>
  );
}
