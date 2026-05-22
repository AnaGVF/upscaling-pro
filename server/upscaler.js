import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const PRESETS = {
  hd: { key: 'hd', label: 'HD', longEdge: 1280 },
  '2k': { key: '2k', label: '2K', longEdge: 2560 },
  '4k': { key: '4k', label: '4K', longEdge: 3840 }
};

const DEFAULT_AI_BLEND = 0.3;

export async function processMedia({
  inputPath,
  originalName,
  mediaType,
  presetKey,
  jobsDir,
  jobId,
  onProgress = () => {}
}) {
  const preset = PRESETS[presetKey];
  const jobDir = path.join(jobsDir, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  if (mediaType === 'image') {
    return processImage({ inputPath, originalName, preset, jobDir, onProgress });
  }

  return processVideo({ inputPath, originalName, preset, jobDir, onProgress });
}

async function processImage({ inputPath, originalName, preset, jobDir, onProgress }) {
  const { realEsrganBin, ffmpegBin, modelName, modelScale, modelPathArgs, modelsDir } = getProcessorConfig();
  const baseName = safeBaseName(originalName);
  const aiOutput = path.join(jobDir, 'ai-upscaled.png');
  const finalOutput = path.join(jobDir, `${baseName}-${preset.key}-upscaled.png`);

  onProgress('Running Real-ESRGAN');
  assertRealEsrganModel({ modelsDir, modelName });
  await run(realEsrganBin, [
    '-i',
    inputPath,
    '-o',
    aiOutput,
    '-n',
    modelName,
    ...modelPathArgs,
    '-s',
    modelScale,
    '-f',
    'png'
  ]);

  onProgress(`Blending natural detail for ${preset.label}`);
  await run(ffmpegBin, [
    '-y',
    '-i',
    inputPath,
    '-i',
    aiOutput,
    '-filter_complex',
    naturalBlendFilter(preset.longEdge, readAiBlend()),
    '-map',
    '[out]',
    '-frames:v',
    '1',
    finalOutput
  ]);

  return {
    outputPath: finalOutput,
    downloadName: `${baseName}-${preset.key}-upscaled.png`
  };
}

async function processVideo({ inputPath, originalName, preset, jobDir, onProgress }) {
  const { realEsrganBin, ffmpegBin, modelName, modelScale, modelPathArgs, modelsDir } = getProcessorConfig();
  const baseName = safeBaseName(originalName);
  const framesDir = path.join(jobDir, 'frames');
  const upscaledFramesDir = path.join(jobDir, 'upscaled-frames');
  const finalOutput = path.join(jobDir, `${baseName}-${preset.key}-upscaled.mp4`);
  const fps = await readFrameRate(inputPath);

  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(upscaledFramesDir, { recursive: true });

  onProgress('Extracting video frames');
  await run(ffmpegBin, [
    '-y',
    '-i',
    inputPath,
    '-vsync',
    '0',
    path.join(framesDir, 'frame_%08d.png')
  ]);

  onProgress('Running Real-ESRGAN on frames');
  assertRealEsrganModel({ modelsDir, modelName });
  await run(realEsrganBin, [
    '-i',
    framesDir,
    '-o',
    upscaledFramesDir,
    '-n',
    modelName,
    ...modelPathArgs,
    '-s',
    modelScale,
    '-f',
    'png'
  ]);

  onProgress(`Rebuilding natural ${preset.label} video`);
  await run(ffmpegBin, [
    '-y',
    '-framerate',
    fps,
    '-start_number',
    '1',
    '-i',
    path.join(upscaledFramesDir, 'frame_%08d.png'),
    '-i',
    inputPath,
    '-filter_complex',
    naturalVideoFilter(preset.longEdge, readAiBlend()),
    '-map',
    '[outv]',
    '-map',
    '1:a?',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '16',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-shortest',
    finalOutput
  ]);

  return {
    outputPath: finalOutput,
    downloadName: `${baseName}-${preset.key}-upscaled.mp4`
  };
}

async function readFrameRate(inputPath) {
  try {
    const { ffprobeBin } = getProcessorConfig();
    const { stdout } = await run(ffprobeBin, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=r_frame_rate',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath
    ]);

    const frameRate = stdout.trim();
    if (frameRate && frameRate !== '0/0') return frameRate;
  } catch {
    return '30';
  }

  return '30';
}

function getProcessorConfig() {
  const modelsDir = process.env.REAL_ESRGAN_MODELS_DIR;
  const localRealEsrganBin = path.join(
    process.cwd(),
    'tools',
    'realesrgan-ncnn-vulkan',
    process.platform === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan'
  );
  const localModelsDir = path.join(process.cwd(), 'tools', 'realesrgan-ncnn-vulkan', 'models');
  const localFfmpegBin = path.join(
    process.cwd(),
    'tools',
    'ffmpeg',
    'bin',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  );
  const localFfprobeBin = path.join(
    process.cwd(),
    'tools',
    'ffmpeg',
    'bin',
    process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  );

  const resolvedModelsDir = modelsDir || (fs.existsSync(localModelsDir) ? localModelsDir : '');
  const modelName = process.env.REAL_ESRGAN_MODEL || 'realesrgan-x4plus';

  return {
    realEsrganBin: process.env.REAL_ESRGAN_BIN || existingPathOrCommand(localRealEsrganBin, 'realesrgan-ncnn-vulkan'),
    ffmpegBin: process.env.FFMPEG_BIN || existingPathOrCommand(localFfmpegBin, 'ffmpeg'),
    ffprobeBin: process.env.FFPROBE_BIN || existingPathOrCommand(localFfprobeBin, 'ffprobe'),
    modelName,
    modelScale: process.env.REAL_ESRGAN_SCALE || '4',
    modelPathArgs: resolvedModelsDir ? ['-m', resolvedModelsDir] : [],
    modelsDir: resolvedModelsDir
  };
}

function existingPathOrCommand(localPath, command) {
  return fs.existsSync(localPath) ? localPath : command;
}

function assertRealEsrganModel({ modelsDir, modelName }) {
  if (!modelsDir) {
    throw new Error(
      'Real-ESRGAN models folder is not configured. Run "npm run setup:tools -- -Force" to install the local model files.'
    );
  }

  const paramPath = path.join(modelsDir, `${modelName}.param`);
  const binPath = path.join(modelsDir, `${modelName}.bin`);

  if (!fs.existsSync(paramPath) || !fs.existsSync(binPath)) {
    throw new Error(
      `Real-ESRGAN model files are missing for "${modelName}". Expected ${paramPath} and ${binPath}. Run "npm run setup:tools -- -Force" to reinstall the local tools.`
    );
  }
}

function scaleFilter(longEdge, label = '') {
  return `${label}scale='if(gte(iw,ih),${longEdge},-2)':'if(gte(iw,ih),-2,${longEdge})':flags=lanczos`;
}

function naturalBlendFilter(longEdge, aiBlend) {
  const originalBlend = roundBlend(1 - aiBlend);
  const refinedBlend = roundBlend(aiBlend);

  return [
    `${scaleFilter(longEdge, '[0:v]')},format=rgba[base]`,
    `${scaleFilter(longEdge, '[1:v]')},format=rgba[ai]`,
    `[base][ai]blend=all_expr='A*${originalBlend}+B*${refinedBlend}',format=rgb24[out]`
  ].join(';');
}

function naturalVideoFilter(longEdge, aiBlend) {
  const originalBlend = roundBlend(1 - aiBlend);
  const refinedBlend = roundBlend(aiBlend);

  return [
    `${scaleFilter(longEdge, '[1:v]')},format=rgba[base]`,
    `${scaleFilter(longEdge, '[0:v]')},format=rgba[ai]`,
    `[base][ai]blend=all_expr='A*${originalBlend}+B*${refinedBlend}',format=yuv420p[outv]`
  ].join(';');
}

function readAiBlend() {
  const value = Number(process.env.AI_DETAIL_BLEND || DEFAULT_AI_BLEND);
  if (!Number.isFinite(value)) return DEFAULT_AI_BLEND;
  return Math.min(Math.max(value, 0), 1);
}

function roundBlend(value) {
  return Number(value.toFixed(3));
}

function safeBaseName(fileName) {
  const parsed = path.parse(fileName || 'media');
  const clean = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return clean || 'media';
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(
        new Error(
          `Could not start "${command}". Check that it is installed and configured in .env. ${error.message}`
        )
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const output = stderr || stdout || 'No command output.';
      reject(new Error(`"${command}" exited with code ${code}.\n${output}`));
    });
  });
}
