import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Wand2, RefreshCw, Check, X, Loader2, LayoutTemplate } from 'lucide-react';
import {
  generateTemplatedImages,
  getDraftImages,
  selectAiImage,
  type GeneratedImageOption,
} from '@/lib/aiImageApi';

interface TemplatedImageGeneratorProps {
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

/**
 * "Use Company Template" mode: the user's prompt controls WHAT content is
 * generated, but the fixed IK Tangience post template controls HOW and
 * WHERE it's presented — the header, logo, slogan, footer and CONNECT NOW
 * block come from the template on every image and are never regenerated.
 *
 * Deliberately mirrors AiImageGenerator's structure (same props, same
 * prompt -> generate -> options grid -> select -> finalized-preview flow,
 * same draft-restore-on-mount behavior) so the Media Hub's existing
 * generation UX stays consistent between modes. The company template
 * (public/template.png) ships with the app, so generation is always
 * available — there's no server-side "template missing" state to check
 * for anymore.
 */
const TemplatedImageGenerator: React.FC<TemplatedImageGeneratorProps> = ({
  token,
  draftId,
  suggestedPrompt,
  onImageFinalized,
  finalizedImage,
}) => {
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<GeneratedImageOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSelecting, setIsSelecting] = useState<number | null>(null);
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);

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

  const runGenerate = async () => {
    if (!token) {
      toast.error('Please login to generate images');
      return;
    }
    if (!prompt.trim()) {
      toast.error('Describe the content you want inside the template first');
      return;
    }

    setIsGenerating(true);
    try {
      const data = await generateTemplatedImages(token, draftId, prompt.trim());

      if (data.success && data.images) {
        setOptions(data.images);
        toast.success(`✨ Generated ${data.images.length} templated image option${data.images.length > 1 ? 's' : ''}`);
      } else {
        throw new Error(data.message || 'Failed to generate images');
      }
    } catch (error: any) {
      console.error('Error generating templated images:', error);
      toast.error('❌ Failed to generate images. ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearFinalized = () => {
    setSelectedId(null);
    onImageFinalized(null);
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
      console.error('Error selecting templated image:', error);
      toast.error('❌ Could not use that image. ' + error.message);
    } finally {
      setIsSelecting(null);
    }
  };

  return (
    <div className="ai-image-generator">
      <div className="ai-image-generator-header">
        <LayoutTemplate size={15} aria-hidden="true" />
        <span>Generate content inside the IK Tangience template</span>
      </div>

      <textarea
        className="ai-image-prompt-input"
        placeholder='Describe the post content (e.g. "Announce our new steel detailing service")...'
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        maxLength={500}
        disabled={isGenerating}
      />

      <div className="ai-image-ref-row">
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
              Generate with template
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
                <img src={option.base64} alt="Generated templated option" />
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
          <Wand2 size={12} aria-hidden="true" />
          Describe what you want above — it'll be placed inside the fixed template's content area.
        </p>
      )}

      {finalizedImage && (
        <div className="attached-image-preview ai-image-finalized animate-fade-in">
          <img src={finalizedImage} alt="Finalized attachment preview" />
          <div className="attached-image-meta">
            <span className="attached-image-name">Templated image attached</span>
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

export default TemplatedImageGenerator;