// Low-poly camera filter
// ----------------------
// Turns the person in the camera into something like an early-3D (PS1-era)
// video game character, while the room behind them stays as it is:
//   1. Draw the normal camera image as the background.
//   2. Find the person (MediaPipe "selfie segmentation") and trace their
//      outline (hair, neck, shoulders) with only a few corners.
//   3. Find the face (MediaPipe "face landmarker": 468 points on the face, in
//      3D) and connect ~40 of them into a mesh of triangles, like a low-poly
//      3D head.
//   4. Fill everything with a tiny, blurred-up copy of the camera (a low-res
//      "texture"), then give every triangle ("facet") a flat color and a
//      light/dark tint based on which way it faces. Those flat planes are
//      what makes it read as low-poly.
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

// How many pixels wide the "texture" is. Lower = blurrier, more retro.
// Higher = more detail. Try 40 (very rough) to 120.
const TEXTURE_WIDTH = 64;

// How many corners the outline of hair/body has. Fewer = chunkier.
const POLY_POINTS = 12;

// How fast shapes follow your movement (0–1). Lower = smoother but laggier.
const SMOOTHING = 0.35;
const FACE_SMOOTHING = 0.55;

// How much each facet is flattened to one solid color (0 = none, 1 = fully
// flat). This is the main "low-poly" control.
const FLAT_COLOR = 0.38;

// How strongly facets are lit/darkened by the direction they face.
const FACET_SHADING = 0.5;

// The floating figures (files in public/stickers/).
const STICKERS = ["soldiers", "horse", "selfie", "sparkle", "spiky", "dancer", "hill"];
// Size of each figure, as a share of the picture's height (random in between)
const STICKER_SIZE = { min: 0.15, max: 0.21 };
// How fast they drift around the edge (laps per minute)
const STICKER_SPEED = 0.35;

// Where the AI pieces are loaded from. The version matches package.json.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const SEGMENTER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// The ~40 face points (out of MediaPipe's 468) that become the corners of
// the low-poly head. Numbers are MediaPipe's point IDs.
const FACE_POINTS = [
  // Outline of the face: forehead → right side → chin → left side
  10, 332, 389, 323, 397, 378, 152, 149, 172, 93, 162, 103,
  // Eyebrows (outer, middle, inner)
  70, 105, 107, 300, 334, 336,
  // Eye corners, top and bottom of each eye
  33, 133, 159, 145, 362, 263, 386, 374,
  // Nose: top, tip, sides, under the nose
  168, 1, 98, 327, 2,
  // Cheekbones and cheeks
  116, 345, 205, 425,
  // Mouth: corners, top lip, bottom lip
  61, 291, 0, 17,
  // Chin and forehead centers
  199, 151,
];

// ---- Loading the AI models ----
async function createModels() {
  // Imported here (not at the top of the file) so it only loads in the browser.
  const { FilesetResolver, ImageSegmenter, FaceLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

  // Try the fast GPU version first, and fall back to CPU if it fails.
  const withFallback = async (create) => {
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  };

  const [segmenter, face] = await Promise.all([
    withFallback((delegate) =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEGMENTER_MODEL, delegate },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      })
    ),
    withFallback((delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
      })
    ),
  ]);
  return { segmenter, face };
}

// ---- The main loop ----
export function startLowPolyCamera({ video, canvas }) {
  const W = OUTPUT_WIDTH;
  const H = OUTPUT_HEIGHT;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  const texture = document.createElement("canvas");
  const textureCtx = texture.getContext("2d", { willReadFrequently: true });
  texture.width = TEXTURE_WIDTH;
  texture.height = Math.round((TEXTURE_WIDTH * H) / W);

  let models = null;
  let stopped = false;
  let frameId = 0;
  let frameCount = 0;
  let lastTimestamp = 0;
  const bodyShape = { center: null, radii: null }; // remembered between frames, for smoothing
  let body = null; // the latest body outline (re-measured every other frame)
  const faceState = { points: null, triangles: null };
  const stickers = createStickers();

  createModels()
    .then((m) => {
      if (stopped) {
        m.segmenter.close();
        m.face.close();
      } else {
        models = m;
      }
    })
    .catch((error) => console.warn("Low-poly filter: couldn't load the AI models.", error));

  function drawFrame(now) {
    frameId = requestAnimationFrame(drawFrame);
    if (video.readyState < 2 || !video.videoWidth) return; // camera not ready yet
    frameCount++;

    // The part of the camera image that fits our 3:4 picture (like
    // `object-fit: cover`: crop the edges, keep the middle).
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const crop = coverCrop(vw, vh, W / H);

    // 1. Background: the normal camera image, mirrored like a selfie camera
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
    ctx.restore();

    // 2 + 3. Ask the AI models where the person and face are
    let face = null;
    if (models) {
      // The models need a timestamp that always goes up.
      lastTimestamp = Math.max(performance.now(), lastTimestamp + 1);

      // The body outline changes slowly, so measuring it every other frame
      // saves battery without looking different.
      if (frameCount % 2 === 0 || !body) {
        const result = models.segmenter.segmentForVideo(video, lastTimestamp);
        const mask = result.confidenceMasks?.[0];
        const found = mask ? maskToPolygon(mask.getAsFloat32Array(), mask.width, mask.height, bodyShape) : null;
        body = found ? toCrop(found, crop, vw, vh) : null;
        result.close();
      }

      const faces = models.face.detectForVideo(video, lastTimestamp);
      const landmarks = faces.faceLandmarks?.[0];
      face = landmarks ? updateFace(faceState, landmarks, crop, vw, vh) : null;
      if (!landmarks) faceState.points = null;
    }

    if (body || face) {
      // A tiny, mirrored copy of the camera: our low-res "texture". We also
      // read its pixels, to pick each facet's flat color.
      textureCtx.save();
      textureCtx.translate(texture.width, 0);
      textureCtx.scale(-1, 1);
      textureCtx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, texture.width, texture.height);
      textureCtx.restore();
      const pixels = textureCtx.getImageData(0, 0, texture.width, texture.height).data;
      const sample = (x, y) => sampleColor(pixels, texture.width, texture.height, x, y);

      // 4a. Hair/neck/shoulders: blurry texture clipped to the chunky outline,
      //     then flat-colored, lit facets.
      if (body) {
        ctx.save();
        tracePolygon(ctx, body.points, W, H);
        ctx.clip();
        drawTexture(ctx, texture, W, H);
        drawBodyFacets(ctx, body, sample, W, H);
        ctx.restore();
      }

      // 4b. The face: a fresh layer of texture, then the triangle mesh on top.
      if (face) {
        ctx.save();
        tracePolygon(ctx, face.outline, W, H);
        ctx.clip();
        drawTexture(ctx, texture, W, H);
        ctx.restore();
        drawFaceFacets(ctx, face, sample, W, H);
      }
    }

    // 5. Floating figures around the edges
    drawStickers(ctx, stickers, now / 1000, W, H);
  }

  frameId = requestAnimationFrame(drawFrame);

  // Call this to stop the filter (e.g. when leaving the page).
  return function stop() {
    stopped = true;
    cancelAnimationFrame(frameId);
    models?.segmenter.close();
    models?.face.close();
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

// Convert a point from "fraction of the whole camera image" (already
// mirrored) to "fraction of our cropped picture". The crop is centered, so
// mirroring doesn't change the math.
function pointToCrop([x, y], crop, videoW, videoH) {
  return [(x * videoW - crop.x) / crop.w, (y * videoH - crop.y) / crop.h];
}

function toCrop(polygon, crop, videoW, videoH) {
  const convert = (p) => pointToCrop(p, crop, videoW, videoH);
  return { points: polygon.points.map(convert), center: convert(polygon.center) };
}

// ---- Drawing helpers ----

function tracePolygon(ctx, points, W, H) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
  ctx.closePath();
}

// Stretch the tiny texture over the whole picture. The stretching makes it
// soft; the blur (about one texture pixel) hides blocky steps for an
// airbrushed look; saturate/contrast give bold, painted colors.
function drawTexture(ctx, texture, W, H) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const blur = (W / TEXTURE_WIDTH) * 0.7;
  ctx.filter = `blur(${blur.toFixed(1)}px) saturate(1.5) contrast(1.12)`;
  ctx.drawImage(texture, 0, 0, W, H);
  ctx.filter = "none";
}

// Average color of the texture around a spot (x, y as fractions 0–1).
function sampleColor(pixels, tw, th, x, y) {
  const ix = Math.min(tw - 1, Math.max(0, Math.floor(x * tw)));
  const iy = Math.min(th - 1, Math.max(0, Math.floor(y * th)));
  const i = (iy * tw + ix) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2]];
}

// Paint one facet: first a flat color (so the triangle reads as one solid
// plane), then a light or dark tint for its lighting.
// `light` goes from -1 (facing away from the light) to 1 (facing it).
function paintFacet(ctx, corners, color, light, W, H) {
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
  ctx.closePath();

  const [r, g, b] = color.map((c) => Math.round(Math.min(255, c * 1.1))); // a touch more vivid
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${FLAT_COLOR})`;
  ctx.fill();

  const strength = Math.min(1, Math.abs(light)) * FACET_SHADING;
  ctx.fillStyle = light > 0 ? `rgba(255, 240, 220, ${(strength * 0.6).toFixed(3)})` : `rgba(20, 10, 30, ${strength.toFixed(3)})`;
  ctx.fill();
}

// Color of a triangle: the average of the texture at its middle and near
// each of its corners.
function facetColor(sample, a, b, c) {
  const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
  const toward = (p) => [mid[0] + (p[0] - mid[0]) * 0.5, mid[1] + (p[1] - mid[1]) * 0.5];
  const colors = [sample(...mid), sample(...toward(a)), sample(...toward(b)), sample(...toward(c))];
  return [0, 1, 2].map((k) => colors.reduce((sum, col) => sum + col[k], 0) / colors.length);
}

// Hair/neck/shoulders: split the outline into triangles fanning out from the
// middle (like slices), each flat-colored and lit by the direction it faces.
// Light comes from the upper left.
function drawBodyFacets(ctx, body, sample, W, H) {
  const { points, center } = body;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    let nx = (a[0] + b[0]) / 2 - center[0];
    let ny = (a[1] + b[1]) / 2 - center[1];
    const len = Math.hypot(nx, ny) || 1;
    const light = (nx / len) * -0.6 + (ny / len) * -0.8;
    paintFacet(ctx, [center, a, b], facetColor(sample, center, a, b), light * 0.6, W, H);
  }
}

// The face mesh: each triangle lit by its real 3D angle.
const LIGHT = normalize([-0.45, -0.55, -0.7]); // from the upper left, in front
function drawFaceFacets(ctx, face, sample, W, H) {
  const p = face.points; // where to draw (fractions of the picture)
  const q = face.lightPoints; // same points in true 3D proportions, for lighting
  for (const [i, j, k] of face.triangles) {
    const a = p[i];
    const b = p[j];
    const c = p[k];
    // The triangle's 3D direction ("normal"), turned to face the camera
    let n = normalize(cross(sub(q[j], q[i]), sub(q[k], q[i])));
    if (n[2] > 0) n = n.map((v) => -v);
    const lambert = dot(n, LIGHT); // ~0.4 (turned away) … 1 (facing the light)
    const light = (lambert - 0.78) * 4;
    paintFacet(ctx, [a, b, c], facetColor(sample, a, b, c), light, W, H);
  }
}

// ---- The face mesh ----

// Turn the 468 landmarks into our ~40 mesh corners (mirrored, cropped, smoothed),
// and on the first frame, decide which corners connect into triangles.
function updateFace(state, landmarks, crop, videoW, videoH) {
  const aspect = crop.w / crop.h;
  const points = FACE_POINTS.map((id) => {
    const lm = landmarks[id];
    const [x, y] = pointToCrop([1 - lm.x, lm.y], crop, videoW, videoH);
    // z (depth) comes in "fraction of image width" units; convert to the same
    // units as y so the 3D angles come out right.
    const z = (lm.z * videoW) / crop.w;
    return [x, y * (1 / aspect), z]; // y scaled so x and y share units
  });

  // Smooth over time so the mesh doesn't jitter
  state.points = state.points
    ? state.points.map((old, i) => old.map((v, k) => v + FACE_SMOOTHING * (points[i][k] - v)))
    : points;

  // Connect the corners into triangles once, then keep that pattern, so
  // triangles don't flip around from frame to frame.
  if (!state.triangles) state.triangles = delaunay(state.points.map(([x, y]) => [x, y]));

  // Back to picture fractions (undo the y scaling) for drawing
  const draw = state.points.map(([x, y]) => [x, y * aspect]);
  return {
    triangles: state.triangles,
    points: draw, // for drawing
    lightPoints: state.points, // x, y, z in the same units, for 3D lighting
    outline: draw.slice(0, 12), // the face outline (first 12 points), for clipping
  };
}

// Delaunay triangulation (Bowyer–Watson): connects points into triangles
// that are as "fat" as possible (no long skinny slivers).
function delaunay(points) {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  const midX = minX + size / 2;
  const midY = minY + size / 2;
  // A giant triangle around everything to start from
  const pts = [...points, [midX - 20 * size, midY - size], [midX, midY + 20 * size], [midX + 20 * size, midY - size]];
  let triangles = [[n, n + 1, n + 2]];

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const bad = triangles.filter((t) => inCircumcircle(p, pts[t[0]], pts[t[1]], pts[t[2]]));
    const edgeCount = new Map();
    for (const [a, b, c] of bad) {
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      }
    }
    triangles = triangles.filter((t) => !bad.includes(t));
    for (const [key, count] of edgeCount) {
      if (count === 1) {
        const [u, v] = key.split(",").map(Number);
        triangles.push([u, v, i]);
      }
    }
  }
  return triangles.filter((t) => t.every((v) => v < n));
}

function inCircumcircle(p, a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return false;
  const a2 = a[0] ** 2 + a[1] ** 2;
  const b2 = b[0] ** 2 + b[1] ** 2;
  const c2 = c[0] ** 2 + c[1] ** 2;
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return (p[0] - ux) ** 2 + (p[1] - uy) ** 2 < (a[0] - ux) ** 2 + (a[1] - uy) ** 2;
}

// Small 3D vector helpers
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(v) {
  const len = Math.hypot(...v) || 1;
  return v.map((x) => x / len);
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

// ---- Turning the AI's person mask into a low-poly outline ----
//
// The segmentation model gives a "mask": for every pixel, how sure it is
// (0–1) that the pixel is part of a person. We:
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
