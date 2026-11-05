# COMP1945 AI Project - USTyle

**Group #18** | AI Outfit Assistant for HKUST Students

## Fashion Database

Reference images of model photos from fashion retailers, categorized by style. Used for outfit recommendation model training.

### Brands

| Brand | Images | Method |
|-------|--------|--------|
| Uniqlo | ~264 | Direct images (committed) |
| Zara | ~2,188 | URL manifest + download script |

### Setup

**Uniqlo images** are committed directly - available after cloning.

**Zara images** need to be downloaded (too many to commit):

```bash
cd Fashion_DB/Zara
python3 download_zara.py
```

This downloads all 2,188 model photos into categorized subfolders using 8 concurrent threads. Takes ~5 minutes.

### Categories

- `Casual` - T-shirts, hoodies, sweaters, polos
- `Business_Smart` - Shirts, blazers
- `Outerwear` - Coats, jackets, parkas
- `Bottoms` - Pants, jeans, shorts, skirts
- `Formal_Dress` - Dresses, jumpsuits
- `Athletic_Sport` - Sportswear, activewear
- `Loungewear` - Loungewear, sleepwear

### Image Sources

- **Zara US** (zara.com/us) - diverse Western models
- **Zara HK** (zara.com/hk) - Asian models
- **Uniqlo US** (uniqlo.com/us) - mixed model diversity
