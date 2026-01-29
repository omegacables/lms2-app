'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  CheckIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  UserIcon,
  PaperClipIcon,
  PhotoIcon,
  DocumentIcon,
  XMarkIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

interface SupportConversation {
  id: number;
  studentId: string;
  studentName: string;
  studentEmail: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  unreadCount: number;
}

interface SupportMessage {
  id: number;
  conversationId: number;
  senderId: string;
  senderType: string;
  senderName: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

interface FilePreview {
  file: File;
  previewUrl: string;
  type: 'image' | 'document';
}

export default function AdminSupportChat() {
  const { user, isAdmin } = useAuth();
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedFile, setSelectedFile] = useState<FilePreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && isAdmin) {
      fetchConversations();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    try {
      setLoading(true);
      
      // まず会話リストを取得
      const { data: conversationsData, error: convError } = await supabase
        .from('support_conversations')
        .select('*')
        .order('updated_at', { ascending: false });
      
      console.log('Basic conversations data:', conversationsData);
      
      if (convError) {
        console.error('Error fetching basic conversations:', convError);
        throw convError;
      }

      // 各会話のユーザー情報を個別に取得
      const data = await Promise.all(
        (conversationsData || []).map(async (conv) => {
          const { data: userData } = await supabase
            .from('user_profiles')
            .select('display_name, email')
            .eq('id', conv.student_id)
            .single();
          
          return {
            ...conv,
            student: userData
          };
        })
      );

      console.log('Conversations with user data:', data);

      // 各会話の未読メッセージ数と最後のメッセージを取得
      const conversationsWithDetails = await Promise.all(
        (data || []).map(async (conv: any) => {
          // 未読メッセージ数を取得
          const { count: unreadCount } = await supabase
            .from('support_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('sender_type', 'student')
            .eq('is_read', false);

          // 最後のメッセージを取得
          const { data: lastMessageData } = await supabase
            .from('support_messages')
            .select('message')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);

          return {
            id: conv.id,
            studentId: conv.student_id,
            studentName: conv.student?.display_name || 'ユーザー',
            studentEmail: conv.student?.email || '',
            subject: conv.subject,
            status: conv.status,
            priority: conv.priority,
            createdAt: conv.created_at,
            updatedAt: conv.updated_at,
            lastMessage: lastMessageData?.[0]?.message || '',
            unreadCount: unreadCount || 0
          };
        })
      );

      setConversations(conversationsWithDetails);
    } catch (error) {
      console.error('会話一覧の取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: number) => {
    try {
      // まずメッセージを取得
      const { data: messagesData, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      // 各メッセージの送信者情報を取得
      const data = await Promise.all(
        (messagesData || []).map(async (msg) => {
          const { data: userData } = await supabase
            .from('user_profiles')
            .select('display_name')
            .eq('id', msg.sender_id)
            .single();
          
          return {
            ...msg,
            sender: userData
          };
        })
      );

      const formattedMessages = data?.map((msg: any) => ({
        id: msg.id,
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        senderType: msg.sender_type,
        senderName: msg.sender?.display_name || 'ユーザー',
        message: msg.message,
        isRead: msg.is_read,
        createdAt: msg.created_at,
        fileUrl: msg.file_url,
        fileName: msg.file_name,
        fileType: msg.file_type,
        fileSize: msg.file_size
      })) || [];

      setMessages(formattedMessages);

      // 学生からの未読メッセージを既読にする
      await supabase
        .from('support_messages')
        .update({ is_read: true, read_at: new Date() })
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'student')
        .eq('is_read', false);

      // 会話一覧を更新
      await fetchConversations();
    } catch (error) {
      console.error('メッセージの取得エラー:', error);
      alert('メッセージの取得に失敗しました。');
    }
  };

  // ファイル選択処理
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('ファイルサイズは10MB以下にしてください。');
      return;
    }

    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'
    ];

    if (!allowedTypes.includes(file.type)) {
      alert('このファイル形式はサポートされていません。');
      return;
    }

    const isImage = file.type.startsWith('image/');
    setSelectedFile({
      file,
      previewUrl: isImage ? URL.createObjectURL(file) : '',
      type: isImage ? 'image' : 'document'
    });
  };

  const clearSelectedFile = () => {
    if (selectedFile?.previewUrl) {
      URL.revokeObjectURL(selectedFile.previewUrl);
    }
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFile = async (file: File) => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage.from('chat-files').upload(fileName, file);
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(fileName);
      return { url: publicUrl, name: file.name, type: file.type, size: file.size };
    } catch (error) {
      console.error('ファイルアップロードエラー:', error);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !selectedFile) || !selectedConversation || !user) return;

    try {
      setSending(true);

      let fileData = null;
      if (selectedFile) {
        fileData = await uploadFile(selectedFile.file);
        if (!fileData && !newMessage.trim()) {
          alert('ファイルのアップロードに失敗しました。');
          return;
        }
      }

      const { error } = await supabase
        .from('support_messages')
        .insert({
          conversation_id: selectedConversation.id,
          sender_id: user.id,
          sender_type: 'admin',
          message: newMessage.trim() || (fileData ? `[ファイル: ${fileData.name}]` : ''),
          file_url: fileData?.url || null,
          file_name: fileData?.name || null,
          file_type: fileData?.type || null,
          file_size: fileData?.size || null
        });

      if (error) throw error;

      // 会話のステータスを更新
      await supabase
        .from('support_conversations')
        .update({
          status: 'in_progress',
          updated_at: new Date()
        })
        .eq('id', selectedConversation.id);

      setNewMessage('');
      clearSelectedFile();
      await fetchMessages(selectedConversation.id);
      await fetchConversations();
    } catch (error) {
      console.error('メッセージ送信エラー:', error);
      alert('メッセージの送信に失敗しました。');
    } finally {
      setSending(false);
    }
  };

  const sendEmailNotification = async (recipientId: string, subject: string, message: string) => {
    try {
      // まずauth.usersからメールアドレスを取得
      const { data: userData, error: userError } = await supabase
        .from('auth.users')
        .select('email')
        .eq('id', recipientId)
        .single();

      if (userError) {
        console.error('ユーザー情報取得エラー:', userError);
        return;
      }

      // メール通知の送信（現在の実装では実際に送信されませんが、ログに記録されます）
      const { error } = await supabase
        .from('email_notifications')
        .insert({
          recipient_id: recipientId,
          recipient_email: userData?.email || '',
          notification_type: 'support_reply',
          subject: `LMS サポート: ${subject}`,
          body: `
            サポートからの返信があります。

            メッセージ:
            ${message}

            返信は学習管理システムのサポートチャットからお願いします。
            ログインURL: ${typeof window !== 'undefined' ? window.location.origin : ''}/login

            このメールへの直接返信はできません。
          `,
          metadata: {
            original_message: message,
            reply_url: `${typeof window !== 'undefined' ? window.location.origin : ''}/messages`
          }
        });

      if (error) throw error;
    } catch (error) {
      console.error('メール通知エラー:', error);
      // エラーをスローしないことで、メッセージ送信の流れを中断しない
    }
  };

  const updateConversationStatus = async (conversationId: number, status: string) => {
    try {
      const { error } = await supabase
        .from('support_conversations')
        .update({ 
          status,
          resolved_at: status === 'resolved' ? new Date() : null,
          updated_at: new Date()
        })
        .eq('id', conversationId);

      if (error) throw error;

      await fetchConversations();
      if (selectedConversation && selectedConversation.id === conversationId) {
        setSelectedConversation({ ...selectedConversation, status });
      }
    } catch (error) {
      console.error('ステータス更新エラー:', error);
      alert('ステータスの更新に失敗しました。');
    }
  };

  // フィルタリング機能
  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = conv.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         conv.subject.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || conv.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || conv.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">新規</span>;
      case 'in_progress':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">対応中</span>;
      case 'resolved':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">解決済み</span>;
      case 'closed':
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200">終了</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200">{status}</span>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">緊急</span>;
      case 'high':
        return <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">高</span>;
      case 'normal':
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">通常</span>;
      case 'low':
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200">低</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200">{priority}</span>;
    }
  };

  if (!user || !isAdmin) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="max-w-2xl mx-auto px-4 py-16 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">アクセス権限がありません</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">このページは管理者のみアクセス可能です。</p>
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
        <div className="max-w-7xl mx-auto">
          {/* ヘッダーセクション */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                  <ChatBubbleLeftRightIcon className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">サポートチャット</h1>
                  <p className="text-gray-600 dark:text-gray-400">生徒からの問い合わせに対応できます。</p>
                </div>
              </div>
              <Link href="/admin">
                <Button variant="outline">
                  ダッシュボードに戻る
                </Button>
              </Link>
            </div>
          </div>

          {/* チャット画面 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
            {/* 会話一覧 */}
            <div className="lg:col-span-1 bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg border flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-neutral-800">
                <div className="mb-4">
                  <div className="relative">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="検索..."
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <select
                    className="p-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">全ステータス</option>
                    <option value="open">新規</option>
                    <option value="in_progress">対応中</option>
                    <option value="resolved">解決済み</option>
                  </select>
                  <select
                    className="p-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                  >
                    <option value="all">全優先度</option>
                    <option value="urgent">緊急</option>
                    <option value="high">高</option>
                    <option value="normal">通常</option>
                  </select>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredConversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`p-4 border-b border-gray-200 dark:border-neutral-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      selectedConversation?.id === conversation.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500' : ''
                    }`}
                    onClick={() => {
                      setSelectedConversation(conversation);
                      fetchMessages(conversation.id);
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {conversation.studentName}
                          </h3>
                          {conversation.unreadCount > 0 && (
                            <span className="bg-red-50 dark:bg-red-900/200 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-bold">
                              {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate mb-1">
                          {conversation.subject}
                        </p>
                        {conversation.lastMessage && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">
                            {conversation.lastMessage}
                          </p>
                        )}
                        <div className="flex items-center space-x-2">
                          {getStatusBadge(conversation.status)}
                          {getPriorityBadge(conversation.priority)}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      {new Date(conversation.updatedAt).toLocaleString('ja-JP')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* チャット画面 */}
            <div className="lg:col-span-2 bg-white dark:bg-neutral-900 rounded-lg border flex flex-col">
              {selectedConversation ? (
                <>
                  {/* チャットヘッダー */}
                  <div className="p-4 border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {selectedConversation.studentName}
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{selectedConversation.subject}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(selectedConversation.status)}
                        {getPriorityBadge(selectedConversation.priority)}
                        <select
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded p-1 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={selectedConversation.status}
                          onChange={(e) => updateConversationStatus(selectedConversation.id, e.target.value)}
                        >
                          <option value="open">新規</option>
                          <option value="in_progress">対応中</option>
                          <option value="resolved">解決済み</option>
                          <option value="closed">終了</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* メッセージ一覧 */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.senderType === 'admin' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.senderType === 'admin'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-900 dark:text-white'
                        }`}>
                          <div className="flex items-center mb-1">
                            <UserIcon className="h-3 w-3 mr-1" />
                            <span className="text-xs font-medium">
                              {message.senderType === 'admin' ? '管理者' : message.senderName}
                            </span>
                          </div>
                          {/* ファイル表示 */}
                          {message.fileUrl && (
                            <div className="mb-2">
                              {message.fileType?.startsWith('image/') ? (
                                <a href={message.fileUrl} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={message.fileUrl}
                                    alt={message.fileName || 'Image'}
                                    className="max-w-full rounded-lg cursor-pointer hover:opacity-90"
                                    style={{ maxHeight: '200px' }}
                                  />
                                </a>
                              ) : (
                                <a
                                  href={message.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex items-center p-2 rounded-lg ${
                                    message.senderType === 'admin'
                                      ? 'bg-blue-500 hover:bg-blue-400'
                                      : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
                                  }`}
                                >
                                  <DocumentIcon className="h-8 w-8 mr-2 flex-shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{message.fileName}</p>
                                    <p className="text-xs opacity-75">
                                      {message.fileSize ? formatFileSize(message.fileSize) : ''}
                                    </p>
                                  </div>
                                  <ArrowDownTrayIcon className="h-5 w-5 ml-2 flex-shrink-0" />
                                </a>
                              )}
                            </div>
                          )}
                          {message.message && !message.message.startsWith('[ファイル:') && (
                            <p className="text-sm">{message.message}</p>
                          )}
                          <p className={`text-xs mt-1 ${
                            message.senderType === 'admin' ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {new Date(message.createdAt).toLocaleString('ja-JP')}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* メッセージ入力 */}
                  <div className="p-4 border-t border-gray-200 dark:border-neutral-800">
                    {/* ファイルプレビュー */}
                    {selectedFile && (
                      <div className="mb-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center min-w-0">
                            {selectedFile.type === 'image' ? (
                              <img src={selectedFile.previewUrl} alt="Preview" className="h-12 w-12 object-cover rounded mr-3" />
                            ) : (
                              <DocumentIcon className="h-10 w-10 text-gray-500 mr-3 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{selectedFile.file.name}</p>
                              <p className="text-xs text-gray-500">{formatFileSize(selectedFile.file.size)}</p>
                            </div>
                          </div>
                          <button onClick={clearSelectedFile} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                            <XMarkIcon className="h-5 w-5 text-gray-500" />
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex space-x-2">
                      <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending || uploading}
                        className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                        title="ファイルを添付"
                      >
                        <PaperClipIcon className="h-5 w-5 text-gray-500" />
                      </button>
                      <input
                        type="text"
                        placeholder="メッセージを入力..."
                        className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        disabled={sending || uploading}
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={(!newMessage.trim() && !selectedFile) || sending || uploading}
                        className="px-4"
                      >
                        {sending || uploading ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <PaperAirplaneIcon className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <ChatBubbleLeftRightIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">会話を選択してください</h3>
                    <p className="text-gray-600 dark:text-gray-400">左側から対応する会話を選択してください。</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}