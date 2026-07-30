import React, { useState, useEffect, useRef } from 'react';
import './SocialHub.css';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import {
  Linkedin,
  Clock,
  Sparkles,
  Zap,
  TrendingUp,
  Users,
  MessageCircle,
  ChevronRight,
  Check,
  Copy,
  X,
  Send,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Lightbulb,
  BarChart3,
  Link2,
  Rocket,
  Bell,
  PenSquare,
  Image as ImageIcon,
} from 'lucide-react';

// Types
interface TopicCategory {
  id: string;
  title: string;
  icon: string;
  topics: string[];
  color: string;
}

interface PostHistory {
  id: string;
  topic: string;
  content: string;
  timestamp: string;
  status: 'success' | 'error' | 'pending';
}

interface ApiResponse {
  success: boolean;
  content?: string;
  message?: string;
  error?: string;
  needsAuth?: boolean;
}

interface AttachedImage {
  file: File;
  preview: string;
  base64: string;
}

type ContentMode = 'ai' | 'prompted';

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// Category data
const CATEGORIES: TopicCategory[] = [
  {
    id: 'showcase',
    title: 'Project Showcase',
    icon: '🏗️',
    color: '#4CAF50',
    topics: [
      'Showcase a recently completed steel detailing project with key challenges and results.',
      'Write a LinkedIn post highlighting precision in structural steel detailing.',
      'Create a post about delivering shop drawings on time for a commercial project.',
      'Highlight a complex connection detailing challenge and how it was solved.',
      'Share a steel detailing success story for an industrial project.'
    ]
  },
  {
    id: 'insights',
    title: 'Industry Insights',
    icon: '💡',
    color: '#2196F3',
    topics: [
      'Explain why accurate steel detailing reduces fabrication errors.',
      'Discuss the importance of BIM in modern steel detailing.',
      'Share how Tekla Structures improves project coordination.',
      'Explain the role of steel detailers in successful construction projects.',
      'Discuss common mistakes avoided through quality detailing.'
    ]
  },
  {
    id: 'technical',
    title: 'Technical Content',
    icon: '⚙️',
    color: '#FF9800',
    topics: [
      'Write about the importance of clash detection before fabrication.',
      'Explain the benefits of accurate GA drawings and shop drawings.',
      'Discuss how CNC-ready files improve fabrication efficiency.',
      'Share best practices for managing revision cycles in detailing.',
      'Explain the importance of bolt schedules and connection detailing.'
    ]
  },
  {
    id: 'branding',
    title: 'Company Branding',
    icon: '🏢',
    color: '#9C27B0',
    topics: [
      'Introduce our steel detailing company and our expertise.',
      'Write a post about our commitment to quality and accuracy.',
      'Share our company\'s mission in structural steel detailing.',
      'Highlight our experienced detailing team.',
      'Celebrate a project milestone with clients and partners.'
    ]
  },
  {
    id: 'educational',
    title: 'Educational Posts',
    icon: '📚',
    color: '#00BCD4',
    topics: [
      'What is steel detailing and why is it important?',
      'Shop drawings vs. erection drawings: what\'s the difference?',
      'How steel detailing contributes to faster project delivery.',
      'Five reasons to invest in professional steel detailing.',
      'Understanding fabrication drawings for structural steel.'
    ]
  },
  {
    id: 'client',
    title: 'Client-Focused',
    icon: '🤝',
    color: '#FF5722',
    topics: [
      'Explain how our detailing services help fabricators save time.',
      'Show how accurate detailing reduces costly site modifications.',
      'Write a post encouraging fabricators to outsource detailing.',
      'Highlight how we support engineers, fabricators, and contractors.',
      'Explain the value of early coordination in steel projects.'
    ]
  },
  {
    id: 'engagement',
    title: 'Engagement Posts',
    icon: '💬',
    color: '#E91E63',
    topics: [
      'What\'s the most challenging steel connection you\'ve detailed?',
      'Which project phase benefits most from BIM coordination?',
      'Share your favorite Tekla productivity tip.',
      'What\'s the biggest challenge in structural steel fabrication today?',
      'Ask the community about emerging trends in steel detailing.'
    ]
  },
  {
    id: 'aiprompts',
    title: 'AI Image + Post Prompts',
    icon: '🎨',
    color: '#3F51B5',
    topics: [
      'Create a LinkedIn post with a realistic image of a structural steel frame under construction.',
      'Generate a post featuring a 3D Tekla steel model alongside the completed building.',
      'Showcase before-and-after images of a steel model and fabricated structure.',
      'Create a post highlighting connection detailing with close-up steel joints.',
      'Share a project timeline from 3D model to fabricated steel installation.'
    ]
  },
  {
    id: 'hooks',
    title: 'Trending LinkedIn Hooks',
    icon: '🎯',
    color: '#F44336',
    topics: [
      '"Precision isn\'t an option—it\'s the foundation of every successful steel project."',
      '"Behind every steel structure is accurate detailing."',
      '"Every bolt, beam, and connection starts with precise detailing."',
      '"Great fabrication begins with exceptional detailing."',
      '"Quality steel detailing saves time, cost, and rework."'
    ]
  }
];

const SocialHub: React.FC = () => {
  const { token, user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [generatedContent, setGeneratedContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [postHistory, setPostHistory] = useState<PostHistory[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [linkedInToken, setLinkedInToken] = useState<string>(() => {
    return localStorage.getItem('linkedInToken') || '';
  });
  const [showLinkedInAuth, setShowLinkedInAuth] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'linkedin' | 'comingsoon'>('linkedin');
  // AI-generated topics loaded on demand via "Load More", keyed by category id.
  // These are appended to that category's built-in topic list/column and
  // behave exactly like any other topic once selected.
  const [aiTopics, setAiTopics] = useState<Record<string, string[]>>({});
  const [isLoadingMoreTopics, setIsLoadingMoreTopics] = useState<boolean>(false);

  // Secondary toggle: "AI" (existing category/topic picker flow) vs
  // "Prompted" (a free-form prompt typed by the user). Both modes call the
  // exact same /generate-post and /post-to-linkedin endpoints — only the
  // string used as the "topic"/prompt payload differs.
  const [contentMode, setContentMode] = useState<ContentMode>('ai');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  // The topic/prompt actually sent to the last generation call. Used to
  // match history entries and the post-to-LinkedIn call regardless of which
  // mode produced the content.
  const [currentTopic, setCurrentTopic] = useState<string>('');

  // Optional image attached to a generated post before publishing.
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const stored = JSON.parse(
      localStorage.getItem('socialPostHistory') || '[]'
    );
    setPostHistory(stored);
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('socialPostHistory', JSON.stringify(postHistory));
  }, [postHistory]);

  // Save LinkedIn token to localStorage
  useEffect(() => {
    if (linkedInToken) {
      localStorage.setItem('linkedInToken', linkedInToken);
    } else {
      localStorage.removeItem('linkedInToken');
    }
  }, [linkedInToken]);

  // Helper function to get auth headers
  const getAuthHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  };

  const handleCategorySelect = (categoryId: string) => {
    if (selectedCategory === categoryId) {
      setSelectedCategory(null);
      return;
    }
    setSelectedCategory(categoryId);
    setSelectedTopic('');
  };

  const handleTopicSelect = (topic: string) => {
    setSelectedTopic(topic);
    if (window.innerWidth <= 768 && contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Switching between AI / Prompted resets in-flight generated content and
  // any attached image so a stale post from the other mode can't be
  // accidentally published, but keeps each mode's own selections intact.
  const handleContentModeChange = (mode: ContentMode) => {
    if (mode === contentMode) return;
    setContentMode(mode);
    setGeneratedContent('');
    setCurrentTopic('');
    setAttachedImage(null);
  };

  // The prompt/topic that will be used for the next generation call.
  const activeTopic = contentMode === 'ai' ? selectedTopic : customPrompt.trim();

  const generatePost = async () => {
    if (!activeTopic) {
      toast.error(contentMode === 'ai' ? 'Please select a topic first' : 'Please enter a prompt first');
      return;
    }

    if (!token) {
      toast.error('Please login to generate posts');
      return;
    }

    setIsGenerating(true);
    setLoading(true);
    setGeneratedContent('');

    try {
      const response = await fetch(`${API_BASE_URL}/social-post/generate-post`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          topic: activeTopic,
          categoryId: contentMode === 'ai' ? selectedCategory : null
        }),
      });

      if (response.status === 401) {
        toast.error('Session expired. Please login again.');
        setIsGenerating(false);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse = await response.json();
      
      if (data.success && data.content) {
        setGeneratedContent(data.content);
        setCurrentTopic(activeTopic);
        toast.success('✅ Post generated successfully!');
        
        const newHistory: PostHistory = {
          id: Date.now().toString(),
          topic: activeTopic,
          content: data.content,
          timestamp: new Date().toLocaleString(),
          status: 'pending'
        };
        setPostHistory(prev => [newHistory, ...prev]);
      } else {
        throw new Error(data.message || 'Failed to generate post');
      }
    } catch (error: any) {
      console.error('Error generating post:', error);
      toast.error('❌ Failed to generate post. ' + error.message);
    } finally {
      setIsGenerating(false);
      setLoading(false);
    }
  };

  const loadMoreTopics = async () => {
    if (!selectedCategory) return;

    if (!token) {
      toast.error('Please login to load more topics');
      return;
    }

    setIsLoadingMoreTopics(true);

    try {
      const existingTopics = [
        ...(getCategory(selectedCategory)?.topics || []),
        ...(aiTopics[selectedCategory] || [])
      ];

      const response = await fetch(`${API_BASE_URL}/social-post/generate-topics`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          categoryId: selectedCategory,
          existingTopics
        }),
      });

      if (response.status === 401) {
        toast.error('Session expired. Please login again.');
        setIsLoadingMoreTopics(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: { success: boolean; topics?: string[]; message?: string } = await response.json();

      if (data.success && Array.isArray(data.topics)) {
        if (data.topics.length === 0) {
          toast.info('No new topics right now — try again in a moment.');
        } else {
          setAiTopics(prev => ({
            ...prev,
            [selectedCategory]: [...(prev[selectedCategory] || []), ...data.topics!]
          }));
          toast.success(`✨ ${data.topics.length} new topic${data.topics.length > 1 ? 's' : ''} added!`);
        }
      } else {
        throw new Error(data.message || 'Failed to load more topics');
      }
    } catch (error: any) {
      console.error('Error loading more topics:', error);
      toast.error('❌ Failed to load more topics. ' + error.message);
    } finally {
      setIsLoadingMoreTopics(false);
    }
  };

  const postToLinkedIn = async () => {
    if (!generatedContent) {
      toast.error('Please generate content first');
      return;
    }

    if (!token) {
      toast.error('Please login to post to LinkedIn');
      return;
    }

    if (!linkedInToken) {
      setShowLinkedInAuth(true);
      return;
    }

    setIsPosting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/social-post/post-to-linkedin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          content: generatedContent,
          topic: currentTopic,
          linkedInToken: linkedInToken,
          // Optional image attachment, sent as a base64 data URL. Existing
          // backend integrations that don't expect this field can safely
          // ignore it.
          image: attachedImage?.base64 || null
        }),
      });

      const data: ApiResponse = await response.json();

      if (data.needsAuth) {
        setShowLinkedInAuth(true);
        toast.warning('Please re-authenticate with LinkedIn');
        setLinkedInToken('');
        setIsPosting(false);
        return;
      }
      
      if (response.status === 401) {
        toast.error('Session expired. Please login again.');
        setIsPosting(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }
      
      if (data.success) {
        toast.success('✅ Post published to LinkedIn successfully! 🎉');
        
        setPostHistory(prev => 
          prev.map(item => 
            item.topic === currentTopic && item.content === generatedContent
              ? { ...item, status: 'success' }
              : item
          )
        );
        
        setTimeout(() => {
          setGeneratedContent('');
          setSelectedTopic('');
          setCustomPrompt('');
          setCurrentTopic('');
          setAttachedImage(null);
        }, 3000);
      } else {
        throw new Error(data.message || 'Failed to post to LinkedIn');
      }
    } catch (error: any) {
      console.error('Error posting to LinkedIn:', error);
      
      if (error.message && error.message.includes('401')) {
        toast.error('LinkedIn token expired. Please re-authenticate.');
        setShowLinkedInAuth(true);
        setLinkedInToken('');
      } else {
        toast.error('❌ Failed to post to LinkedIn. ' + error.message);
      }
      
      setPostHistory(prev => 
        prev.map(item => 
          item.topic === currentTopic && item.content === generatedContent
            ? { ...item, status: 'error' }
            : item
        )
      );
    } finally {
      setIsPosting(false);
    }
  };

  const handleLinkedInAuth = () => {
    const testToken = prompt('Enter your LinkedIn Access Token:');
    if (testToken && testToken.trim()) {
      setLinkedInToken(testToken.trim());
      setShowLinkedInAuth(false);
      toast.success('✅ LinkedIn connected successfully!');
    }
  };

  const copyToClipboard = () => {
    if (!generatedContent) return;
    navigator.clipboard.writeText(generatedContent);
    toast.success('📋 Content copied to clipboard!');
  };

  const clearContent = () => {
    setGeneratedContent('');
  };

  const handleClearHistory = () => {
    if (postHistory.length === 0) return;
    setShowClearConfirm(true);
  };

  const confirmClearHistory = () => {
    setPostHistory([]);
    setShowClearConfirm(false);
    toast.success('🧹 History cleared successfully!', {
      description: 'All your post history has been removed.',
      duration: 3000,
    });
  };

  const cancelClearHistory = () => {
    setShowClearConfirm(false);
  };

  // Image attach handlers -----------------------------------------------
  const handleAttachImageClick = () => {
    imageInputRef.current?.click();
  };

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input value so selecting the same file again still fires onChange
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('Image must be smaller than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAttachedImage({ file, preview: result, base64: result });
      toast.success('🖼️ Image attached');
    };
    reader.onerror = () => {
      toast.error('Failed to read image file');
    };
    reader.readAsDataURL(file);
  };

  const removeAttachedImage = () => {
    setAttachedImage(null);
  };

  useEffect(() => {
    if (generatedContent && contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [generatedContent]);

  const getCategory = (id: string): TopicCategory | undefined => {
    return CATEGORIES.find(c => c.id === id);
  };

  // Combines a category's built-in topics with any AI-loaded topics into a
  // single list/column, so a "Load More" topic is selected and generated
  // through the exact same flow as a built-in one.
  const getAllTopics = (id: string): { text: string; source: 'builtin' | 'ai' }[] => {
    const builtin = (getCategory(id)?.topics || []).map(text => ({ text, source: 'builtin' as const }));
    const ai = (aiTopics[id] || []).map(text => ({ text, source: 'ai' as const }));
    return [...builtin, ...ai];
  };

  return (
    <div className="social-hub">
      {/* Primary Toggle - LinkedIn / Coming Soon - now the very first thing on the page */}
      <div className="sh-tabs" role="tablist" aria-label="Content Hub sections">
        <button
          type="button"
          className={`sh-tab-btn sh-tab-btn--linkedin ${activeTab === 'linkedin' ? 'active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'linkedin'}
          onClick={() => setActiveTab('linkedin')}
        >
          <Linkedin size={16} className="sh-tab-icon" aria-hidden="true" />
          LinkedIn
          <span className="sh-tab-pill sh-tab-pill--live">Live</span>
        </button>
        <button
          type="button"
          className={`sh-tab-btn is-disabled ${activeTab === 'comingsoon' ? 'active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'comingsoon'}
          aria-disabled="true"
          disabled
          onClick={() => {}}
        >
          <Clock size={16} className="sh-tab-icon" aria-hidden="true" />
          Coming Soon...
        </button>
      </div>

      {/* Header */}
      <header className="hub-header">
        <div className="header-content">
          <div className="header-eyebrow">
            <Rocket size={14} />
            <span>Content Hub</span>
          </div>
          <h1>AI-Powered Content Studio</h1>
          <p>Generate on-brand steel detailing content for LinkedIn in seconds</p>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-number">{postHistory.length}</span>
            <span className="stat-label">Posts Generated</span>
          </div>
          <div className="stat-divider" aria-hidden="true" />
          <div className="stat-item">
            <span className="stat-number">
              {postHistory.filter(p => p.status === 'success').length}
            </span>
            <span className="stat-label">Published</span>
          </div>
        </div>
      </header>

      {/* Main Content - Only show when LinkedIn tab is active */}
      {activeTab === 'linkedin' && (
        <>
          {/* Secondary Toggle - AI (category picker) / Prompted (manual prompt) */}
          <div className="sh-subtabs" role="tablist" aria-label="Content generation mode">
            <button
              type="button"
              className={`sh-subtab-btn ${contentMode === 'ai' ? 'active' : ''}`}
              role="tab"
              aria-selected={contentMode === 'ai'}
              onClick={() => handleContentModeChange('ai')}
            >
              <Sparkles size={15} className="sh-subtab-icon" aria-hidden="true" />
              AI
            </button>
            <button
              type="button"
              className={`sh-subtab-btn ${contentMode === 'prompted' ? 'active' : ''}`}
              role="tab"
              aria-selected={contentMode === 'prompted'}
              onClick={() => handleContentModeChange('prompted')}
            >
              <PenSquare size={15} className="sh-subtab-icon" aria-hidden="true" />
              Prompted
            </button>
          </div>

          <div className="hub-main">
            {contentMode === 'ai' && (
              <aside className="categories-sidebar">
                <h2 className="sidebar-title">Categories</h2>
                <div className="categories-list">
                  {CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                      onClick={() => handleCategorySelect(category.id)}
                      aria-expanded={selectedCategory === category.id}
                      style={{ '--category-color': category.color } as React.CSSProperties}
                    >
                      <span className="category-icon-wrap" aria-hidden="true">
                        <span className="category-icon">{category.icon}</span>
                      </span>
                      <span className="category-title">{category.title}</span>
                      <span className="category-indicator" aria-hidden="true">
                        {selectedCategory === category.id ? (
                          <Check className="category-check" size={14} />
                        ) : (
                          <ChevronRight className="category-arrow" size={14} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            )}

            <div className="main-content">
              {contentMode === 'ai' && selectedCategory && (
                <section className="topics-section animate-slide-in">
                  <div className="section-header">
                    <h2>
                      <span aria-hidden="true">{getCategory(selectedCategory)?.icon}</span>
                      {getCategory(selectedCategory)?.title}
                    </h2>
                    <span className="topic-count">{getAllTopics(selectedCategory).length} topics</span>
                  </div>
                  <div className="topics-grid">
                    {getAllTopics(selectedCategory).map((item, index) => (
                      <button
                        key={`${item.source}-${index}-${item.text}`}
                        type="button"
                        className={`topic-btn ${selectedTopic === item.text ? 'selected' : ''}`}
                        onClick={() => handleTopicSelect(item.text)}
                        style={{ 
                          animationDelay: `${Math.min(index, 20) * 50}ms`,
                          '--topic-index': index 
                        } as React.CSSProperties}
                      >
                        <span className="topic-number">{index + 1}</span>
                        <span className="topic-text">
                          {item.text}
                          {item.source === 'ai' && (
                            <span className="topic-ai-badge">
                              <Sparkles size={11} aria-hidden="true" />
                              AI
                            </span>
                          )}
                        </span>
                        {selectedTopic === item.text && (
                          <Check className="topic-check" size={16} aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={`btn btn-load-more ${isLoadingMoreTopics ? 'loading' : ''}`}
                    onClick={loadMoreTopics}
                    disabled={isLoadingMoreTopics || !token}
                  >
                    {isLoadingMoreTopics ? (
                      <>
                        <span className="spinner" aria-hidden="true"></span>
                        Generating topics...
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} aria-hidden="true" />
                        Load More Topics
                      </>
                    )}
                  </button>
                  {!token && (
                    <span className="auth-warning auth-warning--centered">
                      <AlertTriangle size={14} aria-hidden="true" />
                      Please login to load more topics
                    </span>
                  )}
                </section>
              )}

              {contentMode === 'prompted' && (
                <section className="prompt-section animate-slide-in">
                  <div className="section-header">
                    <h2>
                      <PenSquare size={17} aria-hidden="true" />
                      Custom Prompt
                    </h2>
                  </div>
                  <textarea
                    className="prompt-textarea"
                    placeholder="Describe exactly what you'd like the post to be about. This text will be sent as-is to the generator."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={5}
                  />
                  <div className="prompt-footer">
                    <span className="prompt-char-count">{customPrompt.length} characters</span>
                  </div>
                </section>
              )}

              <div ref={contentRef} className="content-area">
                {activeTopic ? (
                  <div className="generator-section animate-slide-up">
                    <div className="generator-header">
                      <h3>
                        <PenSquare size={18} aria-hidden="true" />
                        Content Generator
                      </h3>
                      <div className="selected-topic-display">
                        <span className="label">{contentMode === 'ai' ? 'Selected Topic' : 'Your Prompt'}</span>
                        <span className="topic-preview">{activeTopic}</span>
                      </div>
                    </div>

                    <div className="generator-actions">
                      <button
                        type="button"
                        className={`btn btn-primary ${isGenerating ? 'loading' : ''}`}
                        onClick={generatePost}
                        disabled={isGenerating || !token}
                      >
                        {isGenerating ? (
                          <>
                            <span className="spinner" aria-hidden="true"></span>
                            Generating...
                          </>
                        ) : (
                          <>
                            <Rocket size={16} aria-hidden="true" />
                            Generate Post
                          </>
                        )}
                      </button>

                      <input
                        type="file"
                        accept="image/*"
                        ref={imageInputRef}
                        onChange={handleImageSelected}
                        className="sh-hidden-file-input"
                        aria-hidden="true"
                        tabIndex={-1}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-attach-image"
                        onClick={handleAttachImageClick}
                      >
                        <ImageIcon size={16} aria-hidden="true" />
                        {attachedImage ? 'Change Image' : 'Attach Image'}
                      </button>

                      {!token && (
                        <span className="auth-warning">
                          <AlertTriangle size={14} aria-hidden="true" />
                          Please login to generate posts
                        </span>
                      )}
                    </div>

                    {attachedImage && (
                      <div className="attached-image-preview animate-fade-in">
                        <img src={attachedImage.preview} alt="Attachment preview" />
                        <div className="attached-image-meta">
                          <span className="attached-image-name">{attachedImage.file.name}</span>
                          <button
                            type="button"
                            className="remove-image-btn"
                            onClick={removeAttachedImage}
                            aria-label="Remove attached image"
                          >
                            <X size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}

                    {generatedContent && (
                      <div className="generated-content animate-fade-in">
                        <div className="content-header">
                          <h4>Generated Content</h4>
                          <div className="content-actions">
                            <button type="button" className="btn btn-sm btn-copy" onClick={copyToClipboard}>
                              <Copy size={14} aria-hidden="true" />
                              Copy
                            </button>
                            <button type="button" className="btn btn-sm btn-clear" onClick={clearContent}>
                              <X size={14} aria-hidden="true" />
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="content-body">
                          <p>{generatedContent}</p>
                        </div>
                        <div className="content-footer">
                          <button
                            type="button"
                            className={`btn btn-success ${isPosting ? 'loading' : ''}`}
                            onClick={postToLinkedIn}
                            disabled={isPosting || !generatedContent || !token}
                          >
                            {isPosting ? (
                              <>
                                <span className="spinner" aria-hidden="true"></span>
                                Posting...
                              </>
                            ) : (
                              <>
                                <Send size={16} aria-hidden="true" />
                                Post to LinkedIn
                              </>
                            )}
                          </button>
                          {!linkedInToken && token && (
                            <span className="auth-warning">
                              <AlertTriangle size={14} aria-hidden="true" />
                              LinkedIn not connected
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Lightbulb size={28} aria-hidden="true" />
                    </div>
                    <h3>{contentMode === 'ai' ? 'Select a Topic' : 'Enter a Prompt'}</h3>
                    <p>
                      {contentMode === 'ai'
                        ? 'Choose a topic from the categories above to generate content'
                        : 'Type a prompt above to generate content from it'}
                    </p>
                  </div>
                )}
              </div>

              {postHistory.length > 0 && (
                <section ref={historyRef} className="history-section animate-slide-in">
                  <div className="history-header">
                    <h3>
                      <BarChart3 size={18} aria-hidden="true" />
                      Post History
                    </h3>
                    <button 
                      type="button"
                      className="btn btn-sm btn-clear-history"
                      onClick={handleClearHistory}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Clear All
                    </button>
                  </div>
                  <div className="history-list">
                    {postHistory.map((item) => (
                      <div key={item.id} className={`history-item status-${item.status}`}>
                        <div className="history-content">
                          <div className="history-topic">{item.topic}</div>
                          <div className="history-preview">
                            {item.content.substring(0, 100)}...
                          </div>
                        </div>
                        <div className="history-meta">
                          <span className="history-time">{item.timestamp}</span>
                          <span className={`history-status status-${item.status}`}>
                            {item.status === 'success' ? <CheckCircle2 size={14} aria-hidden="true" /> :
                             item.status === 'error' ? <XCircle size={14} aria-hidden="true" /> :
                             <Loader2 size={14} className="spin-icon" aria-hidden="true" />}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </>
      )}

      {/* Coming Soon Tab Content */}
      {activeTab === 'comingsoon' && (
        <div className="coming-soon-content">
          <div className="coming-soon-card">
            <div className="coming-soon-icon">
              <Sparkles size={32} aria-hidden="true" />
            </div>
            <h2>Exciting Features Coming Soon</h2>
            <p>We're working on amazing new features to supercharge your content creation.</p>
            
            <div className="coming-soon-features">
              <div className="feature-item">
                <Sparkles className="feature-icon" size={22} aria-hidden="true" />
                <div>
                  <h4>AI Image Generation</h4>
                  <p>Generate stunning visuals for your posts</p>
                </div>
              </div>
              <div className="feature-item">
                <Zap className="feature-icon" size={22} aria-hidden="true" />
                <div>
                  <h4>Auto-Scheduling</h4>
                  <p>Schedule posts for optimal engagement</p>
                </div>
              </div>
              <div className="feature-item">
                <TrendingUp className="feature-icon" size={22} aria-hidden="true" />
                <div>
                  <h4>Analytics Dashboard</h4>
                  <p>Track post performance and engagement</p>
                </div>
              </div>
              <div className="feature-item">
                <Users className="feature-icon" size={22} aria-hidden="true" />
                <div>
                  <h4>Team Collaboration</h4>
                  <p>Work together with your team</p>
                </div>
              </div>
              <div className="feature-item">
                <MessageCircle className="feature-icon" size={22} aria-hidden="true" />
                <div>
                  <h4>AI Content Suggestions</h4>
                  <p>Get smart topic recommendations</p>
                </div>
              </div>
            </div>

            <div className="coming-soon-notify">
              <p>
                <Bell size={16} aria-hidden="true" />
                Be the first to know when these features launch!
              </p>
              <button type="button" className="btn btn-primary notify-btn" disabled>
                <Clock size={16} aria-hidden="true" />
                Stay Tuned
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LinkedIn Auth Modal */}
      {showLinkedInAuth && (
        <div className="modal-overlay" onClick={() => setShowLinkedInAuth(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <Link2 size={22} aria-hidden="true" />
            </div>
            <h2>Connect LinkedIn</h2>
            <p>You need to connect your LinkedIn account to post content.</p>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
              Enter your LinkedIn Access Token to connect.
            </p>
            <div className="modal-actions">
              <button 
                type="button"
                className="btn btn-primary"
                onClick={handleLinkedInAuth}
              >
                Connect LinkedIn
              </button>
              <button 
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLinkedInAuth(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Clear History Confirmation Modal */}
      {showClearConfirm && (
        <div className="modal-overlay" onClick={cancelClearHistory}>
          <div className="modal-content clear-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="clear-icon">
              <Trash2 size={26} aria-hidden="true" />
            </div>
            <h2>Clear Post History?</h2>
            <p className="clear-description">
              This action will permanently delete all your <strong>{postHistory.length}</strong> post history items.
            </p>
            <div className="clear-details">
              <span className="clear-detail-item">
                <Clock size={14} aria-hidden="true" />
                <span>{postHistory.filter(p => p.status === 'pending').length} pending</span>
              </span>
              <span className="clear-detail-item">
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>{postHistory.filter(p => p.status === 'success').length} published</span>
              </span>
              <span className="clear-detail-item">
                <XCircle size={14} aria-hidden="true" />
                <span>{postHistory.filter(p => p.status === 'error').length} failed</span>
              </span>
            </div>
            <p className="clear-warning">
              <AlertTriangle size={14} aria-hidden="true" />
              This action cannot be undone
            </p>
            <div className="modal-actions">
              <button 
                type="button"
                className="btn btn-danger"
                onClick={confirmClearHistory}
              >
                <Trash2 size={14} aria-hidden="true" />
                Clear All
              </button>
              <button 
                type="button"
                className="btn btn-secondary"
                onClick={cancelClearHistory}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialHub;