'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CoursesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // /courses から /my-courses にリダイレクト
    router.replace('/my-courses');
  }, [router]);

  return null;
}