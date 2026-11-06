/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js blocks other devices on your Wi-Fi from loading dev-server files.
  // Listing your laptop's local address lets your phone open the dev site.
  // If your laptop's address changes, update it here (or add more).
  allowedDevOrigins: ["10.5.10.159"],
};

export default nextConfig;
