/**
 * Audiomorphic — DIBUJANTES DE GEOMETRÍA SAGRADA (Adenda 69 · K)
 * ============================================================================
 * Port VERBATIM de `components/geometryDrawers.ts` de la repo CORRECTA del
 * usuario (github.com/alexbordongarrigos/audiomorphic-ar).
 *
 * Son 16 dibujantes de Canvas 2D puro (sin React, sin DOM más allá del ctx) ⇒
 * los usan IGUAL la app `/audiomorphic` y la CAPA DE FONDO del OS.
 * Los otros 4 (goldenSpiral · flowerOfLife · quantumWave · torus) viven en
 * `renderer.ts` porque también perturban la espiral.
 *
 * ⚠️ Este archivo NO existía en el port de la Adenda 68·E: se portó desde la
 * repo equivocada (`StarSeedSystem/Audiomorphic-AR-app`), que solo tiene 4
 * geometrías. Aquí están las 20 reales.
 *
 * Autoría original: Audiomorphic (Alex Bordón Garrigós).
 */

export const drawMetatron = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    const nodes: {x: number, y: number}[] = [];
    const addNode = (x: number, y: number) => nodes.push({x, y});

    // Center
    addNode(0, 0);
    
    // Inner hexagon
    for(let i=0; i<6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 6;
        addNode(Math.cos(a)*r, Math.sin(a)*r);
    }
    
    // Outer hexagon
    for(let i=0; i<6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 6;
        addNode(Math.cos(a)*r*2, Math.sin(a)*r*2);
    }

    // Draw lines connecting all nodes
    ctx.beginPath();
    for(let i=0; i<nodes.length; i++) {
        for(let j=i+1; j<nodes.length; j++) {
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
        }
    }
    ctx.stroke();

    // Draw circles at nodes
    nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(0, r * 0.3), 0, Math.PI*2);
        if (bgOpacity > 0) ctx.fill();
        ctx.stroke();
    });

    ctx.restore();
};

export const drawMerkaba = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    // 2D projection of two intersecting tetrahedrons (Star Tetrahedron)
    // Upward pointing triangle
    ctx.beginPath();
    for(let i=0; i<3; i++) {
        const a = i * Math.PI * 2 / 3 - Math.PI / 2 + time * 0.5;
        if(i===0) ctx.moveTo(Math.cos(a)*r*2, Math.sin(a)*r*2);
        else ctx.lineTo(Math.cos(a)*r*2, Math.sin(a)*r*2);
    }
    ctx.closePath();
    ctx.stroke();
    if (bgOpacity > 0) ctx.fill();

    // Downward pointing triangle
    ctx.beginPath();
    for(let i=0; i<3; i++) {
        const a = i * Math.PI * 2 / 3 + Math.PI / 2 - time * 0.5;
        if(i===0) ctx.moveTo(Math.cos(a)*r*2, Math.sin(a)*r*2);
        else ctx.lineTo(Math.cos(a)*r*2, Math.sin(a)*r*2);
    }
    ctx.closePath();
    ctx.stroke();
    if (bgOpacity > 0) ctx.fill();

    // Inner connections to create 3D illusion
    ctx.beginPath();
    for(let i=0; i<6; i++) {
        const a = i * Math.PI / 3;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a)*r*1.15, Math.sin(a)*r*1.15);
    }
    ctx.stroke();

    ctx.restore();
};

export const drawPlatonicSolids = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation + time * 0.2);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    // Draw an Icosahedron projection
    const outerRadius = r * 2;
    const innerRadius = r * 1.1;
    
    // Outer hexagon
    ctx.beginPath();
    for(let i=0; i<6; i++) {
        const a = i * Math.PI / 3;
        if(i===0) ctx.moveTo(Math.cos(a)*outerRadius, Math.sin(a)*outerRadius);
        else ctx.lineTo(Math.cos(a)*outerRadius, Math.sin(a)*outerRadius);
    }
    ctx.closePath();
    ctx.stroke();
    if (bgOpacity > 0) ctx.fill();

    // Inner triangle
    ctx.beginPath();
    for(let i=0; i<3; i++) {
        const a = i * Math.PI * 2 / 3 - Math.PI / 2;
        if(i===0) ctx.moveTo(Math.cos(a)*innerRadius, Math.sin(a)*innerRadius);
        else ctx.lineTo(Math.cos(a)*innerRadius, Math.sin(a)*innerRadius);
    }
    ctx.closePath();
    ctx.stroke();

    // Connect inner to outer
    ctx.beginPath();
    for(let i=0; i<3; i++) {
        const a1 = i * Math.PI * 2 / 3 - Math.PI / 2;
        const a2 = i * Math.PI * 2 / 3 - Math.PI / 2 + Math.PI / 3;
        const a3 = i * Math.PI * 2 / 3 - Math.PI / 2 - Math.PI / 3;
        
        ctx.moveTo(Math.cos(a1)*innerRadius, Math.sin(a1)*innerRadius);
        ctx.lineTo(Math.cos(a1)*outerRadius, Math.sin(a1)*outerRadius);
        
        ctx.moveTo(Math.cos(a1)*innerRadius, Math.sin(a1)*innerRadius);
        ctx.lineTo(Math.cos(a2)*outerRadius, Math.sin(a2)*outerRadius);
        
        ctx.moveTo(Math.cos(a1)*innerRadius, Math.sin(a1)*innerRadius);
        ctx.lineTo(Math.cos(a3)*outerRadius, Math.sin(a3)*outerRadius);
    }
    ctx.stroke();

    ctx.restore();
};

export const drawSriYantra = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    const size = r * 2.5;

    // Simplified Sri Yantra (9 interlocking triangles)
    // 4 pointing up (Shiva), 5 pointing down (Shakti)
    const drawTriangle = (yOffset: number, scale: number, pointingUp: boolean) => {
        ctx.beginPath();
        const dir = pointingUp ? -1 : 1;
        ctx.moveTo(0, yOffset + dir * size * scale);
        ctx.lineTo(size * scale * 0.866, yOffset - dir * size * scale * 0.5);
        ctx.lineTo(-size * scale * 0.866, yOffset - dir * size * scale * 0.5);
        ctx.closePath();
        ctx.stroke();
        if (bgOpacity > 0) ctx.fill();
    };

    // Downward (Shakti)
    drawTriangle(-size * 0.1, 1.0, false);
    drawTriangle(size * 0.1, 0.7, false);
    drawTriangle(-size * 0.2, 0.5, false);
    drawTriangle(size * 0.2, 0.3, false);
    drawTriangle(0, 0.15, false);

    // Upward (Shiva)
    drawTriangle(size * 0.1, 0.9, true);
    drawTriangle(-size * 0.1, 0.6, true);
    drawTriangle(size * 0.2, 0.4, true);
    drawTriangle(-size * 0.15, 0.2, true);

    // Bindu (Center point)
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size * 0.02), 0, Math.PI * 2);
    ctx.fill();

    // Outer circles (Lotus petals representation)
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size * 1.1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size * 1.3), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
};

export const drawCymatics = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    const nodes = 6 + Math.floor(vol * 6) * 2; // Dynamic symmetry based on volume
    const maxR = r * 3;
    
    ctx.beginPath();
    for (let i = 0; i <= 360; i += 2) {
        const a = i * Math.PI / 180;
        // Chladni plate inspired equation
        const rad = maxR * (0.5 + 0.5 * Math.sin(nodes * a + time) * Math.cos(nodes * 0.5 * a - time * 0.5));
        
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.stroke();
    if (bgOpacity > 0) ctx.fill();

    // Inner standing waves
    ctx.beginPath();
    for (let i = 0; i <= 360; i += 5) {
        const a = i * Math.PI / 180;
        const rad = maxR * 0.5 * (0.5 + 0.5 * Math.cos(nodes * 2 * a - time * 2));
        
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
};

export const drawVectorEquilibrium = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    // Jitterbug motion (pulsing between cuboctahedron and octahedron)
    const pulse = 0.5 + 0.5 * Math.sin(time * 2 + vol * Math.PI);
    const size = r * 2 * (0.8 + 0.2 * pulse);

    // 12 vertices of cuboctahedron projection
    const v: {x: number, y: number}[] = [];
    
    // Outer hexagon
    for(let i=0; i<6; i++) {
        const a = i * Math.PI / 3;
        v.push({x: Math.cos(a)*size, y: Math.sin(a)*size});
    }
    
    // Inner hexagon (rotated)
    const innerSize = size * (0.5 + 0.2 * pulse);
    for(let i=0; i<6; i++) {
        const a = i * Math.PI / 3 + Math.PI / 6;
        v.push({x: Math.cos(a)*innerSize, y: Math.sin(a)*innerSize});
    }

    // Draw outer hexagon
    ctx.beginPath();
    for(let i=0; i<6; i++) {
        if(i===0) ctx.moveTo(v[i].x, v[i].y);
        else ctx.lineTo(v[i].x, v[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    if (bgOpacity > 0) ctx.fill();

    // Draw inner hexagon
    ctx.beginPath();
    for(let i=6; i<12; i++) {
        if(i===6) ctx.moveTo(v[i].x, v[i].y);
        else ctx.lineTo(v[i].x, v[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Connect outer to inner
    ctx.beginPath();
    for(let i=0; i<6; i++) {
        ctx.moveTo(v[i].x, v[i].y);
        ctx.lineTo(v[(i+5)%6 + 6].x, v[(i+5)%6 + 6].y);
        ctx.moveTo(v[i].x, v[i].y);
        ctx.lineTo(v[i+6].x, v[i+6].y);
    }
    ctx.stroke();

    // Radiate from center
    ctx.beginPath();
    for(let i=0; i<12; i++) {
        ctx.moveTo(0, 0);
        ctx.lineTo(v[i].x, v[i].y);
    }
    ctx.stroke();

    ctx.restore();
};

export const drawTreeOfLife = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    const scale = r * 0.8;
    
    // 10 Sephirot positions
    const nodes = [
        {x: 0, y: -3},      // Kether
        {x: 1, y: -2},      // Chokhmah
        {x: -1, y: -2},     // Binah
        {x: 1, y: -0.5},    // Chesed
        {x: -1, y: -0.5},   // Gevurah
        {x: 0, y: -1},      // Tiferet
        {x: 1, y: 1},       // Netzach
        {x: -1, y: 1},      // Hod
        {x: 0, y: 1.5},     // Yesod
        {x: 0, y: 3}        // Malkuth
    ].map(n => ({x: n.x * scale, y: n.y * scale}));

    // 22 Paths
    const paths = [
        [0,1], [0,2], [0,5], [1,2], [1,3], [1,5], [2,4], [2,5],
        [3,4], [3,5], [3,6], [4,5], [4,7], [5,6], [5,7], [5,8],
        [6,7], [6,8], [6,9], [7,8], [7,9], [8,9]
    ];

    // Draw paths
    ctx.beginPath();
    paths.forEach(([i, j]) => {
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
    });
    ctx.stroke();

    // Draw nodes
    nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(0, scale * 0.3), 0, Math.PI*2);
        if (bgOpacity > 0) ctx.fill();
        ctx.stroke();
    });

    ctx.restore();
};

export const drawYinYang = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation + time); // Continuous rotation
    ctx.lineWidth = (1 + vol * 2) * thickness;

    const size = r * 2;

    // Outer circle
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size), 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.stroke();

    // Yin (Dark/Bg)
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size), Math.PI * 0.5, Math.PI * 1.5, true);
    ctx.arc(0, -size/2, Math.max(0, size/2), Math.PI * 1.5, Math.PI * 0.5, false);
    ctx.arc(0, size/2, Math.max(0, size/2), Math.PI * 1.5, Math.PI * 0.5, true);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.fill();
    ctx.stroke();

    // Yang (Light/Line)
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size), Math.PI * 1.5, Math.PI * 0.5, true);
    ctx.arc(0, size/2, Math.max(0, size/2), Math.PI * 0.5, Math.PI * 1.5, false);
    ctx.arc(0, -size/2, Math.max(0, size/2), Math.PI * 0.5, Math.PI * 1.5, true);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fill();
    ctx.stroke();

    // Inner dots
    ctx.beginPath();
    ctx.arc(0, -size/2, Math.max(0, size * 0.15), 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, size/2, Math.max(0, size * 0.15), 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.fill();

    ctx.restore();
};

export const drawMandala1 = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    const size = r * 2.5;

    // Outer square (Bhupura)
    ctx.strokeRect(-size, -size, size*2, size*2);
    
    // T-shaped gates
    const gateSize = size * 0.3;
    const drawGate = (x: number, y: number, rot: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(-gateSize, 0);
        ctx.lineTo(-gateSize, gateSize);
        ctx.lineTo(gateSize, gateSize);
        ctx.lineTo(gateSize, 0);
        ctx.stroke();
        if (bgOpacity > 0) ctx.fill();
        ctx.restore();
    };
    
    drawGate(0, -size, 0);
    drawGate(size, 0, Math.PI/2);
    drawGate(0, size, Math.PI);
    drawGate(-size, 0, -Math.PI/2);

    // Inner circles
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size * 0.8), 0, Math.PI*2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size * 0.6), 0, Math.PI*2);
    ctx.stroke();

    // Lotus petals (16)
    for(let i=0; i<16; i++) {
        const a = i * Math.PI / 8;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, size * 0.6);
        ctx.quadraticCurveTo(size * 0.1, size * 0.7, 0, size * 0.8);
        ctx.quadraticCurveTo(-size * 0.1, size * 0.7, 0, size * 0.6);
        ctx.stroke();
        if (bgOpacity > 0) ctx.fill();
        ctx.restore();
    }

    ctx.restore();
};

export const drawMandala2 = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    const size = r * 2;
    
    // 3D illusion concentric spheres
    for(let j=1; j<=4; j++) {
        const currentSize = size * (j/4);
        ctx.beginPath();
        for(let i=0; i<=360; i+=5) {
            const a = i * Math.PI / 180;
            // Modulate radius with sine waves for 3D energy flow look
            const rad = currentSize * (1 + 0.1 * Math.sin(a * 8 + time * j));
            const x = Math.cos(a) * rad;
            const y = Math.sin(a) * rad * 0.5; // Squash for 3D perspective
            
            // Rotate the squashed circle
            const rotA = time * 0.2 * (j%2===0?1:-1);
            const rx = x * Math.cos(rotA) - y * Math.sin(rotA);
            const ry = x * Math.sin(rotA) + y * Math.cos(rotA);
            
            if(i===0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.stroke();
    }

    ctx.restore();
};

export const drawMandala3 = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    // The Bindu (Point Zero) - converging infinite circles
    const maxCircles = 20;
    for(let i=0; i<maxCircles; i++) {
        // Exponentially decreasing size
        const size = r * 3 * Math.pow(0.7, i + (time % 1));
        
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0, size), 0, Math.PI*2);
        
        // Opacity fades towards center
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity * (1 - i/maxCircles)})`;
        ctx.stroke();
    }
    
    // Intense center point
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, r * 0.1 * (1 + vol)), 0, Math.PI*2);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, 100%, ${lineOpacity})`;
    ctx.fill();

    ctx.restore();
};

export const drawHolographicFractal = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation + time * 0.1);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol) * thickness;

    const drawBranch = (len: number, depth: number) => {
        if (depth === 0) return;
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -len);
        ctx.stroke();
        
        ctx.translate(0, -len);
        
        const angle = Math.PI / 4 + Math.sin(time + depth) * 0.2 + vol * 0.5;
        
        ctx.save();
        ctx.rotate(angle);
        drawBranch(len * 0.67, depth - 1);
        ctx.restore();
        
        ctx.save();
        ctx.rotate(-angle);
        drawBranch(len * 0.67, depth - 1);
        ctx.restore();
    };

    // 6-way symmetry fractal
    for(let i=0; i<6; i++) {
        ctx.save();
        ctx.rotate(i * Math.PI / 3);
        drawBranch(r * 1.5, 5);
        ctx.restore();
    }

    ctx.restore();
};

export const drawChakras = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.lineWidth = (1 + vol * 2) * thickness;

    const size = r * 0.4;
    const spacing = r * 0.8;
    
    const chakras = [
        { petals: 4, color: 0 },      // Root
        { petals: 6, color: 30 },     // Sacral
        { petals: 10, color: 60 },    // Solar Plexus
        { petals: 12, color: 120 },   // Heart
        { petals: 16, color: 240 },   // Throat
        { petals: 2, color: 270 },    // Third Eye
        { petals: 24, color: 300 }    // Crown (simplified from 1000)
    ];

    chakras.forEach((chakra, index) => {
        const yOffset = (index - 3) * spacing;
        
        ctx.save();
        ctx.translate(0, -yOffset);
        ctx.rotate(time * (1 + index * 0.2)); // Higher chakras spin faster
        
        const cHue = (hue + chakra.color) % 360;
        ctx.strokeStyle = `hsla(${cHue}, ${sat}%, ${light}%, ${lineOpacity})`;
        ctx.fillStyle = `hsla(${cHue}, ${sat}%, ${light}%, ${bgOpacity})`;
        
        // Draw petals
        for(let i=0; i<chakra.petals; i++) {
            ctx.save();
            ctx.rotate(i * Math.PI * 2 / chakra.petals);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(size * 0.5, size * 0.5, 0, size);
            ctx.quadraticCurveTo(-size * 0.5, size * 0.5, 0, 0);
            ctx.stroke();
            if (bgOpacity > 0) ctx.fill();
            ctx.restore();
        }
        
        // Inner circle
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0, size * 0.3), 0, Math.PI*2);
        ctx.stroke();
        
        ctx.restore();
    });

    // Central channel (Sushumna)
    ctx.beginPath();
    ctx.moveTo(0, -3 * spacing);
    ctx.lineTo(0, 3 * spacing);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity * 0.5})`;
    ctx.stroke();

    ctx.restore();
};

export const drawOm = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (2 + vol * 3) * thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const s = r * 0.8;

    // Stylized Om symbol drawn with curves
    ctx.beginPath();
    // Left '3' shape (Waking & Dream states)
    ctx.arc(-s*0.5, -s*0.5, Math.max(0, s*0.5), Math.PI, Math.PI*2.5);
    ctx.arc(-s*0.5, s*0.5, Math.max(0, s*0.6), -Math.PI*0.5, Math.PI);
    
    // Right tail (Deep sleep)
    ctx.moveTo(-s*0.1, 0);
    ctx.quadraticCurveTo(s*1.5, -s*0.2, s*1.2, s*0.8);
    ctx.stroke();

    // Upper crescent (Maya/Illusion)
    ctx.beginPath();
    ctx.arc(s*0.8, -s*1.2, Math.max(0, s*0.6), Math.PI*0.2, Math.PI*0.8);
    ctx.stroke();

    // Bindu (Absolute state)
    ctx.beginPath();
    ctx.arc(s*0.8, -s*1.8, Math.max(0, s*0.15), 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // Radiating sound waves
    for(let i=1; i<=3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0, r * 2 * i * (1 + vol*0.5)), 0, Math.PI*2);
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity * 0.3 / i})`;
        ctx.stroke();
    }

    ctx.restore();
};

export const drawLotus = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    const size = r * 2.5;
    const layers = 4;
    
    for(let j=0; j<layers; j++) {
        const petals = 8 + j * 4;
        const layerSize = size * (1 - j * 0.2);
        // Opening animation based on time and volume
        const openFactor = Math.min(1, Math.max(0.2, Math.sin(time * 0.5) * 0.5 + 0.5 + vol));
        
        for(let i=0; i<petals; i++) {
            ctx.save();
            ctx.rotate(i * Math.PI * 2 / petals + (j % 2) * Math.PI / petals);
            
            ctx.beginPath();
            ctx.moveTo(0, 0);
            // Petal shape
            ctx.bezierCurveTo(
                layerSize * 0.3 * openFactor, layerSize * 0.3,
                layerSize * 0.5 * openFactor, layerSize * 0.8,
                0, layerSize
            );
            ctx.bezierCurveTo(
                -layerSize * 0.5 * openFactor, layerSize * 0.8,
                -layerSize * 0.3 * openFactor, layerSize * 0.3,
                0, 0
            );
            
            ctx.stroke();
            if (bgOpacity > 0) ctx.fill();
            ctx.restore();
        }
    }

    ctx.restore();
};

export const drawDharmaChakra = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number, lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, time: number, vol: number, thickness: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation + time * 0.5); // Constant forward rotation
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (2 + vol * 2) * thickness;

    const size = r * 2;

    // Outer rim
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size), 0, Math.PI*2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size * 0.9), 0, Math.PI*2);
    ctx.stroke();

    // 8 Spokes (Noble Eightfold Path)
    for(let i=0; i<8; i++) {
        ctx.save();
        ctx.rotate(i * Math.PI / 4);
        
        // Spoke
        ctx.beginPath();
        ctx.moveTo(0, size * 0.2);
        ctx.lineTo(0, size * 0.9);
        ctx.stroke();
        
        // Decorative element on spoke
        ctx.beginPath();
        ctx.arc(0, size * 0.5, Math.max(0, size * 0.1), 0, Math.PI*2);
        if (bgOpacity > 0) ctx.fill();
        ctx.stroke();
        
        ctx.restore();
    }

    // Central hub
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size * 0.2), 0, Math.PI*2);
    ctx.stroke();
    if (bgOpacity > 0) ctx.fill();
    
    // Inner swirl (Yin-Yang like)
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, size * 0.1), 0, Math.PI, true);
    ctx.arc(size*0.05, 0, Math.max(0, size*0.05), Math.PI, 0, false);
    ctx.arc(-size*0.05, 0, Math.max(0, size*0.05), Math.PI, 0, true);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fill();

    ctx.restore();
};
