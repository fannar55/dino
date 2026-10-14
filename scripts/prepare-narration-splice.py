"""Build a local listening candidate from explicitly reviewed PCM cut points.

No provider calls and no production writes. The recipe records both source hashes.
Only short cut edges are faded/crossfaded; the approved word is never stretched,
pitch shifted, denoised, or loudness normalized. Listen before installing a master.
Usage: python scripts/prepare-narration-splice.py <recipe.json>
Requires ffmpeg/ffprobe and numpy in the local authoring environment.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import wave

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RATE = 44100


def run(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout


def sha(data):
    return hashlib.sha256(data).hexdigest()


def owned(relative):
    result = (ROOT / relative).resolve()
    if not result.is_relative_to(ROOT):
        raise ValueError("Recipe path escaped project")
    return result


def decode(relative, expected):
    path = owned(relative)
    if sha(path.read_bytes()) != expected:
        raise ValueError(f"Source changed: {relative}")
    return np.frombuffer(run("ffmpeg", "-v", "error", "-i", str(path),
        "-ar", str(RATE), "-ac", "1", "-f", "s32le", "pipe:1"), dtype="<i4").copy()


def frame(seconds):
    return round(seconds * RATE)


def main():
    recipe_path = Path(sys.argv[1]).resolve()
    recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
    donor = decode(recipe["donor"]["file"], recipe["donor"]["sha256"])
    base = decode(recipe["base"]["file"], recipe["base"]["sha256"])
    ds, de = map(frame, recipe["donor"]["cutSeconds"])
    bs, be = map(frame, recipe["base"]["replaceSeconds"])
    cs, ce = map(frame, recipe["donor"]["protectedSeconds"])
    fade_ms = recipe.get("edgeFadeMs", 5)
    if not 1 <= fade_ms <= 10:
        raise ValueError("Boundary fade must stay between 1 and 10 ms")
    fade = frame(fade_ms / 1000)
    if not (0 <= ds < cs < ce < de <= len(donor) and 0 <= bs < be < len(base)):
        raise ValueError("Invalid source spans")
    if cs < ds + fade or ce > de - fade:
        raise ValueError("Fade would touch the approved word")
    prefix, insert, suffix = base[:bs].copy(), donor[ds:de].copy(), base[be:].copy()
    ramp = np.linspace(0, 1, fade)
    if recipe.get("join", "fade") == "crossfade":
        # Connected speech retains all preceding-word PCM up to the seam, and
        # blends its final tail only into the donor's quiet pre-onset margin.
        insert[:fade] = np.rint(base[bs:bs + fade] * ramp[::-1] + insert[:fade] * ramp).astype("<i4")
        insert[-fade:] = np.rint(insert[-fade:] * ramp[::-1] + base[be - fade:be] * ramp).astype("<i4")
    elif recipe.get("join", "fade") == "fade":
        prefix_fade = min(fade, len(prefix))
        if prefix_fade:
            prefix[-prefix_fade:] = np.rint(prefix[-prefix_fade:] * np.linspace(1, 0, prefix_fade)).astype("<i4")
        insert[:fade] = np.rint(insert[:fade] * ramp).astype("<i4")
        insert[-fade:] = np.rint(insert[-fade:] * ramp[::-1]).astype("<i4")
        suffix[:fade] = np.rint(suffix[:fade] * ramp).astype("<i4")
    else:
        raise ValueError("Unknown splice join")
    joined = np.concatenate([prefix, insert, suffix])
    name_offset = bs + cs - ds
    exact = np.array_equal(joined[name_offset:name_offset + ce - cs], donor[cs:ce])
    if not exact:
        raise AssertionError("Approved word samples changed")
    output = owned(recipe["output"])
    if not output.is_relative_to(ROOT / "qa"):
        raise ValueError("Candidates must stay in qa until reviewed")
    output.parent.mkdir(parents=True, exist_ok=True)
    wav_path, mp3_path = output.with_suffix(".wav"), output.with_suffix(".mp3")
    with wave.open(str(wav_path), "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(4)
        file.setframerate(RATE)
        file.writeframes(joined.astype("<i4").tobytes())
    run("ffmpeg", "-v", "error", "-y", "-i", str(wav_path), "-codec:a", "libmp3lame",
        "-b:a", "192k", "-map_metadata", "-1", str(mp3_path))
    run("ffmpeg", "-v", "error", "-i", str(mp3_path), "-f", "null", "-")
    duration = float(run("ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(mp3_path)))
    report = {"recipe": str(recipe_path.relative_to(ROOT)), "candidate": str(mp3_path.relative_to(ROOT)),
        "sha256": sha(mp3_path.read_bytes()), "duration": duration, "sampleRate": RATE,
        "donorCutFrames": [ds, de], "baseReplaceFrames": [bs, be],
        "protectedDonorFrames": [cs, ce], "protectedOutputFrames": [name_offset, name_offset + ce - cs],
        "approvedWordPcmIdentical": exact, "protectedPcmSha256": sha(donor[cs:ce].tobytes()),
        "durationDeltaSeconds": (len(joined) - len(base)) / RATE,
        "pitchChange": False, "timeStretch": False, "gainChangeToWord": False,
        "edgeFadeMs": fade_ms, "join": recipe.get("join", "fade"),
        "encoding": "MP3 192kbps mono; lossy encoding follows exact PCM verification",
        "humanReviewed": False, "installed": False}
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
