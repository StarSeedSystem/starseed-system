/**
 * Tests de la capa PURA de notificaciones 1.58 (Ola 4 · Adenda 156):
 * categorización de avisos (`categoryForEvent`), fusión de listas
 * (`mergeS158Feed`) y la preferencia «dónde avisar»
 * (`get/setAstraura158NotifyMode`). Sin DOM (entorno `node` de Vitest):
 * `safeGet`/`safeSet` caen a su overlay en memoria sin `window`, así que el
 * roundtrip de la preferencia se prueba tal cual, sin mocks.
 */
import { describe, expect, it } from "vitest";
import type { Astraura158Event, Astraura158Notification } from "@/lib/astraura/astraura-158-client";
import {
  ASTRAURA_158_NOTIFY_MODE_KEY,
  categoryForEvent,
  countByCategory,
  getAstraura158NotifyMode,
  mergeS158Feed,
  setAstraura158NotifyMode,
  S158_FILTER_CATEGORIES,
  type S158Category,
} from "@/lib/astraura/astraura-158-notify";

describe("categoryForEvent", () => {
  it("nunca lanza: sin datos ⇒ 'general'", () => {
    expect(categoryForEvent(undefined)).toBe("general");
    expect(categoryForEvent(null)).toBe("general");
    expect(categoryForEvent({})).toBe("general");
    expect(categoryForEvent({ title: "", message: "" })).toBe("general");
  });

  it("texto sin ninguna coincidencia ⇒ 'general' (no fuerza una categoría)", () => {
    expect(categoryForEvent({ title: "Mensaje sin tema claro", source: "misc" })).toBe("general");
  });

  it("autorización: fuente/kind en inglés (auth_orchestrator) y texto en español", () => {
    expect(categoryForEvent({ source: "auth_orchestrator" })).toBe("autorizacion");
    expect(categoryForEvent({ kind: "permission_request" })).toBe("autorizacion");
    expect(categoryForEvent({ title: "Solicitud de autorización pendiente" })).toBe("autorizacion");
    expect(categoryForEvent({ message: "Requiere autorización para aplicar el cambio" })).toBe("autorizacion");
  });

  it("imaginación & sueños: tokens en inglés del backend (imagination/swarm/director/dream) y texto en español", () => {
    expect(categoryForEvent({ source: "imagination" })).toBe("imaginacion");
    expect(categoryForEvent({ process: "swarm" })).toBe("imaginacion");
    expect(categoryForEvent({ source: "director" })).toBe("imaginacion");
    expect(categoryForEvent({ kind: "dream" })).toBe("imaginacion");
    expect(categoryForEvent({ title: "Nueva rama de imaginación" })).toBe("imaginacion");
    expect(categoryForEvent({ title: "Ramas registradas" })).toBe("imaginacion"); // plural
    expect(categoryForEvent({ message: "Sueño ejecutado con éxito" })).toBe("imaginacion");
    expect(categoryForEvent({ message: "Nueva propuesta del enjambre" })).toBe("imaginacion");
  });

  it("sensores & clima: sensorium/weather en inglés, texto en español", () => {
    expect(categoryForEvent({ source: "sensorium" })).toBe("sensores");
    expect(categoryForEvent({ kind: "weather_update" })).toBe("sensores");
    expect(categoryForEvent({ title: "Clima actualizado" })).toBe("sensores");
    expect(categoryForEvent({ message: "Nueva ubicación GPS detectada" })).toBe("sensores");
  });

  it("hardware & M1: telemetría de CPU/batería/M1", () => {
    expect(categoryForEvent({ message: "Uso de CPU elevado" })).toBe("hardware");
    expect(categoryForEvent({ title: "Batería al 20%" })).toBe("hardware");
    expect(categoryForEvent({ message: "Telemetría de hardware actualizada" })).toBe("hardware");
    expect(categoryForEvent({ title: "Perfil M1 detectado" })).toBe("hardware");
  });

  it("red & almacenamiento: storage/network en inglés (con guion bajo) y texto en español", () => {
    expect(categoryForEvent({ source: "storage_routing" })).toBe("red");
    expect(categoryForEvent({ kind: "network_scan" })).toBe("red");
    expect(categoryForEvent({ title: "Nuevo dispositivo de almacenamiento detectado" })).toBe("red");
    expect(categoryForEvent({ message: "Sincronización con la malla completada" })).toBe("red");
  });

  it("aprendizaje: source 'learning' en inglés y texto en español", () => {
    expect(categoryForEvent({ source: "learning" })).toBe("aprendizaje");
    expect(categoryForEvent({ source: "background_learner" })).toBe("aprendizaje");
    expect(categoryForEvent({ title: "Concepto aprendido: gobernanza distribuida" })).toBe("aprendizaje");
  });

  it("prioridad: una propuesta de imaginación que además pide autorización cae en autorización", () => {
    expect(categoryForEvent({ title: "Propuesta de imaginación requiere autorización" })).toBe("autorizacion");
  });

  it("toma cualquier señal disponible: kind, source, process, category o el texto", () => {
    expect(categoryForEvent({ category: "learning" })).toBe("aprendizaje");
    expect(categoryForEvent({ process: "imagination_cycle" })).toBe("imaginacion");
  });

  it("las categorías de las pastillas de filtro cubren exactamente lo que puede devolver la heurística (salvo 'general')", () => {
    const all: S158Category[] = ["autorizacion", "imaginacion", "sensores", "hardware", "red", "aprendizaje"];
    expect(S158_FILTER_CATEGORIES.slice().sort()).toEqual(all.slice().sort());
  });
});

describe("countByCategory", () => {
  it("cuenta por categoría e inicializa las ausentes en 0", () => {
    const items: { category: S158Category }[] = [
      { category: "autorizacion" }, { category: "autorizacion" }, { category: "red" },
    ];
    const counts = countByCategory(items);
    expect(counts.autorizacion).toBe(2);
    expect(counts.red).toBe(1);
    expect(counts.aprendizaje).toBe(0);
    expect(counts.general).toBe(0);
  });

  it("lista vacía ⇒ todo en 0", () => {
    const counts = countByCategory([]);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });
});

describe("mergeS158Feed", () => {
  const event: Astraura158Event = {
    id: "a1", ts: 2_000, title: "Evento A", source: "imagination",
    data: { steps: [{ label: "paso 1", ms: 120 }], generated_by: "llm" },
  };
  const notification: Astraura158Notification = { id: "n1", title: "Notif B", timestamp: 1, category: "sensorium" };

  it("fusiona eventos y notificaciones, ordenados por fecha descendente", () => {
    const merged = mergeS158Feed([event], [notification]);
    expect(merged.map((i) => i.id)).toEqual(["a1", "n1"]);
    expect(merged[1].category).toBe("sensores");
  });

  it("mismo id en ambas fuentes ⇒ sin duplicados, gana el evento (forma más rica)", () => {
    const dup: Astraura158Notification = { id: "a1", title: "Duplicado clásico", timestamp: 1 };
    const merged = mergeS158Feed([event], [dup]);
    expect(merged).toHaveLength(1);
    expect(merged[0].origin).toBe("event");
    expect(merged[0].title).toBe("Evento A");
  });

  it("lee los pasos de `data.steps` con sus tiempos en ms", () => {
    const merged = mergeS158Feed([event], []);
    expect(merged[0].steps).toEqual([{ label: "paso 1", ms: 120, status: "" }]);
  });

  it("lee `generated_by` (modelo real vs plantilla)", () => {
    const merged = mergeS158Feed([event], []);
    expect(merged[0].generatedBy).toBe("llm");
  });

  it("entradas sin id se ignoran (nunca lanza)", () => {
    const noId = { title: "sin id" } as unknown as Astraura158Notification;
    expect(() => mergeS158Feed([], [noId])).not.toThrow();
    expect(mergeS158Feed([], [noId])).toHaveLength(0);
  });
});

describe("Astraura158NotifyMode", () => {
  it("por defecto (sin storage) es 'tab': el sondeo no avisa fuera de su pestaña", () => {
    expect(getAstraura158NotifyMode()).toBe("tab");
  });

  it("set/get: persiste 'tab+os' y puede volver a 'tab'", () => {
    setAstraura158NotifyMode("tab+os");
    expect(getAstraura158NotifyMode()).toBe("tab+os");
    setAstraura158NotifyMode("tab");
    expect(getAstraura158NotifyMode()).toBe("tab");
  });

  it("la clave de persistencia es la documentada en el SOP", () => {
    expect(ASTRAURA_158_NOTIFY_MODE_KEY).toBe("starseed.astraura158.notify.v1");
  });
});
