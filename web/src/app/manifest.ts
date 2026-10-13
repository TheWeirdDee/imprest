import type { MetadataRoute } from "next";

/** Web app manifest: name, colors and the PNG logo for home-screen installs and link previews. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Imprest: funded trading desks on Perpl",
    short_name: "Imprest",
    description:
      "Funded trading desks for perpetual futures on Perpl (Monad). Rules enforced by contract at the order layer. Monad testnet, test tokens only.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#f6f5f1",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
