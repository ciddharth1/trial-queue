# QueueSeva - Smart Queue Management SaaS Platform

A modern, real-time queue management system built with Next.js 16, Prisma, and Socket.io.

## Features

- **Live Queue Tracking** - Real-time position updates with animated progress ring
- **QR Code Check-in** - Scan branch QR codes or enter 6-digit access codes
- **Digital Tickets** - View and share digital queue tickets
- **Admin Dashboard** - Real-time analytics, queue management, and performance insights
- **Real-time Sync** - Socket.io powered live updates between user and admin panels
- **Smart Notifications** - Get notified when your turn is approaching
- **My Tickets** - Manage active and past service entries

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Next.js API Routes, Prisma ORM
- **Real-time**: Socket.io, BroadcastChannel API
- **State**: Zustand with persistence
- **UI**: shadcn/ui components, Material Design 3 color palette
- **Database**: SQLite (via Prisma)

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- npm or bun package manager

### Installation

```bash
# Clone the repository
git clone git@github.com:ciddharth1/trial-queue.git
cd trial-queue

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma db push

# Seed the database (optional)
npx prisma db seed

# Start development server
npm run dev
```

### Socket Service (Optional - for real-time updates)

```bash
cd mini-services/socket-service
npm install
npm start
```

## Project Structure

```
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── api/               # API routes
│   │   │   ├── auth/          # Authentication endpoints
│   │   │   ├── queue/         # Queue management endpoints
│   │   │   ├── token/         # Token management endpoints
│   │   │   ├── admin/         # Admin-specific endpoints
│   │   │   └── notification/  # Notification endpoints
│   │   ├── page.tsx           # Main app entry point
│   │   └── layout.tsx         # Root layout
│   ├── components/
│   │   ├── queue-seva/        # App-specific components
│   │   └── ui/                # shadcn/ui components
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utilities, API client, socket manager
│   └── types/                 # TypeScript type definitions
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts               # Database seed script
├── mini-services/
│   └── socket-service/        # Socket.io real-time service
└── public/                    # Static assets
```

## Screens

1. **Splash** → **Welcome** → **Login/Register**
2. **Dashboard** - Active tokens, available queues
3. **Branch Check-in** - QR scanner, PIN pad entry
4. **Live Tracker** - Real-time position with animated ring
5. **My Tickets** - Active tickets, service history
6. **Admin Dashboard** - Stats, charts, recent activity
7. **Admin Analytics** - Weekly overview, peak hours, KPIs
8. **Admin Queues** - Manage queues, call next token

## License

Private - All rights reserved
