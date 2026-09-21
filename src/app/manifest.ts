import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/*
 * Was public/manifest.webmanifest — a second place the product name was
 * written down. Next serves this at the same /manifest.webmanifest URL, so
 * nothing that links to it changes; the difference is that the name now comes
 * from the brand constant like every other surface.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.appName,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/",
    scope: "/",
    id: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#EEF2FA",
    theme_color: "#EEF2FA",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
