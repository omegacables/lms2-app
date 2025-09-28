// チャプター情報をローカルストレージで管理するユーティリティ
// データベースを使わずにチャプター機能を実現

export interface Chapter {
  id: string;
  courseId: number;
  title: string;
  displayOrder: number;
  videoIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChapterData {
  chapters: Chapter[];
  version: string;
}

const STORAGE_KEY_PREFIX = 'lms_chapters_';
const CURRENT_VERSION = '1.0.0';

export class ChapterStorage {
  private static getStorageKey(courseId: number): string {
    return `${STORAGE_KEY_PREFIX}${courseId}`;
  }

  // チャプターデータを取得
  static getChapters(courseId: number): Chapter[] {
    try {
      const key = this.getStorageKey(courseId);
      const stored = localStorage.getItem(key);

      if (!stored) {
        return [];
      }

      const data: ChapterData = JSON.parse(stored);
      return data.chapters || [];
    } catch (error) {
      console.error('Failed to load chapters:', error);
      return [];
    }
  }

  // チャプターデータを保存
  static saveChapters(courseId: number, chapters: Chapter[]): void {
    try {
      const key = this.getStorageKey(courseId);
      const data: ChapterData = {
        chapters,
        version: CURRENT_VERSION
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save chapters:', error);
    }
  }

  // 新しいチャプターを追加
  static addChapter(courseId: number, title: string): Chapter {
    const chapters = this.getChapters(courseId);
    const newChapter: Chapter = {
      id: `chapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      courseId,
      title,
      displayOrder: chapters.length,
      videoIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    chapters.push(newChapter);
    this.saveChapters(courseId, chapters);
    return newChapter;
  }

  // チャプターを更新
  static updateChapter(courseId: number, chapterId: string, updates: Partial<Chapter>): void {
    const chapters = this.getChapters(courseId);
    const index = chapters.findIndex(c => c.id === chapterId);

    if (index !== -1) {
      chapters[index] = {
        ...chapters[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      this.saveChapters(courseId, chapters);
    }
  }

  // チャプターを削除
  static deleteChapter(courseId: number, chapterId: string): void {
    const chapters = this.getChapters(courseId);
    const filtered = chapters.filter(c => c.id !== chapterId);

    // 表示順を再調整
    filtered.forEach((chapter, index) => {
      chapter.displayOrder = index;
    });

    this.saveChapters(courseId, filtered);
  }

  // チャプターの順序を変更
  static reorderChapters(courseId: number, chapterIds: string[]): void {
    const chapters = this.getChapters(courseId);
    const reordered = chapterIds.map((id, index) => {
      const chapter = chapters.find(c => c.id === id);
      if (chapter) {
        chapter.displayOrder = index;
        chapter.updatedAt = new Date().toISOString();
      }
      return chapter;
    }).filter(Boolean) as Chapter[];

    this.saveChapters(courseId, reordered);
  }

  // 動画をチャプターに割り当て
  static assignVideoToChapter(courseId: number, videoId: string, chapterId: string | null): void {
    const chapters = this.getChapters(courseId);

    // 既存の割り当てを解除
    chapters.forEach(chapter => {
      chapter.videoIds = chapter.videoIds.filter(id => id !== videoId);
    });

    // 新しいチャプターに割り当て
    if (chapterId) {
      const chapter = chapters.find(c => c.id === chapterId);
      if (chapter && !chapter.videoIds.includes(videoId)) {
        chapter.videoIds.push(videoId);
        chapter.updatedAt = new Date().toISOString();
      }
    }

    this.saveChapters(courseId, chapters);
  }

  // チャプターに含まれる動画IDリストを取得
  static getChapterVideos(courseId: number, chapterId: string): string[] {
    const chapters = this.getChapters(courseId);
    const chapter = chapters.find(c => c.id === chapterId);
    return chapter?.videoIds || [];
  }

  // 動画が属するチャプターIDを取得
  static getVideoChapter(courseId: number, videoId: string): string | null {
    const chapters = this.getChapters(courseId);
    const chapter = chapters.find(c => c.videoIds.includes(videoId));
    return chapter?.id || null;
  }

  // データをエクスポート（バックアップ用）
  static exportChapters(courseId: number): string {
    const chapters = this.getChapters(courseId);
    return JSON.stringify({ chapters, exportDate: new Date().toISOString() }, null, 2);
  }

  // データをインポート（復元用）
  static importChapters(courseId: number, jsonData: string): void {
    try {
      const data = JSON.parse(jsonData);
      if (data.chapters && Array.isArray(data.chapters)) {
        this.saveChapters(courseId, data.chapters);
      }
    } catch (error) {
      console.error('Failed to import chapters:', error);
      throw new Error('Invalid chapter data format');
    }
  }

  // コースのチャプターをクリア
  static clearChapters(courseId: number): void {
    const key = this.getStorageKey(courseId);
    localStorage.removeItem(key);
  }
}

// サーバーサイドレンダリング対応
export const isClientSide = typeof window !== 'undefined';

export const getChapters = (courseId: number): Chapter[] => {
  if (!isClientSide) return [];
  return ChapterStorage.getChapters(courseId);
};

export const addChapter = (courseId: number, title: string): Chapter | null => {
  if (!isClientSide) return null;
  return ChapterStorage.addChapter(courseId, title);
};

export const updateChapter = (courseId: number, chapterId: string, updates: Partial<Chapter>): void => {
  if (!isClientSide) return;
  ChapterStorage.updateChapter(courseId, chapterId, updates);
};

export const deleteChapter = (courseId: number, chapterId: string): void => {
  if (!isClientSide) return;
  ChapterStorage.deleteChapter(courseId, chapterId);
};

export const assignVideoToChapter = (courseId: number, videoId: string, chapterId: string | null): void => {
  if (!isClientSide) return;
  ChapterStorage.assignVideoToChapter(courseId, videoId, chapterId);
};