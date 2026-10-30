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
  mediaType = 'image',
  presetKey,
  model,
  blendStrength,
  jobsDir,
  jobId,
  onProgress = () => { }
}) {
  const preset = PRESETS[presetKey];
  const jobDir = path.join(jobsDir, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const customModel = typeof model === 'string' && model ? model : undefined;
  const customBlend = typeof blendStrength === 'number' && !Number.isNaN(blendStrength) ? Math.min(Math.max(blendStrength, 0), 1) : undefined;

  return processImage({ inputPath, originalName, preset, model: customModel, blendStrength: customBlend, jobDir, onProgress });
}

async function processImage({ inputPath, originalName, preset, model, blendStrength, jobDir, onProgress }) {
  const { realEsrganBin, ffmpegBin, modelName: defaultModelName, modelScale, modelPathArgs, modelsDir } = getProcessorConfig();
  const selectedModelName = model || defaultModelName;
  const blend = blendStrength !== undefined ? blendStrength : readAiBlend();
  const baseName = safeBaseName(originalName);
  const normalizedInput = path.join(jobDir, 'normalized-input.png');
  const aiOutput = path.join(jobDir, 'ai-upscaled.png');
  const finalOutput = path.join(jobDir, `${baseName}-${preset.key}-upscaled.png`);

  // Step 1: Normalize orientation and scale input to match target resolution
  onProgress('Preparing image geometry', 8);
  const targetLongEdge = preset.longEdge;
  const maxAiInputLongEdge = Math.round(targetLongEdge / Number(modelScale || 4));

  await run(ffmpegBin, [
    '-y',
    '-i',
    inputPath,
    '-vf',
    `scale='if(gt(max(iw,ih),${maxAiInputLongEdge}),if(gte(iw,ih),${maxAiInputLongEdge},-2),iw)':'if(gt(max(iw,ih),${maxAiInputLongEdge}),if(gte(iw,ih),-2,${maxAiInputLongEdge}),ih)':flags=lanczos`,
    '-compression_level',
    '1',
    '-frames:v',
    '1',
    '-update',
    '1',
    normalizedInput
  ]);

  // Step 2: Feed the normalized image to Real-ESRGAN with granular progressive feedback
  onProgress(`Running Real-ESRGAN (${selectedModelName})`, 15);
  assertRealEsrganModel({ modelsDir, modelName: selectedModelName });

  let simulatedProgress = 15;
  const progressTimer = setInterval(() => {
    if (simulatedProgress < 74) {
      simulatedProgress += simulatedProgress < 40 ? 5 : simulatedProgress < 60 ? 4 : 2;
      onProgress(`Vulkan AI Super-Resolution (${selectedModelName})`, simulatedProgress);
    }
  }, 350);

  try {
    await run(realEsrganBin, [
      '-i',
      normalizedInput,
      '-o',
      aiOutput,
      '-n',
      selectedModelName,
      ...modelPathArgs,
      '-s',
      modelScale,
      ...gpuArgs(),
      '-t',
      '400',
      '-j',
      '1:2:2',
      '-f',
      'png'
    ], (stderrChunk) => {
      // Parse Real-ESRGAN verbose progress if reported
      const match = stderrChunk.match(/(\d+(?:[.,]\d+)?)%/);
      if (match) {
        const rawPct = parseFloat(match[1].replace(',', '.'));
        const mapped = Math.round(15 + (rawPct / 100) * 59);
        if (mapped > simulatedProgress && mapped <= 74) {
          simulatedProgress = mapped;
          onProgress(`Vulkan AI Super-Resolution (${selectedModelName})`, simulatedProgress);
        }
      }
    });
  } finally {
    clearInterval(progressTimer);
  }

  // Step 3: Blend original and AI output
  onProgress(`Applying natural detail blend (${Math.round(blend * 100)}%)`, 78);
  await run(ffmpegBin, [
    '-y',
    '-i',
    normalizedInput,
    '-i',
    aiOutput,
    '-filter_complex',
    naturalBlendFilter(preset.longEdge, blend),
    '-map',
    '[out]',
    '-compression_level',
    '1',
    '-frames:v',
    '1',
    '-update',
    '1',
    finalOutput
  ]);

  onProgress('Finalizing high-res master', 95);
  onProgress('Ready for download', 100);

  return {
    outputPath: finalOutput,
    downloadName: `${baseName}-${preset.key}-upscaled.png`
  };
}

export function getProcessorConfig() {
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

  if (refinedBlend >= 0.99) {
    return `${scaleFilter(longEdge, '[1:v]')},format=rgb24[out]`;
  }

  return [
    `${scaleFilter(longEdge, '[0:v]')},format=rgba[base]`,
    `${scaleFilter(longEdge, '[1:v]')},format=rgba[ai]`,
    `[base][ai]blend=all_expr='A*${originalBlend}+B*${refinedBlend}',format=rgb24[out]`
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

// Dedicated GPU pinning (defaults to GPU 0: NVIDIA GeForce RTX 2060)
function gpuArgs() {
  const id = (process.env.REAL_ESRGAN_GPU_ID || '0').trim();
  return /^\d+$/.test(id) ? ['-g', id] : ['-g', '0'];
}

export function run(command, args, onStderrData = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (typeof onStderrData === 'function') {
        try {
          onStderrData(text);
        } catch {
          // Ignore
        }
      }
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
