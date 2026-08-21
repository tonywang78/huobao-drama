import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyBindings,
  formatAspectRatioForComfy,
  injectPlaceholders,
} from '../src/services/adapters/comfyui-common.ts'

test('formatAspectRatioForComfy maps short ratios to official ResolutionSelector COMBO labels', () => {
  assert.equal(formatAspectRatioForComfy('1:1'), '1:1 (Square)')
  assert.equal(formatAspectRatioForComfy('2:3'), '2:3 (Portrait Photo)')
  assert.equal(formatAspectRatioForComfy('3:2'), '3:2 (Photo)')
  assert.equal(formatAspectRatioForComfy('3:4'), '3:4 (Portrait Standard)')
  assert.equal(formatAspectRatioForComfy('4:3'), '4:3 (Standard)')
  assert.equal(formatAspectRatioForComfy('9:16'), '9:16 (Portrait Widescreen)')
  assert.equal(formatAspectRatioForComfy('16:9'), '16:9 (Widescreen)')
  assert.equal(formatAspectRatioForComfy('21:9'), '21:9 (Ultrawide)')
})

test('formatAspectRatioForComfy passes through already-labeled or unknown values', () => {
  assert.equal(formatAspectRatioForComfy('16:9 (Widescreen)'), '16:9 (Widescreen)')
  assert.equal(formatAspectRatioForComfy('adaptive'), 'adaptive')
  assert.equal(formatAspectRatioForComfy(''), '')
})

test('applyBindings expands short aspectRatio onto ResolutionSelector COMBO pin', () => {
  const workflow = {
    '115': {
      inputs: {
        aspect_ratio: '4:3 (Standard)',
        multiple: 32,
      },
      class_type: 'ResolutionSelector',
    },
  }
  const result = applyBindings(
    structuredClone(workflow),
    { aspectRatio: { nodeId: '115', input: 'aspect_ratio' } },
    { aspectRatio: '16:9' },
  ) as typeof workflow

  assert.equal(result['115'].inputs.aspect_ratio, '16:9 (Widescreen)')
})

test('injectPlaceholders expands {{ASPECT_RATIO}} to official COMBO label', () => {
  const workflow = {
    '115': {
      inputs: { aspect_ratio: '{{ASPECT_RATIO}}' },
      class_type: 'ResolutionSelector',
    },
  }
  const result = injectPlaceholders(structuredClone(workflow), {
    aspectRatio: '9:16',
  }) as typeof workflow

  assert.equal(result['115'].inputs.aspect_ratio, '9:16 (Portrait Widescreen)')
})
