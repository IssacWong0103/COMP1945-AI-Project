import type { VenueInfo, WardrobeItem } from './types'

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

export const CATEGORY_OPTIONS = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'outerwear', label: 'Outerwear' },
  { value: 'dress', label: 'Dress' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'accessory', label: 'Accessory' },
] as const

export const ITEM_GENDER_OPTIONS = [
  { value: 'unisex', label: 'Unisex' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const

export const CUT_SUGGESTIONS = [
  'Regular fit',
  'Slim tapered',
  'Relaxed fit',
  'Boxy',
  'Oversized',
  'Straight',
  'Cropped',
  'Tailored',
  'Low-top',
  'High-top',
] as const

export type FeedbackSuggestion = {
  label: string
  text: string
}

export const FEEDBACK_SUGGESTIONS: FeedbackSuggestion[] = [
  { label: 'Too formal', text: 'Too formal — make it more casual.' },
  { label: 'Too casual', text: 'Too casual — make it more dressed up.' },
  { label: 'Too warm', text: 'Too warm for the weather — lighter fabrics, no heavy layers.' },
  { label: 'Too cold', text: 'Not warm enough — add layers or outerwear.' },
  { label: 'More color', text: 'Too plain — add more color.' },
  { label: 'Less color', text: 'Too loud — tone the colors down.' },
  { label: 'Different shoes', text: 'Change the shoes.' },
  { label: 'No jacket', text: 'Drop the jacket or blazer.' },
  { label: 'Wear a dress', text: 'I would prefer a dress.' },
] as const

export const WEATHER_OPTIONS = [
  { value: 'hot', label: 'Hot', icon: '☀️' },
  { value: 'mild', label: 'Mild', icon: '🌤' },
  { value: 'rainy', label: 'Rainy', icon: '🌧' },
  { value: 'cold', label: 'Cold', icon: '❄️' },
] as const

export const TIME_OF_DAY_OPTIONS = [
  { value: 'day', label: 'Daytime' },
  { value: 'evening', label: 'Evening' },
] as const

export const DRESS_CODE_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'smartCasual', label: 'Smart casual' },
  { value: 'formal', label: 'Formal' },
  { value: 'none', label: 'No dress code' },
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

const COLOR_SWATCHES: Record<string, string> = {
  white: '#f4f4f5',
  ivory: '#f6f1e4',
  cream: '#f3e6c8',
  beige: '#d6c4a8',
  tan: '#c4a574',
  camel: '#c19a6b',
  khaki: '#c3b091',
  sand: '#d8c7a5',
  stone: '#c5c0b3',
  grey: '#9ca3af',
  gray: '#9ca3af',
  charcoal: '#374151',
  black: '#111827',
  navy: '#1e3a5f',
  blue: '#2563eb',
  'light blue': '#7ba3c9',
  denim: '#4b6b8a',
  teal: '#0f766e',
  green: '#3f7d4e',
  olive: '#556b2f',
  sage: '#8a9a7b',
  forest: '#1f4d2e',
  mint: '#9ad0b4',
  yellow: '#eab308',
  mustard: '#c4a035',
  gold: '#c9a227',
  orange: '#ea580c',
  rust: '#b45309',
  brown: '#7c4a2d',
  mocha: '#6f4e37',
  chocolate: '#4a2c2a',
  red: '#dc2626',
  maroon: '#7f1d1d',
  burgundy: '#6b1c2a',
  wine: '#6b1c2a',
  pink: '#ec8ab3',
  blush: '#e7b8c6',
  coral: '#e07070',
  peach: '#f3c1a0',
  purple: '#7c3aed',
  lavender: '#b7a4de',
  lilac: '#c4b0d8',
  silver: '#c0c0c0',
}

export function colorSwatch(name: string | null | undefined): string {
  const key = (name || '').trim().toLowerCase()
  if (!key) return '#94a3b8'
  if (COLOR_SWATCHES[key]) return COLOR_SWATCHES[key]
  const parts = key.split(/[\s/-]+/)
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (COLOR_SWATCHES[parts[i]]) return COLOR_SWATCHES[parts[i]]
  }
  return '#94a3b8'
}

const GARMENT_PHRASES = [
  'oxford shirt',
  'graphic tee',
  't-shirt',
  'button-up',
  'button up',
  'polo',
  'hoodie',
  'sweater',
  'blouse',
  'shirt',
  'tee',
  'chinos',
  'jeans',
  'trousers',
  'joggers',
  'shorts',
  'skirt',
  'bomber',
  'jacket',
  'coat',
  'blazer',
  'parka',
  'cardigan',
  'windbreaker',
  'sneakers',
  'loafers',
  'boots',
  'sandals',
  'heels',
  'dress',
  'jumpsuit',
  'hat',
  'bag',
  'belt',
]

function titleCasePhrase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map((word) => {
      if (word.toLowerCase() === 't-shirt') return 't-shirt'
      if (word.toLowerCase() === 'tee') return 'tee'
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

export function itemTitle(item: Pick<WardrobeItem, 'color' | 'category' | 'description'>): string {
  const color = humanize(item.color)
  const description = (item.description || '').trim()
  if (description) {
    const sentence = description.split(/[.!?]/)[0].trim()
    const words = sentence.split(/\s+/).filter(Boolean)
    if (words.length > 0 && words.length <= 5) return sentence
    const lower = description.toLowerCase()
    const phrase = GARMENT_PHRASES.find((entry) => lower.includes(entry))
    if (phrase) {
      const garment = titleCasePhrase(phrase)
      return color ? `${color} ${garment}` : garment
    }
  }
  const category = humanize(item.category)
  if (color && category) return `${color} ${category}`
  return category || 'Wardrobe item'
}

