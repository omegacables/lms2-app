import { redirect } from 'next/navigation';

export default function Home() {
  // ホームページアクセス時はログインページにリダイレクト
  redirect('/auth/login');
}
