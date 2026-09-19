import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // R3F 9.7 tears the WebGL context down 500 ms after StrictMode's simulated
  // unmount (development only), leaving a black canvas. See DECISIONS.md S11.
  reactStrictMode: false,
};

export default nextConfig;
