'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Step1RaceDetails, type Step1Data } from './Step1RaceDetails'
import { Step2GoalFitness, type Step2Data } from './Step2GoalFitness'
import { Step3PhysioData, type Step3Data } from './Step3PhysioData'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Props = {
  open: boolean  // controlled externally — cannot be dismissed
}

export function RaceSetupModal({ open }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [step1, setStep1] = useState<Step1Data | null>(null)
  const [step2, setStep2] = useState<Step2Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStep3Submit(step3Data: Step3Data) {
    if (!step1 || !step2) return
    setLoading(true)
    setError(null)

    const res = await fetch('/api/races', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:              step1.name,
        raceDate:          step1.raceDate,
        distanceKm:        step1.distanceKm,
        location:          step1.location,
        trainingStartDate: step1.trainingStartDate,
        goalTimeMinutes:   step2.goalTimeMinutes,
        fitnessLevel:      step2.fitnessLevel,
        age:               step3Data.age,
        maxHr:             step3Data.maxHr,
        garminData:        step3Data.garminData,
        garminFormat:      step3Data.garminFormat,
      }),
    })

    setLoading(false)

    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Failed to create race. Please try again.')
      return
    }

    router.push('/workouts')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="bg-surface border-border max-w-md w-full"
        showCloseButton={false}
      >
        <DialogHeader>
          {/* Step indicator */}
          <div className="flex items-center gap-0 mb-2">
            {[1, 2, 3].map((s, i) => (
              <div key={s} className="flex items-center flex-1">
                <div className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono flex-shrink-0
                  ${s < step  ? 'bg-accent text-black' : ''}
                  ${s === step ? 'border-2 border-accent text-accent' : ''}
                  ${s > step  ? 'border-2 border-border text-muted' : ''}
                `}>
                  {s < step ? '✓' : s}
                </div>
                {i < 2 && (
                  <div className={`flex-1 h-px mx-1 ${s < step ? 'bg-accent/40' : 'bg-border'}`} />
                )}
              </div>
            ))}
          </div>

          <DialogTitle className="font-display text-2xl tracking-wide">
            {step === 1 && 'Your Race'}
            {step === 2 && 'Goal & Fitness'}
            {step === 3 && 'Physiological Data'}
          </DialogTitle>
          <p className="text-xs text-muted">
            {step === 1 && "Tell us about the race you're training for"}
            {step === 2 && "We'll use these to personalise your paces"}
            {step === 3 && 'Personalises your HR zones and target paces'}
          </p>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 1 && (
          <Step1RaceDetails onNext={(data) => { setStep1(data); setStep(2) }} />
        )}
        {step === 2 && (
          <Step2GoalFitness
            onNext={(data) => { setStep2(data); setStep(3) }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step3PhysioData
            onSubmit={handleStep3Submit}
            onBack={() => setStep(2)}
            loading={loading}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
