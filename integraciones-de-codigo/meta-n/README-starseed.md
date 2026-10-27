# Meta^n · lo que el enjambre necesita saber sin abrir el repo

[minnesotanlp/meta-n](https://github.com/minnesotanlp/meta-n), **MIT** (`LICENSE` de aquí, sin cambios). Fijado al commit
`b7081843d3c7b0e0f418ca10aaf2ccbff856e7f8` (2026-08-26, sin etiquetas). Leído el 2026-10-27 con un clon de solo
lectura; aquí NO hay código suyo: solo su contrato. Contrato del OS: `architecture/automejora-meta-n.md`.

## Instalar (solo dentro de la imagen `starseed-automejora`)

```bash
git clone https://github.com/minnesotanlp/meta-n.git && cd meta-n && git checkout b7081843d3c7b0e0f418ca10aaf2ccbff856e7f8
pip install --no-cache-dir .        # Python >= 3.11: pydantic, openai, httpx, rich, numpy, pyyaml
```

## Ejecutar (siempre dentro de la caja; ver el contrato §3)

```bash
meta-n --tasks /work/tareas.json --use-archive \
  --base-url http://127.0.0.1:8080/v1 --api-key caja --model <modelo permitido por la pasarela> \
  --max-iterations 6 --patience 2 --parallel 1 --daily-budget-usd 0 \
  --output-dir /work/salida --exp-name noche
```

`meta-n` y `python -m meta_n.main` son lo mismo. `--tasks` usa `LocalExecutor`: ejecuta en «su anfitrión» lo que
escribe el modelo. Por eso todo el proceso va dentro de la caja.

## Formato de las tareas (`--tasks`)

Lista JSON de `{"task_id": str, "description": str, "verification_script": str | null, "metadata": {}}`.
`verification_script` es bash: si sale con 0, la tarea se dio por resuelta.
Ejemplo del repo: `{"task_id": "toy_002", "description": "Compute 6 * 7 and write only the result to /tmp/answer.txt",
"verification_script": "test \"$(cat /tmp/answer.txt | tr -d '\\n')\" = '42'"}`.

## Lo que deja (`<output-dir>/<exp-name>/`)

- `summary.json`, `convergence.json`, `checkpoint.json`.
- `archive/index.json`:
  `{"size", "best_mean_score", "best_candidate_id", "per_task_best": {task_id: {"score", "candidate_id"}},
  "candidates": [{"candidate_id", "parent_id", "iteration", "depth", "mean_score", "pass_at_1", "num_children",
  "temperature_used", "total_tokens", "per_task_scores"}]}`.
- `archive/<candidate_id>/injected_code_d2.json` … `injected_code_dN.json`: la cadena de capas del candidato, cada
  una un `InjectedCode` (abajo); `omega_prompt_dN.txt` y su respuesta al lado; `traces/<task_id>.json` y el
  script que se probó.
- `llm_io/*.jsonl`: cada llamada al modelo.

## `InjectedCode` (meta_n/core/meta_layer.py)

| Campo | Tipo | Qué es |
|---|---|---|
| `pre_process` | `str \| null` | Python que lee `task` (copia de solo lectura), `additional_context` y `outer_context`, y deja en `additional_context` **pautas de estrategia en texto** |
| `code_library` | `dict[str, str]` | funciones de ayuda en Python (nombre → código) |
| `code_library_bash` | `dict[str, str]` | funciones de ayuda en bash |
| `rationale` | `str` | por qué Ω escribió esta capa |
| `source_depth` | `int` | profundidad de la capa |
| `task_solution_map` | `dict[str, str]` | solución congelada por tarea (en StarSeed se ignora: es memorizar, no mejorar) |
| `sandbox_verified_names` | `list[str]` | ayudantes que corrieron en su sandbox `--network none` |

## `Trace` (lo que Ω lee)

`task_id`, `depth`, `script`, `stdout`, `stderr`, `exit_code`, `success`, `score`, `reasoning`, `duration_s`,
`error_summary`, `eval_feedback`, `failure_class` y los contadores de tokens.

## Avisos de su propio código

`meta_n/utils/safety.py`: «Docker sandbox is the primary safety boundary». El `pre_process` y las pruebas de humo se
ejecutan con `exec` en el proceso de meta-n, filtrados solo por una lista de imports prohibidos (`os`, `subprocess`,
`socket`, `urllib`…) y un tope de tiempo. Es una segunda capa, no una caja.
