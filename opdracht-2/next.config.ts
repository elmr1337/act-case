import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Verplicht voor de slanke Docker-runtime: Next bundelt dan alleen wat de
   * server echt nodig heeft, zodat de image geen node_modules hoeft te bevatten.
   */
  output: "standalone",

  /**
   * Alle Storyteq-media loopt door onze eigen proxy (/api/assets/[id]/download),
   * dus we hoeven geen externe hosts toe te staan. Blijft zo ook werken als
   * Storyteq morgen een ander CDN-domein gebruikt.
   */
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
