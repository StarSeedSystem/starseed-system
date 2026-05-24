
import * as THREE from "three";

export class TouchTexture {
    size: number;
    width: number;
    height: number;
    maxAge: number;
    radius: number;
    speed: number;
    trail: { x: number; y: number; age: number; force: number; vx: number; vy: number }[];
    last: { x: number; y: number } | null;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: THREE.Texture;

    constructor() {
        this.size = 64;
        this.width = this.height = this.size;
        this.maxAge = 64;
        this.radius = 0.25 * this.size;
        this.speed = 1 / this.maxAge;
        this.trail = [];
        this.last = null;

        this.canvas = document.createElement("canvas");
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext("2d")!;
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.texture = new THREE.Texture(this.canvas);
        this.initTexture();
    }

    initTexture() {
        this.texture.needsUpdate = true;
    }

    update() {
        this.clear();
        let speed = this.speed;
        for (let i = this.trail.length - 1; i >= 0; i--) {
            const point = this.trail[i];
            let f = point.force * speed * (1 - point.age / this.maxAge);
            point.x += point.vx * f;
            point.y += point.vy * f;
            point.age++;
            if (point.age > this.maxAge) {
                this.trail.splice(i, 1);
            } else {
                this.drawPoint(point);
            }
        }
        this.texture.needsUpdate = true;
    }

    clear() {
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    addTouch(point: { x: number; y: number }) {
        let force = 0;
        let vx = 0;
        let vy = 0;
        const last = this.last;
        if (last) {
            const dx = point.x - last.x;
            const dy = point.y - last.y;
            if (dx === 0 && dy === 0) return;
            const dd = dx * dx + dy * dy;
            let d = Math.sqrt(dd);
            vx = dx / d;
            vy = dy / d;
            force = Math.min(dd * 20000, 2.0);
        }
        this.last = { x: point.x, y: point.y };
        this.trail.push({ x: point.x, y: point.y, age: 0, force, vx, vy });
    }

    drawPoint(point: { x: number; y: number; age: number; force: number; vx: number; vy: number }) {
        const pos = {
            x: point.x * this.width,
            y: (1 - point.y) * this.height
        };

        let intensity = 1;
        if (point.age < this.maxAge * 0.3) {
            intensity = Math.sin((point.age / (this.maxAge * 0.3)) * (Math.PI / 2));
        } else {
            const t = 1 - (point.age - this.maxAge * 0.3) / (this.maxAge * 0.7);
            intensity = -t * (t - 2);
        }
        intensity *= point.force;

        const radius = this.radius;
        let color = `${((point.vx + 1) / 2) * 255}, ${((point.vy + 1) / 2) * 255
            }, ${intensity * 255}`;
        let offset = this.size * 5;
        this.ctx.shadowOffsetX = offset;
        this.ctx.shadowOffsetY = offset;
        this.ctx.shadowBlur = radius * 1;
        this.ctx.shadowColor = `rgba(${color},${0.2 * intensity})`;

        this.ctx.beginPath();
        this.ctx.fillStyle = "rgba(255,0,0,1)";
        this.ctx.arc(pos.x - offset, pos.y - offset, radius, 0, Math.PI * 2);
        this.ctx.fill();
    }
}
