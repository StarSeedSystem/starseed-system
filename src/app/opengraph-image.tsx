/**
 * Tarjeta del OS al compartir su enlace (Open Graph / X). Se genera UNA vez al compilar (sin parámetros: estática),
 * así que no gasta funciones de Vercel en cada visita. Colores de Trinity (Zenith, Horizon, Logic, Anchor) sobre el
 * fondo del OS; sin fuentes ni imágenes externas.
 */
import { ImageResponse } from "next/og";

export const alt = "StarSeed OS — sistema operativo social descentralizado";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONDO = "#0A0712";
const TRINITY = ["#007FFF", "#10B981", "#FFBF00", "#DC143C"];

export default function ImagenParaCompartir() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "72px 88px", backgroundColor: FONDO, color: "#F5F3FF",
          backgroundImage: `radial-gradient(circle at 12% 18%, ${TRINITY[0]}55, transparent 42%), radial-gradient(circle at 88% 22%, ${TRINITY[2]}40, transparent 40%), radial-gradient(circle at 18% 92%, ${TRINITY[1]}45, transparent 40%), radial-gradient(circle at 90% 88%, ${TRINITY[3]}40, transparent 38%)`,
        }}
      >
        <div style={{ display: "flex", gap: 14, marginBottom: 36 }}>
          {TRINITY.map((c) => (
            <div key={c} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c, boxShadow: `0 0 24px ${c}` }} />
          ))}
        </div>
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }}>StarSeed OS</div>
        <div style={{ fontSize: 40, marginTop: 24, color: "#D9D6F5", lineHeight: 1.25, maxWidth: 940 }}>
          Sistema operativo social descentralizado: democracia directa, creación colectiva e inteligencia propia.
        </div>
        <div style={{ fontSize: 28, marginTop: 48, color: "#9F9BC9" }}>starseed-os.vercel.app · abierto y gratuito</div>
      </div>
    ),
    size,
  );
}
