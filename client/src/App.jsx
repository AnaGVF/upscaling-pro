import { useEffect, useMemo, useRef, useState } from 'react';

const MEDIA_TYPES = [
  { id: 'image', label: 'Image', accept: 'image/*' },
  { id: 'video', label: 'Video', accept: 'video/*' }
];

const PRESETS = [
  { id: 'hd', label: 'HD', size: '1280' },
  { id: '2k', label: '2K', size: '2560' },
  { id: '4k', label: '4K', size: '3840' }
];

const STATUS_LABELS = {
  queued: 'Queued',
  processing: 'Processing',
  done: 'Ready',
  error: 'Needs attention'
};

function App() {
  const [mediaType, setMediaType] = useState('image');
  const [preset, setPreset] = useState('hd');
  const [file, setFile] = useState(null);
  const [job, setJob] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const selectedMediaType = MEDIA_TYPES.find((item) => item.id === mediaType);

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
          setJob(data);
          if (data.status === 'error') {
            setError(data.error || 'The upscaling job failed.');
          }
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      }
    }

    pollJob();
    const intervalId = window.setInterval(pollJob, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [job?.id, job?.status]);

  function handleMediaTypeChange(nextType) {
    setMediaType(nextType);
    setFile(null);
    setJob(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setJob(null);
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) {
      setError('Choose a file first.');
      return;
    }

    setIsUploading(true);
    setError('');
    setJob(null);

    const formData = new FormData();
    formData.append('mediaType', mediaType);
    formData.append('preset', preset);
    formData.append('media', file);

    try {
      const response = await fetch('/api/upscale', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed.');
      }

      setJob({ id: data.jobId, status: 'queued', message: 'Queued' });
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsUploading(false);
    }
  }

  const isWorking = isUploading || job?.status === 'queued' || job?.status === 'processing';
  const statusText = isUploading
    ? 'Uploading'
    : job
      ? STATUS_LABELS[job.status] || job.status
      : 'Idle';

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="app-title">
        <div className="intro">
          <p className="eyebrow">Free local AI upscaling</p>
          <h1 id="app-title">Upscaling Pro</h1>
          <p className="summary">
            Upload media, choose the target preset, and download the enhanced result.
          </p>
        </div>

        <form className="upscale-panel" onSubmit={handleSubmit}>
          <div className="control-row" aria-label="Media type">
            {MEDIA_TYPES.map((item) => (
              <button
                className={item.id === mediaType ? 'choice active' : 'choice'}
                key={item.id}
                type="button"
                onClick={() => handleMediaTypeChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="control-row preset-row" aria-label="Target resolution">
            {PRESETS.map((item) => (
              <button
                className={item.id === preset ? 'choice active' : 'choice'}
                key={item.id}
                type="button"
                onClick={() => setPreset(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.size}</small>
              </button>
            ))}
          </div>

          <label className="drop-zone">
            <input
              ref={inputRef}
              type="file"
              accept={selectedMediaType.accept}
              onChange={handleFileChange}
            />
            <span className="drop-title">{file ? file.name : `Choose ${selectedMediaType.label.toLowerCase()}`}</span>
            <span className="drop-meta">{file ? `${formatBytes(file.size)} selected` : selectedMediaType.accept}</span>
          </label>

          {file && (
            <div className="preview-frame">
              {mediaType === 'image' ? (
                <img src={previewUrl} alt={file.name} />
              ) : (
                <video src={previewUrl} controls />
              )}
            </div>
          )}

          <button className="submit-button" type="submit" disabled={isWorking || !file}>
            {isWorking ? 'Working' : 'Upscale'}
          </button>
        </form>

        <aside className="status-panel" aria-live="polite">
          <div>
            <p className="eyebrow">Status</p>
            <h2>{statusText}</h2>
            <p>{job?.message || 'Ready for the next upload.'}</p>
          </div>

          {error && <p className="error-message">{error}</p>}

          {job?.status === 'done' && job.downloadUrl && (
            <a className="download-button" href={job.downloadUrl}>
              Download upscaled file
            </a>
          )}
        </aside>
      </section>
    </main>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export default App;
