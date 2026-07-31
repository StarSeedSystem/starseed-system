# Integraciones y fuentes recomendadas (Adenda 110)

Registro curado y vetado de las **mejores opciones open-source / gratuitas** para CADA servicio de
todos los sistemas del OS, con un recomendador que sugiere automáticamente la mejor opción por
servicio según preferencias (soberanía de licencia · ejecución local). Extiende el recomendador de
modelos de la Adenda 109 (que cubría IA/voz por dispositivo) a **todos** los subsistemas.

## Cómo se construyó
Investigación **multi-agente** (8 subagentes en paralelo, búsqueda web, estado 2026), uno por área:
IA/LLM, voz (TTS/STT), federación/P2P/malla, local-first/sync/realtime, identidad/auth/cripto,
datos (almacenamiento/búsqueda/vector), gobernanza/comunidad/confianza, y medios/mapas/analítica.
Cada agente vetó por licencia, madurez y seguridad. La síntesis se curó a mano en el registro.

## Piezas
- `src/lib/integrations/integration-registry.ts` (NUEVO, puro): tipos + `INTEGRATIONS` (>60 opciones)
  con `id, name, category, purpose, license, licenseClass, access, maturity, security, url, why,
  top?, usedInStarSeed?, caveat?`. `CATEGORIES` (34 servicios) agrupadas en 7 `OS_SYSTEMS` (IA, voz,
  red, datos, identidad, gobernanza, medios). Helpers: `integrationsByCategory`, `topFor`,
  `isDirectlyIntegrable`, `categoriesForSystem`. `REGISTRY_REVIEWED` marca la fecha de revisión.
- `src/lib/integrations/integration-recommend.ts` (NUEVO, puro): `pickForCategory(cat, prefs)`,
  `recommendBySystem`, `recommendAll`, `summarizeRegistry`. Puntúa por `top`, madurez,
  `usedInStarSeed` y las preferencias `preferPermissive` (evita AGPL/no-comercial en el pick) y
  `preferLocal` (prioriza local/navegador). Deja `note` cuando desvía del top por preferencia.
- `src/components/integrations/integration-sources-panel.tsx` (NUEVO): panel con resumen (opciones,
  servicios, % de licencia integrable, ya-en-StarSeed), filtros (solo integrables · preferir local),
  buscador, y por cada sistema del OS sus servicios con la opción **recomendada** + alternativas
  (licencia clasificada, acceso, madurez, seguridad, enlace, por qué, advertencias). Montado como
  pestaña **«Integraciones»** en `/agent` (Infraestructura). Es pestaña de app ya registrada → sin
  migración de dock.

## Criterio de licencia (soberanía)
`licenseClass` clasifica cada opción: `permissive`/`public-domain` (integrable directamente en el
código del OS), `copyleft` (GPL/LGPL — herramienta/servicio aparte), `network-copyleft` (AGPL/EUPL —
obliga a publicar fuente a los usuarios; se integra como **servicio federado aparte**, no enlazado),
`non-commercial` (pesos/uso no comerciales — evitar en producción), `proprietary-free` (servicio con
capa gratis), `open-data`. El filtro «solo licencias integrables» reordena a opciones permisivas.

## Advertencias vetadas (ejemplos)
- **XTTS-v2 (Coqui)**: pesos CPML **no comerciales** → usar Chatterbox/OpenVoice v2 (MIT).
- **FLUX.1 [dev]**: pesos no comerciales → usar FLUX.1 [schnell] (Apache-2.0).
- **MinIO CE**: en modo mantenimiento → preferir Garage/SeaweedFS.
- **Reticulum**: relicenciada a custom no-OSI → fork comunitario Reticulum_CE.
- **Decidim/Consul/Polis/Loomio/Belenios/Bonfire**: AGPL → integrar como servicio federado aparte.

## Refresco (fuentes actualizadas)
El registro lleva `REGISTRY_REVIEWED`. Para **actualizarlo** se re-ejecuta la investigación
multi-agente (mismo prompt por área) y se re-curan las entradas cambiadas. Mejora futura: refresco
semi-automático (fetch de awesome-lists / GitHub trending por categoría) con revisión humana, y un
aviso en la ventana de actualizaciones cuando aparezcan fuentes nuevas relevantes (liga con el
roadmap de la Adenda 109, ítem 1: ventana unificada de inicio/actualizaciones).

## Verificación
`scripts/test-integration-registry.ts` (29/29): sin ids duplicados, categorías válidas, ≤1 top por
categoría, URLs https, campos presentes, 7 sistemas, clasificación de licencia, recomendador por
defecto respeta el top, `preferPermissive` desvía de AGPL a permisiva con nota, `preferLocal`
prioriza local, resumen coherente.

## Roadmap restante (del mega-encargo)
Sigue pendiente, en olas siguientes: ventana unificada de inicio/actualizaciones (Astraura+OmniVoice),
coherencia de voz/personalidad al cambiar de modelo + presets de voz + idioma por chat, descarga de
modelos locales en segundo plano + modelos propios por API/MCP, gestión completa por neurona, y los 4
ítems de seguridad del horizonte de la Adenda 108 (revocación por autoridad de cuenta, emisión/
renovación de tokens, reloj lógico, descubrimiento de pares de confianza).

*Relacionado: 109 (capacidades + recomendador de modelos), `astraura-inteligencia.md`,
`astraura-mesh-meshtastic.md`, `servidor-propio-protocolo.md`.*
