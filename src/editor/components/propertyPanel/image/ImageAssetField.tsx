import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { TemplateAsset } from '@/engine/core/document.js';
import { assertImportFileSize } from '@/engine/utils/limits.js';
import type { ImageValue } from '@/plugins/image/image.js';
import Button from '@/ui/button/Button.js';
import SegmentedControl from '@/ui/segmentedControl/SegmentedControl.js';
import { useToast } from '@/ui/toast/useToast.js';
import { formatCaughtError, t } from '@/i18n/index.js';

type ImageFit = 'contain' | 'cover' | 'fill';

interface ImageAssetFieldProps {
  value: ImageValue;
  fit: ImageFit;
  assets: Record<string, TemplateAsset>;
  disabled?: boolean;
  onValueChange(value: ImageValue): void;
  onFitChange(fit: ImageFit): void;
}

interface ImageResource {
  url?: string;
  name?: string;
  format?: string;
}

function dataUrlFormat(dataUrl: string): string | undefined {
  const mimeType = /^data:image\/(png|jpeg);/i.exec(dataUrl)?.[1]?.toUpperCase();
  return mimeType === 'JPEG' ? 'JPEG' : mimeType;
}

function resolveImageResource(
  value: ImageValue,
  assets: Record<string, TemplateAsset>,
): ImageResource {
  if (value.source === 'dataUrl') {
    return {
      url: value.dataUrl || undefined,
      format: dataUrlFormat(value.dataUrl),
    };
  }
  const asset = assets[value.assetId];
  if (!asset || asset.kind !== 'image') return {};
  return {
    url: `data:${asset.mimeType};base64,${asset.data}`,
    name: asset.name,
    format: asset.mimeType === 'image/jpeg' ? 'JPEG' : 'PNG',
  };
}

export default function ImageAssetField({
  value,
  fit,
  assets,
  disabled,
  onValueChange,
  onFitChange,
}: ImageAssetFieldProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resource = useMemo(() => resolveImageResource(value, assets), [assets, value]);
  const [pixelSize, setPixelSize] = useState<{ width: number; height: number }>();

  useEffect(() => {
    setPixelSize(undefined);
    if (!resource.url) return;
    let isCurrent = true;
    const image = new Image();
    image.onload = () => {
      if (isCurrent) setPixelSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = resource.url;
    // Loading may finish after replacement; stale dimensions must not describe the new image.
    return () => {
      isCurrent = false;
      image.onload = null;
    };
  }, [resource.url]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      assertImportFileSize(file, 'image');
      const reader = new FileReader();
      reader.onload = () => {
        onValueChange({ source: 'dataUrl', dataUrl: String(reader.result) });
        toast.success(t('property.panel.imageLoaded'), file.name);
      };
      reader.onerror = () => toast.error(t('property.panel.imageReadFailed'), file.name);
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error(t('property.panel.imageImportFailed'), formatCaughtError(error));
    } finally {
      input.value = '';
    }
  };

  const hasImage = Boolean(resource.url);
  const summary = [
    resource.name,
    resource.format,
    pixelSize ? `${pixelSize.width} × ${pixelSize.height}` : undefined,
  ].filter(Boolean).join(' · ');

  return (
    <div className="layoutpdf-image-asset-field">
      <input
        ref={fileInputRef}
        id="property-image-file"
        hidden
        type="file"
        accept="image/png,image/jpeg"
        disabled={disabled}
        aria-label={t('property.panel.imageFile')}
        onChange={handleFileChange}
      />
      <div className="layoutpdf-image-resource-row" data-empty={!hasImage || undefined}>
        <div className="layoutpdf-image-resource-preview" aria-hidden="true">
          {hasImage ? <img src={resource.url} alt="" /> : <span>{t('property.panel.imageEmptyShort')}</span>}
        </div>
        <div className="layoutpdf-image-resource-details">
          <strong>{hasImage ? (summary || t('property.panel.imageReady')) : t('property.panel.imageEmpty')}</strong>
          <div className="layoutpdf-image-resource-actions">
            <Button size="compact" disabled={disabled} onClick={() => fileInputRef.current?.click()}>
              {hasImage ? t('property.panel.imageReplace') : t('property.panel.imageChoose')}
            </Button>
            {hasImage ? (
              <Button
                size="compact"
                variant="ghost"
                disabled={disabled}
                onClick={() => onValueChange({ source: 'dataUrl', dataUrl: '' })}
              >
                {t('property.panel.imageRemove')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="layoutpdf-image-fit-field">
        <span>{t('property.image.fit')}</span>
        <SegmentedControl<ImageFit>
          value={fit}
          disabled={disabled}
          aria-label={t('property.image.fit')}
          options={[
            { value: 'contain', label: t('property.option.fitContain') },
            { value: 'cover', label: t('property.option.fitCover') },
            { value: 'fill', label: t('property.option.fitFill') },
          ]}
          onChange={onFitChange}
        />
      </div>
    </div>
  );
}
