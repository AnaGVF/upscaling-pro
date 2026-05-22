# Upscaling Pro

A simple React + Express web app for local AI upscaling of images and videos. It uses free, open-source tooling: React/Vite for the frontend, Express/Multer for uploads, FFmpeg for media handling, and Real-ESRGAN NCNN Vulkan for the AI upscaling step.

## What It Does

- Upload an image or video.
- Choose Image or Video mode.
- Pick HD, 2K, or 4K output presets.
- Process media locally with Real-ESRGAN.
- Download the upscaled file when the job is ready.

Preset sizing preserves aspect ratio by fitting the longest edge to:

- HD: 1280 px
- 2K: 2560 px
- 4K: 3840 px

## Requirements

- Node.js 18 or newer
- Windows PowerShell for the one-command local tools installer
- A GPU driver with Vulkan support

Real-ESRGAN NCNN Vulkan is the easiest local backend because it ships native binaries and model files without needing a paid API.

## Setup

### Easy Windows Setup

Run this from the project folder:

```powershell
npm run setup:all
```

This installs npm packages, downloads portable copies of Real-ESRGAN NCNN Vulkan and FFmpeg into `tools/`, and writes local paths into `.env`.

If you previously installed the tools before this project had the local-model check, refresh them once:

```powershell
npm run setup:tools -- -Force
```

Then start the app:

```powershell
npm run dev
```

Open:

```text
http://localhost:5173
```

The generated folders look like this:

```text
tools/
  realesrgan-ncnn-vulkan/
    realesrgan-ncnn-vulkan.exe
    models/
  ffmpeg/
    bin/
      ffmpeg.exe
      ffprobe.exe
```

`tools/` is ignored by git because those downloads are large platform-specific binaries.

### Manual Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Install the local tools:

   ```powershell
   npm run setup:tools
   ```

   To redownload tools, run:

   ```powershell
   npm run setup:tools -- -Force
   ```

3. Or copy the environment example manually:

   ```bash
   cp .env.example .env
   ```

   PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

4. If you do not use `npm run setup:tools`, edit `.env` so it points to your Real-ESRGAN and FFmpeg files.

   Windows example:

   ```env
   REAL_ESRGAN_BIN=D:\Documents\Github\upscaling-pro\tools\realesrgan-ncnn-vulkan\realesrgan-ncnn-vulkan.exe
   REAL_ESRGAN_MODELS_DIR=D:\Documents\Github\upscaling-pro\tools\realesrgan-ncnn-vulkan\models
   FFMPEG_BIN=D:\Documents\Github\upscaling-pro\tools\ffmpeg\bin\ffmpeg.exe
   FFPROBE_BIN=D:\Documents\Github\upscaling-pro\tools\ffmpeg\bin\ffprobe.exe
   ```

5. Run the app:

   ```powershell
   npm run dev
   ```

6. Open the frontend:

   ```text
   http://localhost:5173
   ```

## Upload And Download Flow

1. Choose Image or Video.
2. Choose HD, 2K, or 4K.
3. Select a file.
4. Click Upscale.
5. Wait for the status to become Ready.
6. Click Download upscaled file.

The frontend posts files to `POST /api/upscale`. The backend creates an async job, processes the file, and exposes status at `GET /api/jobs/:jobId`. Completed jobs can be downloaded from `GET /api/download/:jobId`.

## Backend Processing

Images:

1. Real-ESRGAN upscales the uploaded image with `realesrgan-x4plus`.
2. FFmpeg resizes both the original and AI output to the selected preset.
3. The final image blends mostly high-quality original resize with a subtle AI detail layer, preserving a more natural photo look.
4. The backend returns a PNG download.

The default detail strength is intentionally gentle:

```env
AI_DETAIL_BLEND=0.30
```

Use `0.20` for very subtle refinement, `0.30` for natural detail, `0.50` for more sharpness, or `1.00` for the full Real-ESRGAN look.

Videos:

1. FFmpeg extracts frames from the upload.
2. Real-ESRGAN upscales the extracted frames.
3. FFmpeg blends the AI-refined frames back with a high-quality resize of the original video, preserving the original audio when present.
4. The backend returns an MP4 download with high-quality H.264 encoding.

## Production Build

```bash
npm run build
npm start
```

The Express server serves the built React app from `dist/`.

## Free And Open-Source Components

- React and Vite for the frontend
- Express, Multer, and CORS for the Node backend
- Real-ESRGAN / Real-ESRGAN NCNN Vulkan for AI upscaling
- FFmpeg / FFprobe for frame extraction, resizing, and video assembly

Check each tool's license before redistributing bundled binaries, especially FFmpeg builds, but no paid service is required to run this app locally.
