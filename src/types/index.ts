// 基本型定義
export type UserRole = 'student' | 'instructor' | 'admin' | 'labor_consultant';
export type CourseStatus = 'active' | 'inactive';
export type VideoStatus = 'active' | 'inactive';
export type LearningStatus = 'not_started' | 'in_progress' | 'completed';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

// データベース型定義
export interface UserProfile {
  id: string;
  display_name?: string;
  company?: string;
  department?: string;
  role: UserRole;
  avatar_url?: string;
  bio?: string;
  phone?: string;
  last_login_at?: string;
  password_changed_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: number;
  title: string;
  description?: string;
  thumbnail_url?: string;
  status: CourseStatus;
  category?: string;
  difficulty_level?: DifficultyLevel;
  estimated_duration?: number;
  completion_threshold: number;
  order_index: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  videos?: Video[];
  total_videos?: number;
}

export interface Video {
  id: number;
  course_id: number;
  title: string;
  description?: string;
  file_url: string;
  duration: number;
  file_size?: number;
  mime_type?: string;
  thumbnail_url?: string;
  order_index: number;
  status: VideoStatus;
  created_at: string;
  updated_at: string;
}

export interface VideoViewLog {
  id: number;
  user_id: string;
  video_id: number;
  course_id: number;
  session_id: string;
  start_time: string;
  end_time?: string;
  current_position: number;
  total_watched_time: number;
  progress_percent: number;
  progress?: number; // Legacy field for compatibility
  status: LearningStatus;
  completed_at?: string;
  last_updated: string;
  created_at: string;
}

export interface CourseCompletion {
  id: number;
  user_id: string;
  course_id: number;
  completion_date: string;
  completion_rate: number;
  certificate_id: string;
  created_at: string;
}

export interface Certificate {
  id: string;
  user_id: string;
  course_id: number;
  user_name: string;
  course_title: string;
  completion_date: string;
  pdf_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  // 以下のフィールドは将来の拡張用（現在は使用しない）
  certificate_number?: string;
  verification_code?: string;
  issued_at?: string;
  expires_at?: string;
}

export interface SystemLog {
  id: number;
  user_id?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  details?: Record<string, any>;
  created_at: string;
}

// UI関連型定義
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SearchParams {
  query?: string;
  category?: string;
  status?: string;
  difficulty?: DifficultyLevel;
}

// フォーム型定義
export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  company?: string;
  department?: string;
}

export interface ProfileUpdateForm {
  display_name?: string;
  company?: string | null;
  department?: string | null;
  bio?: string | null;
}

export interface PasswordChangeForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface CourseForm {
  title: string;
  description?: string;
  category?: string;
  difficulty_level?: DifficultyLevel;
  estimated_duration?: number;
  completion_threshold?: number;
}

export interface VideoForm {
  title: string;
  description?: string;
  course_id: number;
}

// ダッシュボード・統計型定義
export interface LearningStats {
  totalCourses: number;
  completedCourses: number;
  inProgressCourses: number;
  totalLearningTime: number;
  certificatesEarned: number;
  totalCertificates?: number;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalCourses: number;
  totalVideos: number;
  totalLearningTime: number;
  completionRate: number;
}

export interface CourseProgress {
  course: Course;
  totalVideos: number;
  completedVideos: number;
  progressPercent: number;
  lastAccessed?: string;
  timeSpent: number;
}

// ナビゲーション型定義
export interface NavItem {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
  children?: NavItem[];
}

// エラー型定義
export interface AppError {
  code: string;
  message: string;
  details?: any;
}