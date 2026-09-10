/**
 * AI Food Vision service for estimating meal ingredients, portion weights, and macros.
 *
 * Runs fully in-browser using direct calls to Google Gemini API (or demo fixtures)
 * so no server or intermediary backend is involved.
 */

import { compressImage } from './photos'

export const GEMINI_API_KEY_STORAGE = 'hard75:gemini_api_key'

export interface FoodIngredient {
  id: string
  name: string
  weightGrams: number
  protein: number
  carbs: number
  fat: number
  calories: number
  confidence?: 'high' | 'medium' | 'low'
  /** Base nutritional content per 100g used for proportional scaling when weight changes */
  basePer100g?: {
    protein: number
    carbs: number
    fat: number
    calories: number
  }
}

export interface MealAnalysisResult {
  mealName: string
  notes: string
  ingredients: FoodIngredient[]
}

export interface MealTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

/** Retrieve the stored Gemini API key, if configured. */
export function getGeminiApiKey(): string | null {
  try {
    const key = localStorage.getItem(GEMINI_API_KEY_STORAGE)
    return key && key.trim().length > 0 ? key.trim() : null
  } catch {
    return null
  }
}

/** Save the Gemini API key in local storage. */
export function setGeminiApiKey(key: string): void {
  try {
    const trimmed = key.trim()
    if (trimmed) {
      localStorage.setItem(GEMINI_API_KEY_STORAGE, trimmed)
    } else {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE)
    }
  } catch {
    // Ignore storage quota/block errors
  }
}

/** Clear the stored Gemini API key. */
export function clearGeminiApiKey(): void {
  try {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE)
  } catch {
    // Ignore
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10
const roundKcal = (n: number) => Math.round(n)

/** Sum macro values across all ingredients. */
export function calculateTotals(ingredients: FoodIngredient[]): MealTotals {
  let calories = 0
  let protein = 0
  let carbs = 0
  let fat = 0

  for (const item of ingredients) {
    calories += item.calories
    protein += item.protein
    carbs += item.carbs
    fat += item.fat
  }

  return {
    calories: roundKcal(calories),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
  }
}

/** Scale an ingredient's macros in proportion to a new weight. */
export function scaleIngredient(ingredient: FoodIngredient, newWeightGrams: number): FoodIngredient {
  const safeWeight = Math.max(0, Math.round(newWeightGrams))
  if (safeWeight === 0) {
    return {
      ...ingredient,
      weightGrams: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 0,
    }
  }

  // Use basePer100g if present, or compute base from existing values
  const base =
    ingredient.basePer100g ??
    (ingredient.weightGrams > 0
      ? {
          protein: (ingredient.protein / ingredient.weightGrams) * 100,
          carbs: (ingredient.carbs / ingredient.weightGrams) * 100,
          fat: (ingredient.fat / ingredient.weightGrams) * 100,
          calories: (ingredient.calories / ingredient.weightGrams) * 100,
        }
      : { protein: 0, carbs: 0, fat: 0, calories: 0 })

  const factor = safeWeight / 100

  return {
    ...ingredient,
    weightGrams: safeWeight,
    protein: round1(base.protein * factor),
    carbs: round1(base.carbs * factor),
    fat: round1(base.fat * factor),
    calories: roundKcal(base.calories * factor),
    basePer100g: base,
  }
}

let nextCustomId = 1
/** Create a new empty ingredient row for manual additions. */
export function createEmptyIngredient(): FoodIngredient {
  return {
    id: `custom_${Date.now()}_${nextCustomId++}`,
    name: '',
    weightGrams: 100,
    protein: 0,
    carbs: 0,
    fat: 0,
    calories: 0,
    confidence: 'high',
    basePer100g: { protein: 0, carbs: 0, fat: 0, calories: 0 },
  }
}

/** Convert a Blob to raw base64 data string (without the data: URL prefix). */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'))
    reader.readAsDataURL(blob)
  })
}

/** Demo sample meal for testing or demonstration without an API key. */
export function getDemoMealResult(): MealAnalysisResult {
  return {
    mealName: 'Grilled Chicken, Jasmine Rice & Broccoli',
    notes: 'Estimated based on standard dinner plate. Assumed 1 tsp olive oil used in chicken grilling.',
    ingredients: [
      {
        id: 'demo_1',
        name: 'Grilled Chicken Breast',
        weightGrams: 160,
        protein: 49.6,
        carbs: 0,
        fat: 5.8,
        calories: 264,
        confidence: 'high',
        basePer100g: { protein: 31, carbs: 0, fat: 3.6, calories: 165 },
      },
      {
        id: 'demo_2',
        name: 'Cooked Jasmine Rice',
        weightGrams: 180,
        protein: 4.3,
        carbs: 50.8,
        fat: 0.7,
        calories: 234,
        confidence: 'high',
        basePer100g: { protein: 2.4, carbs: 28.2, fat: 0.4, calories: 130 },
      },
      {
        id: 'demo_3',
        name: 'Steamed Broccoli',
        weightGrams: 120,
        protein: 3.4,
        carbs: 8.4,
        fat: 0.5,
        calories: 42,
        confidence: 'high',
        basePer100g: { protein: 2.8, carbs: 7.0, fat: 0.4, calories: 35 },
      },
      {
        id: 'demo_4',
        name: 'Olive Oil (cooking estimate)',
        weightGrams: 5,
        protein: 0,
        carbs: 0,
        fat: 5.0,
        calories: 44,
        confidence: 'medium',
        basePer100g: { protein: 0, carbs: 0, fat: 100, calories: 884 },
      },
    ],
  }
}

/**
 * Send the food image to Gemini Vision with structured JSON schema.
 */
export async function analyzeMealPhoto(file: Blob, apiKey: string): Promise<MealAnalysisResult> {
  // Compress before sending: 1024px maximum edge keeps transfer tiny and quick
  const compressed = await compressImage(file, 1024)
  const base64Data = await blobToBase64(compressed)

  const prompt = `
You are an expert nutritional analyst and food vision AI.
Look carefully at this meal image:
1. Identify each distinct food item / ingredient visible on the plate or in the container. Include estimated hidden cooking fats/oils if likely used.
2. Estimate the portion weight of each item in grams (be realistic based on common tableware or container scale).
3. Compute the macronutrients for each item (protein in grams, carbs in grams, fat in grams, calories in kcal).
4. Provide a short note stating any assumptions (e.g. estimated portion sizes, cooking oils, cuts of meat).
Ensure calories roughly match the Atwater equation (4*protein + 4*carbs + 9*fat) for each ingredient.
`

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Data,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          mealName: {
            type: 'STRING',
            description: 'A clear name for the meal or dish',
          },
          notes: {
            type: 'STRING',
            description: 'Brief explanation of assumptions, e.g. plate size, cooking fats, dressings',
          },
          ingredients: {
            type: 'ARRAY',
            description: 'List of individual food components or ingredients',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING', description: 'Ingredient name' },
                weightGrams: { type: 'NUMBER', description: 'Portion weight in grams' },
                protein: { type: 'NUMBER', description: 'Protein in grams' },
                carbs: { type: 'NUMBER', description: 'Carbohydrates in grams' },
                fat: { type: 'NUMBER', description: 'Fat in grams' },
                calories: { type: 'NUMBER', description: 'Energy in kcal' },
                confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
              },
              required: ['name', 'weightGrams', 'protein', 'carbs', 'fat', 'calories'],
            },
          },
        },
        required: ['mealName', 'notes', 'ingredients'],
      },
    },
  }

  const candidateModels = ['gemini-2.0-flash', 'gemini-2.0-flash-lite']
  let lastError: Error | null = null

  // 1. Try primary models first
  for (const model of candidateModels) {
    try {
      return await callGeminiModel(model, requestBody, apiKey)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // If error is an invalid API key, fail fast without checking further models
      if (lastError.message.includes('API_KEY_INVALID') || lastError.message.includes('permission')) {
        throw lastError
      }
    }
  }

  // 2. If candidates returned 404, query ModelService to discover models available to this API key
  const discovered = await findActiveModels(apiKey)
  for (const model of discovered) {
    if (candidateModels.includes(model)) continue
    try {
      return await callGeminiModel(model, requestBody, apiKey)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError ?? new Error('Could not analyze meal photo with Gemini API.')
}

async function callGeminiModel(model: string, requestBody: unknown, apiKey: string): Promise<MealAnalysisResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const msg = (errorData as { error?: { message?: string } })?.error?.message ?? `HTTP ${response.status}`
    throw new Error(`Gemini API error (${model}): ${msg}`)
  }

  const json = await response.json()
  const textContent = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!textContent) {
    throw new Error('No content returned from Gemini model.')
  }

  const parsed = JSON.parse(textContent)
  return normalizeAnalysisResult(parsed)
}

/** Query the API to discover active models supporting generateContent for this key. */
async function findActiveModels(apiKey: string): Promise<string[]> {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(listUrl)
    if (!res.ok) return []
    const data = (await res.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> }
    const valid = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && typeof m.name === 'string')
      .map((m) => (m.name as string).replace(/^models\//, ''))

    // Prioritize flash models
    return valid.sort((a, b) => {
      const aScore = (a === 'gemini-2.0-flash' ? 10 : 0) + (a.includes('flash') ? 5 : 0)
      const bScore = (b === 'gemini-2.0-flash' ? 10 : 0) + (b.includes('flash') ? 5 : 0)
      return bScore - aScore
    })
  } catch {
    return []
  }
}

interface RawIngredient {
  name?: unknown
  weightGrams?: unknown
  protein?: unknown
  carbs?: unknown
  fat?: unknown
  calories?: unknown
  confidence?: unknown
}

interface RawAnalysis {
  mealName?: unknown
  notes?: unknown
  ingredients?: unknown
}

/** Sanitize and validate raw AI response into typed data. */
export function normalizeAnalysisResult(raw: RawAnalysis): MealAnalysisResult {
  const mealName = typeof raw.mealName === 'string' && raw.mealName.trim() ? raw.mealName.trim() : 'Estimated Meal'
  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : ''

  const rawList = Array.isArray(raw.ingredients) ? (raw.ingredients as RawIngredient[]) : []
  const ingredients: FoodIngredient[] = []

  let idx = 1
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Item ${idx}`
    const weightGrams = Math.max(1, Math.round(Number(item.weightGrams) || 100))
    const protein = round1(Math.max(0, Number(item.protein) || 0))
    const carbs = round1(Math.max(0, Number(item.carbs) || 0))
    const fat = round1(Math.max(0, Number(item.fat) || 0))
    const calories = roundKcal(
      Math.max(0, Number(item.calories) || Math.round(protein * 4 + carbs * 4 + fat * 9)),
    )
    const confidence =
      item.confidence === 'high' || item.confidence === 'medium' || item.confidence === 'low'
        ? item.confidence
        : 'medium'

    const basePer100g = {
      protein: round1((protein / weightGrams) * 100),
      carbs: round1((carbs / weightGrams) * 100),
      fat: round1((fat / weightGrams) * 100),
      calories: roundKcal((calories / weightGrams) * 100),
    }

    ingredients.push({
      id: `ing_${Date.now()}_${idx++}`,
      name,
      weightGrams,
      protein,
      carbs,
      fat,
      calories,
      confidence,
      basePer100g,
    })
  }

  return {
    mealName,
    notes,
    ingredients: ingredients.length > 0 ? ingredients : [createEmptyIngredient()],
  }
}
