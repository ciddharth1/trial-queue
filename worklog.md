---
Task ID: 1
Agent: Super Z (Main)
Task: Fix all bugs and implement real-time sync between user and admin panels

Work Log:
- Explored entire codebase and identified 14+ bugs/issues
- Fixed db.ts Prisma singleton that force-disconnected on every hot reload
- Fixed race condition in getNextSequence by moving it inside the transaction
- Fixed notification API client param mismatch (unreadOnly → isRead)
- Fixed admin wait time calculation (only uses tokens with both calledAt and servedAt)
- Implemented cross-tab real-time sync using BroadcastChannel API
- Added emitRefresh() calls to all data-mutating components (join queue, leave queue, call token, complete token)
- Reduced polling intervals: Admin dashboard 3s, Admin queues 4s, User dashboard 5s, Live tracker 3s, Queues list 5s, Notifications 5s
- Fixed theme toggle by adding ThemeInitializer component that syncs Zustand store with DOM
- Fixed settings persistence by storing settings in Zustand with localStorage persistence
- Replaced Live Tracker simulated data with real API polling (fetches real tokens from queue)
- Replaced QR Scanner simulated scan with real queue lookup (picks from available active queues)
- Added recalculatePositions call after token status changes in token/[id] route
- Fixed leave queue route to properly recalculate queue length from actual member count
- Added toast notifications for queue join/leave actions
- Added "Live · Auto-refreshing" indicators on admin screens
- Updated build verification - project compiles successfully

Stage Summary:
- Core fix: When a user takes a token, the admin panel now updates in real-time via:
  1. BroadcastChannel API (same browser, different tabs - instant)
  2. Zustand triggerRefresh (same tab - instant)
  3. Faster polling intervals (different browsers - 3-5 seconds max delay)
- All 14+ identified bugs have been fixed
- Build passes successfully with no errors
