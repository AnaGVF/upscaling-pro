import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { PRESETS, getProcessorConfig, processMedia, run } from './upscaler.js';

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
  const { preset, model, blendStrength } = request.body;

  if (!request.file) {
    response.status(400).json({ error: 'Upload an image file.' });
    return;
  }

  if (!PRESETS[preset]) {
    response.status(400).json({ error: 'Choose HD, 2K, or 4K.' });
    return;
  }

  if (!matchesSelectedMediaType(request.file)) {
    response.status(400).json({ error: 'The uploaded file does not look like a supported image.' });
    return;
  }

  const validModels = ['realesrgan-x4plus', 'realesrgan-x4plus-anime'];
  const selectedModel = validModels.includes(model) ? model : undefined;
  const parsedBlend = blendStrength !== undefined ? parseFloat(blendStrength) : undefined;

  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    status: 'queued',
    message: 'Queued',
    progress: 0,
    mediaType: 'image',
    preset,
    model: selectedModel,
    blendStrength: parsedBlend,
    originalName: request.file.originalname,
    createdAt: new Date().toISOString()
  };

  jobs.set(jobId, job);
  response.status(202).json({ jobId, statusUrl: `/api/jobs/${jobId}` });

  queueMicrotask(async () => {
    try {
      updateJob(jobId, { status: 'processing', message: 'Preparing image', progress: 5 });
      const result = await processMedia({
        inputPath: request.file.path,
        originalName: request.file.originalname,
        mediaType: 'image',
        presetKey: preset,
        model: selectedModel,
        blendStrength: parsedBlend,
        jobsDir,
        jobId,
        onProgress: (message, progress) => {
          const patch = { message };
          if (typeof progress === 'number' && !Number.isNaN(progress)) {
            patch.progress = Math.min(Math.max(Math.round(progress), 0), 100);
          }
          updateJob(jobId, patch);
        }
      });

      updateJob(jobId, {
        status: 'done',
        message: 'Ready to download',
        progress: 100,
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

app.get('/api/download/:jobId', async (request, response) => {
  const job = jobs.get(request.params.jobId);

  if (!job) {
    response.status(404).json({ error: 'Job not found.' });
    return;
  }

  if (job.status !== 'done' || !job.outputPath) {
    response.status(409).json({ error: 'The upscaled file is not ready yet.' });
    return;
  }

  const sharpness = Math.min(Math.max(Number(request.query.sharpness || 0), 0), 100);

  // If no post-processing sharpness requested, serve direct file
  if (sharpness === 0) {
    response.download(job.outputPath, job.downloadName);
    return;
  }

  try {
    const jobDir = path.dirname(job.outputPath);
    const ext = path.extname(job.downloadName) || '.png';
    const base = path.basename(job.downloadName, ext);
    const sharpenedName = `${base}-sharp-${sharpness}${ext}`;
    const sharpenedPath = path.join(jobDir, sharpenedName);

    // If already generated and cached on disk, download directly
    if (fs.existsSync(sharpenedPath)) {
      response.download(sharpenedPath, sharpenedName);
      return;
    }

    const { ffmpegBin } = getProcessorConfig();
    const amount = (0.5 + (sharpness / 100) * 2.0).toFixed(2);
    const contrast = (1 + (sharpness / 100) * 0.12).toFixed(3);
    const brightness = ((sharpness / 100) * 0.02).toFixed(3);
    const filterComplex = `unsharp=5:5:${amount}:5:5:0.0,eq=contrast=${contrast}:brightness=${brightness}`;

    await run(ffmpegBin, [
      '-y',
      '-i', job.outputPath,
      '-vf', filterComplex,
      '-frames:v', '1',
      '-update', '1',
      sharpenedPath
    ]);

    response.download(sharpenedPath, sharpenedName);
  } catch (err) {
    console.error('Error generating sharpened output:', err);
    response.download(job.outputPath, job.downloadName);
  }
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
    progress: job.progress !== undefined ? job.progress : (job.status === 'done' ? 100 : 0),
    mediaType: job.mediaType,
    preset: job.preset,
    originalName: job.originalName,
    downloadName: job.downloadName,
    downloadUrl: job.downloadUrl,
    error: job.error
  };
}

function matchesSelectedMediaType(file) {
  const mimeType = file.mimetype || '';
  if (mimeType.startsWith('image/')) return true;

  const extension = path.extname(file.originalname || '').toLowerCase();
  const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);
  return imageExtensions.has(extension);
}

function readableError(error) {
  if (!error) return 'Unknown error.';
  return error.stderr || error.message || String(error);
}
