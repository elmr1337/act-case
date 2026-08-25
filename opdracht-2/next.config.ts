import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Verplicht voor de slanke Docker-runtime: Next bundelt dan alleen wat de
   * server echt nodig heeft, zodat de image geen node_modules hoeft te bevatten.
   */
  output: "standalone",

  images: {
    /**
     * Alle Storyteq-media loopt door onze eigen proxy, dus er hoeft geen enkele
     * externe host toegestaan te worden. Blijft zo ook werken als Storyteq
     * morgen een ander CDN-domein gebruikt.
     */
    remotePatterns: [],

    /**
     * Next 16 wil dat lokale bronnen mét query-string expliciet toegestaan
     * worden. Dit zijn precies de twee proxy-routes die beeld serveren.
     */
    localPatterns: [
      { pathname: "/api/templates/**", search: "" },
      { pathname: "/api/assets/**", search: "?variant=thumbnail" },
    ],
  },
};

export default nextConfig;
