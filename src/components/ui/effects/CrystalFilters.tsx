"use client";

import React, { useEffect, useState } from "react";

/**
 * Filtros SVG globales para el sistema de diseño Crystal Liquid Glass.
 *
 * Estos filtros se aplican via `filter: url(#id)` en CSS o en componentes
 * Crystal específicos. Aquí vive el "vidrio realista" del sistema:
 * refracción, aberración cromática, irisado, microralladuras.
 */
export function CrystalFilters() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <svg
            className="pointer-events-none fixed inset-0 z-0 h-0 w-0 opacity-0"
            aria-hidden="true"
        >
            <defs>
                {/*
                  ORGANIC FROSTED DISPLACEMENT
                  Ondulación orgánica grande (vidrio fundido).
                */}
                <filter id="frosted-displacement" x="-20%" y="-20%" width="140%" height="140%">
                    <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.003"
                        numOctaves="3"
                        seed="5"
                        result="noise"
                    />
                    <feGaussianBlur stdDeviation="1.5" in="noise" result="smoothNoise" />
                    <feDisplacementMap
                        in="SourceGraphic"
                        in2="smoothNoise"
                        scale="30"
                        xChannelSelector="R"
                        yChannelSelector="G"
                    />
                </filter>

                {/*
                  FINE FROST — microralladuras del cristal real
                */}
                <filter id="fine-frost">
                    <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.8"
                        numOctaves="4"
                        stitchTiles="stitch"
                        result="noise"
                    />
                    <feColorMatrix type="saturate" values="0" in="noise" result="monoNoise" />
                    <feBlend mode="overlay" in="monoNoise" in2="SourceGraphic" result="grain" />
                </filter>

                {/*
                  CRYSTAL REFRACTION — refracción prismática realista
                  Ondulación sutil + aberración cromática roja/azul.
                */}
                <filter id="crystal-refraction" x="-15%" y="-15%" width="130%" height="130%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="3" result="turb" />
                    <feGaussianBlur in="turb" stdDeviation="2" result="softTurb" />
                    <feDisplacementMap in="SourceGraphic" in2="softTurb" scale="14" xChannelSelector="R" yChannelSelector="G" result="warped" />
                    {/* Aberración cromática separando canales */}
                    <feOffset in="warped" dx="2" dy="0" result="redChan" />
                    <feOffset in="warped" dx="-2" dy="0" result="blueChan" />
                    <feColorMatrix in="redChan" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.7 0" result="redOnly" />
                    <feColorMatrix in="blueChan" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0.7 0" result="blueOnly" />
                    <feBlend in="redOnly" in2="warped" mode="screen" result="rb" />
                    <feBlend in="blueOnly" in2="rb" mode="screen" />
                </filter>

                {/*
                  IRIDESCENT EDGE — borde madreperla / arcoíris
                  Aplica solo al borde de un elemento (usar junto con stroke).
                */}
                <filter id="iridescent-edge">
                    <feMorphology in="SourceGraphic" operator="dilate" radius="1.5" result="dilated" />
                    <feComposite in="dilated" in2="SourceGraphic" operator="out" result="edge" />
                    <feColorMatrix
                        in="edge"
                        type="matrix"
                        values="1.2 0.3 0.5 0 0
                                0.2 1.1 0.4 0 0
                                0.6 0.2 1.3 0 0
                                0 0 0 1 0"
                        result="prismatic"
                    />
                    <feGaussianBlur in="prismatic" stdDeviation="0.8" result="glow" />
                    <feBlend in="glow" in2="SourceGraphic" mode="screen" />
                </filter>

                {/*
                  GLASS SPECULAR — reflejo especular en el ángulo superior
                  Simula la luz reflejada sobre la superficie del cristal.
                */}
                <filter id="glass-specular" x="-5%" y="-5%" width="110%" height="110%">
                    <feSpecularLighting
                        in="SourceGraphic"
                        result="spec"
                        specularConstant="1.4"
                        specularExponent="32"
                        lightingColor="#ffffff"
                        surfaceScale="3"
                    >
                        <feDistantLight azimuth="135" elevation="60" />
                    </feSpecularLighting>
                    <feComposite in="spec" in2="SourceGraphic" operator="in" result="specOnSurface" />
                    <feBlend in="specOnSurface" in2="SourceGraphic" mode="screen" />
                </filter>

                {/*
                  PRISMATIC GLOW — halo prismático multicolor (para HolographicOverlay)
                */}
                <filter id="prismatic-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
                    <feColorMatrix
                        in="blur"
                        type="matrix"
                        values="1.6 0 0 0 0
                                0 1.2 0.6 0 0
                                0.6 0 1.6 0 0
                                0 0 0 0.85 0"
                        result="prism"
                    />
                    <feBlend in="prism" in2="SourceGraphic" mode="screen" />
                </filter>

                {/*
                  ETCHED GLASS — vidrio grabado con bordes biselados
                */}
                <filter id="etched-glass">
                    <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="2" seed="9" result="bumpNoise" />
                    <feDiffuseLighting in="bumpNoise" lightingColor="#e0f2fe" surfaceScale="2" result="emboss">
                        <feDistantLight azimuth="45" elevation="55" />
                    </feDiffuseLighting>
                    <feComposite in="emboss" in2="SourceGraphic" operator="in" result="surfaceEmboss" />
                    <feBlend in="surfaceEmboss" in2="SourceGraphic" mode="overlay" />
                </filter>

                {/*
                  Gradiente lineal usado para reflejos de cristal cortado (gem facets)
                */}
                <linearGradient id="crystal-facet" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
                    <stop offset="35%" stopColor="rgba(255,255,255,0.15)" />
                    <stop offset="65%" stopColor="rgba(255,255,255,0.05)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.35)" />
                </linearGradient>

                {/*
                  Gradiente irisado para bordes
                */}
                <linearGradient id="iris-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a5f3fc" />
                    <stop offset="30%" stopColor="#c4b5fd" />
                    <stop offset="60%" stopColor="#fbcfe8" />
                    <stop offset="100%" stopColor="#fde68a" />
                </linearGradient>
            </defs>
        </svg>
    );
}
