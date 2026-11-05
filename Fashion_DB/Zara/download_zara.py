#!/usr/bin/env python3
"""Download Zara model images into categorized folders."""

import os
import sys
import time
import urllib.request
import ssl
from concurrent.futures import ThreadPoolExecutor, as_completed

# Works from repo root or from within Zara folder
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = SCRIPT_DIR
TSV_FILE = os.path.join(SCRIPT_DIR, "zara_download_list.tsv")

ctx = ssl.create_default_context()

def download_one(url, folder, filename):
    dest_dir = os.path.join(BASE_DIR, folder)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, filename)
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return (True, folder, filename, "exists")
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
                "Referer": "https://www.zara.com/",
            })
            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                data = resp.read()
            if len(data) < 500:
                return (False, folder, filename, f"too small ({len(data)} bytes)")
            with open(dest, "wb") as f:
                f.write(data)
            return (True, folder, filename, None)
        except Exception as e:
            if attempt < 2:
                time.sleep(1 * (attempt + 1))
            else:
                return (False, folder, filename, str(e))
    return (False, folder, filename, "max retries")

def main():
    tasks = []
    with open(TSV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) >= 3:
                tasks.append((parts[0], parts[1], parts[2]))
    print(f"Total images to download: {len(tasks)}")
    folders = set(t[1] for t in tasks)
    for folder in folders:
        os.makedirs(os.path.join(BASE_DIR, folder), exist_ok=True)
    success = failed = skipped = 0
    errors = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(download_one, url, folder, fname): (url, folder, fname)
                   for url, folder, fname in tasks}
        for i, future in enumerate(as_completed(futures), 1):
            ok, folder, fname, err = future.result()
            if ok:
                if err == "exists": skipped += 1
                else: success += 1
            else:
                failed += 1
                errors.append((folder, fname, err))
            if i % 100 == 0 or i == len(tasks):
                print(f"[{i}/{len(tasks)}] OK={success} Skip={skipped} Fail={failed}")
    print(f"\nDone! Downloaded={success}, Existed={skipped}, Failed={failed}")
    if errors:
        print(f"\nFailed ({len(errors)}):")
        for f, n, e in errors[:20]:
            print(f"  {f}/{n}: {e}")
    print("\nFiles per category:")
    for folder in sorted(folders):
        path = os.path.join(BASE_DIR, folder)
        count = len([f for f in os.listdir(path) if f.endswith(".jpg")])
        print(f"  {folder}: {count}")

if __name__ == "__main__":
    main()
