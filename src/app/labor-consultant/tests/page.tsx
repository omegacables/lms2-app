'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { TestResultsPanel } from '@/components/records/TestResultsPanel';

// 社労士のテスト・添削の閲覧（担当会社の受講者だけ。絞り込みは API 側で行う）
export default function LaborConsultantTestsPage() {
  return (
    <AuthGuard requiredRoles={['labor_consultant', 'admin']}>
      <MainLayout>
        <TestResultsPanel audience="consultant" />
      </MainLayout>
    </AuthGuard>
  );
}
