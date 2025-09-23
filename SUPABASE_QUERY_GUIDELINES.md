# Supabase クエリガイドライン

## 重要な原則

このプロジェクトでは、Supabaseのクエリを作成する際に以下のガイドラインに従ってください。

## 1. JOIN操作は避ける

### ❌ 避けるべきパターン
```typescript
// 複雑なJOIN構文は避ける
const { data, error } = await supabase
  .from('support_conversations')
  .select(`
    *,
    user_profiles!inner(display_name)
  `)

// 外部キー名を使用したJOINも避ける
const { data, error } = await supabase
  .from('support_conversations')
  .select(`
    *,
    user_profiles!support_conversations_student_id_fkey(display_name)
  `)

// エイリアスを使用したJOINも避ける
const { data, error } = await supabase
  .from('support_conversations')
  .select(`
    *,
    student:user_profiles!student_id(display_name, email)
  `)
```

### ✅ 推奨パターン
```typescript
// Step 1: まず基本データを取得
const { data: conversationsData, error: convError } = await supabase
  .from('support_conversations')
  .select('*')
  .order('updated_at', { ascending: false });

if (convError) throw convError;

// Step 2: 関連データを個別に取得
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
```

## 2. なぜこの方法を採用するか

1. **エラーの特定が容易**: 各クエリが独立しているため、どこでエラーが発生したか特定しやすい
2. **RLSポリシーとの相性**: 複雑なJOINはRLS（Row Level Security）ポリシーと競合することがある
3. **デバッグが簡単**: console.logで各ステップのデータを確認できる
4. **型安全性**: TypeScriptでの型推論がより正確になる

## 3. 実装例

### 複数のテーブルからデータを取得する場合

```typescript
const fetchConversationsWithDetails = async () => {
  try {
    // 1. メインテーブルからデータ取得
    const { data: conversations, error } = await supabase
      .from('support_conversations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 2. 各レコードに対して関連データを取得
    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conv) => {
        // ユーザー情報を取得
        const { data: user } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', conv.user_id)
          .single();

        // メッセージ数を取得
        const { count } = await supabase
          .from('support_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id);

        return {
          ...conv,
          user,
          messageCount: count || 0
        };
      })
    );

    return conversationsWithDetails;
  } catch (error) {
    console.error('Error fetching conversations:', error);
    throw error;
  }
};
```

## 4. エラーハンドリング

```typescript
// 各クエリに対して個別にエラーハンドリング
const fetchUserData = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error(`Failed to fetch user ${userId}:`, error);
    // デフォルト値を返すか、エラーを再スロー
    return null;
  }

  return data;
};
```

## 5. パフォーマンスの考慮事項

大量のデータを扱う場合は、以下の点に注意：

```typescript
// バッチ処理を検討
const batchSize = 10;
const results = [];

for (let i = 0; i < data.length; i += batchSize) {
  const batch = data.slice(i, i + batchSize);
  const batchResults = await Promise.all(
    batch.map(item => fetchRelatedData(item))
  );
  results.push(...batchResults);
}
```

## 6. デバッグ用ログの追加

開発中は必ずログを追加：

```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*');

console.log('Query result:', data);
console.log('Query error:', error);

if (error) {
  console.error('Detailed error:', {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code
  });
}
```

## まとめ

- **シンプルなクエリを心がける**
- **JOINの代わりに個別クエリ + Promise.all を使用**
- **エラーハンドリングを各ステップで実装**
- **デバッグログを活用**

この方法により、Supabaseクエリの問題を迅速に特定・解決できます。