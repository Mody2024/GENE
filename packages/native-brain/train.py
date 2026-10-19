"""Train a tiny decoder-only Transformer from random initialization.

This is a research prototype, not a frontier model. It uses a byte-level
vocabulary (0..255) plus BOS/EOS, so no pretrained tokenizer is downloaded.
Training data is UTF-8 text, one JSON object per line with a non-empty "text".
"""
from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F


class TinyGeneGPT(nn.Module):
    def __init__(self, vocab_size: int = 258, width: int = 128, layers: int = 4,
                 heads: int = 4, context: int = 512, dropout: float = 0.1):
        super().__init__()
        if width % heads:
            raise ValueError("width must be divisible by heads")
        self.context = context
        self.token = nn.Embedding(vocab_size, width)
        self.position = nn.Embedding(context, width)
        block = nn.TransformerEncoderLayer(
            d_model=width, nhead=heads, dim_feedforward=width * 4,
            dropout=dropout, activation="gelu", batch_first=True, norm_first=True
        )
        self.blocks = nn.TransformerEncoder(block, num_layers=layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(width)
        self.head = nn.Linear(width, vocab_size, bias=False)
        self.head.weight = self.token.weight
        self.apply(self._init_weights)

    @staticmethod
    def _init_weights(module):
        if isinstance(module, (nn.Linear, nn.Embedding)):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if isinstance(module, nn.Linear) and module.bias is not None:
                nn.init.zeros_(module.bias)

    def forward(self, tokens):
        batch, length = tokens.shape
        if length > self.context:
            raise ValueError(f"Sequence length {length} exceeds context {self.context}")
        positions = torch.arange(length, device=tokens.device)
        x = self.token(tokens) + self.position(positions)[None, :, :]
        mask = torch.triu(torch.ones(length, length, device=tokens.device, dtype=torch.bool), diagonal=1)
        x = self.blocks(x, mask=mask)
        return self.head(self.norm(x))


def load_text(path: Path) -> list[str]:
    samples = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: invalid JSONL: {exc}") from exc
        text = item.get("text") if isinstance(item, dict) else None
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"{path}:{line_number}: expected a non-empty 'text' field")
        samples.append(text)
    if not samples:
        raise ValueError(f"No training samples found in {path}")
    return samples


def encode(text: str) -> list[int]:
    return [256, *text.encode("utf-8"), 257]


def batches(samples, batch_size, context, device):
    pool = [encode(sample) for sample in samples]
    pool = [torch.tensor(seq, dtype=torch.long) for seq in pool if len(seq) >= 3]
    if not pool:
        raise ValueError("Training samples are too short")
    for _ in range(batch_size):
        sequence = random.choice(pool)
        if len(sequence) > context + 1:
            start = random.randrange(0, len(sequence) - context)
            sequence = sequence[start:start + context + 1]
        x = torch.zeros(context, dtype=torch.long)
        y = torch.full((context,), -100, dtype=torch.long)
        n = min(context + 1, len(sequence))
        x[:n - 1] = sequence[:n - 1]
        y[:n - 1] = sequence[1:n]
        yield x, y
    return


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="JSONL training file; no external model is downloaded")
    parser.add_argument("--out", default="artifacts/native-brain")
    parser.add_argument("--steps", type=int, default=1000)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--context", type=int, default=256)
    parser.add_argument("--width", type=int, default=128)
    parser.add_argument("--layers", type=int, default=4)
    parser.add_argument("--heads", type=int, default=4)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--seed", type=int, default=1337)
    args = parser.parse_args()
    if min(args.steps, args.batch_size, args.context, args.width, args.layers, args.heads) < 1:
        parser.error("steps, batch-size, context, width, layers, and heads must be positive")

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    texts = load_text(Path(args.data))
    model = TinyGeneGPT(width=args.width, layers=args.layers, heads=args.heads, context=args.context).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    model.train()
    iterator = iter(batches(texts, args.batch_size, args.context, device))
    for step in range(1, args.steps + 1):
        try:
            x, y = next(iterator)
        except StopIteration:
            iterator = iter(batches(texts, args.batch_size, args.context, device))
            x, y = next(iterator)
        x, y = x[None, :].to(device), y[None, :].to(device)
        logits = model(x)
        loss = F.cross_entropy(logits.reshape(-1, logits.size(-1)), y.reshape(-1), ignore_index=-100)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step == 1 or step % 50 == 0:
            print(json.dumps({"step": step, "loss": round(float(loss.detach().cpu()), 5), "device": device}))

    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    checkpoint = output / "gene-native-random-init.pt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "config": {"vocab_size": 258, "width": args.width, "layers": args.layers,
                   "heads": args.heads, "context": args.context},
        "trained_steps": args.steps,
        "training_samples": len(texts),
        "seed": args.seed,
        "initialized_from_pretrained_weights": False,
        "tokenizer": "utf8-byte-v1"
    }, checkpoint)
    print(json.dumps({"event": "checkpoint_saved", "path": str(checkpoint), "device": device,
                      "samples": len(texts), "steps": args.steps,
                      "warning": "A low loss on a small corpus does not prove useful game-building ability."}))


if __name__ == "__main__":
    main()
