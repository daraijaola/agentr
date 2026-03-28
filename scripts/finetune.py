"""
AGENTR Fine-Tune Script — Qwen2.5-Coder-3B with Unsloth

Run on GPU server:
  pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
  pip install --no-deps trl peft accelerate bitsandbytes
  python scripts/finetune.py

Upload your dataset first:
  scp dataset/agentr-dataset.jsonl user@server:~/agentr-dataset.jsonl
"""

import json
import os
from pathlib import Path

# ── CONFIG ────────────────────────────────────────────────────────────────────
BASE_MODEL    = "Qwen/Qwen2.5-Coder-3B-Instruct"
DATASET_FILE  = "agentr-dataset.jsonl"
OUTPUT_DIR    = "agentr-model"
GGUF_FILE     = "agentr-coder-q4.gguf"
MAX_SEQ_LEN   = 4096
EPOCHS        = 3
BATCH_SIZE    = 4
GRAD_ACCUM    = 4
LEARNING_RATE = 2e-4
LORA_RANK     = 16
LORA_ALPHA    = 32

# ── LOAD DATASET ──────────────────────────────────────────────────────────────
print(f"Loading dataset from {DATASET_FILE}...")
records = []
with open(DATASET_FILE, 'r') as f:
    for line in f:
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass

print(f"  Loaded {len(records)} records")

# Convert to text format for training
def format_record(record):
    """Convert ChatML messages to a single training string"""
    messages = record.get('messages', [])
    text = ""
    for msg in messages:
        role = msg['role']
        content = msg['content']
        if role == 'system':
            text += f"<|im_start|>system\n{content}<|im_end|>\n"
        elif role == 'user':
            text += f"<|im_start|>user\n{content}<|im_end|>\n"
        elif role == 'assistant':
            text += f"<|im_start|>assistant\n{content}<|im_end|>\n"
    return text

texts = [format_record(r) for r in records]
print(f"  Formatted {len(texts)} training examples")

# ── LOAD MODEL WITH UNSLOTH ───────────────────────────────────────────────────
print(f"\nLoading base model: {BASE_MODEL}")
from unsloth import FastLanguageModel
import torch

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=BASE_MODEL,
    max_seq_length=MAX_SEQ_LEN,
    dtype=None,           # auto-detect (bf16 on A100, fp16 elsewhere)
    load_in_4bit=True,    # QLoRA — halves VRAM requirement
)

# ── APPLY LORA ────────────────────────────────────────────────────────────────
print(f"Applying LoRA (rank={LORA_RANK}, alpha={LORA_ALPHA})...")
model = FastLanguageModel.get_peft_model(
    model,
    r=LORA_RANK,
    lora_alpha=LORA_ALPHA,
    lora_dropout=0.05,
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
)

# ── PREPARE DATASET ───────────────────────────────────────────────────────────
from datasets import Dataset

dataset = Dataset.from_dict({"text": texts})
print(f"  Dataset size: {len(dataset)} examples")

def tokenize(batch):
    return tokenizer(
        batch["text"],
        truncation=True,
        max_length=MAX_SEQ_LEN,
        padding=False,
    )

tokenized = dataset.map(tokenize, batched=True, remove_columns=["text"])

# ── TRAIN ─────────────────────────────────────────────────────────────────────
from trl import SFTTrainer
from transformers import TrainingArguments

print(f"\nStarting training: {EPOCHS} epochs, lr={LEARNING_RATE}")

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=tokenized,
    dataset_text_field="input_ids",   # already tokenized
    max_seq_length=MAX_SEQ_LEN,
    args=TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRAD_ACCUM,
        learning_rate=LEARNING_RATE,
        warmup_steps=20,
        logging_steps=10,
        save_steps=100,
        save_total_limit=2,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=42,
        report_to="none",
    ),
)

trainer.train()
print("\n✅ Training complete!")

# ── SAVE LORA WEIGHTS ─────────────────────────────────────────────────────────
print(f"Saving LoRA adapter to {OUTPUT_DIR}/lora...")
model.save_pretrained(f"{OUTPUT_DIR}/lora")
tokenizer.save_pretrained(f"{OUTPUT_DIR}/lora")

# ── EXPORT TO GGUF (for llama.cpp deployment) ─────────────────────────────────
print(f"Exporting to GGUF (q4_k_m quantization) → {GGUF_FILE}")
model.save_pretrained_gguf(
    GGUF_FILE.replace(".gguf", ""),
    tokenizer,
    quantization_method="q4_k_m",
)

print(f"""
╔══════════════════════════════════════════════════════╗
║              Fine-Tuning Complete!                   ║
╚══════════════════════════════════════════════════════╝

  LoRA weights:  {OUTPUT_DIR}/lora/
  GGUF model:    {GGUF_FILE}

  To deploy with llama.cpp:
    ./llama-server -m {GGUF_FILE} --port 8080 --ctx-size 4096 --n-gpu-layers 99

  To use as OpenAI-compatible API:
    curl http://localhost:8080/v1/chat/completions \\
      -H "Content-Type: application/json" \\
      -d '{{"model":"agentr","messages":[{{"role":"user","content":"Write a GramJS script"}}]}}'

  Add to AGENTR .env:
    AGENTR_MODEL_URL=http://localhost:8080/v1
    AGENTR_MODEL_KEY=local
""")
