"use client";

import * as THREE from "three";
import { memo, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { pantallaPara } from "@/lib/xr/pantalla-video";
import type { NivelCalidad } from "@/lib/xr/tipos";

export interface PropsPantallaVideoHTML {
  /** ancho del vídeo en píxeles (resolución fuente) */
  ancho: number;
  /** alto del vídeo en píxeles (resolución fuente) */
  alto: number;
  /** distancia desde el observador hasta la pantalla en metros */
  distanciaM: number;
  /** nivel de calidad actual (desde calidad.ts) */
  calidadXR: NivelCalidad;
  /** URL del vídeo (si se usa renderizado) */
  videoUrl?: string;
  /** si el vídeo está en vivo (stream) o es un archivo */
  enVivo?: boolean;
  /** opcional: función para cuando el vídeo termina */
  onEnded?: () => void;
}

export const PantallaVideoHTML = memo(function PantallaVideoHTML({
  ancho,
  alto,
  distanciaM,
  calidadXR,
  videoUrl,
  enVivo = false,
  onEnded,
}: PropsPantallaVideoHTML) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const planeRef = useRef<THREE.Mesh | null>(null);
  const [textureReady, setTextureReady] = useState(false);

  // Calcular dimensiones y resolución de textura desde la función pura
  const {
    anchoMetros,
    altoMetros,
    texturaAnchoPx,
    texturaAltoPx,
    usarRenderizado,
  } = pantallaPara({
    ancho,
    alto,
    distanciaM,
    calidadXR,
  });

  useEffect(() => {
    if (!videoUrl) return;
    const video = document.createElement("video");
    videoRef.current = video;
    video.playsInline = true;
    video.autoplay = true;
    video.muted = true; // requerido para autoplay en la mayoría de navegadores
     if (enVivo) {
       // Para vista en vivo, podríamos querer añadir atributos adicionales si es necesario
       video.autoplay = true;
       video.muted = true;
     }
    video.src = videoUrl;

     // Crear lienzo para textura
     const canvas = document.createElement("canvas");
     canvasRef.current = canvas;
     canvas.width = texturaAnchoPx;
     canvas.height = texturaAltoPx;

     // Crear textura desde lienzo
     const texture = new THREE.CanvasTexture(canvas);
     texture.colorSpace = THREE.SRGBColorSpace;
     texture.needsUpdate = true;
     textureRef.current = texture;

     // Esperar a que el vídeo tenga suficientes datos para comenzar a dibujar
     const handleCanPlay = () => {
       if (!video) return;
       setTextureReady(true);
     };

    if (video.readyState >= 2) {
      // HAVE_CURRENT_DATA or higher
      handleCanPlay();
    } else {
      video.addEventListener("canplay", handleCanPlay, { once: true });
    }

     // Manejar evento de finalización
     const handleEnded = () => {
       onEnded?.();
     };
    video.addEventListener("ended", handleEnded, { once: true });

    return () => {
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("ended", handleEnded);
      if (video) {
        video.pause();
        video.src = "";
        video.load();
        videoRef.current = null;
      }
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
        canvasRef.current = null;
      }
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
    };
  }, [videoUrl, enVivo, onEnded, ancho, alto, distanciaM, calidadXR]);

  useFrame(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (video && canvas && texture && textureReady) {
       // Dibujar el cuadro actual del vídeo en el lienzo
       const ctx = canvas.getContext("2d");
       if (ctx) {
         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
         texture.needsUpdate = true;
       }
    }
  });

  useEffect(() => {
    return () => {
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
    };
  }, []);

  if (!textureReady || !textureRef.current) {
     // Devolver un marcador de posición mientras se carga
     return (
       <mesh ref={planeRef}>
         <planeGeometry args={[anchoMetros, altoMetros]} />
         <meshBasicMaterial color={0x222222} />
       </mesh>
     );
  }

  return (
    <mesh ref={planeRef}>
      <planeGeometry args={[anchoMetros, altoMetros]} />
      <meshBasicMaterial
        map={textureRef.current}
        transparent
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
});