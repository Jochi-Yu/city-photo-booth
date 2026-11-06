"use client"; // This page uses the camera, so it must run in the browser.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { OUTPUT_HEIGHT, OUTPUT_WIDTH, startLowPolyCamera } from "../../lib/lowPolyCamera";
import styles from "./page.module.css";

// ---- Settings you can tweak ----
const SHOTS = 4; // photos per strip
const COUNTDOWN_FROM = 3; // 3-2-1 before each photo
// Width ÷ height of each photo. It matches the viewfinder (3:4, set in
// lib/lowPolyCamera.js), so the photo is exactly what you see on screen.
const PHOTO_ASPECT = OUTPUT_WIDTH / OUTPUT_HEIGHT;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function PhotoBooth() {
  const videoRef = useRef(null); // the raw camera (hidden)
  const canvasRef = useRef(null); // the low-poly version you see
  const streamRef = useRef(null);

  // Camera status: "starting" | "ready" | "denied" | "unavailable"
  const [camera, setCamera] = useState("starting");
  // Which screen we're on: "camera" | "shooting" | "result"
  const [phase, setPhase] = useState("camera");
  const [count, setCount] = useState(null); // number shown in the countdown
  const [shot, setShot] = useState(0); // which photo we're on (1–4)
  const [flashKey, setFlashKey] = useState(0); // changes to replay the flash
  const [strip, setStrip] = useState(null); // { url, file } of the finished strip

  // ---- Camera ----
  const startCamera = useCallback(async () => {
    setCamera("starting");

    // The camera API only exists on secure pages (https:// or localhost).
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      // Turn off any older stream before using the new one.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setCamera("ready");
    } catch (error) {
      // NotAllowedError = the person (or a setting) said no to the camera.
      setCamera(error.name === "NotAllowedError" ? "denied" : "unavailable");
    }
  }, []);

  useEffect(() => {
    startCamera();
    // Turn the camera off when leaving the page.
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [startCamera]);

  // Once the camera is on, start drawing the low-poly filter onto the canvas.
  useEffect(() => {
    if (camera !== "ready") return;
    const stop = startLowPolyCamera({ video: videoRef.current, canvas: canvasRef.current });
    return stop; // stops the filter when leaving the page
  }, [camera]);

  // ---- Taking the photos ----
  async function takePhotos() {
    if (phase !== "camera" || camera !== "ready") return;
    setPhase("shooting");

    const frames = [];
    for (let i = 1; i <= SHOTS; i++) {
      setShot(i);
      for (let n = COUNTDOWN_FROM; n > 0; n--) {
        setCount(n);
        await wait(1000);
      }
      setCount(null);
      frames.push(captureFrame(canvasRef.current));
      setFlashKey((k) => k + 1);
      await wait(500);
    }

    const canvas = buildStrip(frames);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    // Create the file now, so tapping Save can open the share sheet instantly.
    // (Safari only allows sharing right after a tap, so there's no time to spare.)
    const file = new File([blob], `photo-strip-${Date.now()}.jpg`, { type: "image/jpeg" });
    setStrip({ url: URL.createObjectURL(blob), file });
    setPhase("result");
  }

  // ---- Results ----
  async function saveStrip() {
    const { file, url } = strip;
    const isPhone = window.matchMedia("(pointer: coarse)").matches;

    // Phones: open the share sheet, which has "Save Image".
    if (isPhone && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (error) {
        // AbortError just means they closed the share sheet. Anything else: fall back.
        if (error.name !== "AbortError") downloadFile(url, file.name);
      }
      return;
    }

    // Laptops: download the image.
    downloadFile(url, file.name);
  }

  function retake() {
    URL.revokeObjectURL(strip.url); // free the memory used by the old strip
    setStrip(null);
    setShot(0);
    setPhase("camera");
    videoRef.current?.play();
  }

  return (
    <main className={styles.app}>
      {/* The raw camera feed. It's hidden: the filter reads from it and draws
          onto the canvas below. playsInline stops iPhone from opening its own
          fullscreen player. */}
      <video ref={videoRef} className={styles.hiddenVideo} playsInline muted autoPlay />

      {/* What you actually see (and what gets photographed): the 3:4
          viewfinder with the low-poly filter and floating figures */}
      <canvas ref={canvasRef} className={styles.preview} />

      {camera === "starting" && <p className={styles.status}>Starting camera…</p>}
      {camera === "denied" && <CameraDenied onRetry={startCamera} />}
      {camera === "unavailable" && <CameraUnavailable onRetry={startCamera} />}

      {/* Back to the landscape homepage (hidden mid-shoot and on the results screen) */}
      {phase === "camera" && (
        <Link href="/" className={styles.backButton} aria-label="Leave the booth">
          ‹
        </Link>
      )}

      {phase === "shooting" && (
        <div className={styles.shotCounter}>
          {shot} of {SHOTS}
        </div>
      )}

      {count && (
        // A new key each number replays the "pop" animation.
        <div key={`count-${count}`} className={styles.countdown}>
          {count}
        </div>
      )}

      {flashKey > 0 && <div key={`flash-${flashKey}`} className={styles.flash} />}

      {camera === "ready" && phase !== "result" && (
        <div className={styles.controls}>
          <button
            className={styles.shutter}
            onClick={takePhotos}
            disabled={phase === "shooting"}
            aria-label="Take photos"
          >
            <span className={styles.shutterInner} />
          </button>
        </div>
      )}

      {phase === "result" && strip && (
        <section className={styles.results}>
          <div className={styles.stripArea}>
            <img src={strip.url} alt="Your photo strip" className={styles.stripImage} />
          </div>
          <div className={styles.resultButtons}>
            <button className={`${styles.pillButton} ${styles.secondary}`} onClick={retake}>
              Retake
            </button>
            <button className={`${styles.pillButton} ${styles.primary}`} onClick={saveStrip}>
              Save
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

// ---- Friendly error screens ----
function CameraDenied({ onRetry }) {
  return (
    <section className={styles.help}>
      <div className={styles.helpIcon} aria-hidden>📷</div>
      <h1 className={styles.helpTitle}>Camera access is off</h1>
      <p className={styles.helpText}>
        Photo Booth needs your camera to take pictures. Here&apos;s how to turn it back on:
      </p>
      <ul className={styles.helpList}>
        <li>
          <strong>iPhone, in Safari:</strong> tap <strong>aA</strong> in the address bar →{" "}
          <strong>Website Settings</strong> → <strong>Camera</strong> → <strong>Allow</strong>.
        </li>
        <li>
          <strong>iPhone, from the home screen:</strong> open <strong>Settings</strong> →{" "}
          <strong>Apps</strong> → <strong>Safari</strong> → <strong>Camera</strong> → <strong>Allow</strong>.
        </li>
        <li>
          <strong>On a laptop:</strong> click the camera or lock icon in the address bar and allow the
          camera.
        </li>
      </ul>
      <button className={`${styles.pillButton} ${styles.primary} ${styles.helpButton}`} onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}

function CameraUnavailable({ onRetry }) {
  return (
    <section className={styles.help}>
      <div className={styles.helpIcon} aria-hidden>🔌</div>
      <h1 className={styles.helpTitle}>Can&apos;t reach the camera</h1>
      <p className={styles.helpText}>
        We couldn&apos;t find a camera we can use. Make sure no other app is using it. The camera
        also only works on secure pages (addresses starting with https:// or localhost).
      </p>
      <button className={`${styles.pillButton} ${styles.primary} ${styles.helpButton}`} onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}

// ---- Image helpers ----

// Copy the current filtered frame to a new canvas, cropped to PHOTO_ASPECT.
// (The filter already mirrors the image, so we don't flip it here.)
function captureFrame(source) {
  const vw = source.width;
  const vh = source.height;

  // Largest centered rectangle with the right shape.
  let sw = vw;
  let sh = vw / PHOTO_ASPECT;
  if (sh > vh) {
    sh = vh;
    sw = vh * PHOTO_ASPECT;
  }
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Stack the photos vertically on white, like a classic booth strip.
function buildStrip(frames) {
  const border = 40;
  const gap = 24;
  const footer = 110;
  const w = frames[0].width;
  const h = frames[0].height;

  const strip = document.createElement("canvas");
  strip.width = w + border * 2;
  strip.height = border + frames.length * h + (frames.length - 1) * gap + footer;
  const ctx = strip.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, strip.width, strip.height);

  frames.forEach((frame, i) => {
    ctx.drawImage(frame, border, border + i * (h + gap));
  });

  // Small date at the bottom
  ctx.fillStyle = "#8e8e93";
  ctx.font = "500 30px -apple-system, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  const date = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  ctx.fillText(date, strip.width / 2, strip.height - footer / 2 + 10);

  return strip;
}

function downloadFile(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}
