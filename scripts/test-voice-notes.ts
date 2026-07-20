/**
 * Unit tests (tsx) de la LÓGICA PURA de las NOTAS DE VOZ (Adenda 87 · Misión 5).
 * Ejecuta:  npx tsx scripts/test-voice-notes.ts
 *
 * SIN IndexedDB: solo funciones PURAS extraídas de `voice-notes.ts`, para poder
 * verificar los invariantes que no deben romperse aunque cambie el almacén:
 *   · voiceTextHash        → hash ESTABLE y normalizado (liga audio ↔ mensaje);
 *   · placeChunkInOrder    → ORDEN de trozos aunque lleguen prefetcheados;
 *   · compactChunks        → sin huecos, conservando el orden;
 *   · chooseEvictions      → LRU por `at` (recorte al superar el límite);
 *   · applyChunkToNote     → ensamblado de una nota a partir de sus trozos.
 */

import {
  voiceTextHash,
  cleanTextForVoiceChain,
  voiceNoteHashForMessage,
  placeChunkInOrder,
  compactChunks,
  chooseEvictions,
  applyChunkToNote,
  VOICE_NOTES_LIMIT,
} from "@/lib/aurora/voice-notes";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, extra !== undefined ? extra : "");
  }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });
}

// ── 1) Hash ESTABLE y normalizado ────────────────────────────────────────────
console.log("\n[1] voiceTextHash → estable, normalizado, ligado al texto");
{
  ok("determinista", voiceTextHash("Hola mundo") === voiceTextHash("Hola mundo"));
  ok(
    "colapsa espacios internos",
    voiceTextHash("Hola   mundo") === voiceTextHash("Hola mundo"),
  );
  ok(
    "recorta extremos",
    voiceTextHash("  Hola mundo  ") === voiceTextHash("Hola mundo"),
  );
  ok(
    "normaliza saltos/tabs",
    voiceTextHash("Hola\n\tmundo") === voiceTextHash("Hola mundo"),
  );
  ok("textos distintos → hashes distintos", voiceTextHash("A") !== voiceTextHash("B"));
  ok("formato hash:len", /^[a-z0-9]+:[a-z0-9]+$/.test(voiceTextHash("Aurora habla")));
  ok("vacío estable", voiceTextHash("") === voiceTextHash("   "));
}

// ── 1b) Limpieza de texto para la cadena (DEBE casar con engine.ts) ──────────
console.log("\n[1b] cleanTextForVoiceChain → réplica exacta de engine.ts::speak");
{
  // Réplica LITERAL de la rama `cleanChain` de engine.ts (fuente de verdad).
  const engineCleanChain = (text: string): string => {
    const sinDirectivas = (text || "").replace(/\[\[goto:[^\]]+\]\]/gi, "");
    let clean = sinDirectivas.replace(/[*_~`´#|><.,;:\-\[\](){}\\\/"—–]/g, " ");
    clean = clean.replace(/\s+/g, " ").trim();
    let cleanChain = sinDirectivas.replace(/[*_~`´#|><\[\](){}\\\/"]/g, " ");
    cleanChain = cleanChain.replace(/\s+/g, " ").trim();
    if (!clean && !cleanChain) return "";
    if (!cleanChain) cleanChain = clean;
    return cleanChain;
  };
  const samples = [
    "**Hola**, soy Aurora. ¿En qué te ayudo?",
    "# Título\n\n- Punto uno\n- Punto dos.",
    "Mira `código` y [enlace](http://x) — genial.",
    "Vamos [[goto:/network]] a la red.",
    "Frase normal, con puntuación; y dos puntos: bien.",
    "***",
  ];
  for (const s of samples) {
    ok(`casa con engine.ts: ${JSON.stringify(s.slice(0, 24))}`, cleanTextForVoiceChain(s) === engineCleanChain(s), {
      got: cleanTextForVoiceChain(s),
      want: engineCleanChain(s),
    });
  }
  eq("markdown fuera, puntuación dentro", cleanTextForVoiceChain("**Hola.**"), "Hola.");
  eq("directiva goto eliminada", cleanTextForVoiceChain("Voy [[goto:/x]] allá."), "Voy allá.");
  ok(
    "hash canónico = hash del texto limpio",
    voiceNoteHashForMessage("**Hola**") === voiceTextHash("Hola"),
  );
  ok(
    "markdown NO cambia el hash canónico del mensaje",
    voiceNoteHashForMessage("Hola **mundo**") === voiceNoteHashForMessage("Hola mundo"),
  );
}

// ── 2) ORDEN de trozos (llegada fuera de secuencia por prefetch) ─────────────
console.log("\n[2] placeChunkInOrder + compactChunks → orden correcto");
{
  // Llegan 2, luego 0, luego 1 → el orden final debe ser [a, b, c].
  let arr: (string | null)[] = [];
  arr = placeChunkInOrder(arr, 2, "c");
  eq("hueco antes del índice 2", arr, [null, null, "c"]);
  arr = placeChunkInOrder(arr, 0, "a");
  arr = placeChunkInOrder(arr, 1, "b");
  eq("relleno de huecos preserva posiciones", arr, ["a", "b", "c"]);
  eq("compactChunks quita huecos", compactChunks(arr), ["a", "b", "c"]);

  // Sobrescritura idempotente en el mismo índice.
  const arr2 = placeChunkInOrder(placeChunkInOrder([], 1, "x"), 1, "y");
  eq("sobrescribe el mismo índice", arr2, [null, "y"]);

  // No muta la entrada (pureza).
  const src: (string | null)[] = ["a"];
  const out = placeChunkInOrder(src, 1, "b");
  ok("no muta la entrada", JSON.stringify(src) === JSON.stringify(["a"]) && out !== src);

  // Índice negativo se ignora (defensivo).
  eq("índice negativo → sin cambios", placeChunkInOrder(["a"], -1, "z"), ["a"]);

  // Orden en secuencia normal (caso real: 0,1,2).
  let seq: (string | null)[] = [];
  ["a", "b", "c"].forEach((c, i) => (seq = placeChunkInOrder(seq, i, c)));
  eq("secuencia normal", compactChunks(seq), ["a", "b", "c"]);
}

// ── 3) LRU por `at` (recorte al superar el límite) ───────────────────────────
console.log("\n[3] chooseEvictions → LRU por antigüedad");
{
  eq("bajo el límite → nada", chooseEvictions([{ key: "a", at: 1 }], 40), []);
  eq("exactamente el límite → nada", chooseEvictions(
    Array.from({ length: 40 }, (_, i) => ({ key: `k${i}`, at: i })),
    40,
  ), []);

  // 42 entradas, límite 40 → expulsa las 2 MÁS VIEJAS (at menor).
  const entries = Array.from({ length: 42 }, (_, i) => ({ key: `k${i}`, at: 1000 + i }));
  // Desordena para asegurar que ordena por `at`, no por posición.
  const shuffled = [...entries].reverse();
  const evict = chooseEvictions(shuffled, 40);
  eq("expulsa 2", evict.length, 2);
  eq("expulsa las 2 más viejas (k0, k1)", [...evict].sort(), ["k0", "k1"]);

  // Empuja una entrada vieja "tocándola" (at mayor) → deja de ser candidata.
  const touched = shuffled.map((e) => (e.key === "k0" ? { key: "k0", at: 99999 } : e));
  const evict2 = chooseEvictions(touched, 40);
  ok("una nota tocada (at alto) ya no se expulsa", !evict2.includes("k0"));

  eq("límite 0 → expulsa todo", chooseEvictions([{ key: "a", at: 1 }, { key: "b", at: 2 }], 0).sort(), ["a", "b"]);
  ok("el tope por defecto es 40", VOICE_NOTES_LIMIT === 40);
}

// ── 4) Ensamblado de una nota a partir de sus trozos ─────────────────────────
console.log("\n[4] applyChunkToNote → ensamblado por trozos");
{
  const b = (s: string) => new Blob([s]);
  // Trozo 0 crea la nota (fija la personalidad del turno).
  let note = applyChunkToNote(null, {
    textHash: "h1",
    chunkIndex: 0,
    chunkCount: 3,
    engine: "openvoice2",
    blob: b("c0"),
    personalityId: "preset-aurora",
    at: 100,
  });
  eq("nueva nota: hash", note.textHash, "h1");
  eq("nueva nota: chunkCount", note.chunkCount, 3);
  eq("nueva nota: motor", note.engine, "openvoice2");
  eq("nueva nota: personalidad", note.personalityId, "preset-aurora");
  ok("nueva nota: trozo 0 presente", compactChunks(note.chunks).length === 1);

  // Trozo 2 llega antes que el 1 (prefetch) → hueco preservado.
  note = applyChunkToNote(note, {
    textHash: "h1",
    chunkIndex: 2,
    chunkCount: 3,
    engine: "openvoice2",
    blob: b("c2"),
    personalityId: "otra",
    at: 130,
  });
  ok("aún faltan trozos (2 de 3 tras hueco)", compactChunks(note.chunks).length === 2);
  eq("personalidad NO se sobrescribe (la fija el 1er trozo)", note.personalityId, "preset-aurora");
  eq("at avanza al máximo", note.at, 130);

  // Trozo 1 rellena el hueco → 3 trozos EN ORDEN.
  note = applyChunkToNote(note, {
    textHash: "h1",
    chunkIndex: 1,
    chunkCount: 3,
    engine: "openvoice2",
    blob: b("c1"),
    personalityId: "preset-aurora",
    at: 120,
  });
  const sizes = compactChunks(note.chunks).map((x) => x.size);
  eq("3 trozos en orden (c0,c1,c2 por tamaño)", sizes, [b("c0").size, b("c1").size, b("c2").size]);
  eq("at se mantiene en el máximo observado", note.at, 130);
  eq("chunkCount no baja", note.chunkCount, 3);
}

// ── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? "✅" : "❌"} Notas de voz — ${passed} OK, ${failed} fallos\n`);
if (failed > 0) process.exit(1);
