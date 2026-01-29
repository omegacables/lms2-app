'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  DocumentArrowDownIcon,
  DocumentArrowUpIcon,
  EyeIcon,
  AcademicCapIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleIconSolid
} from '@heroicons/react/24/solid';

interface Student {
  id: string;
  display_name: string;
  email: string;
  company: string;
  department: string;
  role: 'admin' | 'instructor' | 'student' | 'labor_consultant';
  last_login_at: string;
  is_active: boolean;
  created_at: string;
  courseStats: {
    totalAssigned: number;
    completed: number;
    inProgress: number;
    totalWatchTime: number;
    completionRate: number;
  };
  assignedCourses?: number[]; // 割り当てられたコースIDのリスト
}

interface Course {
  id: number;
  title: string;
  description?: string;
  category?: string;
  difficulty_level?: string;
  estimated_duration?: number;
}

// LearningLog interface removed - now in separate learning logs page

export default function StudentsManagePage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [savingAssignments, setSavingAssignments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'company' | 'created'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [exportingCSV, setExportingCSV] = useState(false);
  const [importingCSV, setImportingCSV] = useState(false);
  const [groupByCompany, setGroupByCompany] = useState(true);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchStudents();
    fetchCourses();
  }, []);

  // 初期表示時に全ての会社を展開
  useEffect(() => {
    if (students.length > 0) {
      const companies = new Set(students.map(s => s.company || '個人'));
      setExpandedCompanies(companies);
    }
  }, [students]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      
      // 全ユーザーを取得（管理者を含む）
      const { data: studentsData, error: studentsError } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (studentsError) {
        console.error('学生データ取得エラー:', studentsError);
        return;
      }

      // emailがnullの場合はauth.usersから取得
      const studentsWithEmail = await Promise.all(
        (studentsData || []).map(async (student) => {
          if (!student.email) {
            const { data: authData } = await supabase
              .from('auth.users')
              .select('email')
              .eq('id', student.id)
              .single();
            
            if (authData?.email) {
              // user_profilesにemailを更新
              await supabase
                .from('user_profiles')
                .update({ email: authData.email })
                .eq('id', student.id);
              
              return { ...student, email: authData.email };
            }
          }
          return student;
        })
      );

      // 各学生の学習統計と割り当てられたコースを取得
      const studentsWithStats = await Promise.all(
        studentsWithEmail.map(async (student) => {
          try {
            // 割り当てられたコースを取得
            const { data: assignedCoursesData } = await supabase
              .from('user_course_assignments')
              .select('course_id')
              .eq('user_id', student.id);

            const assignedCourses = assignedCoursesData?.map(a => a.course_id) || [];

            const { data: progressData } = await supabase
              .from('video_view_logs')
              .select('*')
              .eq('user_id', student.id);

            const totalAssigned = assignedCourses.length;
            const completed = progressData?.filter(p => p.status === 'completed').length || 0;
            const inProgress = progressData?.filter(p => p.status === 'in_progress').length || 0;
            const totalWatchTime = progressData?.reduce((sum, p) => sum + (p.total_watched_time || 0), 0) || 0;
            const completionRate = totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : 0;

            return {
              ...student,
              assignedCourses,
              courseStats: {
                totalAssigned,
                completed,
                inProgress,
                totalWatchTime,
                completionRate
              }
            };
          } catch (error) {
            console.error(`学生 ${student.id} の統計取得エラー:`, error);
            return {
              ...student,
              courseStats: {
                totalAssigned: 0,
                completed: 0,
                inProgress: 0,
                totalWatchTime: 0,
                completionRate: 0
              }
            };
          }
        })
      );

      setStudents(studentsWithStats);
    } catch (error) {
      console.error('学生データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const { data: coursesData, error } = await supabase
        .from('courses')
        .select('*')
        .eq('status', 'active')
        .order('order_index', { ascending: true });

      if (error) {
        console.error('コース取得エラー:', error);
        return;
      }

      setCourses(coursesData || []);
    } catch (error) {
      console.error('コース取得エラー:', error);
    }
  };

  const toggleStudentExpanded = (studentId: string) => {
    const newExpanded = new Set(expandedStudents);
    if (newExpanded.has(studentId)) {
      newExpanded.delete(studentId);
    } else {
      newExpanded.add(studentId);
    }
    setExpandedStudents(newExpanded);
  };

  const handleCourseAssignment = async (studentId: string, courseId: number, isAssigned: boolean) => {
    const savingKey = `${studentId}-${courseId}`;
    setSavingAssignments(prev => new Set(prev).add(savingKey));

    try {
      if (isAssigned) {
        // コースを割り当て解除
        const { error } = await supabase
          .from('user_course_assignments')
          .delete()
          .eq('user_id', studentId)
          .eq('course_id', courseId);

        if (error) throw error;
      } else {
        // コースを割り当て
        const { error } = await supabase
          .from('user_course_assignments')
          .insert({
            user_id: studentId,
            course_id: courseId,
            assigned_at: new Date().toISOString()
          });

        if (error) {
          // 既に存在する場合は無視
          if (!error.message?.includes('duplicate')) {
            throw error;
          }
        }
      }

      // ローカルステートを更新
      setStudents(prevStudents =>
        prevStudents.map(student => {
          if (student.id === studentId) {
            const assignedCourses = student.assignedCourses || [];
            if (isAssigned) {
              // 削除
              return {
                ...student,
                assignedCourses: assignedCourses.filter(id => id !== courseId),
                courseStats: {
                  ...student.courseStats,
                  totalAssigned: student.courseStats.totalAssigned - 1
                }
              };
            } else {
              // 追加
              return {
                ...student,
                assignedCourses: [...assignedCourses, courseId],
                courseStats: {
                  ...student.courseStats,
                  totalAssigned: student.courseStats.totalAssigned + 1
                }
              };
            }
          }
          return student;
        })
      );
    } catch (error) {
      console.error('コース割り当てエラー:', error);
      alert('コースの割り当てに失敗しました。');
    } finally {
      setSavingAssignments(prev => {
        const newSet = new Set(prev);
        newSet.delete(savingKey);
        return newSet;
      });
    }
  };

  const handleRoleChange = async (studentId: string, newRole: 'admin' | 'student' | 'labor_consultant') => {
    if (!confirm(`本当にこのユーザーの権限を「${getRoleLabel(newRole)}」に変更しますか？`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', studentId);

      if (error) throw error;

      // ローカルステートを更新
      setStudents(prevStudents =>
        prevStudents.map(student =>
          student.id === studentId ? { ...student, role: newRole } : student
        )
      );

      alert('権限を変更しました。');
    } catch (error) {
      console.error('権限変更エラー:', error);
      alert('権限の変更に失敗しました。');
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return '管理者';
      case 'labor_consultant': return '社労士事務所';
      case 'instructor': return '講師';
      case 'student': return '受講者';
      default: return '未設定';
    }
  };

  const exportToCSV = async () => {
    setExportingCSV(true);
    try {
      const headers = [
        '氏名',
        'メール',
        '会社名',
        '部署',
        'ステータス',
        '登録日',
        '最終ログイン',
        '割当コース数',
        '完了コース数',
        '完了率（%）'
      ];

      const csvData = students.map(student => [
        student.display_name,
        student.email,
        student.company || '',
        student.department || '',
        student.is_active ? 'アクティブ' : '非アクティブ',
        new Date(student.created_at).toLocaleDateString('ja-JP'),
        student.last_login_at ? new Date(student.last_login_at).toLocaleDateString('ja-JP') : '未ログイン',
        student.courseStats.totalAssigned,
        student.courseStats.completed,
        student.courseStats.completionRate
      ]);

      const csvContent = [headers, ...csvData]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `生徒一覧_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert('生徒一覧をCSVファイルとしてエクスポートしました。');
    } catch (error) {
      console.error('CSV出力エラー:', error);
      alert('CSV出力に失敗しました。');
    } finally {
      setExportingCSV(false);
    }
  };

  const downloadCSVTemplate = () => {
    const headers = ['メールアドレス', '表示名', '会社名', '部署', 'パスワード'];
    const sampleData = [
      ['user1@example.com', '山田太郎', '株式会社サンプル', '営業部', ''],
      ['user2@example.com', '田中花子', '株式会社サンプル', '開発部', 'MyPassword123!'],
      ['user3@example.com', '', '', '', '']
    ];

    const csvContent = [headers, ...sampleData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `生徒インポートテンプレート_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // RFC 4180準拠のCSVパーサー
  const parseCSV = (csv: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];
      const nextChar = csv[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // エスケープされた引用符（""）
          currentField += '"';
          i++; // 次の引用符をスキップ
        } else {
          // 引用符の開始または終了
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // フィールドの終了
        currentRow.push(currentField.trim());
        currentField = '';
      } else if ((char === '\n' || char === '\r') && !insideQuotes) {
        // 行の終了
        if (char === '\r' && nextChar === '\n') {
          i++; // \r\nの場合、\nをスキップ
        }
        if (currentField || currentRow.length > 0) {
          currentRow.push(currentField.trim());
          if (currentRow.some(field => field !== '')) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentField = '';
        }
      } else {
        currentField += char;
      }
    }

    // 最後のフィールドと行を追加
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(field => field !== '')) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  const handleCSVImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingCSV(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const csv = e.target?.result as string;
        const rows = parseCSV(csv);

        if (rows.length === 0) {
          alert('CSVファイルが空です。');
          return;
        }

        const headers = rows[0];

        console.log('[CSV Import] Headers:', headers);
        console.log('[CSV Import] Total rows:', rows.length);

        // 必須フィールドと任意フィールドを定義
        const requiredHeaders = ['メールアドレス'];
        const optionalHeaders = ['氏名', '表示名', '会社名', '部署', 'パスワード'];

        // ヘッダーのインデックスを取得
        const headerIndices: Record<string, number> = {};
        headers.forEach((header, index) => {
          headerIndices[header] = index;
        });

        console.log('[CSV Import] Header indices:', headerIndices);

        // 必須フィールドが存在するか確認
        const hasRequiredFields = requiredHeaders.every(h => headerIndices[h] !== undefined);

        if (!hasRequiredFields) {
          alert(`CSVファイルには最低限「${requiredHeaders.join('、')}」列が必要です。\n\n任意の列：${optionalHeaders.join('、')}`);
          return;
        }

        // データ行を処理
        const studentsToImport = [];
        const errors = [];

        // 強固なデフォルトパスワードを生成（大文字・小文字・数字・記号を含む12文字以上）
        const generateStrongPassword = () => {
          const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const lowercase = 'abcdefghijklmnopqrstuvwxyz';
          const numbers = '0123456789';
          const symbols = '!@#$%^&*';

          let password = '';
          password += uppercase[Math.floor(Math.random() * uppercase.length)];
          password += lowercase[Math.floor(Math.random() * lowercase.length)];
          password += numbers[Math.floor(Math.random() * numbers.length)];
          password += symbols[Math.floor(Math.random() * symbols.length)];

          const allChars = uppercase + lowercase + numbers + symbols;
          for (let i = 0; i < 8; i++) {
            password += allChars[Math.floor(Math.random() * allChars.length)];
          }

          // シャッフル
          return password.split('').sort(() => Math.random() - 0.5).join('');
        };

        for (let i = 1; i < rows.length; i++) {
          const values = rows[i];

          console.log(`[CSV Import] Row ${i} values:`, values);

          const email = values[headerIndices['メールアドレス']];

          if (!email) {
            errors.push(`行 ${i + 1}: メールアドレスが空です`);
            continue;
          }

          // 基本的なメールアドレスの検証
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            errors.push(`行 ${i + 1}: 無効なメールアドレス: ${email}`);
            continue;
          }

          const companyValue = values[headerIndices['会社名']];
          const departmentValue = values[headerIndices['部署']];

          console.log(`[CSV Import] Row ${i} - company field: "${companyValue}", department field: "${departmentValue}"`);

          const studentData: any = {
            email,
            display_name: values[headerIndices['表示名']] || values[headerIndices['氏名']] || email.split('@')[0],
            company: companyValue || null,
            department: departmentValue || null,
            password: values[headerIndices['パスワード']] || generateStrongPassword(),
            role: 'student',
            is_active: true
          };

          console.log(`[CSV Import] Row ${i} - studentData:`, studentData);

          studentsToImport.push(studentData);
        }

        if (errors.length > 0) {
          const showErrors = confirm(`以下のエラーが見つかりました:\n\n${errors.slice(0, 5).join('\n')}\n${errors.length > 5 ? `...他${errors.length - 5}件のエラー` : ''}\n\n正常なデータのみインポートしますか？`);
          if (!showErrors && studentsToImport.length === 0) {
            return;
          }
          if (!showErrors) {
            return;
          }
        }

        if (studentsToImport.length === 0) {
          alert('インポートできるデータがありません。');
          return;
        }

        // インポート確認
        const confirmImport = confirm(`${studentsToImport.length}件の生徒データをインポートします。\n\n続行しますか？`);
        if (!confirmImport) {
          return;
        }

        // 実際のインポート処理
        let successCount = 0;
        const importErrors = [];

        for (const student of studentsToImport) {
          try {
            console.log('Creating user:', { email: student.email, display_name: student.display_name, company: student.company });
            // APIエンドポイントを呼び出してユーザーを作成
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/admin/users/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
              },
              body: JSON.stringify(student),
            });

            if (response.ok) {
              successCount++;
            } else {
              const error = await response.json();
              const errorMessage = error.error || error.message || 'インポート失敗';
              console.error('Import error for', student.email, ':', errorMessage);
              importErrors.push(`${student.email}: ${errorMessage}`);
            }
          } catch (error) {
            importErrors.push(`${student.email}: ネットワークエラー`);
          }
        }

        // 結果表示
        let resultMessage = `インポート完了:\n成功: ${successCount}件`;
        if (importErrors.length > 0) {
          resultMessage += `\n失敗: ${importErrors.length}件\n\n失敗理由:\n${importErrors.slice(0, 5).join('\n')}`;
          if (importErrors.length > 5) {
            resultMessage += `\n...他${importErrors.length - 5}件のエラー`;
          }
        }

        alert(resultMessage);

        // リストを更新
        if (successCount > 0) {
          await fetchStudents();
        }

      } catch (error) {
        console.error('CSVインポートエラー:', error);
        alert('CSVファイルの読み込みに失敗しました。');
      } finally {
        setImportingCSV(false);
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`本当に「${userName}」を削除しますか？\nこの操作は取り消せません。`)) {
      return;
    }

    try {
      // Supabaseセッションからトークンを取得
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`/api/admin/users/${userId}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
      });

      const data = await response.json();

      if (response.ok) {
        if (data.partialSuccess) {
          alert(`ユーザーデータは削除されましたが、認証情報の削除には手動操作が必要です。\n\n${data.error || data.message}`);
        } else {
          alert('ユーザーが正常に削除されました。');
        }
        // リストを更新
        await fetchStudents();
        // Learning logs update removed - now in separate page
      } else {
        alert(`削除に失敗しました: ${data.error || 'エラーが発生しました'}`);
      }
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除中にエラーが発生しました。');
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'completed': { text: '完了', color: 'bg-green-100 text-green-800', icon: CheckCircleIconSolid },
      'in_progress': { text: '受講中', color: 'bg-blue-100 text-blue-800', icon: ClockIcon },
      'not_started': { text: '未開始', color: 'bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200', icon: ExclamationTriangleIcon }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.not_started;
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <IconComponent className="h-3 w-3 mr-1" />
        {config.text}
      </span>
    );
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch =
      student.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.department?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'active' && student.is_active) ||
      (filterStatus === 'inactive' && !student.is_active);

    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    let compareValue = 0;

    switch (sortBy) {
      case 'name':
        compareValue = a.display_name.localeCompare(b.display_name);
        break;
      case 'company':
        compareValue = (a.company || '個人').localeCompare(b.company || '個人');
        break;
      case 'created':
        compareValue = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
    }

    return sortOrder === 'asc' ? compareValue : -compareValue;
  });

  // 会社名別にグループ化
  const groupedStudents = groupByCompany
    ? filteredStudents.reduce((groups, student) => {
        const company = student.company || '個人';
        if (!groups[company]) {
          groups[company] = [];
        }
        groups[company].push(student);
        return groups;
      }, {} as Record<string, Student[]>)
    : { '全て': filteredStudents };

  const toggleCompanyExpanded = (company: string) => {
    const newExpanded = new Set(expandedCompanies);
    if (newExpanded.has(company)) {
      newExpanded.delete(company);
    } else {
      newExpanded.add(company);
    }
    setExpandedCompanies(newExpanded);
  };

  // Removed filteredLogs - now in separate page

  if (loading) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="flex justify-center items-center min-h-64">
            <LoadingSpinner size="lg" />
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                  <UserGroupIcon className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">生徒管理</h1>
                  <p className="text-gray-600 dark:text-gray-400">学習者の進捗管理とコース割り当てを行います</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Link href="/admin/learning-logs">
                  <Button
                    variant="outline"
                    className="flex items-center justify-center w-full sm:w-auto whitespace-nowrap"
                  >
                    <ClockIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="whitespace-nowrap">学習ログを見る</span>
                  </Button>
                </Link>
                <Link href="/admin/users/new">
                  <Button
                    className="bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center w-full sm:w-auto whitespace-nowrap"
                  >
                    <UserGroupIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="whitespace-nowrap">生徒を追加</span>
                  </Button>
                </Link>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  style={{ display: 'none' }}
                  id="csv-import"
                />
                <Button
                  variant="outline"
                  disabled={importingCSV}
                  onClick={() => document.getElementById('csv-import')?.click()}
                  className="flex items-center justify-center w-full sm:w-auto whitespace-nowrap"
                >
                  <DocumentArrowUpIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="whitespace-nowrap">{importingCSV ? 'インポート中...' : 'CSVインポート'}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={downloadCSVTemplate}
                  className="flex items-center justify-center w-full sm:w-auto whitespace-nowrap"
                >
                  <DocumentArrowDownIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="whitespace-nowrap">テンプレート</span>
                </Button>
                <Button
                  onClick={exportToCSV}
                  disabled={exportingCSV}
                  className="flex items-center justify-center w-full sm:w-auto whitespace-nowrap"
                >
                  <DocumentArrowDownIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="whitespace-nowrap">{exportingCSV ? 'エクスポート中...' : 'CSVエクスポート'}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Content Card */}
          <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 mb-6">
            {/* Filters */}
            <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="生徒名、メール、会社名で検索..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                {(
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <FunnelIcon className="h-4 w-4 text-gray-400" />
                      <select
                        className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as any)}
                      >
                        <option value="all">全て</option>
                        <option value="active">アクティブ</option>
                        <option value="inactive">非アクティブ</option>
                      </select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">並び順:</span>
                      <select
                        className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                      >
                        <option value="created">登録日</option>
                        <option value="name">氏名</option>
                        <option value="company">会社名</option>
                      </select>
                      <button
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
                      >
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </button>
                    </div>
                    <div className="flex items-center space-x-2">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={groupByCompany}
                          onChange={(e) => setGroupByCompany(e.target.checked)}
                          className="h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500"
                        />
                        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">会社別表示</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {filteredStudents.length === 0 ? (
                <div className="text-center py-12">
                  <UserGroupIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    {searchTerm ? '検索結果がありません' : '生徒がまだ登録されていません'}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    {searchTerm ? '別のキーワードで検索してみてください' : '最初の生徒を追加しましょう'}
                  </p>
                  {!searchTerm && (
                    <Link href="/admin/users/new">
                      <Button>生徒を追加</Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedStudents).map(([company, companyStudents]) => (
                    <div key={company} className="space-y-4">
                      {groupByCompany && (
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => toggleCompanyExpanded(company)}
                            className="flex items-center space-x-2 text-lg font-semibold text-gray-900 dark:text-white hover:text-indigo-600 transition-colors"
                          >
                            {expandedCompanies.has(company) ? (
                              <ChevronUpIcon className="h-5 w-5" />
                            ) : (
                              <ChevronDownIcon className="h-5 w-5" />
                            )}
                            <span>{company}</span>
                            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                              ({companyStudents.length}名)
                            </span>
                          </button>
                          <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                            <span>
                              完了率: {Math.round(
                                companyStudents.reduce((sum, s) => sum + s.courseStats.completionRate, 0) / companyStudents.length
                              )}%
                            </span>
                            <span>
                              総視聴時間: {formatTime(
                                companyStudents.reduce((sum, s) => sum + s.courseStats.totalWatchTime, 0)
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                      {(!groupByCompany || expandedCompanies.has(company)) && (
                        <div className="space-y-4">
                          {companyStudents.map((student) => (
                      <div key={student.id} className="border border-gray-200 dark:border-neutral-800 rounded-lg p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {student.display_name}
                              </h3>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                student.is_active
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {student.is_active ? 'アクティブ' : '非アクティブ'}
                              </span>
                              {student.role === 'admin' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  管理者
                                </span>
                              )}
                              {student.role === 'labor_consultant' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                  社労士事務所
                                </span>
                              )}
                              {student.role === 'instructor' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  インストラクター
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                              <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">メール</div>
                                <div className="text-sm font-medium">{student.email}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">会社名</div>
                                <div className="text-sm font-medium">{student.company || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">部署</div>
                                <div className="text-sm font-medium">{student.department || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">最終ログイン</div>
                                <div className="text-sm font-medium">
                                  {student.last_login_at
                                    ? new Date(student.last_login_at).toLocaleDateString('ja-JP')
                                    : '未ログイン'
                                  }
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">権限</div>
                                <select
                                  value={student.role}
                                  onChange={(e) => handleRoleChange(student.id, e.target.value as 'admin' | 'student' | 'labor_consultant')}
                                  className="text-sm font-medium border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                                >
                                  <option value="student">受講者</option>
                                  <option value="admin">管理者</option>
                                  <option value="labor_consultant">社労士事務所</option>
                                </select>
                              </div>
                            </div>
                            
                            {/* Learning Stats */}
                            <div className="bg-gray-50 dark:bg-black rounded-lg p-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {student.courseStats.totalAssigned}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">割当コース</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-green-600">
                                    {student.courseStats.completed}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">完了</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-blue-600">
                                    {student.courseStats.inProgress}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">受講中</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-purple-600">
                                    {formatTime(student.courseStats.totalWatchTime)}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">総視聴時間</div>
                                </div>
                              </div>
                              <div className="mt-3">
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span className="text-gray-600 dark:text-gray-400">完了率</span>
                                  <span className="font-medium">{student.courseStats.completionRate}%</span>
                                </div>
                                <div className="bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-green-50 dark:bg-green-900/200 rounded-full h-2 transition-all duration-300"
                                    style={{ width: `${student.courseStats.completionRate}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              onClick={() => toggleStudentExpanded(student.id)}
                              className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 rounded-lg transition-colors flex items-center"
                            >
                              <AcademicCapIcon className="h-4 w-4 mr-1" />
                              コース割当
                              {expandedStudents.has(student.id) ? (
                                <ChevronUpIcon className="h-4 w-4 ml-1" />
                              ) : (
                                <ChevronDownIcon className="h-4 w-4 ml-1" />
                              )}
                            </button>
                            <Link href={`/admin/users/${student.id}`}>
                              <button
                                className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-black hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center"
                              >
                                <EyeIcon className="h-4 w-4 mr-1" />
                                詳細
                              </button>
                            </Link>
                            <button
                              onClick={() => handleDeleteUser(student.id, student.display_name)}
                              className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 rounded-lg transition-colors flex items-center"
                            >
                              <TrashIcon className="h-4 w-4 mr-1" />
                              削除
                            </button>
                          </div>
                        </div>

                        {/* コース割り当てセクション（展開時のみ表示） */}
                        {expandedStudents.has(student.id) && (
                          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-neutral-800">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">コース割り当て</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {courses.map((course) => {
                                const isAssigned = student.assignedCourses?.includes(course.id) || false;
                                const isSaving = savingAssignments.has(`${student.id}-${course.id}`);

                                return (
                                  <label
                                    key={course.id}
                                    className={`relative flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                                      isAssigned
                                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-600'
                                        : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                                    } ${isSaving ? 'opacity-50' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 mt-1"
                                      checked={isAssigned}
                                      disabled={isSaving}
                                      onChange={(e) => handleCourseAssignment(student.id, course.id, isAssigned)}
                                    />
                                    <div className="ml-3 flex-1">
                                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                                        {course.title}
                                      </div>
                                      {course.category && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                          {course.category}
                                        </div>
                                      )}
                                      {course.estimated_duration && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                          {Math.round(course.estimated_duration / 60)}分
                                        </div>
                                      )}
                                    </div>
                                    {isSaving && (
                                      <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-neutral-900 bg-opacity-75 dark:bg-opacity-75 rounded-lg">
                                        <LoadingSpinner size="sm" />
                                      </div>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                            {courses.length === 0 && (
                              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                                利用可能なコースがありません
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}