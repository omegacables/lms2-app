'use client';

import { useState, useEffect, useRef } from 'react';
import { PhotoIcon } from '@heroicons/react/24/outline';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholderColor?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
}

export function LazyImage({ 
  src, 
  alt, 
  className = '',
  placeholderColor = 'bg-gray-200',
  objectFit = 'cover'
}: LazyImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!src) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // 画像の読み込みを開始
            const img = new Image();
            img.src = src;
            
            img.onload = () => {
              setImageSrc(src);
              setIsLoading(false);
            };
            
            img.onerror = () => {
              setHasError(true);
              setIsLoading(false);
            };
            
            // オブザーバーを解除
            if (imgRef.current) {
              observer.unobserve(imgRef.current);
            }
          }
        });
      },
      {
        // ビューポートに入る100px前から読み込み開始
        rootMargin: '100px',
        threshold: 0
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current);
      }
    };
  }, [src]);

  return (
    <div ref={imgRef} className={`relative ${className}`}>
      {/* プレースホルダー */}
      {(isLoading || hasError) && (
        <div className={`absolute inset-0 ${placeholderColor} flex items-center justify-center`}>
          {hasError ? (
            <div className="text-center">
              <PhotoIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">画像を読み込めません</p>
            </div>
          ) : (
            <div className="animate-pulse">
              <PhotoIcon className="h-8 w-8 text-gray-400" />
            </div>
          )}
        </div>
      )}
      
      {/* 実際の画像 */}
      {imageSrc && !hasError && (
        <img
          src={imageSrc}
          alt={alt}
          className={`w-full h-full transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ objectFit }}
          loading="lazy"
        />
      )}
    </div>
  );
}