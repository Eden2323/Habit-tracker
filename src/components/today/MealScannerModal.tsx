import { useEffect, useId, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import {
  calculateTotals,
  createEmptyIngredient,
  getDemoMealResult,
  getGeminiApiKey,
  scaleIngredient,
  setGeminiApiKey,
  type FoodIngredient,
  type MealAnalysisResult,
  type MealTotals,
  analyzeMealPhoto,
} from '../../lib/aiFoodVision'
import { Button, Modal, useToast } from '../ui'
import './meal-scanner.css'

export interface MealScannerModalProps {
  open: boolean
  onClose: () => void
  onApply: (totals: MealTotals, mode: 'add' | 'replace') => void
  currentMacros?: {
    protein: number
    carbs: number
    fat: number
    calories: number
  }
}

type Step = 'capture' | 'scanning' | 'review'

export function MealScannerModal({ open, onClose, onApply, currentMacros }: MealScannerModalProps) {
  const toast = useToast()
  const uid = useId().replace(/:/g, '')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('capture')
  const [apiKey, setApiKey] = useState<string>(() => getGeminiApiKey() ?? '')
  const [keyDraft, setKeyDraft] = useState<string>('')
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<MealAnalysisResult | null>(null)
  const [ingredients, setIngredients] = useState<FoodIngredient[]>([])
  const [applyMode, setApplyMode] = useState<'add' | 'replace'>('add')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [statusText, setStatusText] = useState('Analyzing meal...')

  // Synchronize API key with storage
  useEffect(() => {
    if (open) {
      const stored = getGeminiApiKey() ?? ''
      setApiKey(stored)
      setKeyDraft(stored)
      setShowKeyPrompt(!stored)
      setStep('capture')
      setErrorMsg(null)
    }
  }, [open])

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function saveKey(keyToSave: string) {
    const clean = keyToSave.trim()
    setApiKey(clean)
    setGeminiApiKey(clean)
    setShowKeyPrompt(false)
    toast('Gemini API key saved')
  }

  async function handleFile(file: File) {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file (JPEG, PNG, etc.)', 'error')
      return
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setErrorMsg(null)

    // Check if API key is provided
    const key = apiKey.trim() || getGeminiApiKey()
    if (!key) {
      setShowKeyPrompt(true)
      return
    }

    await performAnalysis(file, key)
  }

  async function performAnalysis(file: Blob, key: string) {
    setStep('scanning')
    setStatusText('Sending photo to Gemini Vision...')

    try {
      setStatusText('Identifying ingredients and portions...')
      const result = await analyzeMealPhoto(file, key)
      setAnalysis(result)
      setIngredients(result.ingredients)
      setStep('review')
    } catch (err) {
      console.error('Meal analysis error:', err)
      const msg = err instanceof Error ? err.message : 'Analysis failed. Please check your API key.'
      setErrorMsg(msg)
      setStep('capture')
    }
  }

  function loadDemo() {
    setErrorMsg(null)
    setStep('scanning')
    setStatusText('Loading sample meal analysis...')
    setTimeout(() => {
      const demo = getDemoMealResult()
      setAnalysis(demo)
      setIngredients(demo.ingredients)
      setStep('review')
    }, 600)
  }

  function onWeightChange(id: string, newWeight: number) {
    setIngredients((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        return scaleIngredient(item, newWeight)
      }),
    )
  }

  function onFieldChange(id: string, field: keyof FoodIngredient, value: string | number) {
    setIngredients((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const updated = { ...item, [field]: value }
        // If calories is not directly edited, keep in sync with Atwater if macros change
        if (field === 'protein' || field === 'carbs' || field === 'fat') {
          const p = Number(field === 'protein' ? value : updated.protein) || 0
          const c = Number(field === 'carbs' ? value : updated.carbs) || 0
          const f = Number(field === 'fat' ? value : updated.fat) || 0
          updated.calories = Math.round(p * 4 + c * 4 + f * 9)
        }
        return updated
      }),
    )
  }

  function removeIngredient(id: string) {
    setIngredients((prev) => {
      const next = prev.filter((item) => item.id !== id)
      return next.length > 0 ? next : [createEmptyIngredient()]
    })
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, createEmptyIngredient()])
  }

  const totals = calculateTotals(ingredients)

  function handleApply() {
    onApply(totals, applyMode)
    toast(
      applyMode === 'add'
        ? `Added ${totals.calories} kcal (${totals.protein}P · ${totals.carbs}C · ${totals.fat}F)`
        : `Set macros to ${totals.calories} kcal (${totals.protein}P · ${totals.carbs}C · ${totals.fat}F)`,
    )
    onClose()
  }

  const cameraInputId = `ms-cam-${uid}`
  const fileInputId = `ms-file-${uid}`

  return (
    <Modal open={open} onClose={onClose} title="AI Meal Scanner">
      <div className="ms-modal">
        {/* --- API Key Config Box --- */}
        {showKeyPrompt && (
          <div className="ms-key-box" role="region" aria-label="Gemini API Key Configuration">
            <div className="ms-key-box__lead">
              <span aria-hidden="true">🔑</span>
              <span>Gemini Vision API Key</span>
            </div>
            <p className="ms-key-box__desc">
              Your key is saved only in this browser's local storage and connects directly to Google Gemini. No servers
              or intermediaries ever see your photos or key.
            </p>
            <div className="ms-key-box__row">
              <input
                className="ms-key-box__input"
                type="password"
                placeholder="AIzaSy..."
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                aria-label="Google Gemini API Key"
              />
              <Button variant="primary" size="sm" onClick={() => saveKey(keyDraft)} disabled={!keyDraft.trim()}>
                Save Key
              </Button>
            </div>
            <div className="ms-key-box__actions">
              <a
                className="ms-key-box__link"
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
              >
                Get a free key at Google AI Studio &rarr;
              </a>
              <Button variant="ghost" size="sm" onClick={loadDemo}>
                Try Demo Meal
              </Button>
            </div>
          </div>
        )}

        {/* --- Error Message Banner --- */}
        {errorMsg && (
          <div className="ms-notice" role="alert">
            <span className="ms-notice__icon" aria-hidden="true">
              ⚠️
            </span>
            <div>
              <strong>Could not analyze image:</strong> {errorMsg}
            </div>
          </div>
        )}

        {/* --- Capture Step --- */}
        {step === 'capture' && (
          <div className="ms-capture-zone">
            <input
              id={cameraInputId}
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="ms-hidden-input"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            <input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="ms-hidden-input"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />

            <span className="ms-capture-icon" aria-hidden="true">
              🍽️
            </span>
            <div className="ms-capture-title">Take or choose a meal photo</div>
            <div className="ms-capture-sub">
              Snap a picture of your plate or container. The AI will detect the ingredients, portion weights, and
              macros for you to review and adjust.
            </div>

            <div className="ms-capture-buttons">
              <Button
                variant="primary"
                onClick={() => cameraInputRef.current?.click()}
                aria-label="Open camera to take a photo of your meal"
              >
                📸 Take Photo
              </Button>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Choose meal image from device photo library"
              >
                🖼️ Choose from Library
              </Button>
              <Button variant="ghost" size="sm" onClick={loadDemo}>
                Demo Meal
              </Button>
            </div>
          </div>
        )}

        {/* --- Scanning / Loading Step --- */}
        {step === 'scanning' && (
          <div className="ms-scanning" role="status" aria-live="polite">
            <div className="ms-scan-preview-wrap">
              {previewUrl ? (
                <img src={previewUrl} alt="Meal being analyzed" className="ms-scan-preview-img" />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                  }}
                >
                  🥗
                </div>
              )}
              <div className="ms-scan-laser" aria-hidden="true" />
            </div>

            <div className="ms-scan-status">{statusText}</div>
            <p className="ms-scan-tip">
              Breakdown will open in a moment. You can edit every ingredient, adjust weights, and tweak macros before
              applying.
            </p>
          </div>
        )}

        {/* --- Review Step (Human in the loop) --- */}
        {step === 'review' && analysis && (
          <>
            <div className="ms-review-head">
              {previewUrl && <img src={previewUrl} alt="Analyzed meal" className="ms-review-thumb" />}
              <div className="ms-review-meta">
                <div className="ms-review-mealname">{analysis.mealName}</div>
                <div className="ms-review-sub">
                  {ingredients.length} item{ingredients.length === 1 ? '' : 's'} identified · Human review
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep('capture')}>
                Retake
              </Button>
            </div>

            {analysis.notes && (
              <div className="ms-notice">
                <span className="ms-notice__icon" aria-hidden="true">
                  💡
                </span>
                <div>{analysis.notes}</div>
              </div>
            )}

            {/* Editable ingredients list */}
            <div className="ms-ingredients" role="list" aria-label="Identified ingredients and estimated portions">
              {ingredients.map((item) => (
                <div key={item.id} className="ms-item-card" role="listitem">
                  <div className="ms-item-top">
                    <input
                      className="ms-item-name-input"
                      type="text"
                      value={item.name}
                      placeholder="Ingredient name"
                      aria-label="Ingredient name"
                      onChange={(e) => onFieldChange(item.id, 'name', e.target.value)}
                    />

                    <div className="ms-item-weight-wrap">
                      <input
                        className="ms-item-weight-input tabular"
                        type="number"
                        min={0}
                        max={3000}
                        step={5}
                        value={item.weightGrams || ''}
                        aria-label={`${item.name || 'Ingredient'} weight in grams`}
                        onChange={(e) => onWeightChange(item.id, Number(e.target.value) || 0)}
                      />
                      <span className="ms-item-unit" aria-hidden="true">
                        g
                      </span>
                    </div>

                    <button
                      type="button"
                      className="ms-item-delete-btn"
                      onClick={() => removeIngredient(item.id)}
                      aria-label={`Remove ${item.name || 'ingredient'}`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>

                  <div className="ms-item-macros">
                    <div className="ms-macro-chip" style={{ '--chip-tint': 'var(--task-photo)' } as CSSProperties}>
                      <span className="ms-macro-chip__label">Protein</span>
                      <input
                        className="ms-macro-chip__input tabular"
                        type="number"
                        min={0}
                        step={1}
                        value={item.protein}
                        aria-label={`${item.name || 'Ingredient'} protein in grams`}
                        onChange={(e) => onFieldChange(item.id, 'protein', Number(e.target.value) || 0)}
                      />
                    </div>

                    <div className="ms-macro-chip" style={{ '--chip-tint': 'var(--task-water)' } as CSSProperties}>
                      <span className="ms-macro-chip__label">Carbs</span>
                      <input
                        className="ms-macro-chip__input tabular"
                        type="number"
                        min={0}
                        step={1}
                        value={item.carbs}
                        aria-label={`${item.name || 'Ingredient'} carbs in grams`}
                        onChange={(e) => onFieldChange(item.id, 'carbs', Number(e.target.value) || 0)}
                      />
                    </div>

                    <div className="ms-macro-chip" style={{ '--chip-tint': 'var(--task-reading)' } as CSSProperties}>
                      <span className="ms-macro-chip__label">Fat</span>
                      <input
                        className="ms-macro-chip__input tabular"
                        type="number"
                        min={0}
                        step={1}
                        value={item.fat}
                        aria-label={`${item.name || 'Ingredient'} fat in grams`}
                        onChange={(e) => onFieldChange(item.id, 'fat', Number(e.target.value) || 0)}
                      />
                    </div>

                    <div className="ms-macro-chip" style={{ '--chip-tint': 'var(--task-macros)' } as CSSProperties}>
                      <span className="ms-macro-chip__label">Calories</span>
                      <input
                        className="ms-macro-chip__input tabular"
                        type="number"
                        min={0}
                        step={5}
                        value={item.calories}
                        aria-label={`${item.name || 'Ingredient'} calories`}
                        onChange={(e) => onFieldChange(item.id, 'calories', Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button type="button" className="ms-add-btn" onClick={addIngredient}>
                <span aria-hidden="true">+</span> Add another ingredient / sauce
              </button>
            </div>

            {/* Rolling Totals Card */}
            <div className="ms-totals-box" role="region" aria-label="Meal Totals">
              <div className="ms-totals-head">
                <span className="ms-totals-title">Estimated Meal Totals</span>
                <span className="ms-totals-cal tabular">
                  {totals.calories}
                  <span className="ms-totals-unit">kcal</span>
                </span>
              </div>
              <div className="ms-totals-macros">
                <span className="ms-totals-p tabular">{totals.protein}g Protein</span>
                <span aria-hidden="true">·</span>
                <span className="ms-totals-c tabular">{totals.carbs}g Carbs</span>
                <span aria-hidden="true">·</span>
                <span className="ms-totals-f tabular">{totals.fat}g Fat</span>
              </div>
            </div>

            {/* Application Mode: Add to existing vs Replace */}
            <div className="ms-mode-section">
              <div className="ms-mode-label">How to apply to today:</div>
              <div className="ms-mode-options" role="radiogroup" aria-label="Application mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={applyMode === 'add'}
                  className="ms-mode-btn"
                  onClick={() => setApplyMode('add')}
                >
                  <span className="ms-mode-btn__title">+ Add to today</span>
                  <span className="ms-mode-btn__sub">
                    {currentMacros && currentMacros.calories > 0
                      ? `Sum with current (${currentMacros.calories} + ${totals.calories} = ${currentMacros.calories + totals.calories} kcal)`
                      : 'Accumulate with today’s logged macros'}
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={applyMode === 'replace'}
                  className="ms-mode-btn"
                  onClick={() => setApplyMode('replace')}
                >
                  <span className="ms-mode-btn__title">Replace today</span>
                  <span className="ms-mode-btn__sub">Set today's numbers to this meal</span>
                </button>
              </div>
            </div>

            <div className="ms-footer-actions">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleApply}>
                Apply to Today
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
