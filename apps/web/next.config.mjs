import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The design packages ship TypeScript sources rather than build output, and they
  // use NodeNext-style specifiers ('./units.js' pointing at units.ts) because that is
  // what `tsc -b` and vitest require. The bundler needs to be told to try .ts first,
  // or every relative import inside those packages fails to resolve.
  transpilePackages: ['@kreart/design-core', '@kreart/design-fabric'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}

export default withPayload(nextConfig)
