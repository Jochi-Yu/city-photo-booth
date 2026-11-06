# City Photo Booth

A phone-first photo booth web app built with Next.js.

The homepage is a golden-hour photo of green hills with a brushed-steel photo booth
standing on a sunlit mound. Tap the booth to zoom inside, where the camera opens. Tap the
shutter, get a 3-2-1 countdown before each of 4 photos, and see them stacked
into a photo strip you can save to Photos.

Inside the booth, the camera has a **low-poly filter**: you appear as a chunky,
angular shape with a soft, low-resolution "texture", like an early 3D video
game character, while the room behind you stays as it is. Cut-out figures
(people and a horse) float slowly around the edges of the picture.

## How the low-poly filter works

The filter lives in `lib/lowPolyCamera.js`. Each frame it:

1. Draws the normal camera image as the background, cropped to 3:4.
2. Uses [MediaPipe selfie segmentation](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter)
   to find the person, and traces their outline (hair, neck, shoulders) with
   only 12 corners.
3. Uses [MediaPipe face landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker),
   which tracks 468 points on the face in 3D, and connects ~40 of them (jaw,
   cheekbones, brows, eyes, nose, mouth) into a triangle mesh: a low-poly head.
4. Fills everything with a tiny (64px wide), blurred-up copy of the camera,
   then gives each triangle a flat color and a light/dark tint based on its 3D
   angle. Those flat planes are what makes it look low-poly.
5. Draws the floating figures from `public/stickers/` drifting around the edges.

The viewfinder is 3:4 like the iPhone camera, and the photos are exactly what
the viewfinder shows (figures included).

- **Privacy:** the camera images are processed on the device and never
  uploaded. The app does download the two AI models (from Google) and their
  engine (from the jsDelivr CDN) the first time the camera opens, so it needs
  internet.
- **One person works best.** With two people, the outline merges them into
  one shape, and only one face gets the mesh.
- **Settings** (top of `lib/lowPolyCamera.js`): `FLAT_COLOR` (how flat each
  facet is, the main "low-poly" control), `FACET_SHADING` (lighting strength),
  `TEXTURE_WIDTH` (lower = blurrier), `POLY_POINTS` (fewer = chunkier body),
  `SMOOTHING`, `FACE_POINTS` (which face points become mesh corners), and for
  the figures `STICKERS`, `STICKER_SIZE` and `STICKER_SPEED`.
- **Adding a figure:** save a PNG with a transparent background in
  `public/stickers/` and add its file name (without `.png`) to `STICKERS`.
- **Dev-only note:** in `npm run dev`, Next.js may show "1 Issue" saying
  "Created TensorFlow Lite XNNPACK delegate for CPU". That's an info message
  from MediaPipe, not an error, and it doesn't appear on the live site.

## Setup (first time only)

You need [Node.js](https://nodejs.org) installed. Then, in a terminal:

```bash
cd ~/Documents/"city photo booth"
npm install
```

## Run it on your laptop

```bash
npm run dev
```

Open http://localhost:3000 and click **Allow** when the browser asks for your camera.

## Try it on your iPhone

Browsers only allow the camera on **secure** pages: `https://` addresses, or
`localhost` on the same computer. Opening your laptop's Wi-Fi address on your
phone (like `http://10.5.10.159:3000`) loads the page, but the camera stays
off and you'll see the "Can't reach the camera" screen.

To test on a phone, put the app on an `https://` address. The easiest way is
to deploy it for free on [Vercel](https://vercel.com).

### Add it to your home screen

In Safari on the `https://` address, tap **Share → Add to Home Screen**. It
opens full screen with its own icon, like a native app.

## Where things are

| File | What it does |
| --- | --- |
| `app/page.jsx` | Homepage: the landscape, the booth, its shadow, film grain and the zoom-in |
| `app/page.module.css` | Homepage styling, including where the booth sits on the photo |
| `components/PhotoBoothArt.jsx` | The steel booth, drawn as an SVG |
| `public/landscape.jpg` | The landscape photo (1200 × 796) |
| `app/booth/page.jsx` | The camera: countdown, flash, strip, Save/Retake, help screens |
| `lib/lowPolyCamera.js` | The low-poly camera filter and floating figures |
| `public/stickers/` | The floating figures (transparent PNG cut-outs) |
| `app/booth/page.module.css` | Styling for the camera screens |
| `app/globals.css` | Colors and page basics. Includes the iPhone safe-area spacing |
| `app/layout.jsx` | `<head>` tags: iOS home-screen settings, theme color, viewport |
| `app/manifest.js` | Web app manifest: app name, standalone display, icons |
| `components/AppIconArt.jsx` | The app icon design (used for every icon size) |
| `app/apple-icon.jsx`, `app/icon.jsx`, `app/icons/[size]/route.jsx` | Turn the icon design into PNG files |
| `next.config.mjs` | Lets your phone load the dev server over Wi-Fi |

## Easy things to change

**Moving or resizing the booth:** in `app/page.module.css`, `.booth` uses
`left` (side to side), `top` (where its base sits) and `width` (its size), all
as percentages of the photo. Move `.castShadow` and
`.contactShadow` along with it. If you swap in a photo with a different shape,
update the two size numbers on `.scene` too.

At the top of `app/booth/page.jsx`:

- `SHOTS`: how many photos per strip
- `COUNTDOWN_FROM`: countdown length before each photo
- `PHOTO_ASPECT`: the shape of each photo (`4 / 3` is landscape, `1` is square)

## How Save works

- **On a phone:** opens the share sheet with the strip as an image file. Tap
  **Save Image** to put it in Photos.
- **On a laptop:** downloads the strip as a `.jpg`.
