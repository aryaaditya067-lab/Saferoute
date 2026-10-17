"""
Converts a NASA Black Marble yearly night-lights file (VNP46A4, ~500 m) into
data/nightlights.csv for the SafeRoute backend.

1. While logged in to NASA Earthdata in your browser, download ONE file for tile h25v07
   (covers Bengaluru) from:
       https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5200/VNP46A4/2024/001/
   The file name looks like  VNP46A4.A2024001.h25v07.002.<numbers>.h5
2. Put it in the saferoute-backend\\data folder (or leave it in Downloads).
3. From the saferoute-backend folder:
       py -m pip install h5py numpy
       py tools\\nightlights.py

You can also pass the file path:  py tools\\nightlights.py C:\\path\\to\\file.h5
"""

import re
import sys
from pathlib import Path

# Same box as saferoute.city.bbox in application.yml (south, west, north, east).
SOUTH, WEST, NORTH, EAST = 12.73, 77.37, 13.23, 77.88
TILE = "h25v07"
VARIABLE = "NearNadir_Composite_Snow_Free"
CELLS_PER_DEGREE = 240  # 15 arc-seconds
BACKEND = Path(__file__).resolve().parent.parent
OUT = BACKEND / "data" / "nightlights.csv"
ARCHIVE = "https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5200/VNP46A4/2024/001/"


def find_file() -> Path | None:
    if len(sys.argv) > 1:
        p = Path(sys.argv[1]).expanduser()
        return p if p.exists() else None
    places = [BACKEND / "data", BACKEND, Path.home() / "Downloads"]
    found = []
    for folder in places:
        if folder.exists():
            found += [p for p in folder.glob("VNP46A4*.h5") if TILE in p.name]
    if not found:
        return None
    return max(found, key=lambda p: p.name)  # newest year sorts last (A2024... > A2023...)


def find_dataset(h5):
    hit = []

    def visit(name, obj):
        if name.split("/")[-1] == VARIABLE and hasattr(obj, "shape"):
            hit.append(obj)

    h5.visititems(visit)
    return hit[0] if hit else None


def tile_origin(name: str) -> tuple[float, float]:
    m = re.search(r"h(\d\d)v(\d\d)", name)
    h, v = int(m.group(1)), int(m.group(2))
    return 90 - v * 10, -180 + h * 10  # top latitude, left longitude


def main() -> None:
    path = find_file()
    if path is None:
        sys.exit(
            "No VNP46A4 file for tile h25v07 found.\n"
            f"Download it in your browser (logged in to Earthdata) from:\n  {ARCHIVE}\n"
            "and put it in the saferoute-backend\\data folder or Downloads."
        )
    if path.stat().st_size < 1_000_000:
        sys.exit(f"{path.name} is too small. It is probably a login page, not the data. Download it again while logged in.")

    import h5py
    import numpy as np

    print(f"Reading {path.name} ...")
    with h5py.File(path, "r") as h5:
        ds = find_dataset(h5)
        if ds is None:
            sys.exit(f"{VARIABLE} not found in {path.name}. Is this a VNP46A4 file?")
        attrs = {k: (v[0] if hasattr(v, "__len__") and not isinstance(v, (str, bytes)) else v) for k, v in ds.attrs.items()}
        fill = attrs.get("_FillValue")
        scale = float(attrs.get("scale_factor", 1.0))
        offset = float(attrs.get("add_offset", 0.0))

        top, left = tile_origin(path.name)
        r0 = max(0, int((top - NORTH) * CELLS_PER_DEGREE))
        r1 = min(ds.shape[0], int((top - SOUTH) * CELLS_PER_DEGREE) + 1)
        c0 = max(0, int((WEST - left) * CELLS_PER_DEGREE))
        c1 = min(ds.shape[1], int((EAST - left) * CELLS_PER_DEGREE) + 1)
        raw = ds[r0:r1, c0:c1].astype("float64")

    valid = np.ones(raw.shape, dtype=bool) if fill is None else raw != float(fill)
    values = raw * scale + offset

    year = re.search(r"\.A(\d{4})", path.name)
    year = year.group(1) if year else "?"
    rows = 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        f.write(f"# source=NASA Black Marble VNP46A4 {VARIABLE} year={year} unit=nW/cm2/sr\n")
        f.write("lat,lng,radiance\n")
        for i in range(values.shape[0]):
            lat = top - (r0 + i + 0.5) / CELLS_PER_DEGREE
            for j in range(values.shape[1]):
                if not valid[i, j] or not np.isfinite(values[i, j]) or values[i, j] < 0:
                    continue
                lng = left + (c0 + j + 0.5) / CELLS_PER_DEGREE
                if SOUTH <= lat <= NORTH and WEST <= lng <= EAST:
                    f.write(f"{lat:.6f},{lng:.6f},{values[i, j]:.3f}\n")
                    rows += 1
    if rows == 0:
        sys.exit("No valid cells for Bengaluru in this file. Check that it is tile h25v07.")
    print(f"Wrote {rows} cells for {year} to {OUT}")
    print("Done. The backend uses it on the next route search (no restart needed).")


if __name__ == "__main__":
    main()
