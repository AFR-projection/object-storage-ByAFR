import type { MetadataRoute } from "next";

/**
 * PWA manifest — makes the app installable to the home screen and lets it run
 * standalone (fullscreen, no browser chrome). Colors mirror the design tokens
 * in globals.css (dark background, indigo accent) so the splash matches the app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Storage ByAFR",
    short_name: "Storage",
    description: "Premium cloud storage — fast, secure, and elegant",
    start_url: "/files",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0d14",
    theme_color: "#0b0d14",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
