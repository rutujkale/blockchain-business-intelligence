import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The QA harness builds with `--webpack` (Turbopack cannot resolve
   * `next/font/google` here) and then runs `next start`. If it wrote into the
   * default `.next`, a later `npm run build` would inherit those webpack
   * artifacts and fail resolving the font CSS Turbopack generates, with an
   * error about a `@vercel/turbopack-next` package that does not exist.
   * Keeping the harness in its own directory makes the two builds independent.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
