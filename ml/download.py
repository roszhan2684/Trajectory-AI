"""Download the public training corpus used by Trajectory's from-scratch models.

Dataset: cnamuangtoun/resume-job-description-fit (Hugging Face)
  - 6,241 train / 1,759 test resume <-> job-description pairs
  - label in {"No Fit", "Potential Fit", "Good Fit"}
No AI APIs are used anywhere in training or inference.
"""
import os
import subprocess

BASE = "https://huggingface.co/datasets/cnamuangtoun/resume-job-description-fit/resolve/main"
OUT = os.path.join(os.path.dirname(__file__), "data")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for split in ("train", "test"):
        dest = os.path.join(OUT, f"{split}.csv")
        if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000:
            print(f"✓ {split}.csv already present")
            continue
        print(f"↓ downloading {split}.csv …")
        # curl uses the system trust store (python.org builds often ship without CA certs)
        subprocess.run(["curl", "-sSL", "--fail", "-o", dest, f"{BASE}/{split}.csv"], check=True)
        print(f"✓ {split}.csv ({os.path.getsize(dest) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
