# 🌌 StarSeed OS + Hermes Agent — Plan de Implementación Completo

> Versión 1.0.0 | 2026-05-26
> Archivos generados en `hermes-integration/`

---

## 📋 Resumen de Archivos Generados

```
hermes-integration/
├── ARQUITECTURA.md           ← Documento maestro (arquitectura completa)
├── 01-types.ts               ← Tipos compartidos (skills, tools, memoria, agentes, MCP)
├── 02-layers.ts              ← Configuración de capas del grafo + frecuencias armónicas
├── 03-unified-store.ts       ← Unified Memory Store (IndexedDB + búsqueda semántica)
├── 04-auto-discover.ts       ← AutoDiscover: escanea IAs locales, APIs, skills, configs
├── 05-force-graph-engine.ts  ← Harmonic Force Engine (física 3D para el grafo vivo)
├── 06-ai-detection-wizard.tsx ← UI del asistente de detección (React component)
├── 07-skills-registry.ts     ← Skills Registry (skills nativos + instalados)
├── 08-tools-registry.ts      ← Tools Registry (tools registrables con schema JSON)
└── index.ts                  ← Punto de entrada único (hermes.init() → todo listo)
```

---

## 🚀 Roadmap de Implementación en StarSeed OS

### Fase 1: Integración del Núcleo (Día 1-2)

| Paso | Acción | Archivos a crear/modificar |
|------|--------|---------------------------|
| 1 | Copiar `hermes-integration/` a `src/hermes-integration/` | — |
| 2 | Importar `hermes` en `src/app/(app)/layout.tsx` para init temprano | `layout.tsx` |
| 3 | Importar en `src/app/(app)/network/page.tsx` para el grafo vivo | `network/page.tsx` |
| 4 | Importar en `src/app/(app)/agent/page.tsx` para skills + tools | `agent/page.tsx` |

**En `layout.tsx`:**
```tsx
import { hermes } from '@/hermes-integration';

// En el componente o provider:
useEffect(() => { hermes.init(); }, []);
```

### Fase 2: AI Detection Wizard (Día 2-3)

| Paso | Acción | Archivos |
|------|--------|----------|
| 5 | Crear ruta `/ai-setup` | `src/app/(app)/ai-setup/page.tsx` |
| 6 | Renderizar `AiDetectionWizard` en la ruta | `ai-setup/page.tsx` |
| 7 | Añadir enlace en navegación / settings | `navigation-bar.tsx` |

### Fase 3: Living Graph 3D (Día 3-5)

| Paso | Acción | Archivos |
|------|--------|----------|
| 8 | Reemplazar `HolographicGraph` por `HarmonicGraph` | `network/page.tsx` |
| 9 | Conectar `HarmonicGraph` con `hermes.buildGraph()` | `harmonic-graph.tsx` |
| 10 | Integrar `LayerSelector` en network layout | `network/layout.tsx` |

### Fase 4: Agent Page Expandida (Día 5-7)

| Paso | Acción | Archivos |
|------|--------|----------|
| 11 | Añadir tab "Skills" en `/agent` | `agent/page.tsx` |
| 12 | Añadir tab "Tools" con enable/disable | `agent/page.tsx` |
| 13 | Conectar chat con `skillsRegistry.loadForContext()` | `agent/page.tsx` |

### Fase 5: Settings (Día 7-8)

| Paso | Acción | Archivos |
|------|--------|----------|
| 14 | Añadir "Conexiones IA" tab en settings | `settings/page.tsx` |
| 15 | Añadir "Memoria & Skills" tab | `settings/page.tsx` |
| 16 | Mostrar status de hermes integration | `settings/page.tsx` |

---

## 🔌 Cómo Conectar Cada Sección

### En `/network` (Living Graph)
```tsx
import { hermes } from '@/hermes-integration';
import { HarmonicGraph } from '@/hermes-integration/../components/network/harmonic-graph';
import { LayerSelector } from '@/hermes-integration/../components/network/layer-selector';

function NetworkPage() {
  const [layer, setLayer] = useState<MemoryLayer>('all');
  
  return (
    <>
      <LayerSelector activeLayer={layer} onLayerChange={setLayer} />
      <HarmonicGraph layer={layer} />
    </>
  );
}
```

### En `/agent` (Skills + Tools)
```tsx
import { skillsRegistry, toolsRegistry } from '@/hermes-integration';

// En el componente:
useEffect(() => {
  skillsRegistry.init().then(() => {
    const relevant = skillsRegistry.loadForContext(currentContext);
    // Inyectar en system prompt
  });
}, [currentContext]);
```

### En `/ai-setup` (Detection Wizard)
```tsx
import { AiDetectionWizard } from '@/hermes-integration/06-ai-detection-wizard';

export default function AiSetupPage() {
  return <AiDetectionWizard />;
}
```

---

## 🧩 Providers Gratuitos Recomendados para Añadir

Estos proveedores NO requieren API key para funcionar (free tier público):

| Provider | Free Tier | Modelos | Sin API Key |
|----------|-----------|---------|-------------|
| DeepSeek | Sí, rate-limited | `deepseek-chat`, `deepseek-reasoner` | ✅ Sí |
| Groq | Sí, rate-limited | `llama3-70b`, `mixtral-8x7b` | ❌ Requiere key |
| OpenRouter | Algunos gratis | `deepseek/deepseek-v4-flash:free` | ❌ Requiere key |
| Ollama (local) | Siempre gratis | Cualquier modelo local | ✅ No necesita |

Para añadirlos: crear `src/ai/providers/deepseek.ts` y registrarlo en `providers/index.ts`.

---

## 📊 Indicadores de Progreso

- [ ] **Paso 1**: `hermes init()` corre sin errores en layout
- [ ] **Paso 2**: `AiDetectionWizard` detecta IAs locales y APIs
- [ ] **Paso 3**: El grafo vivo en `/network` muestra nodos reales de memoria
- [ ] **Paso 4**: Skills se cargan automáticamente al contexto del agente
- [ ] **Paso 5**: Tools se pueden habilitar/deshabilitar desde settings
- [ ] **Paso 6**: Seleccionar un nodo en el grafo ilumina sus conexiones
- [ ] **Paso 7**: Las capas filtran correctamente tipos de datos en el grafo

---

## 🎨 Frecuencias Armónicas del Grafo

```
432 Hz — Esfera    — Memorias (Unidad)
528 Hz — Octaedro — Skills (Transformación)  
639 Hz — Cubo     — Tools (Conexión)
741 Hz — Tetraedro — Agentes (Expresión)
852 Hz — Icosaedro — MCP/Modelos/APIs (Expansión)
963 Hz — Dodecaedro — Proveedores (Trascendencia)
```