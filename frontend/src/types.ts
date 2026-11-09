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

export type Outfit = {
  id: string
  items: OutfitItemRef[]
  venueFitScore: number
  cohesionScore: number
  overallScore: number
  rationale: string
  tryOnUrl: string | null
  /** Wording or id for the chosen look. Omitted until a text catalog is wired. */
  styleReference?: string
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

export type RecommendResponse = {
  outfits: Outfit[]
  elapsedMs: number
  warning?: string | null
  searchMode?: SearchMode
}

export type SavedLook = {
  id: string
  venue: string
  overallScore: number
  createdAt: string
  thumbnailUrl: string | null
}

export type TryOnResultKind = 'generated' | 'collage'

export type TryOnFallbackReason =
  | 'local_images_not_public'
  | 'provider_error'
  | 'timeout'
  | 'missing_key'
  | 'missing_inputs'

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
