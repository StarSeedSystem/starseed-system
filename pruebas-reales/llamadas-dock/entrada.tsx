/**
 * LLA1112B · banco del dock: los sensores de borde REALES (`PerimeterInterface`), el proveedor de perímetro REAL, una barra
 * de dock con el mismo `z-70` y la ventana de llamada REAL (`SuperficieLlamada`, con un clic contado en cada botón).
 */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PerimeterProvider, usePerimeter } from "@/context/perimeter-context";
import { PerimeterInterface } from "@/components/layout/perimeter-interface";
import { SuperficieLlamada } from "@/components/llamadas/superficie/superficie-llamada";
import type { AccionesLlamada, VistaLlamada } from "@/lib/llamadas/superficie/vista";

const clics: Record<string, number> = {};
const cuenta = (n: string) => () => { clics[n] = (clics[n] ?? 0) + 1; };
const vista: VistaLlamada = { estado: "conectada", tipo: "voz", nombre: "Tableta", yo: "yo", desde: Date.now() - 5000, local: null, remoto: null, micro: true, camara: false, compartiendoPantalla: false };
const acciones: AccionesLlamada = { colgar: cuenta("colgar"), alternarMicro: cuenta("micro"), alternarCamara: cuenta("camara"), alternarEspera: cuenta("espera") };

function Dock() {
  const { activeEdge } = usePerimeter();
  if (activeEdge !== "anchor") return null;
  return <div data-dock className="fixed bottom-0 left-0 right-0 z-[70] flex h-20 items-center justify-center bg-rose-900/80 text-white" onClick={cuenta("dock")}>DOCK</div>;
}
function App() {
  const [mostrar, setMostrar] = useState(true);
  useEffect(() => { (window as unknown as Record<string, unknown>).banco = { clics, quitar: () => setMostrar(false), poner: () => setMostrar(true) }; });
  const q = new URLSearchParams(location.search);
  return (
    <PerimeterProvider>
      <div style={{ position: "fixed", inset: 0, background: "#1b2" }} />
      <Dock />
      {mostrar && <SuperficieLlamada vista={vista} acciones={acciones} tamanoInicial={q.get("tam") === "completa" ? "pantalla-completa" : "panel"} />}
      <PerimeterInterface />
    </PerimeterProvider>
  );
}
createRoot(document.getElementById("raiz")!).render(<App />);
