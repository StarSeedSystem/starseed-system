'use client';

import { redirect } from 'next/navigation';

// Redirect /profile to the default user profile page
export default function ProfilePage() {
  // In a real app, this would get the current user's username from session
  redirect('/profile/starseeduser');
}
