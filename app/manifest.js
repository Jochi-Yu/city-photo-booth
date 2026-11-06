// The web app manifest. It tells phones how to install the site as an app.
// Next.js serves this at /manifest.webmanifest and links it in <head>.
export default function manifest() {
  return {
    name: "City Photo Booth",
    short_name: "Photo Booth",
    description: "Four shots, one photo strip.",
    start_url: "/",
    display: "standalone", // open like an app, without browser bars
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
