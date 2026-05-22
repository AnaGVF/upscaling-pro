import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { PRESETS, processMedia } from './upscaler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const storageDir = path.join(rootDir, 'storage');
const incomingDir = path.join(storageDir, 'incoming');
const jobsDir = path.join(storageDir, 'jobs');
const distDir = path.join(rootDir, 'dist');
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 1024);
const port = Number(process.env.PORT || 4000);

fs.mkdirSync(incomingDir, { recursive: true });
fs.mkdirSync(jobsDir, { recursive: true });

const jobs = new Map();
const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.diskStorage({
    destination: incomingDir,
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase();
      callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: {
    fileSize: maxUploadMb * 1024 * 1024
  }
});

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    presets: Object.values(PRESETS).map(({ key, label, longEdge }) => ({ key, label, longEdge })),
    model: process.env.REAL_ESRGAN_MODEL || 'realesrgan-x4plus'
  });
});

app.post('/api/upscale', upload.single('media'), (request, response) => {
  const { mediaType, preset } = request.body;

  if (!request.file) {
    response.status(400).json({ error: 'Upload an image or video file.' });
    return;
  }

  if (!['image', 'video'].includes(mediaType)) {
    response.status(400).json({ error: 'Choose either image or video.' });
    return;
  }

  if (!PRESETS[preset]) {
    response.status(400).json({ error: 'Choose HD, 2K, or 4K.' });
    return;
  }

  if (!matchesSelectedMediaType(request.file, mediaType)) {
    response.status(400).json({ error: `The uploaded file does not look like a ${mediaType}.` });
    return;
  }

  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    status: 'queued',
    message: 'Queued',
    mediaType,
    preset,
    originalName: request.file.originalname,
    createdAt: new Date().toISOString()
  };

  jobs.set(jobId, job);
  response.status(202).json({ jobId, statusUrl: `/api/jobs/${jobId}` });

  queueMicrotask(async () => {
    try {
      updateJob(jobId, { status: 'processing', message: 'Preparing media' });
      const result = await processMedia({
        inputPath: request.file.path,
        originalName: request.file.originalname,
        mediaType,
        presetKey: preset,
        jobsDir,
        jobId,
        onProgress: (message) => updateJob(jobId, { message })
      });

      updateJob(jobId, {
        status: 'done',
        message: 'Ready to download',
        outputPath: result.outputPath,
        downloadName: result.downloadName,
        downloadUrl: `/api/download/${jobId}`
      });
    } catch (error) {
      updateJob(jobId, {
        status: 'error',
        message: 'Processing failed',
        error: readableError(error)
      });
    }
  });
});

app.get('/api/jobs/:jobId', (request, response) => {
  const job = jobs.get(request.params.jobId);
  if (!job) {
    response.status(404).json({ error: 'Job not found.' });
    return;
  }

  response.json(publicJob(job));
});

app.get('/api/download/:jobId', (request, response) => {
  const job = jobs.get(request.params.jobId);

  if (!job) {
    response.status(404).json({ error: 'Job not found.' });
    return;
  }

  if (job.status !== 'done' || !job.outputPath) {
    response.status(409).json({ error: 'The upscaled file is not ready yet.' });
    return;
  }

  response.download(job.outputPath, job.downloadName);
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    response.status(413).json({ error: `File is too large. The limit is ${maxUploadMb} MB.` });
    return;
  }

  response.status(500).json({ error: readableError(error) });
});

app.listen(port, () => {
  console.log(`Upscaling Pro API listening on http://localhost:${port}`);
});

function updateJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) return;
  jobs.set(jobId, { ...job, ...patch, updatedAt: new Date().toISOString() });
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    message: job.message,
    mediaType: job.mediaType,
    preset: job.preset,
    originalName: job.originalName,
    downloadUrl: job.downloadUrl,
    error: job.error
  };
}

function matchesSelectedMediaType(file, mediaType) {
  const mimeType = file.mimetype || '';
  if (mimeType.startsWith(`${mediaType}/`)) return true;

  const extension = path.extname(file.originalname || '').toLowerCase();
  const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);
  const videoExtensions = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi']);

  return mediaType === 'image' ? imageExtensions.has(extension) : videoExtensions.has(extension);
}

function readableError(error) {
  if (!error) return 'Unknown error.';
  return error.stderr || error.message || String(error);
}
