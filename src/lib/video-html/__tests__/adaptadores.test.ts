import { describe, it, expect } from "vitest";
import { detectarAdaptadores } from "../adaptadores";

describe("detectarAdaptadores", () => {
  it("should detect CSS animations", () => {
    const html = `<div style="animation: test 1s;"></div>`;
    const result = detectarAdaptadores(html);
    expect(result.usados).toContain('css');
    expect(result.editableVisualmente).toBe(true);
    expect(result.motivo).toBe('');
  });

  it("should detect GSAP and mark as not editable", () => {
    const html = `<script>gsap.to('.box', { x: 100 });</script>`;
    const result = detectarAdaptadores(html);
    expect(result.usados).toContain('gsap');
    expect(result.editableVisualmente).toBe(false);
    expect(result.motivo).toContain('GSAP detectado');
  });

  it("should detect multiple adapters", () => {
    const html = `
      <style>@keyframes test { to { opacity: 0; } }</style>
      <script>
        anime({ targets: '.box', translateX: 100 });
        Lottie.loadAnimation({ container: document.getElementById('lottie') });
      </script>
    `;
    const result = detectarAdaptadores(html);
    expect(result.usados).toEqual(expect.arrayContaining(['css', 'animejs', 'lottie']));
    expect(result.editableVisualmente).toBe(true);
    expect(result.motivo).toBe('');
  });

  it("should return empty when no adapters detected", () => {
    const html = `<div>Hello World</div>`;
    const result = detectarAdaptadores(html);
    expect(result.usados).toEqual([]);
    expect(result.editableVisualmente).toBe(true);
    expect(result.motivo).toBe('');
  });
});