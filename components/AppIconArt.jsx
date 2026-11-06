// The app icon drawing, shared by every icon size.
// It's rendered to a PNG by Next.js's ImageResponse, which supports a subset
// of CSS (flexbox, borders, gradients), so we use inline styles here.
export default function AppIconArt({ size }) {
  const ring = Math.round(size * 0.52);
  const border = Math.round(size * 0.05);
  const dot = Math.round(size * 0.32);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #ff6b8f 0%, #ff2d55 100%)",
      }}
    >
      {/* A shutter button: white ring with a white dot inside */}
      <div
        style={{
          width: ring,
          height: ring,
          borderRadius: "50%",
          border: `${border}px solid white`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: dot, height: dot, borderRadius: "50%", background: "white" }} />
      </div>
    </div>
  );
}
