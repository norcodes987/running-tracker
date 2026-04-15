'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

const schema = z
  .object({
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setLoading(true);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, password: data.password }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? 'Registration failed');
      setLoading(false);
      return;
    }

    // Auto-login after register
    const result = await signIn('credentials', {
      email: data.email,
      password: data.password,
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      setError('Account created but login failed — try logging in manually');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className='w-full max-w-sm'>
      <div className='text-center mb-10'>
        <h1
          className='text-6xl leading-none tracking-widest mb-2'
          style={{ fontFamily: 'var(--font-barlow)', color: '#F5C400' }}
        >
          PERCY
        </h1>
        <p className='text-sm text-muted tracking-wide'>
          Train smarter. Race faster.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className='space-y-1.5'>
          <Label
            htmlFor='email'
            className='text-xs uppercase tracking-widest text-muted'
          >
            Email
          </Label>
          <Input
            id='email'
            type='email'
            placeholder='you@example.com'
            className='bg-surface border-border text-text placeholder:text-muted'
            {...register('email')}
          />
          {errors.email && (
            <p className='text-xs text-danger'>{errors.email.message}</p>
          )}
        </div>

        <div className='space-y-1.5'>
          <Label
            htmlFor='password'
            className='text-xs uppercase tracking-widest text-muted'
          >
            Password
          </Label>
          <Input
            id='password'
            type='password'
            placeholder='Min 8 characters'
            className='bg-surface border-border text-text placeholder:text-muted'
            {...register('password')}
          />
          {errors.password && (
            <p className='text-xs text-danger'>{errors.password.message}</p>
          )}
        </div>

        <div className='space-y-1.5'>
          <Label
            htmlFor='confirmPassword'
            className='text-xs uppercase tracking-widest text-muted'
          >
            Confirm password
          </Label>
          <Input
            id='confirmPassword'
            type='password'
            placeholder='Repeat password'
            className='bg-surface border-border text-text placeholder:text-muted'
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p className='text-xs text-danger'>
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button
          type='submit'
          disabled={loading}
          className='w-full text-black font-bold uppercase tracking-widest mt-2'
          style={{ background: '#F5C400' }}
        >
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className='text-center text-xs text-muted mt-6'>
        Already have an account?{' '}
        <Link href='/login' style={{ color: '#F5C400' }}>
          {' '}
          Log in
        </Link>
      </p>
    </div>
  );
}
