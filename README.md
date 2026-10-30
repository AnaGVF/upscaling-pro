# Upscaling Pro

<p align="center">
  <strong>A high-performance, local AI super-resolution studio for upscaling images to HD, 2K, and 4K resolutions with hardware-accelerated Real-ESRGAN, natural detail blending, and interactive post-processing clarity.</strong>
</p>

<p align="center">
  <a href="https://upscaling-pro.vercel.app/"><strong>Explore the Live Studio »</strong></a>
  &nbsp;•&nbsp;
  <a href="https://github.com/AnaGVF/upscaling-pro"><strong>GitHub Repository »</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Live%20on%20Vercel-black?style=for-the-badge&logo=vercel&logoColor=white" alt="Deployment Status" />
  <img src="https://img.shields.io/badge/AI%20Engine-Real--ESRGAN%20NCNN-FF6B6B?style=for-the-badge&logo=openai&logoColor=white" alt="Real-ESRGAN NCNN" />
  <img src="https://img.shields.io/badge/Acceleration-Vulkan%20GPU-red?style=for-the-badge&logo=vulkan&logoColor=white" alt="Vulkan GPU" />
  <img src="https://img.shields.io/badge/Pipeline-FFmpeg%20%2F%20FFprobe-007808?style=for-the-badge&logo=ffmpeg&logoColor=white" alt="FFmpeg" />
  <img src="https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19 + Vite" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js Express" />
  <img src="https://img.shields.io/badge/Presets-HD%20%7C%202K%20%7C%204K-8B5CF6?style=for-the-badge" alt="Output Presets" />
  <img src="https://img.shields.io/badge/Privacy-100%25%20Local%20%26%20Private-10B981?style=for-the-badge" alt="100% Local & Private" />
</p>

---

## 💡 Why Upscaling Pro?

Commercial AI upscaling tools and cloud enhancement APIs come with significant trade-offs:
- **Exorbitant costs & credit quotas**: Leading commercial upscalers enforce pricey subscriptions, strict monthly quotas, or pay-per-credit tokens.
- **Privacy & security compromises**: Cloud services require uploading personal photos, confidential graphics, or private images to remote third-party servers.
- **Waxy, plastic "AI artifacts"**: Standard raw upscaling models frequently over-smooth organic textures, wiping away film grain, skin pores, and natural sharpness in favor of an artificial, smudged look.
- **Complex "CUDA / PyTorch hell"**: Most open-source AI projects demand massive Python environments, matching CUDA toolkits, and hundreds of fragile pip packages that easily break on host machines.

**Upscaling Pro** delivers an elegant, powerful solution:
1. **100% Local & Unrestricted**: Runs completely on your own machine. Zero subscriptions, zero token meters, zero watermarks, and zero data leaving your computer.
2. **Hardware-Accelerated Vulkan Engine**: Utilizes native Real-ESRGAN NCNN Vulkan C++ binaries that tap directly into your GPU (NVIDIA, AMD Radeon, Intel Arc, or integrated graphics) without requiring PyTorch or CUDA.
3. **Proprietary Natural Detail Blending**: Integrates a two-phase Lanczos filter complex in FFmpeg that smoothly fuses high-frequency AI output with high-fidelity bicubic original scaling, preserving authentic textures while eliminating plastic artifacts.
4. **Post-Processing Clarity & Sharpness**: Interactive post-processing controls let you fine-tune edge contrast and micro-sharpness before downloading, baked directly into the master file.
5. **One-Command Automated Setup**: A single PowerShell command downloads portable binaries for Real-ESRGAN and FFmpeg, configures paths, and prepares your environment in seconds.

---

## 🚀 Key Features

### 🖼️ AI Image Super-Resolution
- **Real-ESRGAN x4plus Engine**: State-of-the-art deep learning super-resolution model tailored for real-world photo restoration and digital art sharpening.
- **Real-ESRGAN Anime**: Specialized neural model trained on 2D illustrations, manga, and graphic line art.
- **Aspect-Ratio Preserving Presets**:
  - **HD**: Longest edge scaled to `1280 px`
  - **2K**: Longest edge scaled to `2560 px`
  - **4K**: Longest edge scaled to `3840 px`
- **Lossless PNG Delivery**: Delivers crisp, uncompressed master files directly to your downloads folder.

### 🧪 Intelligent Natural Detail Blending
- **The "Uncanny Valley" Solution**: Raw AI upscaling often produces waxy skin tones and unnatural edge halos. Upscaling Pro solves this with configurable dual-layer composite blending:
  $$\text{Output} = \left(\text{Original}_{\text{Lanczos}} \times (1 - \alpha)\right) + \left(\text{AI}_{\text{Upscaled}} \times \alpha\right)$$
- **Tunable Blend Factor (`AI_DETAIL_BLEND`)**:
  - `0.20`: Very subtle, organic photographic refinement.
  - `0.30`: **Default golden ratio** — sharp, lifelike detail with authentic texture retention.
  - `0.50`: Elevated sharpness for digital graphics, line art, and illustrations.
  - `1.00`: Full raw Real-ESRGAN output.

### ⚡ NCNN Vulkan GPU Acceleration
- **No CUDA or Python Required**: Ships with standalone C++ binaries compiled against the cross-platform Vulkan API.
- **Universal Hardware Compatibility**: Accelerates on NVIDIA GeForce/RTX, AMD Radeon, Intel Arc, and modern integrated GPUs.
- **Low Memory Footprint**: Minimal RAM and VRAM overhead compared to heavy Python-based inference runners.

### 🎛️ Responsive Studio UI & Granular Progress Tracking
- **Modern Minimalist Interface**: Built with React 19 and custom dark-mode CSS designed to fit completely within a single screen without vertical scrolling.
- **Intelligent Downscaling Guard**: Automatically warns users in orange if the source image is already larger than the selected preset, offering a 1-click preset switch (`Switch to 2K/4K to Upscale →`) to prevent accidental downscaling.
- **Interactive Split Slider & Side-by-Side Comparison**: Visually inspect source versus upscaled output in real time.
- **Granular Progress Bar**: Live streaming percentage feedback as Vulkan AI inference processes tiles (smooth progression from 15% to 100%).
- **Export Clarity Adjustment & Canvas Baking**: Tune clarity from natural to ultra-sharp (+100%) and download the baked master image via client-side offscreen canvas rendering.

---

## 🏗️ How it Works Under the Hood

```text
       [ Upload Image via Studio UI ]
                     │
                     ▼
  [ Downscaling Guard & Geometry Analysis ]
    • FFprobe source resolution detection
    • Auto-preset suggestion & downscale warnings
                     │
                     ▼
  [ Step 1: Pre-Scale Geometry Optimization ]
    • FFmpeg pre-scales source to target / 4 (Lanczos)
    • Fast PNG compression (-compression_level 1)
                     │
                     ▼
  [ Step 2: Real-ESRGAN NCNN Vulkan Inference ]
    • Discrete GPU locked (REAL_ESRGAN_GPU_ID=0)
    • Safe VRAM tiling (-t 400, -j 1:2:2)
    • Real-time granular progress streaming (15% -> 100%)
                     │
                     ▼
  [ Step 3: Dual-Pass Natural Detail Blending ]
    • Fast path (100% AI): Direct Lanczos target scale
    • Natural blend (<100%): Lanczos original + AI composite blend
                     │
                     ▼
  [ Step 4: Interactive Clarity & Canvas Baking ]
    • Live split-slider & side-by-side inspection
    • Real-time post-processing clarity & micro-contrast slider
    • Client-side offscreen canvas baking on download
                     │
                     ▼
      [ Master Super-Resolution PNG Export ]
```

---

## 🖼️ How to Upscale Images Step-by-Step

Enhancing your photos and digital art takes just five straightforward steps:

1. **Select Target Resolution**:
   - Choose your desired output target: **HD** (1280px), **2K** (2560px), or **4K** (3840px). Aspect ratio is automatically preserved based on the longest dimension.
   - If your source image is already larger than the chosen preset, the intelligent **Downscaling Guard** alerts you with a 1-click button to upscale to a higher resolution.
2. **Choose AI Model & Detail Blend**:
   - Select **Real-ESRGAN x4+** (photographs, portraits, real-world) or **Real-ESRGAN Anime** (digital art, manga).
   - Adjust the **Natural Detail Blend** slider (20% for subtle organic texture, 30% for balanced realism, or 100% for full AI reconstruction).
3. **Upload Your Source Image**:
   - Drag and drop your image into the upload zone, or click to browse (supports JPG, PNG, WebP).
4. **Initiate Local AI Upscaling**:
   - Click **Enhance to [HD / 2K / 4K]**. The background engine executes Vulkan AI inference with safe VRAM tiling and rapid PNG encoding.
   - Monitor live progress in real time through the granular progress bar.
5. **Fine-Tune Clarity & Download Master**:
   - Adjust the **Post-Processing Clarity & Sharpness** slider to dial in desired edge crispness and micro-contrast.
   - Click **Download** to save your high-resolution master PNG with all clarity and sharpness adjustments baked in.

---

## 💻 Tech Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | **[React 19](https://react.dev/)** | Reactive user interface, canvas comparison, and real-time state management |
| **Build Tool & Bundler** | **[Vite 6](https://vite.dev/)** | Blazing-fast development server with reverse-proxy routing |
| **Backend Framework** | **[Node.js](https://nodejs.org/) & [Express 4](https://expressjs.com/)** | Asynchronous REST API, upload streaming, and worker process lifecycle (`node --watch`) |
| **File Handling** | **[Multer](https://github.com/expressjs/multer)** | Multipart form-data handling and isolated disk storage management |
| **AI Inference Engine** | **[Real-ESRGAN NCNN Vulkan](https://github.com/xinntao/Real-ESRGAN)** | Hardware-accelerated neural network inference for super-resolution |
| **Image Processing** | **[FFmpeg & FFprobe](https://ffmpeg.org/)** | Geometry probing, Lanczos pre-scaling, multi-stream composite blending, and fast PNG compression |
| **Canvas Baking** | **HTML5 Canvas API** | Client-side pixel-perfect convolution sharpening and contrast rendering on export |
| **Process Orchestration** | **[Concurrently](https://github.com/open-cli-tools/concurrently)** | Parallel management of API backend and Vite client dev environments |
| **Automation Scripting** | **PowerShell** | Zero-touch automated installation and tool configuration |

---

## 🛠️ Getting Started & Setup

### Prerequisites

- **Node.js**: `v18.0.0` or newer installed ([Download Node.js](https://nodejs.org/)).
- **Operating System**: Windows 10/11 (with PowerShell 5.1+).
- **Graphics Card**: Any GPU with Vulkan support (NVIDIA, AMD Radeon, Intel Arc, or modern integrated graphics).

---

### 🚀 Quick Start (Automated Windows Setup)

The fastest way to get up and running is using the built-in installer script:

```powershell
# 1. Clone the repository
git clone https://github.com/AnaGVF/upscaling-pro.git
cd upscaling-pro

# 2. Run one-command automated setup
npm run setup:all
```

#### What `npm run setup:all` does automatically:
1. Installs all Node.js project dependencies (`npm install`).
2. Downloads portable, pre-compiled binaries for **Real-ESRGAN NCNN Vulkan** (`v0.2.5.0`) and official **FFmpeg/FFprobe** builds into a localized `tools/` directory.
3. Downloads the required neural network weights (`realesrgan-x4plus.param` and `.bin`).
4. Generates your customized `.env` configuration file pointing directly to the local executables.

---

### 3. Launch the Studio

Start both the backend API server and frontend client with a single command:

```powershell
npm run dev
```

Open your browser and navigate to:
👉 **[http://localhost:5173](http://localhost:5173)**

---

### 🔧 Manual Setup & Maintenance

If you prefer to configure dependencies manually or need to force-update tools:

```powershell
# Re-download and refresh tools and model files
npm run setup:tools -- -Force

# Start individual services
npm run dev:api    # Starts Express backend on http://localhost:4000
npm run dev:web    # Starts Vite frontend on http://localhost:5173
```

To build and run in production mode:

```bash
npm run build
npm start
```
The Express production server will serve the optimized frontend bundle from `dist/` on port `4000`.

---

## 📁 Project Structure

```text
upscaling-pro/
├── client/                     # Frontend application source
│   ├── index.html              # HTML shell & typography metadata
│   └── src/
│       ├── main.jsx            # React root mount point
│       ├── App.jsx             # Main application layout, state & polling
│       └── styles.css          # Dark-mode studio styling & responsive grid
├── server/                     # Backend API & inference orchestration
│   ├── index.js                # Express REST server, Multer upload & job queue
│   └── upscaler.js             # Real-ESRGAN & FFmpeg pipeline execution engine
├── scripts/                    # Automation utilities
│   └── setup-tools.ps1         # Automated downloader & environment generator
├── storage/                    # Local scratchpad (Git-ignored)
│   ├── incoming/               # Uploaded source files
│   └── jobs/                   # Per-job isolated intermediate workspaces & outputs
├── tools/                      # Portable binaries (Git-ignored)
│   ├── realesrgan-ncnn-vulkan/ # Real-ESRGAN executable & model binaries
│   └── ffmpeg/bin/             # FFmpeg and FFprobe executables
├── .env.example                # Sample environment configuration
├── package.json                # Project dependencies & scripts
├── vite.config.js              # Vite server & reverse-proxy configuration
└── README.md                   # Project documentation
```

---

## ⚙️ Configuration & Fine-Tuning (`.env`)

You can customize inference models, detail blend ratios, upload thresholds, and network ports in your `.env` file:

```env
# Server Network Port
PORT=4000

# Executable Binary Locations
REAL_ESRGAN_BIN=tools\realesrgan-ncnn-vulkan\realesrgan-ncnn-vulkan.exe
REAL_ESRGAN_MODELS_DIR=tools\realesrgan-ncnn-vulkan\models
FFMPEG_BIN=tools\ffmpeg\bin\ffmpeg.exe
FFPROBE_BIN=tools\ffmpeg\bin\ffprobe.exe

# AI Model Configuration
REAL_ESRGAN_MODEL=realesrgan-x4plus
REAL_ESRGAN_SCALE=4

# GPU Device Selection (-1 = Auto/CPU, 0 = Primary Discrete GPU e.g. RTX 2060, 1 = Secondary GPU)
REAL_ESRGAN_GPU_ID=0

# Natural Detail Blend (0.0 to 1.0)
# 0.20 = Subtle photographic refinement
# 0.30 = Natural detail (Default balanced look)
# 0.50 = Sharper graphic / anime finish
# 1.00 = 100% Raw Real-ESRGAN model output
AI_DETAIL_BLEND=0.30

# Maximum Allowed Upload Size (in MB)
MAX_UPLOAD_MB=1024
```

---

## 🌐 Deployment

The web studio is deployed live at:  
👉 **[https://upscaling-pro.vercel.app/](https://upscaling-pro.vercel.app/)**

---

## 👩‍💻 Author & Credits

Created and maintained by:

**Ana Graciela Vassallo Fedotkin**  
- 🌐 **Live Website**: [https://upscaling-pro.vercel.app/](https://upscaling-pro.vercel.app/)  
- 🐙 **GitHub**: [@AnaGVF](https://github.com/AnaGVF)  
- 📁 **Repository**: [upscaling-pro](https://github.com/AnaGVF/upscaling-pro)

---

## 📄 License & Attribution

This project is open-source. Please review the licenses of the underlying third-party binaries before redistributing:

- **[Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN)**: BSD 3-Clause License © Xintao Wang, Applied Research Center, Tencent PCG.
- **[FFmpeg](https://ffmpeg.org/)**: Licensed under LGPL / GPL depending on enabled build flags.
- **[React](https://react.dev/)**: MIT License © Meta Platforms, Inc.
- **[Vite](https://vite.dev/)**: MIT License © VoidZero Inc. & Vite Contributors.
