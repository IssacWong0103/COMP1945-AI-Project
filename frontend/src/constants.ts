import type { VenueInfo } from './types'

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function isAllowedImage(file: File): boolean {
  if (IMAGE_TYPES.has(file.type)) return true
  return /\.(jpe?g|png|webp)$/i.test(file.name)
}

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'nonBinary', label: 'Non-binary' },
  { value: 'preferNot', label: 'Prefer not to say' },
] as const

export const SKIN_TONE_OPTIONS = [
  { value: 'fair', label: 'Fair' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'tan', label: 'Tan' },
  { value: 'deep', label: 'Deep' },
] as const

export const STYLE_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'smartCasual', label: 'Smart casual' },
  { value: 'streetwear', label: 'Streetwear' },
  { value: 'sporty', label: 'Sporty' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'formal', label: 'Formal' },
] as const

export const FALLBACK_VENUES: VenueInfo[] = [
  {
    id: 'lecture',
    label: 'Lecture',
    description: 'Everyday class — neat, comfortable, not overly dressy.',
  },
  {
    id: 'careerFair',
    label: 'Career fair',
    description: 'Networking booths — smart casual to interview-ready.',
  },
  {
    id: 'casualDate',
    label: 'Casual date',
    description: 'Put-together casual or streetwear.',
  },
  {
    id: 'hallGathering',
    label: 'Hall gathering',
    description: 'Casual, sporty, or streetwear for hall events.',
  },
  {
    id: 'formal',
    label: 'Formal',
    description: 'Ceremony, banquet, or formal dinner.',
  },
]

const LABELS: Record<string, string> = {
  lecture: 'Lecture',
  careerFair: 'Career fair',
  casualDate: 'Casual date',
  hallGathering: 'Hall gathering',
  formal: 'Formal',
  male: 'Male',
  female: 'Female',
  nonBinary: 'Non-binary',
  preferNot: 'Prefer not to say',
  unisex: 'Unisex',
  fair: 'Fair',
  light: 'Light',
  medium: 'Medium',
  tan: 'Tan',
  deep: 'Deep',
  casual: 'Casual',
  smartCasual: 'Smart casual',
  streetwear: 'Streetwear',
  sporty: 'Sporty',
  minimal: 'Minimal',
  top: 'Top',
  bottom: 'Bottom',
  outerwear: 'Outerwear',
  dress: 'Dress',
  shoes: 'Shoes',
  accessory: 'Accessory',
}

export function humanize(value: string | null | undefined): string {
  if (!value) return ''
  if (LABELS[value]) return LABELS[value]
  const spaced = value.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

