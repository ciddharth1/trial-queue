'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, Mail, Lock, User, Phone, Loader2 } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ─── LOGIN SCREEN ────────────────────────────────────────
export function LoginScreen() {
  const navigate = useAppStore((s) => s.navigate)
  const setAuth = useAppStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const result = await apiClient.login(email, password)
      if (result.success && result.data) {
        apiClient.setAccessToken(result.data.accessToken)
        setAuth(result.data.user, result.data.accessToken, result.data.refreshToken)
        navigate(result.data.user.role === 'ADMIN' ? 'admin-dashboard' : 'dashboard')
      } else {
        setError(result.error || 'Login failed. Please check your credentials.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0F172A]">
      <div className="relative flex flex-1 flex-col overflow-hidden px-6">
        {/* Background effects */}
        <div className="absolute left-0 top-0 h-64 w-64 rounded-full bg-[#4F46E5]/5 blur-[80px]" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[#06B6D4]/5 blur-[80px]" />

        {/* Back button */}
        <motion.div
          className="relative z-10 pt-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <button
            onClick={() => navigate('welcome')}
            className="flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </motion.div>

        <motion.div
          className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
        >
          {/* Header */}
          <div>
            <h2 className="text-3xl font-bold text-white">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-400">Sign in to your QueueSeva account</p>
          </div>

          {/* Form */}
          <div className="flex flex-col gap-4">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 border-slate-800 bg-slate-900/80 pl-10 text-white placeholder:text-slate-600 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 border-slate-800 bg-slate-900/80 pl-10 pr-10 text-white placeholder:text-slate-600 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20"
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button className="text-xs text-[#4F46E5] hover:underline">Forgot password?</button>
            </div>

            <Button
              onClick={handleLogin}
              disabled={loading}
              className="h-11 w-full bg-gradient-to-r from-[#4F46E5] to-[#4338CA] text-sm font-semibold text-white shadow-lg shadow-[#4F46E5]/25 hover:shadow-xl hover:shadow-[#4F46E5]/30"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
            </Button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-xs text-slate-600">or</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          {/* Demo credentials */}
          <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-4">
            <p className="mb-2 text-xs font-medium text-slate-400">Quick Demo Access:</p>
            <div className="space-y-1 text-[11px] text-slate-500">
              <p>User: user@demo.com / password</p>
              <p>Admin: admin@demo.com / password</p>
            </div>
          </div>

          {/* Sign up link */}
          <p className="text-center text-sm text-slate-500">
            Don&apos;t have an account?{' '}
            <button
              onClick={() => navigate('register')}
              className="font-semibold text-[#4F46E5] hover:underline"
            >
              Sign up
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  )
}

// ─── REGISTER SCREEN ─────────────────────────────────────
export function RegisterScreen() {
  const navigate = useAppStore((s) => s.navigate)
  const setAuth = useAppStore((s) => s.setAuth)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRegister = async () => {
    if (!name || !email || !password) {
      setError('Please fill in all required fields')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await apiClient.register(email, name, password, phone)
      if (result.success && result.data) {
        apiClient.setAccessToken(result.data.accessToken)
        setAuth(result.data.user, result.data.accessToken, result.data.refreshToken)
        navigate('dashboard')
      } else {
        setError(result.error || 'Registration failed. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0F172A]">
      <div className="relative flex flex-1 flex-col overflow-hidden px-6">
        {/* Background effects */}
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[#4F46E5]/5 blur-[80px]" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-[#06B6D4]/5 blur-[80px]" />

        {/* Back button */}
        <motion.div
          className="relative z-10 pt-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <button
            onClick={() => navigate('welcome')}
            className="flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </motion.div>

        <motion.div
          className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
        >
          {/* Header */}
          <div>
            <h2 className="text-3xl font-bold text-white">Create account</h2>
            <p className="mt-2 text-sm text-slate-400">Start managing queues smarter today</p>
          </div>

          {/* Form */}
          <div className="flex flex-col gap-3">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 border-slate-800 bg-slate-900/80 pl-10 text-white placeholder:text-slate-600 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 border-slate-800 bg-slate-900/80 pl-10 text-white placeholder:text-slate-600 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Phone (optional)</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  type="tel"
                  placeholder="+91 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 border-slate-800 bg-slate-900/80 pl-10 text-white placeholder:text-slate-600 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 border-slate-800 bg-slate-900/80 pl-10 pr-10 text-white placeholder:text-slate-600 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20"
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 border-slate-800 bg-slate-900/80 pl-10 text-white placeholder:text-slate-600 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20"
                />
              </div>
            </div>

            <Button
              onClick={handleRegister}
              disabled={loading}
              className="mt-2 h-11 w-full bg-gradient-to-r from-[#4F46E5] to-[#4338CA] text-sm font-semibold text-white shadow-lg shadow-[#4F46E5]/25 hover:shadow-xl hover:shadow-[#4F46E5]/30"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Account'}
            </Button>
          </div>

          {/* Sign in link */}
          <p className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <button
              onClick={() => navigate('login')}
              className="font-semibold text-[#4F46E5] hover:underline"
            >
              Sign in
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
