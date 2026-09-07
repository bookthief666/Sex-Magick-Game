#!/usr/bin/env python3
"""
Gallery transcoder - reads one image on stdin, writes WebP on stdout.

Split out of `fetch-gallery.mjs` because Node has no image codec of its own and
every npm alternative ships native binaries the M15 supply-chain audit would
then have to carry for the rest of the project's life. Pillow is a *dev-time*
tool here: nothing it produces is a runtime dependency, the game ships plain
`.webp` files and this script never runs in CI or in a browser.

Usage (bytes in, bytes out):
    gallery-transcode.py [MAX_DIM] [QUALITY] < input.jpg > output.webp
    gallery-transcode.py --probe        < image.webp        # "WIDTHxHEIGHT" only

Writes the final "WIDTHxHEIGHT" to stderr so the caller can record geometry
without decoding its own output a second time. `--probe` reports the geometry
of an already-encoded file without re-encoding it, which is how a resumed run
keeps full manifest entries for images it skipped.
"""

import io
import sys

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover - environment problem, not logic
    sys.exit(
        "Pillow is required for gallery transcoding.\n"
        "  pip install pillow        (or, in Termux: pkg install python && pip install pillow)"
    )

DEFAULT_MAX_DIM = 1600
DEFAULT_QUALITY = 82


def main():
    probe = len(sys.argv) > 1 and sys.argv[1] == "--probe"
    max_dim = int(sys.argv[1]) if len(sys.argv) > 1 and not probe else DEFAULT_MAX_DIM
    quality = int(sys.argv[2]) if len(sys.argv) > 2 and not probe else DEFAULT_QUALITY

    raw = sys.stdin.buffer.read()
    if not raw:
        sys.exit("no input bytes on stdin")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except Exception as error:  # noqa: BLE001 - the caller reports this per-image
        sys.exit(f"not a decodable image: {error}")

    if probe:
        sys.stdout.write(f"{image.size[0]}x{image.size[1]}\n")
        return

    # Drive serves EXIF-rotated JPEGs. The canvas draws the bitmap as-is and
    # knows nothing about EXIF, so bake the rotation in rather than shipping
    # images that render sideways in the game but upright in an image viewer.
    image = ImageOps.exif_transpose(image)

    # The game composites every one of these over a dark ground and never uses
    # transparency, so an alpha channel is pure weight in a file we are about
    # to commit permanently.
    if image.mode == "RGBA" or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        flattened = Image.new("RGB", rgba.size, (0, 0, 0))
        flattened.paste(rgba, mask=rgba.split()[-1])
        image = flattened
    elif image.mode != "RGB":
        image = image.convert("RGB")

    if max(image.size) > max_dim:
        image.thumbnail((max_dim, max_dim), Image.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=quality, method=6)

    sys.stdout.buffer.write(buffer.getvalue())
    sys.stderr.write(f"{image.size[0]}x{image.size[1]}\n")


if __name__ == "__main__":
    main()
