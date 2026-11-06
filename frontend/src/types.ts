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

export type Outfit = {
  id: string
  items: OutfitItemRef[]
  venueFitScore: number
  cohesionScore: number
  overallScore: number
  rationale: string
  tryOnUrl: string | null
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
  warning?: string
}

export type TryOnResponse = {
  outfitId: string
  tryOnUrl: string | null
  status: 'ready' | 'processing' | string
}

export type ApiErrorBody = {
  detail: string
}
