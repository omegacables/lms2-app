'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ArrowUpTrayIcon,
  PaperClipIcon
} from '@heroicons/react/24/outline';

interface Video {
  id: string;
  title: string;
  description: string;
  duration: number;
  order_index: number;
  file_url: string;
  status: 'active' | 'inactive';
  course_id: string;
}

interface VideoResource {
  id?: number;
  video_id: number;
  resource_type: 'material' | 'assignment' | 'reference' | 'explanation';
  title: string;
  description?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  content?: string;
  display_order: number;
  is_required?: boolean;
}


export default function EditVideoPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;
  const videoId = params.videoId as string;

  const [video, setVideo] = useState<Video | null>(null);
  const [resources, setResources] = useState<VideoResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'materials' | 'assignments' | 'references' | 'explanations'>('basic');

  // 基本情報フォーム
  const [videoForm, setVideoForm] = useState({
    title: '',
    description: '',
    status: 'active' as 'active' | 'inactive'
  });

  // リソース追加フォーム
  const [showAddResource, setShowAddResource] = useState(false);
  const [resourceForm, setResourceForm] = useState<Partial<VideoResource>>({
    resource_type: 'material',
    title: '',
    description: '',
    content: '',
    is_required: false,
    display_order: 0
  });
  const [resourceFile, setResourceFile] = useState<File | null>(null);

  useEffect(() => {
    if (videoId) {
      fetchVideo();
      fetchResources();
    }
  }, [videoId]);

  const fetchVideo = async () => {
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (error) throw error;

      setVideo(data);
      setVideoForm({
        title: data.title,
        description: data.description || '',
        status: data.status
      });
    } catch (error) {
      console.error('動画取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchResources = async () => {
    try {
      const response = await fetch(`/api/videos/${videoId}/resources`);
      if (response.ok) {
        const { data } = await response.json();
        setResources(data || []);
      }
    } catch (error) {
      console.error('リソース取得エラー:', error);
    }
  };

  const updateVideo = async () => {
    if (!video) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('videos')
        .update(videoForm)
        .eq('id', videoId);

      if (error) throw error;

      alert('動画情報を更新しました');
    } catch (error) {
      console.error('動画更新エラー:', error);
      alert('動画の更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const uploadResourceFile = async (file: File): Promise<string | null> => {
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `resources/${videoId}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('videos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('ファイルアップロードエラー:', error);
      return null;
    }
  };

  const addResource = async () => {
    setSaving(true);
    try {
      let fileUrl = null;
      let fileName = null;
      let fileSize = null;
      let fileType = null;

      // ファイルがある場合はアップロード
      if (resourceFile) {
        fileUrl = await uploadResourceFile(resourceFile);
        if (!fileUrl) {
          throw new Error('ファイルのアップロードに失敗しました');
        }
        fileName = resourceFile.name;
        fileSize = resourceFile.size;
        fileType = resourceFile.type;
      }

      const newResource: Partial<VideoResource> = {
        ...resourceForm,
        video_id: parseInt(videoId),
        file_url: fileUrl,
        file_name: fileName,
        file_size: fileSize,
        file_type: fileType,
        display_order: resources.filter(r => r.resource_type === resourceForm.resource_type).length
      };

      const response = await fetch(`/api/videos/${videoId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newResource)
      });

      if (!response.ok) throw new Error('リソースの追加に失敗しました');

      const { data } = await response.json();
      setResources([...resources, data]);

      // フォームをリセット
      setResourceForm({
        resource_type: 'material',
        title: '',
        description: '',
        content: '',
        is_required: false,
        display_order: 0
      });
      setResourceFile(null);
      setShowAddResource(false);

      alert('リソースを追加しました');
    } catch (error) {
      console.error('リソース追加エラー:', error);
      alert('リソースの追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const deleteResource = async (resourceId: number) => {
    if (!confirm('このリソースを削除しますか？')) return;

    try {
      const response = await fetch(`/api/videos/${videoId}/resources?id=${resourceId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('削除に失敗しました');

      setResources(resources.filter(r => r.id !== resourceId));
      alert('リソースを削除しました');
    } catch (error) {
      console.error('リソース削除エラー:', error);
      alert('リソースの削除に失敗しました');
    }
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'material':
        return <PaperClipIcon className="h-5 w-5" />;
      case 'assignment':
        return <ClipboardDocumentCheckIcon className="h-5 w-5" />;
      case 'reference':
        return <BookOpenIcon className="h-5 w-5" />;
      case 'explanation':
        return <ChatBubbleLeftRightIcon className="h-5 w-5" />;
      default:
        return <DocumentTextIcon className="h-5 w-5" />;
    }
  };

  const getResourceTypeLabel = (type: string) => {
    switch (type) {
      case 'material':
        return '配布資料';
      case 'assignment':
        return '課題';
      case 'reference':
        return '参考資料';
      case 'explanation':
        return '解説';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <AuthGuard requiredRole="admin">
        <MainLayout>
          <div className="flex justify-center items-center min-h-64">
            <LoadingSpinner size="lg" />
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  if (!video) {
    return (
      <AuthGuard requiredRole="admin">
        <MainLayout>
          <div className="text-center py-12">
            <p className="text-gray-500">動画が見つかりません</p>
            <Link href={`/admin/courses/${courseId}/videos`}>
              <Button className="mt-4">動画一覧に戻る</Button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard requiredRole="admin">
      <MainLayout>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <Link
              href={`/admin/courses/${courseId}/videos`}
              className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              動画一覧に戻る
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              動画編集: {video.title}
            </h1>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('basic')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'basic'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                基本情報
              </button>
              <button
                onClick={() => setActiveTab('materials')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'materials'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                配布資料 ({resources.filter(r => r.resource_type === 'material').length})
              </button>
              <button
                onClick={() => setActiveTab('assignments')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'assignments'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                課題 ({resources.filter(r => r.resource_type === 'assignment').length})
              </button>
              <button
                onClick={() => setActiveTab('references')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'references'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                参考資料 ({resources.filter(r => r.resource_type === 'reference').length})
              </button>
              <button
                onClick={() => setActiveTab('explanations')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'explanations'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                解説 ({resources.filter(r => r.resource_type === 'explanation').length})
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-6">
            {activeTab === 'basic' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">基本情報</h2>
                <div className="space-y-4 max-w-2xl">
                  <Input
                    label="タイトル"
                    value={videoForm.title}
                    onChange={(e) => setVideoForm({ ...videoForm, title: e.target.value })}
                    required
                  />
                  <div>
                    <label className="block text-sm font-medium mb-2">説明</label>
                    <textarea
                      value={videoForm.description}
                      onChange={(e) => setVideoForm({ ...videoForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      rows={4}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">ステータス</label>
                    <select
                      value={videoForm.status}
                      onChange={(e) => setVideoForm({ ...videoForm, status: e.target.value as 'active' | 'inactive' })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="active">公開</option>
                      <option value="inactive">非公開</option>
                    </select>
                  </div>
                  <Button onClick={updateVideo} loading={saving}>
                    保存
                  </Button>
                </div>
              </div>
            )}

            {(activeTab === 'materials' || activeTab === 'assignments' || activeTab === 'references' || activeTab === 'explanations') && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">
                    {activeTab === 'materials' && '配布資料'}
                    {activeTab === 'assignments' && '課題'}
                    {activeTab === 'references' && '参考資料'}
                    {activeTab === 'explanations' && '解説'}
                  </h2>
                  <Button
                    onClick={() => {
                      const typeMap: Record<string, VideoResource['resource_type']> = {
                        materials: 'material',
                        assignments: 'assignment',
                        references: 'reference',
                        explanations: 'explanation'
                      };
                      setResourceForm({
                        ...resourceForm,
                        resource_type: typeMap[activeTab]
                      });
                      setShowAddResource(true);
                    }}
                    size="sm"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    追加
                  </Button>
                </div>

                {/* Resources List */}
                <div className="space-y-3">
                  {resources
                    .filter(r => {
                      const typeMap: Record<string, VideoResource['resource_type']> = {
                        materials: 'material',
                        assignments: 'assignment',
                        references: 'reference',
                        explanations: 'explanation'
                      };
                      return r.resource_type === typeMap[activeTab];
                    })
                    .map(resource => (
                      <div
                        key={resource.id}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="mt-1">
                            {getResourceIcon(resource.resource_type)}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                              {resource.title}
                              {resource.is_required && (
                                <span className="ml-2 text-xs bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 px-2 py-0.5 rounded">
                                  必須
                                </span>
                              )}
                            </h4>
                            {resource.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                                {resource.description}
                              </p>
                            )}
                            {resource.content && (
                              <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 line-clamp-3 whitespace-pre-wrap">
                                {resource.content}
                              </p>
                            )}
                            {resource.file_name && (
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                ファイル: {resource.file_name}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => resource.id && deleteResource(resource.id)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                  {resources.filter(r => {
                    const typeMap: Record<string, VideoResource['resource_type']> = {
                      materials: 'material',
                      assignments: 'assignment',
                      references: 'reference',
                      explanations: 'explanation'
                    };
                    return r.resource_type === typeMap[activeTab];
                  }).length === 0 && (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                      まだリソースがありません
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Add Resource Modal */}
          {showAddResource && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">
                  {getResourceTypeLabel(resourceForm.resource_type || 'material')}を追加
                </h3>

                <div className="space-y-4">
                  <Input
                    label="タイトル"
                    value={resourceForm.title || ''}
                    onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })}
                    required
                  />

                  <div>
                    <label className="block text-sm font-medium mb-2">説明</label>
                    <textarea
                      value={resourceForm.description || ''}
                      onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      rows={3}
                    />
                  </div>

                  {(resourceForm.resource_type === 'explanation' || resourceForm.resource_type === 'assignment') && (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        {resourceForm.resource_type === 'explanation' ? '解説内容' : '課題内容'}
                      </label>
                      <textarea
                        value={resourceForm.content || ''}
                        onChange={(e) => setResourceForm({ ...resourceForm, content: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        rows={6}
                        placeholder={resourceForm.resource_type === 'explanation'
                          ? '動画の補足説明や重要ポイントを入力してください'
                          : '課題の詳細な説明を入力してください'}
                      />
                    </div>
                  )}

                  {resourceForm.resource_type === 'assignment' && (
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="is_required"
                        checked={resourceForm.is_required || false}
                        onChange={(e) => setResourceForm({ ...resourceForm, is_required: e.target.checked })}
                        className="mr-2"
                      />
                      <label htmlFor="is_required" className="text-sm font-medium">
                        必須課題にする
                      </label>
                    </div>
                  )}

                  {(resourceForm.resource_type === 'material' || resourceForm.resource_type === 'reference') && (
                    <div>
                      <label className="block text-sm font-medium mb-2">ファイル</label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="file"
                          onChange={(e) => setResourceFile(e.target.files?.[0] || null)}
                          className="flex-1"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.zip,.jpg,.jpeg,.png,.gif"
                        />
                        {resourceFile && (
                          <button
                            onClick={() => setResourceFile(null)}
                            className="text-red-600 hover:text-red-700"
                          >
                            クリア
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        対応形式: PDF, Word, Excel, CSV, PowerPoint, テキスト, 画像, ZIP
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddResource(false);
                      setResourceFile(null);
                      setResourceForm({
                        resource_type: 'material',
                        title: '',
                        description: '',
                        content: '',
                        is_required: false,
                        display_order: 0
                      });
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button onClick={addResource} loading={saving}>
                    追加
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}