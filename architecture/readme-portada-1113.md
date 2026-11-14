# Portada del repo (README) y dos habilidades nuevas del estudio (ola RDM1113)

## 1. Pedido de Maggasukha (2026-11-13, 21:31 México)

> Rediseñar la presentación de la página principal del repo oficial (github.com/StarSeedSystem/starseed-system).
> - **Referencia:** github.com/oil-oil/beautify-github-readme.
> - **Diseño:** muy atractivo, funcional y fácil de comprender para cualquier usuario de GitHub que abra el repo.
> - **Versiones:** las actualizadas de cada sistema operativo, con las de prueba al lado y una nota de que son de
>   prueba y están en desarrollo.
> - **Textos:** mejorar las explicaciones, los textos y todo el diseño.
>
> Además: añadir latent-spaces.github.io/brag a las habilidades de diseño de MetaGenesis para producción audiovisual,
> para cuando y como sea útil.

## 2. Estado de partida (comprobado el 2026-11-14 con la API de GitHub y el repo)

- **El README está desfasado.** Es del 2026-10-07 (commit 9ab17d55b), anuncia v0.2.0 en su tabla de descargas y tiene
  215 líneas con 12 secciones.
- **Versión estable:** v0.5.0, publicada el 2026-11-07, con tres apps (StarSeed OS, StarSeed Nexus y StarSeed Café):

  | Plataforma | Archivos |
  |---|---|
  | macOS | `.dmg` universal |
  | Windows | `.exe` y `.msi` |
  | Linux | `.AppImage`, `.deb` y `.rpm` |
  | Android | `.apk` |

- **Canal de pruebas:** la release `canal-pruebas` (prerelease) es la 0.5.1-prueba.41, del 2026-11-08. Solo trae
  StarSeed OS: `.dmg`, `.exe`, `.msi`, `.AppImage`, `.deb` y `.apk`.
- **No entran en la portada:** `native-19/20/21` son borradores (draft) y `servidor-local` son capas del servidor.
- **iOS:** no tiene binario firmado; se usa como PWA desde la web.
- **Web:** https://starseed-os.vercel.app, con la página `/instalar`.
- **Marca:**
  - tokens en `starseed_memory_root/identidad/sistema-de-diseno-claude/sistema-de-diseno/tokens.json` (temas noche,
    nieve, cristal…) y guías 01–08;
  - el símbolo original en `public/starseed-symbol*.png`.

## 3. Diseño de la portada

### 3.1 Principios

Son los de beautify-github-readme, que esta ola copia a la casa con licencia MIT:
- **El valor va primero.** En 5 segundos se entiende qué es, para quién es y cómo se prueba. El jerga interna, los
  árboles de carpetas y los comandos van después.
- **Tres capas:**
  - **contenido:** sin repetir, la prueba arriba y resultados concretos;
  - **sistema visual:** derivado de la marca StarSeed (Trinity Liquid Crystal, Matriz audiovisual), no de una
    plantilla;
  - **ingeniería:** recursos seguros en GitHub, imágenes accesibles, comandos copiables y texto buscable.
- **Formatos:**

  | Formato | Para qué |
  |---|---|
  | SVG | héroe, cabeceras de sección y diagramas |
  | PNG/WebP | capturas reales del OS |
  | GIF | solo con aprobación y siempre con alternativa fija |

- **Nada inventado:** ni estrellas, ni usuarios, ni avales, ni cifras de rendimiento. Lo que no existe se rotula «en
  desarrollo».
- **Reglas de marca:**
  - el símbolo de StarSeed nunca se genera con IA: se usa `public/starseed-symbol*.png`;
  - los colores salen solo de `tokens.json`;
  - nunca aparece el nombre de la persona que encarga.
- **El modo oscuro y el claro** se resuelven con `<picture>` y `prefers-color-scheme` (temas noche y nieve).

### 3.2 Estructura (de arriba abajo)

1. **Héroe** SVG en claro y en oscuro: el símbolo original, «StarSeed OS», el lema de una línea y una banda de cristal
   líquido (glassmorphism con los tokens). Debajo, 4 o 5 insignias reales: estable, prueba, licencia, web y
   plataformas.
2. **Botones grandes:** Abrir en la web · Descargar · Ver cómo funciona.
3. **En una frase** y **tres pilares**, con un icono SVG cada uno: democracia directa, tecnología colectiva y código
   abierto (Astraura y la malla).
4. **Capturas reales** del OS en vivo (§3.4): una mosaico de 3 o 4.
5. **Descargas**, el bloque generado (§3.3):

   | Sistema | Estable | Prueba |
   |---|---|---|
   | macOS | vX | 🧪 X-prueba.N |
   | Windows (instalador / MSI) | … | … |
   | Linux (AppImage / deb / rpm) | … | … |
   | Android | … | … |
   | iOS (PWA) | … | … |
   | Web | … | … |

   - Las pruebas van al lado, con la nota «🧪 Versión de prueba · en desarrollo: puede fallar; para uso diario, la
     estable».
   - StarSeed Nexus y StarSeed Café van en un `<details>` «Otras apps del ecosistema», con sus enlaces.
6. **Qué incluye:** las áreas reales del OS, como tarjetas en tabla o en `<details>`, cada una con una línea y su
   estado (estable, beta o en desarrollo).
7. **Cómo funciona:** un diagrama SVG de capas (la red, la mente digital y las apps), que sustituye a la sección de
   texto actual.
8. **Empezar en 1 minuto:** web, instalar y desarrollo local (comandos copiables, con lo de hoy en `## Desarrollo
   local`).
9. **Ecosistema StarSeed**, **Principios**, **Privacidad y seguridad**, **Hoja de ruta** (con estados reales),
   **Contribuir**, **Licencia** y **Enlaces**. Son más cortos y mejor escritos; se conserva todo lo que es verdad.
10. **English summary** arriba, en 3 líneas, y `README.en.md` completo, enlazado desde el héroe.

### 3.3 Bloque de descargas que se actualiza solo

- `scripts/readme/descargas.py` lee las releases con la API de GitHub (sin token, o con `GITHUB_TOKEN` en la acción):
  - la última **estable** (no prerelease, no draft);
  - el **canal de pruebas** (`canal-pruebas`);
  - y reescribe solo el bloque entre `<!-- DESCARGAS:INICIO -->` y `<!-- DESCARGAS:FIN -->` en `README.md` y en
    `README.en.md`, con enlaces directos, tamaño legible y fecha.
- **Si no hay canal de pruebas, la columna dice «—».** Nunca enlaza un draft.
- `.github/workflows/readme-descargas.yml` lo ejecuta al publicar o editar una release y una vez al día, y hace commit
  **solo** si cambia el bloque.
  - Crear este workflow y empujarlo exige la palabra de Maggasukha, como cualquier push.

### 3.4 Recursos

- Van en `assets/readme/`: `heroe-oscuro.svg`, `heroe-claro.svg`, `seccion-01…0N.svg`, `pilares-*.svg`,
  `como-funciona.svg` y `capturas/*.webp`.
- **SVG seguros en GitHub:** sin scripts, sin `foreignObject` y sin fuentes externas (texto en trazos o con
  `font-family` de sistema y alternativa). Llevan `role="img"` y `<title>`, y pesan menos de 150 KB cada uno.
- **Capturas:** con Playwright, de https://starseed-os.vercel.app (las páginas públicas reales, en temas noche y
  nieve, 1440×900 a ×2), recortadas y en WebP de menos de 300 KB.
  - Sin datos personales en pantalla.
  - Si una pantalla necesita sesión, se usa la cuenta de demostración que ya usan las pruebas, o se omite.

## 4. Habilidades nuevas para MetaGenesis (Librería)

| Repo | Licencia | Qué es | Uso en StarSeed |
|---|---|---|---|
| `oil-oil/beautify-github-readme` | MIT | Habilidad de diseño de README (todo el README, solo recursos o auditoría) | Portada del repo y de los repos satélite; auditoría de READMEs de la Librería |
| `latent-spaces/brag` | MIT | Habilidad que convierte un proyecto en un vídeo de lanzamiento de 20 s con música, movimiento y textos para compartir. `/brag` usa HyperFrames y `/brag-slim`, el modelo de la sesión | Vídeo de cada release estable y de funciones nuevas; shorts y reels derivados (Matriz: Mente Digital) |

**Cómo entran:**
- Se fijan a un commit en `vendor/habilidades/<nombre>`, con su LICENSE.
- Se copian a `.agent/skills/` para los agentes.
- Cada una lleva su ficha en `config/repos-libreria-1113.json`, con el formato de `repos-libreria-1104.json`.

**Reglas de uso de brag (estudio audiovisual):**
- **Economía:**
  - por defecto `/brag --full` (HyperFrames, render local, con modelos gratuitos o de bajo coste);
  - `/brag-slim` arranca solo con Opus, así que solo se usa con aprobación de Maggasukha.
- **Marca:**
  - el símbolo es el original, compuesto en postproducción;
  - los colores salen de los tokens;
  - la música incluida es CC BY 4.0, de ende.app: hay que citarla en los créditos de lo que se publique.
- **Nada se publica sin su palabra.** Se entregan el `brag.mp4` y los textos como borrador en Drive › Videos ›
  Proyectos en desarrollo y por el chat de producción.
- **Disparador:** al publicarse una release estable, el estudio propone un vídeo brag de la versión (borrador para
  aprobar).

## 5. Verificación y entrega

- **Vista previa local fiel a GitHub:**
  - se renderiza con `gh api markdown --raw` (modo gfm, contexto del repo) dentro de una página con la hoja de estilo
    de GitHub;
  - con Playwright se sacan capturas a 1280 px y 390 px, en tema claro y oscuro.
- **Comprobaciones:**
  - todos los enlaces (descargas con 200/302 y anclas);
  - textos alternativos;
  - peso de los recursos;
  - cero términos internos sin explicar en el primer pantallazo.
- **Entrega:** la vista previa y el diff van a `starseed_memory_root/revision/readme-1113/` y se avisa en el Mando.
  **No se hace push**: lo decide Maggasukha después de verlo.

## 6. Cola RDM1113

La cola está en `starseed_memory_root/olas/cola-rdm1113.json`.
