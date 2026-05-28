'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ListOrdered,
  QrCode,
  Bell,
  User,
  Settings,
  BarChart3,
  Shield,
  ShieldCheck,
  LogOut,
  X,
  Users,
  MapPin,
} from 'lucide-react'
import { useAppStore, type AppView } from '@/lib/store'
import { cn } from '@/lib/utils'
import { UserAvatar } from './user-avatar'

interface NavItem {
  icon: any
  label: string
  view: AppView
  roles?: string[]
}

const userNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', view: 'dashboard' },
  { icon: MapPin, label: 'Check-in', view: 'qr-scanner' },
  { icon: ListOrdered, label: 'My Tickets', view: 'my-tickets' },
  { icon: Bell, label: 'Notifications', view: 'notifications' },
  { icon: User, label: 'Profile', view: 'profile' },
  { icon: Settings, label: 'Settings', view: 'settings' },
]

const adminNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', view: 'admin-dashboard', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { icon: ShieldCheck, label: 'Validate QR', view: 'admin-scanner', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { icon: BarChart3, label: 'Analytics', view: 'admin-analytics', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { icon: ListOrdered, label: 'Queue Mgmt', view: 'admin-queues', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { icon: ListOrdered, label: 'My Tickets', view: 'my-tickets' },
  { icon: Users, label: 'All Queues', view: 'queues' },
  { icon: MapPin, label: 'Check-in', view: 'qr-scanner' },
  { icon: Bell, label: 'Notifications', view: 'notifications' },
  { icon: User, label: 'Profile', view: 'profile' },
]

export function Sidebar() {
  const { currentView, navigate, user, sidebarOpen, setSidebarOpen, logout, unreadCount } = useAppStore()
  const navItems = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' ? adminNavItems : userNavItems

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-outline-variant/50 bg-surface-container-low/95 backdrop-blur-xl transition-transform duration-300 lg:relative lg:z-0 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-outline-variant/30 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-container to-tertiary-container shadow-lg shadow-primary-container/20">
              <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
                <path d="M16 8H32C36.4183 8 40 11.5817 40 16V32C40 36.4183 36.4183 40 32 40H16C11.5817 40 8 36.4183 8 32V16C8 11.5817 11.5817 8 16 8Z" stroke="white" strokeWidth="3" fill="none" />
                <path d="M16 18H32" stroke="white" strokeWidth="3" strokeLinecap="round" />
                <path d="M16 24H28" stroke="white" strokeWidth="3" strokeLinecap="round" />
                <path d="M16 30H24" stroke="white" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-on-surface">
                Queue<span className="text-secondary">Seva</span>
              </h1>
              <p className="text-[10px] text-on-surface-variant">Smart Queue Management</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = currentView === item.view
              return (
                <button
                  key={item.view}
                  onClick={() => {
                    navigate(item.view)
                    setSidebarOpen(false)
                  }}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-high/50 hover:text-on-surface'
                  )}
                >
                  <item.icon
                    className={cn(
                      'h-5 w-5 transition-colors',
                      isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-on-surface'
                    )}
                  />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.view === 'notifications' && unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-container px-1.5 text-[10px] font-bold text-on-primary">
                      {unreadCount}
                    </span>
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute left-0 h-6 w-1 rounded-r-full bg-primary"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </nav>

        {/* User section */}
        <div className="border-t border-outline-variant/30 p-4">
          <div className="flex items-center gap-3">
            <UserAvatar
              name={user?.name}
              email={user?.email}
              src={user?.avatar}
              className="h-9 w-9"
            />
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-on-surface">{user?.name || 'User'}</p>
              <p className="truncate text-[11px] text-on-surface-variant">{user?.email || ''}</p>
            </div>
            {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
              <Shield className="h-4 w-4 text-secondary" />
            )}
          </div>
          <button
            onClick={logout}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container/50 px-3 py-2 text-xs font-medium text-on-surface-variant transition-all hover:border-error/30 hover:bg-error/10 hover:text-error"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </motion.aside>
    </>
  )
}
