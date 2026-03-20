import React, { useEffect } from 'react';
import { loginWithOneTap, ensureUserProfile } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

declare global {
  interface Window {
    google: any;
  }
}

export const GoogleOneTap: React.FC = () => {
  useEffect(() => {
    const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn("Google One Tap: VITE_GOOGLE_CLIENT_ID not found in environment.");
      return;
    }

    const handleCredentialResponse = async (response: any) => {
      try {
        const result = await loginWithOneTap(response);
        if (result.user) {
          await ensureUserProfile(result.user);
        }
      } catch (error) {
        console.error("One Tap Login Error:", error);
      }
    };

    const initializeOneTap = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: false,
          context: 'signin',
          itp_support: true // Soporte para navegadores con Intelligent Tracking Prevention (Safari)
        });

        const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!user) {
            window.google.accounts.id.prompt((notification: any) => {
              if (notification.isNotDisplayed()) {
                console.log("One Tap not displayed:", notification.getNotDisplayedReason());
              }
              if (notification.isSkippedMoment()) {
                console.log("One Tap skipped:", notification.getSkippedReason());
              }
            });
          }
        });

        return unsubscribe;
      }
    };

    // Wait for the script to load
    const interval = setInterval(() => {
      if (window.google) {
        clearInterval(interval);
        initializeOneTap();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return null; // This component doesn't render anything visible
};
