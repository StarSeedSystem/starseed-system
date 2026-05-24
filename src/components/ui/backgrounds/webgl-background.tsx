"use client";

import React, { useEffect, useRef } from "react";
import { useAppearance } from "@/context/appearance-context";
import { LiquidGradient } from "@/components/features/backgrounds/liquid-gradient/LiquidGradient";
import { LiquidWaveFilter } from "@/components/features/backgrounds/filters/LiquidWaveFilter";

export function WebGLBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { config } = useAppearance();

    const isWebGLActive = config.background.type === 'webgl';
    const isLiquid = config.background.webglVariant === 'liquid';

    // Filter Logic
    const isFilterActive = config.background.filter?.enabled;
    const isWaveFilter = isFilterActive && config.background.filter?.type === 'waves';

    // We render if either WebGL background is active OR a filter is active
    const shouldRender = isWebGLActive || isFilterActive;

    useEffect(() => {
        // Hex Shader Logic (Only runs if WebGL is active AND variant is NOT Liquid)
        if (!isWebGLActive || isLiquid || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const gl = canvas.getContext('webgl2');

        if (!gl) {
            console.error("WebGL2 not supported");
            return;
        }

        const vs = `#version 300 es
            in vec4 a_pos;
            void main() {
                gl_Position = a_pos;
            }`;

        const fs = `#version 300 es
            precision highp float;
            uniform float u_time;
            uniform vec2 u_res;
            uniform vec2 u_mouse;
            uniform float u_speed;
            uniform float u_zoom;
            out vec4 fragColor;

            vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
            float snoise(vec2 v){const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);vec2 i  = floor(v + dot(v, C.yy) );vec2 x0 = v -   i + dot(i, C.xx);vec2 i1;i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);vec4 x12 = x0.xyxy + C.xxzz;x12.xy -= i1;i = mod(i, 289.0);vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);m = m*m;m = m*m;vec3 x = 2.0 * fract(p * C.www) - 1.0;vec3 h = abs(x) - 0.5;vec3 ox = floor(x + 0.5);vec3 a0 = x - ox;m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );vec3 g;g.x  = a0.x  * x0.x   + h.x  * x0.y;g.yz = a0.yz * x12.xz + h.yz * x12.yw;return 130.0 * dot(m, g);}

            vec2 domainWarp(vec2 p, float t) {
                float n1 = snoise(p + vec2(t, t*0.5)) * 0.8;
                float n2 = snoise(p * 0.5 + vec2(-t*0.4, t*0.9)) * 0.8;
                p += vec2(n1, n2) * 0.5;
                float n3 = snoise(p * 1.2 - vec2(t*0.5, -t*0.3)) * 0.5;
                float n4 = snoise(p + vec2(1.23, -2.11)) * 0.5;
                p += vec2(n3, n4) * 0.3;
                return p;
            }

            float hexDist(vec2 p) {
                const mat2 hexMat = mat2( 1.0,  0.5, 0.0,  0.8660254037844386 );
                vec2 q = hexMat * p;
                vec2 iq = floor(q + 0.5);
                vec2 fq = q - iq;
                vec2 ab = abs(fq) - vec2(0.5, 0.8660254037844386 * 0.5);
                float outsideDist = length(max(ab, 0.0));
                float insideDist = min(max(ab.x, ab.y), 0.0);
                return outsideDist + insideDist;
            }

            vec3 hsv2rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }

            void main() {
                vec2 st = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);

                vec2 mouse_uv = (u_mouse - 0.5 * u_res) / min(u_res.x, u_res.y);
                float mouse_dist = length(st - mouse_uv);
                float distortion_strength = smoothstep(0.35, 0.0, mouse_dist) * 0.15;
                vec2 distortion = normalize(st - mouse_uv) * distortion_strength;
                st += distortion;
                
                float t = u_time * (u_speed * 0.2); // Apply speed

                vec2 bg_uv = st * 0.7;
                float bg_warp_t = u_time * 0.05;
                vec2 warped_bg_uv = domainWarp(bg_uv, bg_warp_t);
                float bg_noise = (snoise(warped_bg_uv) + 1.0) * 0.5;
                vec3 bgColor = vec3(0.01, 0.0, 0.03) + hsv2rgb(vec3(0.65 + bg_noise * 0.1, 0.8, 0.1));
                
                vec2 uv = st;
                float angle = t * 0.2;
                mat2 rot = mat2(cos(angle), -sin(angle), sin(angle),  cos(angle));
                uv = rot * uv;
                uv = domainWarp(uv, t * 1.5);
                uv *= (2.5 * u_zoom); // Apply zoom

                float d = hexDist(uv);
                float glow = pow(smoothstep(0.4, 0.0, abs(d)), 2.0);
                float core = smoothstep(0.02, 0.0, abs(d));
                
                float flicker_t = u_time * 2.0;
                float flicker_noise = snoise(uv * 1.5 + flicker_t);
                core *= (flicker_noise * 0.3 + 0.7);
                
                float color_noise_t = u_time * 0.08;
                float hue_noise = snoise(st * 0.5 + color_noise_t);
                float hue = fract(t * 0.5 + hue_noise);
                vec3 glowColor = hsv2rgb(vec3(hue, 0.7, 1.0));
                vec3 coreColor = vec3(1.0, 0.95, 0.9);

                vec3 color = bgColor;
                color += glowColor * glow * 0.5;
                color += coreColor * core * 1.2;
                
                float vignette = 1.0 - smoothstep(0.7, 1.5, length(st));
                color *= vignette;
                
                color = pow(color, vec3(0.9));
                
                fragColor = vec4(color, 1.0);
            }
        `;

        function createShader(type: number, source: string) {
            const shader = gl!.createShader(type);
            if (!shader) return null;
            gl!.shaderSource(shader, source);
            gl!.compileShader(shader);
            if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
                console.error('Shader compile error: ', gl!.getShaderInfoLog(shader));
                gl!.deleteShader(shader);
                return null;
            }
            return shader;
        }

        const program = gl.createProgram();
        if (!program) return;

        const vShader = createShader(gl.VERTEX_SHADER, vs);
        const fShader = createShader(gl.FRAGMENT_SHADER, fs);

        if (!vShader || !fShader) return;

        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error: ', gl.getProgramInfoLog(program));
            return;
        }
        gl.useProgram(program);

        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(program, 'a_pos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const timeLoc = gl.getUniformLocation(program, 'u_time');
        const resLoc = gl.getUniformLocation(program, 'u_res');
        const mouseLoc = gl.getUniformLocation(program, 'u_mouse');
        const speedLoc = gl.getUniformLocation(program, 'u_speed');
        const zoomLoc = gl.getUniformLocation(program, 'u_zoom');

        let animationFrameId: number;
        const mousePos = [0, 0];

        const handleMouseMove = (e: MouseEvent) => {
            const dpr = window.devicePixelRatio || 1;
            mousePos[0] = e.clientX * dpr;
            mousePos[1] = canvas.height - (e.clientY * dpr);
        };

        const handleResize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(resLoc, canvas.width, canvas.height);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('resize', handleResize);
        handleResize();

        const render = (time: number) => {
            time *= 0.001;
            gl.uniform1f(timeLoc, time);
            gl.uniform2f(mouseLoc, mousePos[0], mousePos[1]);
            gl.uniform1f(speedLoc, config.background.webglSpeed || 0.5);
            gl.uniform1f(zoomLoc, config.background.webglZoom || 1.0);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            animationFrameId = requestAnimationFrame(render);
        };
        requestAnimationFrame(render);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
            gl.deleteProgram(program);
        };
    }, [isWebGLActive, isLiquid, config.background.webglSpeed, config.background.webglZoom]);

    // Safe Mode Check (URL param or feature flag)
    // Helps with headless browsers or low-end devices
    const [safeMode, setSafeMode] = React.useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('safe_mode') === 'true' || params.get('disable_webgl') === 'true') {
                setSafeMode(true);
                return;
            }
            // Basic Feature Detection
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2');
            if (!gl) {
                console.warn("WebGL2 not supported, enabling Safe Mode.");
                setSafeMode(true);
            }
        }
    }, []);

    if (!shouldRender || safeMode) return null;

    return (
        <>
            {/* Base WebGL Background */}
            {isWebGLActive && isLiquid ? (
                <LiquidGradient />
            ) : isWebGLActive ? (
                <canvas
                    ref={canvasRef}
                    className="fixed top-0 left-0 w-full h-full -z-50 pointer-events-none"
                />
            ) : null}

            {/* Filter Overlay */}
            {isWaveFilter && <LiquidWaveFilter />}
        </>
    );
}
