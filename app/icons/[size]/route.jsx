// Serves the larger app icons used by the web app manifest:
//   /icons/192 and /icons/512
import { ImageResponse } from "next/og";
import AppIconArt from "../../../components/AppIconArt";

const SIZES = [192, 512];

// Build these icons ahead of time instead of on every request.
export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}
export const dynamicParams = false;

export async function GET(_request, { params }) {
  const size = Number((await params).size);
  return new ImageResponse(<AppIconArt size={size} />, { width: size, height: size });
}
