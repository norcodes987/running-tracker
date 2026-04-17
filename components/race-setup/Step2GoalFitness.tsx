'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { goalTimeToMinutes } from '@/lib/training/pace-calculator';

const schema = z.object({
  goalTimeStr: z
    .string()
    .regex(/^\d{1,2}:\d{2}:\d{2}$/, 'Format: h:mm:ss, e.g. 1:40:00'),
  fitnessLevel: z.enum(['beginner', 'building', 'ready']),
});

export type Step2Data = {
  goalTimeMinutes: number;
  fitnessLevel: 'beginner' | 'building' | 'ready';
};

type Props = {
  onNext: (data: Step2Data) => void;
  onBack: () => void;
};

export function Step2GoalFitness({ onNext, onBack }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
  });

  function onSubmit(data: z.infer<typeof schema>) {
    onNext({
      goalTimeMinutes: goalTimeToMinutes(data.goalTimeStr),
      fitnessLevel: data.fitnessLevel,
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
      <div className='space-y-1.5'>
        <Label className='text-xs uppercase tracking-widest text-muted'>
          Goal finish time
        </Label>
        <Input
          placeholder='1:40:00'
          className='bg-bg border-border text-text placeholder:text-muted font-mono'
          {...register('goalTimeStr')}
        />
        {errors.goalTimeStr && (
          <p className='text-xs text-danger'>{errors.goalTimeStr.message}</p>
        )}
      </div>

      <div className='space-y-1.5'>
        <Label className='text-xs uppercase tracking-widest text-muted'>
          Current weekly mileage
        </Label>
        <Select
          onValueChange={(v) =>
            setValue('fitnessLevel', v as 'beginner' | 'building' | 'ready')
          }
        >
          <SelectTrigger className='bg-bg border-border text-text w-full'>
            <SelectValue placeholder='Select fitness level' />
          </SelectTrigger>
          <SelectContent className='bg-surface border-border'>
            <SelectItem value='beginner'>
              Just starting — &lt;20km/week
            </SelectItem>
            <SelectItem value='building'>
              Building base — 20–40km/week
            </SelectItem>
            <SelectItem value='ready'>Race ready — 40km+/week</SelectItem>
          </SelectContent>
        </Select>
        {errors.fitnessLevel && (
          <p className='text-xs text-danger'>{errors.fitnessLevel.message}</p>
        )}
      </div>

      <div className='flex justify-between pt-2'>
        <Button
          type='button'
          variant='ghost'
          onClick={onBack}
          className='text-muted border-border text-xs'
        >
          ← Back
        </Button>
        <Button
          type='submit'
          className='bg-accent text-black font-bold uppercase tracking-widest text-xs'
        >
          Next →
        </Button>
      </div>
    </form>
  );
}
