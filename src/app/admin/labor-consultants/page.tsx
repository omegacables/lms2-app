'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import {
  UsersIcon,
  BuildingOffice2Icon,
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

interface LaborConsultant {
  id: string;
  display_name: string;
  email: string;
  company: string;
  assignedCompanies: string[];
}

export default function LaborConsultantsPage() {
  const { user, isAdmin } = useAuth();
  const [consultants, setConsultants] = useState<LaborConsultant[]>([]);
  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConsultant, setSelectedConsultant] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('');

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // 社労士事務所ユーザーを取得
      const { data: consultantsData, error: consultantsError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('role', 'labor_consultant')
        .order('display_name', { ascending: true });

      if (consultantsError) {
        console.error('社労士事務所データ取得エラー:', consultantsError);
        return;
      }

      // 各社労士事務所の担当会社を取得
      const consultantsWithAssignments = await Promise.all(
        (consultantsData || []).map(async (consultant) => {
          const { data: assignmentsData } = await supabase
            .from('labor_consultant_companies')
            .select('company')
            .eq('labor_consultant_id', consultant.id);

          return {
            id: consultant.id,
            display_name: consultant.display_name || '',
            email: consultant.email || '',
            company: consultant.company || '',
            assignedCompanies: assignmentsData?.map(a => a.company) || [],
          };
        })
      );

      setConsultants(consultantsWithAssignments);

      // 利用可能な会社一覧を取得（生徒の会社一覧）
      const { data: companiesData } = await supabase
        .from('user_profiles')
        .select('company')
        .eq('role', 'student')
        .not('company', 'is', null);

      const uniqueCompanies = Array.from(
        new Set(companiesData?.map(u => u.company).filter(c => c) as string[])
      ).sort();

      setAvailableCompanies(uniqueCompanies);
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAssignment = async () => {
    if (!selectedConsultant || !selectedCompany) {
      alert('社労士事務所と会社を選択してください。');
      return;
    }

    try {
      const { error } = await supabase
        .from('labor_consultant_companies')
        .insert({
          labor_consultant_id: selectedConsultant,
          company: selectedCompany,
          assigned_by: user?.id,
        });

      if (error) {
        console.error('割り当てエラー:', error);
        alert('割り当てに失敗しました。');
        return;
      }

      alert('担当会社を割り当てました。');
      setSelectedCompany('');
      await fetchData();
    } catch (error) {
      console.error('割り当てエラー:', error);
      alert('割り当て中にエラーが発生しました。');
    }
  };

  const handleRemoveAssignment = async (consultantId: string, company: string) => {
    if (!confirm(`本当に「${company}」の割り当てを削除しますか？`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('labor_consultant_companies')
        .delete()
        .eq('labor_consultant_id', consultantId)
        .eq('company', company);

      if (error) {
        console.error('削除エラー:', error);
        alert('削除に失敗しました。');
        return;
      }

      alert('担当会社を削除しました。');
      await fetchData();
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除中にエラーが発生しました。');
    }
  };

  const filteredConsultants = consultants.filter(consultant =>
    consultant.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    consultant.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    consultant.company?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAdmin && user) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="max-w-2xl mx-auto px-4 py-16 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              アクセス権限がありません
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              この機能は管理者のみ利用可能です。
            </p>
            <Link href="/dashboard">
              <Button>ダッシュボードに戻る</Button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  if (loading) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="container mx-auto px-4 py-8">
            <div className="flex justify-center items-center min-h-64">
              <LoadingSpinner size="lg" />
            </div>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* ヘッダーセクション */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                  <BuildingOffice2Icon className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    社労士事務所 担当会社管理
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    社労士事務所に担当会社を割り当てます。
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 統計サマリー */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <UsersIcon className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    社労士事務所数
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {consultants.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <BuildingOffice2Icon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    会社数
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {availableCompanies.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <BuildingOffice2Icon className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    総割り当て数
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {consultants.reduce((sum, c) => sum + c.assignedCompanies.length, 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 検索セクション */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6 mb-8">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="社労士事務所を検索..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* 社労士事務所一覧 */}
          <div className="space-y-6">
            {filteredConsultants.map((consultant) => (
              <div
                key={consultant.id}
                className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {consultant.display_name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {consultant.email}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                      所属: {consultant.company || '未設定'}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedConsultant(
                      selectedConsultant === consultant.id ? null : consultant.id
                    )}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md flex items-center"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    会社を割り当て
                  </button>
                </div>

                {/* 割り当てフォーム */}
                {selectedConsultant === consultant.id && (
                  <div className="mb-4 p-4 bg-gray-50 dark:bg-neutral-800 rounded-md">
                    <div className="flex items-end space-x-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          担当会社を選択
                        </label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={selectedCompany}
                          onChange={(e) => setSelectedCompany(e.target.value)}
                        >
                          <option value="">会社を選択してください</option>
                          {availableCompanies
                            .filter(company => !consultant.assignedCompanies.includes(company))
                            .map((company) => (
                              <option key={company} value={company}>
                                {company}
                              </option>
                            ))}
                        </select>
                      </div>
                      <Button
                        onClick={handleAddAssignment}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        追加
                      </Button>
                    </div>
                  </div>
                )}

                {/* 担当会社一覧 */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    担当会社 ({consultant.assignedCompanies.length})
                  </h4>
                  {consultant.assignedCompanies.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      担当会社が割り当てられていません
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {consultant.assignedCompanies.map((company) => (
                        <div
                          key={company}
                          className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm"
                        >
                          <BuildingOffice2Icon className="h-4 w-4 mr-1" />
                          {company}
                          <button
                            onClick={() => handleRemoveAssignment(consultant.id, company)}
                            className="ml-2 text-purple-600 hover:text-purple-800"
                            title="削除"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {filteredConsultants.length === 0 && (
              <div className="text-center py-12">
                <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  社労士事務所が見つかりません
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  検索条件を変更するか、社労士事務所ユーザーを作成してください。
                </p>
              </div>
            )}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
