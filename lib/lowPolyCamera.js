// Low-poly camera filter
// ----------------------
// Turns the person in the camera into something like an early-3D video game
// character, while the room behind them stays as it is:
//   1. Find the person in the frame (MediaPipe "selfie segmentation", an AI
//      model that runs in the browser and marks which pixels are a person).
//   2. Draw the normal camera image as the background.
//   3. Trace the person's outline with only a few corner points, so it becomes
//      a chunky, angular, low-poly shape.
//   4. Fill that shape with a tiny, blurred-up copy of the camera image, like
//      a low-resolution texture stretched over a 3D model, plus flat shading
//      on each facet.
//   5. Float cut-out figures (people and a horse) slowly around the edges.
//
// Everything is drawn onto one canvas, so the photos you take include it all.
//
// Use it like this:
//   const stop = startLowPolyCamera({ video, canvas });
//   ...later...
//   stop();

// ---- Settings you can tweak ----

// Size and shape of the picture. 3:4 portrait, like the iPhone camera.
export const OUTPUT_WIDTH = 600;
export const OUTPUT_HEIGHT = 800;

// How many pixels wide the person's "texture" is. Lower = blurrier, more
// retro. Higher = more detail in the face. Try 40 (very rough) to 120.
const TEXTURE_WIDTH = 64;

// How many corners the person's outline has. Fewer = chunkier.
const POLY_POINTS = 16;

// How fast the shape follows your movement (0–1). Lower = smoother but laggier.
const SMOOTHING = 0.35;

// Strength of the flat shading on each facet (0 = none, 1 = very strong).
const FACET_SHADING = 0.15;

// The floating figures (files in public/stickers/).
const STICKERS = ["soldiers", "horse", "selfie", "sparkle", "spiky", "dancer", "hill"];
// Size of each figure, as a share of the picture's height (random in between)
const STICKER_SIZE = { min: 0.15, max: 0.21 };
// How fast they drift around the edge (laps per minute)
const STICKER_SPEED = 0.35;

// Where the AI pieces are loaded from. The version matches package.json.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

// ---- Loading the person-finding model ----
async function createSegmenter() {
  // Imported here (not at the top of the file) so it only loads in the browser.
  const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  try {
    return await ImageSegmenter.createFromOptions(fileset, options("GPU")); // fast
  } catch {
    return await ImageSegmenter.createFromOptions(fileset, options("CPU")); // fallback
  }
}

// ---- The main loop ----
export function startLowPolyCamera({ video, canvas }) {
  const W = OUTPUT_WIDTH;
  const H = OUTPUT_HEIGHT;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  const texture = document.createElement("canvas");
  const textureCtx = texture.getContext("2d");
  const shading = document.createElement("canvas"); // facet light/dark layer
  const shadingCtx = shading.getContext("2d");

  let segmenter = null;
  let stopped = false;
  let frameId = 0;
  let lastTimestamp = 0;
  const shape = { center: null, radii: null }; // remembered between frames, for smoothing
  const stickers = createStickers();

  createSegmenter()
    .then((s) => (stopped ? s.close() : (segmenter = s)))
    .catch((error) => console.warn("Low-poly filter: couldn't load person detection.", error));

  function drawFrame(now) {
    frameId = requestAnimationFrame(drawFrame);
    if (video.readyState < 2 || !video.videoWidth) return; // camera not ready yet

    // The part of the camera image that fits our 3:4 picture (like
    // `object-fit: cover`: crop the edges, keep the middle).
    const crop = coverCrop(video.videoWidth, video.videoHeight, W / H);

    // 1. Background: the normal camera image, mirrored like a selfie camera
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
    ctx.restore();

    // 2. Find the person and turn their outline into a low-poly shape
    let polygon = null;
    if (segmenter) {
      // The model needs a timestamp that always goes up.
      lastTimestamp = Math.max(performance.now(), lastTimestamp + 1);
      const result = segmenter.segmentForVideo(video, lastTimestamp);
      const mask = result.confidenceMasks?.[0];
      if (mask) {
        const found = maskToPolygon(mask.getAsFloat32Array(), mask.width, mask.height, shape);
        // The outline is measured on the whole camera image; convert it to
        // positions inside our cropped picture.
        if (found) polygon = toCrop(found, crop, video.videoWidth, video.videoHeight);
      }
      result.close();
    }

    // 3. The person: a tiny, blurred-up "texture" clipped to the low-poly shape
    if (polygon) {
      texture.width = TEXTURE_WIDTH;
      texture.height = Math.round((TEXTURE_WIDTH * H) / W);
      textureCtx.save();
      textureCtx.translate(texture.width, 0);
      textureCtx.scale(-1, 1);
      textureCtx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, texture.width, texture.height);
      textureCtx.restore();

      ctx.save();
      tracePolygon(ctx, polygon.points, W, H);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // Stretching the tiny texture up makes it soft. The blur (about the
      // size of one texture pixel) hides the blocky steps, giving the
      // airbrushed look; saturate/contrast give the bold painted color.
      const blur = (W / TEXTURE_WIDTH) * 0.7;
      ctx.filter = `blur(${blur.toFixed(1)}px) saturate(1.5) contrast(1.12)`;
      ctx.drawImage(texture, 0, 0, W, H);
      ctx.filter = "none";
      shadeFacets(ctx, shading, shadingCtx, polygon, W, H);
      ctx.restore();
    }

    // 4. Floating figures around the edges
    drawStickers(ctx, stickers, now / 1000, W, H);
  }

  frameId = requestAnimationFrame(drawFrame);

  // Call this to stop the filter (e.g. when leaving the page).
  return function stop() {
    stopped = true;
    cancelAnimationFrame(frameId);
    segmenter?.close();
  };
}

// ---- Cropping helpers ----

// The centered rectangle of the camera image with the picture's shape.
function coverCrop(videoW, videoH, aspect) {
  let w = videoW;
  let h = videoW / aspect;
  if (h > videoH) {
    h = videoH;
    w = videoH * aspect;
  }
  return { x: (videoW - w) / 2, y: (videoH - h) / 2, w, h };
}

// Convert outline points from "fraction of the whole camera image" to
// "fraction of our cropped picture". (The crop is centered, so mirroring
// doesn't change the math.)
function toCrop(polygon, crop, videoW, videoH) {
  const convert = ([x, y]) => [(x * videoW - crop.x) / crop.w, (y * videoH - crop.y) / crop.h];
  return { points: polygon.points.map(convert), center: convert(polygon.center) };
}

// ---- Drawing helpers ----

function tracePolygon(ctx, points, W, H) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
  ctx.closePath();
}

// Split the shape into triangles (like the faces of a 3D model) and give each
// one a flat light or dark tint depending on which way it faces. Light comes
// from the upper left.
//
// The triangles are painted as solid greys on a separate layer, then blended
// onto the picture with "overlay" (mid-grey = no change, lighter = brighter,
// darker = darker).
function shadeFacets(ctx, shading, shadingCtx, polygon, W, H) {
  const { points, center } = polygon;
  const light = { x: -0.6, y: -0.8 };
  if (shading.width !== W || shading.height !== H) {
    shading.width = W;
    shading.height = H;
  }
  shadingCtx.fillStyle = "rgb(128, 128, 128)";
  shadingCtx.fillRect(0, 0, W, H);
  // Each facet is drawn one step too wide (spilling into the next one), and
  // the next facet then paints over the spill. So the soft edge between two
  // facets blends their two shades, instead of letting the grey show through
  // as a thin line. The first facet is drawn again at the end, to cover the
  // last facet's spill.
  const n = points.length;
  for (let step = 0; step <= n; step++) {
    const i = step % n;
    const a = points[i];
    const b = points[(i + 1) % n];
    const spill = step < n ? points[(i + 2) % n] : b;
    // Which way this facet "faces": from the center toward its outer edge
    let nx = (a[0] + b[0]) / 2 - center[0];
    let ny = (a[1] + b[1]) / 2 - center[1];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const brightness = nx * light.x + ny * light.y; // -1 (away) … 1 (toward)
    const grey = Math.round(128 + brightness * FACET_SHADING * 127);
    shadingCtx.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
    shadingCtx.beginPath();
    shadingCtx.moveTo(center[0] * W, center[1] * H);
    shadingCtx.lineTo(a[0] * W, a[1] * H);
    shadingCtx.lineTo(b[0] * W, b[1] * H);
    shadingCtx.lineTo(spill[0] * W, spill[1] * H);
    shadingCtx.closePath();
    shadingCtx.fill();
  }
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(shading, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

// ---- Floating figures ----
//
// Each figure sits somewhere on an invisible loop that runs just inside the
// edges of the picture, and slowly drifts along it. On top of that it bobs
// in and out and sways a little, so it looks like it's floating.
// Their starting spots, sizes and tilts are random every time.

function createStickers() {
  const direction = Math.random() < 0.5 ? 1 : -1; // all drift the same way, so they don't collide
  const order = [...STICKERS].sort(() => Math.random() - 0.5);
  return order.map((name, i) => {
    const image = new Image();
    image.src = `/stickers/${name}.png`;
    return {
      image,
      start: (i + Math.random() * 0.4) / order.length, // spread evenly around the loop
      size: STICKER_SIZE.min + Math.random() * (STICKER_SIZE.max - STICKER_SIZE.min),
      tilt: (Math.random() - 0.5) * 0.4, // radians, about ±11°
      phase: Math.random() * Math.PI * 2,
      direction,
    };
  });
}

// A point on the loop around the edges. `t` goes 0 → 1 once around.
function pointOnEdgeLoop(t, W, H) {
  const inset = 0.1; // how far inside the edge the loop runs
  const x0 = W * inset;
  const y0 = H * inset;
  const w = W * (1 - 2 * inset);
  const h = H * (1 - 2 * inset);
  let d = (((t % 1) + 1) % 1) * 2 * (w + h); // distance along the loop
  if (d < w) return { x: x0 + d, y: y0, nx: 0, ny: -1 }; // top edge
  d -= w;
  if (d < h) return { x: x0 + w, y: y0 + d, nx: 1, ny: 0 }; // right edge
  d -= h;
  if (d < w) return { x: x0 + w - d, y: y0 + h, nx: 0, ny: 1 }; // bottom edge
  d -= w;
  return { x: x0, y: y0 + h - d, nx: -1, ny: 0 }; // left edge
}

function drawStickers(ctx, stickers, seconds, W, H) {
  for (const s of stickers) {
    if (!s.image.complete || !s.image.naturalWidth) continue; // still loading
    const t = s.start + s.direction * seconds * (STICKER_SPEED / 60);
    const p = pointOnEdgeLoop(t, W, H);
    // Bob outward/inward from the edge, and sway
    const bob = Math.sin(seconds * 0.9 + s.phase) * W * 0.025;
    const angle = s.tilt + Math.sin(seconds * 0.6 + s.phase) * 0.12;

    // Size by height, but keep wide figures (like the horse) from getting huge
    let h = H * s.size;
    let w = (h * s.image.naturalWidth) / s.image.naturalHeight;
    if (w > W * 0.45) {
      w = W * 0.45;
      h = (w * s.image.naturalHeight) / s.image.naturalWidth;
    }

    ctx.save();
    ctx.translate(p.x + p.nx * bob, p.y + p.ny * bob);
    ctx.rotate(angle);
    // A soft shadow so they look like they're hovering above the picture
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(s.image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// ---- Turning the AI's mask into a low-poly outline ----
//
// The model gives a "mask": for every pixel, how sure it is (0–1) that the
// pixel is part of a person. We:
//   a) shrink it to a small grid,
//   b) find the middle of the person,
//   c) shoot POLY_POINTS evenly spaced rays out from the middle (like clock
//      hands) and note where each ray leaves the person,
//   d) use those points as the corners of the shape.
// Because the rays always point the same directions, the corners stay stable
// from frame to frame instead of jumping around.
function maskToPolygon(mask, maskW, maskH, shape) {
  const cols = 64;
  const rows = Math.max(1, Math.round((cols * maskH) / maskW));

  // a) Small grid of inside (true) / outside (false), mirrored like the image
  const inside = new Uint8Array(cols * rows);
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < rows; y++) {
    const my = Math.floor(((y + 0.5) * maskH) / rows);
    for (let x = 0; x < cols; x++) {
      const mx = Math.floor(((x + 0.5) * maskW) / cols);
      if (mask[my * maskW + mx] > 0.5) {
        const gx = cols - 1 - x; // mirror
        inside[y * cols + gx] = 1;
        count++;
        sumX += gx;
        sumY += y;
      }
    }
  }

  // Nobody there (less than 2% of the frame)
  if (count < cols * rows * 0.02) {
    shape.center = null;
    shape.radii = null;
    return null;
  }

  // b) Middle of the person, smoothed over time
  const center = [sumX / count, sumY / count];
  shape.center = shape.center ? lerpPoint(shape.center, center, SMOOTHING) : center;
  const [cx, cy] = shape.center;

  // c) Rays
  const isInside = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= cols || iy >= rows) return null; // off the grid
    return inside[iy * cols + ix] === 1;
  };
  const maxRadius = Math.hypot(cols, rows);
  const radii = [];
  for (let k = 0; k < POLY_POINTS; k++) {
    const angle = -Math.PI / 2 + (k * 2 * Math.PI) / POLY_POINTS; // start pointing up
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let lastInside = 0;
    let gap = 0;
    for (let r = 0; r < maxRadius; r += 0.5) {
      const hit = isInside(cx + dx * r, cy + dy * r);
      if (hit === null) {
        // Reached the edge of the picture while still on the person
        // (e.g. shoulders going off the bottom): run the shape off the edge.
        if (gap === 0) lastInside = r + 4;
        break;
      }
      if (hit) {
        lastInside = r;
        gap = 0;
      } else if (++gap > 6) {
        break; // properly outside (ignores tiny holes in the mask)
      }
    }
    radii.push(lastInside + 0.5);
  }

  // Smooth each corner over time so the shape glides instead of flickering
  shape.radii = shape.radii ? shape.radii.map((old, i) => old + SMOOTHING * (radii[i] - old)) : radii;

  // d) Corners, as fractions of the whole camera image (0–1)
  const points = shape.radii.map((r, k) => {
    const angle = -Math.PI / 2 + (k * 2 * Math.PI) / POLY_POINTS;
    return [(cx + Math.cos(angle) * r) / cols, (cy + Math.sin(angle) * r) / rows];
  });
  return { points, center: [cx / cols, cy / rows] };
}

function lerpPoint(from, to, t) {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}
