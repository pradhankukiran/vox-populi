<div align="center">

<img src="assets/banner.svg" alt="vox-populi" width="100%" />

<br />

**Personal text-to-speech webapp powered by [VoxCPM2](https://huggingface.co/openbmb/VoxCPM2).**
Voice design, controllable cloning, ultimate cloning — Next.js on Vercel, GPU on Modal.

<br />

[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge&logo=shadcnui&logoColor=white)](https://ui.shadcn.com)
[![Modal](https://img.shields.io/badge/Modal-7B61FF?style=for-the-badge)](https://modal.com)
[![Python 3.11](https://img.shields.io/badge/Python_3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Hugging Face](https://img.shields.io/badge/%F0%9F%A4%97_Hugging_Face-FFD21E?style=for-the-badge)](https://huggingface.co/openbmb/VoxCPM2)

[![Model on HF](https://huggingface.co/datasets/huggingface/badges/resolve/main/model-on-hf-md.svg)](https://huggingface.co/openbmb/VoxCPM2)

</div>

---

## Features

- **Voice Design** — describe a voice in plain language (`a young female, cheerful tone, normal pace`) and synthesize from text
- **Controllable Cloning** — clone a speaker from a reference clip and override style (`slightly faster, melancholy tone`)
- **Ultimate Cloning** — highest fidelity clone using reference audio **plus** its transcript
- **30 languages** auto-detected, no language tag required
- **48 kHz** studio-quality output via AudioVAE V2
- **Waveform player** with scrubbing, play/pause, and download
- **GPU warmup** dialog with live status badge (red → amber → green) — no surprise cold starts mid-flow
- **Voice presets** persisted in `localStorage`
- **Session history** with click-to-replay

## Model

Built on [`openbmb/VoxCPM2`](https://huggingface.co/openbmb/VoxCPM2):

| Property | Value |
|----------|-------|
| Parameters | 2B |
| Backbone | MiniCPM-4 |
| Architecture | Tokenizer-free, diffusion-autoregressive (LocEnc → TSLM → RALM → LocDiT) |
| Sample rate | 48 kHz |
| Languages | 30 (incl. Chinese dialects) |
| VRAM | ~8 GB |
| RTF (RTX 4090) | ~0.13 via [`nano-vllm-voxcpm`](https://github.com/a710128/nanovllm-voxcpm) |
| License | Apache-2.0 |

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, JetBrains Mono |
| Audio UI | [wavesurfer.js](https://wavesurfer.xyz) |
| Inference | [nano-vllm-voxcpm](https://github.com/a710128/nanovllm-voxcpm) 2.0.1, FastAPI |
| Runtime | [Modal](https://modal.com) — serverless GPU, scale-to-zero |
| GPU | NVIDIA L4 (24 GB) |
| Build | CUDA 12.4.1, PyTorch 2.5.1+cu124, flash-attn 2.7.4.post1 |
| Model storage | Baked into image at build time via `huggingface_hub` |

## Architecture

```
                                       ┌──────────────────────────────┐
                                       │   Modal (L4, scale-to-zero)  │
                                       │                              │
   Browser ──── fetch ─────────────────▶│   FastAPI ASGI               │
   Next.js / Vercel                     │   ├── GET  /health           │
                                        │   ├── POST /design           │
                                        │   ├── POST /clone-controllable
                                        │   └── POST /clone-ultimate   │
                                        │       │                      │
                                        │       ▼                      │
                                        │   nano-vllm-voxcpm           │
                                        │       │                      │
                                        │       ▼                      │
                                        │   VoxCPM2 (bf16)             │
                                        │   AudioVAE V2 → 48 kHz WAV   │
                                        └──────────────────────────────┘
```

## Getting started

### 1. Deploy the Modal backend

```bash
pip install modal
modal token new          # one-time auth
cd modal && modal deploy app.py
```

First deploy pulls the CUDA image, installs flash-attn, and snapshots the VoxCPM2 weights into the image — takes a few minutes. Subsequent deploys are quick.

Modal prints the deployment URL on success, e.g.:

```
https://<user>--vox-populi-voxpopuli-fastapi-app.modal.run
```

### 2. Configure & run the frontend

```bash
cd web
cp .env.example .env.local
# edit .env.local — set NEXT_PUBLIC_MODAL_URL to your Modal URL
npm install
npm run dev
```

Open <http://localhost:3000>.

## API reference

All endpoints return `audio/wav` on success. Errors return JSON `{detail}`.

| Endpoint | Body (multipart unless noted) | Notes |
|---|---|---|
| `GET /health` | — | Lightweight warmup trigger. First call after idle blocks ~60s while VoxCPM2 loads. |
| `POST /design` | `text`, `cfg_value?` *(2.0)*, `inference_timesteps?` *(10)* | Optional `(description)` prefix in `text` controls the generated voice. |
| `POST /clone-controllable` | `text`, `reference_audio` *(file)*, `cfg_value?`, `inference_timesteps?` | Optional `(style)` prefix in `text` for tone/pace overrides. |
| `POST /clone-ultimate` | `text`, `prompt_audio` *(file)*, `prompt_text`, `cfg_value?`, `inference_timesteps?` | `prompt_text` must be the exact transcript of `prompt_audio`. |

> **Note:** `inference_timesteps` is fixed at server boot in nano-vllm-voxcpm 2.0.1. The endpoint accepts it for forward-compat but per-request overrides are ignored.

## Repo layout

```
vox-populi/
├── modal/                  # Modal Python app
│   ├── app.py              # nano-vllm-voxcpm + FastAPI
│   ├── requirements.txt
│   └── .python-version
├── web/                    # Next.js frontend
│   ├── app/
│   │   ├── page.tsx        # 3 modes, warmup dialog, advanced params
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── icon.svg
│   ├── components/
│   │   ├── ui/             # shadcn/ui primitives
│   │   └── studio/
│   │       └── player-bar.tsx  # wavesurfer.js player
│   └── .env.example
└── assets/
    └── banner.svg
```

## Credits

- [OpenBMB / VoxCPM2](https://huggingface.co/openbmb/VoxCPM2) — the model
- [a710128 / nanovllm-voxcpm](https://github.com/a710128/nanovllm-voxcpm) — the inference engine
- [Modal](https://modal.com) — serverless GPU
- [shadcn/ui](https://ui.shadcn.com) — UI primitives
- [wavesurfer.js](https://wavesurfer.xyz) — waveform rendering

## License

This repo is MIT. VoxCPM2 weights are Apache-2.0 (commercial use OK) — see the [model card](https://huggingface.co/openbmb/VoxCPM2) for details.
