import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gente Digital',
    short_name: 'Gente Digital',
    description: 'Gestão de Links de Indicação para colaboradores.',
    start_url: '/?tab=colaboradores',
    display: 'standalone',
    background_color: '#111827',
    theme_color: '#FFC700',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
