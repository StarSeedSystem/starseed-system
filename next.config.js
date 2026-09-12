/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Excluir módulos nativos del bundle de webpack
  webpack: (config, { isServer }) => {
    if (isServer) {
      // En servidor, estos módulos se requieren externamente
      config.externals = config.externals || [];
      config.externals.push('sqlite3', 'sqlite-vec');
    } else {
      // En cliente, ignorarlos
      config.resolve = config.resolve || {};
      config.resolve.alias = config.resolve.alias || {};
      config.resolve.alias['sqlite3'] = false;
      config.resolve.alias['sqlite-vec'] = false;
    }

    // Manejar esquema node:
    config.resolve = config.resolve || {};
    config.resolve.fallback = config.resolve.fallback || {};
    config.resolve.fallback['node:process'] = false;

    return config;
  },

  // Páginas que usan APIs de servidor (no estáticas)
  serverExternalPackages: ['sqlite3', 'sqlite-vec'],
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
