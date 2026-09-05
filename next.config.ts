import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The endpoint kiosk + parent controller are one PWA. Service worker and
  // manifest are served from /public. Headers below keep the SW un-cached so
  // kiosk devices always pick up new control logic on relaunch.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
