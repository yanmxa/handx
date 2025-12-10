'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Auto-redirect to terminal page
    router.push('/terminal');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">HandX</h1>
        <p className="text-gray-400">Hand of the <span className="font-bold text-blue-400">KING</span></p>
        <p className="text-gray-500 text-sm mt-1">Redirecting to terminal...</p>
      </div>
    </div>
  );
}
