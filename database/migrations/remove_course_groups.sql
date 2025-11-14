-- コースグループ機能を削除するマイグレーション

-- グループ登録テーブルを削除
DROP TABLE IF EXISTS course_group_enrollments CASCADE;

-- コースグループアイテムテーブルを削除
DROP TABLE IF EXISTS course_group_items CASCADE;

-- コースグループテーブルを削除
DROP TABLE IF EXISTS course_groups CASCADE;

-- 完了メッセージ
SELECT 'コースグループ関連テーブルを削除しました' AS message;
