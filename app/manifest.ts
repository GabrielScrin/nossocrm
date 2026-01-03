import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CR8',
    short_name: 'CR8',
    description: 'CRM inteligente para gestao de vendas',
    start_url: '/boards',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0ea5e9',
    icons: [
      // SVG icons keep the repo text-only. If you need iOS splash/touch icons later,
      // add PNGs in a follow-up.
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}

