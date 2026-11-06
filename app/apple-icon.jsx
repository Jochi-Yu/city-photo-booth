// The iPhone home screen icon (180×180 PNG).
// Next.js sees this file name and adds <link rel="apple-touch-icon"> for us.
import { ImageResponse } from "next/og";
import AppIconArt from "../components/AppIconArt";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIconArt size={180} />, size);
}
