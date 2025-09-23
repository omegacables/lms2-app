'use client';

import { useState, useEffect, useRef } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import { messageEvents } from '@/lib/utils/events';
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  PlusIcon,
  UserIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface SupportConversation {
  id: number;
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
}

export default function SupportMessages() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newPriority, setNewPriority] = useState('normal');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('support_conversations')
        .select('*')
        .eq('student_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // 各会話の未読メッセージ数と最後のメッセージを取得
      const conversationsWithDetails = await Promise.all(
        (data || []).map(async (conv: any) => {
          // 管理者からの未読メッセージ数を取得
          const { count: unreadCount } = await supabase
            .from('support_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('sender_type', 'admin')
            .eq('is_read', false);

          // 最後のメッセージを取得
          const { data: lastMessageData } = await supabase
            .from('support_messages')
            .select('message, sender_id, sender_type')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);

          // 送信者情報を取得
          let senderName = '';
          if (lastMessageData?.[0]) {
            if (lastMessageData[0].sender_type === 'student') {
              const { data: userData } = await supabase
                .from('user_profiles')
                .select('display_name')
                .eq('id', lastMessageData[0].sender_id)
                .single();
              senderName = userData?.display_name || 'あなた';
            } else {
              senderName = 'サポート';
            }
          }

          return {
            id: conv.id,
            subject: conv.subject,
            status: conv.status,
            priority: conv.priority,
            createdAt: conv.created_at,
            updatedAt: conv.updated_at,
            lastMessage: lastMessageData?.[0]?.message || '',
            lastMessageSender: senderName,
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
        createdAt: msg.created_at
      })) || [];

      setMessages(formattedMessages);

      // 管理者からの未読メッセージを既読にする
      const { error: updateError } = await supabase
        .from('support_messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'admin')
        .eq('is_read', false);

      if (!updateError) {
        // 既読になったらイベントを発火してMainLayoutの通知を更新
        messageEvents.emit('message-read');
      }

      // 選択中の会話の未読数を0にリセット
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, unreadCount: 0 }
            : conv
        )
      );
    } catch (error) {
      console.error('メッセージの取得エラー:', error);
      alert('メッセージの取得に失敗しました。');
    }
  };

  const createNewConversation = async () => {
    if (!newSubject.trim() || !user) return;

    try {
      // 新しい会話を作成
      const { data, error } = await supabase
        .from('support_conversations')
        .insert({
          student_id: user.id,
          subject: newSubject.trim(),
          priority: newPriority,
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;

      // 最初のメッセージを送信
      if (newMessage.trim()) {
        await supabase
          .from('support_messages')
          .insert({
            conversation_id: data.id,
            sender_id: user.id,
            sender_type: 'student',
            message: newMessage.trim()
          });
      }

      setNewSubject('');
      setNewMessage('');
      setNewPriority('normal');
      setShowNewConversationModal(false);
      
      await fetchConversations();
      
      // 新しく作成した会話を選択
      const newConversation = {
        id: data.id,
        subject: data.subject,
        status: data.status,
        priority: data.priority,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        unreadCount: 0
      };
      setSelectedConversation(newConversation);
      if (data?.id) {
        await fetchMessages(data.id);
      }
      
    } catch (error) {
      console.error('新規会話作成エラー:', error);
      alert('新規会話の作成に失敗しました。');
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !user) return;

    try {
      setSending(true);
      
      const { error } = await supabase
        .from('support_messages')
        .insert({
          conversation_id: selectedConversation.id,
          sender_id: user.id,
          sender_type: 'student',
          message: newMessage.trim()
        });

      if (error) throw error;

      // 会話のステータスを更新
      if (selectedConversation.status === 'resolved' || selectedConversation.status === 'closed') {
        await supabase
          .from('support_conversations')
          .update({ 
            status: 'open',
            updated_at: new Date()
          })
          .eq('id', selectedConversation.id);
      }

      setNewMessage('');
      await fetchMessages(selectedConversation.id);
      await fetchConversations();
    } catch (error) {
      console.error('メッセージ送信エラー:', error);
      alert('メッセージの送信に失敗しました。');
    } finally {
      setSending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <div className="flex items-center text-blue-600">
            <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
            <span className="text-xs">新規</span>
          </div>
        );
      case 'in_progress':
        return (
          <div className="flex items-center text-yellow-600">
            <ClockIcon className="h-4 w-4 mr-1" />
            <span className="text-xs">対応中</span>
          </div>
        );
      case 'resolved':
        return (
          <div className="flex items-center text-green-600">
            <CheckCircleIcon className="h-4 w-4 mr-1" />
            <span className="text-xs">解決済み</span>
          </div>
        );
      case 'closed':
        return (
          <div className="flex items-center text-gray-600 dark:text-gray-400">
            <CheckCircleIcon className="h-4 w-4 mr-1" />
            <span className="text-xs">終了</span>
          </div>
        );
      default:
        return <span className="text-xs text-gray-600 dark:text-gray-400">{status}</span>;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'border-l-red-500';
      case 'high':
        return 'border-l-orange-500';
      case 'normal':
        return 'border-l-blue-500';
      case 'low':
        return 'border-l-gray-500';
      default:
        return 'border-l-gray-500';
    }
  };

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
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">サポート</h1>
                  <p className="text-gray-600 dark:text-gray-400">質問や問題について管理者に相談できます。</p>
                </div>
              </div>
              <Button
                onClick={() => setShowNewConversationModal(true)}
                className="flex items-center"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                新しい問い合わせ
              </Button>
            </div>
          </div>

          {/* チャット画面 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
            {/* 会話一覧 */}
            <div className="lg:col-span-1 bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg border flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-neutral-800">
                <h2 className="font-semibold text-gray-900 dark:text-white">問い合わせ履歴</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="p-8 text-center">
                    <ChatBubbleLeftRightIcon className="h-8 w-8 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">まだ問い合わせがありません。</p>
                    <Button
                      onClick={() => setShowNewConversationModal(true)}
                      className="mt-4"
                      size="sm"
                    >
                      新しい問い合わせを作成
                    </Button>
                  </div>
                ) : (
                  conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={`p-4 border-b border-gray-200 dark:border-neutral-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 border-l-4 ${getPriorityColor(conversation.priority)} ${
                        selectedConversation?.id === conversation.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => {
                        setSelectedConversation(conversation);
                        fetchMessages(conversation.id);
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate flex-1">
                          {conversation.subject}
                        </h3>
                        {conversation.unreadCount > 0 && (
                          <span className="bg-red-50 dark:bg-red-900/200 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-bold ml-2">
                            {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                          </span>
                        )}
                      </div>
                      {conversation.lastMessage && (
                        <div className="mb-2">
                          <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                            {conversation.lastMessageSender}:
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {conversation.lastMessage}
                          </p>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        {getStatusBadge(conversation.status)}
                        <span className="text-xs text-gray-400">
                          {new Date(conversation.updatedAt).toLocaleDateString('ja-JP')}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* チャット画面 */}
            <div className="lg:col-span-2 bg-white dark:bg-neutral-900 rounded-lg border flex flex-col">
              {selectedConversation ? (
                <>
                  {/* チャットヘッダー */}
                  <div className="p-4 border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedConversation.subject}
                    </h2>
                    <div className="flex items-center mt-1">
                      {getStatusBadge(selectedConversation.status)}
                    </div>
                  </div>

                  {/* メッセージ一覧 */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.senderType === 'student' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.senderType === 'student'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                        }`}>
                          <div className="flex items-center mb-1">
                            <UserIcon className="h-3 w-3 mr-1" />
                            <span className="text-xs font-medium">
                              {message.senderType === 'student' ? message.senderName || 'あなた' : 'サポート'}
                            </span>
                          </div>
                          <p className="text-sm">{message.message}</p>
                          <p className={`text-xs mt-1 ${
                            message.senderType === 'student' ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'
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
                    <div className="flex space-x-2">
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
                        disabled={sending}
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={!newMessage.trim() || sending}
                        className="px-4"
                      >
                        {sending ? (
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
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">問い合わせを選択してください</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">左側から確認したい問い合わせを選択してください。</p>
                    <Button
                      onClick={() => setShowNewConversationModal(true)}
                      className="flex items-center mx-auto"
                    >
                      <PlusIcon className="h-4 w-4 mr-2" />
                      新しい問い合わせを作成
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 新規問い合わせモーダル */}
          {showNewConversationModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-neutral-900 rounded-lg p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">新しい問い合わせ</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      件名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                      placeholder="問い合わせの内容を簡潔に..."
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">優先度</label>
                    <select
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                    >
                      <option value="low">低</option>
                      <option value="normal">通常</option>
                      <option value="high">高</option>
                      <option value="urgent">緊急</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">最初のメッセージ</label>
                    <textarea
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                      rows={4}
                      placeholder="詳しい内容を記入してください..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <Button
                    onClick={createNewConversation}
                    disabled={!newSubject.trim()}
                    className="flex-1"
                  >
                    問い合わせを作成
                  </Button>
                  <Button
                    onClick={() => {
                      setShowNewConversationModal(false);
                      setNewSubject('');
                      setNewMessage('');
                      setNewPriority('normal');
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    キャンセル
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Help Information */}
          <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-xl p-6">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="h-6 w-6 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  サポート機能について
                </h3>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>• 学習に関する質問やお困りごとをお気軽にご相談ください</p>
                  <p>• コースの内容や操作方法について管理者がサポートします</p>
                  <p>• 通常、1営業日以内にご返信いたします</p>
                  <p>• 緊急の場合は優先度を「高」または「緊急」に設定してください</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}