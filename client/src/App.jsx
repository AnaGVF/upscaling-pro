import { useEffect, useMemo, useRef, useState } from 'react';

const PRESETS = [
  { id: 'hd', label: 'HD', size: '1280 px', subtitle: 'Fast · 720p / Web' },
  { id: '2k', label: '2K', size: '2560 px', subtitle: 'QHD · High Definition' },
  { id: '4k', label: '4K', size: '3840 px', subtitle: 'Ultra-HD · Maximum Clarity' }
];

const AI_MODELS = [
  { id: 'realesrgan-x4plus', label: 'Real-ESRGAN x4+', desc: 'Photography, portraits, real-world scenes' },
  { id: 'realesrgan-x4plus-anime', label: 'Real-ESRGAN Anime', desc: 'Illustrations, 2D anime, manga & graphic art' }
];

const STATUS_LABELS = {
  queued: 'Queued in processing queue',
  processing: 'Running super-resolution pipeline',
  done: 'Ready for download',
  error: 'Processing error'
};

function playCompletionChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const playTone = (freq, startTime, duration, gainLevel = 0.08) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(523.25, now, 0.25, 0.06);       // C5
    playTone(659.25, now + 0.07, 0.25, 0.08); // E5
    playTone(783.99, now + 0.14, 0.35, 0.1);  // G5
  } catch {
    // Audio context may be restricted before user gesture
  }
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('upscaling_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('upscaling_sound');
    return saved !== 'false';
  });

  const mediaType = 'image';
  const [preset, setPreset] = useState('2k');
  const [selectedModel, setSelectedModel] = useState('realesrgan-x4plus');
  const [blendStrength, setBlendStrength] = useState(30); // 30% default
  const [file, setFile] = useState(null);
  const [fileDimensions, setFileDimensions] = useState(null);
  const [job, setJob] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [upscaledBlobUrl, setUpscaledBlobUrl] = useState('');
  const [sliderPos, setSliderPos] = useState(50);
  const [compareMode, setCompareMode] = useState('split');
  const [clarityPostProcess, setClarityPostProcess] = useState(0); // 0 to 100 post-upscale clarity

  const inputRef = useRef(null);
  const sliderRef = useRef(null);
  const isDraggingSlider = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('upscaling_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('upscaling_sound', String(soundEnabled));
  }, [soundEnabled]);

  const previewUrl = useMemo(() => {
    if (!file) return '';
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (upscaledBlobUrl) URL.revokeObjectURL(upscaledBlobUrl);
    };
  }, [upscaledBlobUrl]);

  // Read native image dimensions when selected
  useEffect(() => {
    if (!file) {
      setFileDimensions(null);
      return;
    }

    const img = new Image();
    img.src = previewUrl;
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setFileDimensions({ width: w, height: h });

      // Auto-suggest upscaling preset if current preset would downscale
      const maxDim = Math.max(w, h);
      setPreset((prev) => {
        const currentTarget = prev === 'hd' ? 1280 : prev === '2k' ? 2560 : 3840;
        if (maxDim > currentTarget) {
          if (maxDim < 2560) return '2k';
          if (maxDim < 3840) return '4k';
        }
        return prev;
      });
    };
  }, [file, previewUrl]);

  useEffect(() => {
    if (job?.status === 'done' && job.downloadUrl) {
      let cancelled = false;
      fetch(job.downloadUrl)
        .then((res) => {
          if (!res.ok) throw new Error('Could not fetch upscaled preview');
          return res.blob();
        })
        .then((blob) => {
          if (!cancelled) {
            const url = URL.createObjectURL(blob);
            setUpscaledBlobUrl(url);
          }
        })
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    } else {
      setUpscaledBlobUrl('');
    }
  }, [job?.status, job?.downloadUrl]);

  useEffect(() => {
    if (!job?.id || job.status === 'done' || job.status === 'error') return undefined;

    let cancelled = false;

    async function pollJob() {
      try {
        const response = await fetch(`/api/jobs/${job.id}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Could not read job status.');
        }

        if (!cancelled) {
          setJob((prev) => {
            if (prev?.status !== 'done' && data.status === 'done') {
              if (soundEnabled) playCompletionChime();
            }
            return data;
          });

          if (data.status === 'error') {
            setError(data.error || 'The processing pipeline encountered an error.');
          }
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      }
    }

    pollJob();
    const intervalId = window.setInterval(pollJob, 350);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [job?.id, job?.status, soundEnabled]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) playCompletionChime();
  }

  const downloadLink = useMemo(() => {
    if (!job?.downloadUrl) return '';
    if (clarityPostProcess > 0) {
      return `${job.downloadUrl}?sharpness=${clarityPostProcess}`;
    }
    return job.downloadUrl;
  }, [job?.downloadUrl, clarityPostProcess]);

  async function handleDownloadClick(e) {
    if (clarityPostProcess === 0) {
      return; // Direct browser download of untouched high-res master
    }

    e.preventDefault();

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = upscaledBlobUrl || downloadLink;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      // Bake the exact same clarity, edge contrast, and micro-sharpness as shown in the canvas preview
      ctx.filter = `contrast(${100 + clarityPostProcess * 0.12}%) brightness(${100 + clarityPostProcess * 0.02}%)`;
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) {
          window.location.href = downloadLink;
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const originalBase = job?.downloadName || (file ? `${file.name.replace(/\.[^.]+$/, '')}-${preset}-upscaled.png` : 'upscaled.png');
        const fileName = originalBase.replace(/(\.[^.]+)$/, `-sharp-${clarityPostProcess}$1`);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }, 'image/png');
    } catch {
      window.location.href = downloadLink;
    }
  }

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    if (nextFile) {
      setFile(nextFile);
      setJob(null);
      setError('');
      setUpscaledBlobUrl('');
      setClarityPostProcess(0);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (!droppedFile.type.startsWith('image/')) {
        setError('Please drop an image file (PNG, JPEG, WebP, TIFF).');
        return;
      }
      setFile(droppedFile);
      setJob(null);
      setError('');
      setUpscaledBlobUrl('');
      setClarityPostProcess(0);
    }
  }

  function handleReset() {
    setFile(null);
    setJob(null);
    setError('');
    setUpscaledBlobUrl('');
    setFileDimensions(null);
    setClarityPostProcess(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) {
      setError('Select a source image file first.');
      return;
    }

    setIsUploading(true);
    setError('');
    setJob(null);
    setUpscaledBlobUrl('');
    setClarityPostProcess(0);

    const formData = new FormData();
    formData.append('mediaType', 'image');
    formData.append('preset', preset);
    formData.append('model', selectedModel);
    formData.append('blendStrength', String(blendStrength / 100));
    formData.append('media', file);

    try {
      const response = await fetch('/api/upscale', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload request failed.');
      }

      setJob({ id: data.jobId, status: 'queued', message: 'Job queued' });
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsUploading(false);
    }
  }

  function updateSliderPosition(clientX) {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  }

  function handleSliderMouseDown(e) {
    isDraggingSlider.current = true;
    updateSliderPosition(e.clientX);
    window.addEventListener('mousemove', handleSliderMouseMove);
    window.addEventListener('mouseup', handleSliderMouseUp);
  }

  function handleSliderMouseMove(e) {
    if (!isDraggingSlider.current) return;
    updateSliderPosition(e.clientX);
  }

  function handleSliderMouseUp() {
    isDraggingSlider.current = false;
    window.removeEventListener('mousemove', handleSliderMouseMove);
    window.removeEventListener('mouseup', handleSliderMouseUp);
  }

  const isWorking = isUploading || job?.status === 'queued' || job?.status === 'processing';
  const statusText = isUploading
    ? 'Uploading'
    : job
      ? STATUS_LABELS[job.status] || job.status
      : 'Idle';

  let currentStep = 0;
  if (job?.status === 'done') currentStep = 3;
  else if (job?.status === 'processing') currentStep = 2;
  else if (job?.status === 'queued' || isUploading) currentStep = 1;

  // Calculate estimated target output dimensions & detect downscaling
  const targetLongEdge = preset === 'hd' ? 1280 : preset === '2k' ? 2560 : 3840;
  const sourceLongEdge = fileDimensions ? Math.max(fileDimensions.width, fileDimensions.height) : null;
  const isDownscaling = Boolean(sourceLongEdge && sourceLongEdge > targetLongEdge);
  const suggestedPreset = sourceLongEdge
    ? (sourceLongEdge < 2560 ? '2k' : sourceLongEdge < 3840 ? '4k' : null)
    : null;

  let targetDims = null;
  if (fileDimensions) {
    const { width, height } = fileDimensions;
    if (width >= height) {
      const scale = targetLongEdge / width;
      targetDims = `${targetLongEdge} × ${Math.round(height * scale)} px`;
    } else {
      const scale = targetLongEdge / height;
      targetDims = `${Math.round(width * scale)} × ${targetLongEdge} px`;
    }
  }

  return (
    <div className={`app-shell theme-${theme}`}>
      {/* Top Header */}
      <header className="top-header">
        <div className="top-header-inner">
          <div className="header-brand">
            <div className="brand-logo-container">
              <svg className="brand-icon" viewBox="0 0 64 64" fill="none">
                <defs>
                  <linearGradient id="navGem" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#818cf8" />
                  </linearGradient>
                </defs>
                <rect width="64" height="64" rx="16" fill="#0f172a" />
                <polygon points="32,10 50,22 50,42 32,54 14,42 14,22" fill="none" stroke="url(#navGem)" strokeWidth="3" strokeLinejoin="round" />
                <polygon points="32,10 32,32 50,22" fill="#38bdf8" opacity="0.7" />
                <polygon points="14,22 32,32 14,42" fill="#818cf8" opacity="0.4" />
                <path d="M32 23 C32 28, 27 32, 22 32 C 27 32, 32 36, 32 41 C 32 36, 37 32, 42 32 C 37 32, 32 28, 32 23 Z" fill="#ffffff" />
              </svg>
            </div>
            <div>
              <div className="brand-title-wrap">
                <span className="brand-title">Upscaling Pro</span>
              </div>
              <p className="brand-subtitle">High-Fidelity AI Super-Resolution Studio</p>
            </div>
          </div>

          <div className="header-actions">
            {/* Sound Notification Toggle */}
            <button
              type="button"
              className="action-icon-btn"
              onClick={toggleSound}
              title={soundEnabled ? 'Notification chime on' : 'Notification chime muted'}
              aria-label="Toggle sound notifications"
            >
              {soundEnabled ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              )}
            </button>

            {/* Dark / Light Mode Toggle */}
            <button
              type="button"
              className="action-icon-btn theme-toggle-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
              aria-label="Toggle color theme"
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Viewport (Expanded full-canvas feel) */}
      <main className="main-content">
        <section className="studio-layout">
          {/* Controls Panel */}
          <div className="studio-card control-card">
            <div className="card-header">
              <span className="section-label">Source &amp; Parameters</span>
              <h2>Configuration</h2>
            </div>

            <form onSubmit={handleSubmit} className="studio-form">
              {/* Target Preset */}
              <div className="form-group">
                <label className="field-label">Target Resolution</label>
                <div className="preset-grid">
                  {PRESETS.map((item) => {
                    const presetEdge = item.id === 'hd' ? 1280 : item.id === '2k' ? 2560 : 3840;
                    const willDownscale = sourceLongEdge && sourceLongEdge > presetEdge;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`preset-card ${item.id === preset ? 'active' : ''} ${willDownscale ? 'downscale-preset' : ''}`}
                        onClick={() => setPreset(item.id)}
                        disabled={isWorking}
                      >
                        <div className="preset-top">
                          <span className="preset-title">{item.label}</span>
                          <span className="preset-dim">{item.size}</span>
                        </div>
                        <span className="preset-sub">
                          {willDownscale ? '⚠️ Downscales source' : item.subtitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI Neural Model Selector */}
              <div className="form-group">
                <div className="label-with-tip">
                  <label className="field-label" htmlFor="model-select">AI Enhancement Model</label>
                </div>
                <div className="custom-select-wrapper">
                  <select
                    id="model-select"
                    className="studio-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isWorking}
                  >
                    {AI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.desc})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Interactive Detail Blend Slider */}
              <div className="form-group">
                <div className="slider-header-wrap">
                  <label className="field-label" htmlFor="blend-slider">
                    Natural Detail Blend
                  </label>
                  <span className="blend-value-pill">{blendStrength}% AI</span>
                </div>
                <input
                  id="blend-slider"
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={blendStrength}
                  onChange={(e) => setBlendStrength(Number(e.target.value))}
                  disabled={isWorking}
                  className="studio-range-slider"
                />
                <div className="slider-legend">
                  <span>Subtle &amp; Organic (20%)</span>
                  <span>Balanced (30%)</span>
                  <span>Full AI (100%)</span>
                </div>
              </div>

              {/* File Drop Area */}
              <div className="form-group">
                <label className="field-label">Input Source File</label>
                <div
                  className={`drop-area ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />

                  <div className="drop-icon-container">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>

                  <div className="drop-text-content">
                    <p className="drop-primary-text">
                      {file ? file.name : 'Select or drop image file'}
                    </p>
                    <p className="drop-secondary-text">
                      {file
                        ? `${formatBytes(file.size)} ${fileDimensions ? `· ${fileDimensions.width} × ${fileDimensions.height} px` : ''}`
                        : 'PNG, JPEG, WebP, TIFF (up to 1 GB)'}
                    </p>
                  </div>

                  {file && !isWorking && (
                    <button
                      type="button"
                      className="clear-file-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReset();
                      }}
                      title="Clear file"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Output Target Summary Card */}
              {file && (
                <div className="output-specs-card">
                  <div className="spec-row">
                    <span className="spec-label">Source Resolution:</span>
                    <span className="spec-val">
                      {fileDimensions ? `${fileDimensions.width} × ${fileDimensions.height} px` : 'Reading...'}
                    </span>
                  </div>
                  <div className="spec-row">
                    <span className="spec-label">Target Output:</span>
                    <span className={`spec-val ${isDownscaling ? 'warning-val' : 'highlight'}`}>
                      {targetDims || `${targetLongEdge} px longest edge`}
                    </span>
                  </div>
                </div>
              )}

              {/* Orange Downscaling Notice Banner */}
              {file && isDownscaling && (
                <div className="downscaling-notice">
                  <div className="downscale-notice-header">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="notice-icon">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>Downscaling Notice</span>
                  </div>
                  <p className="downscale-notice-body">
                    Your source image ({sourceLongEdge} px) is already larger than the selected {PRESETS.find((p) => p.id === preset)?.label} preset ({targetLongEdge} px). Processing this will downscale the image instead of upscaling it.
                  </p>
                  {suggestedPreset && (
                    <button
                      type="button"
                      className="downscale-switch-btn"
                      onClick={() => setPreset(suggestedPreset)}
                    >
                      Switch to {PRESETS.find((p) => p.id === suggestedPreset)?.label} to Upscale →
                    </button>
                  )}
                </div>
              )}

              {/* Action Button */}
              <div className="action-row">
                <button
                  type="submit"
                  className={`submit-action-btn ${isDownscaling ? 'btn-downscale-warning' : ''}`}
                  disabled={isWorking || !file}
                >
                  {isWorking ? (
                    <>
                      <span className="spinner" />
                      <span>{isUploading ? 'Uploading Image...' : 'Upscaling with Vulkan...'}</span>
                    </>
                  ) : (
                    <span>
                      {isDownscaling
                        ? `Downscale to ${PRESETS.find((p) => p.id === preset)?.label}`
                        : `Enhance to ${PRESETS.find((p) => p.id === preset)?.label}`}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Large Preview & Inspection Column */}
          <div className="studio-card preview-card">
            <div className="card-header preview-header">
              <div>
                <span className="section-label">Inspection &amp; Master Output</span>
                <h2>Canvas Preview</h2>
              </div>

              {job?.status === 'done' && upscaledBlobUrl && (
                <div className="view-toggle-wrap">
                  <button
                    type="button"
                    className={`toggle-pill ${compareMode === 'split' ? 'active' : ''}`}
                    onClick={() => setCompareMode('split')}
                  >
                    Split Slider
                  </button>
                  <button
                    type="button"
                    className={`toggle-pill ${compareMode === 'side' ? 'active' : ''}`}
                    onClick={() => setCompareMode('side')}
                  >
                    Side by Side
                  </button>
                </div>
              )}
            </div>

            {/* Expansive Canvas Viewport */}
            <div className="canvas-wrapper">
              {!file ? (
                <div className="empty-canvas">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="empty-icon">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <h3>No image selected</h3>
                  <p>Upload a photo from the left panel to begin inspection and super-resolution</p>
                </div>
              ) : job?.status === 'done' && upscaledBlobUrl ? (
                compareMode === 'split' ? (
                  <div
                    className="split-slider-container"
                    ref={sliderRef}
                    onMouseDown={handleSliderMouseDown}
                  >
                    <img src={previewUrl} alt="Original" className="slider-img original-img" />

                    <div
                      className="slider-overlay"
                      style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
                    >
                      <img
                        src={upscaledBlobUrl}
                        alt="Upscaled AI"
                        className="slider-img upscaled-img"
                        style={{
                          filter: clarityPostProcess > 0
                            ? `contrast(${100 + clarityPostProcess * 0.12}%) brightness(${100 + clarityPostProcess * 0.02}%)`
                            : 'none'
                        }}
                      />
                    </div>

                    <div className="slider-divider" style={{ left: `${sliderPos}%` }}>
                      <div className="slider-handle" aria-label="Drag to compare">
                        <span>⬌</span>
                      </div>
                    </div>

                    <div className="slider-badge badge-left">Original</div>
                    <div className="slider-badge badge-right">Upscaled ({PRESETS.find((p) => p.id === preset)?.label})</div>
                  </div>
                ) : (
                  <div className="side-by-side-container">
                    <div className="side-pane">
                      <div className="side-badge">Original Source</div>
                      <img src={previewUrl} alt="Original" />
                    </div>
                    <div className="side-pane">
                      <div className="side-badge accent">Upscaled ({PRESETS.find((p) => p.id === preset)?.label})</div>
                      <img
                        src={upscaledBlobUrl}
                        alt="Upscaled"
                        style={{
                          filter: clarityPostProcess > 0
                            ? `contrast(${100 + clarityPostProcess * 0.12}%) brightness(${100 + clarityPostProcess * 0.02}%)`
                            : 'none'
                        }}
                      />
                    </div>
                  </div>
                )
              ) : (
                <div className="standard-preview-container">
                  <img src={previewUrl} alt={file.name} className="standard-preview-img" />
                  {isWorking && (
                    <div className="processing-overlay">
                      <div className="overlay-card">
                        <div className="overlay-top-row">
                          <span className="spinner" />
                          <span className="overlay-status">{statusText}</span>
                        </div>
                        
                        {/* Interactive Granular Progress Bar */}
                        <div className="progress-bar-container">
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${job?.progress || (isUploading ? 5 : 15)}%` }}
                          />
                        </div>

                        <div className="progress-meta-row">
                          <span className="overlay-sub">{job?.message || 'Processing high-res master...'}</span>
                          <span className="progress-percent-badge">{job?.progress || (isUploading ? 5 : 15)}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pipeline Step Tracker */}
            <div className="pipeline-tracker">
              <div className={`pipeline-step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
                <div className="step-circle">{currentStep > 1 ? '✓' : '1'}</div>
                <div className="step-label">Upload</div>
              </div>
              <div className={`pipeline-line ${currentStep >= 2 ? 'filled' : ''}`} />
              <div className={`pipeline-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
                <div className="step-circle">{currentStep > 2 ? '✓' : '2'}</div>
                <div className="step-label">Vulkan AI Inference</div>
              </div>
              <div className={`pipeline-line ${currentStep >= 3 ? 'filled' : ''}`} />
              <div className={`pipeline-step ${currentStep >= 3 ? 'active' : ''}`}>
                <div className="step-circle">{currentStep >= 3 ? '✓' : '3'}</div>
                <div className="step-label">Ready</div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="studio-alert error">
                <div className="alert-text">
                  <strong>Notice:</strong> {error}
                </div>
              </div>
            )}

            {/* Post-Processing Clarity Tuning & Ready Banner */}
            {job?.status === 'done' && job.downloadUrl && (
              <div className="ready-hub-card">
                <div className="clarity-tuning-section">
                  <div className="clarity-header">
                    <div className="clarity-title-wrap">
                      <div>
                        <h5>Post-Processing Clarity &amp; Sharpness</h5>
                        <p>Adjust micro-contrast and edge sharpness before exporting</p>
                      </div>
                    </div>
                    <span className="clarity-badge">
                      {clarityPostProcess === 0 ? 'Natural' : `+${clarityPostProcess}%`}
                    </span>
                  </div>

                  <div className="clarity-slider-wrap">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={clarityPostProcess}
                      onChange={(e) => setClarityPostProcess(Number(e.target.value))}
                      className="studio-range-slider clarity-slider"
                      aria-label="Adjust Clarity and Sharpness"
                    />
                    <div className="slider-legend">
                      <span>Original (0%)</span>
                      <span>Crisp (30%)</span>
                      <span>High Clarity (60%)</span>
                      <span>Ultra Sharp (100%)</span>
                    </div>
                  </div>
                </div>

                <div className="download-ready-banner">
                  <div className="download-info">
                    <h4>Processing Complete</h4>
                    <p>{job.downloadName || 'File enhanced and ready for export.'}</p>
                  </div>
                  <a
                    className="download-cta-btn"
                    href={downloadLink}
                    onClick={handleDownloadClick}
                    download={
                      job?.downloadName
                        ? (clarityPostProcess > 0
                            ? job.downloadName.replace(/(\.[^.]+)$/, `-sharp-${clarityPostProcess}$1`)
                            : job.downloadName)
                        : `upscaled-${preset}${clarityPostProcess > 0 ? `-sharp-${clarityPostProcess}` : ''}.png`
                    }
                  >
                    <span>Download</span>
                    <span className="btn-arrow">↓</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="app-footer-inner">
          <div className="footer-left" />

          <div className="footer-right">
            <span className="copyright-text">
              © All rights reserved by Ana Vassallo
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
