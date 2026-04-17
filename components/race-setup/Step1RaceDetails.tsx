'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const DISTANCES = [
  { label: '5K',            value: 5 },
  { label: '10K',           value: 10 },
  { label: 'Half Marathon', value: 21.0975 },
  { label: 'Marathon',      value: 42.195 },
  { label: 'Custom',        value: 0 },
]

const schema = z.object({
  name:              z.string().min(1, 'Race name is required'),
  raceDate:          z.string().min(1, 'Race date is required').refine(
    d => new Date(d) > new Date(), 'Race date must be in the future'
  ),
  distanceKm:        z.number({ error: 'Select a distance' }).positive(),
  location:          z.string().optional(),
  trainingStartDate: z.string().min(1, 'Training start date is required'),
})

export type Step1Data = z.infer<typeof schema>

type Props = {
  onNext: (data: Step1Data) => void
  defaultValues?: Partial<Step1Data>
}

export function Step1RaceDetails({ onNext, defaultValues }: Props) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<Step1Data>({
    resolver: zodResolver(schema),
    defaultValues: { trainingStartDate: tomorrowStr, ...defaultValues },
  })

  const distanceKm = watch('distanceKm')

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-widest text-muted">Race name</Label>
        <Input placeholder="e.g. ASICS Run Melbourne HM"
          className="bg-bg border-border text-text placeholder:text-muted"
          {...register('name')} />
        {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-widest text-muted">Race date</Label>
          <Input type="date" className="bg-bg border-border text-text"
            {...register('raceDate')} />
          {errors.raceDate && <p className="text-xs text-danger">{errors.raceDate.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-widest text-muted">Distance</Label>
          <Select onValueChange={(v) => setValue('distanceKm', parseFloat(v))}>
            <SelectTrigger className="bg-bg border-border text-text">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent className="bg-surface border-border">
              {DISTANCES.map(d => (
                <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.distanceKm && <p className="text-xs text-danger">{errors.distanceKm.message}</p>}
        </div>
      </div>

      {distanceKm === 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-widest text-muted">Custom distance (km)</Label>
          <Input type="number" step="0.1" placeholder="e.g. 15.0"
            className="bg-bg border-border text-text"
            onChange={(e) => setValue('distanceKm', parseFloat(e.target.value))} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-widest text-muted">Race location</Label>
        <Input placeholder="e.g. Melbourne, Australia"
          className="bg-bg border-border text-text placeholder:text-muted"
          {...register('location')} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-widest text-muted">Training start date</Label>
        <Input type="date" className="bg-bg border-border text-text"
          {...register('trainingStartDate')} />
        {errors.trainingStartDate && <p className="text-xs text-danger">{errors.trainingStartDate.message}</p>}
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" className="bg-accent text-black font-bold uppercase tracking-widest text-xs">
          Next →
        </Button>
      </div>
    </form>
  )
}
