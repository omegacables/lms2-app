'use client';

import { useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';

export default function TestChaptersPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const addResult = (message: string, data?: any) => {
    setResults(prev => [...prev, { message, data, timestamp: new Date().toISOString() }]);
  };

  const testMetadataColumn = async () => {
    setLoading(true);
    setResults([]);

    try {
      // 1. metadataカラムの確認
      addResult('Checking metadata column existence...');
      const checkResponse = await fetch('/api/debug/check-metadata');
      const checkData = await checkResponse.json();
      addResult('Metadata check result:', checkData);

      // 2. metadataの初期化
      addResult('Initializing metadata for all courses...');
      const setupResponse = await fetch('/api/admin/setup-metadata', {
        method: 'POST'
      });
      const setupData = await setupResponse.json();
      addResult('Setup metadata result:', setupData);

      // 3. テストコースの取得
      addResult('Fetching first course for testing...');
      const coursesResponse = await fetch('/api/courses');
      const coursesData = await coursesResponse.json();
      addResult('Courses:', coursesData);

      if (coursesData.length > 0) {
        const testCourseId = coursesData[0].id;

        // 4. 章の取得
        addResult(`Fetching chapters for course ${testCourseId}...`);
        const chaptersResponse = await fetch(`/api/courses/${testCourseId}/chapters`);
        const chaptersData = await chaptersResponse.json();
        addResult('Chapters data:', chaptersData);

        // 5. 新しい章の追加テスト
        addResult('Testing chapter creation...');
        const createResponse = await fetch(`/api/courses/${testCourseId}/chapters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Test Chapter ' + Date.now() })
        });
        const createData = await createResponse.json();
        addResult('Chapter creation result:', createData);

        // 6. 再度章の取得
        addResult('Fetching chapters again after creation...');
        const chaptersAfterResponse = await fetch(`/api/courses/${testCourseId}/chapters`);
        const chaptersAfterData = await chaptersAfterResponse.json();
        addResult('Chapters after creation:', chaptersAfterData);
      }

    } catch (error) {
      addResult('Error during testing:', error);
    } finally {
      setLoading(false);
    }
  };

  const manualSqlFix = async () => {
    addResult('Manual SQL Fix Required:');
    addResult('Please run the following SQL in your Supabase SQL Editor:');
    addResult('ALTER TABLE courses ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT \'{"chapters": []}\'::jsonb;');
    addResult('After running this SQL, click "Test Metadata Column" again.');
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-6">Chapter System Test</h1>

          <div className="space-y-4 mb-6">
            <Button onClick={testMetadataColumn} disabled={loading}>
              {loading ? 'Testing...' : 'Test Metadata Column'}
            </Button>

            <Button onClick={manualSqlFix} variant="outline">
              Show Manual SQL Fix
            </Button>
          </div>

          <div className="bg-gray-100 dark:bg-neutral-800 rounded-lg p-4 space-y-4">
            {results.map((result, index) => (
              <div key={index} className="border-b border-gray-200 dark:border-neutral-700 pb-2">
                <div className="text-sm text-gray-500">{result.timestamp}</div>
                <div className="font-medium">{result.message}</div>
                {result.data && (
                  <pre className="mt-2 text-xs bg-white dark:bg-neutral-900 p-2 rounded overflow-x-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            {results.length === 0 && (
              <div className="text-gray-500">No test results yet. Click "Test Metadata Column" to start.</div>
            )}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}