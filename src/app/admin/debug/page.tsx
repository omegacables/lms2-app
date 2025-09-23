'use client';

import { useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';

export default function DebugPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const checkUserCourses = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // user_coursesテーブルの全データを取得
      const { data: userCourses, error: userCoursesError } = await supabase
        .from('user_courses')
        .select('*')
        .order('created_at', { ascending: false });

      if (userCoursesError) {
        console.error('user_courses error:', userCoursesError);
        setError(`user_courses error: ${userCoursesError.message}`);
      }

      // user_profilesから安藤蓮のIDを取得
      const { data: users, error: usersError } = await supabase
        .from('user_profiles')
        .select('id, display_name, company')
        .like('display_name', '%安藤%');

      if (usersError) {
        console.error('users error:', usersError);
        setError(`users error: ${usersError.message}`);
      }

      // coursesテーブルのデータを取得
      const { data: courses, error: coursesError } = await supabase
        .from('courses')
        .select('id, title, status');

      if (coursesError) {
        console.error('courses error:', coursesError);
        setError(`courses error: ${coursesError.message}`);
      }

      // 安藤蓮のコース割り当てを確認
      let andoAssignments = null;
      if (users && users.length > 0) {
        const andoId = users[0].id;
        const { data: assignments } = await supabase
          .from('user_courses')
          .select(`
            *,
            courses (
              id,
              title,
              description
            )
          `)
          .eq('user_id', andoId);
        
        andoAssignments = assignments;
      }

      setData({
        userCourses: userCourses || [],
        userCoursesCount: userCourses?.length || 0,
        users: users || [],
        courses: courses || [],
        andoAssignments: andoAssignments || [],
        andoInfo: users && users.length > 0 ? users[0] : null
      });

    } catch (error) {
      console.error('Debug error:', error);
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const testAssignCourse = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 安藤蓮のIDを取得
      const { data: users } = await supabase
        .from('user_profiles')
        .select('id')
        .like('display_name', '%安藤%')
        .single();

      if (!users) {
        setError('安藤蓮が見つかりません');
        return;
      }

      // 最初のコースを取得
      const { data: courses } = await supabase
        .from('courses')
        .select('id')
        .eq('status', 'active')
        .limit(1)
        .single();

      if (!courses) {
        setError('アクティブなコースが見つかりません');
        return;
      }

      // コース割り当てを作成
      const { data, error } = await supabase
        .from('user_courses')
        .insert({
          user_id: users.id,
          course_id: courses.id,
          status: 'assigned'
        })
        .select();

      if (error) {
        setError(`割り当てエラー: ${error.message}`);
      } else {
        alert('コースを割り当てました');
        await checkUserCourses();
      }

    } catch (error) {
      console.error('Test assign error:', error);
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">デバッグ: user_courses確認</h1>
          
          <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 mb-6">
            <div className="flex space-x-4 mb-6">
              <Button onClick={checkUserCourses} disabled={loading}>
                データ確認
              </Button>
              <Button onClick={testAssignCourse} disabled={loading} variant="outline">
                テスト割り当て
              </Button>
            </div>

            {loading && (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="lg" />
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg mb-4">
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {data && (
              <div className="space-y-6">
                {/* 安藤蓮の情報 */}
                {data.andoInfo && (
                  <div>
                    <h2 className="text-lg font-semibold mb-2">安藤蓮の情報</h2>
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p>ID: {data.andoInfo.id}</p>
                      <p>名前: {data.andoInfo.display_name}</p>
                      <p>会社: {data.andoInfo.company || '未設定'}</p>
                    </div>
                  </div>
                )}

                {/* 安藤蓮のコース割り当て */}
                <div>
                  <h2 className="text-lg font-semibold mb-2">
                    安藤蓮のコース割り当て ({data.andoAssignments.length}件)
                  </h2>
                  {data.andoAssignments.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">割り当てなし</p>
                  ) : (
                    <div className="space-y-2">
                      {data.andoAssignments.map((assignment: any) => (
                        <div key={assignment.id} className="p-3 bg-gray-50 dark:bg-black rounded">
                          <p className="font-medium">
                            {assignment.courses?.title || `コースID: ${assignment.course_id}`}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            割当日: {new Date(assignment.assigned_at || assignment.created_at).toLocaleString('ja-JP')}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            ステータス: {assignment.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 全user_coursesデータ */}
                <div>
                  <h2 className="text-lg font-semibold mb-2">
                    user_coursesテーブル全体 ({data.userCoursesCount}件)
                  </h2>
                  {data.userCoursesCount === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">データなし</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 dark:bg-black">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">User ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Course ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Assigned At</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200">
                          {data.userCourses.map((uc: any) => (
                            <tr key={uc.id}>
                              <td className="px-3 py-2 text-sm">{uc.id}</td>
                              <td className="px-3 py-2 text-sm text-xs">{uc.user_id}</td>
                              <td className="px-3 py-2 text-sm">{uc.course_id}</td>
                              <td className="px-3 py-2 text-sm">{uc.status}</td>
                              <td className="px-3 py-2 text-sm">
                                {new Date(uc.assigned_at || uc.created_at).toLocaleString('ja-JP')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* コース一覧 */}
                <div>
                  <h2 className="text-lg font-semibold mb-2">利用可能なコース</h2>
                  <div className="space-y-1">
                    {data.courses.map((course: any) => (
                      <div key={course.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-black rounded">
                        <span>{course.title}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">ID: {course.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}