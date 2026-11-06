"use client"; // Needs the browser for the tap + zoom animation.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PhotoBoothArt from "../components/PhotoBoothArt";
import styles from "./page.module.css";

// How long the "walk into the booth" zoom lasts before the camera opens.
const ENTER_DURATION_MS = 900;

export default function Home() {
  const router = useRouter();
  const [entering, setEntering] = useState(false);

  // Start loading the camera page in the background so it opens instantly.
  useEffect(() => {
    router.prefetch("/booth");
  }, [router]);

  function enterBooth() {
    if (entering) return;
    setEntering(true);
    setTimeout(() => router.push("/booth"), ENTER_DURATION_MS);
  }

  return (
    <main className={`${styles.home} ${entering ? styles.homeEntering : ""}`}>
      {/* The scene keeps the photo's shape and is scaled to cover the screen,
          so the booth always stays in the same spot on the photo. */}
      <div className={`${styles.scene} ${entering ? styles.sceneEntering : ""}`}>
        <img src="/landscape.jpg" alt="" className={styles.landscape} />

        <span className={styles.castShadow} aria-hidden="true" />
        <span className={styles.contactShadow} aria-hidden="true" />

        <button className={styles.booth} onClick={enterBooth} aria-label="Step inside the photo booth">
          <PhotoBoothArt idPrefix="booth" className={styles.boothArt} />
        </button>

        {/* Film grain over everything, so the drawn booth matches the photo */}
        <span className={styles.grain} aria-hidden="true" />
      </div>

      {/* Not shown on screen, but screen readers still announce the page name */}
      <h1 className={styles.visuallyHidden}>City Photo Booth</h1>
      <p className={styles.hint}>Tap the booth to step inside</p>

      {/* Fades to black at the end of the zoom, to match the camera screen */}
      <div className={`${styles.fade} ${entering ? styles.fadeIn : ""}`} />
    </main>
  );
}
