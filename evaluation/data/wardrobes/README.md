# Wardrobe manifests

Each file in this directory is a JSON array of wardrobe manifest objects
conforming to `../schemas/wardrobe_manifest.json`. Example:

```json
[
  {
    "case_id": "wardrobe-01",
    "name": "complete-casual",
    "description": "Casual top/bottom/shoes with one outerwear option.",
    "venues": ["lecture", "casualDate"],
    "items": [
      {"filename": "valid/tee_blue.jpg", "expected_category": "top", "expected_color": "blue", "expected_style": "casual", "expected_formality": 35, "expected_gender": "unisex"},
      {"filename": "valid/jeans_blue.jpg", "expected_category": "bottom", "expected_color": "navy", "expected_style": "casual", "expected_formality": 40, "expected_gender": "unisex"},
      {"filename": "valid/sneakers_white.jpg", "expected_category": "shoes", "expected_color": "white", "expected_style": "sporty", "expected_formality": 30, "expected_gender": "unisex"}
    ]
  }
]
```

The `filename` values are relative to `../data/uploads/`. The
`expected_*` fields are used for upload-accuracy cross-checks only; the
recommendation step uses whatever tags the real VLM produced on upload.
