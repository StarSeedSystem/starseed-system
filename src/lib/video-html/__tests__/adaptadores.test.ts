import { describe, it, expect } from "vitest";
import { detectarAdaptadores } from "../adaptadores";
import { plantillaStarSeed } from "../plantilla";

describe("detectarAdaptadores", () => {
  it("should return empty adapters and editable when no adapters present", () => {
    const html = "<div>Hello</div>";
    const result = detectarAdaptadores(html);
    expect(result.usados).toEqual([]);
    expect(result.editableVisualmente).toBe(true);
    expect(result.motivo).toBe("");
  });

  it("should detect CSS adapter", () => {
    const html = `<div><style>@keyframes test { from { opacity: 0; } to { opacity: 1; }}</style></div>`;
    const result = detectarAdaptadores(html);
    expect(result.usados).toContain("css");
    expect(result.editableVisualmente).toBe(true);
  });

  it("should detect WAAPI adapter", () => {
    const html = `<div><script>element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500 });</script></div>`;
    const result = detectarAdaptadores(html);
    expect(result.usados).toContain("waapi");
    expect(result.editableVisualmente).toBe(true);
  });

  it("should detect Anime.js adapter", () => {
    const html = `<div><script>anime({ targets: 'div', translateX: 100 });</script></div>`;
    const result = detectarAdaptadores(html);
    expect(result.usados).toContain("animejs");
    expect(result.editableVisualmente).toBe(true);
  });

  it("should detect Lottie adapter", () => {
    const html = `<div><lottie-player src="animation.json"></lottie-player></div>`;
    const result = detectarAdaptadores(html);
    expect(result.usados).toContain("lottie");
    expect(result.editableVisualmente).toBe(true);
  });

  it("should detect Three.js adapter", () => {
    const html = `<div><script>import * as THREE from 'three'; const scene = new THREE.Scene();</script></div>`;
    const result = detectarAdaptadores(html);
    expect(result.usados).toContain("three");
    expect(result.editableVisualmente).toBe(true);
  });

  it("should detect TypeGPU adapter", () => {
    const html = `<div><script>import { typegpu } from 'typegpu';</script></div>`;
    const result = detectarAdaptadores(html);
    expect(result.usados).toContain("typegpu");
    expect(result.editableVisualmente).toBe(true);
  });

  it("should detect GSAP adapter and set editableVisualmente to false", () => {
    const html = `<div><script>import { gsap } from 'gsap'; gsap.to('.box', { x: 100 });</script></div>`;
    const result = detectarAdaptadores(html);
    expect(result.usados).toContain("gsap");
    expect(result.editableVisualmente).toBe(false);
    expect(result.motivo).toContain("licencia de GSAP Standard");
  });

  it("should detect multiple adapters", () => {
    const html = `
      <div>
        <style>@keyframes test { to { opacity: 1; }}</style>
        <script>element.animate([{ opacity: 0 }], { duration: 500 });</script>
        <script>anime({ translateX: 100 });</script>
        <lottie-player></lottie-player>
        <script>import * as THREE from 'three';</script>
        <script>import { typegpu } from 'typegpu';</script>
        <script>import { gsap } from 'gsap';</script>
      </div>
    `;
    const result = detectarAdaptadores(html);
    expect(result.usados).toEqual(expect.arrayContaining(["css", "waapi", "animejs", "lottie", "three", "typegpu", "gsap"]));
    expect(result.editableVisualmente).toBe(false);
    expect(result.motivo).toContain("licencia de GSAP Standard");
  });

  it("should produce a template without GSAP and detectable as CSS adapter", () => {
    const html = plantillaStarSeed({
      ancho: 1920,
      alto: 1080,
      duracion: 5,
      titulo: "Test Video",
      fondo: "#000000",
      acento: "#FFFFFF"
    });

    // Check that the template does not contain "gsap"
    expect(html).not.toContain("gsap");

    // Check that the adapter detector finds CSS and no GSAP
    const result = detectarAdaptadores(html);
    expect(result.usados).toContain("css");
    expect(result.usados).not.toContain("gsap");
    expect(result.editableVisualmente).toBe(true);
    expect(result.motivo).toBe("");
  });
});