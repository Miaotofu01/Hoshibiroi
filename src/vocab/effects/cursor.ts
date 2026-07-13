/**
 * osu!-style custom cursor effects.
 *
 * mountCursor() — shows a custom cursor circle, a canvas glow, and a mouse trail.
 * unmountCursor() — tears everything down.
 *
 * Respects prefers-reduced-motion: mountCursor is a no-op when the user
 * has that preference set.
 */

const TRAIL_LENGTH = 25;
const GLOW_RADIUS = 40;

interface Point {
  x: number;
  y: number;
}

let trail: Point[] = [];
let cursorEl: HTMLElement | null = null;
let canvasEl: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let rafId: number | null = null;
let mounted = false;

// Bound references (needed for removeEventListener)
let onMove: ((e: MouseEvent) => void) | null = null;
let onDown: ((e: MouseEvent) => void) | null = null;
let onUp: ((e: MouseEvent) => void) | null = null;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function bindEvents(): void {
  onMove = (e: MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;

    // Update cursor position
    if (cursorEl) {
      cursorEl.style.left = `${x}px`;
      cursorEl.style.top = `${y}px`;
    }

    // Append to trail, keep at most TRAIL_LENGTH points
    trail.push({ x, y });
    if (trail.length > TRAIL_LENGTH) {
      trail = trail.slice(-TRAIL_LENGTH);
    }
  };

  onDown = () => {
    cursorEl?.classList.add('pressing');
  };

  onUp = () => {
    cursorEl?.classList.remove('pressing');
  };

  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mousedown', onDown);
  document.addEventListener('mouseup', onUp);
}

function unbindEvents(): void {
  if (onMove) document.removeEventListener('mousemove', onMove);
  if (onDown) document.removeEventListener('mousedown', onDown);
  if (onUp) document.removeEventListener('mouseup', onUp);
  onMove = null;
  onDown = null;
  onUp = null;
}

function drawGlow(): void {
  if (!ctx || !canvasEl) return;

  const w = canvasEl.width;
  const h = canvasEl.height;

  ctx.clearRect(0, 0, w, h);

  if (trail.length === 0) return;

  const last = trail[trail.length - 1];

  // ── Radial gradient glow at cursor ──
  const gradient = ctx.createRadialGradient(last.x, last.y, 0, last.x, last.y, GLOW_RADIUS);
  gradient.addColorStop(0, 'rgba(88, 166, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(88, 166, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(last.x, last.y, GLOW_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // ── Trail polyline ──
  if (trail.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) {
      ctx.lineTo(trail[i].x, trail[i].y);
    }
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

function loop(): void {
  drawGlow();
  rafId = requestAnimationFrame(loop);
}

function resizeCanvas(): void {
  if (!canvasEl) return;
  canvasEl.width = window.innerWidth;
  canvasEl.height = window.innerHeight;
}

/**
 * Activate the custom cursor.
 *
 * If the user has `prefers-reduced-motion: reduce`, this is a no-op.
 */
export function mountCursor(): void {
  if (mounted) return;
  if (prefersReducedMotion()) return;

  // Cache DOM references
  cursorEl = document.getElementById('custom-cursor');
  canvasEl = document.getElementById('glow-canvas') as HTMLCanvasElement | null;

  if (!cursorEl || !canvasEl) return;

  ctx = canvasEl.getContext('2d');

  // Show elements
  cursorEl.classList.add('active');
  canvasEl.classList.add('active');

  // Size canvas to viewport
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Reset trail
  trail = [];

  // Bind DOM events
  bindEvents();

  // Start glow loop
  mounted = true;
  loop();
}

/**
 * Deactivate the custom cursor and clean up all resources.
 */
export function unmountCursor(): void {
  if (!mounted) return;

  // Cancel animation frame
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Unbind events
  unbindEvents();
  window.removeEventListener('resize', resizeCanvas);

  // Hide elements
  cursorEl?.classList.remove('active', 'pressing');
  canvasEl?.classList.remove('active');

  // Reset state
  trail = [];
  cursorEl = null;
  canvasEl = null;
  ctx = null;
  mounted = false;
}
