// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Repos que el OS usa por dentro (2026-10-23)
// ------------------------------------------------------------------------------
// Regla de Alex (2026-09-20): todo repo que se integra entra en la Biblioteca con
// su ficha y comprobación automática de versión. Lo que no corre aquí se marca
// `comingSoon` con el motivo a la vista: una ficha no promete lo que no hace.
// `kind: "project"` (como LiteLLM): instalar lo registra en tu Biblioteca y abre su superficie
// (`payload.route`). «function» exige una skill de Aurora y estas fichas no la tienen.
//
// Módulo PURO y SIN "use client": lo importa también `/api/library/actualizaciones`.
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage } from "./packages";

export const FICHAS_REPOS_OS: LibraryPackage[] = [
    {
        id: "repo-hono",
        kind: "project",
        name: "Hono · servidor web ultraligero",
        description:
            "Framework web sobre los estándares de la web (MIT, sin dependencias, < 12 kB en su versión mínima) que corre igual en " +
            "Node, Bun, Deno, Cloudflare Workers, Vercel y AWS Lambda. En StarSeed OS es la base del «servidor propio de IA» de cada " +
            "neurona (servicios/servidor-ia): une BitNet 1.58, Ollama, TurboFieldfare, LM Studio y Laya tras una sola API compatible " +
            "con OpenAI, con token, para que tus otras neuronas usen la IA de la más capaz por la malla local o la red de StarSeed. " +
            "Abrir lleva a Recursos de IA, donde se elige esa topología.",
        icon: "Server",
        tags: ["servidor", "api", "edge", "malla", "recursos-ia", "desarrollo"],
        version: "4.12.6",
        author: "honojs",
        sourceRepoId: "starseed-labs",
        free: true,
        payload: {
            upstream: "https://github.com/honojs/hono",
            canal: "releases",
            licencia: "MIT",
            requisitos: "Node 22+ (o Bun, Deno, Workers). Ya viene en el OS (dependencia del SDK de MCP).",
            servicio: "servicios/servidor-ia",
            route: "/agent?tab=recursos-ia",
            corre_aqui: true,
        },
    },
    {
        id: "repo-react-native-zalo-kit",
        kind: "project",
        name: "React Native Zalo Kit · iniciar sesión con Zalo",
        description:
            "Envoltorio del SDK de Zalo (la mensajería de Vietnam) para apps React Native en iOS y Android: iniciar sesión con " +
            "Zalo, comprobar la sesión, leer el perfil y cerrar sesión. No es un modelo de IA ni sirve para correr modelos locales: " +
            "es un conector de identidad. Queda a la espera porque las apps nativas de StarSeed OS son Tauri (no React Native) y " +
            "porque pide una app registrada en el portal de desarrolladores de Zalo en «Live Mode»; además, leer el perfil solo " +
            "funciona desde direcciones IP de Vietnam.",
        icon: "LogIn",
        tags: ["identidad", "inicio-de-sesion", "zalo", "react-native", "movil", "conector"],
        version: "0.0.0",
        author: "maitrungduc1410",
        sourceRepoId: "starseed-labs",
        free: true,
        comingSoon: true,
        payload: {
            upstream: "https://github.com/maitrungduc1410/react-native-zalo-kit",
            canal: "commits",
            licencia: "MIT",
            requisitos: "App React Native (o Expo con `npx expo prebuild`), Zalo App ID en Live Mode, configuración nativa en iOS y Android",
            note: "Llegará cuando exista una app móvil de StarSeed en React Native o un puente de inicio de sesión de Zalo para la app Tauri.",
            corre_aqui: false,
        },
    },
];
