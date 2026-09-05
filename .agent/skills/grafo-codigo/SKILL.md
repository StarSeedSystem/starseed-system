---
name: grafo-codigo
description: Consultar el grafo del código de StarSeed OS (GitNexus) antes de tocar nada — quién llama a qué, qué se rompe si cambias un símbolo, qué flujos toca tu diff. Úsalo en vez de grep a ciegas.
---

# Grafo del código (GitNexus)

El repositorio tiene un grafo de conocimiento del código en `.gitnexus/` (ignorado por git):
símbolos, llamadas, importaciones, herencia, comunidades funcionales y flujos de ejecución
(70.844 nodos y 177.834 aristas el 2026-09-05). Lo construye `gitnexus analyze .` y lo consulta
la CLI `gitnexus` en 1-2 segundos, sin gastar tokens ni claves. Fuente:
github.com/abhigyanpatwari/GitNexus (PolyForm Noncommercial: uso interno de la fundación; no se
empaqueta en el producto).

## Cuándo

- **Antes de editar**: `gitnexus context <símbolo>` para ver quién lo llama y a quién llama.
- **Antes de cambiar una firma o borrar algo**: `gitnexus impact <símbolo>` (radio de impacto y riesgo).
- **Para encontrar dónde vive algo**: `gitnexus query "<concepto>" -l 3` (acepta español; devuelve
  definiciones con archivo:líneas y flujos).
- **Antes de terminar tu tarea**: `gitnexus detect-changes` (qué símbolos y flujos toca tu diff).
- **Entre dos símbolos**: `gitnexus trace <origen> <destino>`.

## Cómo

```bash
gitnexus context reasignarTarea            # 360°: llamadores, llamados, flujos
gitnexus impact reasignarTarea             # qué se rompe si lo cambias (riesgo LOW…CRITICAL)
gitnexus query "voz local por frases" -l 3 # definiciones + flujos ligados al concepto
gitnexus detect-changes                    # tu diff sin commit → símbolos y flujos afectados
gitnexus detect-changes -s compare -b main # una rama entera contra main
```

La salida es JSON (query/context/impact) o texto (detect-changes). Si `gitnexus` no está o no hay
`.gitnexus/`, sigue con grep: el grafo es una ayuda, no un requisito.

## Reglas

- No ejecutes `gitnexus analyze` en la Mac de 8 GB mientras corre el servidor de desarrollo
  (2,2 GB de pico): se indexa en la nube y el índice se copia.
- No configures su servidor MCP en opencode (`gitnexus setup`): 17 herramientas en cada turno
  cuestan más contexto de lo que ahorran. La CLI basta.
- Una consulta vacía **no** significa «no se usa»: puede ser un límite del grafo (lo dice el propio
  `analyze` al indexar). Confirma con grep antes de borrar.
