// パフォーマンス最適化ユーティリティ

import { supabase } from '@/lib/database/supabase';

/**
 * コース一覧を効率的に取得（JOIN使用）
 */
export async function fetchCoursesOptimized() {
  try {
    // まずコース一覧を取得
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });

    if (coursesError || !courses) {
      throw coursesError || new Error('コース取得に失敗しました');
    }

    // コースIDのリストを作成
    const courseIds = courses.map(c => c.id);

    // 一括で動画情報を取得
    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .select('course_id, duration')
      .in('course_id', courseIds)
      .eq('status', 'active');

    if (videosError) {
      console.error('動画情報取得エラー:', videosError);
    }

    // 一括で受講者数を取得
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('course_enrollments')
      .select('course_id')
      .in('course_id', courseIds);

    if (enrollmentsError) {
      console.error('受講者数取得エラー:', enrollmentsError);
    }

    // データを集計
    const videoStats = new Map();
    const enrollmentStats = new Map();

    // 動画統計を集計
    videos?.forEach(video => {
      const stats = videoStats.get(video.course_id) || { count: 0, duration: 0 };
      stats.count++;
      stats.duration += video.duration || 0;
      videoStats.set(video.course_id, stats);
    });

    // 受講者数を集計
    enrollments?.forEach(enrollment => {
      const count = enrollmentStats.get(enrollment.course_id) || 0;
      enrollmentStats.set(enrollment.course_id, count + 1);
    });

    // コースデータに統計を結合
    const processedCourses = courses.map(course => {
      const videoStat = videoStats.get(course.id) || { count: 0, duration: 0 };
      const enrollmentCount = enrollmentStats.get(course.id) || 0;
      
      return {
        ...course,
        video_count: videoStat.count,
        total_duration: videoStat.duration,
        enrollment_count: enrollmentCount
      };
    });

    return processedCourses;
  } catch (error) {
    console.error('コース取得エラー:', error);
    throw error;
  }
}

/**
 * ページネーション付きでコースを取得
 */
export async function fetchCoursesPaginated(page: number = 0, pageSize: number = 12) {
  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    // 総数を取得
    const { count } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true });

    // ページネーション付きでコースを取得
    const { data: courses, error } = await supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    return {
      courses: courses || [],
      totalCount: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize),
      currentPage: page,
      pageSize
    };
  } catch (error) {
    console.error('ページネーション取得エラー:', error);
    throw error;
  }
}

/**
 * 最適化されたユーザーコース進捗取得
 */
export async function fetchUserProgressOptimized(userId: string) {
  try {
    // 一度のクエリで必要なデータを取得
    const { data, error } = await supabase
      .from('course_enrollments')
      .select(`
        *,
        courses:course_id (
          id,
          title,
          description,
          thumbnail_url,
          category,
          difficulty_level,
          videos:videos (
            id,
            duration
          )
        ),
        progress:video_view_logs (
          video_id,
          progress_percent,
          status
        )
      `)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('進捗取得エラー:', error);
    throw error;
  }
}

/**
 * デバウンス処理（頻繁な関数呼び出しを制限）
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return function debounced(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * スロットル処理（一定間隔での関数実行を保証）
 */
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * 画像の遅延読み込み設定
 */
export function lazyLoadImage(imageSrc: string): string {
  // プレースホルダー画像を返す（実際の画像は IntersectionObserver で読み込み）
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23f0f0f0' width='400' height='300'/%3E%3C/svg%3E`;
}

/**
 * メモリキャッシュ実装
 */
class MemoryCache<T> {
  private cache: Map<string, { data: T; timestamp: number }> = new Map();
  private ttl: number;

  constructor(ttlSeconds: number = 300) {
    this.ttl = ttlSeconds * 1000;
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // TTLチェック
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

// シングルトンインスタンス
export const courseCache = new MemoryCache(300); // 5分キャッシュ
export const userCache = new MemoryCache(600); // 10分キャッシュ