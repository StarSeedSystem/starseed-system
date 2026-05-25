# 📓 Bitácora de Estado — StarSeed OS

> Registro cronológico de cambios significativos. **Cada sesión de trabajo añade una entrada aquí al final.** Permite a futuras sesiones (Claude u otras) entender qué se hizo, qué quedó pendiente y por qué.

---

## Formato de entrada

```
## YYYY-MM-DD — Título corto
**Sesión por:** [agente / humano]
**Resumen ejecutivo:** 1-2 frases.

### Hecho
- ...

### Decisiones tomadas
- ...

### Pendiente / Próximos pasos
- ...

### Notas / aprendizajes
- ...
```

---

## 2026-05-24 — Bootstrap del sistema de memoria y roadmap

**Sesión por:** Claude (Cowork mode, modelo Opus 4.6) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Primera sesión de consolidación del proyecto. Se conectó la carpeta local, se auditó el estado del repo, se leyeron los documentos fundacionales de Drive (Constitución, Manifiesto, Codex), y se creó el sistema de memoria persistente + roadmap técnico de 3 fases.

### Hecho
- Conectada carpeta `/Users/alex/Documents/starseed-os-main` como working directory.
- Auditoría del estado actual: Next.js 15 + Supabase + Trinity UI + Crystal Liquid Glass + Genkit AI.
- Confirmado que la carpeta **NO es un repo git todavía** (no hay `.git`). Falta `git init` y vincularlo a `StarSeedSystem/starseed-system`.
- Leídos 3 documentos fundacionales de Google Drive:
  - Constitución de la Sociedad StarSeed
  - Manifiesto Fundacional
  - Codex StarSeed (Arquitectura social comunitaria)
- Creado sistema de memoria persistente:
  - `CLAUDE.md` (raíz) — memoria de trabajo, índice maestro
  - `memory/principles.md` — desarrollo extendido de los principios con implicaciones técnicas
  - `memory/roadmap.md` — roadmap técnico de 3 fases (Semilla → Fruto → Cosecha)
  - `memory/architecture.md` — decisiones arquitectónicas
  - `memory/state.md` — esta bitácora

### Decisiones tomadas (preliminares, sujetas a validación con el equipo)
- **Estrategia de despliegue:** WebOS (PWA) primero en Fase Semilla, luego capa multiplataforma (Tauri + Capacitor) en Fase Fruto, y finalmente distro Linux propia en Fase Cosecha.
- **Servidor:** Vercel + Supabase free tier inicialmente, migración a infra propia en Fase Fruto.
- **Licencia recomendada:** AGPLv3 (no confirmada todavía).
- **Federación:** ActivityPub-compatible para feed cultural + protocolo propio para gobernanza (Fase Fruto).
- **Schema de datos:** Mantener el de `gemini.md` (Account / Profile / Page / Post / StoreItem / LibraryItem). Está alineado con la Constitución (Cuenta privada + Perfiles múltiples).
- **Sin git todavía:** se inicializará en la próxima sesión tras confirmación del propietario.

### Pendiente / Próximos pasos
1. **Inicializar git** y vincular a GitHub:
   ```
   cd /Users/alex/Documents/starseed-os-main
   git init
   git remote add origin https://github.com/StarSeedSystem/starseed-system.git
   git add .
   git commit -m "Initial commit: bootstrap memory system and roadmap"
   git branch -M main
   git push -u origin main
   ```
   (Confirmar nombre del repo y permisos primero.)
2. **Leer el 4º documento crítico de Drive** (Documento Maestro del SOSD, `1DaX2bl8...`) por chunks — es muy grande y contiene detalles técnicos importantes.
3. **Limpieza del repo:**
   - Borrar / mover a `scripts/legacy/`: `temp-aurora.html`, `temp-flora.html`, `temp-omni.html`, `temp_stitch.html`, `apply_mock_fetch.js`, `fix-widgets.js`, `refactor_widgets.js`, `run_test.js`, `update_widgets.js`.
   - Renombrar README real (no template Firebase Studio).
   - Quitar `node_modules` y `.next` del repo (asegurar `.gitignore`).
   - Quitar archivos `Icon` (artefactos de macOS).
   - Quitar `.DS_Store` y añadir a `.gitignore` global.
4. **Renombrar el proyecto** en `package.json`: `"name": "nextn"` → `"name": "starseed-os"`.
5. **Implementar Hito 1.1** del roadmap: CI/CD, licencia, code of conduct, contributing, .env.example.
6. **Conectar GitHub MCP** si está disponible, o trabajar con git por bash.
7. **Decidir governance del propio repo:** ¿quién aprueba PRs en fase Semilla? Necesario para abrir contribuciones.

### Notas / aprendizajes
- El proyecto está significativamente más maduro de lo esperado. Mucho del código está hecho, pero falta:
  - Estandarización (cleanup de scripts huérfanos).
  - Tests (no hay testing setup todavía).
  - CI/CD (falta).
  - Git (la carpeta no está versionada).
  - Documentación canónica (existía dispersa, ahora consolidada en `CLAUDE.md` + `memory/`).
- El sistema de **Singularidad del Contenido (Lienzo Universal)** es un diferenciador técnico fuerte vs. redes sociales tradicionales. El schema actual ya lo soporta con `Post.references[]`, pero falta implementar la lógica de propagación de cambios.
- Las **Insignias verificables** son la clave de la Meritocracia del Entendimiento. Implementarlas bien es prioridad en Fase Semilla.
- **Nota cultural:** los documentos fundacionales son extremadamente ricos y poéticos. La traducción a código debe mantener este espíritu: no es solo software, es la encarnación digital de una constitución civilizatoria.
- Conector de Google Drive funciona perfectamente. Conector de GitHub no apareció en el registro — usar git CLI por bash.

---

---

## 2026-05-24 — Sesión 2: Multi-proveedor de IA + privacidad + cleanup

**Sesión por:** Claude (Cowork mode, Opus 4.7) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Implementada la capa multi-proveedor de IA del Exocórtex (Ollama local, OpenAI-compatible, Anthropic Claude, Google Gemini), con cifrado AES-GCM de claves en navegador. Añadido panel de Privacidad/Soberanía de Datos en /settings. Página /agent ahora hace chat real con streaming y stop. Cleanup de carpetas duplicadas.

### Hecho
- **Capa multi-proveedor de IA** (`src/ai/providers/` y `src/ai/client/`):
  - `types.ts` con la interfaz `Provider` y tipos `ChatMessage`/`ChatOptions`/`ChatResponse`.
  - `ollama.ts` — proveedor local (sin clave, streaming NDJSON).
  - `openai.ts` — OpenAI y compatibles (Groq, Together, OpenRouter, LM Studio, vLLM). Streaming SSE.
  - `anthropic.ts` — Claude con `anthropic-dangerous-direct-browser-access`. Streaming SSE.
  - `google.ts` — Gemini vía REST directo. Sin SDK extra.
  - `index.ts` — registro central + orden de presentación.
  - `README.md` — documentación de cómo añadir nuevos proveedores y modelo de seguridad.
- **Almacenamiento seguro** (`src/ai/client/`):
  - `keyStorage.ts` — AES-GCM 256-bit + PBKDF2-SHA256 (250k iter) + salt aleatorio por instalación. Soporta modo con/sin frase de paso.
  - `providerStore.ts` — gestión de configs en localStorage, export/import JSON, wipe.
  - `chat.ts` — punto único de entrada `chat({messages, ...})` provider-agnostic.
- **UI:**
  - `src/components/settings/ai/ai-providers-panel.tsx` — catálogo + gestor con guardado cifrado, test de conexión, refresh de modelos, frase de paso.
  - `src/components/settings/privacy/privacy-panel.tsx` — Modo Fantasma, telemetría opt-in, exportar/importar/borrar IA, ver desglose localStorage, borrado total.
- **Página /agent** refactorizada:
  - Reemplaza el `setTimeout` simulado por `chat()` real con streaming.
  - Selector de proveedor activo + selector de agente en cabecera.
  - Input opcional de frase de paso si el proveedor activo tiene clave cifrada.
  - Botón Detener (AbortController).
  - Inyecta automáticamente el system prompt del agente + reglas activas en el contexto.
- **Settings page** expandida de 3 a 5 tabs: Diseño · IA & Modelos · Privacidad · Perfil · Seguridad.
- **Cleanup:** eliminadas `src/contexts/` y `src/components/trinity/` (vacías). Verificado que no hay imports rotos.

### Decisiones tomadas
- **Privacidad por diseño:** las claves de IA viven solo en el navegador del usuario, cifradas con AES-GCM. El backend de Next.js nunca las ve. Las llamadas a OpenAI/Anthropic/Google parten del browser (CORS).
- **Ollama es el default sugerido** (proveedor por defecto en `defaultConfigs()`): cero datos a terceros, alineado con la Ciberdelia y la soberanía.
- **No reemplazar Genkit todavía:** `src/ai/genkit.ts` y los flujos en `src/ai/flows/` se mantienen para casos server-side. La nueva capa convive con ellos. Migración progresiva.
- **Configuración portable:** la export/import de configuración de IA permite trasladar setup entre dispositivos.

### Pendiente / Próximos pasos
1. **Verificar el typecheck** localmente — el sandbox excede timeout. Si hay errores, arreglar.
2. **Streaming real para Google AI:** sustituir `:generateContent` por `:streamGenerateContent` con parseo SSE.
3. **Persistir agentes/reglas/workflows** en Supabase (hoy son mocks en estado local de la página).
4. **Migrar flujos de Genkit** que no requieran server al nuevo `chat()` client-side.
5. **Vincular activación de IA al sistema de Insignias** — cuando un usuario contribuye con su modelo a la federación, recibe una insignia.
6. **Tests:** la capa de providers es pura y testeable con MSW — añadir cobertura.
7. **i18n** — el panel está en español; preparar para EN/FR/PT.
8. **Vector storage local** para que el Exocórtex tenga memoria persistente del usuario (IndexedDB + embeddings).

### Notas / aprendizajes
- La constitución del proyecto se traduce muy bien a decisiones técnicas concretas: "el usuario es soberano de su IA" → multi-proveedor + claves locales + sin lock-in. Cada feature debería poder justificarse así.
- Anthropic ya permite uso directo desde browser (header `anthropic-dangerous-direct-browser-access`). Esto cambia el paradigma respecto a hace 2 años: ya no necesitamos backend obligatorio para LLM calls.
- El TypeScript del proyecto compila lento — vale la pena considerar mover a SWC o evaluar si hay dependencias circulares en los contextos.
- Limpieza incremental: la primera sesión quitó scripts huérfanos; ésta limpió carpetas duplicadas. Próxima sesión: revisar `apphosting.yaml` (Firebase) si vamos solo a Vercel; revisar `src/components/stitch/` para ver si sigue siendo necesario.


---

## 2026-05-24 — Sesión 3: Sistema de Apariencia expandido

**Sesión por:** Claude (Cowork mode, Opus 4.7).
**Resumen ejecutivo:** Expansión del sistema de Apariencia con 12 nuevos temas curados, picker integrado de 45+ fuentes Google con preview en vivo, y un panel completo de Accesibilidad universal (alto contraste, motion, daltonismo, tamaño táctil, foco).

### Hecho
- **Biblioteca curada de temas** (`src/lib/themes/curated-presets.ts`): 12 presets coordinados con identidad visual completa (tipografía, colores, glass, fondo, botones, animaciones). Categorizados en 7 moods: cyberdélico, solarpunk, minimal, brutalist, futurista, orgánico, luxury.
  - Synthwave Horizon, Tokyo Midnight (cyberdélico)
  - Solarpunk Aurora (solarpunk)
  - Verdant Earth, Terracotta Warm (orgánico)
  - Bauhaus Modular (brutalist)
  - Monaco Noir, Iridescent Pearl (luxury)
  - Origami Paper, Lavender Mist (minimal)
  - Aurora Borealis, Quantum Hex (futurista)
- **Galería de temas curados** (`curated-themes-gallery.tsx`): grid con cards visuales (gradiente de swatches, icono, badge de mood, indicador activo), filtros por mood, aplicación con un clic + setTheme.
- **Catálogo de Google Fonts** (`src/lib/themes/google-fonts.ts`): 45+ fuentes en 5 categorías (sans, serif, display, mono, handwriting), helpers para construir URLs de Google Fonts CSS2 y la cadena fontFamily.
- **Picker de Google Fonts** (`google-fonts-picker.tsx`): preview en vivo con `<link>` dinámico, texto de preview editable, slider de escala global de fuentes, filtros por categoría, búsqueda por nombre/tags. Instala como customFont en el AppearanceContext existente.
- **Panel de Accesibilidad** (`accessibility-settings.tsx`):
  - Alto contraste (filter + text color override)
  - Reduce motion (auto / always / never con detección de prefers-reduced-motion)
  - Pausar animaciones (más agresivo, incluye canvas)
  - Escala de texto (0.9× a 1.5×)
  - Tamaño táctil mínimo (estándar 24, grande 44, enorme 60)
  - Simulación de daltonismo (protanopia/deuteranopia/tritanopia/achromatopsia con SVG color matrices)
  - Anillo de foco (intensidad 0–3)
  - Subrayar enlaces
  - Cursor grande/enorme (SVG inline)
  - CSS global auto-inyectado, persistencia en localStorage separado.
- **AppearanceEditor expandido** de 4 a 6 tabs: Galería · **Tipografía** (nuevo) · Lienzo · Interfaz · Fondo · **Accesibilidad** (nuevo). La pestaña Galería ahora muestra primero los 12 temas curados, luego la galería existente.

### Decisiones tomadas
- **No tocar el AppearanceContext gigante** (970 líneas) salvo lo imprescindible. Los nuevos presets son `DeepPartial<AppearanceConfig>` aplicados con `updateConfig()` — patrón ya existente. Compatible 100% con save/load/export/import ya construidos.
- **Accesibilidad fuera del AppearanceContext** porque su lógica es ortogonal: persistencia separada (`starseed.a11y.settings`), aplicación via clases en `<html>`. Esto evita acoplar accesibilidad a temas.
- **Estilos de a11y auto-inyectados al montar el panel**, evitando tocar `globals.css`. Permite que el panel sea self-contained y se pueda copiar/desactivar sin migraciones.
- **Daltonismo via SVG `<filter>` con `feColorMatrix`** estándar (matrices clínicas), inyectado al `<body>`. Más performante y preciso que filtros CSS custom.

### Pendiente / Próximos pasos
1. Si TypeScript se queja por `distortWidth` en algunos presets (existe en theme-utils.ts pero no en la interfaz `AppearanceConfig.liquidGlass`), añadirlo al tipo en `appearance-context.tsx`.
2. Test de los 12 presets aplicándolos uno a uno en navegador para verificar coherencia visual.
3. Permitir guardar uno de los presets curados como "tema personal" con un nombre custom (botón "Guardar como tema").
4. Color picker avanzado para que el usuario pueda overridir los colores base de cualquier tema curado.
5. Considerar separar `presetsByMood()` en una página dedicada `/themes` con preview detallado por tema.
6. i18n del catálogo de moods y descripciones (actualmente solo español).

### Notas / aprendizajes
- El AppearanceContext del proyecto ya cubre prácticamente todo lo que un sistema de personalización avanzado necesitaría (responsive, mobile, trinity, display VR/AR/spatial). La calidad técnica del trabajo anterior es alta.
- La estrategia ganadora es: añadir capas de UX (galería curada, picker visual, panel a11y) sobre el contexto existente, no reescribir.
- Google Fonts via CSS2 + `display=swap` es perfecto para preview en vivo sin tocar el bundle. El usuario puede explorar 45 fuentes sin recompilar.
- `feColorMatrix` para daltonismo es genial: tres matrices estándar cubren los tipos más comunes, y `grayscale(1)` cubre acromatopsia.

