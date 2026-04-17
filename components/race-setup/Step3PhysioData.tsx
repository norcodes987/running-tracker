'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  age:   z.number({ error: 'Age is required' }).int().min(10).max(100),
  maxHr: z.number().int().min(100).max(250).optional(),
})

export type Step3Data = {
  age:         number
  maxHr?:      number
  garminData?: string
  garminFormat?: 'csv' | 'json'
}

type Props = {
  onSubmit: (data: Step3Data) => void
  onBack:   () => void
  loading:  boolean
}

export function Step3PhysioData({ onSubmit, onBack, loading }: Props) {
  const [garminFile, setGarminFile] = useState<File | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  async function onFormSubmit(formData: z.infer<typeof schema>) {
    let garminData: string | undefined
    let garminFormat: 'csv' | 'json' | undefined

    if (garminFile) {
      garminData = await garminFile.text()
      garminFormat = garminFile.name.endsWith('.json') ? 'json' : 'csv'
    }

    onSubmit({
      age:      formData.age,
      maxHr:    formData.maxHr,
      garminData,
      garminFormat,
    })
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-widest text-muted">Age</Label>
          <Input type="number" placeholder="32"
            className="bg-bg border-border text-text placeholder:text-muted"
            {...register('age', { valueAsNumber: true })} />
          {errors.age && <p className="text-xs text-danger">{errors.age.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-widest text-muted">
            Max HR <span className="text-muted normal-case">(optional)</span>
          </Label>
          <Input type="number" placeholder="auto"
            className="bg-bg border-border text-text placeholder:text-muted"
            {...register('maxHr', { valueAsNumber: true })} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-widest text-muted">
          Garmin export <span className="text-muted normal-case">(optional — CSV or JSON)</span>
        </Label>
        <div
          className="border border-dashed border-border rounded p-5 text-center text-muted text-xs cursor-pointer hover:border-accent/50 transition-colors"
          onClick={() => document.getElementById('garmin-upload')?.click()}
        >
          {garminFile ? (
            <span className="text-accent">{garminFile.name}</span>
          ) : (
            <>Drop file here or <span className="text-accent">browse</span></>
          )}
          <div className="mt-1 text-muted/60">Extracts max HR · pace benchmarks · training load</div>
        </div>
        <input
          id="garmin-upload"
          type="file"
          accept=".csv,.json"
          className="hidden"
          onChange={(e) => setGarminFile(e.target.files?.[0] ?? null)}
        />
        {!garminFile && (
          <p className="text-xs text-muted">
            No Garmin data? HR estimated from your age using the Tanaka formula.
          </p>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}
          className="text-muted border-border text-xs">
          ← Back
        </Button>
        <Button type="submit" disabled={loading}
          className="bg-accent text-black font-bold uppercase tracking-widest text-xs">
          {loading ? 'Building plan…' : 'Build my plan →'}
        </Button>
      </div>
    </form>
  )
}
