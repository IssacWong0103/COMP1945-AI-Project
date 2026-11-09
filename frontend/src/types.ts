export type Venue =
  | 'lecture'
  | 'careerFair'
  | 'casualDate'
  | 'hallGathering'
  | 'formal'

export type Gender = 'male' | 'female' | 'nonBinary' | 'preferNot'

export type ItemGender = 'male' | 'female' | 'unisex'

export type SkinTone = 'fair' | 'light' | 'medium' | 'tan' | 'deep' | (string & {})

export type PreferredStyle =
  | 'casual'
  | 'smartCasual'
  | 'streetwear'
  | 'sporty'
  | 'minimal'
  | 'formal'
  | (string & {})

export type Category =
  | 'top'
  | 'bottom'
  | 'outerwear'
  | 'dress'
  | 'shoes'
  | 'accessory'

export type WardrobeItem = {
  id: string
  imageUrl: string
  category: string
  color: string
  cut: string
  style: string
  description: string
  itemGender: string
  createdAt: string
}

export type Profile = {
  bodyPhotoUrl: string | null
  heightCm: number | null
  weightKg: number | null
  gender: string | null
  skinTone: string | null
  preferredStyle: string | null
}

export type OutfitItemRef = {
  id: string
  category: string
  color: string
  description: string
  imageUrl: string
}

export type SearchMode = 'textThenPhotos' | 'simpleFallback'

export type TryOnResultKind = 'generated' | 'collage'

export type TryOnFallbackReason =
  | 'local_images_not_public'
  | 'provider_error'
  | 'timeout'
  | 'missing_key'
  | 'missing_inputs'

/**
 * Catalog shape from the UX contract. The API on this branch still sends a
 * string (wording or id) and omits the field entirely in simpleFallback.
 */
export type StyleReference = {
  id: string
  imageUrl: string
  label?: string
  reason?: string
}

export type Outfit = {
  id: string
  items: OutfitItemRef[]
  venueFitScore: number
  cohesionScore: number
  overallScore: number
  rationale: string
  tryOnUrl: string | null
  /**
   * Branch contract: optional wording or id. A later catalog may send
   * StyleReference. Omitted until that catalog is wired — do not invent one.
   */
  styleReference?: string | StyleReference
  /** Client-only. Set from the last try-on so a collage is not shown as generated. */
  tryOnResultKind?: TryOnResultKind | null
  tryOnFallbackReason?: TryOnFallbackReason | null
  tryOnDetail?: string | null
  tryOnStyleReferenceUrl?: string | null
}

export type VenueInfo = {
  id: string
  label: string
  description: string
}

export type HealthResponse = {
  status: string
  service: string
}

export type RecommendRequest = {
  venue: string
  preferredStyle?: string
}

/** Optional run-status values if recommend later becomes a longer async run. */
export type StudioRunStatus =
  | 'queued'
  | 'running'
  | 'searchingText'
  | 'reviewingPhotos'
  | 'buildingOutfits'
  | 'partial'
  | 'completed'
  | 'failed'

export type RecommendResponse = {
  outfits: Outfit[]
  elapsedMs: number
  warning?: string | null
  searchMode?: SearchMode
  /** Not sent by the current recommend endpoint. Read if a run poll adds it. */
  runStatus?: StudioRunStatus
}

export type SavedLook = {
  id: string
  venue: string
  overallScore: number
  createdAt: string
  thumbnailUrl: string | null
}

export type TryOnRequest = {
  outfitId: string
  /** True only when the student asked to show a local preview instead. */
  acceptPreview?: boolean
}

export type TryOnResponse = {
  outfitId: string
  tryOnUrl: string | null
  status: 'ready' | 'processing' | 'failed'
  /** Required when status is ready and tryOnUrl is set. */
  resultKind?: TryOnResultKind | null
  fallbackReason?: TryOnFallbackReason | null
  styleReferenceUrl?: string | null
  /** Short drawer copy. On failure, distinguishes Retry from a local preview. */
  detail?: string | null
}

export type ApiErrorBody = {
  detail: string
}
