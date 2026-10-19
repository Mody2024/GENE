"""Run inference from a Gene checkpoint trained from random initialization.

This is a language-model research harness. It does not itself build or validate games.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import torch

from train import TinyGeneGPT


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--max-new-tokens", type=int, default=300)
    parser.add_argument("--temperature", type=float, default=0.8)
    parser.add_argument("--top-k", type=int, default=40)
    args = parser.parse_args()
    if args.max_new_tokens < 1 or args.max_new_tokens > 4096:
        parser.error("max-new-tokens must be between 1 and 4096")
    if args.temperature <= 0:
        parser.error("temperature must be positive")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    checkpoint = torch.load(Path(args.checkpoint), map_location=device, weights_only=False)
    config = checkpoint["config"]
    model = TinyGeneGPT(
        vocab_size=int(config["vocab_size"]),
        width=int(config["width"]),
        layers=int(config["layers"]),
        heads=int(config["heads"]),
        context=int(config["context"]),
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    generated = [256, *args.prompt.encode("utf-8")]
    with torch.no_grad():
        for _ in range(args.max_new_tokens):
            context = generated[-int(config["context"]):]
            tokens = torch.tensor(context, dtype=torch.long, device=device).unsqueeze(0)
            logits = model(tokens)[0, -1] / args.temperature
            top_k = min(max(1, args.top_k), logits.numel())
            values, indices = torch.topk(logits, top_k)
            probabilities = torch.softmax(values, dim=-1)
            token = int(indices[torch.multinomial(probabilities, 1)].item())
            if token == 257:
                break
            if token < 256:
                generated.append(token)
    output = bytes(token for token in generated if 0 <= token < 256).decode("utf-8", errors="replace")
    print(output)


if __name__ == "__main__":
    main()
