import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CREATING_BUILD,
  CREATING_GENERIC,
  CREATING_REVIEW,
  CREATING_SEARCH,
  collageExplanation,
  creatingStatusCopy,
  interpretTryOnBody,
  normalizeStyleReference,
  offersLocalPreview,
  recoveryCopyForApiError,
  studentFacingCopy,
  tryOnResultEvent,
} from '../src/studio/studioCopy.ts'

test('creating copy stays generic until the catalog path is real', () => {
  assert.equal(creatingStatusCopy({}), CREATING_GENERIC)
  assert.equal(creatingStatusCopy({ searchMode: 'simpleFallback', elapsedSec: 12 }), CREATING_GENERIC)
  assert.equal(creatingStatusCopy({ searchMode: null, elapsedSec: 9 }), CREATING_GENERIC)
  assert.equal(creatingStatusCopy({ searchMode: 'textThenPhotos', elapsedSec: 1 }), CREATING_SEARCH)
  assert.equal(creatingStatusCopy({ searchMode: 'textThenPhotos', elapsedSec: 5 }), CREATING_REVIEW)
  assert.equal(creatingStatusCopy({ searchMode: 'textThenPhotos', elapsedSec: 9 }), CREATING_BUILD)
  assert.equal(creatingStatusCopy({ runStatus: 'reviewingPhotos' }), CREATING_REVIEW)
  assert.equal(
    creatingStatusCopy({ searchMode: 'simpleFallback', runStatus: 'buildingOutfits' }),
    CREATING_BUILD,
  )
})

test('style reference is not invented and a string is not a photo', () => {
  assert.equal(normalizeStyleReference(undefined), null)
  assert.equal(normalizeStyleReference(''), null)
  assert.equal(normalizeStyleReference('   '), null)
  assert.deepEqual(normalizeStyleReference('campus-smart-12'), { label: 'campus-smart-12' })
  assert.equal(normalizeStyleReference('campus-smart-12')?.imageUrl, undefined)
  assert.deepEqual(normalizeStyleReference('A neat lecture look from the catalog.'), {
    reason: 'A neat lecture look from the catalog.',
  })
  assert.deepEqual(
    normalizeStyleReference({
      id: 'ref-1',
      imageUrl: 'https://cdn.example.com/look.jpg',
      label: 'Uniqlo smart casual',
      reason: 'Light layers for a warm lecture day.',
    }),
    {
      id: 'ref-1',
      imageUrl: 'https://cdn.example.com/look.jpg',
      label: 'Uniqlo smart casual',
      reason: 'Light layers for a warm lecture day.',
    },
  )
})

test('try-on poll keeps HTTP 200 failures and collages distinct', () => {
  const generated = interpretTryOnBody({
    status: 'ready',
    tryOnUrl: '/uploads/tryon/a.jpg',
    resultKind: 'generated',
    fallbackReason: null,
    detail: null,
  })
  assert.equal(generated.type, 'ready')

  const preview = interpretTryOnBody(
    {
      status: 'ready',
      tryOnUrl: '/uploads/tryon/a.jpg',
      resultKind: 'collage',
      fallbackReason: 'missing_key',
      detail: 'Local preview only.',
    },
    { acceptPreview: true },
  )
  assert.equal(preview.type, 'ready')

  const collageWithoutAsk = interpretTryOnBody({
    status: 'ready',
    tryOnUrl: '/uploads/tryon/a.jpg',
    resultKind: 'collage',
    fallbackReason: 'local_images_not_public',
    detail: 'Local preview only.',
  })
  assert.equal(collageWithoutAsk.type, 'failed')
  if (collageWithoutAsk.type === 'failed') {
    assert.equal(collageWithoutAsk.httpStatus, 200)
    assert.equal(collageWithoutAsk.offerPreview, true)
  }

  const missingKey = interpretTryOnBody({
    status: 'failed',
    tryOnUrl: null,
    resultKind: null,
    fallbackReason: 'missing_key',
    detail: 'No try-on provider key is configured.',
  })
  assert.equal(missingKey.type, 'failed')
  if (missingKey.type === 'failed') {
    assert.equal(missingKey.httpStatus, 200)
    assert.equal(missingKey.fallbackReason, 'missing_key')
    assert.equal(missingKey.offerPreview, true)
    assert.match(missingKey.message, /provider key/i)
  }

  for (const reason of ['provider_error', 'timeout', 'missing_key'] as const) {
    const decision = interpretTryOnBody({
      status: 'failed',
      tryOnUrl: null,
      resultKind: null,
      fallbackReason: reason,
      detail: 'Try again.',
    })
    assert.equal(decision.type, 'failed')
    if (decision.type === 'failed') assert.equal(offersLocalPreview(decision.fallbackReason), true)
  }

  const localhost = interpretTryOnBody({
    status: 'failed',
    tryOnUrl: null,
    resultKind: null,
    fallbackReason: 'local_images_not_public',
    detail: 'These photos are not on a public URL.',
  })
  assert.equal(localhost.type, 'failed')
  if (localhost.type === 'failed') {
    assert.equal(localhost.offerPreview, true)
    assert.equal(localhost.httpStatus, 200)
  }

  assert.equal(
    interpretTryOnBody({
      status: 'processing',
      tryOnUrl: null,
      resultKind: null,
      fallbackReason: null,
      detail: null,
    }).type,
    'poll',
  )
})

test('analytics event for a collage is not the generated success event', () => {
  assert.equal(tryOnResultEvent('generated'), 'studio_tryon_ready')
  assert.equal(tryOnResultEvent('collage'), 'studio_tryon_preview')
  assert.equal(tryOnResultEvent(null), null)
})

test('502 is not studio-unreachable unless the request never lands', () => {
  const gateway = recoveryCopyForApiError(502, 'The styling studio had a moment. Give it another go.', {
    source: 'recommend',
  })
  assert.equal(gateway.kind, 'failure')
  assert.equal(gateway.title, "Couldn't create outfits")
  assert.match(gateway.message, /fashion references/)

  const offline = recoveryCopyForApiError(0, 'Backend not running on port 8018.', {
    source: 'connection',
  })
  assert.equal(offline.kind, 'offline')
  assert.match(offline.title, /can't reach the USTyle server/)

  const providerOn502 = recoveryCopyForApiError(
    502,
    'The try-on provider could not generate an image.',
    { source: 'tryon', fallbackReason: 'provider_error', tryOnStatus: 'failed' },
  )
  assert.equal(providerOn502.kind, 'failure')
  assert.doesNotMatch(providerOn502.title, /unreachable/)

  const http200Failed = recoveryCopyForApiError(200, 'The try-on provider timed out.', {
    source: 'tryon',
    fallbackReason: 'timeout',
    tryOnStatus: 'failed',
  })
  assert.equal(http200Failed.kind, 'failure')
  assert.equal(http200Failed.primaryLabel, 'Retry')
  assert.doesNotMatch(http200Failed.title, /unreachable/)
})

test('student copy and collage reasons do not name a vendor', () => {
  assert.equal(studentFacingCopy('kie.ai did not return a task'), 'the try-on service did not return a task')
  assert.doesNotMatch(collageExplanation('provider_error'), /kie\.ai/i)
  assert.doesNotMatch(collageExplanation('local_images_not_public'), /kie\.ai/i)
  assert.match(collageExplanation('local_images_not_public'), /preview/)
  assert.match(collageExplanation('missing_inputs'), /body photo/)
})
