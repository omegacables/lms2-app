'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { RecordsPanel } from '@/components/records/RecordsPanel';

// 社労士の帳票・実施記録出力（担当会社の受講者だけ。絞り込みは API 側で行う）
export default function LaborConsultantRecordsPage() {
  return (
    <AuthGuard requiredRoles={['labor_consultant', 'admin']}>
      <MainLayout>
        <RecordsPanel audience="consultant" />
      </MainLayout>
    </AuthGuard>
  );
}
