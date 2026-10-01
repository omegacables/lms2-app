'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { RecordsPanel } from '@/components/records/RecordsPanel';

export default function AdminRecordsPage() {
  return (
    <AuthGuard requiredRoles={['admin', 'instructor']}>
      <MainLayout>
        <RecordsPanel audience="admin" />
      </MainLayout>
    </AuthGuard>
  );
}
