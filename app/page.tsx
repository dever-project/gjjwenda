'use client';
import { useStore } from '@/store/useStore';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/student');
      }
    } else {
      router.push('/login');
    }
  }, [currentUser, router]);

  return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
}
