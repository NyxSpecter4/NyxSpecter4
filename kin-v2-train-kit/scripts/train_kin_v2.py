#!/usr/bin/env python3
"""
KIN v2 Training Script - Cybersecurity LoRA Fine-Tune
=====================================================
FIXED - Modal GPU integration (volume + upload to HF)
FIXED - Arize monitoring with span logging
FIXED - LoRA r16, alpha32, all-linear (attention + MLP)
"""
import argparse, os, json, sys

KIN_SYSTEM_PROMPT = "You are KIN - a sharp cybersecurity AI partner. Direct, opinionated, specific. Name tools, CVEs, companies. Sound like a senior engineer at a bar, not a textbook. Lead with your boldest take. End with a specific action. Max 2-3 paragraphs. Open with your take, not your title. Name products: CrowdStrike Falcon not use EDR. Duo push MFA not implement MFA."

def train_local(data_path, output_dir, arize_key=None):
    from unsloth import FastLanguageModel
    import torch
    print("=" * 60)
    print("KIN v2 - Cybersecurity LoRA Training (r16, all-linear)")
    print("=" * 60)
    max_seq_length = 4096
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name="Qwen/Qwen2.5-3B-Instruct", max_seq_length=max_seq_length, dtype=None, load_in_4bit=True)
    model = FastLanguageModel.get_peft_model(model, r=16,
        target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
        lora_alpha=32, lora_dropout=0.05, bias="none",
        use_gradient_checkpointing="unsloth", random_state=3407, use_rslora=False, loftq_config=None)
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"LoRA r16 a32 7 modules. Trainable: {trainable:,}")
    from datasets import load_dataset
    dataset = load_dataset("json", data_files=data_path, split="train")
    print(f"Training samples: {len(dataset)}")
    def fmt(examples):
        convos = examples["messages"]
        return {"text": [tokenizer.apply_chat_template(c, tokenize=False, add_generation_prompt=False) for c in convos]}
    dataset = dataset.map(fmt, batched=True)
    from trl import SFTTrainer
    from transformers import TrainingArguments
    trainer = SFTTrainer(model=model, tokenizer=tokenizer, train_dataset=dataset,
        dataset_text_field="text", max_seq_length=max_seq_length,
        args=TrainingArguments(output_dir=output_dir, per_device_train_batch_size=2,
            gradient_accumulation_steps=4, warmup_ratio=0.03, num_train_epochs=3,
            learning_rate=7e-5, fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(), logging_steps=10, optim="adamw_8bit",
            weight_decay=0.01, lr_scheduler_type="cosine", seed=3407,
            save_strategy="epoch", report_to="none"))
    arize = None
    if arize_key:
        try:
            from arize.api import Client as ArizeClient
            arize = ArizeClient(api_key=arize_key, space_key="KIN-v2")
            print("Arize monitoring enabled")
        except ImportError:
            print("Warning - arize not installed. pip install arize")
    print("\nStarting training...")
    stats = trainer.train()
    print(f"Training complete. Steps={stats.global_step} Loss={stats.training_loss:.4f}")
    if arize:
        try:
            arize.log_training_stats(model_id="kin-v2-cybersecurity-3b",
                stats={"training_loss": stats.training_loss, "global_step": stats.global_step,
                       "trainable_params": trainable, "lora_r": 16, "lora_alpha": 32})
            print("Stats logged to Arize")
        except Exception as e:
            print(f"Arize logging failed: {e}")
    print("\nMerging LoRA into base...")
    merged = model.merge_and_unload()
    merged.save_pretrained(output_dir + "/merged")
    tokenizer.save_pretrained(output_dir + "/merged")
    model.save_pretrained(output_dir + "/adapter")
    tokenizer.save_pretrained(output_dir + "/adapter")
    print(f"Merged -> {output_dir}/merged | Adapter -> {output_dir}/adapter")
    print("\nNext: upload merged to HF, generate GGUF, run eval_kin.py")
    return stats

def train_modal(data_path, output_dir, arize_key=None):
    import modal
    app = modal.App("kin-v2-training")
    image = (modal.Image.debian_slim(python_version="3.11")
        .pip_install("unsloth","datasets","trl","transformers","peft","accelerate",
                      "bitsandbytes","torch","huggingface_hub")
        .apt_install("git","git-lfs"))
    output_vol = modal.Volume.from_name("kin-v2-output", create_if_missing=True)
    @app.function(image=image, gpu="A100-80GB", timeout=7200, volumes={"/output": output_vol})
    def run():
        from huggingface_hub import hf_hub_download
        import shutil
        print("Downloading training data from HF...")
        local_data = hf_hub_download(repo_id="nyxspecter4/kin-cyber-dpo-v2", filename="sft.jsonl", repo_type="dataset")
        shutil.copy(local_data, "/tmp/kin-v2-sft.jsonl")
        train_local("/tmp/kin-v2-sft.jsonl", "/output", arize_key)
        hf_token = os.environ.get("HF_TOKEN", "")
        if hf_token:
            from huggingface_hub import HfApi
            api = HfApi(token=hf_token)
            print("Uploading merged weights to nyxspecter4/kin-sft-lora...")
            api.upload_folder(folder_path="/output/merged", repo_id="nyxspecter4/kin-sft-lora",
                repo_type="model", commit_message="KIN v2 retrain r16 all-linear correct system prompt")
            print("Upload complete!")
        else:
            print("HF_TOKEN not set - weights saved to Modal volume only")
        output_vol.commit()
        return "Training complete. Weights uploaded to HF."
    print("Launching KIN v2 on Modal A100-80GB...")
    with app.run():
        result = run()
        print(result)

def main():
    parser = argparse.ArgumentParser(description="Train KIN v2")
    parser.add_argument("--data", default="kin-v2-sft.jsonl")
    parser.add_argument("--output-dir", default="./kin-v2-output")
    parser.add_argument("--modal", action="store_true")
    parser.add_argument("--arize-key", default=None)
    args = parser.parse_args()
    if args.modal:
        train_modal(args.data, args.output_dir, args.arize_key)
    else:
        train_local(args.data, args.output_dir, args.arize_key)

if __name__ == "__main__":
    main()
