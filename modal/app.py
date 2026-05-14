"""Modal backend for vox-populi: VoxCPM2 text-to-speech.

Loads `openbmb/VoxCPM2` via the `nano-vllm-voxcpm` inference engine and
exposes a small FastAPI app with three TTS endpoints plus a health check.
WAV bytes are returned directly in the response body (no S3, no streaming).
"""

from __future__ import annotations

import modal

# --------------------------------------------------------------------------- #
# Modal app + image                                                            #
# --------------------------------------------------------------------------- #

app = modal.App("vox-populi")

MODEL_REPO = "openbmb/VoxCPM2"
MODEL_DIR = "/models/voxcpm2"


def _download_model() -> None:
    """Snapshot the VoxCPM2 weights into the image at build time."""
    from huggingface_hub import snapshot_download

    snapshot_download(
        repo_id=MODEL_REPO,
        local_dir=MODEL_DIR,
        # Pull everything; VoxCPM2 needs config.json + audiovae.pth + *.safetensors.
    )


# nano-vllm-voxcpm needs flash-attn (Triton + FlashAttention CUDA stack), so we
# build on top of a CUDA "devel" base image rather than debian_slim. Modal's
# host driver supports CUDA 12.x; 12.8.1 is the documented sweet spot.
CUDA_TAG = "12.8.1-devel-ubuntu24.04"

image = (
    modal.Image.from_registry(f"nvidia/cuda:{CUDA_TAG}", add_python="3.11")
    .entrypoint([])
    .apt_install("ffmpeg", "git", "libsndfile1")
    # torch first so flash-attn can find it during its build step.
    .pip_install(
        "torch>=2.5.0,!=2.6.*",
        "numpy>=1.26",
    )
    # flash-attn must be built without build isolation so it sees the installed torch.
    .pip_install(
        "flash-attn",
        extra_options="--no-build-isolation",
    )
    .pip_install(
        "nano-vllm-voxcpm==2.0.1",
        "huggingface_hub>=0.24.0",
        "soundfile>=0.13.1",
        "fastapi[standard]>=0.115",
        "python-multipart>=0.0.9",
    )
    .run_function(_download_model, timeout=60 * 60)
)


# --------------------------------------------------------------------------- #
# VoxCPM2 server class                                                         #
# --------------------------------------------------------------------------- #


@app.cls(
    image=image,
    gpu="L4",
    timeout=600,
    scaledown_window=300,
)
@modal.concurrent(max_inputs=4)
class VoxPopuli:
    # Baked-in default for the diffusion decoder. nano-vllm-voxcpm fixes this
    # at construction time (model_config.inference_timesteps), so per-request
    # overrides aren't honored without restarting the worker. We accept the
    # param in the API for forward-compat and silently ignore differences.
    DEFAULT_INFERENCE_TIMESTEPS = 10

    @modal.enter()
    async def load(self) -> None:
        """Boot the nano-vllm-voxcpm server pool inside an event loop.

        `VoxCPM.from_pretrained` inspects the running loop and returns an
        `AsyncVoxCPM2ServerPool` when one is present, which is what we want
        for serving from FastAPI.
        """
        from nanovllm_voxcpm import VoxCPM

        self.model = VoxCPM.from_pretrained(
            model=MODEL_DIR,
            devices=[0],
            inference_timesteps=self.DEFAULT_INFERENCE_TIMESTEPS,
            max_num_batched_tokens=8192,
            max_num_seqs=16,
            gpu_memory_utilization=0.9,
        )
        await self.model.wait_for_ready()

        info = await self.model.get_model_info()
        # VoxCPM2 emits 48 kHz studio audio via AudioVAE v2.
        self.output_sample_rate = int(info["output_sample_rate"])

    @modal.exit()
    async def shutdown(self) -> None:
        try:
            await self.model.stop()
        except Exception:
            pass

    # ----- internal helpers ------------------------------------------------ #

    async def _synthesize(
        self,
        target_text: str,
        cfg_value: float,
        prompt_latents: bytes | None = None,
        prompt_text: str = "",
        ref_audio_latents: bytes | None = None,
    ) -> bytes:
        """Run one generation and return 16-bit PCM WAV bytes."""
        import io

        import numpy as np
        import soundfile as sf

        chunks: list[np.ndarray] = []
        async for chunk in self.model.generate(
            target_text=target_text,
            prompt_latents=prompt_latents,
            prompt_text=prompt_text,
            ref_audio_latents=ref_audio_latents,
            cfg_value=float(cfg_value),
        ):
            chunks.append(chunk)

        if not chunks:
            raise RuntimeError("VoxCPM2 returned no audio chunks")

        wav = np.concatenate(chunks, axis=0).astype(np.float32, copy=False)

        buf = io.BytesIO()
        sf.write(
            buf,
            wav,
            self.output_sample_rate,
            format="WAV",
            subtype="PCM_16",
        )
        buf.seek(0)
        return buf.read()

    # ----- FastAPI app ----------------------------------------------------- #

    @modal.asgi_app()
    def fastapi_app(self):
        from fastapi import FastAPI, File, Form, HTTPException, UploadFile
        from fastapi.middleware.cors import CORSMiddleware
        from fastapi.responses import JSONResponse, Response

        api = FastAPI(title="vox-populi", docs_url="/docs", redoc_url=None)
        api.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Capture the bound instance so the route handlers can call back in.
        engine = self

        def _guess_audio_format(filename: str | None, content_type: str | None) -> str:
            """Best-effort audio format hint for librosa decoding."""
            if filename and "." in filename:
                ext = filename.rsplit(".", 1)[-1].lower()
                if ext:
                    return ext
            if content_type:
                # e.g. "audio/wav" -> "wav", "audio/x-wav" -> "x-wav"
                if "/" in content_type:
                    return content_type.split("/", 1)[1].lower()
            return "wav"

        @api.get("/health")
        async def health() -> JSONResponse:
            return JSONResponse({"status": "ok"})

        @api.post("/design")
        async def design(
            text: str = Form(...),
            cfg_value: float = Form(2.0),
            inference_timesteps: int = Form(10),  # noqa: ARG001 - see class docstring
        ) -> Response:
            """Generate from text, optionally prefixed with `(description) ...`."""
            if not text.strip():
                raise HTTPException(status_code=400, detail="text must be non-empty")
            try:
                wav_bytes = await engine._synthesize(
                    target_text=text,
                    cfg_value=cfg_value,
                )
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(status_code=500, detail=str(exc)) from exc
            return Response(content=wav_bytes, media_type="audio/wav")

        @api.post("/clone-controllable")
        async def clone_controllable(
            text: str = Form(...),
            reference_audio: UploadFile = File(...),
            cfg_value: float = Form(2.0),
            inference_timesteps: int = Form(10),  # noqa: ARG001
        ) -> Response:
            """Controllable cloning: condition on reference audio timbre only."""
            if not text.strip():
                raise HTTPException(status_code=400, detail="text must be non-empty")

            ref_bytes = await reference_audio.read()
            if not ref_bytes:
                raise HTTPException(status_code=400, detail="reference_audio is empty")
            ref_format = _guess_audio_format(
                reference_audio.filename, reference_audio.content_type
            )

            try:
                ref_latents = await engine.model.encode_latents(ref_bytes, ref_format)
                wav_bytes = await engine._synthesize(
                    target_text=text,
                    cfg_value=cfg_value,
                    ref_audio_latents=ref_latents,
                )
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(status_code=500, detail=str(exc)) from exc
            return Response(content=wav_bytes, media_type="audio/wav")

        @api.post("/clone-ultimate")
        async def clone_ultimate(
            text: str = Form(...),
            prompt_audio: UploadFile = File(...),
            prompt_text: str = Form(...),
            cfg_value: float = Form(2.0),
            inference_timesteps: int = Form(10),  # noqa: ARG001
        ) -> Response:
            """Ultimate cloning: use the same audio as decode prefix AND ref."""
            if not text.strip():
                raise HTTPException(status_code=400, detail="text must be non-empty")
            if not prompt_text.strip():
                raise HTTPException(
                    status_code=400, detail="prompt_text must be non-empty"
                )

            prompt_bytes = await prompt_audio.read()
            if not prompt_bytes:
                raise HTTPException(status_code=400, detail="prompt_audio is empty")
            prompt_format = _guess_audio_format(
                prompt_audio.filename, prompt_audio.content_type
            )

            try:
                latents = await engine.model.encode_latents(prompt_bytes, prompt_format)
                wav_bytes = await engine._synthesize(
                    target_text=text,
                    cfg_value=cfg_value,
                    prompt_latents=latents,
                    prompt_text=prompt_text,
                    ref_audio_latents=latents,
                )
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(status_code=500, detail=str(exc)) from exc
            return Response(content=wav_bytes, media_type="audio/wav")

        return api
