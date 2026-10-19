interface HabilidadIngenieria {
  id: string;
  nombre: string;
  cuando: string;
  tarjeta: string;
  resumen: string;
  rutaCompleta: string;
  licencia: string;
  autor: string;
}

export function getHabilidadesIngenieria(): HabilidadIngenieria[] {
  return [
     {
       id: "tdd",
       nombre: "Desarrollo Dirigido por Pruebas",
       cuando: "Utilizar cuando el usuario quiere construir características o corregir errores siguiendo un enfoque test-first, menciona 'rojo-verde-refactorizar', o quiere pruebas de integración.",
       tarjeta: "TDD es el ciclo rojo → verde que produce tests valiosos mediante: escribir tests que especifican comportamiento público, probar solo en seams acordados, evitar acoplamiento a implementación y trabajar en slices verticales (test → implementación → repetir).",
       resumen: "El Desarrollo Dirigido por Pruebas (TDD) es un ciclo rojo → verde que enfatiza escribir tests antes que la implementación. Un buen test verifica comportamiento a través de interfaces públicas, no detalles internos, y sobrevive a refactors. Los tests deben vivir en seams (límites públicos acordados) y nunca en internos. Se deben evitar anti-patrones como tests acoplados a implementación, tautológicos o slicing horizontal. El ciclo sigue reglas: escribir test fallido primero, luego solo suficiente código para pasar, un slice a la vez, y guardar el refactoreo para la etapa de revisión.",
       rutaCompleta: "vendor/habilidades/mattpocock-skills/engineering/tdd/SKILL.md",
       licencia: "MIT",
       autor: "Matt Pocock"
     },
     {
       id: "diagnosing-bugs",
       nombre: "Diagnóstico de Errores",
       cuando: "Utilizar cuando el usuario dice 'diagnosticar'/ 'depurar esto', o informa de algo roto/que lanza excepciones/que falla/que es lento.",
       tarjeta: "Bucle de diagnóstico para errores difíciles y regresiones de rendimiento: construir un bucle de retroalimentación ajustado, reproducir y minimizar, hipotetizar, instrumentar, corregir con prueba de regresión y limpiar. Énfasis en crear un bucle de señal apretada que pueda atrapar el bug.",
       resumen: "El diagnóstico de errores sigue seis fases: 1) Construir un bucle de retroalimentación ajustado (pas/fail señal apretada) que pueda reproducir el bug; 2) Reproducir y minimizar el bug hasta el escenario más pequeño que aún falle; 3) Generar 3-5 hipótesis falsificables antes de probar; 4) Instrumentar sondas que mapeen a predicciones específicas; 5) Escribir prueba de regresión antes del fix en un seam correcto; 6) Limpiar: eliminar instrumentación, verificar que el bug original no reproduzca y que la prueba de regresión pase. Énfasis en no saltar fases sin justificación y en usar el bucle como producto para apretarlo.",
       rutaCompleta: "vendor/habilidades/mattpocock-skills/engineering/diagnosing-bugs/SKILL.md",
       licencia: "MIT",
       autor: "Matt Pocock"
     },
     {
       id: "codebase-design",
       nombre: "Diseño de Base de Código",
       cuando: "Utilizar cuando el usuario quiere diseñar o mejorar la interfaz de un módulo, encontrar oportunidades de profundización, decidir dónde va un seam, hacer el código más testeable o navegable por IA, o cuando otra habilidad necesita el vocabulario de módulo profundo.",
       tarjeta: "Diseña módulos profundos: mucha conducta detrás de una interfaz pequeña en un seam limpio. Usa términos exactos (módulo, interfaz, implementación, profundidad, seam, adapter, leverage, localidad). Principios: profundidad es propiedad de la interfaz, prueba de eliminación, superficie de prueba es la interfaz, un adapter significa seam hipotético, dos adapters significa seam real.",
       resumen: "El diseño de base de código enseña a crear módulos profundos (mucho comportamiento detrás de pequeña interfaz) para lograr leverage para llamadores y localidad para mantenedores. Define términos exactamente: módulo (cualquier cosa con interfaz e implementación), interfaz (todo lo que el llamador debe saber), implementación (código dentro), profundidad (comportamiento por unidad de interfaz), seam (ubicación de la interfaz), adapter (concreto que satisface la interfaz en un seam), leverage (capacidad por unidad de interfaz aprendida), localidad (conocimiento concentrado). Principios: profundidad en interfaz no implementación, prueba de eliminación, interfaz como superficie de prueba, un adapter indica seam hipotético, dos adapters indican seam real. Incluye guía para testeabilidad: aceptar dependencias, retornar resultados, superficie mínima.",
       rutaCompleta: "vendor/habilidades/mattpocock-skills/engineering/codebase-design/SKILL.md",
       licencia: "MIT",
       autor: "Matt Pocock"
     },
     {
       id: "domain-modeling",
       nombre: "Modelado de Dominio",
       cuando: "Utilizar cuando se discute la terminología de la base de código, se escribe o edita un GLOSSARY.md, o se graba o edita un ADR.",
       tarjeta: "Modelado activo de dominio: desafiar términos, inventar escenarios edge-case, escribir glosario y decisiones al cristalizarse. Durante la sesión: desafiar contra glosario, afianzar lenguaje vago, discutir escenarios concretos, cruzar referencia con código, actualizar glosario inline, ofrecer ADRs escasos (solo si son difíciles de revertir, sorprendentes y fruto de verdadero compromiso).",
       resumen: "El modelado de dominio es una disciplina activa para construir y afilar el modelo de dominio del proyecto mientras se diseña. Se desafía la terminología existente cuando surge un conflicto, se propone un término preciso para lenguaje vago, se discuten escenarios concretos para explorar límites, se verifica el código contra lo dicho, se actualiza el glosario inline al resolverse un término, y se ofrecen ADRs escasos solo cuando el cambio es difícil de revertir, sorprendente sin contexto y fruto de un verdadero compromiso comercial. El glosario debe estar libre de detalles de implementación.",
       rutaCompleta: "vendor/habilidades/mattpocock-skills/engineering/domain-modeling/SKILL.md",
       licencia: "MIT",
       autor: "Matt Pocock"
     },
     {
       id: "code-review",
       nombre: "Revisión de Código",
       cuando: "Utilizar cuando el usuario quiere revisar una rama, un PR, cambios en progreso, o pide 'revisar desde X'.",
       tarjeta: "Revisión de cambios desde un punto fijo en dos ejes: Estándares (¿el código sigue los estándares documentados?) y Especificación (¿el código coincide con lo solicitado en el issue/espec?). Ejecuta ambas revisiones en sub-agentes en paralelo y reporta lado a lado. Incluye línea base de olores de código y permite estándares documentados que overriden la línea base.",
       resumen: "La habilidad de revisión de código analiza los cambios desde un punto fijo (commit, rama, tag, merge-base) en dos ejes independientes: Estándares (cumplimiento de estándares documentados y olores de código de Fowler) y Especificación (coincidencia con el issue/espec de origen). Cada eje ejecuta sub-agentes en paralelo que no contaminan el contexto del otro, luego se agregan los reportes bajo encabezados separados. El proceso incluye: fijar el punto, identificar fuente de especificación y estándares, generar reportes por eje (violaciones de estándares documentados y olores de código como juicios), y presentar hallazgos por eje sin mezclarlos, terminando con un resumen de totales y peor hallazgo por eje.",
       rutaCompleta: "vendor/habilidades/mattpocock-skills/engineering/code-review/SKILL.md",
       licencia: "MIT",
       autor: "Matt Pocock"
     }
   ];
}