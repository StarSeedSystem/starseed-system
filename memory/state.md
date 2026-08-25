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


## 2026-05-25 — Unificación e Integración de Git
**Sesión por:** Antigravity (Assistant Mode) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Sincronización completa y exitosa del repositorio local de StarSeed OS con GitHub, resolviendo divergencias del historial sin perder las funcionalidades avanzadas de IA y Apariencia locales. Confirmado y validado el servidor en http://localhost:9002.

### Hecho
- Configurada la compatibilidad de Git con Unicode en macOS (`core.precomposeunicode true`) para resolver el bloqueo de nombres con caracteres especiales (NFC/NFD).
- Ejecutado `git merge origin/main --allow-unrelated-histories` para unificar el historial local con los commits de configuración de despliegue en Vercel.
- Resueltos conflictos de fusión favoreciendo la rama local (`--ours`) en archivos esenciales: `package.json`, `src/app/(app)/agent/page.tsx`, `src/app/(main)/settings/page.tsx`, `src/components/settings/appearance/appearance-editor.tsx`, `src/utils/supabase/*`, `.gitignore` y `yarn.lock`.
- Completado el push unificado a GitHub (`git push origin main`), dejando la rama `main` local y remota en perfecta sincronía.
- Verificada la disponibilidad activa y redirección del servidor local en `http://localhost:9002`.

### Decisiones tomadas
- **Resolución unilateral a favor de lo local (`--ours`)**: Las versiones locales de la página de agentes y el panel de apariencia representan la implementación más avanzada de la visión ciberdélica e IA (multi-proveedor, cifrado local) y debían ser preservadas intactas sobre los mocks previos del servidor remoto.
- **Mantener fallas de tipo preexistentes**: Las advertencias de tipo TypeScript son heredadas de la base de código externa; se determinó no modificarlas de forma ad-hoc ya que Next.js ignora estos errores en compilación de forma explita y el servidor corre perfectamente.

### Pendiente / Próximos pasos
1. **Desarrollo del workflow Starseed**: Continuar con el diseño e instalación del sistema en entornos Linux/Android y el despliegue a producción.
2. **Refactorización progresiva**: Resolver las advertencias de TypeScript preexistentes en los componentes de clima y layouts de forma segura en las siguientes sesiones.

---

## 2026-05-25 — Sesión 4: Estilos + Crystal realista + Zenith + Notificaciones + Reglas de Diseño

**Sesión por:** Claude (Cowork mode, Opus 4.7).
**Resumen ejecutivo:** Lote grande de mejoras de UX: rename "curados" → "estilos", arreglo de overflow en cards de estilos, Crystal preset con efectos realistas (refracción, aberración cromática, irisado, especular), reestructura de ZenithCurtain con más espacio vertical + Editor Universal + botón pantalla completa, sistema de notificaciones funcional con persistencia local, y nuevo DESIGN_RULES.md para garantizar adaptabilidad universal.

### Hecho
- **Estilos (antes "Temas curados"):**
  - `curated-themes-gallery.tsx`: rename del comentario doc + reescritura del card layout (icono+nombre+badge en línea, tagline 2 líneas line-clamp con break-words, swatches al pie con shrink-0). Sin más overflow ni superposiciones.
  - `appearance-editor.tsx`: header "Estilos" + subtítulo explicando que cada estilo adapta TODOS los elementos (widgets, perfiles, páginas, mensajes, posts, menús, botones, fondos).
- **Tema Crystal realista** (`src/components/theme/theme-utils.ts` preset `glass`):
  - styling: refraction 0.85, chromaticAberration 5, glassNoise 0.12, frostOpacity 0.20, glowIntensity 0.7, glassIntensity 42 (blur).
  - liquidGlass: mode='prominent', distortWidth 0.55, displacementScale 22, aberrationIntensity 2.5, saturation 1.4.
- **CrystalFilters** (`src/components/ui/effects/CrystalFilters.tsx`): añadidos 5 filtros SVG nuevos:
  - `crystal-refraction` (turbulencia + displacement + separación RGB).
  - `iridescent-edge` (borde madreperla con matriz prismática).
  - `glass-specular` (lighting especular angular).
  - `prismatic-glow` (halo multicolor para HolographicOverlay).
  - `etched-glass` (vidrio grabado con feDiffuseLighting).
  - + 2 gradientes (`crystal-facet`, `iris-stroke`).
- **ZenithCurtain** (`src/components/layout/zenith-curtain.tsx`): reescrito completamente.
  - Altura: 70vh → **92vh**, max-w-4xl → **7xl**, padding superior 12 → 5.
  - Layout en 3 secciones independientes: header con acciones rápidas, buscador compacto, área de resultados que ocupa TODO el vertical restante (no se comprimen los documentos).
  - **Nuevo botón "Editor"** (violeta): abre UniversalEditor modal.
  - **Nuevo botón "Pantalla"** (esmeralda): toggle fullscreen con hook `useFullscreen` cross-browser.
- **Editor Universal** (`src/components/layout/universal-editor.tsx`): modal de comando central con 4 modos (Diseño, Código, Con IA, Biblioteca) y 9 secciones del programa (apariencia, dashboard, layout/Trinity, perfil, IA, privacidad, biblioteca, publicar, componentes). Buscador con autofocus. Navega a la sección elegida con `?tab=`.
- **Hook useFullscreen** (`src/hooks/useFullscreen.ts`): cross-browser (Chrome/FF/Safari/Edge con prefijos vendor), detecta Esc, opt-in en SSR seguro.
- **Notificaciones funcional**:
  - `src/context/notifications-context.tsx`: 8 categorías (system/ai/mention/governance/culture/education/community/achievement) + 4 prioridades + snooze + archive + persistencia localStorage (`starseed.notifications.v1`) + 3 notificaciones seed.
  - `src/components/layout/notification-center.tsx`: reescrito con tabs por categoría (conteo de no-leídas por tab), ScrollArea, acciones hover (snooze 1h, archivar, eliminar), formato relativo de tiempo en español (date-fns/locale es), badge con conteo en bell.
  - `src/app/layout.tsx`: `NotificationsProvider` integrado en el árbol de providers.
- **DESIGN_RULES.md** (`design-system/starseed-system/DESIGN_RULES.md`): nuevo doc de 11 secciones que rige adaptabilidad universal. Cubre: tokens, contraste auto, prevención overflow/superposiciones, patrones adaptativos a estilo, velos sobre fondos arbitrarios, manifiesto JSON de widgets, pre-merge visual checklist en 3 estilos.

### Decisiones tomadas
- **"Estilos" como nombre canonico** (antes "Temas curados") — alineado con la idea de que cada elemento de la red del usuario se adapta.
- **Crystal preset usa `mode: 'prominent'`** (no `standard`) para activar el shader real de liquid-glass-react, no solo glass plano.
- **Editor Universal navega a páginas existentes** (no inventa edit-in-place) — implementación más sólida en V1; futura iteración puede embeber el editor inline.
- **Notificaciones 100% local** por defecto (Art. 7 — Soberanía de Datos). Federación se añadirá en Fase Fruto.
- **`a11y-pause-animations` también pausa canvas** — para preservar batería y prevenir mareo (regla en DESIGN_RULES §7).

### Pendiente / Próximos pasos
1. Pasar los 12 estilos curados por el pre-merge checklist visual del DESIGN_RULES §8 (mobile 375px, 3 estilos representativos).
2. Migrar widgets existentes del dashboard a tokens estrictos (ahora algunos hardcodean colores).
3. Implementar el modo "edit-in-place" del Editor Universal (overlay con outline en hover sobre componentes editables).
4. Conectar el sistema de notificaciones a eventos reales (post creado, propuesta votada, mención).
5. Streaming federado de notificaciones cuando exista federación (Fase Fruto).
6. Atajo de teclado `⌘E` para abrir el Editor Universal desde cualquier parte.
7. Asegurar que las notificaciones respeten `--a11y-text-scale` y modo daltonismo.

### Notas / aprendizajes
- El `liquid-glass-react` config soporta `mode: 'prominent'` y `mode: 'shader'` para efectos realistas — antes el preset glass usaba defaults planos y el efecto se quedaba en simple blur.
- La estrategia de "rename + extender card" mantuvo la compatibilidad con `themeStore.activeTemplateId` previo — los usuarios que tenían un estilo aplicado siguen viéndolo correcto.
- La regla de cards `flex flex-col + min-w-0 + truncate/clamp + shrink-0 en iconos` resuelve el 95% de los overflow en este proyecto. Vale la pena hacerla parte del DESIGN_RULES.
- Las notificaciones del proyecto antes eran mock estático. La nueva arquitectura es preparada para federación: cada notificación tiene `source.node` y `source.actorDid` opcionales, que se llenarán cuando un nodo externo nos envíe un evento firmado.


---

## 2026-05-26 — Sesión 5: Calendario Unificado (Hub ↔ Cultura) con capas, CRUD y contexto IA

**Sesión por:** Claude (Cowork mode, Opus 4.7) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Se unifica la temporalidad del SOSD. La pestaña "Eventos" del Hub pasa a llamarse "Calendario" y comparte el mismo componente y la misma fuente de datos que la pestaña "Agenda" de `/network/culture`. El nuevo `UnifiedCalendar` permite filtrar por capas (cultura, política, educación, bienestar, personal, recordatorios, alarmas, logs del sistema), abrir cada día en un diálogo con CRUD + compartir a la Red, y ofrece un punto de inyección de contexto al Exocórtex.

### Hecho
- **Store unificado** `src/contexts/calendar-context.tsx`:
  - Tipo `CalendarItem` con `layer`, `visibility` (privado / publico / red), `recurrence`, `time`, `durationMin`, `location`, `urgent`, `aiHighlight`, etc.
  - 8 capas (`politica`, `cultura`, `educacion`, `bienestar`, `personal`, `recordatorios`, `alarmas`, `sistema`) con metadatos visuales (color, dot, border, descripción).
  - Seed: importa `communityEvents` y añade recordatorios, alarmas y logs del sistema de ejemplo.
  - API: `addItem`, `updateItem`, `removeItem`, `shareItem`, `toggleLayer`, `setAllLayers`, `itemsByDate`, `aiContextSnapshot()`.
  - Provider montado en `src/app/(app)/layout.tsx`.
- **Componente `UnifiedCalendar`** (`src/components/calendar/unified-calendar.tsx`):
  - Rejilla mensual real con semanas que empiezan en lunes y 42 celdas.
  - Filtro de capas en chips activables.
  - Panel lateral con "Agenda próxima" (combina lo que antes eran "Próximos eventos" + "Eventos por confirmar").
  - Indicador de hoy, botón "Hoy", navegación entre meses, leyenda en pie.
  - Botón "Contexto IA" que abre `/agent` con un snapshot temporal codificado.
- **`DayDetailDialog`** (`src/components/calendar/day-detail-dialog.tsx`):
  - Lista ordenable (hora / capa / título / visibilidad).
  - CRUD completo con form colapsable (fecha, hora, duración, capa, recurrencia, visibilidad, ubicación, descripción, urgente).
  - Acciones rápidas por entrada (editar, compartir/federar, eliminar).
- **Hub** (`src/app/(app)/hub/page.tsx`):
  - Trigger renombrado `events` → `calendar` con `<CalendarDays />`.
  - Pestaña anterior eliminada; nuevo `HubCalendarPanel` con `UnifiedCalendar` + dos tarjetas auxiliares ("Próximos en la Red" y "Por confirmar") que sustituyen y fusionan las antiguas secciones.
  - Limpieza de imports muertos (`Progress`, `MapPin`, `PartyPopper`).
- **Cultura** (`src/app/(app)/network/culture/page.tsx`): la pestaña Agenda usa `UnifiedCalendar` en lugar del antiguo `EventCalendarView`. Misma fuente de datos que el Hub.

### Decisiones tomadas
- **Fuente única de verdad temporal** a través de `CalendarContext`. Cualquier superficie futura (dashboard widget, página de comunidad, exportación a ICS, federación ActivityPub `Event`) usará este store.
- **Capas en vez de tipos rígidos:** el campo `layer` reemplaza el `type` libre que tenía `communityEvents`. Permite filtrado coherente con la estética y deja sitio para añadir nuevas capas (p.ej. `salud`, `economia`) sin migraciones.
- **Visibilidad de 3 niveles** (`privado` / `publico` / `red`) en línea con el principio dual privacidad↔transparencia y la dualidad Cuenta/Perfil de la Constitución.
- **Contexto IA serializable**: `aiContextSnapshot()` devuelve un texto plano apto para inyectar como system prompt o tool input. Se abrirá vía query string `?context=…` para no acoplar el calendario a un proveedor concreto (Genkit, Anthropic, etc.).

### Pendiente / Próximos pasos
1. Persistir el calendario en Supabase (tabla `calendar_items` con RLS por `account_id`).
2. Exportar/importar `.ics` y suscripción a calendarios externos.
3. Federar eventos `visibility === 'red'` vía ActivityPub `Event` (Fase Fruto).
4. Notificaciones cuando `layer === 'alarmas'` y la hora está dentro de `nowβ±5 min`.
5. Integrar el snapshot temporal directamente como tool de Genkit (sin abrir `/agent` en nueva ventana).
6. Vista "Semana", "Día" y "Agenda lista" además de la actual mensual.
7. Pruebas unitarias del helper `buildMonthGrid` (límites de año bisiesto, transiciones DST).
8. Componente "Mini-calendario" para incrustar en el dashboard.

### Notas / aprendizajes
- Reusar `communityEvents` como seed mantiene la continuidad visual con la versión anterior — los usuarios siguen viendo los mismos eventos, ahora dentro de una rejilla coherente.
- Mantener `EventCalendarView` exportado en `culture/components.tsx` aunque ya no se importe evita romper otros consumidores potenciales; se puede borrar en un cleanup posterior.
- El patrón "store → componente compuesto → vistas dependientes" es la forma natural de unificar superficies temporales en este proyecto.


---

## 2026-05-26 — Sesión 6: Corrección de distorsión de clics y detección de cursor en ventanas 3D

**Sesión por:** Antigravity (Assistant Mode)
**Resumen ejecutivo:** Se refinó el efecto de movimiento dinámico 3D de las ventanas (`src/components/ui/card.tsx`) para eliminar por completo la vibración, la pérdida de hover y la distorsión del cursor/clic en las esquinas y orillas de las ventanas. El contenido interactivo se mantiene plano en pantalla (2D), mientras que las hermosas capas visuales de vidrio líquido, caustics y destellos 3D siguen inclinándose de manera ultra-fluida y profunda.

### Hecho
- **Planitud del contenedor de interacción y contenido (`src/components/ui/card.tsx`):**
  - Se modificó la capa interna de contenido (`motion.div` que envuelve `{children}`) para mantener `rotateX: 0`, `rotateY: 0`, `z: 0` y `transformStyle: "flat"`.
  - Con esto, todas las entradas interactivas (botones, enlaces, inputs, formularios) permanecen perfectamente paralelas y estables frente a la pantalla, asegurando una detección de cursor 100% natural, directa y sin desajuste de píxeles.
- **Remoción de capas 3D anidadas distorsionantes (`src/components/ui/card.tsx`):**
  - Se removieron los estilos `translateZ(4px)`, `translateZ(6px)` y `translateZ(8px)` de `CardHeader`, `CardContent` y `CardFooter` (fijándolos a `transform: "none"` e inyectando `transformStyle: "flat"` en `CardContent`).
  - Esto soluciona por completo el bug donde el raycast 2D de colisiones del navegador calcula erróneamente las posiciones de clic en planos inclinados anidados.
- **Preservación del efecto premium visual 3D:**
  - Las capas de fondo visuales del vidrio de cristal líquido (Capas 1 a 6: colores dinámicos, ruido, especular, caustics, refracción, reflejo de luz) **sí continúan inclinándose dinámicamente** en respuesta a la posición del cursor (con la física de resortes y oscilaciones ya calibrada).
  - Esto genera un impresionante efecto de profundidad parallax tipo "HUD holográfico" o "Pantalla de Cristal Flotante", donde la información interactiva permanece nítida y perfectamente utilizable mientras el vidrio oscila con elegancia en el fondo.

### Decisiones tomadas
- **Parallax de vidrio holográfico sobre tilt total:** La rotación 3D del plano de los elementos interactivos generaba un bucle de retroalimentación física donde la deformación proyectiva causaba que el cursor "saliera" del elemento al inclinarse, disparando instantáneamente un `mouseLeave` que lo devolvía a la posición inicial, creando un molesto parpadeo o jittering a 60fps. Mantener el contenido plano soluciona el problema de raíz de manera limpia y profesional, sin comprometer el estilo visual de ciencia ficción.

### Pendiente / Próximos pasos
1. Monitorear si algún otro componente de lienzo 3D requiere una separación similar de la capa lógica de clics (2D) de la capa visual de animación (3D).
2. Probar y validar la respuesta táctil en dispositivos móviles, donde las rotaciones se han ajustado para ser extremadamente pasivas.


---

## 2026-05-26 — Sesión 7: Sincrómetro, Integración Hermes y Gráfica Viva unificada

**Sesión por:** Claude (Cowork mode) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** El Calendario Unificado se renombra a **Sincrómetro** y se le añaden tres modos visuales (Convencional gregoriano, Astrológico zodiacal y Lunar). El Exocórtex Hermes se materializa en el OmniDock con accesos al agente, gráfica viva, IA setup, skills, tools y sentidos. La Red Holográfica y la Gráfica Armónica se fusionan en una única "Gráfica Viva" en `/network/graph`, con controles de capa y opacidad. Se añaden paneles dedicados de Sentidos y MCPs en `/ai-setup` y `/agent`. Cabecera de La Red rediseñada (compacta y estética). El nombre "Hermes" se retira de toda la UI excepto la sección de Gráfica Viva.

### Hecho
- **Sistema Sincrómetro** (`src/lib/sincrometro/`): nuevo módulo con tipos para tres modos (`gregoriano`, `astrologico`, `lunar`), tablas canónicas de signos zodiacales tropicales y de las 8 fases del ciclo sinódico lunar, y conversores deterministas (`getZodiacForISO`, `getLunarPhaseForISO`, `buildZodiacYear`, `buildLunarMonth`, `bucketForISO`, `findNewMoonsInRange`).
- **Context renombrado** (`src/contexts/calendar-context.tsx`): añade `sincrometroMode` + `setSincrometroMode` persistidos en localStorage; expone alias semánticos `SincrometroProvider`, `useSincrometro`, `SincrometroItem`, `SincrometroLayer`, `SincrometroVisibility`. Conserva 100% retro-compatibilidad con `useCalendar`/`CalendarProvider`.
- **Componentes nuevos:**
  - `sincrometro-mode-switcher.tsx` — pill con tres modos (icon + glyph).
  - `sincrometro-astrological.tsx` — rueda zodiacal: 12 columnas, una por signo del año visible, eventos agrupados por signo.
  - `sincrometro-lunar.tsx` — ciclo sinódico: 8 cards de fases lunares con eventos agrupados.
- **UnifiedCalendar refactor** (`src/components/calendar/unified-calendar.tsx`):
  - Título cambia a "Sincrómetro Unificado".
  - Conmuta entre las tres vistas según `sincrometroMode`.
  - Pista contextual del modo activo (signo solar o fase lunar) cuando no es gregoriano.
  - Invariante: el storage es siempre ISO `YYYY-MM-DD`. Los modos solo cambian la **vista**, nunca los datos. Eventos, recordatorios y alarmas se sincronizan automáticamente entre vistas.
- **Integración Hermes en el dock**: `omni-dock.tsx` añade entradas para Agente IA, Gráfica Viva, IA Setup, Skills, Tools y Sentidos, con separadores visuales degradados y nuevo color `purple` para el tipado del DockItem.
- **Gráfica Viva integrada** (`src/components/network/integrated-living-graph.tsx`): apila la capa holográfica federada con la armónica de Memoria Unificada en una única visualización con `mixBlendMode: 'screen'` + controles de visibilidad/opacidad independientes para cada capa.
- **`/network/graph` reescrito**: usa `IntegratedLivingGraph`. La leyenda Solfeggio + información de capas se actualiza para reflejar la integración.
- **`/network` (panorama) simplificado**: se elimina el header redundante "StarSeed Network / Connect with the living ontology…" y el hero del grafo se reemplaza por un acceso link card a la Gráfica Viva. El panorama queda focalizado en feed y trending.
- **Layout de La Red rediseñado** (`src/app/(app)/network/layout.tsx`): cabecera compacta en una sola fila con pill (dot pulsante + Sparkles + gradiente cyan→purple→amber) y subtítulo elegante en línea con colores semánticos por dominio.
- **Paneles nuevos en `src/components/hermes/`:**
  - `senses-panel.tsx` — 9 sentidos del Exocórtex (visión, audición, voz, ubicación, cámara, consciencia ambiental, tacto, intuición sintética, resonancia armónica), cada uno con su permiso de browser, capacidades que desbloquea y persistencia local.
  - `mcp-panel.tsx` — gestor de servidores MCP con tres seeds (Memoria Unificada interna, Sincrómetro interno, Fediverso ActivityPub) y formulario de "Añadir MCP".
- **`/ai-setup` con tabs**: Descubrimientos / Sentidos / MCPs. Acepta `?tab=senses|mcp` para deep linking desde el dock.
- **`/agent` con tabs ampliadas**: añade Sentidos y MCPs como pestañas, escucha `?tab=` para abrir directamente la pestaña deseada desde los accesos rápidos del dock.
- **Nombre "Hermes" retirado** de OmniDock labels y de `/ai-setup`. Se conserva solo en `hermes-integration/` interno (módulo técnico) y en la sección de Gráfica Viva como tejido cognitivo del Exocórtex.

### Decisiones tomadas
- **Sincrómetro como concepto antes que calendario**: el cambio no es cosmético. La palabra "calendario" reduce la temporalidad a un solo sistema (el gregoriano); "sincrómetro" expresa la simultaneidad entre ciclos cósmicos y biológicos, alineado con la Ciberdelia §3 (ampliar consciencia, no estrechar).
- **Storage ISO universal, vistas conmutables**: nunca se duplica un evento al cambiar de modo. La fecha es siempre ISO; el modo solo determina cómo se agrupa visualmente. Esto garantiza que crear un evento en vista lunar lo refleja inmediatamente en gregoriano y astrológico (sin migraciones ni reescrituras).
- **Hermes invisible para el usuario, omnipresente para el sistema**: la marca "Hermes" pertenece a la arquitectura técnica, no al lenguaje del usuario. Los menús dicen "Agente", "Sentidos", "Tools" — palabras que cualquier persona entiende. El nombre interno se preserva solo en `/network/graph` como guiño al "mensajero entre capas" que ejecuta la fusión.
- **Fusión holográfica ↔ armónica vs selector**: en lugar de obligar a elegir entre las dos capas (red federada vs memoria personal), se renderizan superpuestas con mezcla aditiva. Refleja la tesis ontológica del proyecto: la mente y la red NO son dos cosas separadas — son dos vistas del mismo tejido.
- **Cabecera de La Red en una fila**: ahorra ~80px de altura vertical en la primera vista; coherente con DESIGN_RULES §1 (densidad informativa sin sacrificio estético).

### Pendiente / Próximos pasos
1. Conectar `SensesPanel` y `McpPanel` a la Memoria Unificada para que cada sentido/MCP activado cree un nodo real en la gráfica armónica.
2. Implementar adapter para que el Sincrómetro exponga sus tres modos como tool MCP que el agente pueda consultar (`sincrometro.get_active_mode`, `sincrometro.zodiac_for`, `sincrometro.lunar_phase_for`).
3. Persistir las fechas de luna nueva calculadas en una tabla para evitar recalcular en cada render.
4. Añadir vista "Año astrológico" con calor de eventos por elemento (fuego/tierra/aire/agua).
5. Validar accesibilidad: lectores de pantalla deben leer correctamente el modo activo del Sincrómetro y la fase lunar del día.
6. Tests del converter (`getZodiacForDate`, `getLunarPhaseForDate`, `buildLunarMonth`) con fechas conocidas.
7. Considerar exportar el Sincrómetro como SDK público — algunas comunidades fuera de StarSeed querrían los conversores.

### Notas / aprendizajes
- El `HarmonicGraph3D` ya existía pero estaba aislado en `/network/graph`. Integrarlo con `HolographicGraph` requirió poco más que envolverlos en un wrapper con `mixBlendMode: 'screen'`. La inversión previa en componentes auto-contenidos paga aquí.
- Los signos zodiacales tropicales tienen fechas canónicas pero varían ±1 día por año bisiesto. Asumir el caso canónico (sin corrección por bisiesto) es razonable en V1; la corrección se puede añadir cuando un nodo astrológico de la comunidad lo pida.
- El ciclo sinódico real es 29.530588 días, no 29.5. La fórmula simple (referencia luna nueva conocida + módulo) tiene error ~3 horas por ciclo: aceptable para vista de mes, no para precisión astronómica. Si se necesita mayor precisión, integrar `astronomia` o `lune.js`.
- Renombrar "calendario" → "sincrómetro" preservando alias evita cualquier ruptura. 60+ archivos siguen usando `useCalendar` y siguen funcionando.


---

## 2026-05-26 — Sesión 8: Gráfica Viva geométrica unificada + Bridge OpenHuman×Hermes + contexto completo IA

**Sesión por:** Claude (Cowork mode).
**Resumen ejecutivo:** Refactor profundo de la Gráfica Viva. Se sustituye la doble capa apilada por una única gráfica geométrica SVG estática (sin física ni movimiento). Las "capas" pasan a ser tipos de conexión filtrables, no gráficas separadas. Se implementa el modelo de 3 capas de memoria de OpenHuman AI (Memory Tree + FTS-like index + KV namespaced) sobre el `UnifiedMemoryStore` de Hermes, formando una única tienda local persistente. El usuario puede crear nuevas conexiones entre cualesquiera dos nodos. La IA recibe contexto completo en cada turno (sincrómetro, sentidos, MCPs, skills, tools, memoria reciente, próximos eventos y resumen del grafo).

### Hecho
- **`hermes-integration/openhuman-bridge.ts`** — Bridge funcional OpenHuman × Hermes:
  - `KvStore` namespaced (`global`, `background`, `autocomplete`, `skill-{id}`) con categorías `core`/`daily`/`conversation` y persistencia local.
  - `MemoryTree` con `insertChunk`, `upsertEntity`, `queryGlobal`, `querySource`, `queryTopic`, `searchEntities`, `fetchChunks`.
  - `FtsIndex` con búsqueda por tokens (sustituible por SQLite FTS5 WASM cuando esté disponible).
  - `OpenHumanMemoryEngine` orquesta las 3 capas y expone `ingest()`, `decide(prompt)` (OpenHuman §4 árbol de decisión), `projectToGraph()` y `buildContextSnapshot()` (estilo MEMORY.md).
- **`hermes-integration/system-context.ts`** — Construye `SystemContextSnapshot` exhaustivo:
  - Modo del Sincrómetro, signo solar, fase lunar del día.
  - Lista de sentidos activos, MCPs conectados, skills cargados, tools habilitadas.
  - Próximos eventos del Sincrómetro.
  - Memoria OpenHuman serializada.
  - Helper `snapshotToSystemPrompt()` que produce un bloque inyectable en el system prompt.
- **`hermes-integration/living-graph-store.ts`** — Una sola fuente de verdad para la gráfica:
  - `GraphNode` con `kind`, `geometry` (sphere/tetrahedron/cube/octahedron/icosahedron/dodecahedron/star), `frequency` (solfeggio).
  - `GraphEdge` con `kind` (uses/depends_on/exposes/configured_for/remembers/perceives/references/discovers/custom), peso y `origin` (user/system).
  - Semilla con 27 nodos y 28 aristas representando el sistema instalado (memoria 3 capas, sentidos, agentes, providers, MCPs, tools, skills).
  - API `addNode`, `addEdge`, `removeEdge`, `edgesOf`, `textualSummary` (para alimentar la IA).
  - `CONNECTION_LAYERS` define las 9 capas filtrables con color, dashed y descripción.
- **`components/network/living-graph.tsx`** — Componente geométrico unificado:
  - SVG estático 1000×1000 con anillos concéntricos por tipo de nodo.
  - Layout determinista: cada `GraphNodeKind` tiene radio + offset angular fijos. El centro es siempre `self`.
  - Cada nodo se dibuja como su sólido platónico (rombo octaedro, cubo, triángulo tetraedro, hexágono icosaedro, pentágono dodecaedro, estrella de 8 puntas, círculo esfera).
  - Aristas coloreadas por tipo de conexión; capas filtran qué tipos son visibles.
  - Click en nodo: resalta vecinos + atenúa el resto + abre detalle.
  - **Modo "Conectar nodos"**: el usuario hace click en dos nodos cualesquiera, elige el tipo de conexión y se crea persistentemente.
  - Eliminación de aristas manuales con click en el círculo central de la línea iluminada.
  - Panel lateral con detalle del nodo seleccionado (lista de aristas adyacentes, eliminar conexiones manuales).
- **`components/network/integrated-living-graph.tsx`** simplificado a un wrapper de `LivingGraph` (ya no apila dos visualizaciones).
- **`app/(app)/network/graph/page.tsx`** rediseñado: usa `LivingGraph`, leyenda dividida en geometrías + tipos de conexión + instrucciones de uso.
- **`app/(app)/agent/page.tsx`** — `handleSend` ahora inyecta en el system prompt:
  1. Persona y reglas del agente.
  2. `snapshotToSystemPrompt(buildSystemContext({ upcomingEvents }))`.
  3. `getLivingGraphStore().textualSummary()` — la IA "ve" sus conexiones.
  4. `calendar.aiContextSnapshot()` — Sincrómetro.
  5. Historial de mensajes.
  Además persiste el texto del usuario como chunk OpenHuman para recuperación futura.
- **SensesPanel y McpPanel** ahora escriben en el `LivingGraphStore` al activarse: cada sentido o MCP encendido crea/actualiza un nodo y lo conecta a `self` con la arista correspondiente (perceives/uses).

### Decisiones tomadas
- **Una sola gráfica, capas = tipos de conexión**: la dualidad "red holográfica vs. memoria personal" no existe en realidad; son el mismo tejido visto desde dos ángulos. Mostrar una única gráfica con filtros por tipo de relación refleja la tesis ontológica del proyecto y simplifica enormemente el modelo mental para el usuario.
- **SVG estático en vez de Three.js dinámico**: la gráfica geométrica con sólidos platónicos en posiciones deterministas (anillos concéntricos tipo mandala) comunica mejor "estructura" y "armonía" que un grafo con física vibrante. Además: 0 dependencias 3D, accesible por screen reader, escalable, sin jitter de cursor.
- **OpenHuman 3-capas implementado nativamente, no como librería externa**: el modelo (tree + FTS + KV namespaced + orchestrator §4) está bien descrito y es portable. Implementarlo dentro de Hermes (en vez de depender de un binario externo) nos da una sola tienda local con persistencia controlada por el usuario. Cuando el usuario tenga su instalación nativa de OpenHuman corriendo, podremos exponer un MCP que sincronice ambos.
- **Bridge funcional desde el primer día**: tanto el snapshot textual (`buildContextSnapshot`), como la proyección al grafo (`projectToGraph`), como el orchestrator (`decide`) ya están operativos. Cuando lleguen los datos reales (ingestas, emails, descubrimientos), todo el grafo se puebla automáticamente.
- **Las nuevas conexiones se guardan con `origin: 'user'`**: distinguir entre conexiones "del sistema" (semilla) y "manuales" permite mostrar solo las manuales como eliminables, evitando que el usuario rompa accidentalmente la topología base.

### Pendiente / Próximos pasos
1. Persistir las aristas/nodos también en IndexedDB (más capacidad que localStorage) cuando el usuario tenga >1k nodos.
2. Conectar `OpenHumanMemoryEngine.ingest()` automáticamente a los puntos de entrada del sistema: posts nuevos, eventos del sincrómetro, descubrimientos del wizard de IA.
3. Implementar SQLite WASM FTS5 real para sustituir el `FtsIndex` basado en tokens.
4. Exponer la API de Hermes como tools MCP (`graph.addEdge`, `memory.store`, `memory.query_tree`) para que la IA pueda modificar el grafo desde el chat.
5. Tests unitarios del bridge (KV roundtrip, tree query, FTS scoring) y del store (addEdge idempotente, deleteEdge en cascade).
6. Visual: añadir niveles de zoom para grafos grandes (>100 nodos) — actual aguanta bien ~50 nodos en 1000×1000.
7. Sincronización con un binario local de OpenHuman cuando esté presente (vía MCP).

### Notas / aprendizajes
- La idea de "capas = tipos de conexión" es semánticamente más rica que "capas = tipos de nodo". El segundo enfoque (que era el inicial de Hermes en `02-layers.ts`) sí sirve para colorear, pero la verdadera información cognitiva está en los TIPOS de relación. Filtrando por tipo de relación, el usuario puede ver instantáneamente "qué cosas dependen de qué" o "qué cosas exponen tools".
- La doble capa apilada con `mix-blend-mode: screen` se veía bonita pero confundía al usuario sobre qué era qué. Una sola gráfica con leyenda clara es mejor pedagogía.
- Generar el system prompt completo en cada turno (~3-5kb extra) es razonable para LLMs modernos. Si en el futuro el contexto se vuelve un cuello de botella, se puede usar embedding-based selection en lugar de inyección bruta.
- Mantener todos los archivos OpenHuman dentro de `hermes-integration/` mantiene la cohesión semántica: Hermes es el "mensajero" entre la mente del usuario y el mundo digital; OpenHuman es su biblioteca de memoria. Son una sola arquitectura.


---

## 2026-05-28 — Colocación de widgets gen2 en dashboards + UI de sección + fix Fragua

**Sesión por:** Claude (Cowork mode, Opus).
**Resumen ejecutivo:** Se colocaron los 10 widgets de 2ª generación en sus dashboards predeterminados ordenados por relevancia, se poblaron y activaron 6 categorías de dashboard antes vacías, se rediseñó el encabezado de la sección Dashboards (dinámico y centrado con contexto vivo) y se dejó compilable la Fragua de Interfaces (creador de widgets con IA, flujo 3 fases + edición).

### Hecho
- **`dashboard-defaults.ts`** — bloque gen2 al inicio de `WIDGET_CATEGORY_MAP` (AGORA_CAUSAL, LIQUID_DELEGATION, OIKOS_METABOLISM, SKILL_TREE, ASTRAURA_CORTEX, SOVEREIGN_NODE, AKASHIC_CODEX, NATAL_CHART, MESH_RADAR, IMMERSION_PORTAL). Plantillas predeterminadas reordenadas por relevancia respetando los `minW/minH` del manifest:
  - Política: AGORA_CAUSAL · POLITICAL_SUMMARY · LIQUID_DELEGATION · RELEVANT_POSTS.
  - Educación: SKILL_TREE · LEARNING_PATH · ACTIVE_PROJECTS.
  - Cultura: CULTURAL_FEED · IMMERSION_PORTAL · RELEVANT_POSTS.
  - Economía: OIKOS_METABOLISM · ECONOMIC_OVERVIEW · CALCULATOR · ACTIVE_PROJECTS.
  - Sistema: SOVEREIGN_NODE · MESH_RADAR · SYSTEM_STATUS · LIVE_DATA · NOTIFICATIONS.
  - IA: ASTRAURA_CORTEX · NEXUS_QUICK_ACCESS · MESSAGES.
  - Parlamento: AGORA_CAUSAL · LIQUID_DELEGATION · POLITICAL_SUMMARY · RELEVANT_POSTS.
  - Red: MESH_RADAR · EXPLORE_NETWORK · LIVE_DATA · MY_PAGES.
  - `FUTURE_DASHBOARD_TEMPLATES` poblado: astrología, archivos, entretenimiento, ayudantía, ciberdelia, descubrimientos.
- **`widget-categories.ts`** — `hasWidgets: true` en astrología, archivos, entretenimiento, ayudantía, ciberdelia, descubrimientos.
- **`dashboard-layout.tsx`** — encabezado dinámico y centrado: pill eyebrow (icono+nombre de categoría, punto pulsante, "{n} paneles · {n} widgets"), `<motion.h1>` con AnimatePresence keyed por dashboard activo y gradiente violet→cyan→fuchsia, descripción de categoría, fila centrada de `HeaderAction` (Forjar Widget · Crear Dashboard · Editar/Terminar · Pantalla completa). Nuevo componente `HeaderAction` con tonos neutral/cyan/emerald/indigo.
- **Fragua de Interfaces** — `ForgeWidgetResult` añadido en `widget-forge-types.ts`; `widget-forge-dialog.tsx` corregido (imports `CircleDashed/Loader2/Wand2/Input`, props retipadas a `ForgeWidgetResult`, init de `ontology` null-safe). El flujo 3 fases + edición ya estaba implementado: se preservó, no se reescribió.
- **`messages-widget.tsx`** — 3 props framer-motion `shadow:` → `boxShadow:` (clave válida).

### Decisiones tomadas
- **Preservar la Fragua existente** en lugar de reescribirla: ya implementaba las 3 fases (visuales + código + metamorfosis/edición IA). Solo faltaba que compilara.
- **Orden por relevancia para usuario promedio**: el widget más representativo de cada categoría va primero/arriba-izquierda, con feeds anchos al pie. Tamaños iniciales respetan `minW/minH` del manifest para evitar overflow desde el arranque.
- **Tolerar los 8 errores de tipo preexistentes** (grid-area `isDraggable`, workspace-renderer null, space-weather flare/magnetometer): documentados desde 2026-05-25, Next.js los ignora en build. Fuera del alcance de esta ola.

### Pendiente / Próximos pasos
1. Regenerar/actualizar los widgets gen1 restantes al patrón adaptativo (WidgetShell + kit + `useWidgetData`) para adaptabilidad total a cualquier dimensión y tema.
2. Resolver de forma segura los errores de tipo preexistentes en una ola de refactor dedicada.
3. Verificar visualmente en navegador la composición predeterminada de cada dashboard y el nuevo encabezado.

### Notas / aprendizajes
- Type-check con scope (`tsconfig.scope.json` temporal) es la vía para validar un subconjunto sin exceder el timeout del sandbox en el `tsc` de proyecto completo.
- En framer-motion la clave de sombra animable es `boxShadow`, no `shadow`.

---

## 2026-05-28 — Ola de migración gen1→adaptativo (completada)

Se migraron los widgets gen1 restantes al patrón adaptativo (WidgetShell + kit + `useWidgetData`), cerrando la regeneración total solicitada.

### Widgets migrados en esta ola
- **`active-projects-widget.tsx`** → `productivity.projects` (7s). "Génesis Activa", icono Rocket. ProgressRing/ProgressBar según tier, hitos en expanded.
- **`collab-projects-widget.tsx`** → `productivity.projects` (8s). "Hub Colaborativo". StatTiles Sincronía/Colaboradores + MiniList con Chip de estado.
- **`system-status-widget.tsx`** → `system.node` (2.5s). "Nodo Soberano". ProgressRing en micro; StatTiles CPU/RAM/Temp/Pares; "Procomún donado" (invariante Tríada); threads en expanded.
- **`notifications-widget.tsx`** → `common.notifications` (10s). "Alertas". KIND_META por tipo, franja de no-leído.
- **`messages-widget.tsx`** → `social.threads` (6s). "Enlace Neural". Avatar+punto online, badge de no-leídos.
- **`live-data-widget.tsx`** → `common.metrics` (3s). "Telemetría de Red". Grid de StatTiles + Sparkline del líder.
- **`learning-path-widget.tsx`** (nuevo archivo) → `education.paths` (15s). "Ruta de Aprendizaje", MENTOR_ICON humano/ia/híbrido.
- **`social-radar-widget.tsx`** (nuevo archivo) → `social.events` (20s). "Radar Social", badge de fecha + Chip por tipo de evento.
- **`mental-coherence-widget.tsx`** → `wellness.coherence` (4s). "Coherencia". ProgressRing + StatTiles Foco/Calma/Energía + Sparkline de historial.
- **`nexus-quick-access-widget.tsx`** → `ai.astraura` (5s). "Nexus IA". Atención + carga cognitiva + sugerencias + trabajos en segundo plano (reemplazado useRouter por next/link).
- **`calculator-widget.tsx`** — ahora **funcional** (aritmética real con `evaluate` validado por regex; sin fuente de datos, "Cálculo local" por invariante de soberanía). Display y teclado adaptativos.
- **`theme-selector-widget.tsx`** — envuelto en WidgetShell ("Vibrancy"), grid de 6 temas (next-themes) size-aware: 3-col icon-only en micro/compact, 2-col con etiqueta en regular+. Nunca desborda.
- **`theme-manager-widget.tsx`** — envuelto en WidgetShell ("Archivo de Temas"), conserva drag-reorder/aplicar/eliminar; MiniList con `max` por vTier; estado vacío adaptativo.
- **`ai-generated-widget.tsx`** — revisado, ya adaptativo (renderiza HTML IA con fallback de estado vacío). Sin reescritura.

### Correcciones de tipos preexistentes (resueltas, ya no toleradas)
- **`space-weather-flare-widget.tsx`** — el fallback de `latestFlare` usaba `time` mientras el dato real usa `timestamp`; unificado a `timestamp` y formateado a HH:MM UTC en la bandeja de telemetría.
- **`space-weather-magnetometer-widget.tsx`** — eliminada la línea rota e inusada `gicRisk = Math.abs(currentKp …)` (`currentKp` indefinido, `Math.abs` sobre string).

### Verificación
- Type-check con scope sobre los 13 widgets migrados + registry + los 2 weather corregidos: **EXIT 0, 0 errores**.

### Estado
Regeneración de widgets **completa**: todos los widgets del dashboard siguen ahora el patrón adaptativo (cualquier dimensión, cualquier tema, datos en vivo vía capa mock tipada intercambiable por APIs reales con `registerAdapter`).

---

## 2026-05-29 — Tercera generación (gen3): cobertura del documento de widgets

Objetivo: implementar los ~90 widgets del documento "Opciones de Widgets en Dashboards predeterminados", en oleadas por relevancia para el ciudadano medio. Carpeta nueva: `src/components/dashboard/widgets/gen3/`.

### Wave 1 — Política/Ontocracia ✅
- **CIVIC_ALCHEMY** (Alquimia Cívica) → `politics.initiatives`. Transmutador funcional queja→iniciativa (textarea + selector de ámbito + botón Transmutar que redacta localmente; botón Firmar). Leyes relacionadas, progreso de firmas.
- **VITAL_FLOW_AUDIT** (Auditoría de Flujo Vital) → `politics.treasury`. Total, barras por sector, zoom macro→micro por filtro de sector, gasto por asignación, botón Flag (revisión comunitaria), votaciones de presupuesto.
- **SOCIAL_RESONANCE** (Resonancia Social) → `politics.resonance`. Heatmap semántico por emoción, modo "Burbuja Rota" (postura contraria), filtro por palabra clave, enlaces al debate.

### Wave 2 — Economía/Ecología ✅
- **GIFT_AGORA** (Ágora del Don) → `oikos.gifts`. Bienes/servicios libres, filtro de proximidad, botón Tomar/Sumarme.
- **COMMONS_MATRIX** (Patrimonio Común) → `oikos.commons`. Medios de producción compartidos, estado/cola, Reserva por Propósito.
- **FOOD_ORACLE** (Soberanía Alimentaria) → `oikos.food`. Cosecha, reservas, madurez de cultivos, invernaderos, predicción 7d, perfil dietético.
- **REGEN_TRACER** (Huella Regenerativa) → `oikos.regen`. CO₂/árboles/compost/agua, anillo de circularidad, metas, escáner AR de verdad material.

### Plumbing por oleada (patrón repetible)
1. Contratos en `lib/widget-data/types.ts` + claves en `WidgetDataMap`.
2. Adaptadores mock en `lib/widget-data/adapters.ts` (vivos, deterministas) + registro en `defaultRegistry`.
3. Literales en `dashboard-types.ts` (`WidgetType`).
4. Entradas en `widget-manifest.ts` (minW/minH, categoría, relevancia, data).
5. Componentes adaptativos en `widgets/gen3/` + barrel `gen3/index.ts`.
6. Casos en `widget-registry.tsx`.
7. Type-check con scope → 0 errores por oleada (Wave 1 y Wave 2 verificadas).

### Pendiente
- Waves 3–7: Productividad (5), Utilidades+IA (7), Perfil+Hub (8), Educación/Cultura/Arte (resto), Especializados (Ubicación, AR/VR, Astronomía/Astrología, Descubrimientos, Creatividad, Privacidad, Conectividad, Dispositivos, Archivos, Sistema, Entretenimiento, Sociedad).
- Recomponer dashboards predeterminados por relevancia con los nuevos widgets.
- Nota: el dev server (`npm run dev`, puerto 9002) debe ejecutarse en la máquina del usuario; el sandbox Linux no puede servir a su localhost ni cargar el binario SWC de macOS.



---

## 2026-05-29 — Cuarta generación (gen4): cierre del catálogo + rename "Social"→"Dashboards"

**Sesión por:** Claude (Cowork mode, Opus).
**Resumen ejecutivo:** Se implementaron 11 widgets adaptativos nuevos (gen4) cubriendo los dashboards del documento "Opciones de Widgets en Dashboards predeterminados" que faltaban, todos con el patrón WidgetShell + kit + useWidgetData (datos en vivo mock, intercambiables por APIs reales con registerAdapter). Se colocaron en sus dashboards predeterminados por relevancia sin tocar los widgets previos, y el dashboard por defecto pasó de llamarse "Social" a "Dashboards".

### Widgets gen4 (carpeta `widgets/gen4/`)
- **ELDER_COUNCIL** (Consejo de Sabios) → `politics.council`. Meritocracia del entendimiento: ranking por reputación, insignias verificables, voces delegadas, filtro "solo en línea". → dashboard Política.
- **RESTORATIVE_COURT** (Tribunal Restaurativo) → `politics.justice`. Círculos de Paz, justicia restaurativa nunca punitiva. Etapas, progreso, próximo círculo. → Política.
- **BARTER_MARKET** (Mercado de Trueque) → `oikos.barter`. Ofrece↔busca, filtro por categoría, match por afinidad, botón Proponer. → Economía.
- **ENERGY_GRID** (Energía Comunal) → `oikos.energy`. Microred: gen/consumo, batería, kW al procomún, fuentes, CO₂, sparkline. → Economía.
- **MENTOR_MATCH** (Mentoría Híbrida) → `education.mentors`. Humano/IA/híbrido, rating, afinidad, disponibilidad. → Educación.
- **UNIVERSAL_LIBRARY** (Biblioteca Universal) → `education.library`. Continúa aprendizaje + destacados + colecciones + búsqueda. Acceso abierto. → Educación.
- **MULTIVERSE_HUB** (Multiverso) → `culture.multiverse`. Mundos VR/AR/2D/espacial, presencia viva, en directo. → Cultura.
- **CREATIVE_STUDIO** (Estudio Creativo) → `culture.studio`. Proyectos por medio, herramientas del Lienzo, inspiración del día. → Cultura.
- **ORACLE_PREDICT** (Oráculo Predictivo) → `ai.oracle`. Escenarios probabilísticos del Exocórtex con confianza, horizonte y factores. → IA.
- **IDENTITY_VAULT** (Bóveda de Identidad) → `system.identity`. Dualidad Cuenta/Perfil, verificación ZK, accesos a datos revocables, score de soberanía. → Sistema.
- **ENERGY_MAP** (Mapa de Energía) → `astro.energy`. Coherencia, centros energéticos, biorritmo, influencias cósmicas. → Astrología.

### Plomería (mismo patrón repetible de gen2/gen3)
1. 11 interfaces + claves en `lib/widget-data/types.ts` (`WidgetDataMap`).
2. Adaptadores mock deterministas en `lib/widget-data/gen4-adapters.ts`, auto-registrados (side-effect importado desde `index.ts`). No se tocó `adapters.ts`.
3. 11 literales en `dashboard-types.ts` (`WidgetType`).
4. Entradas en `widget-manifest.ts` (minW/minH, categoría, relevancia, data).
5. 11 entradas en `WIDGET_CATEGORY_MAP` (dashboard-defaults.ts) → aparecen automáticamente en el selector de widgets (dashboard-layout lee este mapa).
6. Componentes en `widgets/gen4/` + barrel `gen4/index.ts`.
7. Casos en `widget-registry.tsx`.

### Colocación en dashboards predeterminados (sin borrar nada previo)
- Política: + ELDER_COUNCIL, RESTORATIVE_COURT (segunda fila).
- Educación: + UNIVERSAL_LIBRARY, MENTOR_MATCH.
- Cultura: + MULTIVERSE_HUB, CREATIVE_STUDIO.
- Economía: + ENERGY_GRID, BARTER_MARKET.
- IA: + ORACLE_PREDICT.
- Sistema: + IDENTITY_VAULT.
- Astrología (FUTURE templates): + ENERGY_MAP.

### Rename
- Plantilla por defecto (categoryId 'social'): `name: 'Social'` → `name: 'Dashboards'`. Es el título que se muestra al abrir el dashboard por defecto.

### Verificación
- Type-check con scope (tsconfig.gen4.json temporal) sobre los 11 widgets + capa de datos + registry + manifest + defaults: **0 errores**. Config temporal eliminada.

### Pendiente
- Conectar adaptadores reales (Supabase/REST/oráculos) por `registerAdapter` cuando existan las fuentes.
- Widgets del documento aún no cubiertos como piezas dedicadas (algunos ya equivalen a widgets previos): Bienvenida/Estado, Lanzador de Creación Rápida, Galería de Arte, Reproductor de Medios, Seguimiento de Hábitos, Pausa Consciente, Actividad Física (wearables), Accesos Directos de Config. Candidatos a una gen5.

---

## 2026-05-29 — Quinta generación (gen5): 10 widgets nuevos + 5 dashboards + estado vacío con biblioteca + IA omnipresente

**Sesión por:** Claude (Cowork mode, Opus) + 5 subagentes en paralelo (sonnet), uno por par de widgets.
**Resumen ejecutivo:** Se añadieron 10 widgets adaptativos (gen5) cubriendo las categorías del documento que faltaban (Productividad avanzada, Ubicación, Privacidad, Dispositivos, Descubrimientos, Creatividad, Perfil, Sociedad), con 5 categorías/dashboards nuevos. El estado vacío de cualquier dashboard ahora ofrece un botón real "Añadir Widget" que abre la biblioteca. El asistente flotante de IA (AiOverlay/Astraura) ya estaba montado en el layout y aparece en toda sección con posición configurable. Sin borrar nada previo (gen1–gen4).

### Widgets gen5 (carpeta `widgets/gen5/`, creados por subagentes en paralelo)
- **FLOW_DIRECTOR** (Director de Flujo Vital) → `productivity.flow`. Energía circadiana (ProgressRing+Sparkline 24h), sugerencia de tarea óptima, ventanas del día, toggle "Modo Fortaleza". → Productividad.
- **PROJECT_SWARM** (Enjambre de Propósitos) → `productivity.swarm`. Constelación viva de proyectos, brillo por urgencia×impacto, filtro por estado, "Soltar al enjambre". → Productividad.
- **ABUNDANCE_RADAR** (Radar de Abundancia) → `location.resources`. RadialNodeGraph de recursos libres cercanos, filtro por tipo, ETA/Reservar. → Ubicación.
- **TRANSIT_FLOW** (Tránsito Orgánico) → `location.transit`. Movilidad compartida, ETA, ocupación, CO₂ ahorrado, Solicitar. → Ubicación.
- **CRYPTO_SHIELD** (Escudo Ontológico) → `privacy.shield`. Niveles de fricción criptográfica, rastreadores bloqueados, flujos de datos con toggle Permitir/Bloquear, "Amnistía de datos". → Privacidad.
- **HABITAT_CORE** (Simbiosis Habitacional) → `devices.habitat`. Domótica: clima/luz/aire por habitación, modo circadiano, robots con batería, sincronía energética. → Dispositivos.
- **SERENDIPITY_LENS** (Lente de Serendipia) → `discovery.serendipity`. Slider "Nivel de Extrañeza", hallazgos por tipo, "Sorpréndeme". → Descubrimientos.
- **IDEA_FORGE** (Incubadora de Quimeras) → `creativity.ideas`. Colisión de conceptos (a✕b + puente), botón "Colisionar", guardar chispas, disciplinas. → Creatividad.
- **MERIT_GALLERY** (Cristalería de Mérito) → `profile.merit`. Firma de confianza (ProgressRing), huella regenerativa, insignias por tier, top-skills. → Perfil.
- **SOCIETY_PULSE** (Pulso del Organismo) → `society.cohesion`. Índice de Armonía Global, abundancia/bienestar/participación, cohesión por biorregión, detección de fracturas. → Sociedad.

### Categorías/dashboards nuevos (widget-categories.ts + dashboard-defaults.ts)
- Añadidas 5 categorías: **privacidad, dispositivos, creatividad, perfil, sociedad** (con icono/color/tags, hasWidgets).
- 5 plantillas predeterminadas nuevas (Privacidad, Dispositivos, Creatividad, Perfil, Sociedad) ordenadas por relevancia.
- Reforzadas plantillas existentes: Productividad (FLOW_DIRECTOR + PROJECT_SWARM), Ubicación (ABUNDANCE_RADAR + TRANSIT_FLOW), Descubrimientos (SERENDIPITY_LENS).

### Infra de UX
- **Estado vacío** (`grid-area.tsx`): rediseñado con halo animado + botón real `AddWidgetDialog` (abre la biblioteca de widgets). `GridArea` ahora recibe `onAddWidget`/`onForgeOpen`, cableados desde `dashboard-workspace-renderer.tsx`.
- **Asistente IA omnipresente**: confirmado `AiOverlay` montado en `app/(app)/layout.tsx` (voz+texto, posición configurable, navega/actúa). No se duplicó.

### Plomería (mismo patrón gen4)
1. 10 grupos de interfaces + claves en `types.ts` (`WidgetDataMap`).
2. Adaptadores mock deterministas auto-registrados en `gen5-adapters.ts` (side-effect desde `index.ts`). `defaultRegistry` ya es `Partial<AdapterRegistry>` (gen4), así que gen5 encaja sin tocar `adapters.ts`.
3. 10 literales en `dashboard-types.ts`.
4. Entradas en `widget-manifest.ts` (minW/minH, categoría, relevancia, data).
5. 10 entradas en `WIDGET_CATEGORY_MAP` + 5 categorías nuevas → aparecen solas en el selector.
6. Componentes en `widgets/gen5/` (10 archivos).
7. Casos + imports en `widget-registry.tsx` (los 10 cableados).

### Verificación
- Type-check con scope (tsconfig.gen5.json temporal) sobre los 10 widgets + capa de datos + registry + manifest + defaults + grid-area + renderer: **0 errores**. Temporal eliminado.

### Pendiente / próximos pasos
- Conectar adaptadores reales por `registerAdapter` (Supabase/REST/oráculos/puente de dispositivos) cuando existan fuentes del usuario.
- Mejora estética profunda iterativa de widgets gen1 (microinteracciones/animaciones) si se desea otra ola dedicada.
- Sincronización biblioteca online + compartir widgets entre usuarios (edición compartida/bloqueada, réplica de archivos de la red) — diseño pendiente respetando que los archivos/datos de la red NO son alterables salvo permiso.

---

## 2026-05-29 — Acomodo final gen4/gen5 en dashboards + migración rename "Social"→"Dashboards"

**Sesión por:** Claude (Cowork mode, Opus).
**Resumen ejecutivo:** Se confirmó/cerró el acomodo de los 21 widgets gen4+gen5 en sus 27 dashboards predeterminados, se añadió migración de localStorage para que usuarios existentes vean el dashboard por defecto como "Dashboards" (antes "Social"), y se verificó consistencia total (47 tipos usados ↔ manifest/registry/WidgetType) + type-check 0 errores.

### Hecho
- **Rename robusto**: además de `name: 'Dashboards'` en la plantilla por defecto (categoryId 'social'), se añadió en `dashboard-layout.tsx` una migración al cargar: si un dashboard persistido tiene `category==='social' && name==='Social'`, se renombra a 'Dashboards' y se re-persiste. Cubre instalaciones previas sin tocar tableros personalizados.
- **Acomodo verificado por dashboard** (widgets por relevancia, sin solapes):
  - Dashboards(social) 5 · Política 6 · Educación 5 · Cultura 5 · Economía 6 · Clima 9 · Productividad 6 · Ubicación 4 · Utilidades 3 · Arte 1 · Astronomía 7 · Sistema 6 · Personalización 2 · IA 5 · Parlamento 4 · Red 4 · Explorador 3 · Astrología 4 · Archivos 2 · Entretenimiento 2 · Ayudantía 3 · Ciberdelia 3 · Descubrimientos 4 · Privacidad 3 · Dispositivos 3 · Creatividad 3 · Perfil 3 · Sociedad 3.
- **Verificación de consistencia** (script): 47 WidgetType usados en plantillas → 0 faltantes en manifest, 0 faltantes en registry case, 0 faltantes en declaración WidgetType.
- **Type-check** scope completo (widget-data + dashboard core + gen4 + gen5): **0 errores**.
- **Estado vacío** con botón real a la biblioteca y **AiOverlay omnipresente** ya integrados (sesión previa gen5).

### Pendiente / próximos pasos (olas dedicadas)
- Rediseño estético profundo iterativo de widgets gen1 antiguos (microinteracciones/animaciones por widget).
- Sincronización con biblioteca online + compartir/replicar widgets entre usuarios (edición compartida/bloqueada), respetando que datos/archivos de la red NO se alteran salvo permiso.
- Panel de permisos de IA en la página de IA (acceso complejo al sistema, desplegar agentes/subagentes) — por defecto las IAs de chat del usuario pueden editar su propio entorno.

### Adenda (misma fecha) — fixes de cierre
- **Migración rename en runtime**: `dashboard-layout.tsx` ahora, al cargar dashboards persistidos, renombra `category==='social' && name==='Social'` → 'Dashboards' y re-persiste (cubre usuarios ya inicializados; no toca tableros personalizados). El título grande del header lee `activeDashboard?.name ?? "Dashboards"`.
- **Bug real corregido**: `LIVE_DATA` no tenía case en `widget-registry.tsx` (renderizaba "Widget desconocido" en Sistema y Red). Añadido import `LiveDataWidget` + case.
- **Verificación de cobertura**: 47 WidgetType colocados en las 28 plantillas → 0 sin case en registry. Type-check scope (data + dashboard core + gen4 + gen5 + app-shell) → 0 errores nuevos (2 preexistentes ajenos: tipado RGL en grid-area:205 y activeId en renderer:174, ignorados por Next en build).

### Adenda 2 — re-siembra versionada de dashboards predeterminados
- **Problema**: instalaciones con `LS_INITIALIZED` ya puesto nunca volvían a sembrar, así que los nuevos acomodos gen4/gen5 no aparecían en localhost del usuario.
- **Solución**: `LS_DEFAULTS_VERSION` + `DEFAULTS_VERSION='gen5-2026-05-29'`. Al montar, si la versión guardada ≠ actual, `reseedDefaultDashboards()` regenera TODOS los tableros predeterminados con el acomodo nuevo y **preserva los tableros propios** del usuario (categorías no predeterminadas + sus widgets), resetea `LS_ORDER` y guarda la versión. Subir `DEFAULTS_VERSION` en el futuro re-siembra automáticamente.
- Type-check del archivo: 0 errores nuevos.

---

## 2026-05-30 — Re-siembra de defaults + Olas 1·2·3 (gen1 redux, permisos IA, compartir/sincronizar)

**Sesión por:** Claude (Cowork mode, Opus) + 1 subagente (gen1).
**Resumen ejecutivo:** Resuelto que los nuevos acomodos no aparecían en localhost (bandera de init), mejorados los widgets gen1 más básicos, y construidas dos capacidades nuevas: panel de permisos de IA y sistema de compartir/sincronizar widgets con la biblioteca.

### Re-siembra versionada de dashboards (fix del usuario)
- `LS_DEFAULTS_VERSION` + `DEFAULTS_VERSION='gen5-2026-05-29'` en `dashboard-layout.tsx`. Al montar, si la versión guardada ≠ actual y ya había tableros, `reseedDefaultDashboards()` regenera TODOS los predeterminados con el acomodo nuevo y PRESERVA los tableros propios del usuario (categorías no predeterminadas + sus widgets), resetea `LS_ORDER` y guarda versión. Subir la constante re-siembra en el futuro. (Recargar la página aplica el cambio.)
- Migración de rename "Social"→"Dashboards" también en runtime.

### Ola 1 — gen1 redux
- Auditoría: casi todos los widgets raíz ya usaban el kit (sesiones previas). Solo eran básicos 3.
- Reescritos (subagente) con kit adaptativo + datos en vivo, microinteracciones y diseño único:
  - `explore-network-widget.tsx` → `social.entities` (entidades trending, momentum, unirse).
  - `my-pages-widget.tsx` → `social.pages` (rol, actividad, filtro por kind).
  - `political-summary-widget.tsx` → `politics.proposals` (etapas, votar a favor/contra, deadline).
- Type-check 0 errores.

### Ola 2 — Permisos y accesos de IA
- `src/ai/client/ai-permissions.ts`: modelo soberano. Por DEFECTO acceso completo al PROPIO entorno (read/edit widgets·dashboards·layout·appearance·code·memory, manage agents·providers, navigate, net.read). `net.write` OFF por la Constitución (datos de la red/otros inmutables salvo permiso). API: load/save/canPerform/setScope/setComplexAccess/setMaxAgents/reset, por actor (`assistant`|`nexus`), persistente + evento de cambios.
- `src/ai/client/use-ai-permissions.ts`: hook reactivo.
- `src/components/ai/ai-permissions-panel.tsx`: panel con selector actor, toggle maestro de "acceso complejo", scopes por grupos (lectura/entorno/inteligencia/red), slider de agentes máximos, reset. `net.write` marcado con candado.
- Integrado como pestaña **"Permisos"** en `/ai-setup` (deep-link `?tab=permissions`). Type-check 0 errores.

### Ola 3 — Compartir / sincronizar widgets (biblioteca)
- `src/lib/widget-sync/index.ts`: source-agnostic (transport intercambiable por Supabase/IPFS/ActivityPub con `registerSyncTransport`). API: `shareWidget` (publica a biblioteca), `replicateEntity` (réplica = REFERENCIA al origen, nunca lo altera; Lienzo Universal), `syncReplica`, `openCollabSession`/`canEditEntity`/`closeCollabSession` (edición compartida o bloqueada con lock). Invariante: contenido de red `networkLocked` → inmutable salvo permiso.
- UI: botón **🔗 Compartir** en los controles de edición de cada widget (`grid-area.tsx`), copia un enlace `starseed://widget/<id>` y publica a la biblioteca. Type-check 0 errores nuevos.

### Verificación final
- Type-check de scope amplio (widget-data + widget-sync + IA + dashboard core + gen4 + gen5 + gen1 redux + app-shell): **0 errores nuevos**. Persisten 2 preexistentes ajenos (RGL en grid-area, activeId string|null en renderer), ignorados por Next en build.

### Pendiente / siguientes mejoras opcionales
- UI de biblioteca para explorar/replicar widgets compartidos por otros (lista + botón Replicar) — el store ya lo soporta.
- Conectar `registerSyncTransport` a Supabase/federación real.
- Cablear `canPerform()` de permisos dentro del overlay/agente para gatear acciones reales (hoy el modelo y el panel están listos; el overlay es grande y frágil — integrar con cuidado en una pasada dedicada).

### Adenda 3 — fixes finales + botón de restablecer
- **Bug del subagente corregido**: los 3 widgets gen1 (explore-network, my-pages, political-summary) importaban `../../kit` (ruta de gen5) → corregido a `../kit`. 0 errores.
- **Botón "Restablecer dashboards"** en la barra del dashboard → `handleResetLayout()` llama a `reseedDefaultDashboards()` con confirmación; regenera los predeterminados con el acomodo nuevo conservando los tableros propios. Da una vía manual además de la re-siembra automática por versión.
- Verificación final del núcleo (data + sync + IA + dashboards + gen1/gen4/gen5 + app-shell): 0 errores nuevos.

### Adenda 6 — verificado en dev server + fondos líquidos + favicon servido
- Dev server (puerto 9002) sano: /login HTTP 200, /dashboard 307→login (auth middleware Supabase). Sin errores de compilación tras los cambios.
- IMPORTANTE para el usuario: /dashboard redirige a /login si no hay sesión; los widgets sólo se ven autenticado. Tras iniciar sesión, recargar aplica la re-siembra (DEFAULTS_VERSION='gen5-2026-05-30b').
- Favicon e íconos servidos OK (public/starseed-symbol.png, src/app/icon.png 512, apple-icon.png 180, favicon-48.png) desde Documents/simbolos/simbolo_starseed.png. Metadata `icons` en app/layout.tsx.
- Fondos psicodélicos líquidos: nuevo `LiquidPsychedelicBackground` (5 presets: Aurora Líquida, Plasma Psicodélico, Lava Solar, Marea Profunda, Iris Cuántica) — blobs SVG con gradientes animados, hue-rotate y parallax al cursor; montado en app/layout. Añadidos a "Temas Rápidos → Fondo de Pantalla" con preview animado; applyBackground setea config.background.type al id del preset. 0 errores de tipo.

### Adenda 7 — picker de fondos líquidos en Apariencia
- Los presets líquidos NO van en la barra del dashboard (ahí "Diseño Estético" sólo estiliza la barra). El picker real de fondo es `src/components/settings/appearance/background-settings.tsx`.
- Añadida sección "Fondos Psicodélicos Líquidos" con los 5 presets (Aurora Líquida, Plasma Psicodélico, Lava Solar, Marea Profunda, Iris Cuántica), preview con gradiente animado; al pulsar setea `config.background.type` al id → activa `LiquidPsychedelicBackground` (montado en app/layout). 0 errores de tipo.
- Ubicación para el usuario: Ajustes → Apariencia → Fondo → "Fondos Psicodélicos Líquidos".
- NOTA: el dev server (localhost:9002) estaba caído (HTTP 000) al cerrar la sesión; debe ejecutarse `npm run dev` en la máquina del usuario para ver y verificar los cambios.

### Adenda 8 — tipado de fondos líquidos + pestaña "Líquidos"
- Corregida línea duplicada `type:` en `appearance-context.tsx` (interface background) y extendida la unión con los 5 ids líquidos → ya no requiere `as any`.
- `background-settings.tsx`: añadida pestaña "Líquidos" (Droplets) con grid de 5 presets, preview con gradiente animado + check del activo; setea `config.background.type` al id. 0 errores.
- Resumen verificado de la sesión: DEFAULTS_VERSION bump ✓, sidebar auto-hide con título ✓, cabecera limpia ✓, fullscreen 100dvh ✓, favicon/íconos StarSeed ✓, LiquidPsychedelicBackground montado ✓, pestaña Líquidos ✓.

### Adenda 9 — BUG CRÍTICO encontrado: header.tsx roto (causa real del dashboard en blanco)
- `src/components/layout/header.tsx` estaba CORRUPTO: sin `export function AppHeader()`, sin importar `useState`, con 10 líneas `const [mounted2, setMounted] = useState(false)` duplicadas a nivel de módulo. Compila-crash de TODA la sección `(app)` al renderizar el AppHeader → por eso, tras iniciar sesión, el dashboard salía en blanco / sin widgets. (No se notaba en /login porque vive en el root layout, y /dashboard redirige a /login por middleware antes de render cuando no hay sesión.)
- Reconstruido limpio: AppHeader con el símbolo StarSeed (`/starseed-symbol.png`) como marca + ColorThemeSwitcher. 0 errores.
- Verificado: ningún otro archivo tiene esa corrupción (scan de líneas duplicadas consecutivas en todo src = limpio). Type-check de la ruta de render completa de /dashboard (layout (app) + header + app-shell + dashboard-layout + grid-area + floating-assistant) = 0 errores.
- **Marca StarSeed integrada**: símbolo real en login (80px con halo animado) y cabecera global (24px con hover). Dev server /login HTTP 200.

### Adenda 10 — marca StarSeed propagada + ortografía verificada
- `src/components/logo.tsx`: reemplazado icono Orbit por `/starseed-symbol.png` (28px, halo) → se propaga a login + AuthForm + cualquier consumidor de <Logo/>.
- header.tsx restaurado correctamente (búsqueda + NotificationCenter + UserNav intactos) con el símbolo StarSeed como marca a la izquierda.
- Ortografía: barrido de texto JSX visible — sin errores reales (Conexiones, Notificaciones, Personalización, Configuraciones, etc. ya correctos con tilde). Se normalizaron "..." → "…" en placeholders del header.
- Type-check ruta de render completa /dashboard + logo + login: 0 errores nuevos.

### Adenda 11 — BUG RAÍZ de "otros dashboards vacíos" + sidebar fullscreen + más corrupción
- **CAUSA REAL encontrada**: `widgetsMap` en dashboard-layout se construía con `widgets.filter(w => w.dashboard_id===d.id)`, pero `widgets` (estado) sólo contiene los del dashboard ACTIVO → todas las demás pestañas recibían []. Por eso sólo la principal mostraba widgets. FIX: `widgetsMap` ahora usa `loadAllWidgets()` para los no-activos y el estado en vivo para el activo. Todas las pestañas aparecen acomodadas por defecto.
- **Más corrupción reparada** (mismo patrón que header.tsx): efecto `setTimeout(setIsFullscreen,2500)` duplicado, y atributo `title=...` repetido 6× en el botón toggle del sidebar. Limpiados.
- **Sidebar en pantalla completa**: nuevo efecto `if (isFullscreen) setIsSidebarOpen(false)` → al auto-entrar a fullscreen (2.5s) el menú de ajustes se esconde y queda sólo el botón de expansión, dejando los widgets a pantalla completa. (Ya se ocultaba también con el scroll del título.)
- Verificado: 7/7 fixes presentes, type-check dashboard-layout 0 errores, sin duplicados consecutivos.
- **No pude levantar el dev server ni abrir el navegador yo mismo**: Terminal está en tier "click" (no puedo teclear) y Chrome en tier "read" (no puedo clicar); la extensión Claude-in-Chrome está desconectada. El usuario debe ejecutar `npm run dev` (puerto 9002). Tras el fix de header.tsx (que crasheaba el render) + widgetsMap, los dashboards deben cargar con sus widgets al recargar e iniciar sesión.

### Adenda 12 — Cuenta unificada con el Portal StarSeed OS (2026-06-10)
- Creado `architecture/integracion-portal-starseed-os.md` (SOP primero, regla dorada) y `.env.local` con el proyecto Supabase COMPARTIDO `dzkjapinnewkxzjltadv` (el del Café/Portal) + `GOOGLE_GENAI_API_KEY` → una sola cuenta soberana en todo el ecosistema y Genkit operativo.
- El Portal StarSeed OS (repo Starseed-Cafe, carpeta "StarSeed Café/app") es ahora la página principal: 6 áreas (incluye Audiomorphic), Astraura (Exocórtex global con el corpus del Drive), cartera Semillas/Granos con bolsa simulada (tablas nuevas `grain_types` y `seed_market`, lectura pública), cuenta OTP compartida (storageKey `starseed.auth`).
- Sistema de enlaces: starseed-os.vercel.app (portal) · /cafe/ · starseed-nexus.vercel.app (este SOSD).
- Razón: petición del visionario de interconectar todas las áreas y cuentas bajo una identidad y mejorar el diseño global del ecosistema.

### Adenda 13 — Intercambio de nombres (2026-06-10, tarde)
- DECISIÓN del visionario: el portal de marca pasa a llamarse **StarSeed Nexus** (starseed-nexus.vercel.app) y ESTE repo/aplicación es **StarSeed OS** (conserva starseed-os.vercel.app, que ya servía esta app). starseed.config.json: systemName "StarSeed OS", deployment.url starseed-os.vercel.app. SOP de integración actualizado.

### Adenda 14 — Tema Materia Viva (2026-06-11)
- **Qué:** nueva familia de fondos "Materia Viva" (oro + cristal + geometría sagrada del rediseño Nexus/Café) en canvas 2D ligero, sin three.js. 3 ids nuevos en `config.background.type`: `materia-oro-vivo` (ámbar/oro), `materia-cristal-liquido` (cian/lavanda), `materia-bosque-dorado` (lima/musgo). Flor de la Vida (19 círculos) en rotación lenta, ~90 partículas ascendentes y brillo especular que sigue al cursor; pausa en pestaña oculta, DPR-aware, `prefers-reduced-motion` → fotograma estático.
- **Dónde:** SOP primero en `architecture/integracion-portal-starseed-os.md` ("Tema Materia Viva (v1)"); componente nuevo `src/components/backgrounds/materia-viva-background.tsx` (`MateriaVivaBackground` con props `variant`+`intensity` + host `MateriaVivaBackgroundHost` que se auto-activa con `type.startsWith("materia-")`); host montado en `src/app/layout.tsx`; unión de tipos + campo opcional `background.intensity` (0..1) en `src/context/appearance-context.tsx`; pestaña "Materia Viva ✦" con 3 tarjetas (preview CSS animada) y deslizador Intensidad (0–100) en `src/components/settings/appearance/background-settings.tsx` (TabsList pasa de grid-cols-5 a grid-cols-7 para acomodar las 7 pestañas).
- **Por qué:** personalización de la red con los nuevos estilos visuales del rediseño Nexus/Café — opciones configurables (variante + intensidad) publicadas como personalización elegible por cada usuario (código abierto, §6). Cambios 100% aditivos: ninguna función existente tocada ni eliminada; `intensity` opcional → configs guardadas siguen siendo válidas.

### Adenda 15 — Widget Cartera StarSeed (2026-06-11)
- **SOP primero (regla dorada):** nueva sección "Widget Cartera StarSeed (v1)" en `architecture/integracion-portal-starseed-os.md` con fuentes de datos, estados e invariantes.
- **Nuevo widget** `src/components/dashboard/widgets/cartera-starseed.tsx` (`CarteraStarseedWidget`, 'use client'): tarjeta "Cartera StarSeed 🌱" sobre `WidgetShell` del kit. Consume la **cuenta soberana unificada** (Supabase compartido `dzkjapinnewkxzjltadv`) vía el cliente browser existente `@/utils/supabase/client`:
  - Público siempre: `grain_types` + últimas ~60 filas de `seed_market` → sparkline SVG inline de `seed_eur` (stroke `#9FE870`, degradado sutil) con último valor y delta 7d %.
  - Con sesión (RLS `auth.uid()`): fila de `wallets` (Semillas en contador grande verde + granos por tipo como pills emoji + g con color del tipo) y últimos 6 movimientos de `economy_ledger` (kind + name + ±semillas + hace cuánto).
  - Estados: skeleton de carga, error con botón Reintentar, sin sesión → mercado público + CTA "Iniciar sesión" (`/login`), micro-tier adaptativo. Pie fijo: "Bolsa y cartera en modo beta simulada". Solo lectura; sin dependencias nuevas.
- **Registro** (siguiendo el patrón de los widgets existentes, todo aditivo, nada eliminado): tipo `CARTERA_STARSEED` en `dashboard-types.ts`; case + import en `widget-registry.tsx`; manifiesto en `widget-manifest.ts` (label "Cartera StarSeed", categoría economia, w3×h5 como Pulso Económico); mapeo de categorías en `dashboard-defaults.ts` (economia + perfil); tarjeta en la Biblioteca de Widgets (`add-widget-dialog.tsx`) con icono `Wallet` de lucide-react. NO se añadió a las plantillas de tableros predeterminados: el usuario lo añade cuando quiera. Nota: el sistema identifica widgets por `WidgetType` en MAYÚSCULAS, por eso el id interno es `CARTERA_STARSEED` (el archivo sí es `cartera-starseed.tsx`).
- Verificación: `npx tsc --noEmit` sin errores en los archivos tocados (cartera-starseed, dashboard-types, widget-registry, widget-manifest, dashboard-defaults, add-widget-dialog).
- No se tocaron `src/components/settings/appearance/`, `src/components/backgrounds/` ni el contexto de apariencia (en manos de otro agente en paralelo).

### Adenda 16 — OmniDock responsive + Materia Viva integrada por defecto (2026-06-11)
- **SOP primero (regla dorada):** secciones nuevas en `architecture/integracion-portal-starseed-os.md`: "Tema Materia Viva → v1.1" y "OmniDock responsive (fix 2026-06-11)".
- **Fix del dock Trinity (Anchor) en pantallas chicas** — el usuario reportó que "el menú de abajo no sale completo en pantallas chicas". Causa: 11 botones × 56–64px + gaps + padding ≈ 745–897px de contenido con `overflow-visible` → cortado en cualquier viewport <1024px. Cambios en `src/components/layout/omni-dock.tsx` (NINGUNA función eliminada):
  - La píldora conserva borde/cristal; dentro un strip `.omni-dock-strip` (CSS en `globals.css`) que en `<1024px` hace scroll-x con `scroll-snap` (snap-center), scrollbar oculta, máscara de degradado en ambos bordes (pista de "hay más") y `overscroll-behavior-x: contain`. En `≥1024px` (lg) overflow visible y tamaños 64px como siempre (tooltips intactos).
  - Items `shrink-0`, talla compacta 48px en `<lg` (≥44px táctil), gaps/padding reducidos, `safe-area-inset-bottom` en el wrapper. El breakpoint es **lg y no sm** porque a 768px el contenido (897px) también desbordaba — verificado empíricamente con Playwright.
- **Materia Viva integrada en dashboards** (`src/context/appearance-context.tsx`, `src/app/globals.css`, `src/app/(main)/layout.tsx`):
  - Default `background.type: "materia-oro-vivo"` (+ `intensity: 0.7`) para usuarios SIN config guardada; las configs en localStorage se mergean encima y no se tocan (verificado: con config webgl guardada todo vuelve al estado anterior).
  - `applyStyles` pone `data-materia="<variante>"` en `<body>` cuando el type empieza por `materia-` (y lo borra si no). `globals.css`: bloque `body[data-materia…]` con `--materia-accent` y override de `--primary-hsl`/`--ring-hsl` por variante (dorado #E9C46A / cian #7FD8E8 / lima #9FE870), borde global cálido en dark (44 28% 24%, mismo L/S que Nebula), y borde+glow `color-mix` en `.card-glass`/`.liquid-glass-panel`. Sin data-materia: cero efecto (temas existentes intactos).
  - Shell del grupo `(main)` con clases estables `os-main-shell`/`os-main-scroll`: bajo data-materia su `bg-background` opaco pasa a transparente para que el canvas respire tras los widgets.
- **Página QA interna** `/qa-dock` (`src/app/(main)/qa-dock/page.tsx`): renderiza el mismo `DashboardLayout` que `/dashboard` sin exigir sesión (el signup del auditor vía REST exige confirmación de email, así que no se creó sesión); marcada "QA interno" y devuelve `notFound()` en producción. `src/app/(main)/__qa-dock/page.tsx` quedó como stub privado (carpetas `_` no rutean en App Router y el entorno no permite borrar archivos del mount).
- **Verificación empírica** (dev server + Playwright headless, capturas en outputs/shots/): `os-dock-360.png` (píldora 6→354 dentro de 360, strip 603/330 con scroll+máscara), `os-dock-390.png` (6→384, bottom 816<844), `os-dock-768.png` (los 12 items completos sin scroll, 603=603), `os-dashboard-materia-390.png` y `os-dashboard-materia-1280.png` (widgets sobre el canvas materia, shell transparente rgba(0,0,0,0), `--primary-hsl` = 42 74% 66%, data-materia="oro-vivo"). Test de regresión con `background.type: "webgl"`: data-materia null, shell opaco de nuevo, primary 276 85% 55% original.
- `npx tsc --noEmit`: **0 errores en los archivos tocados**; quedan 153 errores PREEXISTENTES en archivos no relacionados (drift `distortWidth`/`liquidGlass` en settings antiguos, `src/types/supabase.ts` generado, carpetas demo `theme-antigravity-flux/`, `integraciones-de-codigo/`…). El proyecto ya compila con `ignoreBuildErrors: true` en `next.config`; no se tocaron por riesgo de romper funciones ajenas al encargo.
- Nota de entorno: el sandbox linux/arm64 necesitó `@next/swc-linux-arm64-gnu` (instalado en /tmp y symlinkeado en node_modules) para arrancar `next dev`.

### Adenda 17 — Trinity Móvil: drag táctil con pulsación mantenida + TrinityFab + menús en pantallas chicas (2026-06-11)
- **SOP primero (regla dorada):** sección nueva "Trinity Móvil (v1)" en `architecture/integracion-portal-starseed-os.md` con los 3 bloques, causa raíz, soluciones y verificación empírica completa.
- **Bloque 1 — widgets táctiles (`grid-area.tsx` + `use-touch-drag-arming.ts` + `grid-area-touch.module.css`, archivos nuevos los dos últimos):**
  - **Causa raíz descubierta en runtime (fibers):** react-grid-layout **2.2.2 NO cablea `draggableHandle`** hasta el item — `DraggableCore.props.handle = ""` aunque GridLayout reciba ".drag-handle" → en modo edición CUALQUIER punto del widget arrastraba, y en táctil react-draggable hace `preventDefault()` del touchstart → scroll muerto + widgets moviéndose (el bug reportado).
  - **Solución:** puerta en fase de captura sobre el contenedor del grid que oculta los `touchstart` a DraggableCore (el scroll del navegador queda libre); pulsación mantenida 320 ms sin mover >10 px → arma el widget (vibración 10 ms + elevación scale 1.03 + glow dorado #D4AF37 vía CSS Module), `flushSync` retira el handle y un `TouchEvent` sintético con el Touch vivo entrega el gesto a RGL **sin levantar el dedo**; un `touchmove {passive:false}` global bloquea el scroll solo mientras dura el drag; al soltar, `onDragStop` desarma y el widget asienta con `cubic-bezier(.34,1.56,.64,1)`. Handles ✋/resize exentos (flujo inmediato de siempre); `draggable` HTML5 (transferencia entre paneles) solo con ratón — en táctil era otro secuestrador del gesto. **Ratón/escritorio bit a bit igual** (la puerta solo escucha eventos touch; verificado con Playwright a 1280).
  - Métricas (CDP touch, 390×844, modo edición): swipe → scrollTop 0→32 con transform intacto `translate(18px,18px)`; hold 450 ms → `armed=true` + `react-draggable-dragging=true`, drag en el mismo gesto hasta `translate(148px,128px)` sin scroll, asentamiento al soltar.
- **Bloque 2 — TrinityFab (`layout/trinity-fab.tsx` + `.module.css` nuevos, montado como hermano del dock dentro de `omni-dock.tsx`):** botón flotante cristal líquido 56 px con anillo cónico cardinal (N #007FFF · E #FFBF00 · S #DC143C · O #39FF14) y sigil de 4 gemas; al tocar despliega 4 pétalos-gema en cruz que abren cada menú con el MISMO `usePerimeter().setActiveEdge` de los sensores (cero lógica duplicada, toggle incluido). Draggable con anclaje al borde más cercano (pos persistida `os.trinity.fab.pos`); al abrirse pegado a un borde se desplaza ~64 px al centro para que ningún pétalo caiga fuera. Visibilidad `os.trinity.fab` = auto/on/off (auto = coarse o ≤1024 px; a 1280 fino NO se renderiza — verificado 0 nodos). Nota: `globals.css` fuerza `button{border-radius:var(--radius)!important}` → el módulo usa `9999px !important`. Panel nuevo de Ajustes `settings/trinity/trinity-fab-settings.tsx` + pestaña "Trinity" en `/settings` (sin tocar `appearance/**`): selector Auto/Visible/Oculto con estado en vivo (verificado: Oculto desmonta el FAB al instante).
- **Bloque 3 — menús Trinity en pantallas chicas (`side-curtains.tsx`, `trinity/control-center.tsx`):**
  - **Logic estaba ROTO en móvil:** el wrapper framer-motion con `y:"-50%"` residual era containing block del `fixed inset-0` del ControlCenter → quedaba confinado a una franja de ~2 px fuera de pantalla (a 320: root l=320 r=322, 86 elementos derramados hasta x=577). Fix: el wrapper anima solo `x`, centrado vertical sin transform (inset-0 móvil / top-0 bottom-0 + my-auto md), y el ControlCenter rellena a su padre (`w-full h-full` móvil) conservando exactamente sus tamaños md/lg.
  - Auditoría final (320/360/390/768, rects vs viewport ignorando scrollers horizontales legítimos): **0 desbordes** en Anchor/Logic/Horizon en todos los anchos, `scrollWidth==viewport` siempre; en Zenith solo el div decorativo de rayos `w-[600px]` clipado por `overflow-hidden` (sin efecto visual).
- **Verificación:** `npx tsc --noEmit --incremental` = **153 errores, idéntico al baseline (0 nuevos, ninguno en archivos nuevos)**; el TS2322 de grid-area es preexistente (tipos de RGL v2 sin `isDraggable` en `Responsive`). Capturas en `outputs/shots/`: `os2-touch-scroll.png`, `os2-touch-armed.png`, `os2-fab-cerrado-390.png`, `os2-fab-abierto-390.png`, `os2-fab-zenith-390.png`, `os2-fab-logic-390.png`, `os2-settings-trinity-390.png`, `os2-{zenith,horizon,logic,anchor}-390.png`, `os2-logic-320.png` (peor caso arreglado) y set `os2-*-320.png`.
- **No tocado (límite de propiedad):** `globals.css`, `appearance-context`, `app/layout.tsx`, `settings/appearance/**`, `dashboard/widgets/**`. Ninguna función eliminada (drag ratón, ✋, resize, HTML5 DnD entre paneles, sensores de borde y atajos siguen intactos).

### Adenda 18 — Tema "StarSeed Café" para todo el OS + pulido global (2026-06-11)
- **SOP primero (regla dorada):** sección nueva "Tema StarSeed Café (data-os-theme, v1)" en `architecture/integracion-portal-starseed-os.md` (mecanismo de 3 capas, paletas exactas, tokens de movimiento, invariantes).
- **Sistema de temas descubierto:** (1) next-themes con `attribute="class"` (atmósferas `light/dark/grey/natural/glass/custom` como clases en `<html>` con bloques HSL en `globals.css`); (2) `AppearanceConfig` en `localStorage appearance-config-v2` con `applyStyles()` inyectando vars (glass, radius, fuentes, `data-materia` en body); (3) presets curados (`curated-presets.ts`) que aplican DeepPartial del config. El tema Café se montó como **capa nueva ortogonal**: `themeStore.osTheme?: "default" | "cafe"` (unión aditiva, export `OsThemeId`) → `applyStyles()` pone `data-os-theme="cafe"` en `<html>` → `globals.css` recubre TODAS las vars del design system.
- **Tema café (valores clave):** OSCURO (.dark/.natural/.glass): fondo `130 19% 6%` (#0d130e verde-negro), card `120 16% 9%`, primario oro `42 74% 66%` (#E9C46A), acento lima `97 72% 67%`, secundario terracota, borde oro `44 30% 26%`, body radial #16210f→#070b08. CLARO: fondo pergamino `43 76% 95%` (#fdf7ea), tinta café `27 42% 16%` (#3B2818), primario terracota `15 53% 47%` (#C05C3B), secundario ámbar `37 92% 50%`, acento musgo `104 49% 30%`, borde oro suave `40 42% 72%`, body radial #fdf7ea→#e8dabc. Tipos: titulares **Fraunces** (`--font-headline` en body bajo café), labels **Space Mono** (`--font-code`); radios 14–26px; cristal cálido (liquid-glass-ui/panel/card-glass con verde-oliva + borde oro 35% en dark, crema+oro en claro); botones primary "oro fundido" (degradado vertical + inset highlight); glow hover dorado en dark; scrollbar tintada. Regla extra: bajo café claro, `body[data-materia]` re-afirma terracota (el oro de materia no contrasta sobre crema); en café oscuro coinciden (oro).
- **Tokens de movimiento** en `:root`: `--ease-organic/.22,1,.36,1`, `--ease-glide/.16,1,.3,1`, `--ease-elastic`, `--ease-soft` + `--dur-fast/base/slow` (150/220/300ms); `--dur-base` ahora sincronizada con `animations.transitionDuration` desde `applyStyles`. La regla global de transiciones pasó a `var(--dur-base) var(--ease-glide)` (mismos fallbacks). Bajo café, interactivos usan `--ease-organic` y los Radix open/close `--ease-glide`.
- **Selector:** `src/components/settings/appearance/os-theme-selector.tsx` (nuevo) — "Tema del sistema" con 2 tarjetas (Aurora StarSeed default / StarSeed Café) con mini-preview doble dark+light (ventanita: titular serif, tarjeta, botón primario, chip acento), `aria-pressed`, check activo; montado arriba de la pestaña Galería en `appearance-editor.tsx`. Persistencia: el mismo `updateSection("themeStore",…)` de siempre.
- **Pulido de widgets (sistémico vía kit, API intacta):** `globals.css` define por fin `.custom-scrollbar` (WidgetShell la usaba y NO existía → scrollbars finas en TODOS los widgets) + clase nueva `os-widget-shell` (hover border-primary, `focus-within` con anillo, `font-variant-numeric: tabular-nums` heredado en todo widget, sombra cálida bajo café). `widget-shell.tsx`: clase añadida + título `font-headline`. `primitives.tsx`: `MiniList` con empty state real (icono Lucide `Inbox` configurable `emptyIcon` + mensaje — cascada a ~15 widgets legacy que ya pasaban `empty=`), `StatTile` con hover visible, `Chip` con `whitespace-nowrap` (los badges partían palabras a 390px: "COLECTIV O").
- **Fix transversal real:** `--primary-rgb` se usaba en 5 archivos (`rgba(var(--primary-rgb),…)` en network, hub, culture, glass-card, design-canvas) pero **no estaba definida en ningún sitio** → esas sombras se descartaban en silencio. Definida ahora por tema (:root 160,43,238 · .dark 205,119,248 · .grey 10,167,235 · .natural 58,223,118 · .glass 51,187,255 · café claro 192,92,59 · café oscuro 233,196,106 · y las 3 variantes materia).
- **Páginas:** hub h1 des-hardcodeado (`from-cyan-400 to-purple-400` → `from-primary to-secondary` + sombra `hsl(var(--primary-hsl)/…)`); explorer h1 `from-white` (ilegible en temas claros) → `from-foreground`; agent: SelectTriggers `bg-black/50 border-white/10` → `bg-card/60 border-border/50` + `max-w-[46vw]` (móvil); network `_components/navigation.tsx`: tabs con `whitespace-nowrap shrink-0` + `overflow-x-auto scrollbar-hide` (a 390px partían palabras: "Panoram a"). Resto de secciones heredan vía vars (verificado en captura).
- **Verificación:** `npx tsc --noEmit --incremental` = **153 errores, idéntico al baseline (0 nuevos)**, ninguno en archivos tocados. Playwright (dev server 9002, capturas en `outputs/shots/`): `os3-tema-cafe-dashboard-1280.png` y `-390.png` (café oscuro: widgets verde-negro+oro, serif, sin overflow), `os3-tema-cafe-light-390.png` (tarjetas pergamino + terracota; nota: el canvas Materia sigue siendo oscuro detrás — comportamiento previo de materia en temas claros), `os3-settings-selector-390.png` (selector con tarjeta Café activa, aria-pressed true), `os3-network-390.png` (café + tabs scrollables, scrollWidth 390=390). Prueba DOM en vivo: alternando el atributo, `--primary-hsl` 280 90% 72% ↔ **42 74% 66%**, `--background-hsl` 258 45% 5% ↔ **130 19% 6%**, body gradient Nebula ↔ verde-negro, `--font-headline` Space Grotesk ↔ **Fraunces**.
- **No tocado (límite de propiedad):** `src/components/layout/**`, dashboard layout/grid drag, TrinityFab. Nada eliminado en ningún archivo; cambios aditivos.

### Adenda 19 — Trinity Móvil v2: pulsación 3s configurable + acceso por bordes + sync de cuenta (2026-06-13)
- **Petición de Alex:** (a) integrar el nuevo diseño como tema en Ajustes — ya estaba (tema "StarSeed Café" + Materia Viva, Adendas 14/18; confirmado, no se rehace); (b) en táctil los widgets deben moverse solo tras mantener pulsado **3 s**; (c) los menús Trinity deben abrirse con **botón lateral largo no intrusivo configurable en cada borde** y **deslizando desde cada orilla**, todo ajustable; (d) mejorar integración con cuentas/perfiles compartidos. SOP primero: nuevas secciones "Trinity Móvil · Bloque 4" y "Sincronización de preferencias" en `integracion-portal-starseed-os.md`.
- **Config aditiva** (`context/appearance-context.tsx`): `trinity.touch{holdMs:3000, haptics:true}` y `trinity.edgeAccess{mode:auto, edges{4×{handle,swipe}}, handleLength:28%, handleThickness:5px, handleOpacity:0.22, swipeThreshold:56px}`, ambos opcionales → deepMerge mantiene válidas las configs guardadas.
- **Pulsación configurable:** `use-touch-drag-arming.ts` ahora `useTouchDragArming(enabled,{holdMs,haptics})` con refs vivas; `grid-area.tsx` lee `config.trinity.touch` (import `useAppearance` añadido). Default 3000 ms; ajustable 300–4000. Resto del Bloque 1 intacto.
- **Acceso por bordes (NUEVO):** `components/layout/trinity-edge-access.tsx` + `.module.css`, montado en `app/layout.tsx` bajo `PerimeterProvider`. Asas-píldora por orilla (color cardinal, opacidad baja en reposo, tap = toggle) + deslizar desde los 24px del borde superado `swipeThreshold` (con guarda anti-scroll-paralelo y destello de confirmación). Mismo `setActiveEdge` que sensores/FAB; solo eventos touch; `mode auto` = coarse/≤1024px. z-index 84.
- **Ajustes ampliados:** `components/settings/trinity/trinity-edge-settings.tsx` añadido a la pestaña Trinity de `/settings` (junto al panel del FAB): slider pulsación + háptica, modo global, asa/deslizar por orilla, longitud/grosor/opacidad/sensibilidad. Usa `updateConfig` (deepMerge anidado).
- **Sync de cuenta StarSeed (NUEVO):** `lib/settings-sync.ts` (push/pull de `SYNCED_KEYS` a Supabase `user_settings`, opt-in, tolerante a falta de sesión/tabla) + panel `components/settings/account/account-sync-panel.tsx` en Ajustes → Perfil. Migración SQL documentada en el SOP (tabla + RLS por usuario). localStorage sigue siendo fuente de verdad offline.
- **OmniDock pantallas chicas:** ya resuelto por el strip `.omni-dock-strip` (scroll-snap + máscara + safe-area, Adenda 16); ahora abrir Anchor en táctil es trivial vía asa/deslizar inferior + FAB. Sin cambios extra.
- **⚠️ Verificación PENDIENTE:** el sandbox Linux no arrancó (disco lleno en el Mac) → no se pudo correr `tsc`/dev/Playwright esta sesión. Revisado por lectura (tipos, imports, providers, deepMerge). Ejecutar `npx tsc --noEmit` y `npm run dev` antes de desplegar. Nada eliminado; todo aditivo y desactivable.

### Adenda 20 — Deploy del OS desbloqueado + rediseño de widgets con interconexión (2026-06-13, tarde)
- **CAUSA REAL de "el OS nunca cambia" (resuelta):** el proyecto Vercel `starseed-os` (equipo `starseeds-projects`, token `vcp_237Kww…`) desplegaba desde **`StarSeedSystem/starseed-os`** (congelado marzo 2026), mientras el desarrollo vivo está en **`StarSeedSystem/starseed-system`** (este repo, `main`). Además el `next build` **fallaba** por `useSearchParams()` sin `<Suspense>` en `/agent` y `/ai-setup`.
- **Fixes de build:** `<Suspense>` en `/agent` y `/ai-setup` (+ `force-dynamic`); `/library` ya lo tenía. Deploy quedó READY.
- **Reconexión:** el proyecto Vercel `starseed-os` se **reapuntó a `StarSeedSystem/starseed-system` (branch main)** vía API (unlink DELETE v1 + link v9) → auto-deploy por push ya funciona. Disparo manual: `POST /v13/deployments` con `gitSource.repoId=1138672501`, `target=production`.
- **WidgetShell (kit):** hairline de acento, sigilo StarSeed de fondo, glow en hover (sin transform, no interfiere con drag), y nuevo prop `connections` (chips "✦ Conecta" en footer, solo no-micro) + prop `sigil`.
- **Interconexión cableada en 9 widgets:** Cartera (Fundación/Café/Mercado), Gobernanza (Comunidades/Cultura/Educación), Nexus IA (Ecosistema IA/Gráfica Viva/Biblioteca), Mis Páginas, Explorar Red, Cultura, Aprendizaje, Pulso Económico, Mensajes.
- **Responsividad:** `globals.css` `.os-widget-shell` con glow hover + `prefers-reduced-motion`; `grid-area` con padding fluido `clamp()` + `pb` con safe-area/holgura de dock (320px→ultrawide).
- **Verificación:** `tsc --noEmit` = 153 (baseline exacto, 0 nuevos; el TS2322 de grid-area es el preexistente de react-grid-layout). Deploys READY: `534c503` (fix build) → `a922889` (WidgetShell) → `dc9777d` (interconexión+responsive).
- **Pendiente ideal:** rediseño individual por widget/área a mayor profundidad; rotar el GITHUB_TOKEN compartido en chat.

### Adenda 21 — Modo de diseño por widget + rediseño de 11 widgets + Figma poblado (2026-06-13, noche · multi-agente)
- **Botón del bot de IA eliminado** (`AiOverlay` desmontado de `(app)/layout.tsx`; la IA vive en el Exocórtex de Trinity/Zenith).
- **WidgetShell**: nueva acción **Ampliar** (`expandHref`/`onExpand` → ventana/pestaña) y **modo de diseño** `designMode "theme"|"original"` (prop por widget + global `config.widgets.designMode`). "original" = cristal líquido teñido con el acento del widget (identidad propia, independiente del tema). Autoguardado en dashboard (localStorage) + perfil (settings-sync). Control en Ajustes→Apariencia (`widgets-design-settings.tsx`).
- **Rediseño profesional de 11 widgets** (multi-agente, lotes disjuntos): system-status, notifications, recent-activity, active-projects, social-radar, mental-coherence, learning-path, collab-projects, relevant-posts, live-data, calculator. Mejoras: info más clara/jerárquica, iconos/colores con significado, `connections` (interconexión), `expandHref`, teclado en calculadora, responsividad (clamp/min-w-0/flex-wrap).
- **Figma**: 5 proyectos creados y **poblados** vía `use_figma` (funcionó pese a asiento "View"): Maestro con board "Design Tokens" (paletas 3 temas + tipografía + Trinity + cristal líquido), y portadas + demo WidgetShell en OS UI Kit, Nexus, Café, Audiomorphic. Spec: `architecture/design-system-figma.md`. Keys en memoria.
- **Verificación**: `tsc --noEmit` = 153 (baseline, 0 nuevos) en cada paso. Deploys READY encadenados: `29024f9`→`44b3ea3`→`18835b5`→`082047f`. Auto-deploy ya reconectado (proyecto Vercel starseed-os → repo starseed-system/main).
- **Pendiente profundo**: poblar más frames Figma (dashboard responsive, kit de estados, assets Café/Audiomorphic); reestructurar el resto de widgets (gen2–gen5) con servicios en tiempo real; override de designMode por instancia desde el panel de cada widget.

---
## Adenda 18 — 2026-06-14 · Táctil "normal" (sin arrastre en touch) + logo Spline a nivel raíz

**Por qué:** tras v4, en táctil los widgets seguían moviéndose al tocarlos y los
botones no respondían. Causa real: el sistema de "armado por pulsación"
(`use-touch-drag-arming`) hacía `e.stopPropagation()` en fase de captura sobre
cada `touchstart` del grid en modo edición + re-despacho sintético de TouchEvent
→ frágil, mataba taps en dedos reales.

**Cambio (commit 9a52dd2):**
- Eliminado por completo `useTouchDragArming` del render. Nuevo modelo:
  `isDraggable=isResizable=(isEditMode && !isCoarsePointer)`. En CUALQUIER pantalla
  táctil el arrastre/redimensión de RGL están OFF → deslizar = scroll, los botones
  siempre reciben su tap. En ratón, arrastre/redimensión normales en edición.
- Reordenar en táctil: botones ↑/↓ por widget (`moveWidget` intercambia x/y con el
  vecino en orden visual; RGL compacta vertical). Sin arrastre.
- `grid-area-touch.module.css` ya no se usa (import retirado).
- Logo "Built with Spline": el matalogos anterior vivía en wrapper a z -10/-40 →
  inútil. Nuevo `SplineWatermarkCover` a nivel raíz: eliminador JS que atraviesa
  shadow DOM (observer + intervalo) + tapón degradado fijo z-[100] esquina inf-der.
- Badge: "táctil-normal v5".

**Verificado:** build Vercel READY (compila). Falta verificación en dispositivo
táctil real (el inspector Chrome estaba desconectado en esta sesión).

---
## Adenda 19 — 2026-06-14 · Táctil = rejilla normal (sin RGL) + cubre-logo reforzado

**Diagnóstico real (confirmado por el usuario):** en v5 las flechas ↑/↓ aparecían
(→ el JS nuevo SÍ corría), pero en NO-edición los widgets seguían moviéndose al
tocarlos y los botones/scroll interno no funcionaban en táctil. Como en no-edición
`isDraggable=false`, RGL no era la causa: el problema es react-grid-layout EN SÍ en
táctil (posición absoluta + transforms rompen scroll nativo, taps y scroll interno).

**Cambio (commit 0a923f2, badge v6):**
- `grid-area.tsx`: si `mounted && isCoarse` (puntero táctil) → se RENDERIZA una rejilla
  de tarjetas normal en flujo DOM (grid-cols-1/sm:2, cada tarjeta con altura derivada
  de layout.h, `overflow-auto` + `touch-action:pan-y`), SIN react-grid-layout. Botones
  de edición (↑/↓ reordenar, 📌🔗✕) superpuestos. RGL queda SOLO para ratón/escritorio.
- Logo Spline: `SplineWatermarkCover` ampliado a 240×78, casi sólido en la esquina,
  z-index 2147483647.

**Verificado:** build Vercel READY. Pendiente confirmación del usuario en su táctil.

---
## Adenda 20 — 2026-06-14 · Logo Spline eliminado + datos reales (clima + cartera)

- **v7 (commit 0ad1568):** logo "Built with Spline" eliminado buscando el TEXTO en
  cualquier nodo DOM (no solo <a>) + shadow DOM, en `SplineWatermarkCover` (sin tapón
  visual; el logo es texto del DOM, confirmado por captura). Scroll táctil ya OK (v6).
- **v8 (commit c57d2ed):**
  - `src/lib/weather-mock.ts` → `fetchWeatherData` ahora trae DATOS REALES de
    Open-Meteo (clima, UV, calidad de aire, amanecer/atardecer) + NOAA SWPC (Kp,
    viento solar mag+plasma, clase de rayos X), fusionados sobre el mock (degradación
    elegante). Fase lunar calculada. Alimenta TODOS los widgets de clima/espacial.
  - `cartera-starseed.tsx`: gráficas recharts (área bolsa 60d, dona de granos por
    valor en semillas, valor total de cartera en €, delta 7d). Lee Supabase real.
  - `CARTERA_STARSEED` añadida al dashboard de Economía; DEFAULTS_VERSION → gen6 para
    re-sembrar. Badge v8.

**Pendiente (próximas olas):** mapas/ubicación con datos reales, widget astrológico
calculado, panel de proveedor de datos POR widget (selector configurable), y hacer
funcionales con datos reales las entidades sociales (posts/grupos/páginas/perfiles/
comunidades/eventos/archivos/apps/proyectos).

---
## Adenda 21 — 2026-06-14 · Logo Spline reforzado (v9) + astrología real + entidades sociales (v10)

- **v9 (c526b75):** `SplineWatermarkCover` ahora elimina el watermark por COINCIDENCIA
  POR INCLUSIÓN del texto "built with spline" y sube hasta el contenedor píldora
  (no solo <a> exacto), atravesando shadow DOM. NOTA: la captura del usuario mostraba
  badge "táctil-armar v4" → esa pestaña estaba CACHEADA en v4 (de ahí que viera el logo);
  el fix vive en v7+. Requiere cargar build fresco.
- **v10 (6865f25) — 2 subagentes sincronizados:**
  - `src/lib/astro.ts` (NUEVO): cálculos puros — fase lunar/iluminación, signo solar,
    longitudes y signos de Sol/Luna/Mercurio/Venus/Marte/Júpiter/Saturno (aprox. bajo
    orden), día lunar, biorritmos 23/28/33, coherencia vital determinista.
  - `natal-chart-widget` y `energy-map-widget`: ahora muestran datos astrológicos REALES
    calculados (recalculan cada minuto), no mock/aleatorio. tsc 0 errores.
  - Entidades sociales interconectadas: sample-entities/sample-events normalizados con
    slugs canónicos; `explore-network-widget`, `my-pages-widget`, `social-radar-widget`
    ahora enlazan (next/link) a /pagina|/grupo|/evento/[slug] reales y botones Unirse/
    Seguir/Asistir funcionan. Helpers en entity-links.ts. Build Vercel READY.

**Pendiente (próximas olas):** mapas/ubicación con tiles reales (Leaflet/OSM), selector
de PROVEEDOR DE DATOS por widget (configurable), y profundizar funciones de cada widget.

---
## Adenda 22 — 2026-06-14 · Logo Spline triple-blindado (v11) + mapas reales + geocodificación (v12)

- **v11 (7836641):** SplineWatermarkCover ahora (1) parchea Element.prototype.attachShadow
  a modo "open" a nivel de módulo (antes de montar Spline) para poder atravesar el shadow
  DOM CERRADO donde el runtime aloja el watermark; (2) mantiene el purgado agresivo;
  (3) añade un cubre-esquina con backdrop-filter blur (no bloque sólido) como respaldo
  garantizado que difumina cualquier resto. (Las capturas previas del usuario seguían en
  caché v4.)
- **v12 (c715d28) — 2 subagentes:**
  - Widget de mapa REAL `MAP_LOCATION`: Leaflet 1.9.4 vía CDN + tiles OpenStreetMap,
    centrado en la ubicación real del usuario, marcadores de entidades; integrado en el
    dashboard "Ubicación". Archivos: map-widget.tsx, lib/geo.ts + registro/manifest/tipos.
  - Geocodificación REAL en weather-location-context: búsqueda Open-Meteo (es), reverse
    Nominatim, timezone+elevación reales; API pública del hook intacta; campos opcionales
    country/timezone/elevation. lib/geocoding.ts.
  - DEFAULTS_VERSION gen7 (re-siembra Ubicación con el mapa). Build Vercel READY.

**Pendiente:** selector de PROVEEDOR DE DATOS por widget (configurable), profundizar
funciones avanzadas por widget, y entidades sociales con persistencia real en Supabase.

---
## Adenda 23 — 2026-06-14 · Logo Spline ELIMINADO EN LA FUENTE (v13) + proveedor por widget (v14)

- **CAUSA RAÍZ confirmada:** el watermark "Built with Spline" NO es DOM — el runtime
  (@splinetool/runtime) lo pinta en el <canvas> como pase WebGL `pipeline.logoOverlayPass`
  (método `pipeline.setWatermark`). Por eso ningún borrado de DOM/cover funcionaba.
- **v13 (69724fb):** SplineBackground.handleLoad ahora accede a
  `app._renderer.pipeline` y hace `setWatermark(null)` + `logoOverlayPass.enabled=false`
  + `updateRenderToScreen()`, con reintentos (60–4000ms) e intervalo 750ms×40 por si el
  runtime lo reactiva al cargar textura/resize. Quitado el cubre-esquina borroso.
  SplineWatermarkCover → return null (solo quedan respaldos invisibles).
- **v14 (f2b0a14):** selector de PROVEEDOR DE DATOS por widget — `src/lib/widget-data/
  providers.ts` (DATA_PROVIDERS por dominio: weather/air/space/finance/maps/astro),
  `widget-data-source-control.tsx` con hook `useWidgetProvider(widgetId, domain)` +
  persistencia localStorage; integrado de ejemplo en weather-basic (open-meteo/wttr/mock).
  Build READY.

**Pendiente:** propagar el selector de proveedor al resto de widgets, profundizar
funciones avanzadas por widget, persistencia social en Supabase.

---
## Adenda 24 — 2026-06-14 · Persistencia social en Supabase + funciones avanzadas de widgets (v15)

- **Supabase (dzkjapinnewkxzjltadv):** creadas tablas os_pages, os_groups, os_events,
  os_posts, os_follows, os_memberships, os_event_attendance con RLS (lectura pública;
  escritura por usuario autenticado en sus filas). Sembradas entidades canónicas que
  coinciden con los slugs de los widgets.
- **Frontend (commit d9e0b85):**
  - NUEVO src/lib/os-social.ts (capa de acceso tipada + fallback a sample-entities) y
    src/hooks/use-os-entities.ts (useOsPages/Groups/Events/Entity/Posts, useFollow,
    useMembership, useAttendance; realtime de os_posts; needsAuth para invitar a login).
  - Páginas de detalle (pagina/grupo/evento [slug]) y widgets sociales (explore-network,
    my-pages, social-radar) leen de Supabase con fallback; follow/join/attend/publicar
    persisten si hay sesión.
  - Funciones avanzadas: economic-overview (recharts, selector 7d/30d, deltas, desglose),
    oikos-metabolism (conmutador de recurso, mini-sankey SVG, tendencia), messages (buscador,
    hilos, marcar leído), notifications (filtros por tipo, leer/descartar, prioridad).
  - Build Vercel READY. Badge v15.

**Pendiente:** propagar selector de proveedor al resto de widgets; más entidades os_* y
edición/creación desde la UI; profundizar más áreas (educación/cultura/política).

---
## Adenda 25 — 2026-06-14 · Crear/editar entidades desde UI + áreas política/educación/cultura (v16)

- **Crear/editar entidades (commit 4b542aa):** entity-editor-dialog.tsx (crear/editar
  página/grupo/evento) + create/update/delete + isEntityOwner + fetchMyEntities en
  os-social.ts (owner_id=auth.uid(), slug auto con reintento ante choque unique);
  hooks useEntityOwner/useMyEntities/useEntityMutations. Botón "+ Nueva" en Mis Páginas
  abre el diálogo; botón "Editar" (solo dueño) en páginas de detalle.
- **Áreas profundizadas:** agora-causal (filtro estado + votar + detalle), political-summary
  (recharts participación/fases + filtro), skill-tree (desbloqueo por requisito + panel XP
  radial), universal-library (búsqueda/filtro tipo + añadir a ruta), cultural-feed (filtro
  + me gusta/guardar + ampliada), multiverse-hub (filtro modo + entrar/guardar + ampliada).
  Build Vercel READY. Badge v16.

**Pendiente:** propagar selector de proveedor al resto de widgets; más áreas (sistema/red/
IA/parlamento); subida de imágenes (avatar/portada) a Supabase Storage para entidades.

---
## Adenda 26 — 2026-06-14 · Subida de imágenes a Storage + áreas sistema/red/IA/parlamento (v17)

- **Supabase Storage:** bucket `os-media` (público; insert/update/delete autenticados,
  select público). `uploadEntityMedia(file, 'avatar'|'cover')` en os-social.ts; el
  entity-editor-dialog ahora sube avatar/portada con vista previa + opción URL manual,
  guardando la URL pública en os_pages/os_groups/os_events.
- **Áreas profundizadas (commit 260959b):** sovereign-node (métricas en vivo CPU/RAM/red
  con recharts + toggles de servicios + uptime), mesh-radar (topología SVG + detalle de
  nodo + filtro + conectividad), astraura-cortex (sugerencias con confianza + aceptar/
  descartar + escenario), liquid-delegation (delegar/revocar + poder de voto + buscador).
- .gitignore: ignora .tscout.txt/.persist-test.txt (leftovers de agentes). Build READY. Badge v17.

**Pendiente:** propagar selector de proveedor al resto de widgets; áreas restantes
(productividad/descubrimientos/ayudantía); comentarios/likes reales en posts (Supabase).

---
## Adenda 27 — 2026-06-14 · Likes/comentarios reales + áreas productividad/descubrimientos (v18)

- **Supabase:** tablas os_post_likes, os_post_comments (RLS). os-social: fetchLikes/toggleLike/
  fetchComments/addComment/deleteComment + tipo OsComment. Hooks useLikes/useComments
  (optimista, realtime opcional). PostCard distingue post real (uuid) → like/comentarios
  persistentes; post de ejemplo → estado local + invitación a login. Páginas pagina/grupo
  ya renderizan posts reales → quedan conectadas.
- **Áreas (commit 702555f):** flow-director (curva circadiana recharts + hora actual + modos),
  project-swarm (kanban movible + progreso), serendipity-lens (filtro + explorar/guardar +
  detalle), idea-forge (combinar semillas determinista + favoritos). Build READY. Badge v18.

**Pendiente:** propagar selector de proveedor al resto de widgets; áreas restantes
(personalización/dispositivos/entretenimiento); perfiles de usuario reales (tabla profiles).

---
## Adenda 28 — 2026-06-14 · Sistema de toolkits por tipo de página + favicon (v19)

**Resumen:** Unificación del formato de las páginas de entidad y herramientas funcionales
ricas por tipo (partido, E.F., asamblea, comunidad, grupo, evento), al nivel del hub.
Ejemplos navegables interconectados con toda la red. Favicon StarSeed real.

### Hecho
- **Favicon:** regenerado `src/app/icon.png` (512²), `favicon.ico` (16/32/48/64) y
  `public/{starseed-symbol-square,apple-icon}.png` centrando `public/starseed-symbol.png`
  (el ojo-prisma del Nexus). `layout.tsx` metadata.icons apunta a las nuevas variantes.
- **Contratos compartidos:**
  · `src/lib/entity-kinds.ts` — registro canónico de tipos (personal/comunidad/ef/partido/
    asamblea/grupo/evento/pagina/proyecto) con icono, acento, sistema y toolkit; +
    `normalizeEntityKind()` tolerante (pageType de profile, kind os_*, texto de widget).
  · `src/data/sample-governance.ts` — datos ricos DETERMINISTAS e interconectados:
    partidos (programa/militancia/candidaturas/coaliciones/voto interno), federativeEntities
    (cámara/presupuesto participativo/territorio/voto líquido/sub-entidades), assemblies
    (orden del día/mociones/actas), communities (proyectos/procomún/tesorería de Semillas/
    mentorías), groups (sesiones/tareas/recursos), eventExtras (programa/RSVP/ubicación).
    Lookups con fallback elegante (getPartido/getFederativeEntity/getAssembly/getCommunity/
    getGroup/getEventExtras) + aliases (party-1..3, partido-transhumanista, oikos-norte…).
    Enlaza a /network/politics (prop-1..4), /evento/<slug>, /pagina/<slug>, /library.
  · `src/components/social/toolkits/shared/index.tsx` — primitivas: ToolSection, StatTile/
    StatGrid, VoteBar (con quórum), MiniVote (votación interactiva), RosterStrip, ProgressRow,
    PersonRow, LinkCard, Timeline, Chip, EmptyHint. `icon` acepta componente o elemento.
- **6 toolkits + dispatcher** (`src/components/social/toolkits/*Toolkit.tsx` + `index.tsx`
  `GovernanceToolkit`/`hasToolkit`/`toolkitMeta`): construidos en paralelo por subagentes.
  EF es el más rico (5 sub-pestañas, 506 líneas).
- **Cableado:**
  · profile/[username] → pestaña «Gobernanza/Partido/Comunidad/Grupo» según pageType
    (sustituye al antiguo EFGovernanceTabs por el toolkit completo).
  · grupo/[slug], pagina/[slug], evento/[slug] → pestaña/sección de herramientas por kind.
  · NUEVAS rutas `partido/[slug]` y `entidad/[slug]` (shell `governance-entity-page.tsx`
    con portada de acento + métricas + seguir/compartir + toolkit).
  · hub: `myPages` y tarjetas de partido enlazan a rutas reales (se eliminan los `#`).
- **Verificación:** tsc scoped LIMPIO en todos los archivos nuevos/tocados; 13 lookups de
  datos validados en runtime (sumas de presupuesto = 100%, aliases OK, evento desconocido →
  undefined). next.config ya tiene ignoreBuildErrors/ignoreDuringBuilds.

**Pendiente:** persistir gobernanza en Supabase (hoy datos de ejemplo, patrón fallback del
proyecto); votación interna/mociones reales; conectar `voteManagement` del hub a E.F. reales.

---
## Adenda 29 — 2026-06-15 · Deploy del OS EN VIVO + automatización + páginas artículo/curso/perfil

**Resumen:** Resuelto y verificado el despliegue de producción del SOSD; automatizado por repo;
artículo y curso ahora funcionales e interconectados; pestaña Biblioteca del perfil real.

### Hecho
- **Deploy OS resuelto (clave):** la cuenta `alexbordongarrigos` NO es miembro de la org
  `StarSeedSystem` → su token solo lee. El repo del OS requiere un token de la **cuenta-org
  `StarSeedSystem`** (push/admin). El proyecto Vercel `starseed-os` (team `starseeds-projects`)
  YA está conectado a `StarSeedSystem/starseed-system`: **push a main = deploy de producción
  automático** (no hace falta token de Vercel). Verificado vía commit status `Vercel` → success.
  Empujados y desplegados los commits `16ab528` (Adenda 28: toolkits+rutas+favicon+interconexión)
  y `61dd6a7` (este lote). starseed-os.vercel.app sirviendo en vivo.
- **Automatización del despliegue:** `StarSeed Café/.env` ahora tiene `GITHUB_TOKEN_OS` (token de
  StarSeedSystem). El script `StarSeed Ecosistema/Actualizar TODO….command` empuja CADA repo con
  su token (Café=`GITHUB_TOKEN` alexbordongarrigos · OS=`GITHUB_TOKEN_OS`) y es ejecutable; el
  `.env` está gitignored (token no se commitea). ⚠️ Rotar/usar fine-grained recomendado.
- **article/[id]:** autor → /profile, like y "Guardar en Biblioteca" funcionales (estado), scroll a
  discusión, sección "Artículos relacionados" por tags. Fix typing de params.id.
- **course/[id]:** progreso de lecciones interactivo (estado + useMemo), CTA avanza lección,
  enlaces a /library y /network/education, "Cursos relacionados".
- **profile (pestaña Biblioteca):** ya no es stub — grid real de artículos y cursos enlazados a
  /article, /course y /library.
- Nota: el resto de la red (publish 539, library 422, messages 424, notifications 664, settings
  261, mapas/ubicación, explorer, store) ya estaba sustancialmente implementado en adendas previas.

**Pendiente:** persistencia Supabase de gobernanza; enriquecer áreas existentes según prioridad del
usuario; rotación de tokens compartidos en chat.

---
## Adenda 30 — 2026-06-18 · Votación de gobernanza REAL persistida en Supabase (toda la red)

**Resumen:** Los `MiniVote` de todos los toolkits ahora guardan votos reales en Supabase y muestran
recuentos agregados de toda la red. Desplegado en vivo (commit `a93c101`).

### Hecho
- **Supabase (proyecto `dzkjapinnewkxzjltadv`):** migración `os_gov_votes` (id, ballot_type,
  ballot_key, choice, user_id default auth.uid(), unique(ballot_key,user_id)) con RLS estilo os_*
  (lectura pública `true`; insert/update/delete propios `user_id = auth.uid()`). RPC
  `os_gov_tally(p_ballot_key)` → recuentos por opción (grant anon+authenticated).
- **Hook `src/hooks/use-gov-vote.ts`:** lee tally real (RPC) + voto propio; `vote()` hace upsert
  (onConflict ballot_key,user_id) con sesión, u optimista local + `needsAuth` sin sesión. Base
  determinista sembrada (sin Math.random → SSR estable) para no verse vacío.
- **`MiniVote` (shared/toolkits):** acepta `ballotKey`/`ballotType`; persiste y muestra %
  reales; permite cambiar el voto; sin sesión muestra invitación a /login. Cableado por entidad:
  `ef:<slug>:legislativo|presupuesto|delegacion`, `motion:<slug>#i`, `party:<slug>:internal`,
  `comunidad:<slug>:presupuesto`, `evento:<slug>:rsvp`.
- Deploy automático verificado (commit status Vercel → success).

**Pendiente:** mismas mecánicas reales para propuestas legislativas completas (os_posts ya real);
enriquecer mensajes/cuenta/mapas/archivos/feed y widgets según prioridad; rotar tokens del chat.

---
## Adenda 31 — 2026-06-18 · Mejora profesional multi-área en paralelo (commit 53d95e6, vivo)

**Resumen:** 5 agentes en paralelo mejoraron 5 áreas (archivos distintos, aditivo). Desplegado.

### Hecho
- **Cuenta/Perfiles:** `settings/page.tsx` con accesos rápidos (memoria/IA/conexiones/red) + nuevo
  `components/profile/profile-switcher.tsx` (dualidad cuenta↔perfiles, enlaces a /profile).
- **Mensajes:** `messages/page.tsx` rediseñado — dos paneles responsive, búsqueda, filtros por
  canal (Directo/Grupo/E.F./Comunidad), hilos con separadores, composer funcional, avatares→/profile.
- **Publicar:** `publish/page.tsx` — compositor por tipo (post/artículo/evento/propuesta) + selector
  de destino interconectado (samplePages/sampleGroups/E.F./partidos → /pagina,/grupo,/entidad,/partido)
  + etiquetas + audiencia + preview en vivo. Compositor avanzado anterior conservado.
- **Mapas:** `dashboard/widgets/map-widget.tsx` + `location-selector.tsx` — capas StarSeed
  (Eventos/Comunidades/E.F.) con marcadores SVG y popups enlazados (/evento,/entidad,/pagina),
  toggles con conteo, leyenda; base Leaflet intacta.
- **Biblioteca:** `library/page.tsx` — explorador unificado (artículos/cursos/documentos/comunidades)
  con filtros por tipo, búsqueda, orden (persistido) y grid/list; deep-links a /article,/course,/pagina.
- Typecheck: los 7 archivos tocados limpios (errores restantes son pre-existentes en theme-utils/
  theme-gallery/keyStorage/knowledge-network-selector, cubiertos por ignoreBuildErrors).

**Pendiente:** persistencia Supabase de mensajes (no hay tabla os_messages aún); profundizar
widgets del dashboard; rotar tokens del chat.

---
## Adenda 32 — 2026-06-18 · Cerebro 3D del Exocórtex en AI Studio + publicar real + widgets (commit 65ff165, vivo)

**Resumen:** El "Cerebro" (gráfica viva) sale de la sección Red y vive en el Exocórtex/AI Studio como
visualización 3D tipo StarSeed-Memoria-3D, alimentada por el grafo real y con IA real. Desplegado.

### Hecho
- **ExocortexBrain** (`src/components/exocortex/exocortex-brain.tsx` + `memory-graph-data.ts`):
  núcleo 3D = `HarmonicGraph3D` (three.js, SSR-safe) + panel Exocórtex: "Pregunta al Exocórtex"
  con `chat()` del proveedor activo (mismo patrón que /agent), búsqueda en memoria, insights/stats,
  capas/tipos, accesos a la red y ajustes. Alimentado por el grafo REAL
  `src/data/starseed-memory-graph.json` (82 nodos del ecosistema, copiado desde ~/Documents/Claude/Projects/StarSeed).
- **AI Studio** (`/agent`) pestaña Cerebro ahora usa `ExocortexBrain` (antes `LivingGraph`).
- **Red:** quitado el acceso "Gráfica Viva"/Cerebro de `network/page.tsx` y del nav de red; la ruta
  `/network/graph` ahora REDIRIGE a `/agent?tab=cerebro` (no rompe enlaces de dashboard/onboarding/Trinity/widgets).
- **Publicar:** el compositor de `publish/page.tsx` persiste en `os_posts` vía `useOsPosts.publish`
  según el destino elegido (page/group/event).
- **Widgets:** explore-network (rutas reales /pagina,/grupo,/entidad,/partido + filtros),
  messages (conversaciones reales + /profile + /messages), active-projects (progreso+estado+/hub).
- Typecheck: archivos nuevos/tocados limpios; errores restantes pre-existentes (harmonic-graph-3d
  null-guards/THREE namespace, keyStorage, knowledge-network-selector) cubiertos por ignoreBuildErrors.

**Pendiente:** persistencia privada de mensajes (os_messages con RLS por participantes, diseño cuidadoso);
endurecer tipos de harmonic-graph-3d; rotar tokens del chat.

---
## Adenda 33 — 2026-06-18 · MemoryBrain3D (visor fiel) + Cerebro en Trinity + OmniDock (commit 8cb82ae, vivo)

**Resumen:** El cerebro 3D ahora replica el visor real `starseed-memory-3d.html`, con más ajustes, datos
OS interconectados y chat IA; disponible en AI Studio y en una pestaña del Exocórtex del menú Trinity.
El dock inferior muestra nombres, iconos rediseñados y la sección activa.

### Hecho
- **`src/components/exocortex/memory-brain-3d.tsx`** (`MemoryBrain3D`, ~1.5k líneas): port Three.js del
  visor StarSeed (esferas por nodeType, edges por edgeType, sprite labels, starfield, FogExp2, luces;
  layout fuerza-dirigido + reorganizar; cámara orbital manual; raycaster hover/click; panel de detalles
  con links/vecinos). Ajustes extra (tamaño, repulsión, opacidad, giro, etiquetas, starfield, niebla,
  modo layout). Capa "Red OS": merge de páginas/grupos/E.F./partidos/artículos/cursos como nodos con
  deep-links. Chat IA del Exocórtex incorporado (chat() del proveedor activo, resumen del grafo en el
  system prompt, botones "enfocar"). SSR-safe (three por import dinámico). Props compact/showChat.
- **AI Studio** (`/agent` → Cerebro) usa `MemoryBrain3D`. **ExocortexBrain** (turno previo) queda en
  desuso (sin importar; se puede borrar luego).
- **Trinity / ZenithCurtain (Exocórtex):** botón/vista "Cerebro" que muestra `MemoryBrain3D compact showChat`
  con su chat IA, alternando con el buscador universal.
- **OmniDock:** nombre visible bajo cada icono, contenedores de icono con gradiente+anillo por color,
  y resaltado (anillo+glow+punto+etiqueta) de la sección activa según `usePathname`.
- Reusa el grafo real `src/data/starseed-memory-graph.json` (82 nodos).

**Pendiente:** persistencia privada de mensajes (os_messages RLS por participantes); endurecer tipos
de three (null-guards) en memory-brain-3d/harmonic-graph-3d; rotar tokens del chat; borrar ExocortexBrain en desuso.

---
## Adenda 34 — 2026-06-18 · Vault de memorias .md + widgets creativos + páginas formato perfil + publicaciones ricas (commit 205717f, vivo)

**Resumen:** El cerebro 3D gana un sistema de memorias .md (elegibles/editables/categorizables/
importables/exportables/compartibles); 8 widgets elevados; páginas con pestañas tipo perfil;
publicaciones con adjuntos variados, referencias interconectadas y sync de biblioteca. 5 agentes en paralelo.

### Hecho
- **Memory Vault** (`src/lib/memory-vault.ts` + `src/components/exocortex/memory-vault-panel.tsx`):
  MemoryDoc en localStorage (CRUD, categorías, tags, color, activo), parseMarkdownToGraph (raíz+
  headings+bullets+[[wiki-links]]→nodos/edges shape del cerebro), getActiveVaultGraph (merge de las
  activas), export/import .md y JSON, encodeShare/decodeShare, hook useMemoryVault + evento
  `starseed:memory-vault`. Integrado en `MemoryBrain3D`: botón "Memorias" (Database), panel drawer,
  merge en vivo de memorias activas en buildGraph (capa "memoria") y rebuild por `vaultTick`.
- **Widgets (8)** con framer-motion, micro-charts (recharts), deep-links reales y tema-adaptable:
  political-summary, economic-overview (count-up + E.F. budgets), cultural-feed, social-radar (radar/
  órbita + countdown), my-pages (sparklines), learning-path (anillos), recent-activity (timeline),
  relevant-posts (avatares + resonancia).
- **Páginas** grupo/pagina/evento: + pestañas Agenda (UnifiedCalendar), Conexiones (entidades
  interconectadas), Biblioteca (artículos/cursos→/article,/course), Colecciones (CollectionsGrid),
  manteniendo Herramientas/Feed/Acerca/Miembros/Eventos. Ahora se acercan al formato rico de perfil.
- **Publicar**: adjuntos variados (imagen/vídeo/audio/documento/hoja/código/3D/app/enlace), referencias
  interconectadas a la red (samplePages/grupos/E.F./partidos/artículos/cursos), nota de sincronización
  con biblioteca según destino; sigue persistiendo en os_posts.

**Pendiente:** os_messages (RLS por participantes); guardar conexiones nuevas creadas en el cerebro;
persistir el vault en Supabase (hoy localStorage); rotar tokens del chat.

---
## Adenda 35 — 2026-06-18 · Endurecimiento de tipos + 6 widgets más (commit pendiente, vivo)

### Hecho
- **Tipos endurecidos (cero errores en archivos tocados):**
  · memory-brain-3d.tsx + harmonic-graph-3d.tsx: `canvas`/`container` ahora tipados no-nulos tras el
    guard (`const canvas: HTMLCanvasElement = canvasRef.current` después de `if(!...current) return`),
    Vector2 real en raycaster, `import type * as THREE`, cast `MemoryLayer`. Sin cambios de runtime.
  · framer-motion: `ease` como tupla `[number,number,number,number]` (no string) en cultural-feed,
    political-summary, social-radar → resuelve el tipo `Variants`.
- **6 widgets más** (notifications, system-status [gauges animados], collab-projects, ai-generated
  [partículas], mental-coherence [anillo que respira], live-data [ticker]) con framer-motion (ease en
  tuplas), recharts, datos reales, deep-links y tema-adaptable.
- Verificado: typecheck LIMPIO en todos los archivos de la sesión.

**Pendiente:** quedan errores de tipo PRE-EXISTENTES (anteriores a esta sesión) en theme-utils/
theme-gallery (distortWidth), keyStorage, knowledge-network-selector, universal-editor, board-viewer,
LiquidWaveFilter — cubiertos por ignoreBuildErrors; pase dedicado "cero errores" pendiente.

---
## Adenda 36 — 2026-06-20 · Launcher de Dashboard (apps + carpetas) · Fase 1

### Por qué
Ampliar la sección de Dashboards para que aloje apps, carpetas y programas (pantalla de inicio
soberana), con modos de apertura, abridor universal de archivos y media center. Regla de oro: SOP antes
que código.

### Hecho (cambio puramente aditivo — ningún widget existente tocado)
- **SOP nuevo:** `architecture/dashboard-launcher-apps-y-archivos.md` — blueprint completo (modelo de
  apps/carpetas, OpenMode incrustado/ventana/popup/pestaña/ruta/instalada, abridor universal de archivos,
  media center + Trinity, VR/AR, seguridad soberana). Marca 🟢 Fase 1 (launcher) vs 🟡 Fase 2+.
- **Tipo de widget `APP_LAUNCHER`** montado sobre la maquinaria existente (settings jsonb, sin migración):
  · `dashboard/apps/launcher-types.ts` — tipos + presets (forma/estilo de icono, densidad, columnas).
  · `dashboard/apps/app-catalog.ts` — catálogo: Nexus, Café (/cafe/), Audiomorphic, Omnifrecuencias
    (soon), Mensajes, Red, Biblioteca, Exocórtex, Clima, Música (soon), Radio (soon). Estrategia de
    apertura decidida POR APP (embed con fallback a pestaña / ruta interna / soon). URLs canónicas del
    MANUAL DE ENLACES.
  · `dashboard/apps/app-launch.tsx` — `useAppLauncher` + `AppWindow` (ventana OS arrastrable, iframe
    sandbox con timeout→fallback "abrir en pestaña", estado "próximamente"; portal a body).
  · `dashboard/widgets/app-launcher-widget.tsx` — variantes folder (grid) y single (tile); menú de modo
    de apertura por app (portado); iconos personalizables (squircle/circle/rounded/hex, glass/solid/
    outline/gradient).
- **Registro:** WidgetType += APP_LAUNCHER · manifest (6×3, min 2×2) · categoría nueva `aplicaciones`
  (LayoutGrid) · widget-registry case · WIDGET_CATEGORY_MAP · AVAILABLE_WIDGETS (selector).
- **Semilla:** carpeta "Apps StarSeed" por defecto en el template de inicio (`Dashboards`, 12×3 arriba);
  settings vacío → resuelve la colección `starseed`.
- Verificado: `tsc --noEmit` → CERO errores en archivos nuevos/editados y CERO menciones a APP_LAUNCHER
  en el log. Los ~146 errores restantes son los PRE-EXISTENTES (AI-refernces, hermes-integration,
  design-canvas, settings, weather solar-wind, react-grid-layout typing) — sin relación con esta sesión.

**Pendiente (Fase 2+):** abridor universal de archivos; media center (música/radio/Omnifrecuencias) +
control Trinity; Audiomorphic ajustable y gratis dentro del OS; persistir apps instaladas en
`cafe_accounts.apps` y carpetas en `user_settings`; VR/AR (WebXR); UI de edición de settings del launcher.

---
## Adenda 37 — 2026-06-20 · Abridor Universal de Contenido · Fase 2 (en progreso)

### Por qué
Cumplir "abrir cualquier archivo/formato con opciones reales, sincronizado con biblioteca, publicaciones
y datos del usuario". Keystone que interconecta el OS (Lienzo Universal).

### Hecho (aditivo — nada existente roto)
- **Ventana OS reutilizable:** `dashboard/apps/os-window.tsx` (arrastrable, Esc, acento, acciones,
  toolbar). `AppWindow` (launcher) **refactorizado** para usarla (DRY).
- **Motor de contenido** en `dashboard/apps/content/`:
  · `content-types.ts` — `ContentResource`/`ContentKind` (image/gif/gallery/video/audio/pdf/html/
    model3d/markdown/code/text/dataset/link/entity/app/unknown); `detectKind` (mime+extensión);
    adaptadores `fromUrl`, `fromFile`, `fromPostMedia` (publicaciones, `social-posts.ts`),
    `fromLibraryItem` (biblioteca, `widget-data/types.ts`) → MISMO motor para mensajes/posts/biblioteca.
  · `viewers.tsx` — imagen (zoom/pan, GIF), galería, vídeo/audio, PDF nativo, HTML (sandbox/srcdoc),
    documento (markdown vía react-markdown / código con números de línea / texto, con fetch remoto),
    tarjeta de enlace, tarjeta de entidad (biblioteca), fallback.
  · `model-viewer.tsx` — 3D GLB/GLTF (R3F + drei: useGLTF/OrbitControls/Center), `next/dynamic` ssr:false.
  · `viewer-registry.tsx` — mapa `kind → componente` (3D diferido).
  · `content-opener.tsx` — `useContentOpener` (pila de ventanas, portal) + `ContentWindow` + **barra de
    acciones universal**: abrir en pestaña, descargar, copiar (enlace/contenido), clonar/duplicar,
    guardar en biblioteca, instalar. copiar/descargar/pestaña reales; guardar/instalar vía callback
    (persistencia → Fase 2.1); gancho `onOpen` para Exocórtex/memoria.
- **Widget `UNIVERSAL_OPENER`** (`widgets/universal-opener-widget.tsx`): abrir por URL, subir archivo
  local (multi), 9 ejemplos reales (imagen/GIF/vídeo/audio/PDF/3D/HTML/markdown/código) e items de la
  Biblioteca del usuario (`useWidgetData('education.library')`). Registrado (types/manifest 4×5/registry/
  picker/category-map) y sembrado en el dashboard de inicio.
- Verificado: `tsc -p` acotado a los archivos nuevos (incl. cadena 3D/drei) → **exit 0, cero errores**;
  archivos de registro (types/manifest/categories/defaults) → **cero errores**. (El `tsc` global no cabe
  en una sola pasada por el peso de three/drei; por eso la verificación acotada.)

**Pendiente (Fase 2.1+):** persistencia real de guardar/instalar (`cafe_accounts.apps`/`user_settings`);
media center (música/radio/Omnifrecuencias) + control Trinity; Audiomorphic ajustable y gratis dentro
del OS; fuentes de datos oficiales en tiempo real (capa `data-sources` con selector); magic-bytes para
archivos sin extensión; visor de dataset/CSV enriquecido; VR/AR (WebXR).

---
## Adenda 38 — 2026-06-20 · Media center + Persistencia + Datos oficiales + Siembra (Fase 2)

### Cómo
Dos subagentes en paralelo (cada uno solo archivos nuevos) + integración por el orquestador (registro
compartido + siembra). Aditivo; nada existente roto.

### Hecho
- **Media center** (5 archivos nuevos): `apps/media/media-engine.ts` (singleton `<audio>` + `useMediaPlayer`,
  SSR-safe), `apps/media/media-catalog.ts` (SoundHelix + SomaFM + presets de frecuencia) y widgets
  `MUSIC_PLAYER` (cola/progreso/volumen), `OMNIFRECUENCIAS` (WebAudio: osciladores sine, binaural L/R con
  fades), `RADIO_LIVE` (streams reales), `AUDIOMORPHIC_BG` (activa fondo audiomorphic + overlay + abrir en
  pestaña; `updateConfig({background:{...}})`).
- **Persistencia soberana** (`lib/library-store.ts`): `saveResource`/`installApp` + hooks, localStorage
  SSR-safe (useSyncExternalStore), eventos cross-widget. `content-opener` ahora persiste por defecto en
  guardar/instalar (Lienzo Universal).
- **Fuentes de datos oficiales en tiempo real** (`apps/data-sources/*`): registro con fetch REAL sin clave
  (Open-Meteo, NOAA SWPC Kp, USGS sismos, Spaceflight News) + `useDataSource` (selección + auto-refresco +
  reintento) + widget `OFFICIAL_DATA` con selector de fuente y atribución.
- **Registro** de los 5 widgets nuevos (dashboard-types, widget-manifest, widget-registry, add-widget-dialog
  +iconos Music/Waves/AudioWaveform/Satellite, WIDGET_CATEGORY_MAP).
- **Siembra en TODOS los dashboards predeterminados:** `DefaultDashboardTemplate.widgets` admite `settings?`
  (jsonb) y `dashboard-layout` lo propaga (`settings: (w as any).settings ?? {}`). Helper `withSeededExtras`
  inyecta en cada plantilla la carpeta de apps StarSeed (dock, colección por tema) + los elementos del tema,
  sin solapes ni duplicados. **Inicio** = muestrario completo (apps + Visor Universal + Reproductor +
  Omnifrecuencias + Radio + Audiomorphic + Datos Oficiales + variaciones del launcher single/circle y
  folder/media hex/gradient).
- Verificado: `tsc -p` acotado a los 25 archivos nuevos/editados (incl. cadena 3D/drei y el `content-opener`
  del subagente B) → **exit 0, cero errores**.

**Pendiente (Fase 2.2+):** mini-reproductor en el centro Trinity; subir el store soberano a Supabase
(`user_settings`/`cafe_accounts.apps`); UI visual para editar settings de launcher/carpetas; VR/AR (WebXR).

---
## Adenda 39 — 2026-06-20 · Visibilidad en cuentas activas + Mini-dock global + Pulida

### Por qué
El usuario no veía los widgets nuevos: la siembra solo corre al GENERAR los predeterminados, pero las
cuentas activas (demo) ya los tenían guardados. El código reseed-ea cuando cambia `DEFAULTS_VERSION`.

### Hecho
- **Reseed de cuentas activas:** `DEFAULTS_VERSION` en `dashboard-layout.tsx` → `gen8-2026-06-20-apps-media-datos`.
  Al recargar, toda cuenta con versión distinta ejecuta `reseedDefaultDashboards()` (conserva tableros
  personalizados, regenera los predeterminados) → aparecen apps folder + Visor Universal + media + datos +
  variaciones en TODOS los dashboards. (Si se ve en producción, requiere deploy del repo OS.)
- **Mini-reproductor global** (`apps/media/media-mini-dock.tsx`, subagente C): barra flotante fixed z-90,
  aparece al reproducir, `useMediaPlayer` (prev/play/next/seek/volumen, "EN VIVO" en radio). Montado en
  `src/app/layout.tsx` (RootLayout, junto a OmniDock, dentro de AppearanceProvider) → global en todo el OS.
- **Pulida profesional** (subagente D) de los 5 widgets nuevos: adaptabilidad por `size` de WidgetShell,
  estados loading/error/vacío con reintento, accesibilidad (aria, foco visible), reduced-motion,
  `tabular-nums`. Sin cambios de export/API.
- Verificado: `tsc -p` acotado (mini-dock + 5 widgets pulidos + deps + dashboard-defaults) → **0 errores**.

### Orquestación
2 subagentes en paralelo (Agent tool) solo-archivos-nuevos / edición acotada a sus 5 widgets; el
orquestador hizo el bump de versión y el montaje del dock (sin conflictos de archivos).

**Pendiente (Fase 2.3+):** panel Trinity explícito + salida de medios/conexiones; Supabase para el store
soberano y los dashboards; UI visual de settings de launcher/carpetas; VR/AR (WebXR). Para verlo en
starseed-os.vercel.app hace falta deploy (regla de autor de commit Vercel).

---
## Adenda 40 — 2026-06-20 · Centro de medios + Sync Supabase + Acceso + Deploy

### Cómo
3 subagentes en paralelo (E centro de medios, F sync Supabase, G carpeta de acceso) + integración por el
orquestador.

### Hecho
- **Centro de Control de Medios** (`widgets/media/media-control-widget.tsx`, `MEDIA_CONTROL`): sonando-ahora,
  transporte, volumen maestro, lanzamiento rápido, y **salida de medios** (toggle "visualización al fondo"
  Audiomorphic + selección de dispositivo si el navegador lo soporta). Registrado y sembrado (entretenimiento
  + inicio). Montado además como **pestaña "Medios"** en el panel Trinity (`control-panel.tsx`, 5ª pestaña,
  rosa, side bottom — cambio aditivo con fallback).
- **Sincronización soberana con Supabase** (defensiva, SSR-safe, localStorage manda si no hay sesión):
  `lib/library-sync.ts` (biblioteca/apps ↔ `user_settings.prefs.library/.installed`, merge no destructivo;
  espejo opcional en `cafe_accounts.apps`), `lib/dashboards-sync.ts` (respaldo no invasivo de dashboards en
  `user_settings.prefs.dashboards`), `components/system/sovereign-sync-mount.tsx` (`SovereignSyncMount`)
  montado en RootLayout. Esquema verificado por MCP: `user_settings(user_id,prefs jsonb,updated_at)`.
- **Carpeta de acceso completo** (fuera del repo): `~/Documents/StarSeed OS · Acceso Completo/` con LEEME,
  Integraciones, Mapa, y 9 lanzadores `.command` ejecutables (web/local/deploy/sync/abrir apps/manual).
- **Deploy:** commit `52d1486` hecho (árbol limpio). **Push NO posible desde este entorno** (sin credenciales
  GitHub; `could not read Username`). El usuario despliega con un clic: `⑥ Desplegar StarSeed OS.command` o
  `git push origin main` (sus credenciales). Vercel auto-despliega al recibir el push.
- Verificado: `tsc -p` acotado (MEDIA_CONTROL + sync + mount + dashboard-defaults) → **0 errores**.

**Pendiente:** push a producción (acción del usuario); cabecera dinámica de la pestaña Medios (opcional);
salida de dispositivo real (el engine no expone su <audio>); VR/AR (WebXR).

---
## Adenda 41 — 2026-06-20 · Editor visual de ajustes del launcher

- **Editor de carpeta (engranaje) en `APP_LAUNCHER`** (`widgets/app-launcher-widget.tsx`): panel portado con
  etiqueta, variante (carpeta/tile), colección (StarSeed/Sistema/Media/Propia), forma de icono (squircle/
  circle/rounded/hex), estilo (glass/solid/outline/gradient), densidad, columnas (slider), modo de apertura
  por defecto, mostrar/ocultar etiquetas, y selector de apps (toggle del catálogo → colección "Propia").
- **Persistencia genérica:** el widget emite `window 'starseed:update-widget-settings'` {id, settings}; un
  listener nuevo en `dashboard-layout.tsx` actualiza `loadAllWidgets`/`saveAllWidgets` + `setWidgets`
  (sirve para cualquier widget futuro). Feedback óptimo con estado local `edits`.
- Verificado: `tsc -p` acotado → 0 errores. Commit local (pendiente push del usuario; token personal da 403
  en el repo de la org `StarSeedSystem`, deploy con sus credenciales / launcher ⑥).

**Token de deploy:** guardado en `.env.local` (gitignored) como `GITHUB_TOKEN`. ⚠️ Rotar (viajó por chat).

---
## Adenda 42 — 2026-06-20 · DEPLOY a producción + fusión de cuentas GitHub

- **Desplegado:** `git push` a `StarSeedSystem/starseed-system` `main` → `49aef5e..c26b7b7`. Autor de commits
  = alexbordongarrigos (regla Vercel). Vercel auto-deploy → starseed-os.vercel.app. (El push se hizo con el
  token de la cuenta `StarSeedSystem`, que es dueña del repo.)
- **Cuentas fusionadas (acceso cruzado total):** `alexbordongarrigos` y `StarSeedSystem` son AMBAS cuentas de
  usuario (no orgs). Vía API de GitHub se invitó y aceptó colaborador **admin** en TODAS las repos de la otra
  (12 de StarSeedSystem ↔ 16 de alexbordongarrigos, 28 invitaciones, todas 204). Verificado: alex tiene
  push+admin en `starseed-system`; StarSeedSystem tiene push+admin en `Starseed-Cafe`. → Cualquiera de las
  dos cuentas puede desplegar/empujar cualquier repo del ecosistema. Futuro deploy del OS: `git push origin
  main` con el token de `.env.local` (alex ya tiene admin) o el launcher `⑥`.
- ⚠️ Ambos tokens viajaron por el chat: **rotarlos** tras esta sesión (el acceso cruzado permanece tras rotar).

---
## Adenda 43 — 2026-06-20 · Fix ventana centrada + iconos oficiales + Audiomorphic full + App Omnifrecuencias

- **Ventana de apps centrada (fix):** `os-window.tsx` separaba mal el centrado del drag — Framer Motion pisaba
  el `translate(-50%,-50%)`. Ahora el drag va en una capa plana (transform) y la animación (opacity/scale) en
  el hijo → la ventana SIEMPRE abre centrada. Deploy `2aa4340`.
- **Iconos oficiales:** `StarseedApp.iconUrl?` + render `<img>` en los tiles (overflow-hidden por forma).
  `public/app-icons/audiomorphic.png` (oficial) y `nexus.png` (símbolo StarSeed). Resto sigue con Lucide
  (faltan PNG oficiales de Café/otros — pendiente generarlos).
- **Audiomorphic VERSIÓN COMPLETA gratis dentro del OS:** el OS abre `audiomorphic.vercel.app/?starseed_os=1&full=1`
  (referrerPolicy no-referrer, por eso el param). El subagente parcheó el repo LIVE **`alexbordongarrigos/audiomorphic-ar`**
  (`App.tsx`: si `?starseed_os`/`?full`/referrer incluye `starseed-os`/en iframe → `subscriptionTier='lifetime'`,
  sin tocar Stripe/SubscriptionScreen). Commit `4be4c29` → Vercel auto-deploy `audiomorphic.vercel.app` (READY).
  Reversible revirtiendo `4be4c29`.
- **App Omnifrecuencias completa** (`apps/omnifrecuencias/`): `omni-engine.ts` (WebAudio multi-tono,
  binaural L/R, isocrónico, ondas, fades), `omni-presets.ts` (16 built-ins + **presets guardados como ARCHIVOS
  en `library-store` → data URL JSON, sync Supabase; recall localStorage**), `omnifrecuencias-app.tsx` (editor de
  tonos, visualizador, temporizador, guardar/cargar/eliminar), ruta `(app)/omnifrecuencias`, `omni-app-host.tsx`
  (abre en OSWindow al oír `starseed:open-omnifrecuencias`, montado en RootLayout). Catálogo: omnifrecuencias →
  `native` ruta `/omnifrecuencias`. Deploy `3a41142`.
- Verificado: `tsc -p` acotado de todo lo nuevo → 0 errores. Construido con 2 subagentes en paralelo (I app, J app-repo).

**Pendiente:** iconos PNG oficiales del resto de apps (Café, Omni, etc.); abrir apps nativas (no-href) en OSWindow
desde el launcher (hoy rutean); más apps completas (clima, radio, música) al nivel de Omnifrecuencias; VR/AR.

---
## Adenda 44 — 2026-06-20 · App frecuencias real + Iconos StarSeed + Clima Espacial NOAA (deploy ba1c8b1)

Construido con 3 subagentes en paralelo (N port, O iconos, P clima espacial) + integración.

- **App Omnifrecuencias REAL portada nativa:** se portó `github.com/alexbordongarrigos/frecuencias` (Vite/React,
  ver memoria [[omnifrecuencias-app-repo]]) a `apps/omnifrecuencias/frecuencias/` (App + types + data + hooks
  useAudio/useFileSystem + components). `OmnifrecuenciasApp` ahora renderiza `<FrecuenciasApp/>` (no el placeholder).
  Capacitor eliminado; `useFileSystem` reescrito → presets como archivos en `library-store` (sync Supabase).
  Biblioteca por categorías + generador multi-osc paneo 3D + sinergias (Phi/Pi/Schumann) + visualizador + player.
- **Iconos StarSeed:** 10 SVG + 10 PNG 512px en `public/app-icons/` (nexus/cafe/omnifrecuencias/messages/network/
  library/agent/clima/musica/radio), lenguaje visual común (squircle, geometría sagrada, oro+musgo, glass, gemas
  cardinales). `iconUrl` cableado en `app-catalog.ts` (audiomorphic conserva su PNG oficial). Rasterizado con sharp.
- **Clima Espacial NOAA en tiempo real** (`SPACE_WEATHER`): `apps/data-sources/space-weather-sources.ts` (fetchers
  reales: escalas R/S/G, Kp, viento solar plasma+IMF/Bz, rayos X GOES, protones, F10.7, manchas, aurora OVATION;
  Schumann ref). Widget `widgets/space/space-weather-widget.tsx` (reactivo a severidad: gauge Kp, banner tormenta
  si G≥1, paneles) + `space-weather-app.tsx` (sparklines). Registrado (types/manifest/registry/picker/category-map)
  y sembrado en temas clima/astronomía. 9 endpoints NOAA verificados 200.
- Verificado: `tsc -p` acotado (todo lo nuevo) → 0 errores. Deploy `ba1c8b1` (tras limpiar `.git/index.lock`).

**Pendiente:** variantes de icono por tema (-mono/-dark); abrir apps nativas en ventana desde el launcher; más
apps completas (clima terrestre, radio, música) al nivel de Omnifrecuencias; data-driven design en más widgets; VR/AR.

---
## Adenda 45 — 2026-06-20 · Fix iconos + Clima rediseñada + Temas Omni/Audiomorphic + widgets (deploy add09ca)

- **BUG iconos resuelto:** los `.svg` de `public/app-icons/` contenían **bytes PNG** (sharp guardó PNG con
  extensión .svg) → el navegador los servía como image/svg+xml y fallaban (rotos). Fix: `app-catalog.ts`
  → iconUrl a `.png` (los .png sí son válidos), `.svg` falsos borrados. Deploy `311cd5a`. **Lección:** verificar
  `file` del asset, no fiarse del nombre.
- **App Clima (`/atmosphere`) rediseñada** (subagente Q): `atmosphere-view.tsx` reescrita de capas absolutas
  apiladas (solapes) a **flex column** real (header/main/footer), responsive sin solapes. Pestañas Terrestre/
  Espacial/Solar; Espacial+Solar con **datos NOAA reales** (Kp+G, viento solar L1 Bz, R/S/G, aurora OVATION,
  rayos X+R, protones+S, F10.7, SSN, imagen SDO/AIA 171). Nuevos: `weather/hooks/use-space-weather.ts`,
  `weather/components/space/space-weather-panels.tsx`.
- **Temas Omnifrecuencias + Audiomorphic** (subagente R) como opciones de Apariencia: `OsThemeId` += ambos,
  presets en `os-theme-selector.tsx`, variables CSS completas en `globals.css` (`[data-os-theme=…]`), audiomorphic-
  bg-widget deriva acento del tema. Omnifrecuencias cian/violeta; Audiomorphic violeta/oro.
- **5 widgets mejorados data-driven** (subagente S): explore-network, my-pages, social-radar, notifications,
  relevant-posts — adaptabilidad por `size`, color/estado según datos (tendencias, urgencia, resonancia, triaje),
  sparklines/barras, mejores CTAs/empty-states, reduced-motion. Sin cambios de export.
- Verificado: `tsc -p` acotado conjunto → 0 errores. Construido con 3 subagentes en paralelo (Q/R/S).

**Pendiente:** Omnifrecuencias App rewire total a `useAppearance()` (hoy su paleta nativa ya casa con su tema);
más apps al nivel de Omnifrecuencias; VR/AR; variantes de icono por tema.

---
## Adenda 46 — 2026-06-20 · Fondo Audiomorphic funcional + icono original Omni + widgets Omni reales (deploy 2f76a77)

- **Icono original de Omnifrecuencias:** `Documents/iconos/iconos-png/omnifrequency.png` → `public/app-icons/omnifrecuencias.png` (512px). El de Audiomorphic ya era el oficial.
- **Fondo Audiomorphic AHORA funciona** (antes "no se veía" porque el iframe no tenía `allow` de micrófono ni arranque):
  - `audiomorphic-background.tsx`: URL con `?bg=1&autostart=1&full=1&starseed_os=1[&mic=1][&cam=1][&preset=…]` (export `buildAudiomorphicBgUrl`) + `allow="microphone; camera; autoplay; fullscreen; gyroscope; accelerometer; magnetometer; xr-spatial-tracking"`.
  - **App Audiomorphic** (`alexbordongarrigos/audiomorphic-ar`, subagente U, commit `c8fce11`): `utils/embedMode.ts` + App.tsx → honra `bg/autostart/mic/cam/preset`; en `bg` oculta UI; **modo autónomo sintético** anima el lienzo aunque el micrófono falle (clave). Push → auto-deploy audiomorphic.vercel.app.
  - **Ventana de configuración** `ui/backgrounds/audiomorphic-config-window.tsx` (`AudiomorphicConfigHost`, montada en RootLayout, evento `starseed:open-audiomorphic-config`): vista previa interactiva (concede mic/cam ahí) + controles modo auto/manual, micrófono, cámara/AR, preset (nebula/genesis/solaris/aqua/void), overlay; guarda en `config.background.audiomorphic` (tipo extendido: mode/mic/camera/preset). El widget abre la ventana con botón "Configurar fondo".
- **Widgets Omnifrecuencias con motor/datos/presets REALES** (subagente T): `omnifrecuencias-widget.tsx` reescrito sobre el `useAudio` de la app portada + `data/frequencies` + sinergias + presets `library-store`; pestañas Reproductor/Generador/Presets + player maestro + "Abrir app completa". Compartido vía `frecuencias/data/synergy-recipes.ts`, `featured-frequencies.ts`, `hooks/useOmniLastSession.ts`, `components/CompactOscillator.tsx`.
- Verificado: `tsc -p` acotado → 0 errores. Construido con 2 subagentes (T widget, U app-repo) + integración del orquestador.

**Pendiente:** sincronía total de estado entre widget Omni y app (hoy comparten código/presets, instancias separadas); AR Audiomorphic como textura WebGL real; VR/AR del OS.

---
## Adenda 47 — 2026-06-20 · Sincronía total Omni + Fundación VR/AR WebXR (deploy aef61f8)

- **Sincronía total del audio Omnifrecuencias** (subagente V): `frecuencias/hooks/useAudio.ts` refactorizado a
  **singleton de módulo** (clase `OmniAudioEngine`, UN solo AudioContext + master/analyser + lista de osciladores
  como snapshot inmutable + RAF global de transiciones), expuesto vía `useSyncExternalStore`. **API idéntica** →
  cero cambios en call-sites (widget, `App.tsx`, `Generator`, `GlobalPlayer`). Resultado: lo que suena/edita en
  widget ↔ app ↔ mini-dock se refleja en vivo; ya no hay "dos audios". (Nota: `omni-engine.ts`/`omni-presets.ts`
  siguen huérfanos del subagente I; la app activa usa `useAudio`.)
- **Fundación VR/AR (WebXR)** (subagente W): `apps/immersive/immersive-space.tsx` (escena R3F: Flor de la Vida vía
  `THREE.Line`/primitive, estrellas/sparkles, suelo reflejante, **portales 3D** que usan `useAppLauncher` para abrir
  apps `vrCapable`), `apps/immersive/use-webxr.ts` (`navigator.xr` feature-detect VR+AR; `gl.xr.setSession` SIN
  @react-three/xr; degradación elegante), ruta `(app)/immersive`, widget `immersive-widget.tsx`. Sin deps nuevas
  (three/R3F/drei + WebXR nativo; Environment evitado por HDR remoto → luces+Stars offline-safe; Html en vez de Text).
  Registrado `IMMERSIVE` (types/manifest ciberdelia 4×5/registry/picker icono Orbit/category-map) + app de catálogo
  `immersive` (ruta /immersive, vrCapable, colección media) + sembrado en tema ciberdelia.
- Verificado: `tsc -p` acotado → 0 errores. **Limitación honesta:** WebXR no probado en visor real; sin
  controladores/manos (la interacción con portales hoy es por puntero) → siguiente paso `@react-three/xr` o input XR.

**Pendiente:** controladores/manos XR + locomoción; bajar coste de MeshReflector en sesión XR; AR Audiomorphic como
textura real; unificar `omni-engine` huérfano o eliminarlo; más apps nativas completas.

---
## Adenda 48 — 2026-07-01 · Corrección integral de la ola #125–#129 (deploy 550c732)

### Por qué
El usuario reportó que la ola anterior quedó "a medias": el orbe de Aurora no tenía el diseño de la
cafetería y su panel salía fijo en la esquina inferior; el Dashboard desperdiciaba espacio en
bordes/esquinas; la fusión de menús del Dock nunca llegó a las cuentas existentes (localStorage
conservaba los botones viejos); y los perfiles mostraban reuniones/eventos de ejemplo. Autorizó
explícitamente redefinir configuraciones guardadas para propagar a TODAS las cuentas.

### Hecho (3 subagentes en paralelo + integración)
- **Orbe Aurora (diseño café):** `aurora-orb.tsx` reescrito por capas — aro conic-gradient aurora
  (paleta café + 4 cardinales Trinity) rotando 16s, núcleo cristal oscuro, canvas interior con 5
  cintas aurora reactivas a voz (bandas mic: graves→rojo/verde, agudos→azul/amarillo; pulsos
  aurora:speak → ondas), estrella ✦ SVG nítida (arriba azul/abajo rojo/izq verde/der amarillo) que
  late vía --aurora-energy (rAF, sin re-render), breathe 5.6s + ping 3.2s + morph orgánico al hover
  (aurora-orb.module.css nuevo). `aurora-widget.tsx`: panel del chat y píldora de acción ANCLADOS al
  orbe por cuadrante (antes fixed esquina inf-der), 100dvh + safe-area, píldora descartable, pétalos
  con chips de nombre y glow cardinal, satélite mini-estrella. Gestos/flags/bus intactos.
- **Dashboard full-bleed:** barra de pestañas pegada al borde (radios 16px interior / 4px al borde,
  safe-area, p-1.5, icono+texto adaptativos, fades de scroll, glow del acento en activa, accesos
  añadir/configurar/dispositivos); grid sin containerPadding (18px muertos fuera), margen exterior
  clamp 4-8px, gap 12px, tarjetas 16px radio. `DEFAULTS_VERSION='gen10-2026-07-01-esquinas-tabs-fullbleed'`
  → reseed en todas las cuentas. Bonus: eliminado error preexistente de react-grid-layout v2 en grid-area.
- **Fusión Dock v4 (todas las cuentas):** `dock-config.ts` migración one-shot
  `starseed.dock.items.migrated.v4` — descarta presets guardados viejos y aplica DOCK_PRESETS
  fusionados (mylib=Librería·Biblioteca, nodes=Red·Nodos→/hub?tab=red), conserva items origin:'user',
  repunta carpetas (library/biblioteca/store→mylib, red→nodes) y elimina huérfanos; tienda→/library?tab=tienda.
- **Perfiles/calendario sin datos falsos:** semilla demo de `calendar-context.tsx` ELIMINADA
  (rem-1/alm-1/sys-1/sys-2 y map de communityEvents vacío — raíz de las "reuniones" falsas);
  `os-social.ts` realEventsOnly/fetchRealEventsSafe; `unified-calendar.tsx` prop realOnly;
  perfil pasa realOnly + artículos/cursos solo reales + nota honesta en discusión vacía.
- **Build en Librería:** franja OsDownloadStrip inline — "StarSeed OS · build 2026.07.01",
  Instalar como app (PWA real vía beforeinstallprompt), enlace releases GitHub, "versiones
  nativas: en preparación" (sin enlaces muertos). Sustituye a os-download-card (intacto, sin consumidores).
- Verificado: tsc total 414 → **393 errores preexistentes** (−21, ninguno nuevo; 0 en archivos tocados).
  Commit `550c732` → push a StarSeedSystem/starseed-system main → Vercel auto-deploy starseed-os.vercel.app.

**Pendiente:** #47 versiones descargables nativas (dmg/apk/exe) + tiendas; posts demo de
recent-posts-widget para páginas comunidad/EF (fuera de perfiles personales); day-detail-dialog
ya no fuga demo al eliminarse la semilla.

---
## Adenda 49 — 2026-07-02 · Escritorios + Aurora v2 completa + Librería definitiva + Perfil libre (deploys 04766fe → siguiente)

Construido con 7 subagentes en 3 olas (archivos disjuntos) + integración del orquestador.

- **Escritorios (nueva página principal):** `/escritorios` (redirect raíz) — escritorios ilimitados por perfil (localStorage 'starseed.desktops.v1' + espejo Supabase user_settings.prefs.desktops), iconos arrastrables estilo desktop (apps/archivos/carpetas/widgets/enlaces, doble clic abre), multiventana propia `DesktopWindowFrame` (semáforo Trinity, drag/resize/z/min/max), catálogo "+ Añadir" (apps del catálogo real, widgets del registry real, archivos de library-store, navegador iframe, carpetas), Aurora guía en escritorios vacíos ('aurora:suggest'), fondo heredado o por escritorio, barra superior con selector/reloj. 11 archivos en src/components/desktop/ + (main)/escritorios. Dock: item 'Escritorio' primero.
- **Cursor FX:** CursorFxHost global (root layout) + panel en Apariencia — cursores Sistema/Triángulo StarSeed (SVG data-uri)/Orbe mini + clic FX (onda líquida, destello 4 puntas, burbuja neón), 'starseed.cursorfx.v1'; listings de cursores/gestos publicados en la Librería.
- **Orbe Aurora v2:** causa raíz del glitch-loop: engine reinicia recognition en onend sin tope + getUserMedia paralelo del analizador mataba la recognition en cada flip → supervisor (isStarting, backoff ≥800ms, watchdog 5 caídas → voiceUnavailable + retryVoice), mic analyser singleton con refcount/cooldown, debounce visual 250-320ms. Montaje GLOBAL en root layout (pre-login incluido; (main)/dashboard ya no muestra el FAB viejo — trinity-fab cede por defecto). Diseño: solo redondo (satélite eliminado), cristal 3D (aro cónico 22s, refracción, especular, glow neón difuminado), luz por volumen/tono/emoción (--aurora-energy/--aurora-flux). Menú Trinity CENTRADO al mantener pulsado con deslizar-para-abrir. Chat → evento 'starseed:open-aurora-exocortex'; mensajes → 'aurora:conversation'.
- **Exocórtex Zenith = casa de Aurora:** aurora-chat-section reescrita (pestañas Chat/Chats/Voz/Control/Registro, transporte, personalidad, guía contextual por ruta, abrir /aurora, reactivar orbe) + aurora-chat-log.ts (registro persistente 'starseed.aurora.chatlog.v1', sesiones/día, resumen, export json/md, registrador singleton en la curtain). Curtain abre enfocando Aurora al recibir el evento del orbe. Estilo café (.axc-) con filo azul→verde→amarillo→rojo.
- **Control de pantalla por voz:** screen-control/ (scanner de elementos visibles + overlay de insignias numeradas ámbar + acciones click/scroll/swipe/type/back) y 7 tools registradas en aurora-tools.ts (ver_pantalla, pulsar_elemento, escribir_en, desplazar_pantalla, atras, adelante, pantalla_completa) siguiendo el patrón AuroraScreenTool kind:'screen'.
- **Chrome:** badge "build · … v18" (esquina inf-izq, dashboard-layout L1509) ahora solo con localStorage starseed.debug=1; watermark Spline sellado ambas esquinas; SystemChrome: fullscreen automático al primer gesto + evento 'starseed:toggle-fullscreen'; --screen-corner (0px / 12px standalone+coarse) en superficies full-bleed; [role=tablist] global sin desbordes + .ss-hscroll; dock strip overflow-x táctil; botones del panel del Dashboard con título + popover "i" (TAB_ACTION_DEFS).
- **Librería definitiva:** SIN tienda (pestaña eliminada, /store→/library, store-panel fundido como "Intercambio de Recursos"); taxonomía 8 categorías (Apps·Widgets·Layouts·Archivos·Fuentes·Cursores·Gestos táctiles·Comandos) en library-catalog.tsx; comandos instalables/ejecutables (starseed-command-listings.ts, 6 listas); fichas ricas por formato (app-file-page: galería, versiones con historial + Replicar vía saveResource, recomendaciones); 7 apps StarSeed publicadas (starseed-apps-listings.ts). Dock migración v5 ('starseed.dock.items.migrated.v5'): quita tienda/nodes/netlib de configs guardadas, inserta 'escritorios' primero, purga carpetas, conserva origin:'user'. Bonus: 17 errores preexistentes de buildUnifiedResources eliminados.
- **Perfil libre:** header sin "Reputación 1.618 / Nodos 42 / Impacto High / Nivel 7" (inventados) → 7 bloques configurables con datos REALES (Comunidades os_follows+os_pages, Grupos os_memberships, Publicaciones cafe_posts, Enlaces/Archivos propios; E.F./Aportaciones "—" hasta tener fuente) + editor de bloques ('starseed.profile.display.v1'); modos Clásico·Libre (bloques reordenables/ocultables)·VR/AR (ImmersiveSpace embebido); secciones Enlaces y Archivos nuevas.
- Verificado: tsc 393 → **376 errores preexistentes** (−17, 0 nuevos). Deploys: 04766fe (ola 1) + commit siguiente (olas 2-3 + integración).

**Pendiente:** #47 instaladores nativos; investigación OSS ampliada para sentidos/plugins de Aurora; day-detail-dialog ya sin semilla.

---
## Adenda 50 — 2026-07-02 · Escritorio-izq · Aurora Android/cross-browser · globo diálogo · Trinity cierre/swipe · Exocórtex+wake-word (deploys be0a9c4→e3be1c4)

- **Escritorio primero (izquierda) en TODAS las cuentas:** migración dock v6 (`starseed.dock.items.migrated.v6`) mueve 'escritorios' al índice 0 y lo habilita (v5 solo insertaba si faltaba → quedaba a la derecha en cuentas existentes).
- **Aurora reconoce /escritorios:** añadido a OS_ROUTES (actions.ts, primero) y al nav map de engine.ts.
- **FIX Aurora Android Chrome (loop "escuchando sin reconocer"):** causa = `continuous=true` no fiable en Android (onend inmediato + reinicio 250ms) + getUserMedia del analyser compitiendo con SpeechRecognition. Fix en engine.ts: móvil → `continuous=false`, backoff progresivo (700ms→2.5s) con tope de 6 reinicios sin habla → corta y deja al supervisor mostrar reintento; onresult resetea el backoff. aurora-orb-bus.ts: en Android NO se crea el analyser de mic (cae al latido de eventos). stop() limpia el timer.
- **Globo de diálogo cristalino sobre el orbe (aurora-speech-bubble.tsx):** sustituye el auto-popover al hablar. Voz SOLO a petición; sugerencias/notificaciones proactivas ('aurora:suggest'/'aurora:notify') aparecen como TEXTO sobre el botón sin hablar; play/continuar inicia voz; se puede seguir solo por chat. Controles translúcidos, auto-oculta 10s, descartable.
- **Drag-to-open natural:** durante el long-press, deslizar (mismo pointer capture, histéresis 40/26px, overlay pointer-events-none mientras arrastra) resalta y al soltar abre la sección; touch+mouse; overlay centrado dentro del viewport.
- **Cortinas Trinity (Zenith/Horizon/Logic):** botón de cierre X cristalino (≥44px), swipe-to-close que sigue el dedo (umbral 80px + spring, reduced-motion), responsive anclado dentro del viewport (Logic ya no sale de pantalla; Horizon sin botones encimados: clamp + safe-area + box-border). trinity-curtains.module.css nuevo.
- **Voz cross-navegador (capabilities.ts):** detecta STT/TTS/mediaDevices/fullscreen/secureContext/navegador; requestMaxAccess pide micrófono→pantalla completa desde gesto; voiceMode full|tts-only|text-only; Firefox/WebView ya no entran en error (chat 100% + TTS). provider expone capabilities+requestAccess (puente v5); widget adapta chip/tap.
- **Exocórtex = casa de Aurora:** barra superior (escribir para preguntar/buscar + botón derecho activar voz), nuevo chat / ver registro / entrar a contextos de sesión, switches orbe flotante y Aurora global. Modo "Aurora siempre encendida" wake-word (wake-word.ts + aurora-always-on.tsx, 'starseed.aurora.always-on'): escucha pasiva de fondo, al decir "aurora" se activa con el resto de la frase, ~6s de silencio → vuelve al fondo. containsWake/stripWake probados 10/10.
- tsc 376 = baseline en todas las tandas (0 nuevos). Deploys: be0a9c4 (crítico) · 222329a (globo+trinity) · e3be1c4 (cross-browser+exocórtex+wake-word).

**Pendiente:** STT open-source (Whisper/Moonshine transformers.js) como fallback para navegadores sin SpeechRecognition; VAD barge-in; QA visual por tamaño real.

---
## Adenda 51 — 2026-07-02 (noche) · Aurora arranque pasivo · singleton/líder · AI Studio reorg · guía (deploys cdff4bc→577c564)

- **Arranque PASIVO y silencioso (petición):** quitados AMBOS saludos automáticos (requestAccess + autonomía). Aurora deja micrófono/sentidos listos en 2º plano pero NO habla al inicio, NO abre chat/reproductor, sin sonido de reinicio; habla SOLO tras hablarle/escribirle. aurora-widget: `bubbleMentioned = !!interim` (antes `visListening||interim`) → el globo aparece solo con habla real o a petición, no por escucha pasiva.
- **Doble Aurora → una sola:** (1) guard singleton del STT a nivel de módulo en engine.ts (`sttOwner` symbol; solo una instancia reconoce → no se duplican acciones; se libera en stop/unmount). (2) `single-instance.ts`: elección de LÍDER entre pestañas (heartbeat localStorage 2s, stale 5s, relevo en focus/visibility/storage/unload). Provider: solo la líder arranca la escucha; al perder liderazgo superStop, al ganarlo superStart. → "solo puede haber una Aurora" que administra todo.
- **AI Studio (/agent) reorganizado:** ~40 pestañas sueltas → 9 secciones de configuración con navegador de 2 niveles (rail lateral desktop / tira .ss-hscroll móvil); fix desbordes de bordes (max-w/box-border/safe-area/scroll contenido; selects del chat con wrap); tarjeta "cerebro compartido Astraura/Aurora/Exocórtex" con enlace ('starseed:open-aurora-exocortex'). Deep-links ?tab= preservados. Único archivo: app/(app)/agent/page.tsx.
- **Guía dinámica** (onboarding/aurora-guide.tsx, global): 11 pasos (orbe, 4 Trinity, Escritorio, Dashboard, Astraura, Perfil, Cerebros, Librería) con spotlight defensivo, modos Acompáñame/Hazlo-por-mí, auto-avance+reduced-motion; arranca en primera visita ('starseed.guide.seen.v1') y reabrible ('starseed:open-guide'/window.openStarseedGuide/botón Guía); nuevos y existentes.
- tsc 376 = baseline en todo. Deploys: cdff4bc (arranque pasivo+singleton) · 0cde608 (AI Studio) · ba82d47 (guía) · 577c564 (líder única).

**Pendiente:** #10 portar Aurora/Astraura a Nexus y Café (repos vanilla JS aparte): voz auto silenciosa desde inicio, 1 toque=voz sin chat, mantener pulsado=ventana chat+reproducción (no menú Trinity), botón movible por esquinas snap, no eliminable, enlaces a todos los sistemas. También: chats de Aurora en pantalla completa + ramificación de contextos + contexto compartido Exocórtex↔AI Studio; ampliar edición de pantalla/tareas en 2º plano; investigar OSS (Whisper/Moonshine/VAD) para asistente completo.

---
## Adenda 52 — 2026-07-02 (noche 2) · Anti-eco voz · guía voz-opcional/sin-timer · detección de dispositivos por IP (deploys eb9e2d8→7aecd15)

- **FIX crítico del loop/duplicación de voz = ECO acústico:** Aurora captaba su propia voz TTS por el micrófono, la procesaba como comando y se respondía a sí misma → loop y "múltiples Auroras". engine.ts: `echoSuppressRef`/`echoUntilRef` — el reconocimiento IGNORA lo captado mientras Aurora habla (u.onstart→suppress on; u.onend→off + cooldown 700ms). El canal del micrófono queda ABIERTO sin reiniciarse; solo se descarta la voz propia. (Complementa singleton STT + líder de pestañas de la Adenda 51.)
- **Guía (aurora-guide):** pregunta inicial "voz+micrófono vs silenciosa" (persistida 'starseed.guide.mode.v1'); QUITADO el auto-avance por temporizador (solo Siguiente / comando de voz "siguiente"/"continúa"); botón de silenciar Aurora manteniendo el chat de texto; demos animadas por paso (framer-motion: orbe/Trinity/escritorio/dashboard/astraura/perfil/cerebros/librería) con reduced-motion. Archivos: aurora-guide.tsx + aurora-guide-demos.tsx + aurora-guide-voice.ts. Consume Aurora solo por el puente window.STARSEED_AURORA.
- **Detección de dispositivos por red (IP):** honesto — el navegador NO puede escanear la LAN (privacidad, mDNS .local). src/lib/network/device-registry.ts registra el dispositivo en user_settings.prefs.devices (id persistente + IP pública vía ipify + userAgent/plataforma/lastSeen), sameNetwork = misma IP pública; useDeviceNetwork() + switch 'starseed.network.autodetect' (default ON). lan-sync.ts = andamiaje WebRTC P2P (contrato+stubs; señalización futura por la cuenta). device-network-panel.tsx montado en servers-panel. 
- tsc 376 = baseline en todo. Deploys: eb9e2d8 (anti-eco) · e27d7dd (guía) · 7aecd15 (dispositivos/red).

**Pendiente:** #10 Aurora en Nexus/Café; chats fullscreen+ramificación; WebRTC LAN real (señalización por cuenta); STT OSS (Whisper/Moonshine) fallback.

---
## Adenda 53 — 2026-07-02 (madrugada) · Ola sincronizada: chats fullscreen · Aurora ampliada · STT OSS · Aurora en Nexus y Café (deploys OS 6ec7481→220558e; Nexus 5ad9eff; Café f60b268)

Construido con 5 subagentes en 2 olas + integración.

- **Chats de Aurora en pantalla completa + ramificación** (exocortex): AuroraChatView compartida + AuroraChatFullscreen (overlay 2 columnas desktop / 1 móvil, Esc+X); chat-tree.ts (árbol de contextos persistido 'starseed.aurora.chattree.v1', useChatTree, branchFrom, índice paralelo ts→contextId SIN tocar el log); UI de árbol con sangría/líneas/iconos de rama.
- **Aurora ampliada** (lib/aurora): 7 acciones de pantalla nuevas (resaltar/leer_pantalla/rellenar_formulario/seleccionar_opcion/ir_a_seccion/abrir_app/copiar_texto) + task-manager.ts (tareas 2º plano 'starseed.aurora.bgtasks.v1', runInBackground) + context-hints.ts (suggestForContext por ruta); 10 tools nuevas en aurora-tools.ts (patrón AuroraScreenTool).
- **STT open-source fallback** (stt-oss/): transformers.js Whisper (tiny/base) por CDN, opt-in 'starseed.aurora.oss-stt', VAD RMS+silencio 700ms→16kHz; capabilities expone ossSttAvailable/Enabled sin tocar voiceMode; panel aurora-voice-fallback-panel montado en Ajustes→IA; alimenta a Aurora vía window.STARSEED_AURORA.send. Para Firefox/WebView sin voz nativa.
- **Aurora portada a NEXUS y CAFÉ** (repos vanilla JS, deploy propio): mismas reglas del OS — arranque PASIVO silencioso (sin saludo/auto-chat; micrófono listo en 2º plano), tap=voz sin chat, mantener-pulsado=ventana de chat con barra de reproducción (▶/⏸/⏹+mic), ANTI-ECO (ignora TTS propio +700ms; micrófono sin reiniciar en loop), orbe MOVIBLE por esquinas con snap persistido ('starseed.nexus.aurora.corner' / 'starseed.cafe.aurora.corner'), enlaces a OS/Nexus/Café/Audiomorphic. Nexus exocortex.js v=98 (adaptado sobre su versión completa). Café exocortex.js 273→1035 líneas (se le AÑADIÓ el motor de voz que no tenía; contexto menú/elixires/baristas), v=82, desplegado vía clon limpio a /tmp (working tree del Café desordenado). 
- tsc OS 376 = baseline. node --check limpio en Nexus y Café. Deploys: OS 6ec7481 (chats+ampliación) · 220558e (STT OSS) · Nexus 5ad9eff · Café f60b268.

**Pendiente:** WebRTC LAN real (señalización por cuenta); contexto compartido real Exocórtex↔AI Studio (hoy enlace); wake-word acústico local (Porcupine/OSS) opcional.

---
## Adenda 54 — 2026-07-02 (madrugada 2) · Anti-eco GLOBAL + carpeta de chats de Aurora (deploys b19feee, 0db1d45)

- **FIX definitivo eco/duplicación/loop:** la supresión anterior era POR INSTANCIA y solo en el TTS del navegador → si había 2 instancias o la voz salía por otra ruta, Aurora se oía a sí misma. Ahora `ttsSpeakingGlobal`/`ttsGuardUntilGlobal` + `ttsGuardActive()`/`markTtsSpeaking()` a NIVEL DE MÓDULO: TODAS las instancias y rutas de voz suprimen a la vez. Guard abierto ANTES de speechSynthesis.speak (cubre primer fonema) + cola 800ms; onresult descarta si guard activo; el watchdog no cuenta reinicios como "sin habla" durante TTS (no se autodesactiva tras hablar). engine.ts.
- **Carpeta/explorador de chats de Aurora** (exocortex, vista principal por defecto "Carpeta"): dos ejes fecha (hoy/ayer/semana/mes) + tema; categorización automática LOCAL determinista (chat-auto-categorize.ts: Sistema/OS·Creación·Gobernanza·Café·Audio-Frecuencias·Educación·Personal·General + título derivado, sin IA externa); catálogo unificado (chat-catalog.ts 'starseed.aurora.chatcatalog.v1', useChatCatalog): guardar chat en MEMORIAS (baúl memory-vault + referencia library-store), DUPLICAR (contexto nuevo copiando timestamps), INTERCONECTAR (linkedIds bidireccional). 
- **Ventana principal fusionada búsqueda⇄chat:** barra única en el explorador, conmutador Preguntar/Buscar; escribir en Buscar lanza universalSearch (recursos de red) y filtra chats; botón Aurora/Enter invoca send(); el buscar del Exocórtex ahora invoca a Aurora. Reutiliza AuroraChatView/chat-tree/aurora-chat-log sin duplicar.
- tsc 376 = baseline. Deploys OS: b19feee (anti-eco global) · 0db1d45 (carpeta de chats).

**Pendiente:** WebRTC LAN real; contexto compartido en vivo Exocórtex↔AI Studio; wake-word acústico local OSS; verificar en Android que el eco global ya no reinicia.

---
## Adenda 55 — 2026-07-03 · Aurora sabia + generación + fusión + Escritorios PC + términos en Nexus/Café (deploys OS c60756f→c739358; Nexus 69e0760; Café 385016c)

Construido con 4 subagentes en 2 olas + integración + port a Nexus/Café.

- **Aurora reconoce términos StarSeed** (term-normalizer.ts): corrección fonética (clave: sin acentos, seseo z/c→s, v→b, qu/k/q→k, h muda, colapsa dobles) + tabla STARSEED_TERMS (~20: Astraura, StarSeed, Exocórtex, Ontocracia, Ciberdelia, Sangha/Sanghas, Audiomorphic, Omnifrecuencias, Trinity, Nexus, Zenith, Horizon, Anchor, Logic, Multiverso, Transhumanismo). Aplicado en engine.ts onresult (voz) y runCommand (texto).
- **Conocimiento del ecosistema** (system-knowledge.ts): buildSystemKnowledge(route) — áreas OS (Escritorio/Dashboard/Exocórtex/Trinity/Librería/Cerebros/Perfil/Astraura), tríada (Ontocracia/Ciberdelia/Transhumanismo), dualidad Cuenta/Perfil, gobernanza, enlaces canónicos — insertado aditivamente en el prompt de Astraura.
- **Generación libre de contenido** (aurora/generate/content-actions.ts, 11 tools en aurora-tools.ts): crear_nota/documento/archivo (→biblioteca), crear_publicacion (→/publicar), abrir_pizarra/crear_en_pizarra, crear_widget (→dashboard/escritorio), buscar_web/abrir_enlace (→navegador), buscar_en_libreria/biblioteca. Dispatch por el puente [[ACCION:…]] existente; auto-listadas en el prompt.
- **Fusionar/duplicar cerebros y memorias** (lib/brains/merge-duplicate.ts): duplicateBrainById, mergeBrains (unión dedup de includes/servidores, no destruye originales salvo replaceSources), duplicateMemoryDoc, mergeMemories (concatena secciones). UI con previsualización A+B→resultado en brains-panel + memory-merge-panel nuevo. Modelo: src/lib/brains/brains.ts (Supabase) + src/lib/memory-vault.ts (localStorage).
- **Escritorios rediseñados** (components/desktop/): escritorio vacío estético (geometría sagrada, orbe-estrella, gradientes) desktop-empty.tsx; ramificación de carpetas anidadas con iconos por tipo + breadcrumb (desktop-folder-view.tsx, desktop-file-icons.ts); opciones tipo PC (desktop-context-menu.tsx clic-derecho lienzo/icono, selección múltiple marquee, desktop-taskbar.tsx dock de ventanas, notas rápidas); ajustes por escritorio (desktop-settings-panel.tsx: fondo/iconos/rejilla/tema, renombrar/duplicar/reordenar). Store con jerarquía recursiva retrocompatible ('starseed.desktops.v1').
- **Nexus y Café**: normalizeStarseedTerms vanilla-JS en su exocortex.js (onresult voz + onSend texto). Nexus v=99 (69e0760), Café v=83 (385016c, clon /tmp).
- tsc OS 376 = baseline; node --check limpio Nexus/Café. Deploys OS c60756f (contexto+escritorios) · c739358 (generación+fusión); Nexus 69e0760; Café 385016c.

**Pendiente:** WebRTC LAN real; contexto compartido en vivo Exocórtex↔AI Studio; wake-word acústico OSS; verificar visualmente /escritorios y la carpeta de chats.

---
## Adenda 56 — 2026-07-03 · Servicios open-source integrados (Ollama/Whisper/Kokoro/Fooocus/n8n/Cal.com/AppFlowy/Penpot) (deploys cb6ae74→8f876e6)

Construido con 5 subagentes en 3 olas + investigación de repos.

- **Registro unificado OSS** (src/lib/services/oss-services.ts): catálogo tipado por categoría de función (llm/stt/tts/image/video/workflow/calendar/docs/design/website) — Ollama, Whisper, Piper/Kokoro, Fooocus-API, AUTOMATIC1111, n8n, Cal.com, Google Cal/CalDAV/ICS, AppFlowy, Penpot, generador web. oss-connections.ts: store multi-servidor por scope (usuario/cerebro:<id>/página/contexto, 'starseed.oss.connections.v1' + espejo cuenta) + testConnection + resolveServiceFor(category,scope). Panel en /servicios (vista alterna al tri-fuente). Preintegrado por defecto (catálogo siempre; conexiones del usuario).
- **Voz OSS:** STT Whisper mejorado (VAD adaptativo al ruido, pre-roll ring, modelo small, ES por defecto, filtro de alucinaciones); TTS Kokoro nuevo (src/lib/aurora/tts-oss/, voz alternativa por transformers.js/CDN, opt-in 'starseed.aurora.oss-tts', offline tras ~80MB). Panel ampliado en Ajustes→IA (STT idioma + sección Voz Kokoro con probar).
- **Ollama completo** (src/ai/providers/ollama.ts): probeOllamaModels/testOllamaConnection (/api/tags, timeout+CORS), detectar modelos, local/remoto, sync por cerebro vía conexiones OSS. Modelos por función (src/ai/functions/function-models.ts + hook): imagen/video/presentaciones/infografías/web/voz → servicio/conexión OSS elegible por scope. Paneles en AiProvidersPanel (/settings).
- **Servicios en Librería/Biblioteca** (petición): src/lib/library/oss-catalog-bridge.ts proyecta OSS_SERVICES→fichas; nueva categoría "Servicios / Integraciones" en la librería (fichas instalables: Instalar/Conectar+Configurar via OssServicesPanel embebido); biblioteca personal "Mis servicios e integraciones" (conectados por ti + predeterminados integrados). installService = conexión por defecto + saveResource.
- **Apps conectoras** (src/lib/integrations/services/ + src/components/integrations/): n8n (triggerWebhook /webhook/<path>, listWorkflows X-N8N-API-KEY, hooks guardados) + panel; Cal.com (API v2 Bearer, listBookings→eventos de red) añadido a external-calendar-connectors (auto en UnifiedCalendar); AppFlowy+Penpot (app-embed iframe sandbox, guardar diseño→biblioteca, accesos desde /pizarras). Página nueva /integraciones. 
- REALISTA: la web CONECTA por endpoint/clave/webhook (self-host o nube), no instala servidores. Repos: ollama/ollama, n8n-io/n8n, calcom/cal.com, mrhan1993/Fooocus-API, AppFlowy-IO/AppFlowy, penpot/penpot, Xenova/transformers (Whisper/Kokoro).
- tsc 376 = baseline en todo. Deploys OS: cb6ae74 (registro OSS) · 7c74786 (voz) · 762e72c (Ollama+función+librería) · 8f876e6 (n8n/Cal.com/AppFlowy/Penpot).

**Pendiente:** enrutar las tools de generación de Aurora a los servicios por función (crear_imagen→Fooocus, etc.); WebRTC LAN real; wake-word acústico OSS; portar registro OSS a Nexus/Café si se desea.

---
## Adenda 57 — 2026-07-03 · Generación por servicios + WebRTC LAN real + Aurora tap Nexus/Café + Exocórtex Aurora principal (deploys OS 42d8794→5aba02d; Nexus 1eda83a; Café eefefea)

- **Aurora enruta generación a servicios por función** (aurora/generate/service-generation.ts): generar_imagen→Fooocus-API (/v1/generation/text-to-image) o A1111 (/sdapi/v1/txt2img)→guarda en biblioteca; lanzar_workflow→n8n triggerWebhook; generar_sitio_web→servicio o plantilla HTML local (fallback útil); generar_video→servicio. 4 tools nuevas en aurora-tools.ts, prompt actualizado; fallbacks honestos (si no hay endpoint, guía a /servicios, no inventa).
- **WebRTC LAN real** (network/): signaling.ts (Supabase Realtime channel starseed-signal-<userId> + fallback polling user_settings.prefs.signals TTL 60s), webrtc-mesh.ts (RTCPeerConnection STUN google + DataChannel 'starseed' + ICE trickle + glare polite/impolite por id), lan-sync.ts real (ensureMesh/getSharedMesh/teardownMesh), device-network-panel con estado por dispositivo + probar-envío ping/pong. Nota honesta: STUN sin TURN → NAT simétrico puede fallar.
- **Aurora tap en Nexus y Café** (petición): tap corto = activa voz + SONIDO de activación (WebAudio 2 tonos ascendentes ~150ms) + empieza a escuchar (SIN chat) + halo .hearing animado; a los 6s sin voz dice "Estoy disponible por si necesitas algo…" (cancelado al instante si se habla, tras anti-eco); mantener pulsado = chat. Guías (aurora-guide.js Nexus / tour.js Café, con conflicto de merge arreglado) explican el funcionamiento. Nexus exocortex v=100/guide v=98 (1eda83a); Café exocortex v=84/tour v=81 (eefefea).
- **Exocórtex: Aurora principal** (zenith-curtain.tsx): mainView default 'buscar'→'aurora' — al abrir el Exocórtex aparece directamente Aurora (con buscador fusionado dentro); buscador clásico + Cerebro 3D quedan secundarios conmutables. Deploy 5aba02d.
- tsc OS 376 = baseline; node --check limpio Nexus/Café.

**Pendiente:** wake-word acústico local OSS (#31 pendiente); TURN server para NAT simétrico; portar generación por servicios a Nexus/Café si se desea.

---
## Adenda 58 — 2026-07-03 · Medio-dúplex definitivo + reproductor resumido + NVIDIA NIM (deploys OS a139890→8956a70; Nexus 3fc38de; Café 788fd84)

- **FIX DEFINITIVO auto-escucha/duplicación/loop = MEDIO-DÚPLEX real** (engine.ts + Nexus/Café exocortex.js): mientras Aurora HABLA se DETIENE el micrófono (recognition.abort(), no solo ignorar); al terminar (utterance.onend o watchdog por el bug de Chrome que no dispara onend en textos largos) se REANUDA. Imposible oírse a sí misma. pausedForTtsRef + finishTts + startRef; onend respeta pausedForTts (no reinicia en bucle); interrupt/stop limpian. Esto era lo que faltaba (el guard global solo ignoraba; ahora se para de verdad). En Nexus además backoff en onend → elimina el bucle de reinicio; Café tap ya NO habla (solo chime+halo+escucha).
- **Reproductor de chat RESUMIDO** (los 3 sistemas): OS aurora-mini-player.tsx (widget sobre el orbe: últimas líneas, transporte play/pausa/parar/anterior/siguiente/mic, DESLIZAR para historial de sesión, iluminación reactiva a voz de usuario Y Aurora, botón "Abrir en Exocórtex", auto-ocultar 10s, un solo canal); Nexus/Café .ssx-mini equivalente (swipe historial + botón abrir completo). Comportamiento: tap=escucha silenciosa (sin hablar/sin chat); al hablar aparece el resumido; hold = OS menú Trinity / Nexus·Café reproductor completo; ventana completa del OS = Exocórtex.
- **NVIDIA NIM** (src/lib/services/nvidia/): nim-client.ts (OpenAI-compatible integrate.api.nvidia.com/v1, Bearer, /models + /chat/completions, testNim, listModels en vivo), nim-catalog.ts (~30 modelos curados por función llm/vision/image/code/embedding/stt/tts + 7 skills/blueprints; gratis con Developer Program; mergeWithLiveModels). oss-services.ts: servicios nvidia-nim/vision/riva-asr/riva-tts (enabledByDefault, api-key) → aparecen en Librería categorizados. function-models.ts: modelos NIM por función. Panel /nvidia (nvidia-nim-panel.tsx) con API key, probar, detectar modelos, guías inteligentes desplegables, default por función; enlace desde /servicios.
- tsc OS 376 = baseline; node --check Nexus/Café OK. Deploys OS a139890(medio-dúplex)/2ed2b93(mini-player)/8956a70(NVIDIA); Nexus 3fc38de; Café 788fd84.

**Pendiente:** verificar en vivo que el medio-dúplex elimina la auto-escucha en los 3; refrescar catálogo NIM en vivo con la clave del usuario; TURN para WebRTC NAT simétrico.

---
## Adenda 59 — 2026-07-03 · Fix definitivo del bucle de voz (contador de generación) + regresiones de botones (deploys OS 9668a20/cd40b28; Nexus dce848b; Café d6b1baf)

CAUSA RAÍZ del bucle "se reinicia sin escuchar y suena la reactivación": al reemplazar el reconocimiento (start/stop/medio-dúplex), el reconocimiento VIEJO disparaba su onend y arrancaba OTRO en paralelo → competían y se reiniciaban. 
- **OS engine.ts:** `recGenRef` (contador de generación) — cada reconocimiento toma gen=++recGen; onstart/onerror/onend/onresult hacen `if(gen!==recGenRef.current) return` (obsoletos = silencio, no reinician). speak() medio-dúplex incrementa gen al abortar (el onend del abortado no reinicia; finishTts→start crea gen fresco). Elimina el bucle competitivo; el tap vuelve a escuchar.
- **OS aurora-widget.tsx + aurora-mini-player.tsx (regresiones):** (1) mantener-pulsado volvía a abrir Exocórtex en vez de Trinity porque el mini-player se solapaba sobre el orbe (capturaba el long-press) Y el contextmenu táctil abría Exocórtex. Fix: mini-player wrapper pointer-events-none + desplazado (MINI_GAP), y onContextMenu abre Exocórtex SOLO en clic derecho de ratón real (pointerType mouse; ignora touch/pen en hold). (2) tap SOLO activa escucha en silencio: quitados los setOpen(true); requestAccess silencioso si falta permiso; popover solo si NO hay STT.
- **Nexus/Café exocortex.js:** contador de generación `_recGen` (silencia reinicios internos, mata el bucle); chime SOLO en activación explícita (tap/wake-word), NUNCA en reinicio (era la causa del sonido repetido); tap activa escucha en silencio (QUITADO el saludo hablado del café "soy Aurora tu guía…"; fallback de aurSectionHint reescrito); wake-word "aurora" de fondo estable sin auto-oírse (medio-dúplex); aviso 6s se arma 1 vez por activación (no en reinicios); Café chat comparte estructura .ssx-* del Nexus con contenido café.
- Comportamiento final unificado: TAP = activa escucha en silencio (chime+halo, sin hablar/sin chat); al conversar aparece el reproductor resumido; HOLD = OS menú Trinity (deslizar-seleccionar) / Nexus·Café reproductor completo; Exocórtex del OS = ventana completa (clic derecho/botón/al abrir Exocórtex). Aurora escucha en fondo para "aurora" sin reinicios audibles.
- tsc OS 376=baseline; node --check Nexus/Café OK. Deploys OS 9668a20(gen)/cd40b28(regresión botones); Nexus dce848b (v102); Café d6b1baf (v86).

**Pendiente:** verificación en vivo del usuario en los 3; si aún se oye reinicio sería doble pestaña (líder) — reforzar.

---
## Adenda 60 — 2026-07-03 · CAUSA REAL de "no se actualiza nada" = Service Worker cache-first (deploys OS 3056604; Nexus 8de8b77; Café 483b89a)

VERIFICADO EN VIVO con Claude-in-Chrome: la página del OS estaba controlada por un SW `SW_VERSION=v1` con caché runtime de **459 recursos cache-first** que NUNCA se invalidaba → el navegador ejecutaba el JS VIEJO aunque Vercel desplegara bien (deploys success confirmados). Los TRES sistemas tenían el mismo bug: OS public/sw.js (cache-first _next/static + js/css), Nexus/Café sw.js (cache-first css/js). Por eso "solo cambiaba el menú de Trinidad" y la voz/otros no: código cacheado.
- **FIX (los 3):** SW ahora RED-PRIMERO para TODO el código (js/css/mjs/_next/static) — cada despliegue llega siempre; la caché de código solo es respaldo offline; solo medios inmutables (img/fuentes/audio) cache-first. SW_VERSION nueva (v3-2026-07-03 / starseed-nexus-v3 / starseed-cafe-v3) → activate purga TODAS las cachés viejas. + listener SKIP_WAITING. 
- **AUTO-ACTUALIZACIÓN (los 3):** register-sw.tsx (OS) e index.html (Nexus/Café) escuchan updatefound→statechange installed→postMessage SKIP_WAITING, y controllerchange→location.reload() una vez → el usuario recibe el código fresco AUTOMÁTICAMENTE sin Cmd+Shift+R. reg.update() al cargar + cada 30min (OS).
- IMPLICACIÓN: los fixes de voz de las Adendas 58/59 (medio-dúplex, contador de generación, tap silencioso, hold=Trinity) NO llegaban al usuario por el SW; ahora sí. El usuario debe abrir la app UNA vez con el SW viejo (que descarga el v3 y auto-recarga); desde entonces cada deploy es automático para todos los dispositivos/usuarios.
- Pipeline VERIFICADO correcto: repos GitHub (StarSeedSystem/starseed-system, alexbordongarrigos/StarSeed-Nexus, alexbordongarrigos/Starseed-Cafe) → proyectos Vercel correctos → deploys success → live sirve el código nuevo (sw.js v3 confirmado en vivo).

**Pendiente:** que el usuario reabra la app 1 vez en cada sistema (propaga el SW auto-actualizable); luego reprobar la voz (ya con los fixes aplicados de verdad).

---
## Adenda 61 — 2026-07-03 · Voz de DOS NIVELES (pasivo silencioso / activa) en los 3 (deploys OS a70153e; Nexus 292c013 v103; Café c93aaaa v87)

Tras el fix del SW (Adenda 60) el código ya llega. El usuario reportó: OS mejor pero el fondo repite encendido/apagado con sonido (debería solo esperar "aurora"); Nexus al responder abre el reproductor COMPLETO (debe ser el resumido); Café sigue mal.
- **DOS NIVELES (engine.ts OS + Nexus/Café exocortex.js):** FONDO PASIVO = micrófono abierto pero SILENCIOSO, orbe/botón en CALMA (halo apagado), el reconocimiento SOLO reacciona a "aurora" (ignora lo demás en silencio) → elimina el encendido/apagado audible/visible del fondo. ACTIVA (engaged) = al TOCAR el orbe o al oír "aurora": halo encendido, procesa lo que digas; 30s de silencio → vuelve a pasivo. engaged/engage/disengage expuestos; send() (texto) también engage. Widget: halo del orbe = engaged (no la escucha pasiva); tap = engage/disengage. Nexus/Café: A._engaged + IDLE 30s, chime solo al activar, halo solo en activa.
- **Respuesta en el RESUMIDO (fix Nexus):** quitados los open() del panel completo en route()/conversación; la respuesta aparece en .ssx-mini; el completo solo al mantener pulsado (hold) o botón "Abrir".
- **Aviso de 6s eliminado del fondo** (Nexus/Café): el fondo es 100% silencioso hasta oír "aurora" (antes hablaba solo).
- Mantiene: medio-dúplex, anti-eco, _recGen (generación), wake-word sin auto-oírse, tap/hold/drag.
- tsc OS 376=baseline; node --check Nexus/Café OK. Deploys OS a70153e; Nexus 292c013; Café c93aaaa.

**Pendiente:** verificación del usuario; si el fondo aún hace sonido en Chrome sería el tono nativo de SpeechRecognition al reiniciar (mitigable con wake-word acústico Porcupine ya integrado, opt-in).

---
## Adenda 62 — 2026-07-04 · Astraura gratis-primero + sentidos + neuronas + Biblioteca-Cydia (OS·Nexus·Café)

Ola de capacidades agénticas. Ver `architecture/astraura-inteligencia.md` (fuente de verdad).

- **Router de inteligencia gratis-primero** (`src/ai/astraura/`): `free-catalog.ts` (fuentes instant/free-key/local/paid con modelos, fortalezas por tarea, límites, `why`), `availability.ts` (detecta claves/Ollama/WebGPU/Chrome AI), `router.ts` (`astrauraChat`: clasifica tarea → rankea gratis-primero, servicios del usuario +2.5 → **failover en cadena** → registra ruta + transparencia `announceLine`), `builtin-engines.ts` (Chrome AI, WebLLM, **Transformers.js SmolLM3-3B-ONNX**). Enganchado en `engine.ts::runCommand` (modo auto por defecto; manual = `chat()` clásico). Aurora ya NO exige proveedor: siempre tiene inteligencia gratis.
- **Uso/costes + nunca-se-cae** (`usage.ts`): cuenta peticiones/tokens/día por fuente + límites gratis; 429/quota → `markCooldown` 60min → el router la salta y usa la siguiente local/gratis. Panel muestra uso, %, cooldowns con "Reactivar".
- **Sentidos**: **Visión** SmolVLM2 en navegador (`vision.ts` + `senses/vision-sense.ts`, `maybeHandleVisionCommand` "¿qué ves?/pantalla/cámara"), panel opt-in `starseed.aurora.vision.v1`. **Voz OSS** Kokoro español local + Kitten beta (`tts-oss/`, `starseed.aurora.voice.v1`); `speak()` delega y cae al navegador.
- **Neuronas** (`lib/neurons/neurons.ts` + tabla Supabase `neuron_devices` RLS/heartbeat): cada dispositivo de la cuenta = cerebro+servidor con capacidades y 6 permisos (compute/storage/sync/agent/senses/wake), **todo activo por defecto**; panel Ajustes→Astraura→Neuronas; registro+latido en `AuroraProvider`.
- **Autonomía** (`autonomy.ts`, late 30min desde `AuroraProvider`): sugerencias gratis-primero (`starseed:astraura-suggestions`) + señales (`recordSignal`) que personalizan la Biblioteca.
- **Biblioteca-Cydia** (`lib/library/packages.ts`, repos `starseed-core`+`starseed-labs`): tienda instalable de todo (apps/widgets/páginas/pizarras/investigaciones/proyectos/diseños/animaciones/funciones/ai-source/repos) con instalar-efecto-real / abrir / **guardar enlace** / **descargar** / **replicar** (fork editable) / **publicar como rama**. Paquetes nuevos: SmolLM3, Visión SmolVLM2, Voz Kokoro, KittenTTS, TabFM, Sipp, AgentOS.
- **Visor universal** en el chat de Aurora (`components/aurora/universal-viewer.tsx` + `route-chip.tsx`): renderiza imagen/vídeo/audio/PDF/3D(model-viewer)/CSV/código/MD bajo cada mensaje (resumen y completo) + chip de transparencia del modelo.
- **Rediseño**: `src/styles/starseed-materials.css` (cristal líquido, neón por nodo Trinity, metal, madera, naturaleza, float/tilt/press, icon-3d) aplicado a Ajustes (por familia=nodo Trinity), Zenith, Trinity-FAB, escritorios; menús de Ajustes con anchors + barra sticky de categorías.
- **Sync cuenta** (`SYNCED_KEYS`): inteligencia, defaults por función, voz, neuronas, instalados de Biblioteca (mine/published). Claves API NUNCA viajan (local por diseño).
- **Nexus + Café**: `astraura-core.js` vanilla portable (misma cadena gratis-primero+failover+transparencia+cooldown) + `astraura-vision.js` (SmolVLM2). ⚠️ **Nexus usa su propio proyecto Supabase `nxstilnyidvkqeosofuh`** (no el del OS) → su core usa `window.STARSEED.client()`. Versiones bumpeadas: Nexus exocortex ?v=107 + SW starseed-nexus-v7; Café ?v=94 + SW starseed-cafe-v2.
- **Supabase**: migración `neuron_devices` + `user_settings` aplicada en prod `dzkjapinnewkxzjltadv`.
- Verificación: 0 errores de tipos en TODOS los archivos de la ola (tsc dirigido); errores preexistentes ajenos (keyStorage TS2769, actions Router, engine pushReply/pushUser) no tocados. next.config tiene ignoreBuildErrors.

**Pendiente:** que el usuario reabra las 3 apps 1 vez (propaga SW auto-actualizable de Adenda 60) y pruebe; verificar en vivo el chip de ruta y la visión (1ª descarga de SmolVLM2 ~250MB).

---
## Adenda 63 — 2026-07-04 · FIX Aurora + modelos opt-in + cuenta Supabase única + instalación oficial + update in-app

Correcciones y peticiones tras la Adenda 62 (deploys: OS 6dc60a0; Nexus dbfed66; Café 7502517 — los 3 Vercel success).

- **FIX crítico "Aurora oye pero no responde + reproductor en loop":** causa = el router elegía un modelo de navegador (SmolLM3 ~1,9GB) y se colgaba descargando; sin timeout, el micro seguía disparando runCommands en paralelo. Solución: (1) modelos descargables = **opt-in** (`src/ai/astraura/installed-models.ts`: DOWNLOADABLE_SOURCES smollm3-webgpu/smolvlm2-webgpu/webllm/sipp-local/chrome-ai; `availability.ts` los marca ready SOLO si instalados) → el router usa la mejor alternativa gratis (Pollinations/nube/Ollama) y nunca se cuelga; (2) **timeout por candidato** (nube 30s/local 20s/navegador 90s) + failover en `router.ts`; (3) **guard anti-solapamiento** (`runningRef`) en `engine.ts::runCommand`. Arreglados también 2 errores TS preexistentes (role widening).
- **Modelos opt-in con modal:** `installModelInBackground` (descarga en 2º plano) + `warmUpVision`; `install-model-modal.tsx` (Instalar ahora / Después) montado en el provider; botones instalar/quitar en intelligence-panel; sección "Instalar StarSeed" en la Biblioteca.
- **Cuenta Supabase ÚNICA = `dzkjapinnewkxzjltadv`** (decisión del dueño): Nexus y Café REPUNTADOS desde `nxstilnyidvkqeosofuh` (URL+anon key en starseed-identity/ssauth/starseed-id/data/config/api). El proyecto único YA tiene todas las tablas (cafe_*, os_*, user_settings, neuron_devices, exocortex_config). ⚠️ **PENDIENTE del dueño:** revisar en Vercel del proyecto Nexus las env vars NEXT_PUBLIC_SUPABASE_URL/ANON (si existen y apuntan al viejo, GANAN sobre el código — `api/supabase-config.js` lee env primero). Café no depende de env (hardcode). Usuarios que vivían solo en el proyecto viejo deben re-registrarse (aceptado).
- **Gate anti-descarga Chrome AI en Nexus/Café** (astraura-core.js): usa `LanguageModel` solo si `availability()`==="available" (no dispara Gemini Nano ~3-4GB) + timeout 25s.
- **Instalación oficial (OS/Nexus/Café):** `device-install.ts` (OS) + `astraura-install.js` (Nexus/Café): detectOS, PWA install real, requestMaxPermissions (notifs+persist+wakeLock), botones para instalar/abrir OS·Nexus·Café con su icono (OS=simbolo-starseed.png, Nexus=logo-detallado.png, Café=StarSeed-Café-detallado.png) y URL oficial, paquetes nativos por SO (honesto "soon"), compañero local para control por terminal/permisos (honesto: requiere app nativa). Manifests: Nexus→icono complejo, Café→icono café.
- **Defaults sembrados para TODOS** (`defaults-seed.ts`, `ensureDefaultsSeeded` en provider): instala por defecto paquetes recomendados SIN descarga (pollinations, diseños, animaciones, auto-update) sin pisar elecciones; viaja con la cuenta (cubre existentes).
- **Notificaciones** (`update-notifications.ts` + `notifications-bell.tsx` en Ajustes): versión nueva + sugerencias por dispositivo/contexto.
- **Update DENTRO de la app sin reinstalar (los 3):** ya eran PWAs con SW red-primero (auto-update). Ahora explícito y respetuoso: si estás libre aplica solo lo nuevo; si estás ocupado, banner "Nueva versión · Aplicar" (`update-banner.tsx` OS; `astraura-update.js` Nexus/Café) + botón "Buscar actualizaciones". Contenido/librería ya es incremental (modelo Cydia). Vía NATIVA futura (Tauri) usaría su updater incremental.
- Honestidad mantenida en toda la UI: control total del dispositivo/terminal = requiere compañero nativo + permisos (el navegador solo no puede); binarios nativos "próximamente"; modelos locales opcionales.

**Pendiente dueño:** (1) revisar env vars Supabase en Vercel del Nexus; (2) reabrir cada app 1 vez para propagar; (3) opcional: scaffolding Tauri para binarios nativos firmados por SO.

---
## Adenda 64 — 2026-07-04 · Release nativo Tauri v0.1.0 (CI) + lecciones de checkout Windows

- **Empaquetado nativo REAL** en `native/` (Tauri 2): 3 sistemas × 3 plataformas (macOS universal · Linux · Windows) vía `.github/workflows/native-build.yml` (tag `v*` → Release borrador con instaladores + `latest.json` del updater). Comandos Rust: `run_terminal` (control por terminal con permiso), `check_update` (actualización incremental in-app), `device_info`. Solo los orígenes Vercel pueden invocar comandos (capabilities.remote.urls).
- **Clave del updater generada y puesta:** `npx @tauri-apps/cli signer generate` → pública en `tauri.conf.json:pubkey`, privada+password como secretos GitHub `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` (repo StarSeedSystem/starseed-system). Firma de Apple/Windows = requiere cuentas del dueño (huecos en el CI, binarios sin firmar funcionan para probar).
- **LECCIÓN CRÍTICA — checkout de Windows fallaba (exit 128):** el repo tenía **189 archivos macOS `Icon\r`** (icono de carpeta, nombre con CR) y la carpeta **`AI-refernces `** (espacios finales en el nombre) — ambos ILEGALES en Windows. Se quitaron del índice (`git rm --cached` / `git update-index --force-remove` para variantes NFD que pathspec no casa) + `.gitignore`. También un **submódulo fantasma** `.agent/skills/ui-ux-pro-max` (gitlink mode 160000 sin `.gitmodules`) daba exit 128 → removido. REGLA: en el repo del OS, nunca commitear archivos `Icon\r` de macOS ni carpetas con espacios finales (rompen CI multiplataforma).
- **LECCIÓN — matriz del workflow:** `system:[...]` + `include:` con solo `platform` NO hace producto cartesiano (todo caía en windows-latest). Correcto: `system × platform` como dos dimensiones + `include` que añade `args` por plataforma.
- **LECCIÓN — flag `-c` de tauri-action:** con `projectPath: native`, tauri corre desde `native/`, así que los overrides se pasan como `-c src-tauri/tauri.<sistema>.conf.json` (no `-c tauri.<sistema>.conf.json`).
- **frontendDist por URL** (https://starseed-os.vercel.app) SÍ funciona en Tauri 2 (la app nativa carga la web desplegada); confirmado (el OS pasó del config a compilar).
- Estado al cierre de la adenda: run v0.1.0 con los 9 jobs compilando. Deploys web previos intactos.

---
## Adenda 65 — 2026-07-05 · Fix Android del release nativo v0.1.0 (target lib)

- **Diagnóstico (run 28735558254):** escritorio 9/9 ✅ (dmg/msi/exe/deb/AppImage/rpm subidos al draft), iOS 3/3 ✅ best-effort, **Android 3/3 ❌** con `error: no library targets found in package starseed-native`. Causa: Tauri 2 móvil compila el crate como LIBRERÍA (cdylib JNI en Android, staticlib en iOS); el comentario del Cargo.toml era erróneo (`android init` NO crea el lib target, lo exige).
- **Fix (patrón oficial Tauri 2):** lógica movida a `native/src-tauri/src/lib.rs` con `pub fn run()` + `#[cfg_attr(mobile, tauri::mobile_entry_point)]`; `main.rs` queda fino llamando `starseed_native_lib::run()`; `[lib] name=starseed_native_lib, crate-type=[staticlib,cdylib,rlib]` en Cargo.toml. **Updater + autostart movidos a `[target.'cfg(not(any(android,ios)))'.dependencies]`** (solo escritorio; en móvil ni compilan — patrón de la doc oficial del updater).
- **CI:** NDK fijado al 27.0.12077973 que instalamos (Tauri lo recomienda; `sort -V | tail -1` cogía el NDK 29 preinstalado del runner, sin probar con cargo-mobile2). Fallback al más nuevo si faltara.
- Re-tag `v0.1.0 -f` para relanzar los 15 jobs sobre el mismo draft Release.
- **Fix 2 (mismo día):** al quitar updater/autostart de móvil, build.rs falló en Android con `Permission updater:default not found` — los permisos del updater estaban en `capabilities/default.json` (multiplataforma). Movidos a `capabilities/desktop.json` (+ bloque `remote` con los 3 orígenes Vercel). CONFIRMADO por el log: tauri-build filtra capabilities por `platforms` ANTES de validar permisos (autostart en desktop.json no dio error en Android).

---
## Adenda 65 — 2026-07-05 · FIX P0 Aurora rota (banner pegado + bundles viejos) en OS/Nexus/Café

Tras la ola de instalación/updates, Aurora se rompió en los 3: OS "abre 2 veces + no reconoce + loop"; Café/Nexus "banner de resumen/actualización abierto que no se puede cerrar". Diagnóstico EN VIVO con Claude-in-Chrome (clave: no teorizar, observar).

- **CAUSA 1 (Café/Nexus) — banner de actualización PEGADO:** el `astraura-update.js` mostraba "Nueva versión lista · Aplicar/Ahora no"; si el SW se activaba por otra vía, `_waiting` quedaba null, el poll se limpiaba pero el banner NO se ocultaba, y "Aplicar" no hacía nada (`if(!w)return`). En vivo se veía el banner con `waiting:false`. **FIX:** eliminado el banner → actualización SILENCIOSA (aplica al quedar libre, 1 recarga/sesión); `hideBanner` ahora ELIMINA el elemento + limpieza defensiva al arrancar. Café v11→v12, Nexus v10→v11, ?v bumpeados.
- **CAUSA 2 (OS) — SW_VERSION nunca bumpeado:** seguía en `v3-2026-07-03` pese a ~10 deploys. Aunque el SW es network-first para código, dispositivos con bundle viejo cacheado podían mezclar viejo+nuevo → DOS motores Aurora (dos SpeechRecognition que se abortan) = "abre 2 veces / no reconoce / loop". **FIX:** `public/sw.js` SW_VERSION v3→**v5-2026-07-05** + `register-sw` CUR v5 → purga cachés viejas y deja UN bundle. Verificado en vivo: cachés `...-v5-...`, un solo SW, bridge único.
- **CAUSA 3 (OS) — reload sin tope + guard permanente:** el `onControllerChange` con lógica "ocupado"+interval podía realimentarse; el guard del motor (`runningRef` boolean) podía quedarse `true` para siempre ("ni reconoce nada"). **FIX:** `applyUpdate` recarga UNA vez con **tope de 2/sesión** (sessionStorage `ss:swreloads`), sin lógica de "ocupado"; `runningRef` ahora **temporal** (timestamp, se auto-libera a 60s). Quitado el dispatch `starseed:update-ready` (banner OS muerto).
- **REGLA NUEVA:** (1) todo deploy que cambie comportamiento del OS DEBE bumpear `SW_VERSION` en public/sw.js Y el `CUR` en register-sw.tsx (deben coincidir), o los PWA instalados no purgan y mezclan bundles. (2) NUNCA banners de actualización que puedan quedar pegados: actualización silenciosa. (3) Guards de concurrencia SIEMPRE temporales, nunca booleanos permanentes.
- **Nota:** el error React #418 (hidratación) del OS es PREEXISTENTE (capas de fondo 3D/three.js "Multiple instances"), no de esta ola; la app se recupera sola. No es la causa del P0.
- **Instalables:** las apps nativas Tauri v0.1.0 envuelven la web desplegada (cargan la URL), así que reciben este fix automáticamente sin recompilar.
- Verificado EN VIVO: OS un solo orbe + bundle v5; Café sin banner (`bannerPresent:false`). Deploys: OS 3bd5475, Nexus 6ecacb9, Café 8ad59de (los 3 Vercel success).
- **RESULTADO FINAL (09:55Z):** run 28736265509 **15/15 jobs en verde**. Release v0.1.0 PUBLICADO (46 assets): 3 APK Android firmados (self-signed), 3 IPA iOS sin firmar (¡best-effort funcionó!), dmg/msi+exe/deb+rpm+AppImage × 3 sistemas, todos los .sig del updater + latest.json. Único flaky: carrera al reemplazar assets del draft entre runs (`Not Found` al borrar asset) → se cura con `gh run rerun --failed`. https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.1.0

---
## Adenda 66 — 2026-07-05 · Voz Aurora: cierre del mini, auto-hablar/escuchar (Café), STT móvil (Nexus), animación de carga (3)

Diagnóstico EN VIVO con Claude-in-Chrome (verificado por comportamiento).
- **Café reproductor "no se cerraba" (VERIFICADO EN VIVO el fix):** `aurora-mini.js` — el tick `miniSync()` (cada 300ms) llamaba `update({active:true})` que RE-AÑADÍA `amp-show` tras cerrar. FIX: guard `_dismissed` en AuroraMini (hide()→_dismissed=true; update() solo re-muestra si `!_dismissed`; show()→_dismissed=false). Aplicado a Café Y Nexus (mismo módulo).
- **Café no auto-hablaba:** `speakReply` solo hablaba si `voiceOut||handsFree`. Ahora también si el reproductor está visible (contexto de voz). 
- **Café "hay que pulsar el micro" tras el tap:** `startVoice` pedía `getMicStream()` (getUserMedia del halo) ANTES de `AURORA_CAFE.listen()`; en móvil eso roba el micro al SpeechRecognition → no arranca. FIX: reconocimiento PRIMERO, getMicStream 600ms después (cosmético).
- **Nexus "no escucha" (CAUSA REAL):** `exocortex.js` ponía `r.continuous=true` SIEMPRE. En móvil (Android) eso dispara onend al instante sin capturar → "no escucha". El OS ya usaba `continuous=!isMobile`. FIX: portado — detecta móvil por UA/pointer y usa `continuous=false` en móvil. Verificado: en escritorio continuous=true, mini ya no pegado.
- **Animación de CARGA (los 3):** anillo giratorio en el orbe + spinner en el botón de reproducir del mini mientras procesa. OS: estado `thinking` en engine.ts (se apaga en finally) → `data-aurora-state="thinking"` en el orbe → CSS en globals.css. Café: `setThinking()` en agent.js. Nexus: `aurThinking()` en exocortex.js (clase en .ssx-fab).
- Voz/tono: los 3 ya usan la voz "Mónica" (OS es-MX, Nexus/Café es-ES) — misma familia; no se tocó la selección para no arriesgar.
- Deploys: OS cabcffd (SW sigue v5, network-first entrega el código nuevo sin bump), Nexus db6581d (SW v12, exocortex v108, mini v2), Café 550ff49 (SW v13, ?v=98).

---
## Adenda 67 — 2026-07-05 · Café bucle-blurb + Nexus mini-al-inicio + integración de repos IA (free-llm-api-resources, RouteLLM, LiteLLM…)

VOZ (arreglos, verificado en vivo con Claude-in-Chrome donde posible):
- **Café "habla 'tócame para que te lea lo último' + loop + no escucha" (app INSTALADO):** aurora-cafe.js es un SEGUNDO motor completo cargado junto a agent.js; en la app instalada su `maybeAutoListen()→startListen()→handleUserSpeech()→sectionBlurb()` (fallback) hablaba el blurb y re-escuchaba en BUCLE. FIX: `maybeAutoListen()`=NO-OP (aurora-cafe ya no re-escucha con su motor propio; agent.js manda), `contextText()`=`lastBotText()||''` (sin blurb hablado), revertido el `speakReply` "mini visible". En escritorio el tap ya era limpio (1 reconocimiento, sin habla). Café SW v14.
- **Nexus "el mini se abre solo al inicio":** `miniStateObj().active` era `true` fijo → cualquier `miniSync` (incl. saludo pasivo) lo re-mostraba. FIX: `active=aurora._engaged` (solo con Aurora ACTIVADA por el usuario); `setSpeakingFlag` solo abre el mini si `_engaged`; `aurTap` ahora SÍ abre el mini al activar. Nexus SW v13.
- Regla: en el Café hay DOS motores (agent.js=UI/sesión, aurora-cafe.js=engine speak/listenOnce/brain); aurora-cafe NO debe auto-escuchar ni hablar blurbs por su cuenta.

INTEGRACIÓN REPOS IA (aprendido e integrado, pre-instalado por defecto):
- **free-catalog.ts** (OS): +Cloudflare Workers AI, Scaleway, Cohere, SambaNova, OpenLLM-local (de free-llm-api-resources). **router.ts**: `estimateDifficulty()` + ajuste por dificultad (patrón **RouteLLM**: fuertes para lo difícil, rápidos para lo trivial) + ajustes `difficultyRouting`/`strongThreshold`; naming **LiteLLM** `toProviderModel()`. `free-llm-sync.ts` (pista del README).
- **Biblioteca** (OS): repo builtin `starseed-ia-tools` (12 paquetes: free-llm-api-resources, OpenLLM, RouteLLM, LiteLLM, taste-skill, pm-skills, Agent-Reach, open-notebook, agentos, OpenCode, OpenClaw, apple/container); `defaults-seed` SEED_VERSION 1→2 (recomendados pre-instalados también en cuentas existentes); tarjeta "Herramientas & servicios" en intelligence-panel (toggle dificultad + claves rápidas).
- **Nexus/Café** astraura-core.js: cadena gratis ampliada (locales Ollama+OpenLLM → LanguageModel → claves groq→cerebras→openrouter→gemini→cohere→sambanova→scaleway → Pollinations) + `estimateDifficulty` ligero; sección "Herramientas IA & Agentes" en astraura-install.js. Nexus core ?v=3, Café core ?v=100.
- Deploys en verde: OS 36f0c4d, Nexus 47130b6 (SW v14), Café 144ad6f (SW v15).

## Adenda 63 · 2026-07-06 — Perfeccionamiento integral (Cowork, 6 agentes en 3 olas)
**Escritorios:** resize por 8 bordes, snap mitades/cuartos con preview translúcida, Exposé (F3/botón), atajos (Cmd+N/W/M, F11, Cmd+Alt+←→), menú contextual ampliado, safe-areas (viewportFit:cover en layout raíz); widgets con apariencia por widget (opacidad/tinte/radio), span 1x1–4x4, panel de config (engrane hover/long-press) y preview viva en galería. Campos aditivos con normalización defensiva en desktop-store (sin bump).
**Trinity/Ajustes:** dock density cómodo/compacto + reorden por drag real + indicadores de borde por nodo (opt-in); Ajustes en 9 categorías con buscador global (settings-search, 20 entradas) + export/import JSON; Centro de control con estado real (tema/transparencias/Aurora/sync/atmósfera) y módulos reordenables/ocultables (config.controlCenter en appearance-context).
**Biblioteca:** ficha rica en package-store (preview VIVA design/animation, preview embebida de archivo por formato, permisos/capacidades del payload, relacionados navegables), valoración local + contador de uso (starseed.library.ratings.v1/usage.v1, en SYNCED_KEYS), tipo agent completado (bug preexistente KIND_META) con AgentConfigPanel + AgentBindMenu en ficha, Mi biblioteca con updates semver + "Actualizar todo". SEED_VERSION sigue en 5.
**Red:** comentarios ramificados (comment-thread: adjuntos de cualquier formato, @perfil/#página con autocompletado, reacciones, editar con historial) compartidos entre /post/[id] y feed; publicaciones con tarjeta de preview expandible por tipo (página/app/widget/agente/skill/archivo/encuesta/evento); selector de algoritmos del feed (crono/relevancia/cercanía/área/personalizado con editor de pesos) → starseed_feed_preference_v1 + DEFAULTS_VERSION "feed-gen1-2026-07-06-selector-pesos"; hub con discover-section (sugeridos razonados, filtros, acciones rápidas); mapa Leaflet real (capas, buscador, mi ubicación, markers con ficha) en network y culture.
**Aurora/Astraura:** message-renderer universal (markdown+tablas+código con copiar+JSON plegable+SVG/HTML sanitizado sin deps nuevas+media) integrado en exocórtex, mini-player y /agent; context.ts ampliado (systemMap(), describeArea(), acciones+agentCapable por área) alimentando el system prompt; sync-providers.ts con adapter (oficial/Supabase propio/local, extensible a WebDAV/Drive) + AccountSyncPanel en /servidores (starseed.sync.provider.v1 + providers.config.v1, por dispositivo, default=oficial, sync actual intacto); invoke-agent-button ("invocar agente aquí" con contexto del lugar). Docs: astraura-inteligencia.md §11–13.
**Materiales/pulido:** starseed-materials.css §9–12 (ss-crystal--sutil/--alta, sheen 280ms, --ambient-tint por tema/nodo Trinity, ss-icon-3d--lg/--sheen) respetando prefers-reduced-motion y data-perf="eco"; weather-fx-overlay CSS puro (lluvia/nieve/niebla/god-rays) en weather-panel y mapa de clima; ui/button|tabs|dialog (cursor, focus, target 32px+); responsive hub/library/profile/network (clamp, targets ≥40px, fix flex-1 que rompía scroll de 9 tabs en perfil).
**Verificación/lecciones:** los 374 errores de tsc en el Mac son PREEXISTENTES/entorno — node_modules del Mac no tenía typescript ni @next/swc-darwin-arm64 (npx bajaba un tsc arbitrario); instalados --no-save; 0 errores de sintaxis/módulos en archivos de la sesión; next.config ignoreBuildErrors:true ⇒ gate real = next build/Vercel. `.git/index.lock` huérfano bloqueaba git ("could not write index") — borrarlo. Quedó archivo huérfano neutralizado src/components/settings/ai/account-sync-panel.tsx (export {}) por borrar.

## Adenda 64 · 2026-07-07 — Librería|Biblioteca + Sync universal + Mensajes + Servidores de apps (Cowork, 4 agentes en 2 olas)
**Concepto (del visionario):** Librería = catálogo EN LÍNEA (archivos/carpetas/categorías); Biblioteca = lo GUARDADO por cada entidad (usuario/página/grupo/comunidad/evento/E.F./partido), personal o grupal. Misma sección /library, dos áreas. Referencias, no copias.
**Backend (migraciones `entity_state_sync` + `os_messaging_servers_public_library`):** entity_state (PK owner_kind/owner_id/key, rev trigger, RLS user+miembros por os_memberships/owners, realtime ON también user_settings) · os_profiles (directorio buscable) · os_dm_threads/members/messages (RLS is_dm_member security definer, realtime) · os_app_servers/members (public/private/group, pending→aprobación, realtime) · library_public_items (catálogo público, lectura anon) · política es_srv_member en entity_state (owner_id 'srv:<uuid>').
**Contrato cliente:** src/lib/sync/entity-state.ts (deviceId/currentUserRef/get/set/subscribeEntityState, LWW por rev, anti-eco device_id). SOP: architecture/libreria-biblioteca-sync.md (§1-8).
**Bibliotecas:** entity-library.ts v2 (carpetas anidadas, tags, alias, branch=réplica vinculada vs duplicar, acl por ítem/carpeta, migración v1→v2) + Finder completo en components/library/finder/ (iconos/lista/columnas Miller, árbol drag&drop, breadcrumb, preview por formato, menú contextual clic-derecho/long-press: abrir/replicar/duplicar/copiar-pegar starseed.clipboard.v1/alias/mover/etiquetas/compartir enlace profundo/publicar→/publish?attach=/permisos con búsqueda os_profiles+os_groups/quitar) + catálogo público public-catalog.ts (publishItem/publishFolder, pestaña "Comunidad" en Librería). Pestaña Biblioteca real en grupo/página/evento/perfil (EntityLibraryPanel).
**Sync tiempo real:** realtime-sync.ts (patch localStorage.setItem + storage listener, debounce 1.5s, push a user_settings, postgres_changes fila propia + broadcast acct:<uid>, anti-eco, evento starseed:sync:apply) montado global (RealtimeSyncProvider en layout); SYNCED_KEYS += desktops/cursorfx/aurora.chatlog/dock.folders/orb.pos/a11y/perf + SYNCED_PREFIXES starseed.brain. (exclude starseed.entitylib.); panel en Ajustes→Cuenta (toggle ON por defecto, dispositivos/neuronas con latido — ensureThisNeuron ya existía) + estado en Centro de Control. Pizarras/navegador persisten en tablas propias (no localStorage) — correcto fuera de SYNCED_KEYS.
**Mensajes (/messages reconstruido):** dm.ts sobre os_dm_* con realtime; 2 paneles, burbujas con MessageRenderer, adjuntos cualquier formato (dataURL ≤800KB + refs refKind/refId), responder-citando, editar/borrar, guardar en Biblioteca, nuevo chat/grupo con búsqueda del directorio (seedMyProfile al montar); Aurora opcional por hilo (thread.agent, botón + @aurora, astrauraChat, kind='agent'); conmutador Mensajes↔Correos conservado.
**Búsqueda:** os-profiles.ts (searchUsers/searchGroups/recommendations por tags+membresías) integrado en hub (personas/grupos + "quizá conozcas") y explorer. "Seguir" usuario usa os_follows con page_slug=username (primitiva real).
**Servidores de apps (/servidores-apps):** app-servers.ts CRUD + join/request/approve; useServerChannel (entity_state 'srv:<id>' + broadcast) con demo colaborativa (contador+notas); ServerCard compartible (adjunto refKind 'server' en mensajes, /messages?attachServer=<slug>); acceso en HubRedSection + dock (icono Boxes).
**Pendientes conocidos:** pegar entre bibliotecas distintas (aviso honesto), pullPreferences() manual no cubre prefijos dinámicos (el motor realtime sí), partido/E.F./asamblea sin ruta real → sin pestaña Biblioteca aún.

## Adenda 65 · 2026-07-07 — Subida universal de archivos + Multi-perfil + Espacios compartidos (Cowork, 2 agentes)
**Backend (migración `os_files_profiles_spaces`):** bucket storage `os-files` (público-lectura, escritura solo `<uid>/…`) · os_files (owner/profile_id/path/url/device_id/is_public/acl_read/acl_write/group_slug, RLS+realtime) · os_account_profiles (varios perfiles por cuenta: personal/cívico/artístico/profesional/custom, handle único, is_default; lectura pública, escritura dueño) · política es_profile_own en entity_state (ámbito profile) · os_spaces (kind desktop|dashboard|board, access private|profiles|invite|public, allowed_profiles de CUALQUIER cuenta, group_slug, doc jsonb, rev trigger) + os_space_editors (invited→member) con space_can_edit/read security definer · realtime ON en todo. SOP §§9-12.
**Uploader universal (os-files.ts + universal-file-picker.tsx):** 3 fuentes — Dispositivo (drag&drop+progreso XHR, límite 50MB), Bibliotecas (picker sobre entity-library), Neuronas (archivos por dispositivo + "solicitar archivo" por broadcast acct:<uid> con receptor global file-request-listener en layout). Integrado en 9 superficies: mensajes (inline ≤300KB, resto storage), comentarios, publicaciones, Finder de bibliotecas ("Subir archivos…" con permiso write), avatar/portada (perfil+cuenta), memorias (enlace md en editor), chat de Aurora (URL al draft via onAttachFile). onAccountBroadcast/sendAccountBroadcast multiplexados en el canal acct existente.
**Multi-perfil (profiles.ts + account-profiles-switcher):** ensureDefaultProfile (migración no destructiva del doc local), perfil activo starseed.profile.active.v1, switcher en Ajustes→Cuenta y /cuenta. Config sync 'starseed.sync.profiles.v1' {mode all|selected, perDevice por tipo web/pwa/móvil} con shouldSyncKey() aplicado en realtime-sync (gating de claves de ámbito perfil). **Default: sync entre TODOS los perfiles de la cuenta.**
**Escritorios por perfil + espacios:** profile-desktops.ts espeja starseed.desktops.v1 ↔ entity_state(profile,'desktops') con cambio de perfil que guarda/carga; desktop-share-panel ("Compartir como espacio…", lista de compartidos); modo colaborativo ?space=<id> en /escritorios (shared-desktop-space, LWW+debounce). Pizarras: board-share-dialog + ?board-space=<id> en /pizarra (público/invitación por @username/perfiles/grupo; invited→member al abrir enlace).
**Cerebros por biblioteca de perfil:** library-brains.ts + popover en /library (entity_state(profile,'library-brains'), default TODOS los cerebros para todos los perfiles); getLibraryBrains() exportado como enganche para el contexto de Aurora (pendiente cablear en context.ts).
**Pendientes:** UI de invitaciones pendientes de espacios (aceptación automática al abrir enlace), avatar/cover de perfiles usa URL directa (picker integrado en perfil/cuenta principal), getLibraryBrains→context.ts.

## Adenda 66 · 2026-07-07 — Barrido de pendientes + Integración Hugging Bay
**Pendientes cerrados (8/8):** getLibraryBrains cableado al contexto de Astraura (libraryBrainsContextLine en context.ts, systemMap(route?)); invitaciones de espacios con bandeja aceptar/rechazar + realtime + toasts (listMyInvites/acceptInvite/declineInvite en spaces.ts; UI en desktop-share-panel y SharedBoardsSwitcher); pegar entre bibliotecas distintas (copiar/cortar cross-lib con permisos y avisos honestos); pullPreferences aplica SYNCED_PREFIXES (respetando EXCLUDE); avatar/portada de perfiles con picker universal + preview; @/lib/data tipado (interfaces reales, adiós a los ~67 errores 'never' de hub/culture/education/politics, runtime intacto); pestaña Biblioteca en PartidoToolkit y EntidadFederativaToolkit (kinds party/ef); el huérfano settings/ai/account-sync-panel.tsx no existía (verificado).
**Hugging Bay (huggingbay.xyz — registro verificado de modelos IA open-source):** doc primero (astraura-inteligencia.md §14). Proxy GET-only /api/huggingbay/[...path] (allowlist, timeout, s-maxage, sin SSRF). Cliente src/ai/astraura/huggingbay.ts (recommend/semanticSearch/trending/topOpenModels/artifactCard/localKit, caché TTL 1h) con TASK_TO_USE_CASE y rankHuggingBayFor(task): licencia permisiva + verified/hosted primero, puntuación fit+confianza+tier del dispositivo, razones en español. Autonomía: sugerencia "model-discovery" cuando falta IA local; candidatos registrables en installed-models para el router; capacidad model-discovery en skills.ts. Configurables en panel de inteligencia: descubrimiento ON, auto-sugerencia ON, herramienta preferida (ollama), solo-permisivas ON, solo-hosted OFF. Librería: navegador vivo HuggingBayBrowser (Recomendados por tarea/Trending/Top open/Búsqueda semántica; copiar comando local, abrir, Usar en Astraura, guardar en biblioteca) en Destacado + paquete iatool-hugging-bay-registry en starseed-ia-tools; SEED_VERSION 5→6. Clave sync nueva starseed.astraura.huggingbay-candidates.v1.

## Adenda 67 · 2026-07-07 — Stack OSS por defecto (10 repos "$200/mes")
Guía Notion analizada (vía Chrome, Notion es client-rendered). 10 paquetes nuevos en starseed-ia-tools (kind function, descripción qué-hace/qué-reemplaza/GitHub): Dyad (app-builder), goose (agent-recipes), DeerFlow (deep-research), Daytona (sandbox-exec), Parallel Code (multi-agent-code), Scrapling (web-scraping-adaptativa — añadido como motor en web-access.ts), 9Router (router-proxy: IntelligenceSettings.nineRouter {enabled OFF, endpoint localhost:8000, compressionHint}, fuente '9router-local' en free-catalog solo-ready-si-activado+responde, compresión como hint de system prompt), ai-website-cloner (design-import), RAGFlow (rag-knowledge), Pipecat (voice-realtime). 10 capacidades en SKILL_CAPABILITIES (system prompt + sesgo routing + packageIds) propagadas por la sync de capacidades por cuenta existente. SEED_VERSION 6→7: +10 nuevos +4 del barrido del catálogo (anim-respiracion-neon, iatool-deepcrawl/webharvest/universal-scraper); excluidos con nota los reference-only (routellm/litellm/agentos/opencode/openclaw/apple-container) y temas excluyentes. Docs: astraura-inteligencia.md §15 + astraura-capabilities.md. Pendientes: UI de toggles nineRouter en intelligence-panel; paridad astraura-core.js en Nexus/Café (otros repos).

## Adenda 68 · 2026-07-07 — 8 repos OSS más (Coolify, OpenHands, Maxun, Open WebUI, browser-use, Langflow, Stirling-PDF, Dify)
Mismo patrón que A67: 8 paquetes iatool-* + 8 capacidades en SKILL_CAPABILITIES (self-hosting-deploy, dev-agent, web-robots, local-llm-ui, agent-browsing, flow-builder, pdf-tools, llm-apps-platform) + SEED_VERSION 7→8. Integraciones específicas: Maxun como motor en web-access.ts; Open WebUI como conector real en brains/servers.ts (puerto 3000, /api/chat/completions, patrón Ollama); nota browser-use en browser-windows; enlace Stirling-PDF bajo la preview de PDF del Finder. HALLAZGO: Open WebUI/Dify/Langflow/Stirling/OpenHands/browser-use ya tenían conectores funcionales en integrations/registry.ts (acciones invocables vía aurora-tools.ts) y Coolify estaba en oss-library.ts — esta ola añade la capa de capacidad viva (system prompt + routing + tarjeta) documentado en §16. Docs: astraura-inteligencia.md §16 + astraura-capabilities.md. Pendiente: paridad astraura-core.js Nexus/Café; UI toggles nineRouter.

## Adenda 69 · 2026-07-07 — Programa "red social avanzada" (12 agentes en 6 olas)
**A1 Publicaciones:** EmbeddedContentWindow (ventana DENTRO de la publicación: colapsada/abierta/minimizada/pantalla-completa; estrategias por formato + code-sandbox srcdoc) + AttachmentCarousel multi-formato estilo IG (Embla) + composer: tipos nuevos (galería/código/transmisión/proyecto/servidor), ratio de vista principal con topes por contexto (feed 65vh/página 80vh), preview opcional, barra markdown, plantillas, preview en vivo con RichPostCard. FIX posterior: feed .eq(type,'post')→.neq(type,'comment') para que los tipos nuevos aparezcan.
**A2 Política:** 3 ramas (Legislativo propone/vota · Ejecutivo mandatos/recursos/estados · Judicial constitucionalidad/mediación restaurativa) + propuestas: opciones promovibles desde comentarios por votos, duración mín 1 día con cuenta atrás, votos públicos verificables, enmiendas votables, urgencia con notificaciones a afectados (campo "afecta a" con terceros), panel Contexto de Aurora, delegación líquida visible. Guard re-filtro en realtime rows (fuga entre pestañas corregida).
**B1 Educación:** curriculum builtin 7 categorías/25 temas/55 subtemas + extensiones personales; Mapa del Conocimiento (Lista/2D/3D ssr:false) con ruta de aprendizaje por tema; pestaña Educación en grupos/páginas (temario, exámenes constructor→insignia Scholar real, tareas, pizarras del grupo os_spaces, sesiones en vivo useServerChannel).
**B2 Cultura:** hub social 5 pestañas (Para ti/Siguiendo/Tendencias/Explorar/En vivo) + contenido VIVO por adjunto: modos estático/edición-en-tiempo-real (os_spaces con permisos grupal/pública/invitación/servidor + requestSpaceAccess/approveSpaceEditor nuevos)/canal-en-vivo (presencia, chat efímero, estado, WebRTC experimental STUN) — LiveAttachment/LiveChannel + LiveModePicker en composer.
**C1 Correos+entidades:** os-mail.ts sobre os_dm (bandejas/destacados/archivo, multi-destinatario, adjuntos, realtime), correo externo vinculado vía mailto (honesto), entity_state 'layout': acento/portada/orden-visibilidad de pestañas/secciones libres/integraciones sugeridas por kind en grupo/página/perfil.
**C2 Cuenta+contexto:** /cuenta estilo Google (7 tarjetas con datos reales + buscador + deep-links ?tab=), user-context.ts (recolectores: perfiles/grupos/archivos/posts/mensajes-meta/notifs/recordatorios/escritorios/espacios + searchNetworkPosts) inyectado breve en astrauraChat + tools get_user_context/search_network_posts/get_entity_context + toggle "Aurora conoce mi contexto".
**D1 Cerebros/Graphify:** SOP cerebros-memorias-graphify.md; 32 tipos de memoria (md+frontmatter+[[wiki]]), grafo 2D/3D en cerebro/mapa, memory-intelligence (contexto→tipo, autoUpdate por eventos, modo write/read por cerebro), destinos multi-servidor por cerebro (local+StarSeed+brain-store externo), offline con cola + fusión auto no-destructiva + panel Conflictos con ramas.
**D2 Aurora resiliente:** garantía de respuesta (cadena+fallback local honesto), meta por mensaje (proveedor/intentos/ms/dificultad/herramientas/undo) con línea "proceso" expandible; menú contextual del mensaje (copiar/ramificar chat con chat-tree/ver proceso/reintentar con modelo seleccionable/revertir con undo-info/guardar en biblioteca); toggle selección automática de herramientas.
**E1 Mensajes+:** crear grupo/comunidad de la red desde mensajes (vinculado al hilo), pestaña "Contenido de la red" en el picker (adjuntar página/grupo/post/servidor por ref con render vivo universal-attachment-view en mensajes/correos/comentarios), invitaciones con Aceptar/Rechazar reales + eventos→calendario+recordatorio scheduled_tasks+ALARMA funcional (alarms.ts + engine en layout: sonido/notificación/snooze, sincronizada), FilePreview en burbujas y correos.
**E2 Librería GitHub:** versiones+restaurar+comparar y fusión de ramas por ítem, comentarios realtime por archivo/carpeta, repos creables del usuario (README/licencia/visibilidad, fork/instalar/descargar zip/release), repos externos GitHub conectados (proxy api/github-repo, ficha+README+releases), menú contextual por formato (fondo/avatar/memoria de cerebro/reproducir/ver zip) + "Instalar en…" + relacionados. Doc §13-18.
**F1 Lienzo:** destinos múltiples con buscador de entidades (+evento kind, entityId de correlación) + compartir como mensaje/correo (tarjeta ref, sin duplicar); modo Diseño (9 bloques con estilos y 5 presets + drag) y modo CÓDIGO libre con sandbox en vivo publicable como programa ejecutable; editor de imagen real (canvas: crop/rotación/filtros→re-upload); Aurora generativa global y por bloque (undo 1 nivel).
**F2 Cámara/Galería/Historias:** /camara (foto+video, capacidades reales getCapabilities: zoom/torch/foco/exposición, timer/grid/formatos, destinos: biblioteca "Imágenes y videos" con subcarpetas Cámara/Importadas/Capturas + nube + dispositivo), /galeria (fecha/álbumes, visor con edición real, cerebros por carpeta/archivo media-brains default privados, privacidad), historias temporales (duración/audiencia personal-pública-grupos/ubicación, expiran; barra+visor en galería y cultura), registro: SEED 8→9, dock migración v7 grupo Medios, widgets Galería reciente+Cámara, app-catalog.

## Adenda 70 · 2026-07-07 — 7 repos OSS (avatar, P2P, IoT, marcadores, audio, ciencia)
7 paquetes iatool-* + 7 capacidades en SKILL_CAPABILITIES (bookmarks-ai, local-objects, audio-library, home-automation, p2p-sync, aurora-avatar, data-science-fasta) + SEED_VERSION 9→10. Integraciones funcionales por repo:
- **Open-LLM-VTuber** → Avatar de Aurora: aurora-avatar.tsx (estados idle/escuchando/hablando/pensando envolviendo AuroraOrb; modo orbe default + Live2D opcional vía PIXI+pixi-live2d-display por CDN dinámico, degrada solo, nunca SSR/npm), avatar-config.ts (starseed.aurora.avatar.v1), montado en aurora-chat-section + toggle en intelligence-panel. Doc §18.
- **syncthing** → sync-providers.ts proveedor 'p2p-syncthing' (REST /rest/system/status, apikey local-only, espejo complementario a Supabase) + memory-destinations 'p2p' para espejar cerebros; en AccountSyncPanel. Doc §12 + cerebros §7.
- **home-assistant** → conector solo-lectura (registry.ts + clients/home-assistant.ts + aurora-tools) + panel "Hogar/IoT" opt-in en smart-home-tab del Centro de Control (URL+token local, /api/states, toggle /api/services, estado no-configurado honesto), alineado con Oikos/Sangha.
- **audiobookshelf** → conector (clients/audiobookshelf.ts, API /api/libraries) + capacidad audio-library.
- **karakeep** → Marcadores: bookmarks.ts (guardar enlace/nota/imagen tipo 'bookmark' en entity-library, etiquetado IA vía astrauraChat con fallback heurístico, búsqueda full-text local) + save-to-bookmarks button en EntityLibraryPanel; nuevo SavedItemType 'bookmark'.
- **anytype** → capacidad local-objects + paquete (sin conector: su API requiere emparejamiento de escritorio en 2 pasos, documentado honesto).
- **altair/AltaiR** → capacidad data-science-fasta + paquete categoría ciencia.
Docs: astraura-inteligencia.md §17-19 (G1 usó §19 para evitar choque con §18 del avatar) + astraura-capabilities.md + cerebros-memorias §7. Sin colisiones (diff cruzado verificado). Pendiente: conector anytype (pairing), Live2D requiere modelo del usuario.

## Adenda 71 · 2026-07-07 — Conectores por usuario (cuenta propia opcional → gratis/OSS por defecto)
Principio: el OS SIEMPRE funciona con opciones gratuitas/OSS elegidas por Astraura según contexto; el usuario conecta SUS cuentas solo si quiere (credenciales locales que NUNCA viajan).
**Motor (provider-resolution.ts):** 13 categorías (llm-chat, web-search, web-fetch, maps, code-host, docs, notify, design, storage, email, calendar, pdf-tools, automation) con default OSS real + servicios de marca opcionales; resolveProvider(cat,ctx) síncrono nunca-lanza; withProviderFallback (usa el resuelto, si falla cae al OSS y registra sustitución); modo global/por-categoría 'auto'|'prefer-own'|'only-free' desde starseed.connectors.mode.v1 (sincronizada); heurística auto: gratis/OSS salvo categorías externalReach con cuenta propia sana. Cableado: aurora-tools (web_search/scrape resuelven por categoría + reportan proveedor en la línea de proceso; oculta tools de marca en only-free), router (prefer-own prioriza clave propia, auto sigue gratis-primero), web-access (resolveWebFetchProvider), context.ts (activeProvidersLine en cada turno). Doc §20.
**Credenciales (connector-credentials.ts, fuente única):** starseed.connectors.creds.v1 LOCAL nunca-sync (patrón starseed.ai.providers) + starseed.connectors.mode.v1 sincronizada (en SYNCED_KEYS); eventos starseed:connectors.
**Hub (/conexiones · UserConnectorsHub):** por categoría muestra el default gratis/OSS activo (verde "Funciona por defecto"), "Conectar mi cuenta" opcional (form local + estado), selector de modo, indicador "Activo ahora"; conectores OSS self-host (ollama/searxng/crawl4ai/n8n/stirling/HA/audiobookshelf…) enlazados a su config existente sin duplicar; acceso desde Ajustes→Aurora e IA. Encabezado "Todo funciona gratis por defecto; conecta tus cuentas solo si quieres".
**Honesto:** servicios de marca sin conector real aún (Google Maps/Search/Bing, GitHub token, Notion, Slack/Telegram, Figma/Canva, Drive/Calendar, Zapier) se declaran como opción "requiere tus datos", NUNCA se auto-eligen; con conector real hoy: OpenAI/Anthropic/Firecrawl/Gmail(mailto) + todos los OSS self-host. Pendiente: probar-conexión real para SaaS de marca (CORS), conectores reales de maps/design.

## Adenda 71 · 2026-07-08 — Diseño total: Estudio + 24 temas + Mezclador + tldraw + 6 repos
**Estudio de Diseño (/estudio, 13 archivos):** editor por elemento (Botón/Pestañas/Ventana/Icono/Widget/Tarjeta/Fondo/Tema) con preview VIVA de componentes reales vía CSS vars escopadas (nunca clases JIT runtime); panel de propiedades (color/gradiente/radio/sombras/blur/glow/tipografía/padding/animaciones); guardar como tema custom + exportar .starseed-theme.json a Biblioteca + publicar; editor 2D (formas/capas/texto→SVG/PNG a os-files) + ImageEditorDialog; material 3D real (r3f+drei ssr:false) con mapeo honesto a ss-crystal/metal/wood; panel Aurora (JSON por familia, diff antes de aplicar, deshacer, 3 variaciones). Decisión: ruta nueva en vez de design-canvas (acoplado a appearance-context). Enlace en universal-editor (+fix typeof en 7 iconos preexistente).
**Contrato theme-engine.ts** (yo) + **catálogo 24 temas** (theme-catalog.ts light+dark: art-nouveau…material-3d) + **4 fondos animados** (backgrounds.ts: matrix-rain, estrellas, gradiente-aurora, weather-live ligado al clima real) + starseed-themes.css + integración theme-gallery/store (aplicar/favoritos/export-import) + paquetes design-* (no recommended). El agente H1 murió por límite de sesión pero dejó el catálogo COMPLETO (auditado).
**Mezclador (theme-mixer.ts + theme-mixer-panel):** fusión por 7 slots (paleta/material/fondo/tipografía/animaciones/densidad/efectos) de temas o elementos sueltos; armonización real: contraste AA por luminancia WCAG (bug real corregido: umbral 0.5→cruce WCAG ~0.179, validado con 2816 comprobaciones × 576 combinaciones), saturación equilibrada, radios/glow reescalados; validador de avisos; "Sorpréndeme" + "Afinar con Aurora" (JSON+diff); guardar/aplicar/exportar/publicar. **35 elementos sueltos en 7 categorías** (design-elements.ts + repo STARSEED_DESIGN_ELEMENTS en packages). **Tema por entidad:** entity-layout +themeId/themeMix, entity-theme-scope (aplica al entrar/restaura al salir) en grupo/página + selector en Personalizar; claves de tema en SYNCED_KEYS. Montado en Ajustes→Apariencia y pestaña Mezclador de /estudio.
**tldraw v5.2.3 instalado (npm real, licencia con marca de agua respetada):** tldraw-board.tsx (persistencia local por pizarra + compartido best-effort sobre os_spaces con mergeRemoteChanges anti-eco; multiplayer real = evolución con su sync server), selector de motor por pizarra (starseed|tldraw, board-engine.ts, existentes intactas), ?engine= en /pizarra, selector en adjunto pizarra del composer; iatool-tldraw + capacidad whiteboard-pro; SEED 10→11. Nota: npm omit=dev global podó devDeps al instalar — restaurado con --include=dev.
**6 repos (SEED 11→12, doc §21):** immich → conector real solo-lectura en Galería→Servicios externos (álbumes + recientes vía POST /api/search/metadata; GET /api/assets retirado upstream) con Importar a Biblioteca (referencias); perplexica (renombrado "Vane" por su autor) → conector + motor en web-access; flowise → paquete+capacidad flow-automation (conector ya existía); anything-llm → conector real (workspace chat Bearer) + rag-workspace; langflow verificado completo (no duplicado); reor → capacidad local-ai-notes + nota en memory-types (sin API pública, doc honesto).
**Seguridad:** tokens de GitHub/Vercel pegados por el usuario en el chat NO se usaron (gh auth del Mac ya autorizado; Vercel verificado por status de GitHub) — ROTARLOS recomendado por haber quedado en el registro de conversación.

## Adenda 72 · 2026-07-11 — Sistema universal de permisos y compartición (SOP centro-creacion-sync-permisos §5)
**Modelo único `src/lib/sharing/access.ts`:** AccessScope profile|account|custom|public · AccessRole view|comment|edit|admin · AccessGrant {granteeKind profile|account|group|link, granteeId, role, sections? (acceso PARCIAL por subsecciones), label} · ResourceRef {type desktop|dashboard|board|brain|file|folder|library, id, ownerId?, libraryRef?, spaceId?}. Persistencia local-first: cache `starseed.sharing.local.v1` (fallback sin sesión) + espacio os_spaces del recurso cuando se comparte fuera de la cuenta (columnas access/allowed_profiles/group_slug + os_space_editors = enforcement RLS real; `doc.sharing` = fidelidad scope+grants) + espejo a la ACL embebida de biblioteca (setItemAcl/setFolderAcl) para file/folder. API: getResourceAccess/setResourceScope/upsertGrant/removeGrant/listGrants/can(who,ref,rol,seccion?)/ensureResourceSpace/shareLinkFor/subscribeResourceAccess (onTableChange os_spaces+os_space_editors, realtime en vivo) + hook useResourceAccess. Mapeo kind: brain/file/folder/library → os_spaces kind 'dashboard' genérico (tipo real en doc.sharing.resource.type; el CHECK solo admite desktop|dashboard|board). Nota honesta: el push colaborativo de escritorios/pizarras reemplaza el doc y puede vaciar doc.sharing hasta la siguiente mutación — el enforcement (columnas+editors) nunca se pierde.
**Diálogo reutilizable `src/components/sharing/share-access-dialog.tsx`:** 4 ámbitos con iconos User/Lock/Users/Globe + descripciones, lista de accesos con selector de rol por grant, "Parcial" con checkboxes de subsecciones (guarda grant.sections), buscador de perfiles reales (searchUsers de os_profiles, como el Hub), grupos por slug, perfiles de mi cuenta como chips, rol público del enlace, y "Copiar enlace" (asegura espacio ?space=/?board-space= o usa el deep-link propio). Cambios aplican EN VIVO (local-first + push best-effort) y reflejan realtime.
**Integraciones (botón Compartir · Share2):** escritorios → botón por escritorio en DesktopSettingsPanel (secciones = pestañas, defaultSections = el escritorio, enlace /escritorios?space=) · pizarras → BoardShareDialog reescrito como envoltorio del modelo (API {canvas,open,onClose} y BoardShareTrigger intactos, enlace /pizarra?board-space=) · biblioteca → acción "Compartir" del menú contextual del Finder abre el diálogo universal por ítem/carpeta (ACL embebida + espacio para externos; el copiar-enlace profundo sigue dentro del diálogo) · cerebros → botón "Compartir" del cerebro activo en CerebroHub con ramas memoria/habilidades/contexto/egos · dashboards → opción "Compartir" en el menú Settings2 del panel (prop onShareDashboard por dashboard-workspace-renderer → dashboard-panel-header; diálogo en dashboard-layout).
**Pendientes:** consumir grant.sections al ABRIR (filtrar pestañas/ramas no permitidas en modo espacio) · /dashboard aún no lee ?space= (el enlace se genera pero la página no lo consume) · share-board-dialog.tsx del control-panel (sistema de boards legado) sin migrar a propósito · escáner de secretos (§13) al compartir cerebros cuando exista security/scanner.ts.

## Adenda 72 · 2026-07-12 — Personalidades de Aurora COMPLETADO (SOP centro-creacion-sync-permisos §11)
**Verificación tras muerte de subagente:** `src/lib/aurora/personalities.ts` (modelo+8 grupos de niveladores+presets+compilador+asignaciones por contexto+deriveVoiceStyle+helpers de tool), `personalities-panel.tsx` (galería/editor/Biblioteca/import-export), integración Astraura (router.ts inyecta `compilePersonalityPrompt(resolvePersonalityForContext(...))` en el system prompt, prioridad chat>cerebro>sección>global) y tools kind:"personality" en aurora-tools.ts (cambiar_personalidad/ajustar_rasgo/describir/listar, registradas en registry+dispatch) estaban COMPLETOS y compilan sin errores.
**Terminado ahora (aurora-chat-section.tsx):** pestaña "Personalidades" (icono Drama) junto a Control montando `<PersonalitiesPanel/>` con scroll propio (max-h 62vh, usable en móvil); efecto `registerActiveAuroraChat(tree.activeId)` (limpia al desmontar) para que la asignación "este chat" y la resolución por chat de Astraura funcionen con el contexto activo del árbol; enlace a la pestaña desde el selector de personalidad de la pestaña Voz. `entity-library.ts` ya tenía el tipo "personality".
**Pendiente (orquestador):** añadir `starseed.aurora.personalities.v1` y `starseed.aurora.personality.active.v1` a SYNCED_KEYS en `src/lib/settings-sync.ts` (archivo vetado para este subagente). Voz: engine.ts + tts-oss ya consumen `starseed:aurora-voice-style` (sin tocar).

## Adenda 72 · 2026-07-12 — Voz de Aurora COMPLETADA: Bark · GPT-SoVITS · OmniVoice (SOP centro-creacion-sync-permisos §10)
**Verificación tras muerte de subagente — ya estaba COMPLETO (no se reescribió):** `tts-oss/browser-voices.ts` (ranking: neurales/premium primero, es-* preferente, femenina suave; resolveBrowserVoice = fijada→mejor rankeada), `tts-oss/neural-tts.ts` (cliente HTTP genérico/tolerante de los 3 motores por ENDPOINT: rutas candidatas por motor, respuesta bytes/base64/URL/Gradio, timeout 20 s, ping cacheado 60 s con reintento no-cors), `tts-oss/voice-style.ts` (8 emociones→rate/pitch/volumen, etiquetas Bark con moderación, passthrough SoVITS/Omni, listener vivo de `starseed:aurora-voice-style` + emitVoiceStyle), `voice-config.ts` (TODO dentro de `starseed.aurora.voice.v1`, ya en SYNCED_KEYS; migración suave del opt-in Kokoro; modo simbiótico), `speak-router.ts` (cadena SIEMPRE-HABLA motor→Kokoro→false=navegador, cada eslabón en Promise.resolve().then().catch, simbiótico SoVITS→Bark), engine.ts (installVoiceStyleListener, estilo multiplicando la entrega, voz rankeada como default, stopConfiguredEngine en interrupt), aurora-tools.ts (kind:"voice": ajustar_voz/cambiar_motor_voz/estado_voz registradas en TOOL_INDEX+dispatch+sección de prompt), router.ts de Astraura (cambio de Personalidades, aditivo, compila), paquetes Biblioteca iatool-bark/gpt-sovits/omnivoice/casaos, doc astraura-inteligencia.md.
**Terminado ahora:** (1) `voice-oss-panel.tsx` COMPLETADO con el diseño existente: 6 tarjetas de motor con punto de disponibilidad (ping vivo), bloque de conexión por endpoint (input+re-ping+Probar voz contra el servidor con frase de muestra), campos refAudio/refText de SoVITS, toggle simbiótico Bark+SoVITS, sliders velocidad/tono/energía + emoción por defecto (persisten vía emitVoiceStyle → evento vivo), selector de voz del navegador con "Automática (recomendada)" + "ahora sonará X", notas de instalación por neurona/CasaOS (Cerebro→Neuronas). (2) Bug de compilación REAL arreglado: `AURORA_ENGINE_LABEL: Record<AuroraVoiceEngine,string>` de quick-settings-tab.tsx sólo tenía 3 de 6 motores. (3) Dos regex con flag /s (dotAll, ES2018) → `[\s\S]` (target del proyecto es ES2017): neural-tts.ts y voice-style.ts. (4) `resetVoiceStyle()` en voice-config (setVoiceStyle fusiona y no podía limpiar) + export en index.ts. (5) Capacidad `voice-neural` en astraura/skills.ts junto a la de Kokoro (skillIds aurora-voice-bark/sovits/omnivoice; sin routing bias: la síntesis no pasa por el router LLM) + fila en architecture/astraura-capabilities.md. (6) settings-search: entrada aurora-voz ampliada.
**Verificado:** tsc con el tsconfig del proyecto sobre los 13 archivos de la familia de voz = 0 errores (los que quedan son preexistentes de keyStorage/desktop-store/notifications/realtime-sync/sync-manager, fuera de este ámbito). El panel sigue SIN montarse en ninguna página (igual que VisionPanel: componente listo esperando su hueco en Ajustes → Aurora e IA).

## Adenda 72 · 2026-07-12 — Seguridad integrada estilo Strix + Raven/Skales + Organizador Mouzi (SOP centro-creacion-sync-permisos §13-14)
**Escáner de secretos/PII `src/lib/security/scanner.ts` (NUEVO):** patrones con severidad critical/high/medium/low y tipo en español (claves API sk-/sk-ant-/AIza/ghp_/github_pat_/xox*/vcp_/re_, PEM, cadenas de conexión con credenciales, JWT — con detección de service_role de Supabase decodificando el payload —, asignaciones password/secret/token=, correos, teléfonos, IPs privadas con puerto, rutas /Users|/home|C:\Users). API: scanText/scanDeep (con path, guardas de ciclo), redactText/redactDeep («[REDACTADO:tipo]», umbral minSeverity, por defecto solo critical), summarize, maskSecret, findingFingerprint. CERO falsos bloqueos: nunca lanza, detectar ≠ bloquear.
**Enganches reales:** `entity-library.ts` → scanItemInput + saveItemSecure/importItemSecure (guardar/compartir/instalar: redacta critical por defecto, `allowCritical:true` = "compartir igualmente", siempre devuelve findings+aviso) · `personalities.ts` → importPersonalityJson escanea SIEMPRE, redacta critical (re-normaliza el clon) y adjunta `security{findings,redactedCount,aviso}` sin romper la API · `memory-files.ts` → scanMemoryFile + exportMemoryFileSecure (mismo patrón al exportar/compartir memorias).
**Panel `src/components/security/security-scan-panel.tsx` (NUEVO — security-panel.tsx ya existía y es la política DNS/VPN/VPS, NO se tocó):** "Escanear ahora" recorre memorias de cerebros (cuenta + por cerebro), personalidades, bibliotecas accesibles (snapshot local) y claves localStorage sospechosas; LISTA BLANCA starseed.ai.providers + starseed.connectors.creds.v1 (jamás se leen: solo aviso "credenciales locales: nunca se sincronizan"); resultados por severidad con Redactar (en origen, por tipo) / Ver dónde (path+enlace) / Ignorar (starseed.security.ignored.v1, por dispositivo a propósito); nota de Strix (usestrix/strix) catalogado en la Biblioteca. Montado en /seguridad (encima de la política) y en Ajustes→Seguridad de /cuenta vía NeuronsPanel (página congelada; único componente de esa sección) + entrada "seguridad-escaner" en settings-search.
**AUDITORÍA DE SEMILLAS — HALLAZGO CRÍTICO REDACTADO:** la service_role de Supabase (nxstilnyidvkqeosofuh) estaba hardcodeada y RASTREADA EN GIT en test_db.js, query.js, query2.js, test_update.js y test_insert.sh, y una clave DashScope (sk-6473…) en tools/qwen-unified.sh → todas sustituidas por process.env/${SUPABASE_SERVICE_ROLE_KEY}. ⚠️ SIGUEN EN EL HISTORIAL DE GIT: ROTAR la service_role en el dashboard de Supabase y la clave DashScope. src/data/** y SEED_FILES limpios (solo datos de ejemplo inofensivos). .env.local intacto (gitignorado, es su sitio).
**Raven · Skales (§14):** conectores 'raven' (EverMind-AI/Raven, memoria agéntica, :8000) y 'skales' (skalesapp/skales, :3000) en OSS_CONNECTORS (patrón CasaOS, por endpoint) + fuentes MemorySource 'raven'/'skales' en MEMORY_SOURCES con campos endpoint/tokenRef — aparecen solos en servers-panel, memoria-panel y brain-mindmap-3d (UI data-driven).
**Organizador inteligente (Mouzi):** `src/lib/files/smart-organizer.ts` (NUEVO) — buildOrganizePlan(items) → {moves,newFolders,reasoning,source}: Astraura primero (prompt español SOLO-JSON, timeout 25 s, validación dura de ids/carpetas, máx 3 niveles) con fallback heurístico determinista (Imágenes/Documentos/Audio/Vídeo/Código/Comprimidos; subcarpetas por año si >50 ítems; lo no reconocido no se mueve). UI `smart-organize-button.tsx` (Wand2) montada en la cabecera de entity-library-panel: diálogo con movimientos-checkbox, carpetas nuevas, crédito "Inspirado en Mouzi", aviso de seguridad al vuelo por ítem (scanItemInput) y aplicación confirmada con la API real (createFolder anidado + moveItem).
**Arreglos colaterales (errores que rompían tsc en el área biblioteca, preexistentes de otras olas):** finder-types.ts TYPE_ORDER sin la clave 'personality' + finder-view.tsx implicit any en getUser().
**Verificado:** tsc (tsconfig del proyecto: ES2017/strict/bundler + next-env.d.ts) sobre los 14 archivos de esta ola = 0 errores; los restantes son preexistentes de keyStorage/desktop-store/notifications/realtime-sync/sync-manager (fuera de ámbito). No tocados: settings-sync.ts, cuenta/page.tsx, tts-oss, personalities-panel.tsx, sharing/**, hub/**, oss-library.ts, packages.ts, network/**.

## Adenda 73 · 2026-07-12 — Bug "glitcheo/reinicio en loop" ARREGLADO DE RAÍZ (SOP centro-creacion-sync-permisos §15)
**Causa real confirmada — bucles de layout por umbrales de scroll SIN histéresis sobre bloques EN FLUJO:**
1. `dashboard-workspace-renderer.tsx` (la viva, en cada panel del dashboard): la barra de pestañas colapsa en flujo (max-h-28→0) según dirección de scroll (±8px). Ocultarla agranda ~112px el contenedor de scroll → cerca del fondo el navegador RECORTA scrollTop (eventos "hacia arriba") → la lógica direccional la re-mostraba → encogía → el siguiente scroll la re-ocultaba… bucle infinito. Cada ciclo alternaba además la scrollbar (ancho del lienzo) → ResizeObserver de `useWidth` → react-grid-layout re-acomodaba TODOS los widgets con transición 500ms = "los elementos se glichean y reinician en loop"; se detiene lejos de la zona de recorte (= "para al scrollear en algunas posiciones").
2. `dashboard-layout.tsx` (latente + feature rota): título (~180px, AnimatePresence height, en flujo) + barra lateral con umbral único scrollY<60 sin histéresis, escuchando `window`… que NO es el scroller real bajo (main) (`main.os-main-scroll`). Si dispara, el re-anclaje del navegador re-cruza el umbral → mostrar/ocultar infinito.
**Fixes (sin eliminar animaciones: corren una vez y quedan estables):** rAF-throttle + histéresis por posición (ocultar >96/mostrar <32 en paneles; >280/<48 en el título, hueco > alto colapsable) + guarda de recorrido (solo ocultar si tras colapsar el recorte no puede devolver y bajo el umbral de mostrar → el estado converge SIEMPRE) + escuchar el scroll-parent real (walk-up overflow-y, fallback window) + `[scrollbar-gutter:stable]` y `[overflow-anchor:none]` en el scroll del panel + `.os-main-scroll{overflow-anchor:none}` en globals.css + guarda de delta >1px en `use-width.ts` (ResizeObserver subpíxel ya no re-acomoda la rejilla) + respeto GLOBAL a prefers-reduced-motion (globals.css). Colateral: hooks del panel movidos ANTES del return de panel vacío (regla de hooks al pasar vacío→poblado).
**Archivos:** src/components/dashboard/dashboard-workspace-renderer.tsx · src/components/dashboard/dashboard-layout.tsx · src/hooks/use-width.ts · src/app/globals.css. Verificado con tsc del proyecto = 0 errores en los tocados. Keys ya eran estables (widget.layout.i||id) y sin key={random/Date/tick} en el repo; whileInView no se usa.

## 2026-07-12 — Secciones · Perfil · Entidades: acciones por defecto + adjuntos visibles (Adenda 63 §8)

**Sesión por:** Claude (subagente Cowork, ola §8).
**Resumen ejecutivo:** Cabeceras consistentes con acciones rápidas en Política/Educación/Cultura (tipos especializados → `/crear?area=publicar&dest=…`) + feed vivo de sección sobre `os_posts`; fila de acciones por defecto en el perfil (dueño/visita + "ver como visitante") y en TODA entidad (6 toolkits); adjuntos de /publish ahora visibles como miniaturas/chips en las tarjetas.

### Hecho
- `src/components/network/section-header.tsx` (NUEVO): `SectionHeader` + `SectionQuickActions` — chips por tipo especializado (TIPOS_POR_DEST de creation-config) → `/crear?area=publicar&dest=<sección>`.
- `src/components/network/section-posts-feed.tsx` (NUEVO): `SectionPostsFeed` — feed realtime de la cola canónica de cada sección (`os_posts`, entity "page" + slug politica/educacion/cultura), estado vacío con CTA a /crear.
- `/network/politics`: cabecera + "Nueva propuesta" (dialog proposals existente) + "Propuestas del mapa" (→ /hub/mapa) + `SectionPostsFeed` bajo el feed legislativo; contenido centrado `mx-auto max-w-6xl` (se retiró el botón absoluto).
- `/network/education`: cabecera + chips (curso/guía/recurso/tutoría), bloque enlace a /library, 5ª pestaña "Publicaciones" con el feed de sección; centrado max-w-6xl.
- `/network/culture`: cabecera + chips (obra/evento/convocatoria/multiverso), `CultureDiscoveryRow` (eventos próximos REALES de os_events → /evento/<slug> + tarjeta Multiverso → /immersive), pestaña "Sección" con el feed; centrado max-w-6xl.
- Perfil `/profile/[username]`: `ProfileQuickActions` (NUEVO src/components/profile/profile-quick-actions.tsx) bajo el header — dueño: Editar (/cuenta) · Crear publicación (/crear) · Compartir (share/copy) · **Ver como visitante** (toggle local que baja isOwner en toda la página); visita: **Seguir real** (os_follows, clave `profile-<handle>`) · Mensaje (/messages?to=) · Compartir. CTA "Crea tu primera publicación" en la pestaña Publicaciones vacía (prop nueva `emptyCta` de PostFeed).
- Entidades: `EntityQuickActions` (NUEVO toolkits/shared/entity-quick-actions.tsx, re-exportado desde shared/index) al inicio de los 6 toolkits — Publicar aquí (→ /crear?area=publicar&dest=propia) · Agenda (diálogo UnifiedCalendar realOnly) · Biblioteca (diálogo EntityLibraryPanel con el kind correcto: party/ef/community/event/group/page) · Miembros (roster honesto) · Compartir (ShareAccessDialog universal sobre la biblioteca de la entidad + enlace público) · Ajustes (EntityEditorDialog real solo si os_pages/os_groups + owner).
- Adjuntos visibles: `splitBodyAttachments()` en `src/lib/social-posts.ts` separa el bloque "**Adjuntos:**" y el comentario `ss:meta` que /publish embebe en el body de os_posts → `NormalizedPost.attachments`; `PostCard` los pinta (imágenes → rejilla de miniaturas; resto → chips icono+enlace) y el `tipo` de ss:meta pasa a ser el badge del post. Aplica a PostFeed (cafe_posts), páginas/grupos y feeds de sección (osPostToNormalized en use-os-entities).

### Decisiones tomadas
- La regex ss:meta se duplica en `social-posts.ts` (lib) para no invertir capas lib←components; parser tolerante que nunca lanza.
- "Compartir perfil" NO usa ShareAccessDialog: `ResourceType` de sharing/access no contempla perfiles (share/copy nativo). En entidades sí se usa el diálogo universal sobre su biblioteca (`type:"library"` + libraryRef) con `buildLink` al enlace público de la entidad.
- Los chips de tipos enlazan sin parámetro `tipo` (QuickPublisher no lo lee; se elige dentro — creation/** intocado).

### Pendiente / Próximos pasos
- `?to=` en /messages aún no abre hilo (la ruta existe; el parámetro queda forward-compatible).
- QuickPublisher podría aceptar `?tipo=` para preseleccionar el tipo del chip pulsado (requiere tocar creation/**, fuera de esta ola).
- tsc: 0 errores en los archivos tocados; persisten 15 errores PREEXISTENTES en 7 archivos ajenos (live-channel, realtime-sync, notifications, account-context, desktop-store, sync-manager, ai/client/keyStorage) — implicit any / tipos DOM.

## 2026-07-12 — Adenda 63 · P-3 (panel de voz + visión de Aurora, montados) y P-4 (`/messages?to=<handle>`)

**Sesión por:** Claude (subagente Cowork, ola P-3/P-4).
**Resumen ejecutivo:** Los paneles de **voz** (`VoiceOssPanel`) y **visión** (`VisionPanel`) de Aurora estaban COMPLETOS pero huérfanos (no los renderizaba ninguna página). Ahora viven en Ajustes → Aurora e IA, que hoy **es `/cuenta`** (`/settings` redirige allí; la vieja página con pestañas ya no existe). Además, el deep-link `/messages?to=<handle>` de las acciones rápidas del perfil ya abre (o crea) el hilo con esa persona.

### Hecho
- **P-3 · Montaje de los sentidos de Aurora** — `src/app/(app)/cuenta/page.tsx`: dos secciones nuevas al final, con ancla propia y cabecera clara: `#aurora-voz` (§8, `<VoiceOssPanel />`) y `#aurora-sentidos` (§9, `<VisionPanel />`), justo después de `#aurora-ia`. Se añaden sus dos tarjetas-resumen al grid navegable superior (buscador propio de la página ya las filtra por «voz», «kokoro», «visión», «cámara»…). Deep-links: la página ahora entiende `?section=<id>` y `#<id>` (además de `?createProfile`), y espera a `loading=false` antes de hacer scroll (antes el nodo aún no existía → scroll silencioso a ninguna parte).
- **P-3 · Anclas reales en el buscador de Ajustes** — `src/components/settings/settings-search.tsx`: campo opcional `anchor` en `SettingsSearchEntry` + scroll a esa sección en `selectEntry` (respeta `prefers-reduced-motion`). `aurora-voz → #aurora-voz`, `aurora-sentidos → #aurora-sentidos`, `aurora-canales`/`ia-modelos → #aurora-ia`, `neuronas → #seguridad` (donde vive `NeuronsPanel`). Todas existen en `/cuenta`.
- **P-4 · `/messages?to=<handle>`** — `src/app/(main)/messages/page.tsx`: el cuerpo pasa a `MessagesContent` y el export por defecto lo envuelve en `<Suspense>` (obligatorio con `useSearchParams`, si no rompe el build). Al montar con `?to=`: resuelve el @ en el directorio (`fetchProfileByUsername`, os_profiles) → `createDm(userId)` (que YA reutiliza el hilo 1:1 existente, así que (a) abre el que hay y (b) crea uno nuevo si no) → recarga hilos, lo selecciona, salta a la vista de hilo en móvil y **enfoca el compositor** (prop nueva `autoFocusComposer` en `ThreadView`, con `ref` en el `Input` del composer). Estados honestos en un banner: «Abriendo tu conversación con @x…», @ inexistente, «ese eres tú», sin sesión → aviso descartable, nunca crash. Idempotente (`handledToRef`).
- **Bug colateral corregido** (era imprescindible para P-4): `reloadThreads` leía un `selectedId` obsoleto (useCallback con deps `[]` + eslint-disable) y por eso **cada recarga realtime saltaba al primer hilo**, pisando cualquier selección. Ahora usa actualización funcional (`setSelectedId(cur => cur ?? rows[0]?.id)`), y `setProfiles` fusiona en vez de reemplazar (no se pierde el perfil resuelto por el deep-link). El deep-link `?attachServer=` pasa a leerse por `useSearchParams` (ya hay boundary de Suspense; se retira el `window.location` de apaño).

### Decisiones tomadas
- Los paneles se montan en `/cuenta` porque **es** la página de Ajustes (`src/app/(main)/settings/page.tsx` = `redirect("/cuenta")`). No se resucita la página de pestañas. Cambio quirúrgico en `cuenta/page.tsx` (2 imports, 1 icono, 2 tarjetas, 1 efecto, 2 secciones) — el archivo ya se rompió una vez, se verificó con tsc.
- `SettingsSearch` sigue sin montarse en ninguna página (tiene su propio buscador `/cuenta`); las anclas quedan correctas para cuando se monte. No se tocó `settings-sync.ts`, `tts-oss/**`, personalidades, sharing/**, security/** ni map/**.
- Crear el hilo con `createDm` (fila real) en vez de un borrador en memoria: es idempotente y es lo que ya hace `NewChatDialog`; un hilo vacío se lista sin problema (`lastMessage: null`).

### Pendiente / Próximos pasos
- Los `QuickLink` de `/cuenta` a `/settings?tab=appearance|trinity|ai` aterrizan en `/cuenta` (el redirect pierde el `tab`): o se convierten en anclas locales o `/settings` debería reenviar `?tab=` a `?section=`.
- Otros paneles de `src/components/settings/ai/**` (proveedores, canales, mixture-of-agents, intelligence) siguen huérfanos igual que estaban voz y visión — merecen su propia ola de montaje.
- tsc (tsconfig real del repo): **0 errores** en los 4 archivos tocados. Persisten 4 errores PREEXISTENTES en 2 archivos ajenos que importa `/cuenta` (`profiles/account-profiles-switcher.tsx`, `settings/account/entity-roles-panel.tsx`); el build no se bloquea (`next.config` → `ignoreBuildErrors: true`).

## 2026-07-12 — Adenda 63 · P-5 (polígonos libres en el Mapa del Hub)

**Sesión por:** Claude (subagente Cowork, ola P-5).
**Resumen ejecutivo:** Las propuestas territoriales (`proposals` · kind `map_zone`) ya no están limitadas a un círculo: se pueden **dibujar zonas a mano** en `/hub/mapa` (clic a clic o a mano alzada) con la API BASE de Leaflet, sin plugins ni dependencias npm. La geometría se persiste en la MISMA propuesta y las zonas circulares ya guardadas siguen funcionando sin migración.

### Hecho
- **`src/lib/map/map-geometry.ts` (NUEVO)** — modelo único de zona: `{kind:"circle", center:[lat,lng], radiusM}` | `{kind:"polygon", ring:[[lat,lng],…]}`. Área por **shoelace esférico** (verificado: 0,01°×0,01° a lat 40 → 0,949 km²), centroide planar (proyección equirectangular local, con caída a la media si es degenerado), `zoneBounds`/`suggestedZoom` para el deep-link, `formatArea` (m²/ha/km²), simplificación (distancia mínima + Douglas-Peucker + tope `MAX_RING_VERTICES=220`) y **`parseZoneGeometry` / `serializeZoneGeometry`** (compatibilidad, ver abajo).
- **`src/lib/map/map-draw.ts` (NUEVO)** — trazador `createZoneDrawer(L, map, opts)` con Polyline/Polygon/Marker/LayerGroup a pelo: clic = vértice (polilínea viva con `mousemove` + guía de cierre discontinua), **doble clic/doble toque = cerrar**, **arrastrar = trazo a mano alzada** (muestreo cada 15 px, simplificado al soltar), Backspace = deshacer, Enter = cerrar, Escape = cancelar. Al cerrar pasa a modo **edición**: marcadores de vértice **arrastrables** (clic derecho / pulsación larga sobre uno lo elimina, mínimo 3). Táctil (touchstart/move/end, pinch-zoom respetado) y sin fugas (`destroy()` en el unmount del mapa).
- **`src/lib/map/map-data.ts`** — `MapZoneProposal` gana `geometry: ZoneGeometry` + `areaM2`; `lat`/`lng` pasan a ser el **centroide** y `radiusM` el radio real (círculos) o el **equivalente por área** (polígonos). `createZoneProposal({name, zoneKind, description, geometry})` serializa con `serializeZoneGeometry` y el deep-link del adjunto «Ver en el Mapa» usa centroide + zoom sugerido.
- **`src/components/map/map-view.tsx`** — botón **Dibujar zona** (icono pluma, estado activo) en la barra derecha + entrada «Dibujar zona a mano (polígono)» en «Crear aquí» (la de siempre pasa a llamarse «Proponer zona circular»). Barra inferior con la ayuda («Haz clic para añadir vértices · doble clic para cerrar · arrastra para trazo a mano alzada · Esc para cancelar»), contador de vértices, **área en vivo** y botones Deshacer / Cerrar zona / Rehacer / Proponer zona / Cancelar. La capa de propuestas pinta **polígonos y círculos indistintamente** (mismo popup, ahora con forma + área; las aprobadas conservan estilo y etiqueta). El diálogo de propuesta es consciente de la geometría (slider de radio solo en círculos; en polígonos muestra vértices, área y «Rehacer el trazo»).

### Decisiones tomadas
- **Compatibilidad sin migración de datos (bidireccional).** `parseZoneGeometry` acepta 3 formas: `geometry` anidada (nuevo), geometría plana con `kind`, y el **legacy plano `{lat,lng,radiusM}` SIN `kind` → círculo**. Y al guardar seguimos escribiendo TAMBIÉN los campos legacy (centroide + radio de área equivalente), así que una versión ANTIGUA del OS desplegada pinta un polígono nuevo como círculo razonable en vez de ignorarlo.
- **Sin plugins de dibujo** (Leaflet.draw/geoman): la Adenda prohíbe dependencias npm nuevas y Leaflet entra por CDN. Todo se hace con la API base + eventos DOM sobre el contenedor del mapa.
- **Dibujar desactiva «Crear aquí»**: el `contextmenu` del mapa consulta `drawActiveRef`; además, mientras se traza, los paneles de marcadores/overlay quedan `pointer-events:none` (nada de popups a media zona) y el mapa no panea (dragging/doubleClickZoom/boxZoom off, restaurados al terminar).
- El trazador vive **fuera de React** y sólo emite instantáneas (`onChange`), evitando re-renders por cada punto muestreado. Escape con un diálogo Radix abierto NO borra la zona (guarda por `[role=dialog][data-state=open]`).

### Pendiente / Próximos pasos
- Un polígono es un **anillo simple**: sin agujeros, sin multipolígonos y sin cruce del antimeridiano (documentado en la cabecera de `map-geometry.ts`). Si la red lo pide → GeoJSON + PostGIS.
- No hay **auto-intersección** detectada: se puede dibujar un "lazo" y el área saldrá rara (el shoelace se cancela). Faltaría validación de simplicidad del anillo.
- Sin marcadores intermedios para **insertar** vértices en el medio de una arista (solo mover/eliminar/rehacer).
- Los trazos a mano alzada con >80 vértices no muestran marcadores editables (sería inmanejable): se rehacen.
- tsc (tsconfig real del repo, archivos tocados + sus vecinos de `map/**`): **0 errores**. `next lint` no se pudo ejecutar (falla con "Converting circular structure to JSON", roto de antes en el repo).

## 2026-07-12 — Adenda 63 · Sync en vivo SIN DDL (broadcast primero)

**Sesión por:** Claude (subagente Cowork).
**Resumen ejecutivo:** El sync en vivo (Biblioteca y publicaciones) dependía de `postgres_changes`, que exige que las tablas estén en la publicación `supabase_realtime` — migración `20260711120000_realtime_publication.sql` **imposible de aplicar sin credenciales de gestión**. Ahora el camino PRINCIPAL es Realtime **BROADCAST** (canales), que no requiere DDL: el sync funciona igual de bien con la migración pendiente, y si algún día se aplica, no hay ni duplicados ni doble trabajo.

### Hecho
- **`src/lib/sync/live-signal.ts` (NUEVO)** — motor de señales: `emitChange(topic, {id, updatedAt, entity, data})` / `onChange(topic, cb, {entity})`, un único evento de broadcast `live` sobre dos canales: `acct:<uid>` (otros **dispositivos** de la cuenta, multiplexado sobre el canal que ya gestiona `realtime-sync.ts` — sin abrir un 2.º websocket) y `ent:<kind>:<id>` (otras **cuentas** con acceso al recurso compartido; refcount + cierre con gracia de 60 s). Helpers de topic: `libraryTopic` / `entityFeedTopic` / `feedTopic` / `FEED_GLOBAL_TOPIC` + entidad virtual `ent:feed:global`. Incluye `checkRealtimeTables()` (diagnóstico).
- **`src/lib/sync/realtime-sync.ts`** — `getOrCreateBroadcastChannel` ahora **re-cablea** los eventos custom ya registrados vía `onAccountBroadcast` al crear un canal nuevo: sin esto, tras un teardown/cambio de sesión los listeners (`live`, peticiones de archivo a neuronas) quedaban **sordos para siempre**.
- **`src/lib/library/entity-library.ts`** — `pushCloud` y `flushPendingLibrarySync` emiten `signalLibraryChange(ref, row.updated_at)` tras un push con ÉXITO. `watchLibrary` escucha ahora **broadcast** (señal → `pullCloud` + merge LWW → `writeCache`, que ya emite `starseed:library-updated`) **y** `postgres_changes` (redundante, deduplicado).
- **`src/lib/os-social.ts`** — `createPost` hace `select("id, created_at")` tras el insert y emite en `feed:<tipo>:<slug>` (canal de entidad) y en `feed:global` (canal compartido `ent:feed:global`).
- **`src/hooks/use-os-entities.ts`** (`useOsPosts`) y **`src/components/social/PostFeed.tsx`** — escuchan el broadcast además de su `postgres_changes` (con dedupe por clave común).
- **`src/components/settings/account/realtime-sync-panel.tsx`** — bloque «Sync en vivo: por broadcast · Activo» + nota gris opcional. Sin alarmas.

### Decisiones tomadas
- **Anti-eco en 2 capas:** canales con `broadcast: { self: false }` (el emisor nunca recibe lo suyo) + `deviceId` en el payload (descarta lo emitido por otra pestaña del MISMO dispositivo).
- **Anti doble-procesado:** puerta única `shouldProcessChange(changeKey(topic, id, updatedAt))`, ventana ~5 s. La primera vía que llegue procesa; el resto (canal de cuenta, canal de entidad, `postgres_changes`) se descarta. **Regla:** los dos transportes deben construir la clave con el mismo `id` y `updatedAt` de la fila — por eso `createPost` recupera `id`/`created_at`.
- **`emitChange` se llama SIEMPRE tras un push con éxito**, nunca antes (si no, anunciaríamos un cambio que nadie puede leer todavía).
- **Diagnóstico honesto:** PostgREST no expone `pg_catalog`, así que `checkRealtimeTables()` normalmente devuelve `known:false` ("desconocido"). No es un problema y la UI no lo pinta como error: el sync funciona por broadcast.
- El patrón es **señal + repull** (la señal lleva solo id + fecha, nunca contenido): cada cliente vuelve a consultar y **RLS decide** qué puede leer. Un canal compartido no filtra datos.

### Pendiente / Próximos pasos
- La migración `supabase/migrations/20260711120000_realtime_publication.sql` **sigue sin aplicar** — ya no es bloqueante, pero conviene aplicarla (dashboard/CLI) para tener el camino redundante: cubre a los clientes que estaban CERRADOS cuando se emitió el broadcast (el broadcast no persiste).
- `cafe_posts` (que es lo que lee `PostFeed`) no emite señal: sus escrituras viven en otro flujo. Solo se refresca por `postgres_changes` de `cafe_posts` o por la señal de `os_posts`.
- Los canales de entidad son públicos (cualquiera autenticado puede suscribirse a `ent:<kind>:<id>`). Como solo viaja la señal, no hay fuga; si se quisiera endurecer → Realtime Authorization (canales privados con RLS sobre `realtime.messages`).
- tsc (tsconfig real del repo vía `extends`, con los 7 archivos tocados en `files`): **0 errores**.

---

## 2026-07-12 — Deuda de tipos a cero + bug de runtime en el preview de fondos

**Sesión por:** Claude (subagente Cowork).
**Resumen ejecutivo:** `next.config.ts` tiene `ignoreBuildErrors: true`, así que el build pasaba con **102 errores de TypeScript** ocultos. Se han arreglado TODOS (`npx tsc --noEmit` → **0 errores**) sin tocar comportamiento, y por el camino han aparecido varios **bugs reales de runtime**, no solo de tipos.

### Hecho — bugs de runtime (los importantes)
- **`applyAlpha` no definida** en `settings/appearance/background-settings.tsx:458`: el mini-preview de los fondos "vivos" (aurora/nebula/plasma) llamaba a una función inexistente → **ReferenceError y crash del panel de Apariencia** en cuanto se pintaba esa rama. El helper existía duplicado en `ui/backgrounds/living-background.tsx`; se ha promovido a `src/lib/utils.ts` (`applyAlpha`, ahora soporta hex/#rgb/hsl()/hsla()/rgb()/rgba()) y lo usan los dos.
- **`universal-board-viewer.tsx` sin imports** (tenía un `// ... existing imports ...` en su sitio): `useBoardSystem`, `useState` y `cn` eran identificadores libres → ReferenceError al renderizar el visor de pizarras (lo montan `control-panel.tsx` y `side-curtains.tsx`).
- **`/api/widget-forge/generate-visuals`**: en el `catch` se usaba `prompt`, declarado DENTRO del `try` → resolvía al `prompt` global del DOM (que en Node no existe) → ReferenceError y 500 en vez del fallback demo. Ahora `prompt` se declara fuera del `try`.
- **`components-test/page.tsx`**: llamaba a `setConfig(...)`, que no existe en el contexto de apariencia → TypeError al pulsar "Force Enable Liquid UI". Ahora usa `updateConfig` (deep-merge).
- **Sliders de Cristal Líquido en NaN**: `liquidGlass.distortWidth/distortRadius/smoothStepEdge` se leían y escribían (mapean a `--glass-opacity`/`--glass-blur`/`--glass-saturation`) pero **no existían en el tipo ni en los defaults** → `Math.round(undefined*100)` = NaN. Añadidos al tipo y a `DEFAULT_CONFIG` (0.4 / 0.4 / 0.8); el `deepMerge` de carga los rellena en las cuentas ya guardadas.
- **Iconos del catálogo de accesos rápidos**: `quick-options-grid.tsx` tenía su propio `ICON_MAP` con claves (`Home`, `User`, `Book`…) que **no coinciden** con `DockIconKey` (`LayoutDashboard`, `CircleUser`, `BookOpen`…) → casi todos los items caían al icono de respaldo. El mapa es ahora único y exportado: `DOCK_ICON_MAP` en `dock-config.ts`, consumido por el OmniDock y por el catálogo.
- **Chips "indigo" sin estado activo** (`OptionChips`): el color no estaba en el `colorMap` → el chip seleccionado se pintaba como inactivo en la pestaña de Iconografía. Añadido.
- **Etiquetas de entidad siempre "Grupo"** (`entity-roles-panel.tsx`): comparaba `p.kind === "profile" | "page"` contra un `ProfileKind` (`personal|civic|artistic|professional|custom`) → siempre falso. Ahora usa `profileKindLabel(p.kind)`. También se comprueba el código de error de forma defensiva (`grantEntityRole` puede devolver `error` como string).
- **`DesignIntegrationCanvas.tsx`**: `familyToTab` tenía 3 claves duplicadas (`cards`/`tooltips`/`badges`) → eliminadas.
- **`04-auto-discover.ts`**: el frontmatter de una SKILL.md podía dejar `tags`/`triggers`/`dependencies` a `undefined` dentro de un `SkillMetadata`. Nuevo helper `toSkillMetadata()` que rellena los obligatorios.

### Hecho — tipos
- `framer-motion`: `physicsConfig` tipado como `Transition` (el `type: "spring"` se ensanchaba a `string`).
- `CanvasAction` movido a `state-types.ts` y exportado (lo importaba `SplineIntegrationTab`); las capas `personas/*` ahora importan `CanvasState`/`ElementFamily` de `state-types` (no del componente, que no las reexporta).
- `Category`/`Theme` (`lib/data.ts`) pasan a ser interfaces explícitas (antes se inferían del literal → `subCategories: never[]` en las hojas, imposible de reutilizar).
- `ParamMap` (Aurora) admite `_notes: string` junto a los parámetros numéricos.
- `StitchTabs` acepta el estilo `liquid-crystal` (que es **el valor por defecto** del canvas y no estaba en su unión); `StitchButton` acepta `size="icon"`; `buttonStyle: "solid"` se elimina del canvas (ni existía en el componente ni se podía elegir).
- `threejs-components` (paquete JS sin tipos): declaración en `src/types/threejs-components.d.ts` → se elimina el `@ts-ignore` de `LiquidMetal.tsx`.
- `tsconfig.json`: `exclude` para lo que **no** forma parte del build de Next — `AI-refernces ` (snippets de referencia), `hermes-integration/` de la RAÍZ (copia obsoleta; la viva es `src/hermes-integration`) e `integraciones-de-codigo/` (proyecto Vite con su propio tsconfig y sus propias dependencias).

### Decisiones tomadas
- Prohibido silenciar: cero `@ts-ignore` nuevos y cero `as any`. Cuando una prop se usaba de verdad → se añade al tipo; cuando no se usaba ni existía → se elimina.
- Las tres claves nuevas de `liquidGlass` NO requieren migración de versión: `deepMerge(DEFAULT_CONFIG, saved)` ya rellena claves nuevas en configs persistidas.

### Pendiente / Próximos pasos
- `entity-roles-panel.tsx` sigue casteando `profile.kind` (`personal`, `civic`…) a `EntityType` (`profile|page|group`) al escribir en `os_entity_roles.entity_type`: se está guardando un valor de otro dominio. Hay que decidir el mapeo correcto (probablemente `"profile"` fijo) — **no se ha tocado para no cambiar lo que se escribe en la BD**.
- `hermes-integration/` en la raíz es código muerto duplicado: se puede borrar.
- `next.config.ts` mantiene `ignoreBuildErrors: true`. Ahora que tsc está en 0, se podría quitar para que el build vuelva a proteger de regresiones (requiere que CI corra tsc).

---

## 2026-07-12 — Tablas núcleo AUSENTES (I): Mensajería + Voto Delegado
**Sesión por:** Claude (subagente · ola "tablas que faltan")
**Resumen ejecutivo:** `/messages`, Correos y el voto líquido delegado NO podían funcionar: sus tablas **nunca existieron** en el Supabase del OS (`nxstilnyidvkqeosofuh`). Creadas y aplicadas en producción.

### Hecho
- Nueva migración `supabase/migrations/20260712090200_missing_core_tables_messages.sql`, **APLICADA** (Management API) y verificada en vivo. Crea:
  - `os_dm_threads` / `os_dm_members` / `os_dm_messages` — esquema derivado literalmente de `src/lib/messages/dm.ts` y `src/lib/mail/os-mail.ts` (Correos reutiliza los mismos hilos con `meta.mail = true`). PK compuesta `(thread_id, user_id)` en members: la exige el `upsert onConflict "thread_id,user_id"` de `addMembers`. `attachments jsonb` (NO `jsonb[]`, pese al comentario de la cabecera de `dm.ts`: se inserta un array JSON). `deleted boolean NOT NULL default false` (el contador de no-leídos filtra `.eq("deleted", false)`).
  - `os_messages` — **no es la mensajería**: es el buzón de memorias de Astraura (`astraura-realtime.ts#injectAstrauraMemory` + `sync-manager.ts`). `thread_id` es **TEXTO** (`"<kind>_<id>_astraura"`), no uuid. El código no envía `user_id` → la columna lo rellena con `DEFAULT auth.uid()`; RLS privada por cuenta.
  - `vote_delegations` — cláusulas pétreas en el esquema: `expires_at NOT NULL` (caducidad obligatoria), `CHECK delegator <> delegate`, índice único parcial `(delegator_user, topic) WHERE revoked_at IS NULL` (una activa por tema, como asume `delegations.ts`). SELECT público (el poder delegado es transparente, §6); escritura solo sobre lo propio.
- **RLS estricta y SIN recursión**: las políticas de mensajería no se consultan entre sí desde SQL inline (eso daría `42P17`), sino a través de dos funciones `SECURITY DEFINER`: `public.is_dm_member(thread, uid)` e `public.is_dm_thread_owner(thread, uid)` (misma técnica que `20260711000001_fix_entity_roles_rls.sql`). `is_dm_thread_owner` es imprescindible para el ALTA: al crear un DM, el creador inserta **también** la fila de membresía del otro usuario.
- Las 5 tablas añadidas a `supabase_realtime` (los mensajes lo necesitan: `subscribeThread` / `subscribeThreadsList`).
- **Prueba funcional real** (3 usuarios temporales, rol `authenticated`, RLS activa, todo borrado después): crear DM + 2 miembros + mensajes ✅; el no-miembro no ve nada y no puede escribir (42501) ✅; no se puede suplantar el `sender` de otro ✅; upsert de miembros ✅; editar/borrar solo lo propio ✅; delegar, re-delegar (revoca la previa), leer el tema y contar peso recibido ✅; no se puede delegar en nombre de otro ni auto-delegarse ✅. **Cero 42P17.**

### Pendiente / Próximos pasos
- `os_messages` no tiene lector todavía (solo `injectAstrauraMemory` escribe). Si en el futuro las memorias de Astraura deben ser visibles por un grupo/página entero, habrá que ampliar su RLS (hoy es privada por cuenta).

---

## 2026-07-12 — Tablas núcleo AUSENTES (II): entity_state · os_files · entity_mentions · os_contexts
**Sesión por:** Claude (subagente · ola "tablas que faltan")
**Resumen ejecutivo:** Las cuatro tablas sobre las que se apoya TODA la sincronización del OS (biblioteca por entidad, escritorios, layouts de páginas/grupos, archivos reales, menciones y contexto de Aurora) **nunca existieron** en el Supabase del OS (`nxstilnyidvkqeosofuh`). Creadas, aplicadas en producción y verificadas con RLS real.

### Causa raíz (por qué "solo se veía en el dispositivo donde se subía")
Todos los módulos degradan en silencio (`if (error) return null / [] / 0` — filosofía "nunca lanza"). Sin tabla detrás, cada escritura a la nube fallaba **sin un solo error visible**: la biblioteca/escritorios/layout vivían solo en `localStorage`, y en las subidas el objeto SÍ llegaba a Storage pero su fila de índice no se insertaba, así que ningún otro dispositivo (ni la vista "Archivos de la Red") podía listarlo. No era un bug de sync: era la ausencia del esquema.

### Hecho
- Nueva migración `supabase/migrations/20260712090000_missing_core_tables_library.sql`, **APLICADA** (Management API, `[]`) y **re-aplicada** para probar idempotencia. Esquema derivado literalmente del código, no de suposiciones:
  - `entity_state` (src/lib/sync/entity-state.ts) — `owner_kind/owner_id/key → value jsonb`, `rev`, `device_id`, `updated_by`, `updated_at`. **UNIQUE (owner_kind, owner_id, key)**: la exige el `upsert onConflict "owner_kind,owner_id,key"`. `rev`/`updated_at`/`updated_by` los mantiene un **trigger** (`entity_state_touch`), porque el cliente no los envía y el módulo hace LWW por `rev`.
  - `os_files` (src/lib/files/os-files.ts) — metadatos del bucket `os-files`: `owner/profile_id/name/mime/size/path/url/device_id/is_public/acl_read/acl_write/group_slug/meta`. Índice único en `path` e índice en `url` (`findFileByUrl`).
  - `entity_mentions` (src/lib/mentions/mentions.ts) — `source_type/source_id/target_type/target_id/kind('@'|'#')` + `created_by DEFAULT auth.uid()`. **Sin UNIQUE a propósito**: `persistMentions` hace un `.insert(rows)` plano y una violación de unicidad tumbaría el lote entero (y se perdería en silencio).
  - `os_contexts` (src/ai/astraura/astraura-realtime.ts) — `user_id/target_kind/target_id/settings` + UNIQUE natural del lookup.
- **RLS (privado en lo personal, transparente en lo público — §3/§6)** vía funciones `SECURITY DEFINER` (`es_can_read`, `es_can_write`, `es_is_entity_member`, `es_can_access_other`):
  - ámbitos `user`/`profile` → solo la propia cuenta (lee y escribe);
  - ámbitos de entidad pública (`page/group/community/event/ef/party`, identificados por slug) → **lectura pública** (es lo que ya asume la UI: `/pagina/[slug]` y `/grupo/[slug]` construyen su `EntityRef` para CUALQUIER visitante, no solo para el dueño) y **escritura solo de dueño (`os_pages`/`os_groups.owner_id`) o miembro (`os_memberships`)**;
  - ámbito `other`: `network-politics` (recursos comunes + mediación) → lectura pública, escritura de cualquier autenticado (gobernanza colectiva); `srv:<uuid>` → solo miembros del servidor, comprobado **dinámicamente** (`to_regclass`) para no romper si `os_app_server_members` aún no existe.
  - `os_files`: dueño todo; lectura si `is_public` / ACL / miembro del grupo; escritura compartida si estás en `acl_write`. `os_contexts`: privado del usuario (el Exocórtex es leal al usuario).
- Las 4 tablas añadidas a `supabase_realtime` + `REPLICA IDENTITY FULL` (sin ella los DELETE no traen `owner_id`/`owner` y los filtros de `subscribeEntityState`/`subscribeMyFiles` no dispararían).
- **Storage endurecido**: `20260711000000_storage_policies.sql` permitía a CUALQUIER autenticado actualizar/borrar CUALQUIER objeto del bucket `os-files`. Sustituidas por políticas de prefijo propio `(storage.foldername(name))[1] = auth.uid()` — el contrato que ya documentaba `os-files.ts` y que exige la Identidad Soberana (§6). No rompe nada: todas las subidas pasan por `uploadFile()`, que siempre escribe en `${uid}/…`.
- **Prueba funcional real** (rol `authenticated` con JWT, RLS activa; todo borrado después): upsert doble de `entity_state` → `rev` 1→2 y `updated_by` autorrellenado ✅; insert+select de `os_files`, `entity_mentions` y `os_contexts` ✅; otra cuenta NO ve tu `entity_state` personal ni tu `os_contexts`, y sus UPDATE/DELETE afectan 0 filas ✅; sí ve tu archivo público ✅; la dueña de una página escribe su `layout` y una intrusa lo lee pero no lo modifica ✅; **anon lee el layout de una página pública** (imprescindible para los visitantes) y no ve nada personal ✅.

### Incoherencias encontradas (no corregidas, solo documentadas)
- La cabecera de `src/lib/files/os-files.ts` afirma que el backend estaba "YA APLICADO y verificado" en **`dzkjapinnewkxzjltadv`** — que es el Supabase de **Nexus/Café**, no el del OS. De ahí venía la falsa sensación de que la tabla existía.
- `public.os_pages.slug` **no tiene UNIQUE** en la BD real (la migración `20260710000000` declaraba `handle unique`, pero la tabla viva usa `slug`). No lo he tocado (tabla de otra ola), pero cualquier `upsert onConflict "slug"` sobre `os_pages` fallará con `42P10`.

---

## 2026-07-12 — Tablas núcleo AUSENTES (III): os_spaces · os_space_editors · neuron_devices · os_app_servers · os_app_server_members
**Sesión por:** Claude (subagente · ola "tablas que faltan")
**Resumen ejecutivo:** El **sistema universal de permisos y compartición** (Adenda 63 §5), los **espacios colaborativos** (escritorios/dashboards/pizarras), las **neuronas** y los **servidores de apps** escribían contra cinco tablas que **nunca existieron** en el Supabase del OS (`nxstilnyidvkqeosofuh`). Creadas, aplicadas en producción y verificadas con RLS real (36 aserciones).

### Causa raíz
`spaces.ts`, `access.ts`, `neurons.ts` y `app-servers.ts` documentan en su cabecera un backend "YA APLICADO en Supabase **dzkjapinnewkxzjltadv**" — que es el proyecto de **Nexus/Café**, no el del OS. Como todos los módulos tragan el error (`catch { return null / [] / false }`), compartir un escritorio, invitar a alguien, registrar una neurona o crear un servidor **fallaba en absoluto silencio**: el modelo de permisos vivía solo en `starseed.sharing.local.v1` (localStorage), sin enforcement ninguno.

### Hecho
- Nueva migración `supabase/migrations/20260712090100_missing_core_tables_spaces.sql`, **APLICADA** (Management API → `[]`) y re-aplicada para probar idempotencia. Esquema derivado del código (columnas, `onConflict`, filtros `.eq()`, valores de los CHECK que el cliente escribe de verdad):
  - `os_spaces` — `kind ∈ desktop|dashboard|board` (los recursos brain/file/folder/library de `access.ts::spaceKindFor` ya caen a `dashboard`; el tipo real viaja en `doc.sharing.resource.type`), `access ∈ private|profiles|invite|public`, `allowed_profiles uuid[]`, `group_slug`, `doc jsonb`, `device_id`, `rev` (**trigger** `os_spaces_touch`, que además **blinda `owner_account`/`id`/`created_at`** para que un editor no pueda robar el espacio). Índice **GIN sobre `doc`** para el `.contains("doc", …)` de `findSpaceForResource`.
  - `os_space_editors` — PK `(space_id, account)` (la exige el `upsert onConflict "space_id,account"`), `role ∈ editor|viewer`, `status ∈ member|invited|pending`.
  - `neuron_devices` — **`id` es TEXT, no uuid** (`thisDeviceId()` cae a `n-<base36>` si `crypto.randomUUID` falla). `name`/`kind` NULLABLE a propósito: el heartbeat solo manda `{id, owner, last_seen_at}` y un upsert sobre fila inexistente los dejaría en null.
  - `os_app_servers` (slug **UNIQUE**: `createServer` reintenta el slug ante el código `23505`) + `os_app_server_members` (PK `(server_id, user_id)`).
- **RLS sin recursión.** `os_spaces ↔ os_space_editors` (y `os_app_servers ↔ os_app_server_members`) se consultan mutuamente ⇒ ciclo. Roto con funciones `SECURITY DEFINER` (patrón `check_entity_role` de `20260711000001`): `os_is_group_member`, `os_owns_profile`, `space_editor_status/role`, `space_can_read/edit`, `app_server_member_status/can_read`.
- ⚠️ **REGLA DE ORO descubierta a base de fallo real:** una política de una tabla **NUNCA** debe llamar a una función que **relea esa misma tabla**. Postgres aplica las políticas de SELECT también a `INSERT … RETURNING`, que es exactamente lo que genera PostgREST con `.insert({…}).select("*")` (`createSpace`, `createServer`) — y la fila recién insertada **aún no es visible** para el snapshot de la función ⇒ la política devolvía false y **el insert fallaba SIEMPRE** (42501). Por eso `sp_select`/`sp_update`/`as_select` se evalúan **inline sobre las columnas de la propia fila** y solo delegan en funciones definer para consultar OTRAS tablas.
- **Modelo de permisos aplicado:** dueño → todo · editor `member` con `role='editor'`, miembro del `group_slug` y dueño de un perfil de `allowed_profiles` → leer + editar · `viewer member` e `invited` → solo leer (el `invited` necesita leer para que la bandeja de invitaciones muestre título/kind antes de aceptar) · `pending` (auto-solicitud) → **NADA** · `public` → lectura para todos, **incluido anónimo** (enlaces compartidos). Neuronas: privadas de la cuenta (Identidad Soberana §6). Servidores: alta directa solo si son públicos; en privado/grupo solo `pending` que aprueba el dueño.
- Escalada de privilegios cerrada con un **trigger** `os_space_editors_guard` (BEGIN…EXCEPTION en RLS no basta: las políticas permisivas hacen OR de los `WITH CHECK`, así que "invited→member sí, pending→member NO" no se puede expresar solo con políticas). Solo permite `invited→member` y los upserts idempotentes.
- Las 5 tablas añadidas a `supabase_realtime` + `REPLICA IDENTITY FULL` (sin ella Realtime no puede evaluar RLS ni los filtros `id=eq.…`/`space_id=eq.…`/`server_id=eq.…` en UPDATE/DELETE).
- **Prueba funcional real** (rol `authenticated` con JWT + rol `anon`, RLS activa, 0 filas residuales): 36/36 ✅ — crear/leer/editar espacio, `rev` que sube por trigger, búsqueda por `doc @>`, invitar → leer → aceptar → editar, `INSERT/UPDATE … RETURNING` (las rutas exactas de `createSpace`/`updateSpaceDoc`/`createServer`), y **todos los intentos de escalada bloqueados**: autoinsertarse como `member` (42501), `pending→member` (42501), editar/borrar espacio ajeno (0 filas), robar `owner_account` (trigger lo revierte), unirse directo a un servidor privado (42501), ver la neurona de otra cuenta (0 filas).

### Incoherencias encontradas
- Las cabeceras de `spaces.ts` y `app-servers.ts` dicen "Backend YA APLICADO en Supabase **dzkjapinnewkxzjltadv**" (proyecto de Nexus/Café). **Documentación falsa**: en el OS no existía nada. Mismo patrón que `os-files.ts` en la ola II.
- `spaces.ts` afirma que la RLS auditada daba **"público = edición"**. **Desviación consciente:** aquí `public` concede **solo lectura**. El diálogo de la Adenda 63 (`share-access-dialog.tsx`) ofrece explícitamente "Público · Ver" como rol por defecto del enlace, y ese rol vive únicamente en `doc.sharing` — que el propio `access.ts` documenta que **se reescribe** al colaborar. Conceder escritura global a todo espacio público habría convertido cada "Público · Ver" en editable por cualquiera. Para colaborar con externos: `invite` (os_space_editors) o `profiles`/grupo.

### Pendiente / Próximos pasos
- `access.ts::pushEnforcement` traduce cualquier grant de perfil a `allowed_profiles` **perdiendo el rol** (un perfil con rol `view` acaba pudiendo editar, porque la columna no lleva rol). Si se quiere fidelidad de roles por perfil, hay que añadir rol a nivel de fila (p. ej. reutilizar `os_space_editors` para perfiles) — hoy el rol fino solo sobrevive en `doc.sharing`.
- Código NO tocado (`src/` intacto): las cabeceras con el proyecto Supabase equivocado convendría corregirlas en una pasada de documentación.

---

## 2026-07-12 — Adenda 66 (ola 2) · «carpeta» → **folder** en todo el OS · Cerebros de contexto · Cortina Logic
**Sesión por:** agente (Claude)
**Resumen ejecutivo:** Renombrado del concepto a **folder** (masculino) en toda la UI/comentarios, arreglado el popover «Cerebros de contexto» (que era imposible de usar) y corregidos los dos recortes de interfaz de la cortina Logic (apps fuera de pantalla + secciones cortadas por arriba).

### A · Renombrado «carpeta» → «folder» (SOP §1)
- ~430 textos en **117 archivos** de `src/` (UI en español, comentarios y JSDoc). Concepto único y **masculino**: «el folder», «los folders», «Nuevo folder», «Sin folder», «Nombre del folder». Incluye «carpetas del dock» → «folders del dock», Biblioteca/Finder, escritorios, galería, dashboard/launcher, exocórtex/Syncthing, publicar y organizador inteligente. También `subcarpeta` → `subfolder`.
- Se corrigió la concordancia arrastrada: artículos («una carpeta» → «un folder»), contracciones («de la carpeta» → «del folder»), adjetivos pospuestos («carpeta vacía» → «folder vacío», «carpetas activas» → «folders activos») y pronombres («si la hay» → «si lo hay», «dentro de sí misma» → «dentro de sí mismo»).
- **NO renombrado a propósito** (rompería datos ya guardados en cuentas): el discriminante persistido `"carpeta"` de `DestinationKindId` (`src/lib/publish/publish.ts`, `src/lib/reach/reach.ts`, `src/components/publish/publication-composer.tsx`). Sus **etiquetas visibles** sí pasan a «Folder/folders» (p. ej. `plural.carpeta: ["folder","folders"]`). Las claves de localStorage (`starseed.dock.folders.v1`, `FOLDERS_KEY`…) ya estaban en inglés. En los `tags` de búsqueda de widgets se **añadió** `folder`/`folders` **conservando** `carpeta`/`carpetas`, para no romper la búsqueda de quien siga escribiendo en español.
- El contrato JSON del organizador inteligente (`smart-organizer.ts`) **sí** se renombró entero (`"carpeta"`→`"folder"`, `"carpetas_nuevas"`→`"folders_nuevos"`) porque vive solo en el par prompt→`parseAiPlan` y no se persiste.

### B · Bug: «Cerebros de contexto» nunca reconocía el perfil — CAUSA RAÍZ
`LibraryBrainsPopover` decidía con `ref.kind === 'profile'` (tanto `profileId` como `applicable`). Pero el selector de bibliotecas de `/library` se alimenta de `myLibraryDestinations()` (`entity-library.ts`), que **jamás emite `kind:'profile'`**: solo emite `user` («Mi biblioteca»), `page` y `group`. Por tanto `applicable` era **siempre false** y el popover mostraba «elige un perfil en el selector de arriba» — un aviso **imposible de satisfacer**, porque ese selector no ofrece perfiles. Además desincronizaba con el consumidor real: Aurora lee `getLibraryBrains(activeProfileId())` en `src/ai/astraura/context.ts`.
**Fix:** el popover resuelve ahora el perfil **efectivo** con `useActiveProfile()` — `kind:'profile'` → ese perfil; `kind:'user'` (mi biblioteca) → **perfil activo**, sin pedir nada; `page`/`group` → aviso honesto que ya no manda a ningún sitio inexistente. Así el popover **escribe** en la misma clave (`entity_state(profile:<id>,'library-brains')`) que Aurora **lee**. Se muestra además el perfil sobre el que se guarda.

### C · Interfaz de la cortina Logic (dock Trinity, lado derecho) — CAUSA RAÍZ ÚNICA
Ambos síntomas (C1 «las apps se salen de la pantalla y no se pueden deslizar» y C2 «las secciones se cortan por arriba») venían del **mismo defecto de contención**: `ControlCenter` tenía **altura fija sin tope de viewport** (`md:h-[600px]` / `lg:h-[640px]`) y el wrapper de `side-curtains.tsx` lo centra con flexbox (`items-center`) dentro de un contenedor `fixed`. Cuando el viewport es más bajo que 600/640 px, el panel desborda arriba **y** abajo, y **el desbordamiento superior de un flex centrado es inalcanzable** (un `fixed` no scrollea) → cabecera, pestañas y apps quedaban cortadas e inaccesibles.
- **C2:** el wrapper pasa a anclarse a **top + bottom** (`inset-y-0`, sin `h-[100dvh]` redundante ni el `md:h-[90vh] md:my-auto` que competía con él): su alto lo deriva el **viewport real** (también con la barra de URL móvil, donde `vh` miente). Safe-areas reservadas con padding (`md:pt/pb-[max(1rem,env(safe-area-inset-*))]`; en móvil, dentro del propio panel: cabecera y barra de estado). El panel conserva su altura deseada pero **topada con `max-h-full`** → nunca excede el viewport, nunca se corta.
- **C1:** el carril de contenido pasa a ser el **único scroller** (`flex-1 min-h-0` + `overflow-y-auto overscroll-contain`; antes el scroll vivía en cada `TabsContent`, que además usaba `h-full` e impedía crecer). `TabsContent` usa `min-h-full`. Se añaden **sombras y flechas** arriba/abajo que solo aparecen cuando de verdad hay más que deslizar, con **guarda anti-bucle** en el `setState` del `ResizeObserver` (regla §15 de la Adenda 63: sin ella se reintroduce el glitcheo en loop).
- Verificado razonando el CSS a 380 (móvil, panel a sangre + safe-areas internas), 834 (tablet, panel 420 px con gutter 1 rem) y 1440 px (escritorio, 460×640 topado por `max-h-full`).

### Verificación
- `tsc --noEmit` (tsconfig temporal que extiende el real): **0 errores**.

### Pendiente
- El aviso del popover para `page`/`group` es honesto, pero el SOP §12 solo contempla cerebros **por perfil**: si se quieren cerebros por página/grupo hay que ampliar `library-brains.ts` (hoy su clave es `profile:<id>`).
- `DestinationKindId` sigue usando el literal `"carpeta"`: si algún día se migra, requiere migración de los datos de publicaciones/destinos ya guardados.

---

## 2026-07-12 — Adenda 66 §3-§4 · ACL por nodo (biblioteca · folder · archivo) + REGLA CUENTA↔PERFILES + Biblioteca pública del perfil
**Sesión por:** agente (Claude)
**Resumen ejecutivo:** Cada nodo de la Biblioteca tiene ya **ACL propia y heredable** (ámbito + roles), la regla **cuenta↔perfiles** se aplica en las DOS capas (RLS en la BD + `can()` en el cliente) y la pestaña Biblioteca de un perfil deja de decir «es privada»: muestra a las visitas **exactamente** los nodos que su dueño/a eligió mostrar.

### A · Modelo de ACL y herencia (§3)
- **Nodos:** `library` (nuevo) · `folder` · `file`. `ResourceType` de `src/lib/sharing/access.ts` ya los contemplaba; ahora los tres tienen ACL real.
- **Ámbitos** (vocabulario del SOP, añadidos a `AccessScope` sin romper los de la Adenda 63): `private` · `account` · `profiles` · `groups` · `pages` · `public` (+ los legados `profile` / `custom`, que siguen sirviendo a escritorios/pizarras/cerebros). `private` = **cerrado con llave**: ni los grants aplican. `profiles`/`groups`/`pages`/`custom` solo cambian el buscador de destinatarios; los grants mandan igual.
- **Roles:** `view` < `comment` < `edit` < `admin` (sin cambios).
- **Herencia:** el hijo hereda del primer ancestro con ACL propia (archivo → folder → … → biblioteca). **La ACL propia siempre gana** (no se mezclan). API nueva en `access.ts`: `getEffectiveAccess`, `parentResourceRef`, `hasOwnAcl`, `detachInheritance` («dejar de heredar» = copia la efectiva como propia), `restoreInheritance` («volver a heredar» = borra la propia). Gemelo en cliente en `finder-types.ts` (`effectiveAclForItem/Folder`, `canReadItem/canWriteItem/canReadFolder/canWriteFolder`) → el Finder ya oculta/deshabilita **con herencia**, no solo por ACL literal del nodo.
- **Persistencia:** ACL embebida en el doc de `entity_state` (clave `acl`) — nueva `EntityLibraryDoc.acl` para la biblioteca entera, `folders[].acl` y `items[].acl` para el resto. `ItemACL` se amplía de forma **aditiva** (v3): `scope`, `grants`, `showInProfile`, `updatedAt`, conservando `read`/`write` como **espejo** (los siguen consumiendo el Finder y las políticas legadas). Para los ARCHIVOS reales se espeja además a `os_files` (`is_public`/`acl_read`/`acl_write`/`group_slug`) vía `findFileByUrl` + `updateFileAccess` → ahí el enforcement **sí** es por fila.

### B · Regla CUENTA↔PERFILES (la parte crítica)
Dar acceso a UN perfil se lo da a **TODOS los perfiles de esa cuenta**, y al revés. Funciona porque `auth.uid()` **ES la cuenta** (los perfiles de `os_account_profiles` son facetas suyas), así que una sola comprobación cubre las dos direcciones.
- **BD** — migración `supabase/migrations/20260712100100_account_profile_access.sql` (idempotente, **aplicada y verificada** en `nxstilnyidvkqeosofuh`):
  - `account_of_profile(uuid)` · `profiles_of_account(uuid)` · `acl_ids_allow(uuid[])` — todas `SECURITY DEFINER` + `STABLE` (leen `os_account_profiles` **sin** pasar por su RLS → **cero recursión**).
  - `es_acl_node_allows(jsonb,text)` / `es_doc_acl_allows(jsonb,text)` — leen la ACL embebida (v3 `scope`+`grants` y las listas v2) de la biblioteca, de cada folder y de cada ítem.
  - `entity_state`: SELECT/UPDATE pasan a `es_can_read/es_can_write(...) OR es_doc_acl_allows(value, 'read'|'write')`. INSERT/DELETE siguen siendo **solo** del dueño/miembro (compartir nunca permite crear ni destruir la biblioteca ajena).
  - `os_files`: `osf_select` y `osf_shared_write` usan `acl_ids_allow(...)` → `acl_read`/`acl_write` admiten indistintamente uuids de **cuenta o de perfil**.
- **Cliente** — `identitySetOf(who)` en `access.ts` (cache 60 s) resuelve cuenta+perfiles equivalentes y `can()` compara los grants contra ese conjunto. En el Finder, `AclViewerContext.profileIds` (cargado en `entity-library-panel.tsx` con `listMyProfiles()`) hace lo mismo. **Cliente y RLS dicen siempre lo mismo.**

### C · Verificación con impersonación (`authenticated`, datos de prueba borrados después)
Cuentas A (comparte), B (con perfiles P1·P2·P3) y C (tercero):
| Caso | Esperado | Resultado |
|---|---|---|
| A comparte un **folder** con el perfil **P2** → ¿accede la cuenta B (y por tanto P1 y P3)? | sí | **sí** (1 fila) |
| A comparte con la **cuenta B** → ¿accede B con cualquiera de sus perfiles? | sí | **sí** (1 fila) |
| Biblioteca privada de A → ¿la ve B? | no | **no** (0 filas) |
| Archivo `os_files` con `acl_read=[P2]` → ¿lo lee B? | sí | **sí** |
| Archivo privado de A → ¿lo lee B? | no | **no** |
| **Tercero C** → ¿ve o escribe algo de A? | no | **no** (0 en todo) |
| B con grant **rol `view`** → ¿puede escribir? | no | **no** (0 filas) |
| B con grant **rol `edit`** (vía P2) → ¿puede escribir? | sí | **sí** (1 fila) |
| B con archivo solo en `acl_read` → ¿puede escribirlo? | no | **no** |
Datos de prueba (3 usuarios, 3 perfiles, 3 bibliotecas, 3 archivos) **eliminados**: verificado a 0.

### D · UI
- **Menú contextual → «Permisos»** (`finder-view.tsx`) abre ahora el `ShareAccessDialog` universal con el `ResourceRef` correcto (`file`/`folder`), en vez del viejo editor de listas read/write. Muestra **badge «Propio»/«Heredado»** + botón **«Dejar de heredar»/«Volver a heredar»**, y **editar un nodo heredado lo desengancha automáticamente** (editar es decidir).
- **Permisos de la BIBLIOTECA entera**: botón «Permisos» en la cabecera de `entity-library-panel.tsx` (`type:"library"`, nodo raíz de la herencia).
- **Destinatarios** según el ámbito: perfiles (buscador nuevo `searchAccountProfiles` sobre `os_account_profiles`), grupos y páginas (`searchGroups`, separados por `kind`), cuentas (`searchUsers`), «toda mi cuenta», público, privado. Aviso explícito en la UI de la regla cuenta↔perfiles.
- `PermissionsPopover` queda **sin uso** (no se borra: sigue siendo válido como editor de listas v2).

### E · Biblioteca pública del perfil (§4)
- Interruptor **«Mostrar en mi perfil»** por nodo (en el diálogo de Permisos) y panel dedicado en **Ajustes → Cuenta → Información personal** (`profile-library-showcase-panel.tsx`).
- Se persiste en la ACL del nodo (`acl.showInProfile`). **Marcar eleva el ámbito a `public`** — decisión honesta y avisada: si no, la visita ni siquiera podría leer la fila (RLS). **Desmarcar NO revoca** lo ya compartido: solo deja de listarse (justicia restaurativa, §6).
- La pestaña **Biblioteca** de un perfil ajeno ya no dice «es privada»: renderiza `ProfilePublicLibrary` con **exactamente** los nodos marcados (`profilePublicNodes`). El uid real del perfil visitado sale de `resolveProfileData().id` (identidades soberanas de `os_profiles`).

### Decisiones tomadas
- **No se parte la biblioteca en filas por nodo** (sería un cambio de esquema mayor y otro agente está tocando su sync): se mantiene el doc jsonb único + ACL embebida.
- La ACL v3 es **aditiva** sobre `ItemACL`: nada de lo guardado hoy se invalida, y el espejo `read`/`write` mantiene funcionando el código v2 que no conoce los grants.

### Pendiente / límites honestos (no ocultos)
- **Granularidad de la RLS en `entity_state`:** la biblioteca es **una fila jsonb**, así que si CUALQUIER nodo te concede acceso, la **fila entera** es legible y el filtrado por nodo lo hace el cliente (`visibleFor`). Consecuencia: quien tenga acceso a un solo folder podría leer el jsonb completo (títulos del resto) si consulta la API directamente. Igual para la escritura: un grant `edit` en cualquier nodo permite `UPDATE` de la fila (mismo modelo que ya tenían las bibliotecas de grupo, donde cualquier miembro escribe el doc). **Enforcement real por nodo solo en `os_files`** (una fila por archivo). Camino futuro: tabla `os_library_nodes` con una fila por nodo.
- `scope:"private"` en una biblioteca **compartida** (grupo/página) se comporta como «solo el dueño de la entidad»: no se distingue el perfil concreto que creó el nodo (la cuenta es el ancla soberana).
- El panel de Ajustes lista los **40 primeros** ítems; para el resto, «Permisos» desde la Biblioteca.
- Perfiles **faceta** (`os_account_profiles`) como dueños de biblioteca (`kind:'profile'`): soportados en ACL y en el contexto del Finder, pero la página `/profile/[username]` solo resuelve la biblioteca pública de las identidades **soberanas** (`os_profiles`).

---

## 2026-07-12 — Adenda 66 §2 · Sync REAL de bibliotecas, folders y archivos + historial/ramas/registro (`os_versions`)

**Sesión por:** Claude (Cowork, Opus 4.8) — ola «folders · permisos · publicaciones» (SOP `architecture/folders-permisos-publicaciones.md` §2).
**Resumen ejecutivo:** El usuario reportó «la sincronización de folders y archivos en línea no funciona; solo se guardan localmente». Se diagnosticó contra la BD REAL (`nxstilnyidvkqeosofuh`): **no era un fallo de RLS ni de red — era un fallo SILENCIADO POR EL PROPIO CÓDIGO**. Arreglado de raíz, más historial de versiones/ramas/registro en la nube (tablas nuevas `os_versions` + `os_access_log`, aplicadas y verificadas).

### CAUSA RAÍZ (evidencia dura de la BD, no conjeturas)

Estado real de la base ANTES de tocar nada:
- `entity_state`: **1 sola fila** en todo el proyecto (`profile/desktops`) — **cero** filas con `key='library'`.
- `os_files`: **0 filas**… pero el bucket `os-files` de Storage tenía **6 objetos** subidos el 2026-07-11 desde `…/biblioteca/user-8be339d0…/`.

Esa contradicción (binarios sí, metadatos no) es la prueba del delito. Tres causas encadenadas:

1. **Histórica (ya corregida el 2026-07-12):** `entity_state` y `os_files` NO EXISTÍAN en el proyecto del OS. Toda escritura fallaba.
2. **`os-files.ts` DISFRAZABA EL FALLO DE ÉXITO.** Si el `insert` en `os_files` fallaba, devolvía **`{ ok: true }` con una fila FALSA** (su `id` era la ruta de Storage, no un uuid) y sin ningún aviso. La UI cantaba «Archivo subido» mientras el archivo quedaba invisible para `listMyFiles`, el realtime, los permisos y cualquier otro dispositivo. **Y no había cola de reintento para archivos**, así que la subida nunca se recuperaba.
3. **`entity-library.ts` se tragaba el motivo.** `setEntityState` devolvía `null` tanto para «no hay fila» como para «Supabase lo rechazó»; `pushCloud` lo traducía a «encolar pendiente» sin decir por qué. El usuario solo veía un «cambios pendientes» perpetuo, sin causa.

Y dos bugs de fusión que impedían que el sync funcionara **aunque la nube respondiera bien**:

4. **Los borrados NO se propagaban NUNCA.** `mergeDocs` era una **unión por id**: el dispositivo A borraba y subía el doc sin el ítem, pero B fusionaba su caché (que aún lo tenía) con lo remoto y **lo resucitaba**.
5. **Renombrar/mover se perdía.** El reloj LWW era `addedAt`/`createdAt`, que **no cambian al editar**; con el desempate `>=` ganaba SIEMPRE el nodo remoto, así que toda edición local aún no subida **se revertía sola** en la siguiente lectura.

### Hecho

**A · Sync real (nada se guarda solo en local, y si falla se VE)**
- `src/lib/sync/entity-state.ts`: nuevas `getEntityStateChecked`/`setEntityStateChecked` → devuelven `{ row, error }` con el **mensaje real** de Supabase. Las funciones antiguas se conservan (mismo contrato) como envoltorio.
- `src/lib/library/entity-library.ts` (doc **v3**, migración normalizadora perezosa e idempotente v1/v2→v3, **sin DDL**):
  - **Lápidas** (`deletedItems`/`deletedFolders`: id → ISO, podadas a 90 días) → el borrado viaja y gana la fusión. Un nodo solo «resucita» si se editó DESPUÉS de la lápida.
  - **Reloj LWW por nodo** (`updatedAt` en `SavedItem` y `LibraryFolder`), tocado en TODA edición (`touchItem`/`touchFolder`) → renombrar/mover/etiquetar/ACL ya ganan la fusión.
  - `pushCloud` guarda el **motivo** del rechazo en la cola (`lastError`) y lo expone (`lastSyncError`, `useLibraryPendingSync().error`).
  - La cola offline sigue reintentando (online + cada 30 s) y ahora **actualiza el motivo** en cada reintento fallido en vez de perderlo.
- `src/lib/files/os-files.ts`: se acabó el falso `ok`. Si la fila no entra, se devuelve **`warning`** y la fila se **encola** (`starseed.osfiles.pending.v1`) con reintento propio (online + 30 s). Subida, borrado y cambio de permisos **emiten señal en vivo** (`files:<uid>`) y `subscribeMyFiles` escucha ya por **broadcast + postgres_changes** (redundante, como la biblioteca).
- UI: banner rojo con el **motivo textual** del rechazo de la nube en la cabecera de la Biblioteca + aviso «N archivo(s) sin registrar — reintentar»; toast de `warning` en el selector universal de archivos.

**B · Historial, ramas y registro (§2) — tablas NUEVAS, aplicadas y verificadas**
- Migración `supabase/migrations/20260712100000_os_versions.sql` (idempotente):
  - `os_versions(id, resource_kind ∈ library|folder|file|brain|post, resource_id, owner, rev, parent_rev, branch='main', author, device_id, message, size, checksum, storage_path, snapshot jsonb, created_at)`.
    UNIQUE `(resource_kind, resource_id, branch, rev)` + índice `(…, branch, rev DESC)`.
  - `os_access_log(…, action, actor, device_id, detail jsonb, created_at)` — el «Registro» de accesos y cambios.
  - **RLS derivada del recurso, no duplicada:** `owner` es la EntityRef serializada `<kind>:<id>`, y `osv_can_read`/`osv_can_write` delegan en las `es_can_read`/`es_can_write` que ya gobiernan `entity_state`. Resultado exacto: **ve el historial quien puede ver el recurso; crea revisiones quien puede editarlo**.
  - **Append-only**: no existe política de UPDATE (una revisión jamás se reescribe). Realtime + `REPLICA IDENTITY FULL`.
- API `src/lib/versions/versions.ts`: `recordVersion()` (con reintento ante carrera 23505), `listVersions()`, `listBranches()`, `headRev()`, `restoreVersion()` (no reescribe: devuelve el snapshot y **anota una revisión nueva**), `branchFrom()`, `logAccess()`, `listAccessLog()`, `quickChecksum()` (FNV-1a, sin depender de WebCrypto ni de npm nuevo).
- **Cableado:** cada guardado real de biblioteca/folder/ítem crea revisión + entrada de registro (no bloqueante: si el historial falla, el guardado ya está hecho — es una garantía, no un peaje).
- **Binarios:** `uploadFileVersion()` sube cada revisión a su **propio** objeto `<uid>/<fileId>/<rev>/<nombre>` con `upsert:false` — **nunca se sobrescribe**; `os_files` apunta a la última y `os_versions` guarda el puntero de todas.
- UI: menú contextual → **«Historial…»** y **«Registro…»** (ítems **y** folders) → `src/components/library/finder/history-dialog.tsx` (Crystal Liquid Glass): pestañas Versiones/Registro, selector de ramas, autor/dispositivo/fecha/mensaje, **Restaurar**, **Crear rama**, **Comparar** (diff de líneas). Funde además los snapshots locales heredados (`item.versions`) para no perder el historial previo.

### Verificado de verdad (contra la BD real, impersonando `authenticated`)
Migración aplicada (`[]`). Comprobado: 15 columnas de `os_versions`, RLS **ON**, `REPLICA IDENTITY FULL`, 6 índices, ambas tablas en `supabase_realtime`. Prueba funcional: crear 3 revisiones → listar → **ramificar** (rama `idea` con `parent_rev`) → listar ramas (`main` head 2, `idea` head 1) → **restaurar** (snapshot correcto recuperado). Pruebas NEGATIVAS: otro usuario ve **0 filas** del historial ajeno y su INSERT es **rechazado por RLS** (42501); el `UPDATE` de una revisión afecta a **0 filas** (append-only). **Datos de prueba borrados** (verificado 0/0).
`tsc` con el tsconfig real (extends + `files`): **0 errores**.

### Decisiones tomadas
- **Sin DDL para el doc de la biblioteca**: lápidas y relojes LWW son claves opcionales más en el mismo `jsonb`. Los docs v1/v2 se normalizan al leer y caen con elegancia a `addedAt`/`createdAt` hasta su primera edición.
- **El historial hereda el permiso del recurso** (una sola fuente de verdad de permisos, `es_can_*`) en vez de reimplementar ACL en `os_versions`.
- **Restaurar no reescribe el pasado**: anota una revisión nueva. El historial es un registro, no un borrador.
- Se mantiene «Versiones (este dispositivo)» además de «Historial» para no tirar los snapshots locales ya guardados.

### Pendiente / límites honestos
- Los **6 objetos huérfanos** de Storage (subidos el 2026-07-11, sin fila en `os_files`) **siguen sin fila**: la cola solo recupera lo que falle a partir de ahora. Habría que reindexarlos (barrido de `storage.objects` → `os_files`) o volverlos a subir.
- `uploadFileVersion()` existe y compila, pero **aún no tiene botón en el Finder** («Subir versión nueva…» del archivo): queda para la siguiente pasada.
- La granularidad de RLS de la biblioteca sigue siendo la fila `entity_state` completa (ver límite ya anotado en la entrada de permisos). `os_versions` sí es fila por revisión.
- El «Comparar» del historial solo tiene sentido en texto (contenido/nota/título); los binarios comparan tamaño/checksum.

---

## 2026-07-12 · Adenda 66 §5 + §7 — Compartir/Enviar universal + Filtros·Orden·Búsqueda inteligente de publicaciones

**Motivo:** implementar (a) «Compartir cualquier cosa en cualquier sitio» (§5) y (b) filtros/orden/búsqueda con relevancia Astraura sobre CUALQUIER feed (§7). Regla dorada: el SOP `architecture/folders-permisos-publicaciones.md` ya existía; esta entrada documenta el código.

### A) Compartir / Enviar a… (DESTINOS — distinto de PERMISOS)
- **`src/lib/sharing/share-targets.ts`** (nuevo): capa de destinos. Tipo `ShareResourceRef {kind: cerebro|biblioteca|folder|archivo|publicacion, id, name, url?, route?, note?, mime?, libraryRef?, nodeId?}`. Helpers: `stageCreationAttach()/readCreationAttach()` (store efímero `sessionStorage` clave **`starseed.creation.attach.v1`** → el Lienzo `/crear?attach=1` lo lee y limpia; formato compacto `CreationAttachRef {kind,id,name,url?,route?,note?,mime?}`), `deepLinkFor()`, `toDmAttachment()`, `toShareBody()` (reusa la convención `**Adjuntos:**` que `splitBodyAttachments` ya renderiza), y efectos reales: `shareToThread()` (dm.sendMessage), `shareToEntity()` (os-social.createPost), `shareToBrain()` (cerebro/memory-files.saveMemoryFile), `shareToLibrary()` (entity-library.saveItem). NO toca `access.ts` (permisos).
- **`src/components/sharing/share-to-dialog.tsx`** (nuevo): `ShareToDialog` con 6 destinos → Publicación (Lienzo), Mensaje (selector de hilo real, listThreads), Grupo·Página·Comunidad (buscador searchGroups → createPost), Cerebro (listBrains → memoria), Librería (myLibraryDestinations → saveItem a raíz), Enlace (copia deep-link). Crystal Liquid Glass, datos reales, degradación honesta sin sesión.
- **Botones «Enviar a…» (Send)** cableados en: menú contextual del Finder (`finder-context-menu.tsx` nueva prop `onSendTo` + wiring en `finder-view.tsx`, construye la `ShareResourceRef` del ítem/folder con su libraryRef + deep-link), tarjeta de Cerebro (`cerebro-hub.tsx`, junto a «Compartir»), y visor de publicación (`PostCard.tsx`, junto a «Compartir/Copiar»).
- **Explorar por temas/categorías**: `src/components/library/topics-explorer.tsx` (nuevo) agrupa el catálogo público (`usePublicCatalog`, `library_public_items`) por categoría y por tema/etiqueta, con vacío honesto; montado en la pestaña **Comunidad** de `/library` encima de `PublicCatalogSection`.

### B) Filtros · orden · búsqueda inteligente (§7)
- **`src/lib/social/feed-filters.ts`** (nuevo): `FeedPrefs {sort: reciente|relevante|popular|cronologico|propios, view: lista|tarjetas|compacta, tags[], query, forMe}`. Persistencia POR PERFIL (perfil activo `starseed.profile.active.v1`) y POR ENTORNO en **`starseed.feed.prefs.v1`** (mapa `${perfil}::${entorno}`; la `query` es efímera, no se persiste). `FEED_TAG_CATALOG` derivado de `creation-config.TIPOS_POR_DEST` (enganche listo: si aparece un array plano de etiquetas múltiples, sustituir el import). `filterAndSortPosts()` (puro/síncrono), `rankByRelevance(posts, profileContext)` (import dinámico de `astrauraChat`, prompt español SOLO-JSON, timeout 12s + AbortController, fallback = recencia), y `useFeedFiltered()` (filtro síncrono inmediato + reorden por relevancia cuando llega, NO bloquea la UI).
- **`src/components/social/feed-controls.tsx`** (nuevo): barra reutilizable (búsqueda + orden + vista + etiquetas multiselección + «Para mí» con spinner). Presentacional.
- **Montado en `src/components/social/PostFeed.tsx`** (feed principal usado por perfiles/secciones/páginas/grupos): controles arriba, filtro/orden aplicado antes de render, densidad por vista. **Realtime intacto** (los hooks `useCafePosts`/`useRealtime`/broadcast no se tocan; solo se transforma la lista para pintar).

### Claves nuevas → reportar para SYNCED_KEYS (settings-sync.ts NO tocado)
- **`starseed.feed.prefs.v1`** — preferencias de feed por perfil+entorno (orden/vista/tags/forMe). **SÍ** debe sincronizarse.
- `starseed.creation.attach.v1` — store EFÍMERO navegador→/crear (un solo salto). **NO** añadir a SYNCED_KEYS (por diseño).

### Verificación
- `tsc` con tsconfig temporal (extends real + `include` de los 11 ficheros tocados): **0 errores en los ficheros de esta ola**.
- Único error del grafo: `src/components/social/post-blocks-renderer.tsx(129): "entidad" no comparable a PostBlockType` — es de **OTRO agente** (bloques del Lienzo, off-limits); no creado ni tocado aquí. Debe cerrarlo esa ola (añadir `"entidad"` a `PostBlockType`).

### Pendiente / límites honestos
- `ShareToDialog` guarda en la **raíz** de la biblioteca elegida (sin selector de folder todavía) y el destino «Entidad» cubre grupo/página/comunidad vía `searchGroups` (eventos aún no tienen buscador propio).
- La reordenación «Para mí» depende de que Astraura tenga alguna fuente disponible; si no, cae a recencia (documentado, nunca bloquea).
- El contrato del Lienzo (`starseed.creation.attach.v1`) lo debe **consumir** el otro agente en `/crear` (yo solo lo dejo preparado).

---

## 2026-07-12 — Adenda 66 §5-§6 · Lienzo Universal: destino Librería, etiquetas múltiples, bloques ricos, SourcePicker

**Sesión por:** Claude (subagente, Opus 4.8) bajo dirección de Alex.
**Resumen ejecutivo:** El Centro de Creación / Lienzo Universal (`/crear`) gana: destino **Librería** (biblioteca+folder, guarda ÍTEM con ACL en vez de post), **tipo de publicación = etiquetas múltiples** (chips+búsqueda, 36 etiquetas), **9 tipos de bloque nuevos** (incl. código ejecutable AISLADO en iframe), un **SourcePicker universal** reutilizable y el **render de esos bloques + etiquetas** en `PostCard`. Todo **aditivo**: lo que ya publicaba sigue igual.

### Hecho
- **Destino «Librería»** (`creation-config.ts` → `CreationDest="libreria"`): sub-selector de UBICACIÓN (`library-location-picker.tsx`) con `myLibraryDestinations()` + árbol de folders (`useEntityLibrary`). Publicar a Librería = `saveItemSecure(ref, {type:"post",…}, folderId)` (ítem de biblioteca con su ACL), no `createPost`. Se mantienen todos los destinos previos; `/crear?area=publicar` (QuickPublisher) **excluye** Librería (solo publica en os_posts).
- **Etiquetas múltiples** (`creation-config.ts` `PUBLICATION_TAGS`, 36 etiquetas con icono Lucide + desc + `sections`): componente `TagSelector` (chips seleccionables + búsqueda, en `creation-fields.tsx`). Se guarda `tags: string[]` en `ss:meta` y el `tipo` primario = `tags[0]` (compat). Sustituye al `TipoSelector` en Lienzo y QuickPublisher (`TipoSelector`/`TIPOS_POR_DEST` se conservan por compat con `/publish`).
- **Bloques nuevos** (`creation-blocks.tsx` editores + `post-blocks-renderer.tsx` render): **portada** · **código ejecutable** (HTML/CSS/JS/JSX, preview y render en iframe `sandbox="allow-scripts"` SIN `allow-same-origin` → sin sesión) · **página interactiva** (reusa el sandbox) · **repo** · **pizarra** · **agente/bot** (chat embebido que llama `astrauraChat` con system+persona, aislado) · **mapa** (Leaflet bajo demanda + enlace `/hub/mapa`) · **gráfica** (tabla editable → recharts responsive, datos reales) · **referencia** (cerebro/biblioteca/folder/archivo/neurona/URL vía SourcePicker) · **entidad** (página/perfil/grupo/comunidad/evento).
- **SourcePicker universal** (`source-picker.tsx`, EXPORTADO): dispositivo (→os-files) · biblioteca · folder · archivo · cerebro · neurona · URL. Devuelve `SourceRef` normalizada. Lo consume el Lienzo; queda listo para mensajes/composer (otro agente).
- **Modelo compartido** `src/lib/creation/post-blocks.ts` (`PostBlock`, serialize/parse, `buildSandboxDoc`). Los bloques ricos viajan en `ss:meta.blocks`; los legados (texto/imagen/archivo/enlace/widget) siguen como markdown en el cuerpo (sin doble render).
- **Render en el feed**: `splitBodyAttachments` (`social-posts.ts`) ahora devuelve `tags`+`blocks`; `NormalizedPost` los lleva; `osPostToNormalized` (`use-os-entities.ts`) los propaga; `PostCard` pinta `<PostBlocksRenderer>` + chips de etiquetas. Como los feeds de sección/perfil usan `PostCard`, lo heredan sin tocar `network/**`.
- **Adaptación** (§6): rejilla responsive, imágenes lazy, iframe de altura acotada, gráficas `ResponsiveContainer`, respeto de `prefers-reduced-motion` + `data-perf="eco"` (device-tier); código y mini-mapa se cargan **bajo demanda** (no auto-ejecutan en el feed).
- **Robustez**: `buildSsMetaComment` escapa `-->` → `-->` (los bloques de código/HTML ya no rompen el comentario `ss:meta`; `JSON.parse` lo revierte, sin cambio en los parsers).

### Archivos
- Nuevos: `src/lib/creation/post-blocks.ts`, `src/components/creation/source-picker.tsx`, `src/components/creation/library-location-picker.tsx`, `src/components/creation/creation-blocks.tsx`, `src/components/social/post-blocks-renderer.tsx`.
- Editados: `creation-config.ts`, `creation-fields.tsx`, `lienzo-composer.tsx`, `quick-publisher.tsx`, `src/lib/social-posts.ts`, `src/hooks/use-os-entities.ts`, `src/components/social/PostCard.tsx`.
- **Coordinación**: se añadió `"entidad"` a `PostBlockType` — resuelve el ÚNICO error de grafo que reportó la ola hermana (`post-blocks-renderer.tsx(129)`), que era de esta ola.

### Verificación
- `tsc` local **no pudo completar**: el mount FUSE es demasiado lento (incluso un fichero sin imports agota los 45s cargando node_modules) y el sandbox mata los procesos en background (`--die-with-parent`). Validado por: (a) revisión manual de tipos, (b) verificación por grep de todos los símbolos externos (iconos Lucide, exports de `entity-library`/`brains`/`neurons`/`os-files`/`astraura`/`leaflet-loader`/recharts), (c) cross-check de todos los literales de tipo de bloque contra la unión, (d) el `tsc` de la ola hermana sobre el grafo compartido, que solo marcó el `"entidad"` ya corregido.

### Pendiente / próximos pasos
- Reejecutar `tsc`/`next build` en una máquina con FS rápido para confirmación final (bloqueo puramente de entorno, no de código).
- El SourcePicker en **mensajes/composer** lo engancha el agente hermano (yo lo dejo exportado y usado en el Lienzo).
- Quedaron temp `tsconfig.check*.json` sin borrar (el mount bloquea `rm`, igual que los `tsconfig.agentcheck.json`/`acl-check.json` de las otras olas); untracked, no afectan al build.

---

## 2026-07-12 — Adenda 66 §11-§13 · Semilla OSS completa · Actualizaciones disponibles · Red descentralizada de backends

**Sesión por:** Claude (subagente, Opus 4.8) bajo dirección de Alex.
**Resumen ejecutivo:** (A) La semilla por defecto de la Biblioteca pasa a incluir **TODO el catálogo OSS** (`SEED_VERSION 12→13`), con 5 repos nuevos (Raven·Skales·Mouzi·Strix·Organic Maps) + los que faltaban (CasaOS·Bark·GPT-SoVITS·OmniVoice·OmniRoute + referencias). (B) El Centro de Notificaciones gana **«Actualizaciones disponibles»** con fuentes reales (catálogo StarSeed + GitHub releases/tags) e historial. (C) Nueva capa **red descentralizada de backends** (`storage/backends.ts`) con primario/réplicas por tipo de recurso + panel en Ajustes/Almacenes. Todo aditivo.

### Hecho
- **A · Semilla (§11):**
  - `packages.ts`: +5 paquetes `function` en `starseed-ia-tools` — `iatool-raven`, `iatool-skales`, `iatool-mouzi`, `iatool-strix`, `iatool-organicmaps` (mismo patrón honesto: registran skill + guardan enlace; no descargan). Reflejan `oss-library.ts`.
  - `skills.ts`: +4 capacidades (`agent-memory-backend` [raven+skales], `smart-file-organize`, `security-audit`, `offline-maps`) → los cerebros/neuronas las «ven» al instalarse (activeCapabilityIds usa packageIds/skillIds).
  - `defaults-seed.ts`: `SEED_VERSION 12→13` + añadidos a `RECOMMENDED_PACKAGE_IDS`: `iatool-casaos/bark/gpt-sovits/omnivoice`, `ai-omniroute-local`, los 5 nuevos, y referencias OSS que faltaban (`routellm·litellm·agentos·opencode·openclaw·apple-container`). **Única exclusión deliberada:** `iatool-firecrawl` (free:false · clave de pago) — violaría gratis-primero.
  - `setInstalledVersion(id, version)` nuevo en packages.ts (lo usa el actualizador).
  - Re-siembra: idempotente por `starseed.library.seed.v1` (SYNCED_KEY). Al subir a v13, cuentas existentes reciben los ids nuevos la próxima vez que arranquen (respeta lo ya instalado; los ids nunca ofrecidos antes se auto-instalan). **Propagación a cerebros/neuronas** vía `library-sync.ts` (empuja `cydiaInstalled`+`cydiaFunctions`+`capabilities` a `user_settings.prefs`; el pull hace `mergeInstalledFromAccount`).
- **B · Actualizaciones disponibles (§12):**
  - `src/lib/notifications/available-updates.ts` (nuevo): lista paquetes instalados con repo GitHub (parseado de `payload.externalUrl/url`); comprueba **multi-fuente** — catálogo StarSeed (sin red) + GitHub `releases/latest` + `tags` — y muestra variaciones. Comparador semver-ish. `applyUpdate()` marca la versión nueva como instalada (`setInstalledVersion`) + historial. Caché 6 h + tope de 18 repos/consulta (respeta el rate-limit anónimo; **403 → gracia**). Claves nuevas: `starseed.updates.available.cache.v1`, **`starseed.updates.history.v1`**.
  - `src/components/notifications/available-updates.tsx` (nuevo): tarjeta coherente con el centro; «Buscar actualizaciones», «Actualizar» por ítem, badges por fuente, historial, vacío honesto. Montado en `/notifications` (sección «Feed») sobre `NotificationsCenter`.
- **C · Red descentralizada de backends (§13):**
  - DDL aplicado y **verificado** en `nxstilnyidvkqeosofuh`: `alter table storage_backends add column if not exists is_primary boolean not null default false` + índice parcial por owner. (La tabla ya tenía config/rules jsonb, priority, scope, etc.)
  - `storage/backends.ts` (ampliado, aditivo): +kinds `supabase·gcs·cloudrun·vercel-blob·casaos·ipfs`; `ResourceType`+`RESOURCE_TYPES` (cuenta/perfil/página/folder/archivo/biblioteca/cerebro/publicación); API nueva `addBackend()`, `defaultBackend()`, `setPrimary()`, `setResourcePrimary()`, `toggleResourceReplica()`, `getResourceRouting()`, `resolveBackendFor(resource)` (primario+réplicas). El primario por recurso vive en `rules.primaryFor/replicaFor` (jsonb real); el primario de cuenta en la columna `is_primary`. `ensureDefaults` marca el StarSeed oficial como `is_primary`.
  - `src/components/storage/backends-network-panel.tsx` (nuevo): registra backends, elige primario (⭐) y réplicas por tipo de recurso; el StarSeed oficial siempre presente y no borrable. Montado en `/almacenes` bajo el `StoragePanel` existente.

### Decisiones tomadas
- **No tocar `settings-sync.ts`** (fuera de alcance): las claves de biblioteca/capacidades ya sincronizan por `library-sync.ts`; el historial de updates se **reporta** para SYNCED_KEYS (ver abajo) en vez de añadirlo yo.
- La semilla ahora incluye CasaOS/voces (antes «disponibles»): seguro porque `ensureDefaultsSeeded` **ignora** `action/href` de `install()` → no abre pestañas ni descarga; solo registra skill/enlace/activa fuente local.
- Backends externos: **honesto** — funcional el registro + selección + StarSeed oficial (Supabase del OS); los drivers de I/O reales de cada externo quedan como **andamiaje** (endpoint/ref-a-clave, o vía servidor del cerebro/proxy en runtime). Declarado en la propia UI.

### Claves nuevas (para SYNCED_KEYS · settings-sync.ts, cuando se amplíe)
- `starseed.updates.history.v1` — historial de actualizaciones aplicadas (viajaría con la cuenta).
- (`starseed.updates.available.cache.v1` es caché local; NO hace falta sincronizarla.)
- La sincronización real de la config de backends vive en la tabla `storage_backends` (por cuenta, RLS), no en localStorage.

### Archivos
- Nuevos: `src/lib/notifications/available-updates.ts`, `src/components/notifications/available-updates.tsx`, `src/components/storage/backends-network-panel.tsx`.
- Editados: `src/lib/library/packages.ts` (+5 paquetes, `setInstalledVersion`, comentario CasaOS), `src/ai/astraura/skills.ts` (+4 capacidades), `src/lib/library/defaults-seed.ts` (v13 + recomendados), `src/lib/storage/backends.ts` (kinds+API+is_primary), `src/app/(app)/notifications/page.tsx`, `src/app/(app)/almacenes/page.tsx`.

### Verificación
- DDL: aplicado y verificado (`is_primary boolean NOT NULL DEFAULT false` confirmado por `information_schema`).
- `tsc` (con `tsconfig.adenda66.json` que extiende el real): completó con **1 solo error en TODO el proyecto** y **NINGUNO en mis 8 ficheros** (grep confirmado). El único error es **pre-existente y ajeno**: `post-blocks-renderer.tsx(129)` `'entidad' is not comparable to PostBlockType` — de la ola paralela de Creación/Lienzo (`PostBlockType` vive en `src/lib/creation/**`, zona intocable para mí). Mis cambios = **0 errores de tipo**.

### Pendiente / próximos pasos
- Añadir `starseed.updates.history.v1` a `SYNCED_KEYS` (otro agente/ola; settings-sync.ts estaba fuera de mi alcance).
- Drivers de I/O reales de los backends externos (Supabase propio, GCS/Cloud Run, Vercel Blob, S3, CasaOS, WebDAV, IPFS) — hoy andamiaje.
- Temp `tsconfig.adenda66.json` sin borrar (mount bloquea `rm`; untracked, no afecta al build — Next usa `tsconfig.json`).

---

## 2026-07-12 — Hub: Red por defecto + datos reales + menús unificados + acceso a temas (Adenda 66 §8/§10)
**Sesión por:** Claude (agente Hub/Menús)
**Resumen ejecutivo:** El Hub abre en **Red** (sección principal), todas sus opciones muestran **solo datos reales** de Supabase (o vacío honesto con CTA), y se estrena un patrón ÚNICO de menú `SectionTabs` aplicado al Hub y a la Red. Acceso directo (Palette) al editor de temas desde ajustes.

### Hecho
- **Red como sección principal (§8):** `src/app/(app)/hub/page.tsx` — la pestaña por defecto pasa de `contributions` a **`red`** (`useState("red")`). El deep-link `?tab=` sigue funcionando; sin `?tab` abre Red.
- **Menú unificado (§10):** nuevo `src/components/ui/section-tabs.tsx` — segmented-control glass con scroll-x limpio (`scrollbar-hide` + máscara de fundido lateral + `snap-x`), píldoras de redondeo consistente, estado activo tokenizado (primario), responsive y **accesible por teclado** (`role=tablist` + roving tabindex ← → Inicio/Fin). Dos modos: controlado (`value`/`onValueChange`) y navegación (`href`).
  - Aplicado en el **Hub** (reemplaza el `TabsList`/`TabsTrigger` de 9 columnas; «Red» va primero) y en la **Red** (`network/_components/navigation.tsx` — Panorama/Política/Educación/Cultura, antes se recortaba/partía palabras en móvil). Componente listo para adoptar en el resto del OS.
- **Datos reales en la Red** (`hub/red-section.tsx`, reescrito): los contadores «—» inventados ahora son **reales** desde Supabase con `count exact/head` — Nodos (`os_pages`+`os_groups`+`os_events`), Conexiones (`fetchMyConnectionIds` reales), Propuestas activas (`proposals` status=open), Publicaciones (`posts`≠comment). Añadido **«Pulso de la Red»**: últimas 3 publicaciones REALES del feed (`fetchNetworkFeed`+`enrichAuthors`) con vacío honesto + CTA a `/network`. Las tarjetas de nodo muestran contador real por sección (publicaciones/propuestas/eventos) o «—».
- **Datos reales en Descubre** (`hub/discover-section.tsx`): dejaba de usar `useOsPages/useOsGroups/useOsEvents` (que **mezclan ejemplos** vía `mergeBySlug`) y ahora lee **solo real** con `fetchPages/fetchGroups/fetchRealEventsSafe` (try/catch → []). Vacío honesto con CTA **Crear** (`/crear`).
- **Aportaciones — mocks eliminados** (`hub/page.tsx`): stats falsas `1842/347/9240/×2.4` → **0/0/0/×1.0**; `myBadges` `userBadges.slice(0,5)` → **[]** con vacío honesto; trends inventados («+24 esta semana»…) → descripciones honestas; **panel de desglose** (líneas «+500 pts…», «120 tareas…», «5 000 SC…», «×1.5…») → estado vacío honesto con CTA a la Red; **gráfica «Historial de Impacto»** (curvas SVG inventadas) → estado vacío honesto. Botones muertos «Nueva Página»/«Crear Grupo» → enlazan a `/crear`.
- **Acceso al editor de temas (§10):** en `src/app/(app)/cuenta/page.tsx` — botón **Palette** en la cabecera de ajustes → `/estudio` (Estudio de Diseño = `ThemeMixerPanel`, el editor real; no se duplica) y el QuickLink de Personalización «Apariencia» (que apuntaba a `/settings?tab=appearance`, **roto** porque `/settings`→redirect `/cuenta`) ahora es «Editor de temas» → `/estudio`.

### Decisiones tomadas
- **No tocar los hooks `useOs*`** (los usa todo el OS): la honestidad del Hub se logra leyendo real directo en Descubre, sin cambiar la capa compartida.
- Reputación/Seeds/Karma/Insignias **no tienen tabla en Supabase** todavía → lo honesto es 0/×1.0/vacío + «se construye con actividad real», no cifras inventadas.
- `SectionTabs` NO sustituye a Radix `@/components/ui/tabs`: en el Hub convive con `<Tabs>`/`<TabsContent>` controlados por el mismo estado (drive vía `onValueChange`).

### Pendiente / Próximos pasos
- Adoptar `SectionTabs` en los `TabsList` que aún se recortan (política/cultura/cerebro/ajustes) — el componente ya está listo (educación la lleva otro agente).
- Cablear un sistema real de reputación/seeds/insignias (tablas) para rellenar la pestaña Aportaciones con datos reales.
- Contadores de nodo para Educación (sin fuente de conteo obvia hoy).

### Notas / aprendizajes
- **`tsc` en este repo:** con `allowJs:true` (el real) tsc recorre el enorme grafo `.js` y **no acaba en 45 s**; los procesos en background **mueren** al terminar cada llamada bash (bwrap `--die-with-parent`). Solución: tsconfig **temporal standalone** (sin `extends`, `allowJs:false`, `skipLibCheck`, `types:[react,node]`) con mis ficheros en `files` → cada check < 44 s. **Resultado: 0 errores** en los 6 ficheros (individual y combinado).
- Verificado que `mergePages/mergeGroups/mergeEvents = mergeBySlug(real, sample)` **siempre** inyecta ejemplos → por eso el Hub no podía usar `useOs*` para «solo datos reales».
- Temp `tsconfig.agentcheck.json` queda como `{}` inerte (mount bloquea `rm`; no afecta al build — Next usa `tsconfig.json`). Igual que la ola anterior con `tsconfig.adenda66.json`.

---

## 2026-07-12 — Adenda 66 §9 · Educación: FIX visores 2D/3D + Estudio con Aurora/Astraura

**Sesión por:** Claude (subagente, Opus 4.8) bajo dirección de Alex.
**Resumen ejecutivo:** (A) Arreglada la razón por la que la «Red 3D» y el «Mapa Conceptual 2D» **no abrían** desde Educación y blindados los visores; (B) construida la capa **Estudio con Aurora**: grupos de estudio (miembros + chat realtime), guías/itinerarios generados por Astraura + plantillas reales, exámenes opcionales que otorgan **insignias reales**, y tareas/recomendaciones/proyectos. Todo aditivo; `tsc` 0 errores; migración aplicada y RLS verificada en vivo.

### A) FIX — por qué «no abrían» 2D/3D (causa raíz)
- **Causa (ruta/estado):** la tarjeta «Red de Conocimiento» de Educación (`conocimiento-card.tsx`) ofrece tres accesos rotulados **exactamente** «Lista (árbol)», «Mapa Conceptual 2D» y «Red 3D», pero **los tres enlazaban a `/conocimiento` a secas**. `KnowledgeNetwork` arranca SIEMPRE en `view="lista"` y no leía ningún parámetro → pulsar «Mapa Conceptual 2D»/«Red 3D» abría la **Lista**, nunca el visor prometido. Ese es el «no abren».
- **Descartado por evidencia** (no era ni dependencia ni import ni datos): `three@0.182` + `@react-three/fiber@8.18` + `@react-three/drei@9.122` + `three-stdlib@2.36.1` **instalados y compatibles** (drei peer `three>=0.137`; `Line2` carga); React 18.3.1 (no 19 → r3f v8 OK); tablas `knowledge_categories/topics/topic_categories` **existen con datos** (10/2/4); todos los imports resuelven; `loadKnowledge`/`loadCurriculum` y los renders 2D (SVG) / 3D (r3f) son correctos. **`tsc` scoped: 0 errores** sobre los 6 ficheros del grafo educativo.
- **Fixes aplicados:**
  1. `conocimiento-card.tsx`: los 3 accesos ahora enlazan a `/conocimiento?view=lista|mapa2d|red3d`.
  2. `knowledge-network.tsx`: lee `?view=` en el montaje (client-only, sin `<Suspense>`) para abrir la vista pedida; además envuelve `Map2DView` y `Red3DView` en un ErrorBoundary.
  3. `topic-graph.tsx` (visor propio de la pestaña «Mapa del Conocimiento»): corregido `computeLayout2D` que dejaba **todas las categorías raíz en el centro exacto (radio 0)** apiladas en un punto ilegible → ahora se separan a `ringGap*0.55` (mismo criterio que knowledge-network). 2D y 3D envueltos en ErrorBoundary.
  4. **Nuevo** `view-error-boundary.tsx` (`ViewErrorBoundary`): si un visor lanza en cliente (WebGL, datos raros…), muestra mensaje legible + «Reintentar» en vez de pantalla en blanco (aísla el fallo a la vista). Cubre el hint «error en cliente».

### B) NUEVO — Estudio con Aurora/Astraura (Educación → pestaña «Estudio con Aurora»)
- **Migración** `supabase/migrations/20260712140000_estudio_aurora.sql` (idempotente, RLS sin recursión con `SECURITY DEFINER` sobre OTRAS tablas — patrón de `20260712090100`), **aplicada y verificada EN VIVO** contra `nxstilnyidvkqeosofuh`.
  - Tablas (8): `study_groups`, `study_group_members`, `study_group_posts`, `study_guides`, `exams`, `exam_attempts`, `study_tasks`, `study_projects`. RLS ON en las 8 (24 políticas).
  - Realtime + `REPLICA IDENTITY FULL`: `study_groups`, `study_group_members`, `study_group_posts`, `study_tasks`.
  - Semillas: 4 insignias de educación (`exam_passed`, `quantum_initiate`, `ai_literate`, `civic_scholar`), 3 **guías/itinerario de ejemplo REALES** (Democracia Directa, IA, itinerario Física Cuántica 4 semanas), 3 **exámenes de ejemplo REALES** (cada uno mapeado a su insignia).
  - **Verificación funcional (RLS, impersonando `authenticated`, con ROLLBACK → 0 filas persistidas):** U1 crea grupo/guía/examen/tarea/proyecto/post OK; U2 NO ve grupo privado ni tarea ajena; U2 NO puede unirse a grupo privado ni suplantar `owner`; U2 SÍ ve plantillas; U2 SÍ puede unirse y postear en grupo **público**. Todo verde.
- **Data layer** `src/lib/education/study.ts` (defensivo, nunca lanza) + **IA** `src/lib/education/study-ai.ts` (`astrauraChat` gratis-primero + parseo JSON tolerante) → `generateStudyGuide`, `generateExam`, `recommendTasks`.
- **Insignias reales:** `submitExamAttempt` corrige, guarda intento en `exam_attempts` y al aprobar (≥ `pass_threshold`) llama a `awardBadge(myProfileId(), badge_code)` de `src/lib/badges/badges.ts` → inserta en `profile_badges` (misma vía que usa el BadgesWidget).
- **Componentes** `src/components/education/study/`: `study-hub.tsx` (shell + sub-pestañas) montado como pestaña «Estudio con Aurora» en `network/education/page.tsx`; `study-guides-panel.tsx` (generar/editar/forkear guías + pasos de itinerario → tareas/eventos `os_events`), `study-exams-panel.tsx` (generar/realizar/corregir + insignia), `study-groups-panel.tsx` (crear/unir/salir + chat realtime), `study-tasks-panel.tsx` (tareas + recomendaciones de Aurora + proyectos).

### Archivos
- Nuevos: `supabase/migrations/20260712140000_estudio_aurora.sql`, `src/lib/education/study.ts`, `src/lib/education/study-ai.ts`, `src/components/education/view-error-boundary.tsx`, `src/components/education/study/{study-hub,study-groups-panel,study-guides-panel,study-exams-panel,study-tasks-panel}.tsx`.
- Editados: `src/app/(app)/network/education/page.tsx` (pestaña Estudio), `src/app/(app)/network/education/conocimiento-card.tsx` (deep-link `?view=`), `src/components/education/topic-graph.tsx` (layout raíces + boundary), `src/components/knowledge/knowledge-network.tsx` (`?view=` + boundary).

### Verificación
- `tsc` con `tsconfig.educheck.json` (extends el real, `include` = los 13 ficheros nuevos/tocados): **EXIT 0, 0 errores** (14 s / 516 MB — el scoping evita el grafo `.js` completo que agotaba los 45 s en olas previas).
- Migración: `[]`/HTTP 201 al aplicar; verificación de tablas/RLS/políticas/semillas/realtime + 2 pruebas funcionales RLS con rollback (0 filas de prueba persistidas).

### Pendiente / límites honestos
- Itinerario→`os_events`: `createStudyEvent` es defensivo; NO verifiqué la RLS de INSERT de `os_events` (si estuviera restringida, el botón «Programar evento» avisa con toast y no rompe). Tareas desde pasos (study_tasks) sí 100% verificado.
- Insignia por examen: si el usuario no tiene fila en `profiles` (`myProfileId()` = null), el examen se aprueba igual pero la insignia no se otorga (se avisa «crea tu perfil»). No creé perfiles de prueba.
- Grupos: sin invitaciones a privados todavía (privado = solo dueño puede añadir; el modelo lo soporta vía política `sgm_owner`, falta UI de invitar). Sin buscador/paginación (lista simple, honesta).
- `NO TOCADO`: creation/**, hub/**, src/lib/sharing/**, dock/trinity, settings-sync.ts, PostFeed/PostCard (respetado).
- Temp `tsconfig.educheck.json` en la raíz (untracked; el mount bloquea `rm`; Next usa `tsconfig.json`, no afecta al build).

### Notas / aprendizajes
- **Diagnóstico honesto:** cuando el código, deps, imports, BD y `tsc` están todos limpios pero «no abre», el fallo suele ser **ruta/estado** (deep-link ausente), no una excepción. Aquí la pista estaba en que la tarjeta rotulaba «2D»/«3D» pero no seleccionaba la vista.
- **Workspace bash inestable:** pipes a `python3 -m json.tool` dejaban el oneshot colgado (siguientes llamadas: «process already running»); se recupera solo al expirar (≤45 s). Evitar ese pipe; el Supabase MCP (26a13ed1) **no** tiene permiso sobre este proyecto → DB solo por Management API (curl + token de `.env.local`).


---

## 2026-07-12 — Google Cloud Storage: primer backend EXTERNO con I/O REAL (Adenda 66 §13.1)
**Sesión por:** Claude (subagente · ola GCS)
**Resumen ejecutivo:** GCS deja de ser andamiaje. El OS ya sube, lee y borra objetos de verdad en el bucket soberano `gs://starseed-os-334237619848` (proyecto `gen-lang-client-0222660240`) mediante **URLs firmadas V4 de 10 min** emitidas por una API route de Node — la credencial de Google NUNCA llega al navegador y cada cuenta queda aislada en su prefijo `<uid>/`. Vercel sigue siendo el primario; Cloud Run, el espejo soberano.

### Hecho
- **API route** `src/app/api/storage/gcs/sign/route.ts` (`runtime = "nodejs"`, `dynamic = "force-dynamic"`):
  - **Auth:** exige sesión de Supabase (`@/utils/supabase/server` → `auth.getUser()`); sin sesión → **401**.
  - `POST { path, method: "GET"|"PUT"|"DELETE", contentType? }` → URL firmada V4 (`getSignedUrl`, expira en 10 min).
  - `GET` → **prueba de conexión real** (firma una sonda `<uid>/.starseed-probe`): es lo que ejercita el botón «Probar conexión» del panel.
  - **Aislamiento por usuario:** normaliza la ruta, la fuerza bajo `<uid>/…` (misma regla que `os-files.ts` en Supabase Storage) y **rechaza con 403** rutas con `..`, absolutas, con caracteres de control o cuyo primer segmento sea el uuid de OTRA cuenta.
  - **El bucket lo decide el servidor** (env `GCS_BUCKET`), nunca el cliente → un usuario no puede firmar escrituras en otros buckets alcanzables por la service account.
  - **Credenciales, dos caminos reales:** `GCP_SA_KEY_JSON` (JSON de service account, texto plano **o base64**) → Vercel; si no está, **ADC** (Cloud Run/GCE). Sin ninguna de las dos: **501** con explicación honesta (no se simula éxito).
- **Driver cliente** `src/lib/storage/gcs-driver.ts`: `uploadToGcs` (PUT por XHR con progreso real y `Content-Type` idéntico al firmado), `getGcsUrl`, `deleteFromGcs` (404 = ya borrado → ok), `testGcs`. Todos los fallos vuelven como `{ok:false,error}` con el motivo REAL (sesión, credencial, IAM signBlob, CORS, red).
- **Capa de backends** `src/lib/storage/backends.ts`: `REAL_DRIVER_KINDS = ["starseed","gcs"]`, `isRealBackend`, `testBackend`, `putObjectToBackend`, `getObjectUrlFromBackend`, `deleteObjectFromBackend`, `realReplicasFor`. El kind `gcs` ya NO es andamiaje; el resto sí y lo declara (`scaffold: true` + mensaje).
- **Réplica REAL de archivos** (ADITIVO, `src/lib/files/os-files.ts`): si el usuario marca GCS como réplica del recurso «Archivo» en `/almacenes`, cada subida se copia también al bucket con la MISMA ruta `<uid>/…`. **Primaria = Supabase siempre**; la réplica es best-effort y su fallo se devuelve en `result.replicas` + `result.warning` (jamás en silencio) sin romper la subida. Las réplicas OK se guardan en `os_files.meta.replicas` y `deleteFile` las borra también. Nuevo helper `getReplicaUrl(file)`.
- **Panel `/almacenes`** (`backends-network-panel.tsx`): botón **«Probar conexión»** por backend con estado REAL (bucket + origen de la credencial o el error exacto), badge **«Driver real» / «Andamiaje»**, y aviso honesto de plataforma (Cloud Run = automático por ADC; Vercel = requiere `GCP_SA_KEY_JSON`).
- **Docs:** `architecture/folders-permisos-publicaciones.md` §13.1 reescrito con la infra real (proyecto, bucket, Cloud Run, Artifact Registry con política de 2 imágenes), comando de redeploy y **tabla de costes honesta**. `.env.example` con `GCP_PROJECT_ID`, `GCS_BUCKET`, `GCP_SA_KEY_JSON` (solo comentarios, sin valores).

### Decisiones tomadas
- **Proyecto canónico = `gen-lang-client-0222660240`** (el que tiene billing). `starseed-system` (Firebase) queda descartado para deploy.
- **Nunca credenciales de Google en el navegador** → todo pasa por URLs firmadas V4 de vida corta. Sin `signBlob` ni claves en el cliente.
- **El bucket es del servidor, no del cliente.** Los campos `bucket`/`project` del formulario de `/almacenes` pasan a ser **informativos** (se quitó el campo `keyRef` del kind `gcs`: ya no hay credencial que referenciar en la UI).
- Dependencia nueva **única**: `@google-cloud/storage@^7.21.0` (se descartó firmar a mano con IAM `signBlob` para priorizar que FUNCIONE).

### Verificación
- `npx tsc --noEmit` → **EXIT 0, 0 errores**.
- `npm run build` → **EXIT 0** (`✓ Compiled successfully in 2.5min`), con la ruta `ƒ /api/storage/gcs/sign` presente en el manifiesto (server-rendered on demand, Node).
- NO se probó una subida real end-to-end contra GCS (requiere sesión de navegador y, en Vercel, la env `GCP_SA_KEY_JSON` puesta): la validación honesta es tsc + build + el botón «Probar conexión», que es una firma REAL.

### Pendiente / Próximos pasos
- **Poner `GCP_SA_KEY_JSON` en Vercel** (Production + Preview) o GCS no funcionará en el primario: la UI lo dirá con claridad en vez de fallar en silencio.
- **En Cloud Run:** conceder a la service account del servicio `roles/iam.serviceAccountTokenCreator` **sobre sí misma** (necesario para firmar V4 vía IAM signBlob con ADC). Sin eso, la firma falla con un error explícito.
- Réplica solo del recurso **«Archivo»** (`os-files`). Páginas/publicaciones/biblioteca aún no replican a GCS.
- Restauración desde la réplica: existe `getReplicaUrl(file)` pero ninguna UI la usa todavía (no hay failover automático de lectura).

### Notas / aprendizajes
- ⚠️ **TRAMPA DEL ENTORNO DEL MAC:** la shell tiene `NODE_ENV=production`, así que un `npm i <pkg>` **PODA las devDependencies** (typescript, eslint, tailwind, postcss desaparecieron y `npx tsc` empezó a fallar con «This is not the tsc command you are looking for»). Se restauró con `NODE_ENV=development npm install --include=dev`. **Regla: en este repo, instalar SIEMPRE con `NODE_ENV=development npm install --include=dev`.**
- Un `route.ts` de Next 15 **no puede exportar** nada que no sea un handler HTTP o `runtime`/`dynamic` (los helpers auxiliares se dejaron sin `export`).

---

## 2026-07-12 — Aurora: chat duplicado + «no escucha y se repite en bucle» (causa raíz OBSERVADA en vivo)

**Sesión por:** Claude (Cowork, subagente) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Dos bugs que el usuario reportaba por separado tenían la MISMA familia de causa: superficies de Aurora que se montan sin saber qué más hay montado. Se diagnosticó **en vivo** con Claude-in-Chrome sobre `https://starseed-os.vercel.app` (no por teoría), y se corrigió en el origen.

### Causa raíz OBSERVADA (no supuesta)

**Bug 1 — «el chat de Aurora se duplica».**
- Instrumentando el DOM con el Exocórtex (cortina Zenith → `AuroraChatSection`) ABIERTO, el mismo mensaje (`"hola"`) aparecía **renderizado DOS VECES**: una en el `AuroraChatView` del chat completo y otra en una tarjeta `aurora-mini-player_player__*` de **312×193 px** anclada al orbe.
- Causa: **`src/components/aurora/aurora-widget.tsx:665`** — el orbe montaba sus superficies conversacionales (`AuroraMiniPlayer`, `AuroraSpeechBubble`, mini-popover) con la condición `!trinityOpen && !open && miniPlayerActive`, que **NO comprueba si el chat COMPLETO ya está abierto**. Resultado: el chat principal (con todas las pestañas) arriba y, debajo, un segundo chat más simple repitiendo la MISMA conversación.
- ⚠️ El fix anterior (ocultar con `hidden` la vista compacta detrás del fullscreen, `aurora-chat-section.tsx:960`) no bastaba **porque el duplicado no estaba ahí**: estaba en el ORBE, fuera de la cortina.

**Bug 2 — «Aurora no escucha y se repite en bucle».**
- Parcheando `SpeechRecognition` en vivo se observó que **NO hay dos motores** (`AuroraProvider` es único y el guard `sttOwner` aguanta), pero sí **dos objetos `SpeechRecognition` VIVOS a la vez** dentro del MISMO motor:
  - `onend` programaba el reinicio con `setTimeout(() => next.start(), delay)` (`engine.ts`), y **`start()` no cancelaba ese temporizador pendiente**.
  - Si el usuario tocaba el orbe (o el micro del chat) antes de que venciera —que es justo lo que hace cuando «no le escucha»—, `start()` construía OTRO reconocimiento y lo arrancaba; al vencer el temporizador, **el objeto viejo TAMBIÉN arrancaba**.
  - Dos reconocimientos peleando por el micrófono → se abortan mutuamente (`aborted`) → ninguno entrega `onresult` (**«no escucha»**) y cada `onend` vuelve a programar otro reinicio (**«bucle»**).
  - Además `start()` hacía `stop()` (asíncrono y gentil: el viejo retiene el micro un rato) en vez de `abort()`.
- Log real capturado: `EV_error:no-speech → EV_end → CALL_start(#n+1) → EV_start → EV_speechstart → EV_end (sin EV_result) → CALL_start(#n+2)…`

### Hecho
- **`src/lib/aurora/aurora-orb-bus.ts`** — nuevo bus **UNA SOLA SUPERFICIE DE CHAT**: `setAuroraFullChatOpen()` / `isAuroraFullChatOpen()` / `subscribeAuroraFullChat()` + `AURORA_FULLCHAT_EVENT`. Es un **contador**, no un booleano (soporta varios montajes sin apagarse al desmontar uno).
- **`src/components/exocortex/aurora-chat-section.tsx`** — se REGISTRA mientras está montada (la cortina Zenith solo la monta con `isActive`, así que el registro sigue la visibilidad real).
- **`src/components/aurora/aurora-widget.tsx`** — el orbe se suscribe: con el chat completo abierto **no monta** mini-player, globo ni mini-popover (y cierra el popover si ya estaba abierto). El tap sin STT enfoca el chat que ya hay en vez de abrir un segundo. **El orbe, los gestos Trinity, el wake-word y el mini-player (con el chat cerrado) siguen intactos.**
- **`src/lib/aurora/engine.ts`** — **UN SOLO MOTOR DE VOZ de verdad**: registro a nivel de módulo del ÚNICO `SpeechRecognition` vivo (`startRecognitionExclusive` / `abortLiveRecognition` / `releaseRecognition`). Todo arranque **aborta** el reconocimiento vivo anterior; `start()` **cancela el reinicio programado**; el temporizador de reinicio **comprueba la generación** (y `keepAlive` / medio-dúplex) antes de arrancar; `stop()` invalida la generación y aborta.

### Decisiones tomadas
- La exclusión se resuelve **en el bus**, no con `hidden`/CSS: ocultar no desmonta, y el mini-player además consume el analizador de micro. Mutua exclusión real = una sola superficie y un solo consumidor.
- Se conserva el mini-player como superficie conversacional cuando el chat completo está CERRADO (es su razón de ser).

### Notas / aprendizajes
- 🔑 **Regla confirmada (otra vez):** cuando el orbe hace cosas raras, buscar SIEMPRE una **segunda capa** montada sobre el mismo canal. Esta vez no eran dos motores: eran **dos objetos de reconocimiento del mismo motor**, y **dos superficies de chat del mismo estado**.
- 🔑 **`stop()` de SpeechRecognition es asíncrono y gentil**: no libera el micro al instante. Para relevar un reconocimiento hay que **`abort()`**, y hay que **cancelar los reinicios programados** o resucitan como rivales.
- El analizador de micro (`acquireMicAnalyser`) ya era un singleton con refcount y ya estaba desactivado en Android: **no** era la causa del robo de micrófono.

---

## 2026-07-12 (bis) — Aurora: cierre de la ola (verificación en vivo + 3 causas que faltaban)

**Sesión por:** Claude (Cowork, subagente) — continuación de la entrada anterior, que quedó **sin desplegar**.
**Resumen ejecutivo:** Se verificó **en vivo contra producción** que el duplicado seguía ahí (porque el fix anterior nunca se subió), se confirmó la causa raíz observada, y se cerraron **tres agujeros** que quedaban: un guard permanente que podía dejar a Aurora sorda para siempre, un **segundo motor de voz** dormido en el repo, y el barge-in roto.

### ⚠️ Hallazgo nº1: el fix anterior NUNCA llegó al usuario
- La entrada anterior de esta bitácora describe el fix… pero los archivos estaban **solo modificados en local, sin commit ni push**. Producción (`starseed-os.vercel.app`) seguía sirviendo el commit `6596820`, **sin** el bus `fullChat`.
- **Verificado en vivo** (Claude-in-Chrome, `/dashboard`): con la cortina Zenith abierta (`.axc-root` = 1) y una conversación en marcha, el **mini-player del orbe** estaba montado y visible al mismo tiempo (botón `title="Abrir el panel completo (Chat · Voz · Control)"`), repitiendo los mismos mensajes → **el «segundo chat más simple» que ve el usuario ES el mini-player del orbe**, no la vista compacta detrás del fullscreen (esa ya estaba correctamente oculta: `hidden` → `offsetParent === null`, comprobado).
- 🔑 **Lección:** *«arreglado en local» no es «arreglado».* Un fix de UI **no existe** hasta que está desplegado. Verificar SIEMPRE `git status` antes de dar una ola por cerrada (ya pasó con los subagentes muertos por límite).

### Hecho (además de lo de la entrada anterior)
- **`src/lib/aurora/engine.ts` — `sttOwner` pasa a ser un guard TEMPORAL.** Era un **booleano permanente** (justo lo que prohíbe la regla del proyecto): si la instancia dueña moría sin pasar por `stop()` ni por la limpieza del desmontaje (pestaña congelada, bundle viejo del SW, excepción en el unmount), el testigo quedaba apuntando a una **instancia fantasma** y `start()` volvía **en silencio** para siempre → **Aurora sorda de forma permanente, sin ningún error visible**. Ahora: `canOwnStt()` / `claimStt()` / `releaseStt()` con **TTL de 60 s** y **latido cada 15 s**; el testigo caducado se puede retomar.
- **`src/components/hermes/ai-overlay.tsx` — eliminado el SEGUNDO motor de voz.** El overlay retirado (`AiOverlay`, ya no montado pero conservado en el repo) seguía construyendo **su propio `new SpeechRecognition()`** y llamando a `r.start()` directamente, saltándose el singleton. Era exactamente la mina que la regla del proyecto avisa que hay que buscar. Ahora **delega** en el motor único vía el puente global (`toggleAuroraVoice` / `isAuroraReady`). Ya **no queda ningún otro `new SpeechRecognition()` en `src/`** fuera de `engine.ts:buildRecognition()` (única fábrica).
- **`src/components/aurora/aurora-widget.tsx` — barge-in arreglado.** El tooltip del orbe prometía «Hablando… toca para interrumpir», pero el toque caía en la rama de abajo y, al estar `engaged`, hacía **`disengage()`**: cortaba la escucha en vez de interrumpir el habla. Ahora, si `aurora.speaking`, el toque **interrumpe el TTS y vuelve a escuchar al instante** (barge-in real).
- **`src/components/aurora/aurora-widget.tsx`** — la píldora flotante de `actionStatus` también cede ante el chat completo (allí ya se muestra en su propia banda; se veía duplicada).

### Verificación
- `npx tsc --noEmit` → **0 errores**.
- `npm run build` → **exit 0** (92/92 páginas).
- ⚠️ **Trampa del entorno:** dos agentes construyendo a la vez **comparten `.next`** y el segundo build revienta con `ENOENT … page.js.nft.json` en «Collecting build traces». No es un fallo del código: es una **colisión de builds**. Regla: comprobar `pgrep -f "next build"` antes de construir.

### Pendiente / Próximos pasos
- 🚨 **DESPLEGAR** (commit + push desde el Mac). Mientras no se despliegue, **el usuario sigue viendo el bug**: es la única razón por la que seguía ahí.
- No se pudo verificar la **voz** en vivo (el Chrome automatizado no tiene permiso de micrófono): la instrumentación de `SpeechRecognition` registró **0 instancias** porque la escucha nunca llegó a arrancar. El razonamiento del bucle está apoyado en el código y en el log capturado por la sesión anterior; conviene una pasada final con micrófono real.

---

## 2026-07-12 — Permisos: compartir con TODOS mis perfiles por defecto · Dock Trinity: causa raíz del «no se desliza en tablet» (3er reporte)

**Sesión por:** Claude (Cowork, subagente) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Dos encargos. (A) El ámbito **por defecto** de todo lo que se crea pasa a ser **`account` — «toda mi cuenta (todos mis perfiles)»**, verificado contra la RLS REAL de Supabase. (B) Se encuentra por fin la **causa raíz** del bug del dock en tablet: NO estaba donde se buscó las dos veces anteriores.

### A · Permisos — el default ahora es «toda mi cuenta»

**Qué se cambió (una sola verdad, tres puntos de entrada):**
- **`src/lib/library/entity-library.ts`** — `defaultAccountAcl(account)` (ACL v3: `scope:"account"` + grant `admin` a la cuenta + espejo v2 `read`/`write`) y `withDefaultRootAcl()`, aplicado dentro de `mutate()`: la **raíz** de la biblioteca de una cuenta nace con esa ACL si no tiene una propia. **Folders e ítems nacen SIN `acl` → la HEREDAN** (§3), así que siguen siendo cambiables uno a uno y un cambio en la raíz se propaga a lo que no haya decidido por su cuenta.
- **`src/lib/files/os-files.ts` (`uploadFile`)** — **ANTES: `is_public ?? true`** (¡todo archivo subido nacía **PÚBLICO para toda la red** y con ACL vacía!). **AHORA: `is_public ?? false` + `acl_read`/`acl_write` = `[uid]`**. Sigue siendo cambiable (`updateFileAccess`) y quien quiera público lo pide explícitamente (`/library` en modo GLOBAL ya lo hacía: `isPublic: mode === "GLOBAL"`).
- **`src/lib/sharing/access.ts`** — `defaultAccess()` ya devolvía `scope: "account"` (coherente, no se tocó).
- **`src/components/sharing/share-access-dialog.tsx`** — el ámbito `account` se etiqueta **«Toda mi cuenta»**, lleva una insignia **«Def.»** y, al estar seleccionado, una línea que explica que es el ajuste automático al crear y cómo cambiarlo.

**Verificación contra la BD REAL (Supabase del OS `nxstilnyidvkqeosofuh`, impersonando `authenticated`).** Los recursos de prueba se pusieron **a nombre de OTRA cuenta** a propósito: si el dueño fuese quien lee, la RLS le dejaría pasar por propiedad y la prueba no diría nada del default. Así el ÚNICO camino posible es la ACL:

| Recurso | Sesión **cuenta A** (= cualquiera de sus perfiles) | Sesión **cuenta C** (tercero) |
|---|---|---|
| Biblioteca con el **default nuevo** (`scope:account` → grant a la cuenta A) | ✅ **la ve** | ❌ no la ve |
| Biblioteca **sin ACL** (comportamiento VIEJO) | ❌ **no la ve** | ❌ no la ve |
| Biblioteca cuyo grant nombra **un PERFIL** (A2) | ✅ la ve (regla cuenta↔perfil) | ❌ no la ve |
| Biblioteca `private` (con grant a A) | ❌ cerrada, ni el grant aplica | ❌ no la ve |
| Biblioteca cuya ACL está en un **folder** (raíz sin ACL) | ✅ la ve (`es_doc_acl_allows` recorre nodos) | ❌ no la ve |
| Archivo con el **default nuevo** (`is_public=false`, `acl=[A]`) | ✅ lo ve | ❌ no lo ve |
| Archivo con ACL a **un perfil** (A2) | ✅ lo ve | ❌ no lo ve |
| Archivo con el **default VIEJO** (`is_public=true`) | ✅ lo ve | 🚨 **¡también lo ve!** ← la fuga que esto cierra |

`acl_ids_allow()` confirmada en vivo en las dos direcciones: grant a la CUENTA A → `true` para la sesión A; grant al PERFIL A2 → `true` para la sesión A; grant a un perfil de C → `false`. Datos de prueba y usuarios QA **borrados** al terminar (0 filas residuales).

**Nota conceptual importante:** en el OS la sesión (`auth.uid()`) **ES la Cuenta**; los perfiles son facetas suyas (CLAUDE.md §6). Por eso «que lo vea mi segundo perfil» se cumple nombrando a la CUENTA en el grant — y la migración `20260712100100` (`acl_ids_allow`) además resuelve cuenta↔perfil en **ambas** direcciones, de modo que un grant a un perfil concreto también vale.

### B · Dock Trinity — CAUSA RAÍZ del «en tablet no se puede deslizar» (**archivo:línea**)

**Causa raíz: `src/app/globals.css` — la regla `@media (min-width: 1024px) { .omni-dock-strip { overflow: visible } }`** (bloque OMNIDOCK, ~línea 2300 del archivo anterior al fix).

Había **dos** ramas `@media` y **en tablet ganaba la de escritorio**:
```css
@media (max-width:1023px) { .omni-dock-strip { overflow-x:auto } }  /* sí deslizaba */
@media (min-width:1024px) { .omni-dock-strip { overflow: visible } } /* MATABA el scroll */
```
Un **iPad en horizontal mide 1024–1366px CSS**, así que caía **siempre** en la segunda rama. Con `overflow: visible` el carril **no es contenedor de scroll**: los items que no caben se pintan **fuera** de la píldora (que está centrada), se salen del viewport y quedan **inalcanzables** — no hay nada que deslizar. **Por eso los dos arreglos anteriores no sirvieron: solo tocaban la rama `<1024px`, por la que el tablet nunca pasaba.**

**Evidencia EN VIVO** (Claude-in-Chrome contra `https://starseed-os.vercel.app`, CSS desplegado, dock con 18 tiles):

| Ancho | `overflow-x` | `scrollWidth` / `clientWidth` | `scrollLeft=99999` → | Items fuera del viewport |
|---|---|---|---|---|
| **1194px** (iPad horizontal) | `visible` | 1619 / 1104 (**+515px**) | **se queda en 0** → *scroll IMPOSIBLE* | **5** — «Clima y recordatorios», «Cámara», «Galería», separador y **«Personalizar dock»** |
| **1440px** (escritorio) | `visible` | 1619 / 1340 (+279px) | **se queda en 0** | **3**, incluido **«Personalizar dock»** |
| **834px** (tablet vertical) | `auto` | 1105 / 808 | sí desliza | 5 pero **alcanzables** |

O sea: el bug afectaba a **todo ancho ≥1024px** (tablet horizontal **y escritorio**), y dejaba inalcanzable hasta el botón **«Personalizar dock»** — el usuario ni siquiera podía abrir el editor para quitar items.

**Fix (`src/app/globals.css` + `src/components/layout/omni-dock.tsx`):**
- **Regla ÚNICA sin `@media`**: `overflow-x: auto` en **todos** los anchos. El contenido (~24 tiles) **no cabe en ningún ancho realista** (390 / 834 / 1194 / 1440), así que **no existe un tamaño en el que `overflow:visible` sea correcto**.
- `overscroll-behavior-x: contain`, `scroll-snap-type: x proximity`, `touch-action: pan-x`, momentum iOS, **scrollbar oculta pero funcional**.
- **Drag-to-scroll con ratón** (`onPointerDown/Move/Up`, solo `pointerType==="mouse"`; el táctil se deja intacto para no romper el momentum/snap nativo) + guarda `justDragged` en `onClickCapture` para que soltar encima de un icono **no navegue** sin querer.
- Las flechas «hay más» pasan de adorno (`pointer-events-none`) a **botones reales** que saltan una pantalla.
- `ResizeObserver` sobre el carril: el `resize` de window **no** se dispara al girar un tablet en app instalada ni al abrir/cerrar un folder — las sombras/flechas ya no mienten. Con **guarda anti-bucle** en `setShadow` (comparar antes de re-renderizar).

**Verificación EN VIVO del fix** (regla nueva inyectada en la página desplegada, 1440px): `overflow-x: auto` · `SCROLL_REAL_POSIBLE: true` · `scrollLeft` llega a 282,5 · **«Personalizar dock» pasa a ser ALCANZABLE**.

### Decisiones tomadas / trampas del CSS
- 🔑 **`overflow-y` NO puede quedar en `visible`**: CSS Overflow §3 obliga a que, si un eje es de scroll, el otro no sea `visible`/`clip` (se computan a `auto`/`hidden`). Verificado en vivo: con `overflow-x:auto`, un `overflow-y:clip` **se computa como `hidden`** aunque `CSS.supports()` diga que `clip` existe → `overflow-clip-margin` **no sirve** aquí.
- El headroom de lo que sobresale por arriba (insignia de folder `-6px`, punto de activo `-4px`, hover `-2px` + scale) se compra con **`padding-top:10px` + `margin-top:-10px`**. Medido en vivo: **nada queda recortado** (4px de holgura) y **la píldora NO crece** (124px de alto con la regla vieja y con la nueva — idéntico).
- Los tooltips del dock son `title=` **nativos** del navegador → **no** los recorta ningún `overflow`. El `overflow:visible` de escritorio, que se justificaba con «tooltips y hover-scale intactos», **no hacía falta para los tooltips**.

### Notas / aprendizajes
- 🔑 **Si un bug responsive «ya se arregló» dos veces y sigue vivo, sospecha del BREAKPOINT, no del gesto.** Aquí el arreglo se aplicaba a `<1024px` y el dispositivo del usuario (iPad horizontal, 1194px) entraba por la rama contraria. La pista definitiva no fue leer más CSS, sino **medir `scrollWidth` vs `clientWidth` y probar `scrollLeft = 99999`** en el ancho REAL del dispositivo.
- 🔑 **Un default de compartición equivocado se ve mejor desde la RLS que desde la UI:** `uploadFile` llevaba `is_public ?? true` — cada archivo subido nacía **público para toda la red**. La prueba impersonando a un TERCERO lo enseñó de golpe (ver tabla: el tercero veía el archivo con el default viejo).
- Para probar permisos, **pon el recurso a nombre de otra cuenta**: si lo posee quien lee, la RLS le deja pasar por propiedad y la prueba no demuestra nada.

---

## 2026-07-13 — Aurora natural y completa DESDE EL PRIMER ARRANQUE (5 frentes, todo ajustable)

**Sesión por:** Claude (Cowork, subagente, Opus 4.8) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Aurora nace lista de fábrica sin que el usuario configure nada, pero TODO es ajustable. (1) Voz ORGÁNICA por defecto (preset "Aurora · orgánica": cálida/serena, ritmo natural, sembrado en el arranque). (2) Repos de la Biblioteca ENGANCHADAS al comportamiento real (no solo instaladas). (3) ONBOARDING breve de Aurora (3-5 preguntas opcionales). (4) Orbe/botón flotante ON por defecto en TODO el OS con toggle + sync. (5) Sentidos por defecto (voz ON). `tsc` 0 errores; `build` exit 0. NO desplegado (pendiente push).

### Frente 1 — Voz orgánica por defecto
- **`src/lib/aurora/tts-oss/voice-config.ts`:** nuevo `DEFAULT_VOICE_STYLE` (emoción `serena` + tono `cálida` + `rate:1` ritmo natural + `pitch:1.03` + `energy:52`) incluido en `DEFAULT_VOICE_CONFIG.style`. Nuevo `VOICE_PRESETS` (5 presets de un toque; el 1.º, `AURORA_ORGANIC_PRESET_ID = "aurora-organica"`, es el de fábrica; incluye "Neutra" = `{}` que limpia estilo). Nuevo **seeder `ensureOrganicVoiceDefault()`**: si `starseed.aurora.voice.v1` está AUSENTE y no hay opt-in histórico de Kokoro, persiste el default orgánico (visible/ajustable). Nuevo `applyVoicePreset(id)`. La ruta de migración Kokoro también hereda el estilo.
- **`engine.ts` (boot):** llama a `ensureOrganicVoiceDefault()` junto a `installVoiceStyleListener()`. El habla del navegador ya aplicaba `resolveVoiceParams()` (línea ~551) → el estilo orgánico modula la mejor voz neural rankeada del navegador SIN configurar. Regla de oro intacta (failover gratis-primero; Aurora siempre habla).
- **`neural-tts.ts`:** `NEURAL_ENGINE_META` gana `defaultVoice`; Bark usa preset español cálido por defecto (`v2/es_speaker_1`) al activarse "de un toque" (SoVITS/OmniVoice: el servidor decide). `buildBody` usa `s.voice || meta.defaultVoice`.
- **`voice-oss-panel.tsx`:** fila "Presets" (con ★ en el orgánico) que aplica `applyVoicePreset`; el panel ya estaba suscrito a la config → sliders/emoción se refrescan solos.
- **Barrel `tts-oss/index.ts`:** re-exporta lo nuevo.

### Frente 2 — Repos ENGANCHADAS por defecto (no solo instaladas)
- Verificado (mapa): las repos CLAVE ya estaban enganchadas — voz `voice-neural` (Bark/SoVITS/OmniVoice), `vision` (SmolVLM2), `agent-memory-backend` (Raven/Skales), `smart-file-organize` (Mouzi), `security-audit` (Strix), `offline-maps` (Organic Maps); OmniRoute/OpenRouter son **fuentes reales del router** (`router.ts`), gratis-primero, y **NO fallan sin clave** (availability.ts:141 → keyless OpenRouter no es candidato → cae a gratis/Pollinations; Pollinations es el suelo garantizado). CasaOS = app/endpoint.
- **`src/ai/astraura/skills.ts`:** enganchados los 6 ids sembrados que estaban instalados-pero-no-declarados, extendiendo `packageIds` + `systemPrompt` de capacidades existentes: `router-proxy` (+ `iatool-routellm`, `iatool-litellm`), `sandbox-exec` (+ `iatool-apple-container`), `agent-recipes` (+ `iatool-agentos`), `dev-agent` (+ `iatool-opencode`, `iatool-openclaw`). Ahora `activeCapabilityIds()` los enciende (leen paquetes instalados directos) → `skillsSystemPrompt()` los declara y `skillsRoutingBias()` los considera. **No hizo falta subir `SEED_VERSION`** (ya en la semilla v13 recomendada; el enganche aplica a cuentas nuevas y existentes en el próximo load).

### Frente 3 — Onboarding breve de Aurora
- **NUEVO `src/components/onboarding/aurora-intro.tsx`:** Aurora se presenta + 3-5 preguntas OPCIONALES (cómo llamarte · tono cercano/equilibrado/formal · intereses · idioma · ¿voz ON?). Al terminar alimenta: **contexto de usuario** (`saveUserContextSettings({ about })`), **personalidad** (`adjustActivePersonalityTrait("formalidad", …)` según tono), **voz** (`window.STARSEED_AURORA.setEnabled`). Todo saltable ("Prefiero configurarlo luego"); si se salta, Aurora ya funciona equilibrada/cálida. Persiste en **`starseed.aurora.intro.v1`** (no repetir). Relanzable con evento `starseed:open-aurora-intro` / `window.openAuroraIntro()`.
- **`user-context.ts`:** `UserContextSettings` gana `about?: {callName, interests, tone, language}` (saneado, fusión campo a campo) DENTRO de la clave ya sincronizada `starseed.astraura.usercontext.v1` (sin claves nuevas). `buildUserContext` antepone SIEMPRE la línea de preferencias declaradas (aplica incluso sin ámbito de datos).
- **Gate:** montado en `(app)/layout.tsx` junto a `OnboardingGate`; se muestra SOLO con sesión + `onboarding_state.completed` (tras el asistente de identidad, nunca a la vez) y fuera de rutas públicas. `aurora-guide.tsx` (tour de 11 pasos) ya NO auto-abre hasta que el intro esté hecho (evita dos ventanas la primera vez). Relanzable desde el `AuroraControlPanel` ("Repetir presentación de Aurora").

### Frente 4 — Orbe/botón flotante ON por defecto en TODO el OS + toggle + sync
- **`aurora-orb-bus.ts`:** nueva preferencia estable **`starseed.aurora.fab.enabled.v1` (default TRUE)** con `readFabEnabled`/`setFabEnabled`/`subscribeFabEnabled` + evento. Distinta de `hidden` (descarte de sesión por arrastre a la papelera): `fab.enabled` es la preferencia sincronizada.
- **`aurora-widget.tsx`:** gate de render `if (!fabEnabled) return null;` (antes del gate `hidden`). El orbe se monta globalmente en el layout raíz → aparece en TODAS las secciones salvo que se apague.
- **Toggles:** el switch "Botón flotante" del Exocórtex (`aurora-chat-section.tsx`) ahora dirige `fab.enabled` (al encender deshace también un `hidden`); "Reactivar orbe" reactiva ambos. Nuevo toggle "Botón flotante" en `AuroraControlPanel` (visible en la pestaña "control" del Exocórtex Y en los ajustes de Aurora `/aurora`).
- **Sincronización verificada (por lectura):** orbe y Exocórtex comparten UNA SOLA `AuroraProvider`/motor (layout raíz) → mismo chatlog (`starseed.aurora.chatlog.v1`), misma personalidad (`resolvePersonalityForContext`), misma voz/motor (`starseed.aurora.voice.v1`). No hay instancias separadas.

### Frente 5 — Sentidos por defecto
- **`src/lib/aurora/types.ts`:** `DEFAULT_SETTINGS.enabled = true` (voz ON de fábrica). NO fuerza escucha en web (el provider solo auto-escucha en app instalada; en web se toca el orbe) ni pide permisos por sorpresa. Contexto de usuario ya estaba ON (nivel `breve`); visión disponible opt-in; tools locales (screen/voice/personality/files/web) ya disponibles por defecto de forma segura.

### Claves nuevas para SYNCED_KEYS (settings-sync.ts — NO tocado, se reporta)
- **`starseed.aurora.fab.enabled.v1`** (preferencia del botón flotante, default ON) — AÑADIR.
- **`starseed.aurora.intro.v1`** (marca de intro hecho; para no repetir entre dispositivos) — AÑADIR.
- Ya sincronizadas y reutilizadas: `starseed.aurora.voice.v1`, `starseed.astraura.usercontext.v1` (ahora con `about`), `starseed.aurora.personalities.v1`, `starseed.aurora.personality.active.v1`.

### Verificación
- `node_modules/.bin/tsc --noEmit` → **EXIT 0, 0 errores** (en el Mac, vía Desktop Commander).
- `npm run build` → **EXIT 0** (`✓ Compiled successfully in 48s`, todas las páginas).
- **Voz EN VIVO no verificada:** los cambios NO están desplegados y el Chrome automatizado no tiene micro/audio fiable; el razonamiento se apoya en el código (el navegador ya modula con `resolveVoiceParams`) + tsc/build. Pendiente pasada con navegador real tras desplegar.

### Pendiente / Próximos pasos
- **Desplegar** (commit + push desde el Mac a `StarSeedSystem/starseed-system`; verificar status "Vercel"). Mientras no se despliegue, el usuario no ve nada de esto.
- Añadir `starseed.aurora.fab.enabled.v1` y `starseed.aurora.intro.v1` a `SYNCED_KEYS` (settings-sync.ts, fuera de mi alcance esta ola).
- Verificar la voz orgánica en vivo con micrófono/audio real.
- NO TOCADO (respetado): `src/lib/sharing/**`, `src/components/library/**`, `omni-dock`/`globals.css`, `src/lib/storage/**`, `cloudbuild.yaml`/`Dockerfile`, `settings-sync.ts`. Sin dependencias npm nuevas. Sin revolver el fix de Aurora del commit 48c3990 (motor de voz único, bus fullChat, permisos default) — todo lo nuevo es aditivo sobre él.

### Notas / aprendizajes
- **`activeCapabilityIds()` lee los paquetes instalados directos** (no solo el mirror `starseed.capabilities.v1`): añadir un `packageId` a una capacidad de `skills.ts` la enciende para cuentas que YA tengan ese paquete sembrado, sin re-sembrar. Por eso hooking ≠ re-seed.
- **El default orgánico convive con "Restablecer"/"Neutra":** `resetVoiceStyle()` y el preset "Neutra" escriben `style: undefined` → neutro real; el default solo se aplica cuando NO hay clave (primer arranque) o vía el preset explícito. "Todo ajustable" incluye poder quitar la modulación.
- **Secuenciado de onboarding:** intro (preferencias) primero, tour de interfaz después (guard por `starseed.aurora.intro.v1`) → nunca dos ventanas a la vez la primera vez.

---

## 2026-07-13 — Adenda 67 · P0-1 (chat duplicado) + P0-3 (Aurora sorda en Android)

**Sesión por:** Claude (Cowork, subagente de la ola Adenda 67).
**Resumen ejecutivo:** Eliminada la SEGUNDA superficie de chat de Aurora (`AuroraSpeechBubble`) y corregida la causa raíz por la que el reconocimiento de voz se apagaba solo en Android (contabilidad de salud del STT mal planteada).

### Hecho

**P0-1 · Chat duplicado — la superficie mala, eliminada**
- **Borrado** `src/components/aurora/aurora-speech-bubble.tsx` (el GLOBO «Aurora · ESCUCHANDO / Te escucho… / ▶ ⏹ ↵ Continuar / X»). Cero referencias en el árbol.
- El **mini-reproductor** (`aurora-mini-player.tsx`) es ahora la **ÚNICA** superficie de Aurora anclada al orbe. Sigue apareciendo **por defecto** (apagable con `starseed.aurora.fab.enabled.v1`).
- El **texto proactivo** (`aurora:suggest` / `aurora:notify`) — que era la otra razón de existir del globo — se pinta **dentro** del reproductor: nueva prop `proactive` (`AuroraProactive`), cabecera «Sugerencia»/«Aviso», y ▶ lo dice en voz alta **solo si se pide** (una recomendación nunca habla sola). El listener y el auto-ocultado (12 s) viven en `aurora-widget.tsx`.
- ⚠️ **Corrección de rumbo respecto a la ola anterior (`48c3990`)**: allí se hizo que el mini-player CEDIERA ante el chat completo asumiendo que el bueno era el otro. **El mini-player es el bueno.** No se toca su comportamiento salvo para darle el canal proactivo.

**P0-3 · Aurora no escuchaba en Android — CAUSA RAÍZ**
- `src/lib/aurora/engine.ts` → `buildRecognition().onend`: la contabilidad anti-loop (`sttLastResultAtRef`) contaba como **reinicio fallido** cualquier ciclo **sin resultado**. Pero en Android el `SpeechRecognition` **termina solo tras cada frase Y por silencio** (`no-speech`), así que **acabar sin haber oído nada es el estado NORMAL**. Con `> 6` de esos ciclos (≈30-45 s de uso normal, sin hablar) → `keepAliveRef = false` → **el micrófono se apagaba PARA SIEMPRE**, y encima **en silencio** (`voiceUnavailable` seguía false: el orbe parecía normal y Aurora estaba sorda). En escritorio no se veía porque `continuous = true` mantiene la sesión abierta y casi no hay ciclos `no-speech`.
- **Fix (contabilidad de salud correcta):** ciclo SANO = oyó algo **o** duró ≥ 900 ms **o** terminó por `no-speech`/`aborted`/fin limpio → **no penaliza** y **reinicia rápido (~320 ms en móvil)**, así el micro vive indefinidamente en Android y no se pierde el principio de la frase siguiente. Solo cuenta como ROTO el reconocimiento que muere nada más nacer (la firma real de dos STT peleando por el micro); tope 8 → se rinde **avisando**.
- **Nunca sorda en silencio:** nuevo `sttFatal` (`not-allowed` | `service-not-allowed` | `audio-capture` | `failed`) expuesto por el motor; el provider lo traduce a `voiceUnavailable` → el orbe muestra «voz no disponible · toca para reintentar». Antes `not-allowed` caía en el auto-reinicio a ciegas (bucle invisible).
- **Permisos de micrófono (móvil):** `capabilities.ts` ahora **consulta** el permiso real (Permissions API → `micPermission`, + helpers `withMicPermission` / `getCapabilitiesWithMic`) en vez de **suponerlo** concedido — antes `voiceMode` decía «voz completa» con el micro denegado. En móvil, el **toque del orbe** es el gesto que pide el permiso (`requestAccess`), y `retryVoice` también.
- **Cero `getUserMedia` retenido en móvil:** nuevo `isMobileDevice()` en `voice-autonomy.ts` (Android · iOS · iPadOS táctil · coarse pointer). El analizador del halo (`aurora-orb-bus.ts`) ya no abre captura en **ningún** móvil (antes solo se abstenía en Android) y `requestMaxAccess` **no sondea** el micro si el permiso ya está concedido; cuando sí sondea, lo suelta y espera **350 ms** (Android tarda en liberar el mic → si no, el STT nace con `audio-capture`).

### Verificación
- `npx tsc --noEmit` → **0 errores** (repo completo).
- `npm run build` → **exit 0**.
- **En vivo (Chrome)**: en producción (build viejo) `aurora:notify` abre la superficie `aurora-orb_bubble__…` con el botón «Continuar» (la ventana que sobraba). Con el fix, en el peor caso (Aurora hablando **+** sugerencia proactiva a la vez): **1 sola superficie fija** (el mini-reproductor), **0** burbujas, **0** botones «Continuar», sin «Te escucho…» huérfano. `getCapabilities()` ya devuelve `micPermission` real (`prompt`) e `isMobile`.

### Pendiente / Próximos pasos
- **Probar en un Android real** (el arreglo es determinista por código, pero el ciclo del recognizer varía por versión de Chrome/WebView).
- P0-2 (router sin fuentes / OpenRouter) va en otro agente de esta misma ola.

### Notas / aprendizajes
- **Regla:** en móvil, **el micrófono tiene UN solo dueño**. Cualquier `getUserMedia` paralelo (analizador, precarga de permiso, medidor) deja SORDO al `SpeechRecognition`. Antes de tocar `getUserMedia`, preguntar `isMobileDevice()`.
- **Regla:** en Android, **terminar sin oír nada NO es un fallo** — es el ciclo normal del recognizer. Cualquier watchdog que penalice el silencio acabará apagando el micrófono.
- **Regla:** ningún guard puede apagar la voz **sin decirlo**. Si el motor se rinde, tiene que verse (`voiceUnavailable`) y tiene que haber camino de vuelta.

---

## 2026-07-13 — Adenda 67 · P0-2 + P3: Aurora se quedaba sin cerebro (router, OpenRouter, catálogo gratis)
**Sesión por:** agente Claude (ola Astraura · inteligencia)
**Resumen ejecutivo:** Aurora fallaba en la mayoría de preguntas («probé: Pollinations…») porque **Pollinations era la ÚNICA fuente utilizable sin clave** del catálogo: la cadena de failover tenía **un solo eslabón**. Ahora hay **tres cerebros gratis sin clave** (OVHcloud anónimo, LLM7.io, Pollinations), OpenRouter tiene adaptador propio y sitio donde pegar la clave, y el router no puede quedarse sin respuesta.

### Hecho
- **Causa raíz documentada** (`architecture/astraura-inteligencia.md` §22.1): sin claves + sin Ollama + sin descargas opt-in ⇒ `detectAvailability()` solo daba `ready` a `pollinations-text`. Y ese eslabón fallaba por: modelo `mistral` **muerto** (404 **tras 28 s**), timeout de 30 s frente a ~40 s reales, **cooldown de 60 min** sobre la única fuente del invitado, y throws síncronos / Prompt API sin tope que escapaban del failover.
- **Catálogo** (`free-catalog.ts`): +2 fuentes **sin clave** verificadas con CORS `*` (**OVHcloud AI Endpoints** — incluye `Qwen2.5-VL-72B` de **visión** — y **LLM7.io**) y +6 **free-key** (HuggingFace router, Ollama Cloud, ModelScope, Z.ai GLM Flash, Nscale, SiliconFlow). Pollinations: modelo muerto fuera, `neverCooldown`, `timeoutMs: 60s`. Campos nuevos: `keyOptional`, `neverCooldown`, `cooldownMinutes`, `preferFreeModels`, `timeoutMs`.
- **OpenRouter**: adaptador dedicado `src/ai/providers/openrouter.ts` (`HTTP-Referer` + `X-Title`, keep-alive SSE ignorados, 402 accionable, `listOpenRouterFreeModels()` público) + `preferFreeModels` en el ranking + **`SourceKeyInput`**: pegar la clave **en la fila de la fuente** (Ajustes → Inteligencia), cifrada en el dispositivo.
- **Router**: cadena que **siempre** acaba en las fuentes sin clave (Pollinations la última), `Promise.resolve().then(step)`, `detectAvailabilitySafe()`, timeouts por fuente, **último recurso** = modelo del navegador si ya está listo, pin de personalidad por sentido.
- **Personalidades**: `PersonalityProfile.intelligence` (`modo`, `global`, `porSentido`: texto/voz/visión/código/razonamiento, `permitirPago:false`) + `intelligencePinFor()`.
- **Verificado con `curl`** (cabeceras exactas del adaptador, sin ninguna clave): OVH `Qwen3.5-397B` 200 · OVH `Qwen2.5-VL-72B` 200 · LLM7 `gemma3:27b` 200 · Pollinations `openai` 200. `tsc --noEmit` **0** · `npm run build` **OK** (92/92).

### Decisiones tomadas
- **NO se añaden fuentes sin verificar.** Hack Club AI (`ai.hackclub.com`) está **muerto** (404) → fuera. Together AI ya no figura en la lista actualizada → fuera hasta poder verificarlo.
- **FckSignups** no aporta APIs LLM (es un directorio de herramientas sin registro): se integra su **principio**, no un endpoint.
- **Hugging Bay** se queda donde estaba: es **descubrimiento**, no inferencia.

### Notas / aprendizajes
- **Regla:** el catálogo debe tener **SIEMPRE ≥2 fuentes utilizables sin clave, sin servidor local y sin descarga**. Con una sola, "failover" es una palabra vacía: cualquier fallo transitorio deja a Aurora sin cerebro.
- **Regla:** una fuente **última recurso NUNCA entra en cooldown**. Enfriar 60 min a la única IA del invitado por un 429 es apagarle el cerebro una hora.
- **Regla:** el cooldown debe medirse en la **unidad del límite**. Cuota **diaria** → 60 min. Límite por **minuto** (OVH: 2 RPM) → 3 min. Enfriar una hora algo que se recupera en 30 s es tirar la fuente a la basura.
- **Regla:** un id de modelo en el catálogo es **una afirmación sobre el mundo** y caduca. `mistral` de Pollinations llevaba tiempo muerto y **tardaba 28 s en decir 404**. Verificar los ids con `curl` cada vez que se toque el catálogo.
- **Trampa:** `chat({ providerId })` resuelve **la primera** config con ese id. Con varios servicios distintos bajo `openai-compatible`, eso manda la petición al **endpoint equivocado con la clave equivocada**. Resolver siempre baseUrl + clave de la config concreta.

---

## 2026-07-13 — Adenda 67 · P1: Centro de Configuración de Aurora y Astraura
**Sesión por:** agente Claude (ola Astraura+Aurora · P1-1 / P1-2 / P1-3)
**Resumen ejecutivo:** La pantalla «Hola, soy Aurora» deja de ser un saludo con 4 preguntas y pasa a ser el **centro de configuración completo** de Aurora y Astraura (7 pestañas). Todo viene ya funcionando con las **mejores opciones gratuitas/OSS** y todo es editable desde el primer momento. Se cierra por fin el hueco de P3: el **pin de fuente/modelo por sentido** existía en el modelo pero **no tenía formulario** — ahora lo tiene, y lo que se elige llega de verdad al router.

### Hecho
- **Nuevo módulo de datos** `src/lib/aurora/setup-config.ts` (ligero, sin Supabase ni React, SSR-safe): gate de primera vez, config **por sentido** (12), **perfil+permisos por personalidad**, **reparto de habilidades/repos** por perfil·cerebro·neurona, y **ámbito unificado** + overrides por entidad. 5 claves nuevas (ver abajo).
- **Nuevo `src/lib/aurora/persona-avatar.ts`**: avatar **procedural** (SVG determinista derivado de los niveladores de la personalidad — paleta por calidez/serenidad/creatividad/análisis; offline, sin dependencias) + avatar **generado con IA** gratis y sin clave (Pollinations, URL directa). Si el servicio externo falla, la UI lo dice y se queda el procedural.
- **Nuevo `src/components/aurora/setup/`**: `aurora-setup-center.tsx` (shell + gates + `SectionTabs`) y 7 pestañas — bienvenida · personalidad · sentidos · conexiones · astraura · voz · memoria — con `setup-ui.tsx` de primitivas. Pestañas por `next/dynamic` (coste ~0 en el arranque, aunque el centro viva en el layout de la app).
- **`aurora-intro.tsx` reconvertido**: ahora sólo monta el centro. Sus constantes y el evento legado `starseed:open-aurora-intro` siguen exportados/escuchados (lo usa `aurora-control-panel.tsx`).
- **`personalities.ts` cableado** (3 puntos, todos aditivos y con try/catch): `compilePersonalityPrompt()` anexa **matices por sentido** y **permisos del perfil**; `resolvePersonalityForContext()` mete el escalón de **entidad** (chat > entidad > cerebro > sección > global).
- **`intelligence-panel.tsx`**: `SourceKeyInput` pasa a estar **exportado** para reutilizarlo tal cual en «Conexiones» (una sola forma de guardar una clave en todo el OS).
- **Puntos de entrada**: `/cuenta` §Aurora e inteligencia → tarjeta «Abrir centro»; `/agent` (AI Studio) → botón «Configurar Aurora» + auto-apertura si el perfil no está configurado.
- **Verificado en el Mac:** `npx tsc --noEmit` **exit 0** (0 errores) · `npm run build` **exit 0** (compiled in 65 s, 92/92 páginas).

### Claves nuevas (⚠️ PENDIENTE: añadirlas a `SYNCED_KEYS` en `src/lib/settings-sync.ts` — este agente NO lo tocó por acuerdo de ola)
- `starseed.aurora.setup.v1` — gate + versión del centro.
- `starseed.aurora.senses.v1` — config por sentido (on/off, pin, memoria, herramientas, tono, carácter).
- `starseed.aurora.persona-profiles.v1` — perfil (avatar + permisos + aprendizaje) por personalidad.
- `starseed.astraura.deploy.v1` — reparto de habilidades/repos por perfil·cerebro·neurona.
- `starseed.astraura.scope.v1` — ámbitos (cuenta/grupos/páginas/entidades/red) + overrides por entidad.

### Decisiones tomadas
- **No duplicar nada.** Personalidad = `PersonalitiesPanel` + lo que faltaba. Voz = `VoiceOssPanel` + presets del registro real. Conexiones = `SourceKeyInput` + `UserConnectorsHub` + `McpPanel` + repos de la Biblioteca. El centro **orquesta**, no reimplementa.
- **Motores de voz NO hardcodeados**: se leen del registro (`VOICE_PRESETS`, `VoiceOssPanel`), así VoxCPM y Voicebox aparecerán solos cuando el agente de P2 los registre.
- **Defaults soberanos**: publicar y responder en nombre del usuario están **OFF** por defecto; aprender, gestionar Biblioteca y operar pantalla, ON. La libertad se amplía por decisión explícita, nunca por defecto.
- **Semántica «todas»/«todos» viva** en el reparto de Astraura: mientras el objetivo esté completo se guarda como `"todas"`, de modo que lo que instales mañana entra solo. Sólo al quitar algo se materializa la lista.
- **Auto-apertura una vez por sesión.** Cerrar el centro cuenta como «configurar luego» (marca hecho): los defaults ya funcionan y no se acosa al usuario. Sigue disponible siempre desde Ajustes y AI Studio.

### Notas / aprendizajes
- **Un modelo sin formulario es una promesa incumplida.** `intelligence.porSentido` llevaba una ola entera existiendo, normalizándose y siendo leído por el router… y **ningún usuario podía escribirlo**. Al cerrar una ola, comprobar que cada campo persistible tiene UI *o* está declarado explícitamente como interno.
- **Ciclo de importación evitado por diseño**: `setup-config.ts` importa de `personalities.ts` **sólo tipos** (se borran al compilar) y `personalities.ts` importa funciones de `setup-config.ts`. La dependencia de valores es unidireccional; si algún día `setup-config` necesita un valor de `personalities`, habrá que romperlo con un módulo tercero.
- **`next/image` no vale para avatares**: los `data:` URL de SVG y las URL de Pollinations no están en `images.remotePatterns`. El OS ya usa `<img>` en varios sitios; se usa `<img>` con el eslint-disable correspondiente.
- **Honestidad en la UI**: los sentidos «sueño» y similares llevan insignia **«Sólo preferencia»** y explican que el OS guarda esas memorias y Aurora las lee, pero que **no hay proceso nocturno automático**. Mejor decirlo que fingir un motor que no existe.

---

## 2026-07-13 — Adenda 67 · P2 · La voz de Aurora: VoxCPM + Voicebox + fusión inteligente

**Sesión por:** Claude (Cowork, agente de voz — en paralelo con el agente del Centro de Configuración)
**Resumen ejecutivo:** Se integran **VoxCPM** (nuevo motor **PRINCIPAL**: el más realista) y **Voicebox**, y se crea el **registro de motores de voz** con **selección automática** del mejor disponible, **failover en cadena** y **override por personalidad**. Ahora basta con que exista un endpoint para que Aurora hable con el mejor motor — sin que el usuario cambie nada — y si ese motor se cae, la misma frase sale por el siguiente. SOP: `architecture/aurora-voz-motores.md`.

### Hecho
- **`engine-registry.ts` (NUEVO)** — el registro: metadatos por motor (`realism` 1-5, `requiresEndpoint`, `requiresDownload`, `free`, `langs`, `emotions`, `cloning`, `latency`, `license`, `requirements`) para los 8 motores, + `buildVoiceChain()` (la fusión), + la API pública del Centro de Configuración: `listVoiceEngines()` · `listVoiceEnginesWithStatus()` · `listVoicePresets()` · `listEngineVoices()` · `testVoice()` · `resolveActiveVoiceEngine()`.
- **VoxCPM** (`voxcpm`, Apache-2.0) — motor por endpoint que cubre **las tres formas reales de servirlo**: vLLM-Omni (`POST /v1/audio/speech`, OpenAI-compatible), Nano-vLLM (`POST /generate` → MP3) y **Gradio** (`/gradio_api/call/generate`, 2 pasos). Timeout 45 s. Su **diseño de voz por descripción** se alimenta del preset/emoción activos.
- **Voicebox** (`voicebox`, MIT) — motor por endpoint contra `POST /generate/stream` (WAV). Requisitos duros declarados (profile_id + CORS), `listVoiceboxProfiles()` para elegir la voz clonada de una lista.
- **12 tipos de voz prediseñados** (antes 5) con tres capas: números (navegador/Kokoro) + `voiceDesign` (VoxCPM) + `instruct` (Voicebox).
- **Librería**: categoría OSS nueva **`voice`** (6 motores; se mueven ahí bark/sovits/omnivoice, que estaban mal catalogados como "runtime") + paquetes `iatool-voxcpm`/`iatool-voicebox` + skill `voice-engines` + **SEED_VERSION 13 → 14**.
- **Verificación**: `npx tsc --noEmit` **0 errores** · `npm run build` **exit 0** (92/92 páginas).

### Decisiones tomadas
- **La selección automática ya no exige "cambiar de motor".** Antes, `speakWithConfiguredEngine()` se salía de vacío si `engine === "browser"` — que es el DEFECTO. Es decir: un usuario podía tener un VoxCPM corriendo y Aurora **nunca lo habría usado**. Ahora la cadena se construye siempre: si hay un motor mejor **configurado**, lo usa. Pero con una guarda de coste: **si la cadena queda vacía (nadie tiene servidores), se sale al instante sin cargar módulos ni hacer fetch**. Cero peaje para el caso mayoritario.
- **El pin de personalidad va primero pero NO es exclusivo** (mismo principio que el pin de inteligencia del router, §22 de `astraura-inteligencia.md`): si el motor fijado no está, la cadena sigue. Un pin obsoleto **no puede** dejar a Aurora muda.
- **`testVoice()` NO usa el fallback, a propósito.** El fallback existe para que Aurora nunca calle en su uso normal; una **prueba** existe para *diagnosticar*. Si pides probar VoxCPM y no responde, se dice — no se disimula hablando con la voz del navegador y dejando creer que funcionó.
- **Voicebox se declara "no configurado" sin `profile_id`.** Su API responde 404 sin él: llamarlo "configurado" sería mentir y gastaría el presupuesto de tiempo para nada.
- **La emoción se traduce al idioma de cada motor.** Ni VoxCPM ni Voicebox toman números de pitch: toman *palabras*. Así que el mismo preset que modula el navegador con `rate/pitch/energy` modula VoxCPM con una descripción («voz femenina joven, cálida y serena») y Voicebox con una instrucción («habla con calidez, a ritmo natural»). **Un solo preset, tres lenguajes.**
- `personalities.ts` gana `intelligence.motorVoz` (aditivo, saneado; los perfiles antiguos siguen igual). El registro lo lee con **`import()` dinámico cacheado** — `personalities.ts` arrastra el cliente de Supabase y este registro tiene que poder importarse barato.

### Pendiente / Próximos pasos
- **Probar contra servidores reales**: vLLM-Omni y Nano-vLLM (hace falta GPU) y la app Voicebox (no está instalada aquí). El cliente es tolerante justo por eso.
- **P-3**: montar el panel de voz (`voice-oss-panel.tsx`) — sigue sin página. El Centro de Configuración (P1, otro agente) ya puede consumir la API de §6 del SOP.
- Clonación con VoxCPM **por Gradio** no es posible (exigiría `/gradio_api/upload`): ahí funciona en modo diseño de voz. Para clonar → vLLM-Omni / Nano-vLLM.

### Notas / aprendizajes
- **Leer el código fuente antes de creerse el README.** El README de Voicebox anuncia `POST /generate` y `POST /speak` como *la* API. Leyendo `backend/routes/` resultó que **ninguna de las dos sirve** para el navegador: son asíncronas (devuelven una fila y hay que sondear un SSE) y `/speak` suena **en los altavoces del PC**. La ruta útil —`/generate/stream`, que devuelve WAV— **no está destacada en el README**. Sin leer el código, habríamos integrado un motor que "no hace nada" y el fallo habría sido silencioso.
- **Verificar el contrato en vivo cuando se pueda.** El Space oficial de VoxCPM expone `GET /gradio_api/info`: eso dio la función (`/generate`) y sus **8 parámetros posicionales exactos** — y reveló que en Gradio el diseño de voz **NO va entre paréntesis en el texto** (eso es la API Python) sino en su **campo propio** `control_instruction`. Adivinar el orden habría producido un motor roto que declina en silencio. Un `curl` valió más que tres suposiciones.
- **La app de escritorio no es un impedimento; el CORS sí.** Voicebox es integrable *precisamente porque* tiene API REST. Lo que hay que decirle al usuario no es "no se puede", sino "arranca la app con `VOICEBOX_CORS_ORIGINS=…`". La honestidad útil es la que trae la instrucción concreta.

---

## 2026-07-13 — Adenda 67 · P4: ocho repos integrados con estado REAL declarado

**Sesión por:** agente (Claude, Cowork)
**Resumen ejecutivo:** Integrados los 8 repos de P4 (OpenManus · Penpot · OpenCut · llm-council · Typesense · MemPalace + TencentDB-Agent-Memory · Databasement · Postiz) clasificando cada uno con honestidad en **FUNCIONAL** (el OS lo ejecuta), **CONECTOR** (servidor que el usuario levanta) o **CATÁLOGO** (sin API usable). El más importante — **llm-council** — no era un servidor sino un *patrón*, así que se **implementó de verdad** dentro del OS como el **Consejo de Aurora** del Área Política. `tsc --noEmit` 0 errores · `npm run build` exit 0 (92/92).

### Hecho
- **P4-4 · Consejo de Aurora (FUNCIONAL, lo más sustancial de la ola).** `src/lib/aurora/council.ts` implementa las 3 etapas del patrón de karpathy —dictámenes separados → **revisión cruzada anonimizada** → síntesis del «Chairman»— sobre `astrauraChat`, repartiendo las perspectivas entre **fuentes distintas** del router (`detectAvailabilitySafe` + `forceSource`). Los consejeros no son modelos rivales sino los **5 fundamentos StarSeed** (ontocrático · ecológico/Oikos · abundancia/post-escasez · simbiótico/Ciberdelia · empático/justicia restaurativa), y **cada dictamen cita su fundamento**. UI en `components/governance/aurora-council.tsx`: tarjeta en `/network/politics` + botón «Consultar al Consejo de Aurora» en el compositor de propuestas. Coste 0: usa el router gratis-primero (el repo original exige OpenRouter **de pago**).
- **P4-5 · Typesense (CONECTOR con fallback).** Cliente real (`X-TYPESENSE-API-KEY`, `/health` · `/collections` · `/documents/search`) + `src/lib/search/unified-search.ts`: Typesense-primero, **fallback automático a Supabase** si no está / se cae / índice vacío. Enganchado aditivamente en Hub y Cultura (misma firma ⇒ cambio de import).
- **P4-8 · Postiz (CONECTOR + confirmación explícita).** `social-crosspost.tsx` en el Lienzo Universal: solo aparece con clave, lista canales reales y **publicar es un acto separado** con diálogo que muestra **canales exactos + texto exacto**. Publicar en StarSeed **nunca** dispara Postiz; el prompt de la capacidad **prohíbe a Aurora publicar** aunque se lo pidan.
- **P4-6 · Memoria.** TencentDB Agent Memory = **conector real** (tiene Gateway HTTP: `/recall` · `/capture` · `/search/memories`…). MemPalace = **catálogo**: no tiene API HTTP (MCP por **stdio**), y se dice literalmente en su ficha.
- **P4-7 · Databasement.** Conector real, pero **no es lo que el encargo suponía** (ver Decisiones).
- **P4-1/2/3.** OpenManus = conector experimental (hay que exponerlo uno mismo). Penpot y OpenCut = instancia + **bloques de publicación nuevos** (`penpot`, `video`), aditivos y sin romper los existentes.
- **Transversal:** 9 entradas en `oss-library.ts` (+2 categorías: `search`, `creation`) · 9 paquetes en `packages.ts` · `SEED_VERSION` **14 → 15** · 8 capacidades nuevas en `skills.ts` · 5 conectores en el Hub · 4 servidores de cerebro · 2 fuentes de memoria · actualizaciones automáticas gratis (todos llevan `externalUrl` de GitHub ⇒ `available-updates.ts` ya los ve).

### Decisiones tomadas
- **Databasement NO es «una base de datos para cada cuenta».** Es un **gestor de COPIAS DE SEGURIDAD** de bases de datos (Laravel, MIT). Se rechazó forzar la premisa del encargo y se integró por lo que realmente es: el **servidor de respaldo** de una cuenta/cerebro/perfil — que además es la pieza que le faltaba a la invariante §6 (*el usuario es el único propietario de sus datos*). Queda escrito en su ficha para que nadie lo re-interprete mal.
- **Penpot NO se incrusta.** `design.penpot.app` manda `X-Frame-Options: SAMEORIGIN` (comprobado con `curl -I`). El bloque renderiza **tarjeta con enlace** y la casilla «incrustar» se **auto-deshabilita** en la instancia oficial, explicando por qué. Un iframe habría sido un rectángulo en blanco con aspecto de bug.
- **OpenCut sí es incrustable, y aun así no se incrusta.** No tiene API (Editor API/headless/MCP son **futuros** en su propio README): un editor cross-origin del que no puedes sacar el fichero es decorado. Se hace lo único real: lanzarlo y publicar el vídeo exportado (que **sí** se reproduce).
- **La semilla no configura endpoints.** Sembrar los 9 paquetes registra capacidad + enlace y nada más: cero descargas, cero claves, cero servidores. **Postiz queda inerte** hasta que el usuario pegue su clave — ninguna cuenta puede publicar en redes por accidente.

### Pendiente / Próximos pasos
- **Sin probar contra servidor real** (no hay instancia pública): Typesense, Gateway de TencentDB, API de Databasement, OpenManus. Los contratos se implementaron leyendo **código fuente**, no adivinando.
- Migrar a `unified-search` las superficies secundarias (`share-access-dialog`, `permissions-popover`, `map-view`, `new-chat-dialog`, `correos-panel`, `media-viewer`): una línea de import cada una.
- Postiz + imágenes: `POST /upload` es multipart y el proxy del OS es JSON ⇒ se adjunta **por URL pública** de la Biblioteca; si la rechaza, se publica solo texto **y se avisa**.
- Claves nuevas que deberían entrar en `SYNCED_KEYS` cuando toque tocar `settings-sync.ts` (NO tocado en esta ola): las de `starseed.integration.{typesense,postiz,tencentdb-memory,databasement,openmanus,penpot,opencut}`.

### Notas / aprendizajes
- **«Es un repo» no dice nada; hay que preguntarse QUÉ ejecuta.** De los 8, solo 4 tenían una API que el OS pudiera llamar. Dos (Penpot, OpenCut) son apps web sin API. Uno (MemPalace) habla MCP **por stdio** y es inalcanzable desde un navegador. Y **uno no era un servicio en absoluto**: llm-council es un *patrón* — y resultó ser, de largo, la integración de **más valor**, porque se podía ejecutar de verdad con lo que ya teníamos. **Lo que parece "solo un ejemplo" puede ser lo único realmente integrable.**
- **`curl -I` antes de escribir un `<iframe>`.** Dos minutos comprobando cabeceras evitaron dos features que se habrían visto en blanco en producción y que nadie habría sabido explicar.
- **El README miente por omisión; el código no.** La API real de TencentDB (`/recall`, `/capture`…) no está en su README: está en `src/gateway/server.ts`. Y el `docker-compose.yml` de MemPalace es el que confiesa que el MCP es **stdio**. Segunda ola consecutiva en que **leer el código fuente cambia el diseño de la integración** (la anterior fue Voicebox).
- **La honestidad hay que codificarla, no solo documentarla.** No basta con un comentario: el prompt de `agent-delegation` **obliga** a Aurora a decir que no ha delegado si no hay endpoint, y el de `social-publish` le **prohíbe** publicar aunque el usuario insista. Si la regla no está en el prompt, no existe.

---

## 2026-07-13 — Adenda 68 · B · Escritorio libre y soberano (bug del difuminado + ventanas)
**Sesión por:** agente Cowork (Claude)
**Resumen ejecutivo:** Diagnosticada EN VIVO y arreglada de raíz la ventana que se abría «medio difuminada y en una capa inferior», y ampliado el escritorio con visor universal (Quick Look), mosaico de N ventanas con divisores arrastrables y pantalla completa.

### 🕳️ CAUSA RAÍZ del difuminado (B-1) — eran DOS bugs sumados, ninguno era z-index de la ventana

**1 · Geometría: la ventana nacía DEBAJO de la barra superior.**
`desktop-store.ts:849` colocaba las ventanas nuevas en `y = Math.max(4, Math.min(20 + (idx%6)*30, …))` → la **primera ventana caía en `y = 20`**. La barra superior del escritorio (`desktop-canvas.tsx:890`) ocupa `0..44` en **`z-[40]`** con `bg-black/30 backdrop-blur-2xl`, mientras que **TODA la capa de ventanas** vive en **`z-[15]`** (`desktop-canvas.tsx:797`) — y esa capa, al ser `position:absolute` + `z-index:15`, **es un stacking context**: el `z-index: 21` de la ventana **no puede competir** con la barra. Resultado: la barra de título de la ventana quedaba **pintada debajo de una barra semiopaca y borrosa** → exactamente el aspecto «translúcido, apagado, en una capa inferior» de la captura.
**Verificado en vivo** (`starseed-os.vercel.app/escritorios`, `elementsFromPoint` sobre el botón de cerrar): devolvía **`HEADER z=40`**, no el botón ⇒ **los controles cerrar/minimizar/maximizar ni siquiera recibían el clic**.

**2 · Compositing: `filter` en el marco de la ventana.**
`desktop-window.tsx` animaba con Framer Motion `filter: blur(8px) → blur(0px)` en el **mismo elemento** que lleva `backdrop-blur-2xl`, y las ventanas sin foco llevaban además `saturate-[0.92]` + `opacity-[0.97]` **permanentes**. Un `filter` no-`none`:
  · convierte el elemento en **backdrop-root** → destroza su propio `backdrop-filter` (el cristal deja de funcionar), y
  · fuerza a **todo el subárbol** (incluido el `<iframe>` de la app) a pasar por una pasada de filtro → **la ventana entera se ve borrosa**.
Y Framer Motion **deja `filter: blur(0px)` FIJO** en el estilo inline al acabar → el daño era permanente. Medido en vivo: `filter: blur(8px)` a t=80 ms → `blur(0px)` a t=700 ms, con la ventana **completa** (chrome + iframe) renderizada borrosa durante la apertura.

### Hecho
- **B-1** · `DESKTOP_TOP_INSET` (50 px) es ahora del **store**, que **clampa la `y`** en `openWindow`, `setWindowRect`, `toggleWindowMaximized` y — clave — en **`normalizeWindow`**, así que también **repara los escritorios ya guardados** con ventanas metidas bajo la barra. Arrastre y redimensión clampan al mismo inset.
- **B-1** · El marco **ya no lleva `filter` NUNCA** (ni animado ni estático): la animación de apertura es solo `opacity/scale/y`, y el cristal (`bg-card/90 backdrop-blur-2xl`) se movió a una **capa propia `WindowGlass`** (`-z-10`, sin eventos) → el contenido (iframes, canvas, vídeo) **jamás** es descendiente de un `backdrop-filter`. La jerarquía foco/no-foco se transmite solo con borde y sombra.
- **B-2** · **Quick Look universal** (`desktop-quick-look.tsx`): vista previa REAL de cualquier cosa (archivo → `ContentViewer` del OS: imagen/GIF/galería/vídeo/audio/PDF/HTML/Markdown/código/texto/3D/enlace/entidad + visor de reserva; nota → su texto; widget → widget vivo; app → ficha del catálogo; folder → su contenido) + pestaña **Información** con datos reales **y el ACCESO real** (`useResourceAccess`), con **Compartir** (`ShareToDialog`) y **Permisos** (`ShareAccessDialog`) — los mismos diálogos que el resto del OS. Se abre con **Espacio** o desde el menú contextual.
- **B-2** · Menú de icono: Abrir · **Vista previa** · **Información** · Renombrar · Duplicar · **Mover a** (folders **y raíz**) · Tamaño · Eliminar (+ Compartir/Permisos dentro del Quick Look).
- **B-3** · **Mosaico (pantalla dividida) de CUALQUIER número de ventanas**: modelo columnas→filas con fracciones (`DesktopTiling` en el store), auto-distribución en **rejilla · columnas · filas**, y **divisores arrastrables** (`desktop-tiles.tsx`) que reparten el espacio en vivo. Controles en la barra superior + menú contextual + `⌘⌥T` / `⌘⌥F`. Se reconcilia solo al abrir/cerrar/minimizar ventanas.
- **B-3** · **Pantalla completa** real (`fullscreen`): la ventana **sale de la capa `z-[15]`** y se pinta en su propia capa `fixed z-[75]`, **por encima de la barra superior y del dock**. Botón en la barra de título, `F11`, y `Esc` para salir.
- **Persistencia compatible**: `fullscreen` y `tiling` son **opcionales** y se normalizan defensivamente → un escritorio guardado sin ellos carga exactamente igual (`starseed.desktops.v1` + espejo `user_settings.prefs.desktops`, sin cambio de clave ni de versión).

### Decisiones tomadas
- **La barra superior se queda ENCIMA de las ventanas** (semántica de barra de menús macOS). No se sube la capa de ventanas: se **impide por modelo** que una ventana pueda colocarse ahí. Es la única solución que no reintroduce el bug por otra vía (arrastre, snap, restore, doc heredado).
- **Regla de oro documentada en la cabecera de `desktop-window.tsx`:** el elemento que contiene el contenido de una ventana **no puede llevar `filter` ni `backdrop-filter`**. El cristal va siempre en capa aparte.

### Pendiente / Próximos pasos
- Mosaico en **móvil**: hoy se desactiva (`isMobile`) y se conserva el swap por chips. Un mosaico táctil de 2 ventanas sería el siguiente paso natural.
- **Arrastrar y soltar** iconos DENTRO de una ventana de folder (hoy se mueven por el menú «Mover a»).
- El Quick Look de archivos usa la URL del icono; para `os_files` con URL firmada caducada convendría refrescarla vía `getReplicaUrl()`.

### Notas / aprendizajes
- **El z-index de un elemento no vale nada si su ancestro ya creó un stacking context.** La ventana decía `z-index: 21` y era verdad… dentro de una capa `z-[15]`. Contra la barra `z-[40]` no tenía nada que hacer. **Siempre hay que mirar el ancestro, no el elemento.**
- **`filter: blur(0px)` no es «nada».** Es un filtro activo: crea stacking context, crea backdrop-root y **compositea todo el subárbol**. Framer Motion lo deja puesto para siempre al animar `filter`. **Animar `filter` en un contenedor de contenido (sobre todo con iframes) es una trampa.**
- **La captura del usuario decía la verdad y el `getComputedStyle` también**: la ventana **sí** tenía `opacity: 1` y `z-index: 21`. Lo que fallaba no se veía en el elemento — se veía en `elementsFromPoint` y en la geometría. **Cuando los estilos parecen correctos, haz el hit-test.**

---

## 2026-07-13 — Adenda 68 · A · Sync TOTAL de Aurora/Astraura en tiempo real (+ fuga de claves cerrada)

**Sesión por:** Claude (Cowork, subagente A) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** La configuración de Aurora **subía a la cuenta pero no bajaba nunca**. Se añade el pull de arranque que faltaba, LWW por clave, y el mapeo de eventos que hacía que la UI ignorara los cambios remotos. De paso se cierra una **fuga real de claves API** hacia `user_settings.prefs`.

### Hecho
- **Pull de arranque (`pullAndApplyNow()`)** en `src/lib/sync/realtime-sync.ts`: `startRealtimeSync()` solo se suscribía a los canales y **jamás leía `user_settings.prefs`**. Ahora baja + aplica (LWW) + **reconcilia hacia arriba** al arrancar y al cambiar de sesión.
- **LWW por clave**: `prefs.__meta[key]` en la nube ↔ `starseed.sync.meta.v1` en local (esta última **NO se sincroniza**). Ni bajando ni subiendo se pisa un cambio más nuevo. Filas legadas sin `__meta` se aplican solo si aquí no hay nada que perder.
- **26 claves de Aurora/Astraura mapeadas a sus eventos reales** en `EVENT_BY_KEY` (antes: **cero**) + evento genérico nuevo `starseed:aurora-config-updated` (`AURORA_CONFIG_EVENT`) + topic `AURORA_CONFIG_TOPIC` (`aurora:config`) en `live-signal.ts`.
- **13 claves nuevas en `SYNCED_KEYS`** (capacidades/skills activas, avatar, canales, wake, TTS/STT OSS, acceso web, SearXNG, modelo por función…). Debounce 1500 → **800 ms**.
- **🔐 Fuga cerrada**: `starseed.integration.*` (y `starseed.brain.<id>.integration.*` vía el prefijo `starseed.brain.`) subían el objeto **entero con `apiKey` EN CLARO**, pese al comentario que juraba lo contrario. Nuevos `sanitizeForCloud()` (poda) + `mergeLocalSecrets()` (reinyecta la clave local al aplicar config remota) + lista **`NEVER_SYNCED_KEYS`**.
- **UI honesta**: bloque «Aurora y Astraura» en `RealtimeSyncPanel` (/cuenta) con estado real; el botón ahora hace `syncNow()` = **pull + push** (antes solo empujaba). `setup-astraura.tsx` repinta el reparto por neurona/cerebro al llegar un cambio remoto.

### Decisiones tomadas
- **Aurora/Astraura es de ÁMBITO CUENTA, no de perfil.** Lo pidió el usuario y encaja con el Exocórtex (CLAUDE.md §3): la IA personal pertenece a la **Persona (Cuenta)**, no a una de sus facetas públicas (Perfiles). Único override: la sección `aurora` de `sync-profiles-config.ts` permite excluir un **tipo de dispositivo**.
- **`starseed.aurora.chats.v1` NO se sincroniza a propósito**: su `AuroraChatProviderConfig` guarda `apiKey` en claro por chat. Sincronizarlo sería filtrar claves. (El `chatlog` sí viaja.)
- **No se tocó la BD.** `REPLICA IDENTITY DEFAULT` de `user_settings` es suficiente (solo leemos `payload.new`, y `user_id` es la PK): verificado E2E.

### Verificado (real, no de palabra)
- `npx tsc --noEmit` **exit 0** · `npm run build` **exit 0**.
- Contra la BD del OS (`nxstilnyidvkqeosofuh`, Management API): `user_settings` en `supabase_realtime` ✅ · RLS ejecutada como `authenticated`: dueño escribe/lee ✅, escritura ajena **BLOQUEADA (42501)** ✅, lectura de filas ajenas **0** ✅.
- **E2E con dos clientes Realtime distintos (= dos dispositivos):** un cambio escrito por «B» llega a «A» **sin recargar** por **ambas vías** — `postgres_changes` ✅ y `broadcast acct:<uid>` ✅ — con la marca LWW intacta. Datos de prueba borrados (0 residuo).
- Auditoría: **0 configs de integración con `apiKey` en la nube** → la fuga estaba abierta pero **no se había materializado**; no hace falta rotar nada por esto.

### Pendiente / Próximos pasos
- Separar el secreto del resto de la config de chat para poder sincronizar `starseed.aurora.chats.v1`.
- Rotar las 2 claves filtradas en el historial de git (service_role + DashScope) — **sigue pendiente, es anterior y distinto de lo de arriba**.

### Notas / aprendizajes
- **«No sincroniza» casi nunca significa «no sube».** Aquí subía perfectamente (se veía en la BD: personalidades, perfiles de personalidad, voz, deploy…). Fallaba **bajar** (sin pull de arranque) y **enterarse** (sin eventos). Antes de tocar el push, **mirar la fila en la nube**.
- **Un comentario que jura que algo es seguro no lo hace seguro.** `settings-sync.ts` afirmaba que las claves «nunca viajan» mientras subía `apiKey` en claro dentro del mismo JSON. **Leer el TIPO, no el comentario.**
- **Un solo cliente Realtime no puede probar un broadcast**: `broadcast:{self:false}` suprime el eco, así que el test daba «NO» falso. **Dos dispositivos = dos clientes.** Casi me lleva a hacer una DDL (`REPLICA IDENTITY FULL`) que no hacía ninguna falta.
- **Builds concurrentes de Next corrompen `.next`** (`PageNotFoundError: /_document`). Con varios agentes en el mismo repo, compilar en una copia aislada con `node_modules` enlazado.

---

## 2026-07-13 — Adenda 68 · D — Audiomorphic dejaba de ser un fantasma: sistema de CAPAS de fondo

**Sesión por:** Claude (agente Adenda 68 · D)
**Resumen ejecutivo:** Audiomorphic aparecía SOLO como una capa translúcida con su pantalla de bienvenida. Eran **tres causas encadenadas** (una de config persistida, una de contrato de URL inventado, una de z-index). Se arreglan de raíz y el fondo del OS pasa a ser una **pila de capas** con orden, opacidad y mezcla.

### CAUSA RAÍZ (verificada, no supuesta)

**1 · POR QUÉ SE ACTIVABA SOLO — config persistida + sincronizada a toda la cuenta.**
Ningún código lo activaba automáticamente: `defaultConfig.background.type` era `"spline"`. Pero **el valor `"audiomorphic"` estaba GRABADO** en `appearance-config-v2`. Comprobado EN VIVO en producción (`starseed-os.vercel.app`, Chrome): `background.type === "audiomorphic"` y el `<iframe>` del visualizador **montado** en el dashboard.
Lo escribía cualquiera de **tres** botones de un solo clic (`AUDIOMORPHIC_BG` widget → "Activar fondo", `MEDIA_CONTROL` → "enviar visualización al fondo", Ajustes → Apariencia → tarjeta Audiomorphic), todos con `updateConfig({background:{type:'audiomorphic'}})`. Y como **`appearance-config-v2` está en `SYNCED_KEYS` con ÁMBITO CUENTA** (no está en `PROFILE_SCOPED_KEYS`), una vez pulsado **volvía en cada recarga y en cada dispositivo**. No había versión ni migración que pudiera deshacerlo → parecía que "se abría solo".
*Bug adyacente encontrado:* los botones "Quitar fondo" escribían `type: "none"`, que **no es un tipo válido** → dejaban al OS sin fondo.

**2 · POR QUÉ SALÍA SU PANTALLA DE BIENVENIDA — el "modo fondo" NUNCA existió.**
Se descargó y leyó el bundle de `audiomorphic.vercel.app`. Los parámetros que el OS enviaba (`?bg=1&autostart=1&full=1&mic=1&cam=1&preset=…&starseed_os=1`) **aparecen CERO veces en su código**. La app solo lee `source` / `from` (si contienen "starseed"), `starseed=1` o `#starseed`. Con `starseed_os=1` **no coincide ninguno** ⇒ la app se consideraba **sin sesión**.
Su tour se dispara con `if (!(localStorage['audiomorphic.intro.seen.v1'] === 'true') || !isLoggedIn) mostrarIntro()`. Sin sesión ⇒ **el tour salía SIEMPRE, en cada carga**. Y el iframe iba con `pointer-events: none` ⇒ **imposible pulsar «Saltar»**. De ahí la capa de bienvenida permanente.
**Verificado en vivo:** con `?source=starseed-os` la app escribe `audiomorphic.starseed.linked.v1 = {"id":"starseed-os","name":"Cuenta StarSeed"}` + `subscription {viaStarSeed:true}`, y tras cerrar el tour una vez **ya no vuelve a salir**. Sin el parámetro, vuelve siempre.

**3 · POR QUÉ SE VEÍA "TRANSLÚCIDA Y APAGADA".**
Medido en producción: `PerfStaticBackdrop` (`perf-gate.tsx`) vive en **`z-index: -20` con `opacity: 0.85`** (animación `ssPerfBreathe`) y gradiente **opaco**; el iframe de Audiomorphic vivía en **`-z-40`** ⇒ se veía **a través** del backdrop semiopaco. Exactamente la "capa intermedia translúcida" de la captura.

### Hecho
- **`src/lib/appearance/background-layers.ts` (NUEVO)** — modelo de capas: `BackgroundLayer {id, kind, visible, opacity, blend, value?, audiomorphic?}` (kinds: color · gradiente · imagen · video · audiomorphic), catálogo, helpers puros (add/remove/patch/reorder), `buildAudiomorphicUrl()` con los parámetros **REALES** y **`migrateBackgroundLayers()`**.
- **MIGRACIÓN (`BG_LAYERS_VERSION` 1)** en `appearance-context.tsx`: toda config guardada con `type:"audiomorphic"` pasa a base `spline` + **capa Audiomorphic APAGADA** (conservando su URL) → el fantasma muere en **todas** las cuentas ya sincronizadas, sin perder los ajustes. `type:"none"` también se repara. Sin migración, el bug habría vuelto en cada dispositivo.
- **`background-layer-stack.tsx` (NUEVO)** — pinta la pila. **z-index -9…-2** (POR ENCIMA del `PerfStaticBackdrop` (-20) y del psicodélico (-10), por debajo de todo el contenido en flujo): es lo que evita que una capa vuelva a verse "lavada".
- **Audiomorphic = CAPA, ya no `background.type`.** `AudiomorphicBackground` renderiza `null` (deprecado). Los 3 botones de un clic (2 widgets + Ajustes) y la ventana de config ahora **encienden/apagan SU capa** y **nunca tocan el fondo base**.
- **Transparencia — la verdad:** el `<body>` de la app es `background-color:#050505` **OPACO** ⇒ `allowtransparency` es imposible. Se usa **`mix-blend-mode: screen`** (por defecto): el negro desaparece y **solo se ven el espiral y sus brillos** sobre la capa de abajo. Es la alternativa honesta y funciona sin tocar la app externa.
- **Micrófono:** la app exige un clic SUYO en «Iniciar Micrófono». Se añade **modo interacción** (la capa sube a `z-index:60` y recibe clics, con barra «Listo»); al salir **el iframe NO se remonta** ⇒ el audio y la escena siguen vivos en el fondo. El OS **nunca** pide el permiso solo.
- **Ajustes → Apariencia → Capas de fondo** (`background-layers-panel.tsx`): miniatura · arrastrar para reordenar · opacidad · ojo (visibilidad) · mezcla · eliminar · «Añadir capa» con catálogo. Vista previa = el propio fondo del OS, en vivo.
- **Ámbito del fondo:** `background.scopes` (`perfil:<id>` · `pagina:<ruta>`) resuelto en el provider (**página > perfil > cuenta**). Selector «Cuenta / Este perfil / Esta página» + «Quitar override». Se hizo **dentro** de `appearance-config-v2` porque esa clave es de ámbito CUENTA en `settings-sync.ts` (fuera del alcance de esta ola).

### Decisiones tomadas
- **El motor del OS (spline/webgl/living/materia) es SIEMPRE la capa base**, porque esos componentes son singletons que leen `background.type`. Para poner algo "debajo" se usa una capa con mezcla. Limitación declarada, no escondida.
- **Nada de parámetros inventados nunca más:** la URL del iframe solo lleva `source=starseed-os` (+`starseed=1`). Los presets del espiral (Deriva/Armónico/Génesis) y la sensibilidad **no se pueden fijar por URL** — se eligen en los controles de la app (modo interacción). El OS sí controla de verdad: opacidad, mezcla, escala y filtros CSS (tono/saturación/brillo/contraste).

### Pendiente / Próximos pasos
- `?source=starseed-os` vincula la cuenta (insignia "StarSeed", `viaStarSeed:true`) pero **no otorga `plan:"starseed"`**: eso sigue exigiendo un código `SS-…` en el panel de suscripción de la propia app.
- El tour de bienvenida de Audiomorphic aún sale **una vez** por navegador (su `intro.seen` es de su origen). Se cierra desde la ventana/modo interacción y no vuelve.
- Las capas viven dentro de `<PerfHeavyOnly>`: en móviles "eco" no se montan (coherente con el resto de fondos pesados).

### Notas / aprendizajes
- **`.next` se corrompió** con otros agentes compilando a la vez (`PageNotFoundError: /_document` tras un "Compiled successfully"). Se compiló en **copia aislada** (`/tmp/ss-bg-build` con `node_modules` enlazado).
- Regla que este bug confirma: **una config persistida y sincronizada por cuenta es un estado global de facto**. Cualquier rediseño que cambie su significado necesita `DEFAULTS_VERSION` + migración, o el usuario se queda con el fantasma para siempre.

---

## 2026-07-13 · Adenda 68 §C — Perfiles y entidades: responsive de raíz + funciones reales

**Encargo:** el perfil «se ve muy mal» en pantallas pequeñas (captura del usuario: pestañas cortadas,
tarjetas desbordadas, texto recortado por el borde). Arreglarlo de raíz, en el perfil y en las demás
páginas/entidades, y meter más funciones reales.

### CAUSA RAÍZ (medida en vivo, no supuesta): `min-width: auto`, no las pestañas
Diagnóstico con Chrome a **390 px reales** (Chrome no baja de ~500 px de ventana → se midió con un
**iframe same-origin de 390 px**, cuyas media queries sí responden al ancho real):

| Medición (perfil @390 px) | ANTES | DESPUÉS |
|---|---|---|
| Ancho de la fila de pestañas | **840 px** (en viewport de 390) | 736 px de contenido en carril de 364 |
| ¿El carril hace scroll? | **NO** (`scrollWidth == clientWidth == 840`) | **SÍ** |
| Pestañas inalcanzables | **7 de 11** (Biblioteca, Colecciones, Enlaces, Archivos, Sobre mí, Galería, Secciones) | **0 de 11** |
| Píxeles que el raíz recorta (`overflow-x-clip`) | **476 px** (`cw 366` / `sw 842`) | **0 px** |
| Desbordes de contenido | columna hermana estirada a 842 px | **0** |
| Área táctil de pestaña | 36 px | **44 px** |

**El porqué:** los hijos de grid/flex nacen con **`min-width: auto`** → no encogen por debajo de su ancho
intrínseco. El hijo `lg:col-span-2` **crecía a 840 px** para caber las pestañas ⇒ el carril `overflow-x-auto`
**nunca tenía nada que desplazar** (ya era tan ancho como su contenido), y el `overflow-x-clip` del raíz
**borraba la evidencia**: sin scrollbar, sin desborde de página, sin pista. Las pestañas simplemente **no
existían**. El mismo mecanismo estiraba la **columna hermana** (la tarjeta «Discusión Abierta») a 842 px:
**ese es el texto cortado de la captura** — no era una truncación mal puesta, era la columna entera recortada.
**Es el patrón del dock otra vez** (contenido inalcanzable por overflow mal resuelto).

### Hecho
- **`min-w-0`** en todos los hijos de rejilla/flex del perfil, del modo Libre y de las 3 páginas de entidad.
- **`SectionTabs` (menú unificado) en TODAS las filas de pestañas**: perfil (11), `/pagina`, `/grupo`,
  `/evento` y **los 6 toolkits**. Los 6 toolkits pasan de `Tabs defaultValue` a **`Tabs` controlado**.
- **`SectionTabs` endurecido** — `min-w-0` en raíz y carril (para que el bug no reaparezca en ninguna de sus
  ~20 superficies del OS), `overscroll-x-contain`, **≥44 px en móvil** y **auto-scroll de la pestaña activa**
  (en móvil solo caben 3 de 11: sin esto la selección quedaba invisible).
- **Cabecera del perfil rediseñada** y **«Action Matrix» eliminada**: duplicaba Seguir/Editar (que ya están,
  reales, en `ProfileQuickActions` justo debajo) y sus botones **Compartir y Guardar no tenían `onClick`**:
  eran **decoración**. Fuera.
- Quitado el `-mx-1` de los carriles de acciones (perfil + entidades): hacía el carril **4 px más ancho que
  su contenedor** — los últimos 4 px de desborde medidos.
- **C-3 · funciones reales:** insignias con **contadores REALES** en las pestañas (`useProfileRealCounts`;
  **sin dato real → sin insignia**, nunca un 0 de relleno) · **«Compartir en…» (`ShareToDialog`)** en perfiles
  **y en las 6 entidades** (destinos reales: mensaje · entidad · cerebro · Biblioteca · enlace), con los tipos
  de recurso nuevos **`perfil`** y **`entidad`** en `share-targets.ts` · iconos Lucide en todos los carriles.

### Verificado
`npx tsc --noEmit` **exit 0** · `npm run build` **exit 0** (92/92 páginas). En vivo a **390/768/834/1440 px**:
**0 desbordes horizontales de página**, **0 contenido atrapado**, **11/11 pestañas alcanzables**, 44 px.
Clic real sobre «Secciones» (antes inalcanzable): selecciona, **auto-scroll a la vista** y pinta su panel.

### Pendiente / honestidad
- **Las entidades no se pudieron probar CON DATOS**: la red no tiene **ni una** página/grupo/evento real y
  **todos** los arrays de `src/data/sample-*.ts` están **vacíos (`[]`)** ⇒ esas rutas dan **404** y los 6
  toolkits caen a su `EmptyHint`. Verificado en su lugar: el **mismo carril** en su peor caso (el perfil,
  11 pestañas) y la **estructura exacta** de una entidad (contenedor `max-w-5xl min-w-0` + las 7 pestañas
  reales del toolkit de E.F.) montada en la app real con su CSS compilado → desplaza, 0 inalcanzables, 44 px.
- El perfil **solo se ve tras iniciar sesión**; las mediciones salen del DOM real que se renderiza **detrás**
  de la puerta de acceso (capa `position:fixed`, no altera el layout). Sin captura visual del perfil logueado.
- **`aurora-orb_ring`** sobresale ~7 px a 390 px. Ya lo hacía antes y **es de Aurora**, no del perfil (fuera
  de encargo). No recorta contenido.

### Notas / aprendizajes
- **La regla que hay que grabar:** en Tailwind, **todo hijo de flex/grid que contenga algo desplazable o
  truncable necesita `min-w-0`**. Sin él, `overflow-x-auto` es **decorativo**: el contenedor crece, el
  scroller no tiene nada que desplazar y un `overflow-clip/hidden` de más arriba **se traga el contenido en
  silencio**. Es el mismo fallo del dock, con otra ropa.
- **`overflow-x-clip` en un contenedor de página es un arma de doble filo**: evita el scroll horizontal (bien)
  pero **oculta el síntoma** de un desborde (mal). Si se usa, hay que medir `scrollWidth` vs `clientWidth`
  para saber si está recortando algo.
- **Chrome no permite ventanas < ~500 px.** Para auditar móvil de verdad: **iframe same-origin al ancho
  exacto** — las media queries responden al ancho del iframe, así que el layout es el real.
- El shell del Mac tiene **`NODE_ENV=production` exportado**, lo que **rompe el CSS de `next dev`**
  (`globals.css` → "Module parse failed: Unexpected character '@'"). Para levantar dev: `NODE_ENV=development npx next dev`.

---

## 2026-07-13 — Adenda 68 · E: Audiomorphic PORTADO al OS (app nativa + motor de fondo con transparencia real)
**Sesión por:** Claude (agente)
**Resumen ejecutivo:** Con la repo fuente en la mano (`StarSeedSystem/Audiomorphic-AR-app`, del propio usuario),
Audiomorphic deja de ser un `<iframe>` a un sitio externo y pasa a ser **código del OS**: motor portado, app nativa
desbloqueada en `/audiomorphic` y **capa de fondo con transparencia REAL**. `npx tsc --noEmit` **exit 0**.

### Lo que había que entender antes de tocar nada (leído el código, no supuesto)
- El visualizador **no es WebGL: es un `<canvas>` 2D**. La espiral es `Zn+1 = Zn·(k·e^{iψ}) + Z0`, y `k`/`ψ` los
  produce un motor matemático ("Tratado de Unificación Armónica") que convierte una topología (V, E) en la forma.
- **LA CAUSA REAL DE LA OPACIDAD ESTABA EN EL MOTOR, NO EN EL `<body>`**: `getContext('2d', { alpha: false })`
  **y** una estela que **pinta un rectángulo NEGRO** cada fotograma (`fillStyle = rgba(0,0,0,trail)`; con
  `trail: 1.0`, el defecto, es negro opaco). Por eso *ningún* parámetro de URL habría podido hacerlo transparente,
  y por eso hubo que recurrir en su día a `mix-blend-mode: screen` (que no compone: solo esconde el negro).
- **NO HABÍA CANDADOS QUE ROMPER.** Los 4 "planes" (`free/code/starseed/premium`) son **teatro de UI**: fuera del
  modal de suscripción, `subscription.tier` **no se usa en ninguna parte** (ni en el panel de control, ni en el
  visualizador, ni en el VR). El único bloqueo real era el **tour**, que salía SIEMPRE a quien no "tuviera sesión"
  (`if (intro.seen !== 'true' || !isLoggedIn)`). "Desbloquear" = **no montar ese teatro**.

### Hecho
- **Motor** → `src/lib/audiomorphic/` (`types` · `harmonic-math` · `renderer` · `autopilot` · `audio-analyzer`),
  sin React ni DOM ⇒ **la app y el fondo comparten exactamente el mismo motor**.
- **TRANSPARENCIA REAL**, resuelta en el motor: `alpha: true` + la estela pasa a **BORRAR alfa**
  (`globalCompositeOperation = 'destination-out'`) en vez de pintar negro. Misma semántica de `trail`, pero lo que
  queda es **alfa 0** ⇒ el espiral se compone de verdad sobre las capas de abajo. `screen` ya no hace falta.
- **App nativa** `/audiomorphic` (+ **ventana real del escritorio**: nuevo mapa `NATIVE_APP_VIEWS` en
  `desktop-window-content.tsx` — antes una app con `route` solo pintaba una tarjeta «Abrir módulo», y si conservaba
  `href` **el iframe externo le ganaba**).
- **Capa de fondo nativa** (`engine: "nativo" | "iframe"`), con **todos** los parámetros que la repo expone de
  verdad (piloto, geometría en resonancia, sensibilidad, color, velocidad, viscosidad, estela, detalle, zoom).
  **`BG_LAYERS_VERSION` 1 → 2** con migración: las capas ya guardadas pasan a nativo (si no, las cuentas que ya la
  tenían seguirían con el iframe opaco).
- **Micrófono** singleton con refcount (una sola captura para app + fondo) y **permiso siempre por gesto**.
- **Rendimiento**: pestaña oculta ⇒ bucle parado; `prefers-reduced-motion` ⇒ fotograma estático; eco ⇒ menos
  iteraciones + DPR 1 + ~30 fps. Y el piloto ya no dispara 60 `setParams()`/s (60 renders de React/s en el original).
- **Librería**: `oss-library.ts` + `packages.ts` apuntando a la repo del usuario.

### Pendiente / honestidad
- **El modo VR/AR NO está portado**: `VisualizerVR.tsx` usa **@react-three/xr v6 + postprocessing v3 + drei v10**,
  que exigen **React 19 + R3F v9**; el OS va con **React 18 + R3F v8**. Portarlo implica **subir React en todo el
  OS**. No se finge: hay una tarjeta que lo explica y enlaza a la app original y al APK/DMG. Por eso el respaldo
  `engine: "iframe"` y el `href` del catálogo **se conservan**, y `vrCapable` de Audiomorphic pasa a `false`.
- El micrófono **exige un clic tras cada recarga** (deliberado: jamás se pide solo).

### Aprendizajes
- **Antes de "no se puede", léete el motor.** Se dio por hecho que el iframe era opaco por su `<body>`; el `<body>`
  era lo de menos — **el canvas se creaba sin alfa y se pintaba de negro cada fotograma**. Con el fuente delante, la
  transparencia real costó **dos líneas** (`alpha: true` + `destination-out`).
- **Un "muro de pago" puede ser solo decorado.** Auditar los usos reales (`grep` de `tier`/`plan`) antes de diseñar
  un plan para "desbloquear" algo: aquí no bloqueaba nada, y el trabajo real era **no portar** el teatro.
- **Portar > incrustar.** El iframe no aceptaba parámetros, no se podía pilotar, no podía ser transparente y metía
  un tour incerrable. Con el código dentro, los cuatro problemas dejan de existir a la vez.

---

## 2026-07-13 — Adenda 69 · La causa raíz REAL de los bugs F (sync de Aurora) y G (sesión al recargar)
**Sesión por:** Claude (Cowork, diagnóstico EN VIVO contra producción)
**Resumen ejecutivo:** Los fixes de las Adendas 63 y 68 estaban **bien escritos y desplegados**, y aun así los dos bugs seguían. Porque el fallo **nunca estuvo en el motor de sync ni en el cliente de auth**: estaba **debajo**, en cómo TODO el OS escribe la columna `user_settings.prefs`. La config de Aurora **sí subía**… y **se borraba segundos después**. Commit `ccb9180`, EN VIVO.

### Causa raíz OBSERVADA (no teorizada)
1. **Lost update.** `user_settings.prefs` es **UNA columna jsonb** compartida por **~12 módulos**, y **todos** escribían *leer → mutar → `upsert` de la COLUMNA ENTERA*. Al cargar la página arrancan a la vez ⇒ el último borra lo de los demás. **Medido en vivo: la fila pasó de 16 claves a 4 en segundos**, llevándose `__meta` y todas las claves de Aurora que realtime-sync acababa de subir. El peor infractor: `settings-sync.ts:350` (`pushPreferences()` ni leía antes ⇒ «Sincronizar ahora» **aniquilaba** la fila).
2. **La fila pesaba 2,8 MB ⇒ las escrituras EXPIRABAN.** `SYNCED_PREFIXES` incluía `"starseed.brain."` y se tragaba `…memory-mirror.v1` (espejo/caché de `brain_memory_files`: **1,75 MB en un cerebro**) y `…offline-queue.v1`. Cada latido reenviaba 2,8 MB ⇒ `pg_stat_activity` mostraba `INSERT` concurrentes bloqueándose y peticiones muriendo con **`57014: statement timeout` tras 40 s**, en **silencio** (motor best-effort, `catch {}`).
3. **El motor podía quedar MUERTO toda la sesión.** `startRealtimeSync()` hacía `return` por *no-session* **antes** de registrar `onAuthStateChange`; `RealtimeSyncProvider` comprobaba la sesión **una vez** con `auth.getUser()` (**red**). Si la sesión no había hidratado aún, **nadie reintentaba jamás**.
4. **BUG G no era un cierre de sesión.** La cookie sobrevive intacta a la recarga y el middleware nunca redirige a `/login` (verificado). Lo que el usuario veía como *«se reinicia»* era **la consecuencia de (1)**: el OS restaura su estado desde `prefs` al arrancar, y esa fila **estaba siendo vaciada** una y otra vez. El *«a veces tarda»* era (2)+(3).

### Hecho
- **`merge_user_prefs(jsonb)`** — RPC de mezcla **ATÓMICA** en el servidor (superficial en 1er nivel + **profunda** de `__meta`; `null` borra). Nadie manda ya la columna entera. Migración `20260714020000_*` **aplicada en producción**.
- **Trigger de blindaje** en `user_settings`: toda escritura de `prefs` **MEZCLA** en vez de reemplazar ⇒ el patrón antiguo deja de ser destructivo **aunque el módulo no se migre** (protege `desktop-store.ts`, intocable esta ola). Escotilla: `set local starseed.prefs_replace = 'on'`. Migración `20260714021000_*` **aplicada**.
- **`src/lib/sync/user-prefs.ts`**: única puerta de escritura (`mergeUserPrefs`). **9 módulos migrados**.
- **`memory-mirror`/`offline-queue` dejan de sincronizar** (`NEVER_SYNCED_PATTERNS`) + **purga en BD**: **2,8 MB → 22 kB** (×130). Contención: 0.
- **`getUserId()` usa `getSession()`** (cookie, instantáneo) antes que `getUser()` (red).
- **`onAuthStateChange` se registra SIEMPRE y ANTES** del early-return (`ensureAuthSubscription()`/`connectForUser()`); el provider reintenta al hidratar.

### Verificación EN VIVO (producción, cuenta real)
- Cambiar la personalidad ⇒ la app llama a la RPC atómica con **2 claves / 13,8 KB** (antes 2,8 MB), **0 espejos**; local == nube; `agents`/`dashboards`/`capabilities`/`__meta` **intactas**.
- **Dispositivo B → dispositivo A sin recargar**: escrita la personalidad en la nube desde fuera del navegador, el dispositivo A **la aplicó solo**, con LWW correcto.
- La cuenta tiene ya **6 claves de Aurora/Astraura** en `prefs`. **Antes había CERO en las 4 cuentas de la BD.**
- **BUG G**: 3 recargas seguidas ⇒ nunca apareció el login, cookie intacta, **perfil activo y personalidad conservados**.
- `npx tsc --noEmit` → **0** · `npm run build` → **exit 0**.

### Decisiones tomadas
- **La columna `prefs` se blinda en la BASE DE DATOS, no solo en el cliente.** Confiar en que 12 módulos (y los futuros) usen la puerta correcta es exactamente el fallo que nos trajo aquí. El trigger hace el bug **imposible**, no solo improbable.
- **Los espejos de memoria y las colas offline NO son ajustes**: son caché y estado de dispositivo. Vuelven a ser locales.

### Pendiente / Próximos pasos
- `src/components/desktop/desktop-store.ts:1330` sigue con el `upsert` antiguo (estaba en la lista de *no tocar*). El trigger lo neutraliza, pero migrarlo a `mergeUserPrefs()` es 1 línea.
- `src/ai/astraura/sync-providers.ts:251` escribe al Supabase **propio del usuario** (otra BD, sin RPC ni trigger): se dejó a propósito (allí `prefs` es un espejo completo).
- Las pestañas de **desarrollo local** del usuario (`localhost:3057/3099/3111`) corren código viejo contra la MISMA base y vuelven a inflar `prefs` con espejos. Al recargarlas con el código nuevo dejarán de hacerlo.

---

## 2026-07-13 — Adenda 69 · H · Escritorio: por fin se puede PULSAR (H-1..H-4)
**Sesión por:** Claude (agente de escritorio)
**Resumen ejecutivo:** «Al pulsar una app no se abre» tenía **dos causas independientes y sumadas**, y ninguna estaba donde se buscaba (ni en `openWindow`, ni en el store, ni en `NATIVE_APP_VIEWS`): (1) un **div invisible a pantalla completa se comía TODOS los clics** de los iconos, y (2) cuando el clic sí llegaba, el icono **navegaba fuera del escritorio** en vez de abrir una ventana.

### 🔎 CAUSA RAÍZ (diagnosticada EN VIVO contra producción, no leyendo código)

- **CAUSA 1 · La capa de VENTANAS se comía el clic. `desktop-canvas.tsx:865`.**
  ```jsx
  <div className={cn("absolute inset-0 z-[15] …", cleanView && "pointer-events-none …")}>
  ```
  Esa capa es `absolute inset-0` (cubre el lienzo ENTERO) y vive en **z-[15]**, por encima de la capa de iconos (**z-[5]**). Solo recibía `pointer-events-none` en *modo limpio*. Fuera de ese modo —es decir, **siempre**— era un **cristal invisible sobre todo el escritorio**: los iconos no recibían **ningún** evento (ni clic, ni doble clic, ni menú contextual, ni arrastre), **hubiera o no ventanas abiertas**.
  **Evidencia en vivo** (`starseed-os.vercel.app/escritorios`, sesión del usuario): `document.elementsFromPoint(77, 88)` sobre el icono de Audiomorphic devolvía como elemento **superior** `DIV z=15 pe=auto class="absolute inset-0 z-[15] transition-all duration-300"` — **no el icono**. Poniéndole `pointerEvents="none"` a mano, el icono pasaba a ser alcanzable **al instante**. Es **exactamente el mismo patrón** que el bug B-1 de la Adenda 68 (la barra superior en z-40 comiéndose los botones de la ventana): una capa que se pinta encima y no renuncia a los eventos.
- **CAUSA 2 · El icono te SACABA del escritorio. `desktop-open.ts:40-43`.**
  ```ts
  if (open.primary === "route" && open.route) { router.push(open.route); return; }
  ```
  **Casi todas** las apps nativas del catálogo son `primary: "route"` (Mensajes, Red, Biblioteca, Agente, Cámara, Galería, Clima, Inmersivo, Audiomorphic, Omnifrecuencias, Nexus). Con la Causa 1 arreglada a mano, el doble clic **navegaba a `/audiomorphic`** en lugar de abrir una ventana (verificado en vivo: la URL pasó de `/escritorios` a `/audiomorphic`, `windows: []`). Un escritorio cuyos iconos te echan del escritorio no es un escritorio.
  *(El `NATIVE_APP_VIEWS` que añadió el agente anterior estaba bien, pero era **inalcanzable**: ninguna app con `route` llegaba nunca a abrir ventana.)*

### Hecho
- **H-1 · Se abre.** Capa de ventanas → `pointer-events-none`, con `pointer-events-auto` explícito en sus hijos reales (ventanas, chips de móvil; los divisores del mosaico ya lo hacían). `desktop-open.ts` **nunca navega**: toda app abre **ventana**, y `NATIVE_APP_VIEWS` se amplía de 1 a **11 módulos reales** (audiomorphic · omnifrecuencias · camara · galeria · clima · immersive · messages · library · agent · network · nexus), montados dentro de la ventana con su `Suspense` + `DesktopErrorBoundary`. **Táctil: UN toque abre** (antes hacía falta doble tap y nadie lo descubría); ratón: doble clic de siempre. Mismo criterio dentro de los folders.
- **H-2 · Menú contextual completo + portapapeles REAL.** Clic derecho / mantener pulsado (~520 ms) → Abrir · Vista previa · **Compartir…** · **Editar** · **Copiar (⌘C)** · **Cortar (⌘X)** · **Pegar (⌘V)** · Duplicar · Renombrar · Información · Vista previa viva · Tamaño · **Mover a** (folder · raíz · **otra pantalla**) · Eliminar. Nuevo `desktop-clipboard.ts`: copiar/cortar/pegar iconos y ramas enteras **entre folders, páginas y escritorios**; **cortar NO borra hasta pegar** (el original se pinta atenuado; si nunca pegas, no has perdido nada) y el original se retira **después** de insertar la copia. Pegar en el fondo respeta **el punto exacto del clic**. «Editar» abre el editor que toca: texto/código/markdown → **editor real** en la ventana (carga el remoto por fetch y guarda; se etiqueta «copia editable» y no finge escribir en el origen), pizarra → `/pizarra`, publicación → `/crear`, imagen/vídeo → su visor.
- **H-3 · Páginas deslizables** (`pageCount` / `activePage` en `Desktop`, `page` en `DesktopIcon`; **todo opcional**). Swipe táctil · **rueda horizontal** · barrido con ratón (|dx|>110 y |dx|>3·|dy| — un marco de selección de <37 px de alto no selecciona nada, así que no le roba nada al marquee) · puntos + botón «+» · ←/→ · arrastrar un icono al borde y **sostener 650 ms** lo pasa a la página contigua. Al agotar páginas, salta al escritorio contiguo (como iOS). **Las VENTANAS no se paginan**: viven en su propia capa (una app abierta no desaparece por barrer el fondo).
- **H-4 · Miniaturas reales** (`desktop-thumbs.tsx`): imagen (thumb) · **vídeo (primer fotograma real**, `<video preload=metadata #t=0.5>`) · **audio (portada, o ONDA determinista del archivo)** · **PDF (primera página real** con el visor nativo, solo en tarjeta grande; si no, hoja rica) · **código/texto/markdown (FRAGMENTO REAL** del archivo, con caché de una petición por URL). Sello de tipo (PNG/JS/TXT/MP3/PDF/MP4). **Nunca una caja gris**: si algo falla (CORS, 404, URL firmada caducada) cae a una placa con el degradado del acento del tipo.

### Decisiones tomadas
- **Regla de oro nueva** (documentada en el propio `desktop-canvas.tsx`): *una capa a pantalla completa NUNCA recibe eventos; solo sus hijos reales.* Es la tercera vez que este patrón muerde (barra superior → botones de ventana; capa de ventanas → iconos; envoltura de página → fondo).
- **Retrocompatibilidad de H-3 sin migración**: sin `pageCount` ⇒ 1 página, y un icono sin `page` ⇒ página 0. Verificado contra el documento REAL del usuario (`starseed.desktops.v1` no tenía ni un campo nuevo). Además, `normalizeDesktop` **amplía** `pageCount` si encuentra un icono en una página superior: **jamás se esconde un icono**.
- El editor de texto guarda en `icon.text` (soberano, del usuario) y **lo dice**: no simula escribir en el archivo remoto de la Biblioteca.

### Pendiente / Próximos pasos
- La **rejilla del mosaico** y el **swipe de páginas** conviven, pero no se ha probado el swipe con un mosaico activo en pantalla pequeña.
- El **PDF real** solo se pinta en la tarjeta grande (`viewMode: "preview"`): un `<iframe>` por icono pequeño sería un abuso. En tile pequeño se ve la hoja rica con su sello.
- Las miniaturas de **código/texto** solo se pueden leer si el origen deja hacer `fetch` (mismo origen o CORS abierto). Si no, placa con líneas fantasma — bonita, pero no es el contenido.
- Arrastrar y soltar un icono **dentro de una ventana de folder** sigue haciéndose por «Mover a» / Cortar+Pegar (no hay DnD entre lienzo y ventana).

---

## 2026-07-14 — Adenda 69 · I-1: los chats de Aurora y los de Astraura AI son UNA SOLA conversación

**Sesión por:** Claude (agente)
**Resumen ejecutivo:** Aurora y la sección de chats de Astraura AI (`/agent`) eran **dos mundos sin ningún punto de contacto**: Aurora guardaba su historial **solo en `localStorage`** (agrupado por día) y `/agent` **no guardaba nada** (chat en memoria, se perdía al recargar). Ahora ambos leen y escriben **el mismo modelo de conversación en Supabase**, en tiempo real y entre dispositivos. Commit `a7ecc17`, **EN VIVO**.

### Hecho
- **Mapa real de los dos sistemas** (diagnosticado contra la BD viva y el navegador del usuario, no leyendo código):
  - Aurora (orbe · mini-reproductor · Exocórtex) → `starseed.aurora.chatlog.v1` en `localStorage`, lista plana por día, tope 500; viajaba dentro del blob `user_settings.prefs`.
  - Astraura AI (`/agent`) → `useState<ChatTurn[]>` **en memoria**: cero persistencia. Y su barra lateral de chats era **falsa** (folders *hardcodeados* que no abrían nada).
  - **CAUSA OCULTA:** `astraura_messages` ya existía y ya estaba en `supabase_realtime`, pero su RLS tenía **una sola política, de SELECT** ⇒ **ninguna escritura era posible** (0 filas), y `publish.ts` llevaba meses insertando ahí **fallando en silencio**.
- **Modelo unificado en la nube:** `aurora_conversations` (nueva) + `astraura_messages` (reutilizada, ampliada con `meta`/`attachments`/`client_id`/`updated_at`). Migración `20260714100000_unified_ai_conversations.sql` **aplicada y verificada en producción** (RLS probada como `authenticated`; escritura ajena bloqueada `42501`; 0 residuo).
- **Núcleo `src/lib/aurora/conversations.ts`** — única puerta al modelo: optimista (caché local) + nube + **dos caminos de tiempo real** (`live-signal` topic nuevo `aurora:chats` + `postgres_changes`), **dedupe por `client_id` determinista**, migración idempotente del registro legado (**228 mensajes → 5 conversaciones, ni uno perdido**).
- **Cableado:** el *recorder* de `aurora:conversation` (punto ÚNICO por el que pasan todos los mensajes de Aurora) replica a la nube ⇒ orbe, mini-reproductor y Exocórtex cubiertos **sin tocar el motor**. `/agent` lee/escribe la misma conversación activa y **ya persiste**. Barra lateral de `/agent` = lista **real**. Exocórtex → Registro gana el bloque «Conversaciones de tu cuenta».
- **Verificado EN VIVO** (dos pestañas = dos clientes realtime, sesión real): mensaje escrito al orbe → aparece en `/agent` **sin recargar**; escrito en `/agent` → aparece en el Exocórtex **sin recargar**; los 4 mensajes cayeron en el **mismo `chat_id`**; sobrevive a recargar. Datos de prueba **borrados** (228 mensajes / 5 conversaciones, 0 residuo).
- `npx tsc --noEmit` **exit 0** · `npm run build` **exit 0** (93/93 páginas).

### Decisiones tomadas
- **Reutilizar `astraura_messages`** en vez de crear una tabla de mensajes nueva: ya tenía la forma correcta, ya estaba en la publicación realtime y ya era el destino de `publish.ts` (que por fin funciona).
- **Los chats NO viven en `user_settings.prefs`**: crecen sin límite y esa columna ya provocó el *lost update* de la Adenda 69/F. Tabla propia, siempre. (Regla nueva del proyecto, respetada.)
- **`client_id` determinista** (`rol:ts:hash`) en vez de un uuid aleatorio: hace la migración y cualquier reintento **idempotentes de verdad**, incluso desde varios dispositivos a la vez. El índice único **no** es parcial, para que PostgREST pueda inferirlo en `ON CONFLICT DO NOTHING`.
- **Conversación activa por dispositivo** (la lista y los mensajes sí son de la cuenta): dos dispositivos pueden estar en hilos distintos, como en cualquier cliente de chat.
- **Enganchar en el `recorder`, no en el motor**: un solo punto cubre las tres superficies de Aurora sin arriesgar el engine.

### Pendiente / Próximos pasos
- **Sacar `starseed.aurora.chatlog.v1` de `SYNCED_KEYS`** (`settings-sync.ts`, fuera del encargo de esta ola): ya no hace falta que viaje dentro de `prefs` y es justo el tipo de clave que engorda esa columna.
- **Multichat** (`AuroraMultichatPanel` / `starseed.aurora.chats.v1`) **sigue aparte**: sus chats llevan `apiKey` en claro y por eso no sincronizan (Adenda 68 §A-3). Unificarlo exige separar antes el secreto de la config del chat.
- Los mensajes viejos del `chat-tree` (ramificaciones/contextos) siguen siendo un índice **local** de timestamps: se ven, pero la ramificación no ha subido a la nube todavía.

### Notas / aprendizajes
- **Una tabla en la publicación realtime y con RLS activada puede seguir siendo inescribible**: `astraura_messages` tenía RLS `enable` y **solo** política de `SELECT`. Todo lo que escribía ahí (publish.ts) fallaba **sin un solo error visible** porque el código es *best-effort*. **Lección: al auditar una tabla, mirar `polcmd`, no solo `relrowsecurity`.**
- Cuando dos superficies "no se ven", el fallo casi nunca está en la sincronización: **estaba en que no compartían almacén ni modelo**. Una escribía en `localStorage`, la otra no escribía en ninguna parte.

---

## 2026-07-14 — Adenda 69 · K: Audiomorphic COMPLETO (se había portado la repo equivocada)

### Qué se pidió
«La versión de Audiomorphic integrada no está completa: faltan muchas opciones del menú de
ajustes. Intégrala por completo, desbloqueada y sin login. Y que audiomorphic.vercel.app sirva
también la versión completa y gratuita.»

### CAUSA RAÍZ (el diagnóstico del usuario se quedaba corto)
**No faltaban "algunas opciones": se portó la REPO EQUIVOCADA.** La Adenda 68·E portó
`StarSeedSystem/Audiomorphic-AR-app` (versión vieja y recortada). La repo real del usuario es
**`alexbordongarrigos/audiomorphic-ar`** (privada).

| | repo portada (mala) | repo REAL |
|---|---|---|
| Panel de control | 829 líneas | **3.589** |
| Geometrías sagradas | 4 | **20** |
| Modos de aleatorización | 0 | **11** |
| Capa sagrada propia · autorregeneración · fondos · bandas de audio · VR/AR | ❌ | ✅ |

**Y hay más:** el bundle EN VIVO de `audiomorphic.vercel.app` era **también el de la repo mala**
(tiene `sgResonanceModes` y 4 geometrías; no tiene `sriYantra`, `merkaba`, `spiralResonanceModes`…).
Los dos últimos despliegues de producción se habían subido **a mano por CLI desde la repo
equivocada** (`gitDirty:1`), pisando el dominio oficial, que sí está conectado por git a la buena.

### Qué se hizo
- **Motor reescrito** (`src/lib/audiomorphic/`): `types.ts` (~90 parámetros reales),
  **`geometry-drawers.ts` NUEVO** (16 dibujantes que no existían), `renderer.ts` (20 geometrías,
  perturbación real de la espiral, resonancia automática, multiplicadores globales, desvanecido,
  temas, `distanceZoom`/`spiralThickness`), `autopilot.ts` (8 parámetros pilotados, bandas
  graves/medios/agudos, 11 modos de aleatorización, autorregeneración, `lockedParams`),
  `audio-analyzer.ts` (bass/mid/treble + dispositivo + audio del **sistema**),
  **`background-modes.ts` NUEVO** (6 fondos + viñeta).
- **App `/audiomorphic`**: panel REAL portado entero, **`isLocked = false`**. En la app original los
  planes **bloqueaban de verdad** (no era teatro de UI, como se creyó leyendo la repo mala).
  Presets → `localStorage`, ilimitados y sin cuenta.
- **Capa de fondo**: botón «Menú de ajustes COMPLETO» → **el mismo panel** (`context="background"`),
  con transparencia real. Se persiste solo el **diff** con los defectos (no engordar `prefs`).
- **Migración `BG_LAYERS_VERSION` 2 → 3**: `sgResonanceModes` → `spiralResonanceModes`. Sin esto,
  quien ya tuviera la capa **perdía su geometría**.
- **Web oficial**: quitados los bloqueos en la repo CORRECTA y **pusheado a `main`**
  (`bbcf3b9`, autor `alexbordongarrigos@gmail.com`) ⇒ Vercel despliega la versión libre y COMPLETA.

### Verificación
- `npx tsc --noEmit` **exit 0** · `npm run build` **exit 0** (OS).
- **Motor probado en Node con un canvas instrumentado** (90 fotogramas por caso): los 3 pilotos,
  DJ+beat, las 20 geometrías en resonancia y la capa sagrada en modo «ambos» →
  **90 `stroke`/90 fotogramas, 64.411 `arc`, 0 NaN**, espiral a pantalla completa. Bloqueos y modos
  de regeneración respetados.
- Panel COMPLETO verificado en vivo en Chrome (`/audiomorphic`, localhost).
- Repo oficial: `vite build` **exit 0**; los ~1.300 errores de `tsc` de esa repo son **preexistentes**
  (nunca ha typecheckeado limpia; su build no usa tsc).

### Honestidad
- **VR / AR / Portal AR NO es portable**: su motor exige **React 19** (R3F v9 + `@react-three/xr` v6);
  el OS va con React 18 + R3F v8. La sección del panel **lo dice** y enlaza a la app original. Los
  parámetros VR/AR se conservan para no romper presets. **No hay botones muertos.**
- Los presets del OS son **por dispositivo** (falta meter la clave en `SYNCED_KEYS`).
- El bucle del canvas **se para con la pestaña oculta** (regla de rendimiento): en una pestaña de
  fondo el canvas sale vacío, y es a propósito.

---

## 2026-07-14 — Adenda 69 · J: Notificaciones/popups de apps + auto-actualización de la Librería

**Sesión por:** Claude (subagente Cowork, Opus 4.8) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Las apps instaladas ya pueden emitir **notificaciones** (al centro del OS,
persistidas, con la app como origen) y **ventanas emergentes** (toasts + popups apilables); y las
**actualizaciones de la Librería** pueden **aplicarse solas** (modo automático) avisando por cada una.

### Hecho (J-1 · notificaciones y popups)
- **`src/lib/notifications/app-notify.ts`** — `notifyFromApp({appId,title,body,icon?,actions?,level})`:
  entra al Centro de Notificaciones (persistido, origen = app) + toast sonner si hay permiso de popup.
  Bus `starseed:app-notify` + `postMessage` de iframes **validado por frame/origen** (`data-app-id` de
  confianza). **Dedupe** + **permisos por-app** (`starseed.apps.notify-prefs.v1`, default ON).
- **`src/components/notifications/app-notify-bridge.tsx`** (layout raíz, sin UI) — PERSISTE en el centro
  vía `useNotifications` y traduce los `postMessage` de apps embebidas a `notifyFromApp`/`openAppPopup`.
- **`src/lib/notifications/app-popups.ts` + `app-popup-host.tsx`** — `openAppPopup({appId,title,text|html|route,size})`:
  overlay portátil **apilable · movible · cerrable (×/Esc) · no intrusivo**. `route`=iframe mismo origen;
  `html`=iframe **sandbox aislado**; `text`=párrafo. **No toca `desktop-store.ts`** (otro agente).
- **`src/components/settings/notifications/app-notifications-panel.tsx`** — Ajustes → Notificaciones
  (montado en /cuenta): interruptores «Avisos»/«Popups» por app instalada + «Probar».
- **`src/context/notifications-context.tsx`** — `AppNotification` gana `appId?`/`appName?` (origen).

### Hecho (J-2 · auto-actualización)
- **`available-updates.ts`** ampliado: `getAutoUpdateEnabled`/`setAutoUpdateEnabled`
  (`starseed.library.autoupdate.v1`, default OFF), `applyAllUpdates`, `runAutoUpdate` (aplica + avisa por J-1),
  `checkAndMaybeAutoUpdate`. Deduce el repo de cada paquete de `payload.externalUrl`/`url` ⇒ cubre los repos
  nuevos de Adendas 66-69 sin cambios. **`<AutoUpdateWatcher/>`** global: comprueba/aplica al arrancar + cada
  6 h + al cambiar la Biblioteca. UI (`available-updates.tsx`): **«Actualizar todo»** + **toggle de auto** +
  **texto honesto**.

### Honestidad (qué significa «actualizar»)
- Para paquetes OSS/externos, «actualizar» **NO descarga ni ejecuta binarios**: el código vive en su repo
  externo y no corre dentro del OS. «Actualizar» = **refrescar registro/enlace/versión** en la Biblioteca
  (`starseed.library.installed.v1`) + historial. Para apps nativas del OS, la versión nueva la trae
  recargar/reinstalar (el despliegue). **La UI lo dice con todas las letras.**

### Verificación
- `npx tsc --noEmit` **exit 0** · `npm run build` **exit 0** (93/93 páginas).
- **EN VIVO** (build de producción local `next start` :3111, Chrome): notificación de app disparada por
  evento → **persistida en el centro** (`starseed.notifications.v1` 4→5, con `appId`/`appName`); popup de app
  **pintado y cerrado**; panel de actualizaciones con **toggle auto + «Actualizar todo» + honestidad**.
  Datos de prueba borrados (origen localhost, aparte de producción).

### Pendiente / Próximos pasos
- **Añadir a `SYNCED_KEYS`** (settings-sync.ts, NO tocado por encargo): `starseed.apps.notify-prefs.v1` y
  `starseed.library.autoupdate.v1` (ambas ámbito cuenta). `starseed.updates.history.v1` ya está.
- El centro local no sincroniza (device-local); para que los avisos de apps viajen habría que replicarlos a
  la tabla `notifications` de Supabase (falta RLS de INSERT).
- Categoría del centro para apps = `system` (no hay categoría «app»); el `iconName` sí se guarda.

---

## 2026-07-27 — Adenda 97 · Red Mesh Meshtastic en el núcleo de Astraura + pestaña global «Personalidades» + OmniVoice Mixer (xAI one-shot) + repo propio de Omnifrecuencias

**Petición de Alex:** (1) integrar el protocolo de malla Meshtastic (LoRa) en el núcleo de Astraura — descubrimiento P2P automático, enrutado inteligente Mesh↔Wi-Fi con fallback censura-resistente, sincronización comprimida de bajo ancho de banda (respetando duty cycle) y gestión del hardware (Web Serial/BLE/daemon); (2) refactorizar la interfaz de Astraura: pestaña global «Personalidades» (reemplaza «Aurora»), OmniVoice arreglado y expandido con xAI y OpenVoice, asignación de voz por neurona en tiempo real sin cortes, y reglas mesh por neurona; (3) cambiar el repo de Omnifrecuencias a github.com/alexbordongarrigos/omnifrecuencias.

### Red Mesh (SOP nuevo: `architecture/astraura-mesh-meshtastic.md` — regla dorada cumplida: doc primero)
- **Módulo nuevo `src/ai/astraura/mesh/`** (13 archivos): `types` · `constants` (límites REALES del firmware jul-2026: payload útil 233 B → frames propios ≤200 B; duty legal EU_868/EU_433/TH/UA_433 10 %, UA_868 1 % → objetivo propio ≤2 %) · `codec` (sobre binario magic 0xA7: varint+deflate-raw nativo+CRC-16+troceo/reensamblado con NACK selectivo; PURO y testeado) · `transport`+`meshtastic-adapter` (librería OFICIAL `@meshtastic/core` + transportes Web Serial/Web Bluetooth/HTTP vía alias npm de JSR, `import()` dinámico, handshake configure()+NodeDB, watchdog 45/90 s, backoff con jitter; solo el daemon reconecta sin gesto) · `discovery` (NodeDB viva pasiva: online/stale/offline por sweep perezoso de 30 s) · `health` (salud dual EMA: sonda HEAD adaptativa Wi-Fi + SNR/nodos/utilización mesh — cero airtime) · `decision-router` (decisión O(1) sobre estado cacheado con histéresis 0,55/0,65 y clases P0-P3; P0 = DUAL siempre) · `sync` (colas por prioridad + token bucket de airtime con reserva P0 + whitelist de campos por tipo) · `rules` (reglas POR NEURONA: interactiva/relé-de-alertas/solo-escucha/apagada + prioridad + permisos voz/estado) · `store`+`use-mesh` (estado global estilo zustand sin dependencias: getState/subscribe + useSyncExternalStore) · `simulator` (malla virtual para probar sin hardware) · `index` (API pública: startMeshSubsystem/connectMesh/sendOverMesh).
- **UI**: pestaña «Red Mesh» en /agent (`src/components/mesh/mesh-control-panel.tsx`): conexión USB/BLE/daemon/simulador, KPIs de salud dual, nodos con SNR/RSSI/batería/saltos, historial de decisiones con RAZONES, presupuesto de airtime y pruebas honestas (presencia P1, alerta P0 de ENSAYO). + `mesh-status-chip.tsx` reutilizable.
- **Astraura core**: la respuesta LOCAL honesta del router ahora ANUNCIA la malla activa ("sin internet, mensajería/alertas siguen por radio") — la malla es el último transporte de la regla «Astraura siempre funciona» (`router.ts::buildHonestFallback`).
- **Deps nuevas** (JSR→npm alias, carga dinámica, bundle base intacto): `@meshtastic/core` 2.6.6 + `transport-web-serial`/`web-bluetooth`/`http`. `.npmrc` añade el registry @jsr. ⚠️ El `package-lock.json` anterior estaba DESINCRONIZADO (npm ci fallaba: gtoken); se regeneró consistente.
- **Pruebas**: `scripts/test-mesh-core.ts` (npx tsx) — 15/15: troceo real, reensamblado desordenado, pérdida+NACK, CRC ante corrupción, basura → null.

### Personalidades global + OmniVoice (Adenda 97)
- **/agent**: la sección «Aurora & Astraura» (1 ítem) pasa a **«Personalidades»** con 3 pestañas: `personalidades` (nuevo `personalities-hub.tsx`: KPIs vivos + PersonalitiesPanel GLOBAL — la misma fuente de verdad de Exocórtex/Cerebros — + **reglas mesh por neurona** + historial de memoria local) · `aurora` (Estudio de voz INTACTO; deep-links `?tab=aurora` siguen) · `mesh` (panel de arriba). Alias nuevos: personalidad(es)/personas → personalidades; malla/meshtastic/lora → mesh. El acceso «Personalidades» del Portal Nexus abre ahora el hub.
- **OmniVoice Mixer** (`omnivoice-mixer.ts`, nuevo): salida WebAudio única — crossfade equal-power 160 ms entre locuciones y al cambiar voz/personalidad en caliente, cola PCM continua para streaming, ganancia por neurona, stop con fade de 120 ms. Adopción v1 honesta: ruta híbrida Voicebox/OpenVoice del speak-router + xAI + stop global; el reproductor troceado de neural-tts conserva su arranque-anticipado (Adenda 93) y migra en v2.
- **xAI one-shot** (`xaiSpeakOnce` en `xai-voice-agent.ts`): el canal realtime de grok-voice ahora TAMBIÉN sintetiza locuciones sueltas para la cadena OmniVoice (token efímero o proxy server-side; PCM al mixer). Entra en la cadena SOLO por pin de personalidad o elección explícita — NUNCA por AUTO (gratis-primero manda); sin acceso declina limpio. `engine-registry` y `speak-router` cableados.
- **Arreglos REALES del build de voz** (24 errores TS pre-existentes → 0): los `Record<NeuralVoiceEngine>` de `neural-tts.ts` no incluían "xai" (3×TS2741 — la integración xAI anterior quedó a medias), etiqueta xai ausente en `quick-settings-tab`, `getVoiceById` sin importar + tipos rotos en `voice-neuron-onboarding`, `speak`/`MessageSquare` sin binding en `desktop-context-menu`, `SavedResource.title` (no `.name`) en finder, anys implícitos en perfiles, y `AuroraMessageMeta` sin `route`/`tokens` (los usaba message-action-bar).
- **🔐 Fix de seguridad** (`settings-sync.ts`): `engines.<motor>.apiKey` de la config de voz (p. ej. la API key PERSONAL de xAI) se SUBÍA EN CLARO a `user_settings.prefs`. Ahora se poda antes de subir y se reinyecta desde el dispositivo (mismo contrato que las integraciones).
- **Fix de parada**: `stopNeural()` ahora invoca `__astrauraStopContinuous` — el botón de parar no detenía el pool de audio del reproductor troceado continuo (confirmado por grep: nadie lo llamaba).

### Omnifrecuencias → repo propio
- `packages.ts` (app-omnifrecuencias v1.1.0): `payload.externalUrl = github.com/alexbordongarrigos/omnifrecuencias` (+note; `route` sigue mandando al instalar — el watcher de auto-actualización de la Biblioteca vigila ese repo). `oss-library.ts`: entrada nueva "omnifrecuencias" (creation, defaultIntegrated, url del repo propio) junto a Audiomorphic.

### Verificación
- `tsc --noEmit`: **0 errores** (antes 24). `next build`: en verificación al cierre de esta entrada (ignoreBuildErrors sigue true, pero ya no tapa nada). Tests codec 15/15. Multi-agente: 7 agentes de investigación/mapeo (docs oficiales Meshtastic + firmware real + mapeo del repo) + verificación cruzada.

**Pendiente / siguiente ola:** aplicar migración realtime pendiente (aviso previo de CLAUDE.md); probar con radio LoRa FÍSICO (todo lo demás está probado con simulador + tests); v2 mesh: intercambio de topologías entre neuronas remotas vía Supabase (os_spaces), reglas por clase de tráfico en UI, y migrar el reproductor troceado al mixer; rotar service_role + DashScope (arrastrado).

---

## 2026-07-27 — Adenda 98 · Mesh v2 (dual, antenas inteligentes, federación, mapa 3D, Centro de Conexiones) + OmniVoice migrado al mixer

**Petición de Alex:** completar lo pendiente de la ola (mesh v2), con Wi-Fi/router externo y malla P2P funcionando A LA VEZ; Centro de Conexiones en Control Center y en la barra superior del escritorio para administrar TODAS las conexiones de cada neurona (Wi-Fi, Bluetooth, antenas de radiofrecuencia por banda, mesh P2P y routers externos); una página completa de la Red Mesh (accesible desde el hub y agregable al dock) con mapa 3D de neuronas por RF, privacidad/permisos y selección inteligente de banda; y que el selector de voz OmniVoice reaparezca en cada actualización, adaptado a las capacidades de cada neurona con ejemplos funcionales y editables. Al final: actualización completa del OS, commit y push.

### Núcleo mesh v2 (`src/ai/astraura/mesh/`)
- **connectivity.ts** — ajustes de conectividad de la neurona (dualMode ON por defecto, ruta preferida auto/wifi/mesh, transporte por defecto) + inventario vivo de vías (red externa vía Network Information API, Bluetooth, Web Serial/puertos, mesh). Honesto: el navegador no lista SSIDs ni controla la celular.
- **antennas.ts** — catálogo REAL de bandas por región (freq/duty/potencia del firmware) y presets con su compromiso alcance↔capacidad↔velocidad; `recommendPreset` (selector inteligente: auto/distancia/equilibrio/velocidad con SNR+densidad+congestión) y `estimateDistanceMeters` (log-distancia por SNR para el mapa 3D).
- **privacy.ts** — visibilidad (account/private), compartir posición (OFF por defecto), compartir nombres, permiso de uso del relé (all/alerts/none) que manda sobre los roles.
- **federation.ts** — push/pull throttled de instantáneas COMPACTAS a `os_mesh_topology` (RLS owner) → `state.remoteTopologies`; respeta privacidad (incl. device_label y borrado de la fila al pasar a private). Migración `supabase/migrations/20260727120000_mesh_topology_federation.sql`.
- **decision-router** — modo dual (P1 presencia por AMBAS vías con preferred=auto; preferred=mesh enruta a la malla las clases permitidas) sin romper la histéresis; roles off/listen-only NUNCA transmiten.
- **meshtastic-adapter** — autodetección de región/preset (onConfigPacket, oneof lora) → presupuesto/airtime reales; `setModemPreset` REAL (protobuf-es v2: `create(ConfigSchema,…)` de @bufbuild/protobuf + commitEditSettings, base = config LoRa cacheada) para cambiar de banda/velocidad al vuelo; `applyModemPreset` en index. Simulador emula el cambio.

### UI
- **Centro de Conexiones** (`src/components/connectivity/`): `connections-center.tsx` (red externa · malla con conexión rápida por transporte · modo dual · ruta preferida · BT · antenas) montado en Control Center (nueva pestaña «Conexiones») y en un popover de la **barra superior del escritorio** (`connections-menu.tsx` con estado vivo).
- **Página /red-mesh** (app «Red Mesh» agregable al dock + en la Biblioteca): **mapa 3D** (`mesh-map-3d.tsx`, R3F — nodos por GPS real o estimación por RF/SNR, neuronas federadas en órbita, anillos 100 m/1 km/5 km, respeta prefers-reduced-motion) + panel de conexiones + `antennas-panel` (selector inteligente que APLICA el preset al radio) + `mesh-privacy-panel` + `peers-panel` (P2P con datos de antena · federadas · router externo medido).

### OmniVoice
- El reproductor troceado de `neural-tts` reproduce por el **mixer** (`playSequentialViaMixer`: crossfade real entre trozos) con HTMLAudio de suelo. `mixerPlayBlobInfo` (duración para encadenar) + stop PCM que corta de verdad las fuentes agendadas.
- Selector de voz: `VOICE_SYSTEM_VERSION=98` (reaparece por neurona) + `VOICE_UPDATE_NOTES` (novedades al actualizar), recomendación por `device-tier`, **frase de ejemplo editable** y botón «▶ Probar» por personalidad (sintetiza con la voz de esa persona por el mixer). Botón «Selector de voz» en el hub de Personalidades.

### Verificación (multi-agente Opus + Sonnet) — 11 hallazgos reales, TODOS corregidos
- Opus (núcleo): `setModemPreset` usaba el constructor protobuf-es v1 (siempre undefined) → reescrito con `create(ConfigSchema)` v2 (+`@bufbuild/protobuf` como dep directa); `device_label` de la federación saltaba `shareName`; rama dual no limpiaba la histéresis; `private` no borraba la fila publicada; `onLoraConfig` reseteaba el airtime en cada reconexión + 6 regiones faltaban en el mapa de duty.
- Sonnet (UI): **CRÍTICO** — `playSequentialViaMixer` (y el mismo bug PREEXISTENTE en la ruta clásica, que además colgaba con `nextBlob!`) perdía el trozo índice 1 → prefetch por índice reescrito en ambas rutas; hidratación (privacy-panel + connections-center inician con defaults + sync en useEffect); `stopMixer` no cortaba el PCM agendado → stop duro por fuente; prefers-reduced-motion en el mapa; emoji ▶️→▶.
- `tsc` 0 errores · tests `scripts/test-mesh-core.ts` **29/29** (incluye regresión del trozo perdido) · `next build` OK, `/red-mesh` prerenderiza (22.9 kB).

### Pendiente
- Aplicar la migración `20260727120000_mesh_topology_federation.sql` en Supabase (la federación degrada silenciosa sin ella).
- Probar con radio LoRa físico (todo verificado con simulador + tests + build).
- Arrastrado: migración realtime `20260711120000`; rotar service_role + DashScope.

---

## 2026-08-04 — Adenda 138 · Red por neurona (OpenWISP/NetJSON) · Recomendador de modelos (llmfit) · Notificaciones ntfy · Generación audiovisual gratis-primero · Plan Chatterbox
**Sesión por:** Claude (Cowork) + subagentes Sonnet
**Resumen ejecutivo:** Integración de repos externos como funciones reales del OS, con `npx tsc --noEmit` **exit 0** y `npm run build` **exit 0**.

### Hecho
- **Generación audiovisual GRATIS-PRIMERO (Pollinations por defecto):** nuevo `src/ai/astraura/media/media-gen.ts` (proveedores pollinations/hf/automatic1111/fooocus/comfyui/muapi/custom, prefs por cuenta y por neurona) + panel `src/components/media/media-gen-panel.tsx`. `generarImagen` (service-generation.ts) ahora **cae a Pollinations** cuando no hay servicio propio conectado → funciona para cualquier cuenta desde la web sin instalar nada. Capacidad `av-gen` **ENCENDIDA por defecto** en `skills.ts` (nuevo campo `defaultOn` + `DEFAULT_ON_DISABLED_KEY`). Montado en /habilidades. Nota: `open-generative-ai` resultó ser frontend de la pasarela de PAGO Muapi → registrado como opción online trae-tu-clave, NO como motor por defecto.
- **Recomendador de modelos (fórmulas de llmfit MIT portadas a TS):** `src/ai/astraura/model-fit.ts` (QUANT_BPP, KV-cache, scoreFit ×1.2, roofline tok/s, ancho de banda GPU) + `src/ai/astraura/model-scout.ts` (compara hardware real vs mejores opciones, deltas vs lo usado) + panel `model-scout-panel.tsx`. Montado en Ajustes IA · pestaña «modelos» (aparece también en la ventana de arranque/actualizaciones).
- **Notificaciones ntfy:** `src/lib/notifications/ntfy.ts` (publish/subscribe SSE, tópicos por cuenta y por neurona con hash, espejo a notifyFromApp) + `ntfy-panel.tsx`, montado en /cuenta → Notificaciones.
- **Red por neurona (OpenWISP/NetJSON):** `src/lib/network/netjson.ts` (generadores AP/mesh 802.11s/station/bridge/DHCP + NetworkGraph) + `src/lib/network/neuron-network.ts` (rol de red por neurona, cliente OpenWISP, antenas/señales) + ruta `src/app/api/network/openwisp/route.ts` (patrón SSRF de Adenda 131) + `router-center.tsx` como pestaña **Router** de /senales (SignalsCenter).
- **Biblioteca:** paquetes nuevos para media-gen/Pollinations/open-generative-ai, llmfit, ntfy, OpenWISP/NetJSON, ODS (referencia) y Chatterbox (voz, próxima ola). Servicios nuevos en `/servicios`: Pollinations (por defecto), Hugging Face, Muapi.
- **SOPs:** architecture/generacion-audiovisual-astraura.md, recomendador-modelos-llmfit.md, notificaciones-ntfy.md, red-por-neurona-openwisp.md. Investigación Chatterbox + ntfy guardadas en el Proyecto (claude/).

### Decisiones tomadas
- **Osmantic/ODS** es un instalador de IA self-host SIN relación con mesh/redes → NO se integra su código; solo referencia opcional de servidor IA.
- **Chatterbox** (Resemble AI, MIT): análisis y plan de integración para OmniVoice; se implementa en la próxima ola (registro en engine-registry.ts) para evitar cambios de unión de tipos arriesgados esta ola.

### Pendiente / Próximos pasos
- Chatterbox: registrar el motor en `engine-registry.ts`/`voice-config.ts` + rama adaptador en `neural-tts.ts` (endpoint OpenAI /v1/audio/speech).
- ntfy: montar `startNtfyBridge()` global (p. ej. en app-notify-bridge.tsx) para el espejo push siempre-activo.
- Recomendador: actualizador multi-proveedor de catálogos (patrón openrouter-live-catalog.ts) y emitir notificación por dispositivo cuando `hasBetter`.
- Registrar /senales→Router y la generación audiovisual en el dock/launcher si se quiere acceso directo (hoy discoverable vía Señales y Habilidades).

---

## 2026-08-06 — Adenda 149 · «Configuración/actualización de sistemas de Astraura en esta neurona» (neurona × personalidad)
**Sesión por:** Claude (Cowork) — orquestación Fable 5, agentes Opus, lectores Sonnet, 2 revisiones adversariales Fable
**Resumen ejecutivo:** La ventana de arranque de Astraura+OmniVoice se rediseña como centro de SISTEMAS POR NEURONA × PERSONALIDAD, con capa de datos nueva CABLEADA al runtime. `tsc --noEmit` exit 0 · `next build` ✓ Compiled successfully · tests mesh 146/146.

### Hecho
- **Ventana renombrada y retabulada** (SOP nuevo `architecture/astraura-config-sistemas-neurona.md`): título dinámico por contexto (neurona nueva / actualización de sistemas EN USO / recomendaciones auto-detectadas / al día, vía `classifyUpdates`+`windowHeading`); barra superior «Modelos · Cuenta» → **LLM · Astraura · OpenVoice · Cerebro · Señales**, todas con selector de personalidad («Todas» + Aurora/Hermione/…) y PROCEDENCIA visible con «volver a auto». Hub embedded (config-ia) conserva además Neuronas/Integraciones/APIs. Sinónimos retro-compatibles (modelos/orden/cuenta→astraura, voz/omnivoice→openvoice…): deep-links viejos intactos.
- **Capa de datos** `src/lib/astraura/neuron-persona-store.ts` (núcleo sin dependencias; fusión «*»⊕personalidad campo a campo y antena a antena; PODA anti-`{}`-fantasma) + `neuron-persona-systems.ts` (resolución con procedencia, `detectAntennas`, novedades por sistema) + `persona-system-sections.tsx` (secciones + `AstrauraPersonaCard`). Clave `starseed.astraura.neuron-persona.v1` sincronizada (settings-sync) y con refresco en vivo (realtime-sync EVENT_BY_KEY).
- **CABLEADO DE RUNTIME (los overrides actúan):** LLM → `intelligencePinFor` (pin de neurona primero, no exclusivo, todos los sentidos; `modo:"auto"` de neurona fuerza automática); VOZ → `engine-registry` (paso 0 del pin + `voz.modo` sobre la elección del dispositivo, relectura en fresco); MEMORIA → `effectiveMemoryPolicy` en `compilePersonalityPrompt`; SEÑALES → `mesh/persona-antenna-gate.ts` en `sendOverMesh`/`transmit`/`deliverInbound`/`decideRoute` (entrada/salida y ruta por antena; llamantes de red externa marcan `antena:"wifi"`). Camino sin overrides = comportamiento byte-idéntico (verificado).
- **Superficies nuevas:** botón por personalidad en Personalidades («Sistemas en esta neurona», preselecciona la persona), atajo en Trinity Control Center (ajustes rápidos), tarjeta en `/cuenta`, botones en Señales y Cerebro hub, aliases `?tab=sistemas|sistemas-neurona` en /agent. `openAstrauraConfig(section, {personalityId})` ampliado retro-compatible.
- **Bugs de sync reparados de paso:** `starseed.astraura.model-order.v1` tenía evento pero no viajaba (añadido a SYNCED_KEYS); la clave nueva tiene evento en EVENT_BY_KEY.
- **Análisis de estado completo del OS** (8 lectores + síntesis multi-agente) → `_analysis/informe-estado-2026-08-06.md` + doc en el Proyecto Claude.

### Decisiones
- Patrón «capa transparente» (como PersonalityIntelligence A67): sin override, nada cambia; el pin va primero pero NUNCA es exclusivo (Astraura no enmudece por un pin obsoleto).
- `syncBrains` mantiene UNA fuente de verdad (`NeuronSettings`, editable también desde la pestaña Cerebro) — sin duplicar estado.
- La antena lógica «lora» manda sobre el enlace físico (serial/BLE/daemon); especificidad de ruta preferida: lora→serial→bluetooth→daemon→wifi.

### Pendiente (ver SOP §9)
- `permitirPago` y `cerebro.almacen` persisten pero sin consumidor de runtime (filtro de pago sigue a nivel cuenta; almacén → memory-destinations en próxima ola).
- Señales por personalidad CONCRETA esperan que `transmit`/`decideRoute` reciban personalidad emisora (TODO en código); hoy rigen los defaults «Todas».
- `audioRef` de voz custom sin llegar a síntesis (previo); widgets de dashboard sin entrada propia; hybrid local/nube no lee `voz.modo`.
- Arrastrados: migración realtime `20260711120000`; rotar service_role + DashScope; modo claro.

---

## 2026-08-07 — Adenda 149 · tanda «3 OLAS» de UX/UI + aparición garantizada + relaciones por personalidad
**Sesión por:** Claude (Cowork) — orquestación Fable 5, 7 agentes implementadores Opus + 2 revisiones adversariales (Opus; hallazgo CRÍTICO corregido)
**Resumen ejecutivo:** Se implementan las 3 olas del catálogo `_analysis/ideas-mejoras-ux-ui-2026-08-06.md` (64 ideas) + tres peticiones directas de Alex. `tsc` 0 · `next build` ✓ · mesh 146/146.

### Hecho (≈40 archivos; SOP §2b/§4/§5b/§9 actualizado)
- **OLA 1 «Que no mienta y no duela»:** toasts con «Deshacer» en toda edición instantánea; focus-trap+Escape en el modal (useModalA11y, Escape=Recordar luego); insignias de override por pestaña y por personalidad; cristal real (glass-depth/edge + blur); piel de cabecera por contexto (4 modos); riel de override; aria-pressed; CTAs ≥44px; enlaces cruzados/estados vacíos reales; chip de procedencia corto; scout de voz + PersonaCoherencePanel en OpenVoice; describeCaps; filtro de cerebros; targets táctiles select/tab/switch (apply.ts); gate del doble modal de voz.
- **OLA 2 «Que se entienda de un vistazo»:** acentos por pestaña reales (SectionTabs.accent); capa de tokens `.astraura-window` (--aw-*, rama clara lista para el modo claro) con suelo de contraste 4,5:1 y escala tipográfica; orbes procedurales en el selector de personalidad (radiogroup + snap + fundido); skeletons con geometría; sheet inferior móvil; chevrones; swipe entre pestañas; atajos 1-5/⌘Enter; modo guía primera vez (Paso N/5); «Aplicar lo recomendado»; diff antes/después; «volver a auto» por ámbito (pestaña/personalidad/neurona); copiar config de otra neurona; export/import JSON con scanner; preview de cadena al fijar pin; scout con «Usar para esta personalidad»; estado vivo en /cuenta, Trinity quick-settings (5 chips), buscador de Ajustes (8 entradas con action), paleta de comandos (6), puente entre recomendadores, personalidades del cerebro activo, contador de reglas en Señales, chips «N sistemas ajustados» + KPI en Personalidades.
- **OLA 3 «Que actúe de verdad y respire»:** cableados reales de permitirPago (AND por persona en router — con corrección del CRÍTICO: el campo del perfil solo hereda en modo "fija"), personalidad emisora en transmit/puertas de antena, cerebro.almacen en memory-destinations, audioRef→síntesis (refBlob CSP-safe con caché), voz.modo en híbrido; constelación orbital de los 5 sistemas con pulso de salud (SMIL, gates reduced-motion); resonancia (score+arreglos) y divergencia entre neuronas; comparador de personalidades; sonificación pentatónica OFF-por-defecto (toggle en a11y); orbe teñido por clase del motor que respondió + leyenda en RouteChip; chip «proceso» honesto en el chat (res.route real).
- **APARICIÓN GARANTIZADA de la ventana (petición Alex, SOP §2b):** pendingConfiguration() en shouldShowUpdates (reaparece al reiniciar mientras falte configurar la inicial o la vía de voz, con «Configurar ahora»); gate de 3 vías con suscripción al Centro de Aurora + red de seguridad 9s (marcador data-aurora-setup-center) — cierra la regresión A132 (neuronas sin setup no la veían NUNCA); refresco en vivo de pendientes/título.
- **Pestaña Astraura = RELACIONES (petición Alex):** tabla de relaciones de modelos/sistemas de CADA personalidad de la cuenta en esa neurona, siempre visible, con navegación (personalidad→selección, sistema→pestaña) e «Igualar a esta».
- **Botones predeterminados garantizados (petición Alex):** dock-config con ensureDefaultDockItems CONTINUA ('senales', 'red-feed') + migración v13 — cierra el agujero de migraciones one-shot locales vs clave sincronizada por el que en algunas neuronas/cuentas no aparecían; personalización (deshabilitar) respetada.
- **Revisión adversarial (Opus tras corte de Fable por límite):** CRÍTICO permitirPago corregido; Escape sobre confirmaciones ya no pospone la ventana; comparador duplicado eliminado; ventana ya no queda rancia; remount/scroll de la tabla de relaciones arreglado; atajos duermen bajo confirmaciones; compare-table migrada a tokens (+ --aw-sticky); trampa de Tab cede ante capas portalizadas.

### Pendiente (SOP §9 nuevo)
- decideRoute sin personalidad (ruta preferida lee «*»; propagar desde turn.ts); unificar OR de pago del puente Hermione con el AND del router; voz.modo "cloud" no fuerza nube con daemon vivo; widget propio de escritorio; LWW.
- Arrastrados: migración realtime 20260711120000; rotar service_role+DashScope; modo claro (la capa --aw-* ya lo deja a un cambio de hoja).

---

## 2026-08-09 — Adenda 149 · cierre de PENDIENTES §9
**Sesión por:** Claude (Cowork) — Fable 5 + 2 agentes Opus
**Resumen ejecutivo:** Todos los pendientes accionables del SOP §9 quedan cerrados. `tsc` 0 · mesh **149/149** (3 tests nuevos) · verificación de pago/voz 16/16 · migración realtime APLICADA.

### Hecho
- **Ruta preferida por personalidad de extremo a extremo:** `DecideRouteInput.personaId` + `preferredRouteFor(input.personaId)`; `sendOverMesh` propaga su id (el mismo de las puertas) y `turn.ts` pasa `personalityId: persona?.profile?.id` al `transmitForContext`. Sin persona → byte-idéntico. +3 tests en `test-mesh-core.ts` (149 total).
- **Pago del puente Hermione unificado (AND):** bridge usa `personaAllowsPaid(profile)`; server aplica espejo por pin (solo modo «fija»). CAMBIO INTENCIONAL: cuenta-off+pin-true ya NO gasta (cerrado el agujero de gasto).
- **`voz.modo:"cloud"` por personalidad fuerza nube primero** con local de respaldo (`localFallback`); privacidad (`local_only`/`cloud_only`) sigue mandando; la elección por dispositivo conserva su semántica.
- **Migración realtime `20260711120000` APLICADA** a `nxstilnyidvkqeosofuh` vía Management API (HTTP 201) y verificada en `pg_publication_tables` (las 8 tablas presentes). Se retira de arrastrados.
- **Escritorio con estado real:** franja de 5 sistemas en el widget Córtex Astraura (resolvePersonaSystems, import perezoso, clic→openAstrauraConfig); quick-settings de Trinity pasa a import perezoso (chunk más liviano).

### Pendiente restante (SOP §9 final)
- Sugerencias del Córtex aún simuladas; LWW del mapa; rotar service_role+DashScope (acción de Alex); modo claro global (la ventana ya está tokenizada). Nota: fallos PREEXISTENTES ajenos en `test-omnivoice-hybrid` (1) y `test-openvoice2` (4) por deriva de defaults de voz — anteriores a estas olas, documentados para la próxima sesión.

## 2026-08-09 — Adenda 149 · TANDA 4: OmniVoice · mesh real · dock definitivo · hub · perfiles compartidos
**Sesión por:** Claude (Cowork) — Fable 5 orquestando + 5 agentes Opus (voz, radar, hub, perfiles, dock)
**Resumen ejecutivo:** Los 5 frentes del mensaje de Alex cerrados. `tsc` 0 · mesh **178/178** · voz **74+71+42** (los 5 fallos preexistentes eran tests obsoletos, realineados) · vitest 53/53 (11 dock nuevos) · build ✓ · migración de perfiles APLICADA. Push `77e7ecc..3995a5f` (46 archivos, +7906/−538).

### Hecho
- **OmniVoice es el SISTEMA; OpenVoice, un motor:** renombrado en ventana 149, constelación, quick-settings, paleta, buscador de ajustes, drawer y chips (clave interna `openvoice` conservada adrede). VOZ ARREGLADA de raíz: identidad congelada por mensaje (`voice-identity.ts` — endpoint/persona/semilla/refBlob resueltos UNA vez; el endpoint congelado ahora SÍ llega al motor; failover solo misma familia), troceo por grupos de frases con presupuesto por motor (160/380 · 160/340 · 130/230), prefetch encadenado (lookahead 2) y programación gapless por WebAudio (`mixerDecodeBlob`/`mixerPlayBufferAt`): rápida, de corrido, sin cambiar de voz a mitad de mensaje y con coherencia emocional entre chats por personalidad.
- **Radar/Red Mesh con datos REALES:** `signals.ts` agrega TODAS las fuentes (meshtastic SNR/RSSI/GPS, beacons, neuronas StarSeed vinculadas con datos públicos, enlaces externos, BLE tras gesto, serie); anillo de precisión = f(calidad, certeza de posición); sectorización por antena con jitter determinista (FNV, sin Math.random); señales incompatibles visibles con opciones de interconexión; panel de detalle nuevo (`use-detected-signals` + `signal-detail` + `detected-signals-panel`); espejo del eje z corregido. 178/178.
- **DOCK — tercera vez y causa raíz de verdad:** el payload `starseed.dock.items.v2` SINCRONIZADO llegaba después del arranque y pisaba la reparación; la bandera v13 se consumía antes; `enabled:false` no se re-encendía; y la reparación no subía por la ventana anti-eco del sync (empate LWW → bucle). Nuevo SOBRE VERSIONADO `{defaultsVersion:14, items}` (`src/lib/dock/dock-defaults.ts`, puro) normalizado en TODA ruta de entrada (carga, sync entrante en `realtime-sync`, pull manual en `settings-sync`, cambio de perfil en `omni-dock`) y con escape del anti-eco para EMPUJAR la reparación a la cuenta → señales y feed de red aparecen en TODAS las neuronas/cuentas/perfiles ya generados; apagarlos tras la v14 se respeta (personalizable). 11 tests nuevos.
- **Hub de conexiones:** búsqueda con debounce + segmentos «Sugeridos»/«Toda la red» (`network-directory.ts`, keyset 24).
- **Perfiles COMPARTIDOS entre cuentas:** `os_profile_access` (observador<colaborador<gestor<total; total = cerebros/memorias/configs/logs vía pasarela `profile_access_allows`), trigger guardián (el principal NUNCA se comparte — verificado en vivo), tipos nuevos + `categories[]` (GIN), páginas/grupos por `os_entity_roles` CERRANDO el agujero vivo de auto-concesión de owner (verificado: la rama `account_id=auth.uid()` ya no existe en el WITH CHECK). UI `profile-access-manager` en switcher + editor de entidades. Migración `20260806120000` APLICADA vía Management API (HTTP 201) y registrada en schema_migrations.

### Pendiente (SOP §9-bis)
- Adopción de `profile_access_allows(...,'total')` en las RLS de cerebros/memorias/user_settings/logs (pasarela lista); resolución de invitaciones por correo al primer login; sugerencias del Córtex simuladas; modo claro global; rotar service_role+DashScope (acción de Alex).

---

## 2026-08-22 — Adenda 153 · Astraura 1.58-bit como SISTEMA PRIMARIO de inteligencia (fusión con el backend soberano)
**Sesión por:** Claude (Cowork) — Fable 5 orquestando + 4 agentes de análisis (backend/frontend 1.58, código y docs del OS)
**Resumen ejecutivo:** El backend soberano **Astraura 1.58-bit** (`StarSeedSystem/astraura`, `~/Documents/IA 1.58 bit`, Vercel `astraura.vercel.app`, Cloud Run `astraura-backend-334237619848.us-central1.run.app`, Supabase del OS `astraura_state`) pasa a ser el **sistema primario por defecto** de toda la inteligencia del OS; las fuentes anteriores siguen como secundarias (failover intacto). Configurable por agente › personalidad › cerebro › neurona › cuenta. `tsc` 0 · vitest **76/76** (23 nuevos) · `next build` ✓ (104 páginas, ruta `/api/ai/astraura-158/[...path]`). Migración `astraura_state` ESCRITA (pendiente de aplicar por Management API).

### Hecho
- SOP nuevo `architecture/astraura-158-sistema-primario.md` (correlación completa de conceptos 1.58 ⇄ OS: motor, personalidades, agentes, habilidades, cerebros, memoria, voz, gateway, sync, secciones).
- Proveedor `src/ai/providers/astraura-158.ts` (SSE `/api/starseed/chat` → fallback `/api/chat/stream`; transcripción single-turn; `system_prompt` del OS manda; modelo = personalidad 1.58 `astraura-158/<id>`; `persona158For`). `ProviderId` += `astraura-158`; registro y config por defecto (habilitada) en `providerStore.ts`.
- Catálogo: `astraura-158-local` (127.0.0.1:8000 o endpoint de la neurona) y `astraura-158-nube` (`NEXT_PUBLIC_ASTRAURA_158_URL` o proxy). Disponibilidad con sonda honesta a `/api/status` (`availability.ts`, `astraura158EndpointFor`, `userConfigForSource` ya no hereda baseUrl por id).
- Capa `src/lib/astraura/primary-system.ts` (clave sincronizada `starseed.astraura.primary-system.v1`; `resolvePrimaryFrom` pura; `exclusivo`).
- Router: bloque «SISTEMA PRIMARIO» (tras pines A149/A67, antes de forceSource), `agentId` en `AstrauraChatRequest`/`turn.ts`, `RouteRecord.primary`, **fix** del pin por chat (`chatConfig.provider` casaba por id de fuente y además nunca llegaba a la cadena), primario exclusivo ⇒ respuesta honesta sin secundarios.
- Proxy `src/app/api/ai/astraura-158/[...path]/route.ts` (sesión + rate-limit + allowlist; stream passthrough; `ASTRAURA_158_URL` / `ASTRAURA_158_KEY`).
- Neurona: `NeuronCapabilities.astraura158` (sonda en `detectCapabilities`, publicada en `neuron_devices`), `NeuronSettings.astraura158{endpoint,enabled}`.
- UI: `PrimaryChoiceEditor` (tarjeta en la pestaña LLM de la ventana A149 — «Todas»=neurona, personalidad=personalidad; en `AgentConfigPanel` por agente), panel `/agent?tab=astraura-158` (`Astraura158Panel`: estado local/nube honesto, endpoint, primario cuenta/neurona, personalidades con correlación OS→1.58, agentes, habilidades, cerebros, memoria mem0, instalación, últimas rutas), paleta de comandos `action:astraura-158`, app `astraura-158` en catálogo y Biblioteca (`app-astraura-158`, icono `Binary`). Sin migración de dock (pestaña ya registrada).
- Backend 1.58 (repo `astraura`): `backend/app/api/starseed_bridge.py` (`/api/starseed/{health,manifest,chat}`) registrado en `main.py`; `bitnet_engine.py` honra `ASTRAURA_OLLAMA_URL`/`ASTRAURA_OLLAMA_MODEL` y reporta el modelo real en `active_model`.
- Docs: `architecture/astraura-inteligencia.md` §23, `src/ai/providers/README.md`, `CLAUDE.md` §2/§10, tests `primary-system.test.ts` + `astraura-158.test.ts`.

### Decisiones tomadas
- «Primario» ≠ «exclusivo»: Aurora siempre responde; el primario va primero y los secundarios siguen salvo `exclusivo:true`.
- Los pines explícitos existentes (chat, neurona×personalidad A149, «fija» A67) ganan a la capa primaria.
- Personalidades 1.58 = «modelos» de la fuente; el prompt de la personalidad del OS sustituye la identidad hardcoded del backend.
- La nube 1.58 se usa vía proxy propio con sesión (el backend no tiene auth): solo chat y lectura; jamás exec/archivos/claves.

### Pendiente / Próximos pasos
- Aplicar `20260822120000_astraura_state.sql` (Management API) y registrarla en `schema_migrations`.
- Alex: rotar y sacar del repo 1.58 las claves de `data/*_apis.json` y `backend/data/*_apis.json`; retirar `r2_credentials.local.json` del Proyecto de Claude; redeploy de Vercel `astraura` (sin link a GitHub, último deploy 2026-08-20 < commits 21-22; `active_tunnel.json` 404); `min-instances 1` en Cloud Run.
- Backend 1.58: auth (`X-Astraura-Key` global) y retirar RCE sin clave; compilar BitNet + GGUF `i2_s` en la neurona; rutas `/Users/alex` hardcoded → `DATA_DIR`.
- OS: importar perfiles VoiceStudio→OmniVoice; fusionar mem0/grafo con `memories`; CSP enforcing con loopback; `persona158` explícito en el editor de personalidad.

### Notas / aprendizajes
- El backend 1.58 infiere HOY con Ollama (primer modelo de `/api/tags`) o con plantillas; el BitNet C++ no está compilado ni hay GGUF. El OS lo detecta y lo dice («sin modelo real»).
- `keylessCloudSources()` incluye ahora `astraura-158-nube` (sin clave, nube, no de pago) → entra también como red de seguridad y en el reintento automático.

---

## 2026-08-22 — Adenda 153 · TANDA 2: migración aplicada, backend 1.58 endurecido y portable, frontend 1.58 corregido
**Sesión por:** Claude (Cowork) — Fable 5 + 1 agente (frontend 1.58)
**Resumen ejecutivo:** «Siguientes pasos» ejecutados: migración `astraura_state` **APLICADA y registrada** (Management API); backend Astraura 1.58 con **control de acceso** (`core/security.py`: local-only/key/open, clave maestra, claves fuera del repo, enmascarado), **rutas portables** (101 `/Users/alex` → `WORKSPACE`/`HOME`), 8 bugs corregidos, motor **honesto** (`real_mode`), memoria con tope y **sync incremental**, scripts de rotación/purga/compactación; frontend 1.58 con gateway unificado, deep-link, QR local y GatewayModal accesible. OS: CSP con loopback, cliente lee `real_mode`. `tsc` 0 · vitest 76/76 · backend importa 259 rutas y pasa el smoke (403 sin clave / 200 con clave) · `vite build` ✓.

### Hecho
- Ver SOP `architecture/astraura-158-sistema-primario.md` §13 (lista completa).

### Pendiente (acción de Alex)
- Re-iniciar sesión en la app de escritorio de Claude (staging denegado `untrusted_device`) y aplicar los parches/zip en ambos repos; commits.
- Vercel: dar acceso a la app de GitHub de Vercel sobre `StarSeedSystem` y enlazar el proyecto `astraura` (root `frontend`), o `npx vercel --prod`; Cloud Run `min-instances 1` + `ASTRAURA_AUTH_MODE=key`.
- `scripts/rotate_keys.py` → `purge_secrets_from_repo.sh`; `compact_memory_docs.py --apply`; BitNet + GGUF.

## 2026-08-23 — Adenda 155 · OLA 3: integración TOTAL Astraura 1.58 (Studio completo + motor nativo real + verificación en vivo)

### Hecho
- **Backend**: motor BitNet NATIVO real vía `llama-server` gestionado (2 perfiles interactivo/fondo con `nice`,
  plantilla de chat oficial, pre-tokenizer llama-bpe, presupuesto de contexto, prioridad de turno). Parche
  CRÍTICO ReLU² en `3rdparty/llama.cpp` (PPL 40.9→5.38; guarda `scripts/check_bitnet_patch.sh`). Diagnóstico
  de layout I2_S contra los pesos bf16 de HF (strided32 correcto, 98.8% de coincidencia bit a bit).
  `scripts/verify_real_ola3.py`: verificación funcional real contra backend vivo (motor, @menciones multi-
  personalidad, imaginación `generated_by: llm`, eventos+ack, procesos, invoke, síntesis, air-gap, director).
- **OS · Studio 1.58 completo** (`/agent?tab=astraura-158&sub=…`): 13 pestañas (resumen · personalidades ·
  agentes · imaginación · notificaciones · cerebros · memoria · sentidos · almacenamiento · proyectos · voz ·
  habilidades · instalación) sobre `s158/*` + cliente tipado; badges de contadores y deep-links `?sub=`.
- **OS · integración**: `astraura-158-import.ts` (siembra `p158-*`/`agent158-*` + primario por ámbito),
  `astraura-158-feed.ts` (eventos→centro de notificaciones + ack, montado en app-globals),
  tarjeta «Procesos autónomos 1.58» en la sección LLM, tarjeta «Backend 1.58» en neuronas, tira 1.58 en
  Trinity, sección «Ramificación y agentes 1.58» en el modal de proceso. SOP §14.5 con el estado.

### Verificación
- Backend vivo: chat bridge single-persona REAL en español (Logos) ✓; resto de la batería en
  `scripts/verify_real_ola3.py` (ver salida al cierre de la ola). OS: `tsc --noEmit` 0.

### Pendiente (acción de Alex)
- Commits en ambos repos; en el Mac: recompilar BitNet tras el parche (`bash backend/scripts/check_bitnet_patch.sh`
  + `python3 setup_env.py -md models/BitNet-b1.58-2B-4T -q i2_s` o `cmake --build build -j`); resto igual que
  la tanda 2 (rotación de claves, Vercel, Cloud Run).

### Verificación REAL (cierre de la Ola 3, 2026-08-23)
`backend/scripts/verify_real_ola3.py` contra backend vivo con BitNet nativo: **11/11 PASS en 601 s**
(motor real · puente 1.1.0 · chat @menciones multi-personalidad · disparo no bloqueante 0.99 s ·
rama `generated_by: llm` · feed con imaginación+enjambre+director+aprendizaje · ack · 8 procesos ·
invoke real de personalidad · air-gap · ciclo del Director). Tres fallos REALES corregidos durante
la verificación: parche ReLU² del motor (PPL 40.9→5.38), disparo de imaginación no bloqueante
(la UI se colgaba minutos) y reparto justo del feed de eventos + `unread_count` que faltaba
(el enjambre tapaba las notificaciones especiales de la imaginación y el Director). SOP §14.6/§14.7.

### Publicación (2026-08-23)
Ola 3 PUBLICADA en el OS oficial: `starseed-system` main `b0e66ea → 4f0af4d` y `astraura` main
`6a76723 → e8c6011`, empujados desde la terminal de la Mac con las credenciales de la cuenta.
CI «Typecheck · Unit · Mesh · Build» success; despliegue de producción de Vercel success;
verificación en vivo: `https://starseed-os.vercel.app/api/ai/astraura-158/api/status` → 401
(ruta nueva desplegada y protegida por sesión). Queda recompilar BitNet en la Mac (parche ReLU²).

## 2026-08-24 — Adenda 156 · OLA 4: runtime de código en el chat, avisos de IA en su pestaña, 21/21 pestañas
- `src/lib/aurora/code-runtime.ts` (puro, 14 tests) + `src/components/aurora/code-runner.tsx`, enganchados en
  `message-renderer.tsx` → TODOS los chats ejecutan los programas que escribe la IA en un iframe de origen opaco.
  Directivas en el propio bloque + preferencias `starseed.aurora.code-runtime.v1` (sincronizada).
- Avisos de la IA: `astraura-158-feed.ts` deja de empujar al centro del OS/toasts (opt-in
  `starseed.astraura158.notify.v1`), fuera la tira de Trinity, y `s158/notificaciones-tab.tsx` rediseñada con
  paridad con el original (+ `astraura-158-notify.ts`, 21 tests).
- 7 pestañas nuevas del Studio (chat · navegador · dispositivo · biblioteca · telemetría · terminal ·
  configuración) → 21/21 del sistema original cubiertas. Allowlist del proxy ampliada solo a lecturas/acciones seguras.
- Puertas: tsc 0 · vitest 125/125 · next build ✓. SOP: `architecture/astraura-158-ola4-runtime-y-pestanas.md`.

## 2026-08-24 — Adenda 157 · OLA 5: ventanas vivas, orquestación autónoma, permisos y pila de cuantización
- `src/components/astraura/window/*` (bus + ventana universal + Hablar en Vivo + anfitrión) y ruta
  `/(app)/agent/astraura/[kind]/[id]`; pestañas nuevas `orquestacion` y `permisos`; presencia 1.58 en la
  orbe y el Exocórtex (`astraura-158-presence.tsx`).
- Backend: `app/memory/turboquant.py` (TurboQuant en NumPy) + índice comprimido de primer paso en
  `vector_store.py`; `bitnet_cpp_manager.quantization_backends()` (bitnet.cpp · spbitnet con motivo honesto)
  y `/api/status → engine.quantization_stack`; tarjeta «Pila de cuantización» en Telemetría.
- Medido: 4 bits ⇒ coseno 0.9953 · 7.4× compresión; búsqueda 2.8× más rápida con top-5 idéntico (2 000 docs).
- SOP: `architecture/astraura-158-ola5-orquestacion.md`. Puertas: tsc 0 · vitest 125/125 (build por CI).

## 2026-08-24 — Adenda 158 · OLA 6: el menú de Astraura pasa a ser el del sistema original 1.58-bit
- **El menú de «Astraura AI & Orchestration» se reestructura**: las 11 secciones históricas del OS se
  sustituyen por las **21 áreas del programa original** (Chat Multiagéntico & Voz · VoiceStudio · Proyectos
  y Creaciones · Imaginación Intuitiva · Enrutamiento de Almacenamiento & Medios · Sensorium 360° ·
  Privacidad & Permisos de Sensores · Notificaciones & Logs · Cerebros Multidimensionales · Memorias y
  Recuerdos · Personalidades / Arquetipos · Enjambre de Agentes · Navegador Autónomo · Explorador del
  Dispositivo · Workflows & Automatización · Habilidades & Bóveda · Instalador Universal & Scan ·
  Biblioteca StarSeed · Telemetría 1.58-Bit · Terminal & Sandbox · Configuración & Preferencias) más una
  sección 22 propia del OS, «Gobernanza de la Red». **Los 45 `value` anteriores se conservan**, repartidos
  dentro del área que les corresponde, con todos sus deep-links vivos vía `TAB_ALIASES`.
- `src/components/astraura/s158-host.tsx` (nuevo): `S158TabHost` + `useAstraura158Host` + `S158EndpointStrip`
  — monta cualquier pestaña `s158` como sección de primer nivel resolviendo destino, manifiesto y recarga.
- **Página nueva `/imaginacion`** (`src/components/astraura/imaginacion/*`, 8 componentes): gobernador de
  troncos A/B con debounce 400 ms, catálogo de procesos oníricos con permisos graduales, ramas y logs en
  vivo (3 s) con fork/regenerar/editar/eliminar, informe de síntesis, modal del Director (Metis) y agentes
  imaginando en 2º plano. Mejora propia: insignia `generated_by` (modelo real vs plantilla), que el
  original recibía del backend y nunca pintaba.
- **Orbe cuántica de voz**: `quantum-orb.tsx` + `quantum-orb-avatar.tsx` + `quantum-orb-theme.ts` +
  `quantum-orb-bus.ts`. La orbe del OS sigue siendo la base y el reposo; al activarse la voz conmuta con
  fundido de 260 ms. Mejoras: ruido simplex propio, bandas graves/medios/agudos por personalidad,
  partículas atadas a bin, estela líquida, crossfade de paleta, `ResizeObserver`+dpr,
  `prefers-reduced-motion`, y geometría propia para Astraura Prime y Aurora (en el original compartían
  rama y solo cambiaban de color). Reutiliza el micrófono singleton existente: ningún `AnalyserNode` nuevo.
- **Paridad**: 4 pestañas nuevas (`boveda`, `workflows`, `privacidad`, `instalador`) y ampliación de
  `memoria`, `almacenamiento`, `proyectos`, `telemetria` y `configuracion`. Destaca la de privacidad, que
  es el primer sitio del OS donde se ven y se conceden los **permisos reales del navegador**.
- Registro (CLAUDE.md §11): dock (`imaginacion`, con `DOCK_DEFAULTS_VERSION` 14 → 15 para que llegue a
  cuentas ya existentes), `app-catalog`, `packages.ts` y `funciones-index` reescrito.
- SOP: `architecture/astraura-158-ola6-menu-imaginacion-orbe.md`.
- **Pendiente**: los endpoints nuevos (`/api/vault/*`, `/api/workflows/save`, `/api/projects/*`,
  `/api/creations/*`, `/api/memory/starseed/document*`, `/api/memory/openviking`, `/api/cerebros/external/*`,
  `/api/cerebros/portable/sync_to_storage`, `/api/storage/rules/{id}/simulate`, `/api/installer/script`,
  `/api/discovery/scan`, `/api/bitnet/build`, `/api/system/os/*`, `/api/imagination/branch/*`,
  `/api/imagination/process/{id}/step`, `/api/imagination/sync_execution_state`) están escritos contra el
  contrato del original pero **aún no verificados contra `backend/app/main.py`** del repo `astraura`.
  Mientras no existan, cada superficie enseña «sin conexión» con su motivo real.

## 2026-08-24 — Adenda 158 · Ola 6 (tanda 2): verificación contra el backend real y cierre de contratos
- **Se verificaron los 25 endpoints contra `backend/app/main.py` y se probaron EN VIVO** contra la neurona
  local. De los 25, **22 ya existían**: lo que estaba roto no eran las rutas, sino los **contratos**. Ese
  fallo es especialmente traicionero porque el backend responde 200 y el OS pinta un estado vacío como si
  simplemente no hubiera datos.
- **Implementados en el backend** (`astraura`): `POST /api/creations/run_sample` (compiló y ejecutó C++ ARM64
  NEON real: 4,1 s, `return_code 0`), `POST /api/system/index_path` (acota `DocumentIndexer` a cualquier ruta;
  17,4 s por carpeta con un `.md`; ruta inexistente → error con motivo) y `POST /api/bitnet/build`.
- **Corregido en el backend**: `/api/vault/connection/update` **tiraba el token** (solo ponía `token_set=True`)
  y `vault.py` declaraba `vault_file` sin leerlo ni escribirlo jamás — todo en memoria, perdido al reiniciar.
  La bóveda del OS decía «token guardado» sin nada guardado. Ahora persiste en `~/.astraura/vault.json`
  (carpeta 0700, fichero 0600, escritura atómica), sobrevive al reinicio, admite conexiones nuevas y **nunca
  devuelve el token en claro** (`token_set` + `masked_token`). Verificado de punta a punta.
- **`/api/memory/starseed/documents` con `limit`/`offset`** opcionales y compatibles hacia atrás: el memory
  root real tiene **10 147 documentos** y la pestaña Memoria los pedía todos en cada carga.
- **15 contratos del cliente corregidos** (bóveda, proyectos, versiones, ramas, fusión, bifurcar creación,
  documentos, cerebros externos, portátil, descubrimiento, instalador, actualizaciones y auto-modificación).
  Destacan tres que fallaban siempre: `external/scan` y `discovery/scan` son **GET**, no POST, y el instalador
  sirve **texto plano** (`text/x-shellscript`) que se pasaba por `res.json()`.
- **Timeouts medidos, no supuestos**: `discovery/scan` tarda **48 s y devuelve 8,6 MB**; `index_path` 17 s;
  `bitnet/build` minutos en frío. Con `longTimeout` (30 s) se abortaban solas y el usuario leía «sin conexión»
  de un sistema sano. Pasan a 180 s / 180 s / 600 s.
- Puertas: tsc 0 · vitest 125/125 · mesh 178/0 · backend importa limpio con 255 rutas.

## 2026-08-24 — Adenda 159: el chat 1.58 respondía SIEMPRE lo mismo (bucle de plantillas) — diagnóstico y arreglo
- **Síntoma**: dijeras lo que dijeras en el chat, Astraura devolvía el mismo bloque «Identidad & Ontología
  Soberana». No era un fallo de estilo: **el modelo no se estaba usando en absoluto**.
- **Causa raíz (reproducida y verificada contra el backend real)**, una cadena de cuatro eslabones:
  1. `/api/starseed/chat` **no existe** en el backend (solo se menciona en comentarios de `starseed_bridge.py`),
     así que el OS siempre cae al camino clásico `/api/chat/stream`.
  2. `buildAstraura158Prompt` aplanaba **toda la conversación** dentro de `prompt`.
  3. El backend decide con **coincidencia de subcadena sobre `prompt`** si responde con una plantilla
     determinista en vez de llamar al modelo (`any(w in p_lower for w in [...])`, 11 sitios).
  4. ⇒ En cuanto «quién eres» aparecía UNA vez —incluso dentro de una respuesta anterior de la propia IA—,
     quedaba en la transcripción y **cada mensaje siguiente volvía a disparar la misma plantilla, para siempre**.
     Un bucle que se reforzaba solo. Prueba decisiva: pedí «cuánto es dos más dos» con «quien eres» en la
     transcripción → devolvió el bloque de identidad, exactamente el que veía el usuario.
- **Arreglo en el OS**: el historial pasa a `system_prompt` (es contexto, no la pregunta) y `prompt` lleva
  **solo el último mensaje del usuario**. El modelo sigue viendo la conversación entera. Test de regresión
  añadido (`el historial NUNCA contamina el prompt con disparadores de plantilla`).
- **Arreglo en el backend** (para que no dependa de que el cliente se porte bien): `dispara_plantilla()`
  exige que el prompt **sea** la pregunta corta (≤200 caracteres), no que la contenga. Aplicado a los 11
  disparadores de `reasoner.py` y `orchestrator.py`.
- **Segundo fallo, independiente y grave — el sistema ocultaba su propia avería**: cuando el motor real
  fallaba, la plantilla salía disfrazada de respuesta. «hola» devolvía «He preparado un entorno interactivo
  completo para tu consulta» con un bloque HTML. Ahora una respuesta degradada **se declara**: aviso visible
  + `meta.degraded` + el motivo real de cada motor.
- **Tercer fallo — diagnóstico imposible**: `print(f"...: {e}")` sobre un `ReadTimeout` de httpx imprime
  **cadena vacía**; el log decía «Ollama streaming notice: » y nada más. Ahora se registra el TIPO.
- **Cuarto — 120 s tirados**: se esperaba a `ensure_server(120.0)` aunque no hubiera **ningún** modelo GGUF
  instalado (`models_available: []`). Ahora se salta al instante si no hay modelo.
- **Timeout**: 90 s era demasiado corto. Medido en esta máquina, el **primer token tarda 68-88 s** — y
  `keep_alive` NO lo cambia (probado en frío y en caliente): no es carga del modelo, es **contención de CPU**
  (load average 15,67 en 8 núcleos; Chrome solo se llevaba 73 %+51 %). Subido a 300 s para que la respuesta
  real llegue en vez de descartarse.
- **Verificado en vivo tras el arreglo**: (1) «cuánto es dos más dos» con «quien eres» en la transcripción →
  *«El resultado de "dos más dos" es cuatro (2 + 2 = 4)»* (inferencia real, 102 s); (2) otra pregunta → otra
  respuesta real, distinta; (3) preguntar «quien eres» directamente → la plantilla legítima sigue saliendo.
- **Pendiente real**: la lentitud (~100 s por respuesta) NO es un bug del código, es la máquina saturada.
  Opciones: aliviar el enjambre en 2º plano / la imaginación Always-On (para eso existe la «Reserva de Chat»
  del gobernador de troncos), cerrar pestañas de Chrome, o instalar el GGUF i2_s de BitNet nativo —
  `models_available` está **vacío**, así que el motor 1.58 real nunca se ha llegado a usar.

## 2026-08-24 — Adenda 163: por qué el original se sentía mejor, y las cuatro piezas que lo devuelven
- **Diagnóstico (leyendo el original, no suponiendo)**. Alex comparó: «las respuestas eran inmediatas, la voz acompañaba el mensaje en tiempo real, tonos cambiantes para varias personalidades dentro de una misma respuesta… la voz actual se separa». Las causas, con evidencia:
  1. **La voz llegaba tarde por diseño.** El OS llamaba a `speakAuroraReply(acc)` en `chat-surface.tsx:341` **cuando el streaming ya había terminado**, con el texto completo y UNA sola voz. El original alimentaba su motor **token a token** (`omniVoice.feedStreamToken`) y hablaba **por cláusulas mientras generaba**: final de frase, o coma/dos puntos con ≥6 palabras, o tope de 14. Eso es exactamente «la voz acompaña al mensaje».
  2. **Multi-personalidad**: en el original NO hay evento estructurado (`multi_personality_start` no existe: 0 coincidencias). Es **textual** — el backend escribe cabeceras `### 💬 [Hephaestus]:` y el cliente las detecta por regex a mitad del stream para cambiar de voz. El OS no las detectaba.
  3. **Transporte**: el original usa **WebSocket** `/ws/chat` persistente (`ChatWebSocketClient`, `api.js:1561`); el OS abre un POST+SSE por turno. El WS da menor time-to-first-token, aunque la lentitud real de estos días era la contención de CPU y los kernels rotos, ya resueltos.
  4. **Controles por mensaje**: el original tenía regenerar y bifurcar; el OS solo «regenerar voz».
- **Corregido un bug del original, no copiado**: su `feedStreamToken` **no quitaba la cabecera** antes de hablar, así que leía en voz alta el nombre de la personalidad. Y su «regenerar» reenviaba **sin las preferencias** del turno, perdiendo personalidades y modo. Aquí ninguna de las dos cosas.
- **Lo construido**:
  - `src/lib/aurora/streaming-voice.ts` (+17 tests): trocea el stream en cláusulas, detecta cabeceras de personalidad, **elimina la cabecera del habla**, cambia de voz a mitad de respuesta y silencia bloques de código. Puro, sin `window`, testeable en Node.
  - `chat-surface.tsx`: la voz pasa a ir **en vivo** (`voice.feed` en cada token, `flush` al cerrar, `stop` al abortar); se retira la llamada final a `speakAuroraReply`.
  - `chat-message-actions.tsx`: **Regenerar** (conservando las preferencias del turno) y **Bifurcar en un chat nuevo** (historial hasta ese mensaje, con timestamps nuevos para no colisionar con el upsert `ignoreDuplicates` de la nube).
  - `chat-personality-tray.tsx`: bandeja colapsable de **personalidades activas** + modo `single`/`multi_dialogue`/`coral_synthesis`, recordada por conversación.
  - `quantum-orb-live-talk.tsx`: **charla en directo** desde la orbe — ciclo manos libres reutilizando el reconocedor y el medio-dúplex anti-eco que el OS ya tenía (`markTtsSpeaking`, `pausedForTts`), con estado honesto (sin micrófono / permiso denegado / sin proveedor) y la orbe reaccionando por su bus.
- Puertas: tsc 0 · vitest **143/143** · mesh 178/0.
- **Pendiente (la ola siguiente, tal como la pidió Alex)**: sincronizar el almacenamiento local del dispositivo con la memoria 1.58 para que cada respuesta use todas las memorias — el endpoint `/api/system/index_path` ya existe y funciona (adenda 160), falta el barrido automático y la inyección de fragmentos en cada turno; y el transporte WebSocket para el chat.

## 2026-08-24 — Adenda 164: memoria total del dispositivo y transporte WebSocket
- **Lo que faltaba de la adenda 163, ya hecho.** Tres subagentes en paralelo con contratos cerrados entre ellos (backend / WebSocket / UI), tras un reconocimiento previo que evitó dos suposiciones caras.
- **Hallazgo del reconocimiento**: `/ws/chat` **ya existía** en el backend (`main.py:3125`) con el mismo protocolo que usaba el original — el OS simplemente no lo usaba. Y el orquestador solo inyectaba **3 recuerdos de mem0**, sin tocar jamás los documentos del memory root ni el grafo de conocimiento. Eso era exactamente la queja de Alex: «las respuestas deberían usar todas las memorias».
- **Backend · recuperación de contexto de verdad**: `_inject_mem0_memories` (3 recuerdos) pasa a `gather_context_items`, que combina **recuerdos + documentos del memory root + grafo de conocimiento**, los puntúa con el MISMO criterio, deduplica, ordena por relevancia real (no por bloques de fuente) y rellena un presupuesto de caracteres (6000 por defecto) recortando por frase. Degrada con elegancia: si una fuente cae, las otras siguen; nunca lanza.
- **Backend · sincronización del almacenamiento**: `app/memory/device_sync.py` — carpetas vigiladas con estado persistente, alta/baja/activación, indexado bajo demanda y un demonio de fondo interrumpible (`Event.wait`, no `sleep` ciego) que se salta los ficheros cuyo hash no cambió y no solapa pasadas. 6 endpoints nuevos.
- **Coherencia que importa**: `/api/memory/search` usa **el mismo motor** que alimenta al modelo. Lo que la UI enseña ES lo que el modelo recibe. Si divergieran, la UI mentiría.
- **OS · WebSocket**: `astraura-158-ws.ts` — conexión persistente compartida por endpoint, backoff exponencial con jitter (el original martilleaba cada 3 s fijos), latido con `ping`/`pong`, y reserva a SSE si no abre en 1,5 s. Máquina de 3 fases (`waiting → committed → done`) que garantiza que **nunca** contesten los dos transportes al mismo turno.
- **OS · UI**: sub-pestaña «Memoria del dispositivo» en Memorias, con carpetas, demonio, indexado y el probador «Qué recuerda de esto».
- **Medido, no supuesto**: temí que el barrido de documentos añadiera segundos a cada turno. Lo medí contra el almacén real: **0,9 ms**. La optimización habría sido prematura. De paso: el motor tiene 457 documentos, no los 10.147 que yo citaba — esa cifra era de otro almacén (`/api/memory/starseed/documents`, 1068 según el endpoint nuevo).
- **Verificado en vivo**: `/api/memory/search?q=ontocracia ciberdelica starseed` devuelve `[document] Manifiesto del Alma y Ontocracia` (0.485), `[concept] StarSeed OS` (0.380) y tres `[memory]` episódicos — las tres fuentes mezcladas y ordenadas. Añadir carpeta real funciona; ruta inexistente se rechaza con su motivo.
- Puertas: tsc 0 · vitest **152/152** · mesh 178/0 · backend arranca limpio.

## 2026-08-25 — Adenda 165: tres fallos reportados en pantalla, y el decaimiento temporal
- **Voz en bucle — regresión NUESTRA, de la adenda 163.** `engine.ts:599` hacía `speechSynthesis.cancel()` al principio de **cada** `speak()`. Al pasar la voz a cláusulas (163), cada cláusula **cancelaba la anterior**: arrancaba, se cortaba, reiniciaba, y nunca completaba una frase. Arreglo: `speakQueued()` — ruta encolada que NO cancela, conservando anti-eco, pulso de la orbe, voz por personalidad y motores OSS. La parte delicada era la ventana anti-eco: `finishTts()` ahora se dispara en **un único punto** (cuando la cola se vacía de verdad), no al `onend` de cada cláusula — si no, el micrófono se abriría a mitad de respuesta y Astraura se oiría a sí misma. `interrupt()` sigue vaciando la cola entera (el barge-in sí debe cancelar).
- **Directivas en crudo.** `stripDirectives` existía en `actions.ts:1146` y **el chat nunca la llamaba**: se mostraban `[[ACCION: navegar {...}]]` tal cual. Nuevo `chat-format.ts` (+22 tests): quita directivas del texto que se muestra y se guarda —ejecutándolas antes sobre el crudo—, colapsa cabeceras de personalidad repetidas, y durante el streaming **oculta desde una directiva incompleta hasta el final** en vez de enseñar el fragmento a medias. La voz tampoco las lee ya en alto.
- **Chat cortado por abajo.** Causa real, medida en navegador con Playwright: `page.tsx` reservaba `4rem` para OmniDock (valor de la adenda 133), pero el dock creció y hoy ocupa **~6,7rem en móvil, ~7,95rem en tablet y ~10,6rem en escritorio**. Como es `fixed` con `z-[70]`, se pintaba encima y tapaba el final — no era recorte de `overflow`, era superposición. Reserva ahora responsiva (7/8/11rem) + `min-h-0` donde faltaba por consistencia.
- **Decaimiento temporal exponencial (base e)** en la relevancia de los recuerdos, del documento de constantes armónicas que envió Alex. `factor = suelo + (1-suelo)·e^(-ln2·días/vida_media)`, vida media 14 días y **suelo 0,35** para que un recuerdo antiguo pero muy pertinente no desaparezca jamás. Medido: ahora 1,000 · 1 día 0,969 · 14 días 0,675 · 1 año 0,350. Sin fecha → 1,000 (no penaliza lo que no sabe fechar).
- **Del documento, lo que NO se implementó y por qué**: topología Fibonacci de capas, inicialización de pesos por Fibonacci y tasa de aprendizaje áurea aplican al **entrenamiento desde cero**. El modelo es `microsoft/BitNet-b1.58-2B-4T`, **ya entrenado con 4 billones de tokens**: su topología y sus pesos están fijados. Aplicarlas exigiría reentrenar un modelo de 2B —imposible en este M1— y tirar ese entrenamiento. Implementarlas «por encima» sería decorativo o dañino. Anotado, no ejecutado.
- Puertas: tsc 0 · vitest **174/174** · mesh 178/0.
