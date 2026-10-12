import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // Both imports are optional in their upstream packages and are unused in
      // this browser-only app. Resolve them as unavailable to avoid bundler warnings.
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    },
  },
};

export default nextConfig;
