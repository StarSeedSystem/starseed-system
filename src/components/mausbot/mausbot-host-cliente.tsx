"use client";
// Envoltorio de cliente del Mausbot. Next 15 no permite `next/dynamic` con `ssr: false`
// en el layout raíz (Server Component), así que la carga perezosa vive aquí, como en el
// resto de envoltorios del layout (p. ej. orbe-protomolecula-cliente.tsx).
import dynamic from "next/dynamic";

const MausbotHostCliente = dynamic(() => import("./mausbot-host"), {
  ssr: false,
  loading: () => null,
});

export default MausbotHostCliente;
