"use client";

import dynamic from 'next/dynamic';

// O dynamic com ssr: false agora é chamado de dentro de um Client Component
const CanvasEditor = dynamic(() => import('@/src/components/CanvasEditor'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen w-screen bg-black text-white">Carregando Editor...</div>
});

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <CanvasEditor />
    </main>
  );
}