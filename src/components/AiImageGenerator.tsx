import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Wand2, RefreshCw, Check, X, ImagePlus, Loader2, AlertTriangle } from 'lucide-react';
import {
  generateAiImages,
  getDraftImages,
  selectAiImage,
  type GeneratedImageOption,
} from '@/lib/aiImageApi';

interface AiImageGeneratorProps {
  token: string | null | undefined;
  /** Opaque id identifying the current post draft; images generated here are scoped to it. */
  draftId: string;
  /** Used to prefill the prompt (e.g. the selected topic or generated post content). */
  suggestedPrompt: string;
  /** Called with the finalized image as a data URL once the user picks one, or null when cleared. */
  onImageFinalized: (dataUrl: string | null) => void;
  /** The currently finalized image (if any), so the parent can render the shared preview UI. */
  finalizedImage: string | null;
}

const MAX_REFERENCE_BYTES = 5 * 1024 * 1024; // 5MB, matches the manual-upload limit elsewhere in SocialHub

const AiImageGenerator: React.FC<AiImageGeneratorProps> = ({
  token,
  draftId,
  suggestedPrompt,
  onImageFinalized,
  finalizedImage,
}) => {
  const [prompt, setPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceFileName, setReferenceFileName] = useState<string>('');
  const [options, setOptions] = useState<GeneratedImageOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSelecting, setIsSelecting] = useState<number | null>(null);
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  // Prefill the prompt from the post topic/content the first time it becomes
  // available, without clobbering anything the user has already typed.
  useEffect(() => {
    if (suggestedPrompt && !prompt) {
      setPrompt(suggestedPrompt.slice(0, 400));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedPrompt]);

  // Restore any previously generated options + the finalized selection for
  // this draft (e.g. the user navigated away and came back before publishing).
  useEffect(() => {
    if (!draftId || !token || hasLoadedDraft) return;
    (async () => {
      try {
        const data = await getDraftImages(token, draftId);
        if (data.success) {
          setOptions(data.images || []);
          setSelectedId(data.selectedImageId ?? null);
          const selected = (data.images || []).find(img => img.id === data.selectedImageId);
          if (selected && !finalizedImage) {
            onImageFinalized(selected.base64);
          }
        }
      } catch {
        // Silently ignore — this is a best-effort restore, not a blocking load.
      } finally {
        setHasLoadedDraft(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, token, hasLoadedDraft]);

  const handleReferenceSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file for the reference');
      return;
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      toast.error('Reference image must be smaller than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReferenceImage(reader.result as string);
      setReferenceFileName(file.name);
    };
    reader.onerror = () => toast.error('Failed to read the reference image');
    reader.readAsDataURL(file);
  };

  const removeReferenceImage = () => {
    setReferenceImage(null);
    setReferenceFileName('');
  };

  const runGenerate = async () => {
    if (!token) {
      toast.error('Please login to generate images');
      return;
    }
    if (!prompt.trim()) {
      toast.error('Describe the image you want to generate first');
      return;
    }

    setIsGenerating(true);
    try {
      const data = await generateAiImages(
        token,
        draftId,
        prompt.trim(),
        referenceImage ? [referenceImage] : []
      );

      if (data.success && data.images) {
        setOptions(data.images);
        toast.success(`✨ Generated ${data.images.length} image option${data.images.length > 1 ? 's' : ''}`);
      } else {
        throw new Error(data.message || 'Failed to generate images');
      }
    } catch (error: any) {
      console.error('Error generating AI images:', error);
      toast.error('❌ Failed to generate images. ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelect = async (option: GeneratedImageOption) => {
    if (!token) return;
    setIsSelecting(option.id);
    try {
      const data = await selectAiImage(token, option.id);
      if (data.success && data.image) {
        setSelectedId(option.id);
        onImageFinalized(data.image.base64);
        toast.success('🖼️ Image set as this post\'s attachment');
      } else {
        throw new Error(data.message || 'Failed to select image');
      }
    } catch (error: any) {
      console.error('Error selecting AI image:', error);
      toast.error('❌ Could not use that image. ' + error.message);
    } finally {
      setIsSelecting(null);
    }
  };

  const handleClearFinalized = () => {
    setSelectedId(null);
    onImageFinalized(null);
  };

  return (
    <div className="ai-image-generator">
      <div className="ai-image-generator-header">
        <Wand2 size={15} aria-hidden="true" />
        <span>Generate an image with AI</span>
      </div>

      <textarea
        className="ai-image-prompt-input"
        placeholder="Describe the image you want (style, layout, colors, composition)..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        maxLength={500}
        disabled={isGenerating}
      />

      <div className="ai-image-ref-row">
        <input
          type="file"
          accept="image/*"
          ref={referenceInputRef}
          onChange={handleReferenceSelected}
          className="sh-hidden-file-input"
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => referenceInputRef.current?.click()}
          disabled={isGenerating}
        >
          <ImagePlus size={14} aria-hidden="true" />
          {referenceImage ? 'Change reference image' : 'Add reference image (optional)'}
        </button>

        {referenceImage && (
          <div className="ai-image-ref-chip">
            <img src={referenceImage} alt="Reference" />
            <span>{referenceFileName}</span>
            <button
              type="button"
              className="remove-image-btn"
              onClick={removeReferenceImage}
              aria-label="Remove reference image"
              disabled={isGenerating}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        )}

        <button
          type="button"
          className={`btn btn-sm btn-primary ai-image-generate-btn ${isGenerating ? 'loading' : ''}`}
          onClick={runGenerate}
          disabled={isGenerating || !prompt.trim()}
        >
          {isGenerating ? (
            <>
              <span className="spinner" aria-hidden="true"></span>
              Generating...
            </>
          ) : options.length > 0 ? (
            <>
              <RefreshCw size={14} aria-hidden="true" />
              Regenerate
            </>
          ) : (
            <>
              <Sparkles size={14} aria-hidden="true" />
              Generate images
            </>
          )}
        </button>
      </div>

      {isGenerating && (
        <div className="ai-image-options-grid">
          {Array.from({ length: 1 }).map((_, i) => (
            <div key={i} className="ai-image-option ai-image-option-skeleton">
              <Loader2 className="ai-image-skeleton-spinner" size={20} aria-hidden="true" />
            </div>
          ))}
        </div>
      )}

      {!isGenerating && options.length > 0 && (
        <div className="ai-image-options-grid animate-fade-in">
          {options.map((option) => {
            const isChosen = selectedId === option.id;
            return (
              <div key={option.id} className={`ai-image-option ${isChosen ? 'chosen' : ''}`}>
                <img src={option.base64} alt="Generated option" />
                <button
                  type="button"
                  className={`ai-image-use-btn ${isChosen ? 'chosen' : ''}`}
                  onClick={() => handleSelect(option)}
                  disabled={isSelecting !== null}
                >
                  {isSelecting === option.id ? (
                    <span className="spinner" aria-hidden="true"></span>
                  ) : isChosen ? (
                    <>
                      <Check size={13} aria-hidden="true" />
                      Selected
                    </>
                  ) : (
                    'Use this image'
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!isGenerating && options.length === 0 && (
        <p className="ai-image-empty-hint">
          <AlertTriangle size={12} aria-hidden="true" />
          No images generated yet — describe what you want above and click "Generate images".
        </p>
      )}

      {finalizedImage && (
        <div className="attached-image-preview ai-image-finalized animate-fade-in">
          <img src={finalizedImage} alt="Finalized attachment preview" />
          <div className="attached-image-meta">
            <span className="attached-image-name">AI-generated image attached</span>
            <button
              type="button"
              className="remove-image-btn"
              onClick={handleClearFinalized}
              aria-label="Remove finalized image"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiImageGenerator;