'use client';

// ════════════════════════════════════════════════════════════════
// OmnifrecuenciasApp — App COMPLETA de frecuencias funcionales
// ----------------------------------------------------------------
// Punto de montaje de la app REAL del usuario ("Omni-Frecuencias"),
// portada NATIVAMENTE al StarSeed OS (sin iframe). Renderiza la raíz de
// la app portada en `./frecuencias/App.tsx`, que conserva:
//   • Biblioteca de frecuencias por categorías (búsqueda, orden, filtros).
//   • Generador multi-oscilador con paneo 3D (panX/Y/Z) + transiciones.
//   • Recetas de sinergia (binaural Phi/Pi, Schumann, Sol-Luna, etc.).
//   • Visualizador (canvas) + reproductor global.
//   • Guardado/carga de presets en la Biblioteca SOBERANA del OS
//     (`@/lib/library-store`, ya sincronizada con Supabase).
//
// Se monta como destino navegable de la ruta `/omnifrecuencias` y dentro
// de una ventana del OS (vía `omni-app-host`). La raíz portada usa
// `h-full` + scroll interno, así que llena su contenedor en ambos casos.
//
// Nota: el WIDGET compacto del dashboard y su motor (`omni-engine` /
// `omni-presets`) siguen existiendo intactos para el panel; esta app
// completa usa el motor WebAudio propio de la app real (useAudio).
// ════════════════════════════════════════════════════════════════

import FrecuenciasApp from './frecuencias/App';

export function OmnifrecuenciasApp() {
    return <FrecuenciasApp />;
}

export default OmnifrecuenciasApp;
