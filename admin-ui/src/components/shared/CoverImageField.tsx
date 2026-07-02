import { useEffect, useRef, useState } from 'react';
import { Crop, RefreshCw, UploadCloud } from 'lucide-react';

import { uploadQiniuImage } from '@/api/client';
import { QiniuImageField } from '@/components/shared/QiniuImageField';
import { useToast } from '@/components/shared/Toast';

type ImageInfo = {
  width: number;
  height: number;
  src: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cropSourceRect(
  image: ImageInfo,
  aspectRatio: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const imageRatio = image.width / image.height;
  const baseWidth = imageRatio > aspectRatio ? image.height * aspectRatio : image.width;
  const baseHeight = imageRatio > aspectRatio ? image.height : image.width / aspectRatio;
  const width = baseWidth / zoom;
  const height = baseHeight / zoom;
  const maxX = (image.width - width) / 2;
  const maxY = (image.height - height) / 2;
  const x = clamp((image.width - width) / 2 + (offsetX / 100) * maxX, 0, image.width - width);
  const y = clamp((image.height - height) / 2 + (offsetY / 100) * maxY, 0, image.height - height);
  return { x, y, width, height };
}

function drawCrop(
  image: ImageInfo,
  aspectRatio: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
  outputWidth: number,
) {
  return new Promise<{ dataUrl: string; blob: Blob }>((resolve, reject) => {
    const source = new Image();
    source.crossOrigin = 'anonymous';
    source.onload = () => {
      try {
        const rect = cropSourceRect(image, aspectRatio, zoom, offsetX, offsetY);
        const canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = Math.round(outputWidth / aspectRatio);
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('当前浏览器不支持图片裁剪'));
          return;
        }
        context.drawImage(
          source,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('裁剪图片生成失败'));
              return;
            }
            resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.9), blob });
          },
          'image/jpeg',
          0.9,
        );
      } catch {
        reject(new Error('图片不支持跨域裁剪，请重新上传原图后再裁剪'));
      }
    };
    source.onerror = () => reject(new Error('原图加载失败，请检查图片地址'));
    source.src = image.src;
  });
}

export function CoverImageField({
  label,
  hint,
  value,
  thumbValue,
  onChange,
  onThumbChange,
  prefix,
  thumbPrefix,
  previewAlt = '封面预览',
  cropLabel = '列表缩略图',
  cropHint = '用于列表卡片，详情页仍使用上方原图。',
  aspectRatio,
  outputWidth = 1200,
}: {
  label: string;
  hint?: string;
  value: string;
  thumbValue: string;
  onChange: (value: string) => void;
  onThumbChange: (value: string) => void;
  prefix?: string;
  thumbPrefix?: string;
  previewAlt?: string;
  cropLabel?: string;
  cropHint?: string;
  aspectRatio: number;
  outputWidth?: number;
}) {
  const toast = useToast();
  const [cropOpen, setCropOpen] = useState(false);
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const previewRunRef = useRef(0);

  useEffect(() => {
    setImage(null);
    setPreviewUrl('');
  }, [value]);

  useEffect(() => {
    if (!cropOpen || !image) return;
    const runId = previewRunRef.current + 1;
    previewRunRef.current = runId;
    drawCrop(image, aspectRatio, zoom, offsetX, offsetY, 720)
      .then((result) => {
        if (previewRunRef.current === runId) {
          setPreviewUrl(result.dataUrl);
        }
      })
      .catch(() => {
        if (previewRunRef.current === runId) {
          setPreviewUrl('');
        }
      });
  }, [aspectRatio, cropOpen, image, offsetX, offsetY, zoom]);

  async function loadSourceImage() {
    const sourceUrl = value.trim();
    if (!sourceUrl) {
      toast.error('请先上传或填写原图');
      return;
    }
    setLoadingImage(true);
    setCropOpen(true);
    try {
      const loaded = await new Promise<ImageInfo>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () =>
          resolve({
            width: img.naturalWidth,
            height: img.naturalHeight,
            src: sourceUrl,
          });
        img.onerror = () => reject(new Error('原图加载失败，请检查图片地址'));
        img.src = sourceUrl;
      });
      setImage(loaded);
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
    } catch (error) {
      setImage(null);
      toast.error(error instanceof Error ? error.message : '原图加载失败');
    } finally {
      setLoadingImage(false);
    }
  }

  async function saveCrop() {
    if (!image) return;
    setSaving(true);
    try {
      const result = await drawCrop(image, aspectRatio, zoom, offsetX, offsetY, outputWidth);
      const filename = `cover-thumb-${Date.now()}.jpg`;
      const file = new File([result.blob], filename, { type: 'image/jpeg' });
      const uploaded = await uploadQiniuImage(file, thumbPrefix ?? prefix);
      onThumbChange(uploaded.publicUrl);
      toast.success('缩略图已生成');
      setCropOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '缩略图生成失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-3.5 grid gap-3">
      <QiniuImageField
        label={label}
        hint={hint}
        value={value}
        onChange={onChange}
        prefix={prefix}
        previewAlt={previewAlt}
      />

      <div className="border-border/80 bg-muted/20 rounded-xl border p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold">{cropLabel}</div>
            <div className="text-muted-foreground mt-1 text-xs">{cropHint}</div>
          </div>
          <button
            type="button"
            className="btn btn-secondary sm:shrink-0"
            disabled={!value.trim() || loadingImage}
            onClick={loadSourceImage}
          >
            <Crop className="h-4 w-4" />
            {loadingImage ? '加载中...' : thumbValue ? '重新裁剪' : '裁剪缩略图'}
          </button>
        </div>

        {thumbValue ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
            <div className="overflow-hidden rounded-lg border bg-white">
              <img src={thumbValue} alt="缩略图预览" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <input
                className="form-input"
                value={thumbValue}
                onChange={(event) => onThumbChange(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost mt-2"
                onClick={() => onThumbChange('')}
              >
                清除缩略图
              </button>
            </div>
          </div>
        ) : null}

        {cropOpen ? (
          <div className="border-border/80 bg-background mt-4 rounded-xl border p-3">
            {loadingImage ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <RefreshCw className="h-4 w-4 animate-spin" />
                正在加载原图...
              </div>
            ) : image ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div>
                  <div
                    className="overflow-hidden rounded-lg border bg-slate-100"
                    style={{ aspectRatio }}
                  >
                    {previewUrl ? (
                      <img src={previewUrl} alt="裁剪预览" className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                        正在生成预览
                      </div>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-2 text-xs">
                    原图尺寸：{image.width} × {image.height}
                  </div>
                </div>
                <div className="grid content-start gap-3">
                  <label className="block">
                    <span className="form-label">缩放</span>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.01"
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>
                  <label className="block">
                    <span className="form-label">左右位置</span>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      step="1"
                      value={offsetX}
                      onChange={(event) => setOffsetX(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>
                  <label className="block">
                    <span className="form-label">上下位置</span>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      step="1"
                      value={offsetY}
                      onChange={(event) => setOffsetY(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={saving}
                      onClick={saveCrop}
                    >
                      <UploadCloud className="h-4 w-4" />
                      {saving ? '上传中...' : '保存缩略图'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCropOpen(false)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">原图未加载。</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
