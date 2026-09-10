import { beforeEach, describe, expect, it } from 'vitest'
import {
  calculateTotals,
  clearGeminiApiKey,
  createEmptyIngredient,
  getDemoMealResult,
  getGeminiApiKey,
  normalizeAnalysisResult,
  scaleIngredient,
  setGeminiApiKey,
  type FoodIngredient,
} from '../lib/aiFoodVision'

describe('AI Food Vision Service', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('API key management', () => {
    it('returns null when no key is set', () => {
      expect(getGeminiApiKey()).toBeNull()
    })

    it('persists and retrieves a trimmed API key', () => {
      setGeminiApiKey('  AIzaSyTestKey123  ')
      expect(getGeminiApiKey()).toBe('AIzaSyTestKey123')
    })

    it('clears an existing API key', () => {
      setGeminiApiKey('test-key')
      expect(getGeminiApiKey()).toBe('test-key')

      clearGeminiApiKey()
      expect(getGeminiApiKey()).toBeNull()
    })

    it('clears key when empty string is passed to setGeminiApiKey', () => {
      setGeminiApiKey('test-key')
      setGeminiApiKey('   ')
      expect(getGeminiApiKey()).toBeNull()
    })
  })

  describe('calculateTotals', () => {
    it('sums macros across items with rounding', () => {
      const items: FoodIngredient[] = [
        {
          id: '1',
          name: 'Steak',
          weightGrams: 200,
          protein: 52.4,
          carbs: 0,
          fat: 16.2,
          calories: 365,
        },
        {
          id: '2',
          name: 'Rice',
          weightGrams: 150,
          protein: 3.6,
          carbs: 42.1,
          fat: 0.6,
          calories: 195,
        },
      ]

      const totals = calculateTotals(items)
      expect(totals.protein).toBe(56) // 52.4 + 3.6
      expect(totals.carbs).toBe(42.1)
      expect(totals.fat).toBe(16.8)
      expect(totals.calories).toBe(560)
    })

    it('returns zeroes for empty list', () => {
      expect(calculateTotals([])).toEqual({
        protein: 0,
        carbs: 0,
        fat: 0,
        calories: 0,
      })
    })
  })

  describe('scaleIngredient', () => {
    it('scales protein, carbs, fat, and calories proportionally when weight is doubled', () => {
      const item: FoodIngredient[] = [
        {
          id: '1',
          name: 'Chicken Breast',
          weightGrams: 100,
          protein: 31,
          carbs: 0,
          fat: 3.6,
          calories: 165,
          basePer100g: { protein: 31, carbs: 0, fat: 3.6, calories: 165 },
        },
      ]

      const scaled = scaleIngredient(item[0]!, 200)
      expect(scaled.weightGrams).toBe(200)
      expect(scaled.protein).toBe(62)
      expect(scaled.carbs).toBe(0)
      expect(scaled.fat).toBe(7.2)
      expect(scaled.calories).toBe(330)
    })

    it('scales down when portion weight is halved', () => {
      const item: FoodIngredient = {
        id: '1',
        name: 'Oatmeal',
        weightGrams: 80,
        protein: 10.4,
        carbs: 54.4,
        fat: 5.6,
        calories: 310,
      }

      const scaled = scaleIngredient(item, 40)
      expect(scaled.weightGrams).toBe(40)
      expect(scaled.protein).toBe(5.2)
      expect(scaled.carbs).toBe(27.2)
      expect(scaled.fat).toBe(2.8)
      expect(scaled.calories).toBe(155)
    })

    it('zeroes macros safely when weight is set to 0', () => {
      const item: FoodIngredient = {
        id: '1',
        name: 'Avocado',
        weightGrams: 50,
        protein: 1,
        carbs: 4.5,
        fat: 7.5,
        calories: 80,
      }

      const scaled = scaleIngredient(item, 0)
      expect(scaled.weightGrams).toBe(0)
      expect(scaled.protein).toBe(0)
      expect(scaled.carbs).toBe(0)
      expect(scaled.fat).toBe(0)
      expect(scaled.calories).toBe(0)
    })
  })

  describe('createEmptyIngredient', () => {
    it('creates an empty ingredient with sane defaults', () => {
      const empty = createEmptyIngredient()
      expect(empty.id).toBeDefined()
      expect(empty.name).toBe('')
      expect(empty.weightGrams).toBe(100)
      expect(empty.protein).toBe(0)
      expect(empty.carbs).toBe(0)
      expect(empty.fat).toBe(0)
      expect(empty.calories).toBe(0)
    })
  })

  describe('normalizeAnalysisResult', () => {
    it('parses valid AI JSON and populates basePer100g', () => {
      const raw = {
        mealName: 'Salmon and Asparagus',
        notes: 'Pan-seared salmon with grilled asparagus.',
        ingredients: [
          {
            name: 'Salmon Fillet',
            weightGrams: 150,
            protein: 34,
            carbs: 0,
            fat: 18,
            calories: 300,
            confidence: 'high',
          },
          {
            name: 'Asparagus',
            weightGrams: 100,
            protein: 2.2,
            carbs: 3.9,
            fat: 0.2,
            calories: 20,
            confidence: 'high',
          },
        ],
      }

      const normalized = normalizeAnalysisResult(raw)
      expect(normalized.mealName).toBe('Salmon and Asparagus')
      expect(normalized.notes).toBe('Pan-seared salmon with grilled asparagus.')
      expect(normalized.ingredients).toHaveLength(2)

      const salmon = normalized.ingredients[0]!
      expect(salmon.name).toBe('Salmon Fillet')
      expect(salmon.weightGrams).toBe(150)
      expect(salmon.protein).toBe(34)
      expect(salmon.basePer100g).toBeDefined()
      expect(salmon.basePer100g?.protein).toBe(22.7)
    })

    it('handles malformed or missing fields gracefully', () => {
      const raw = {
        mealName: '',
        notes: null,
        ingredients: [
          {
            name: '',
            weightGrams: 'not-a-number',
            protein: null,
            carbs: undefined,
            fat: 5,
            calories: null,
            confidence: 'invalid-confidence',
          },
        ],
      }

      const normalized = normalizeAnalysisResult(raw)
      expect(normalized.mealName).toBe('Estimated Meal')
      expect(normalized.notes).toBe('')
      expect(normalized.ingredients).toHaveLength(1)

      const item = normalized.ingredients[0]!
      expect(item.name).toBe('Item 1')
      expect(item.weightGrams).toBe(100) // fallback weight
      expect(item.protein).toBe(0)
      expect(item.fat).toBe(5)
      expect(item.calories).toBe(45) // Atwater calculated (0*4 + 0*4 + 5*9)
      expect(item.confidence).toBe('medium') // fallback confidence
    })
  })

  describe('getDemoMealResult', () => {
    it('returns a complete demo meal breakdown with balanced macros', () => {
      const demo = getDemoMealResult()
      expect(demo.mealName).toContain('Chicken')
      expect(demo.ingredients.length).toBeGreaterThanOrEqual(3)

      const totals = calculateTotals(demo.ingredients)
      expect(totals.protein).toBeGreaterThan(40)
      expect(totals.calories).toBeGreaterThan(400)
    })
  })
})
