import "./globals.css";
import styles from "./layout.module.css";

// Page <head> tags. Next.js turns these objects into <meta> and <link> tags.
export const metadata = {
  title: "City Photo Booth",
  description: "Four shots, one photo strip.",
  // iOS "Add to Home Screen" settings:
  appleWebApp: {
    capable: true, // open full screen, without the Safari bars
    title: "Photo Booth", // name under the home screen icon
    statusBarStyle: "black-translucent", // let the app draw behind the status bar
  },
  // Older iOS versions only understand this Apple-specific tag, so add it too.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // no pinch-zoom, like a native app
  viewportFit: "cover", // fill the whole screen, including behind the notch
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* Full screen on phones; a phone-sized frame on laptops and tablets */}
        <div className={styles.stage}>
          <div className={styles.device}>{children}</div>
        </div>
      </body>
    </html>
  );
}
