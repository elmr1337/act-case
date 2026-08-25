"use client";

/**
 * Systeemmeldingen. Alleen vragen om toestemming op het moment dat iemand
 * meerdere assets tegelijk start — dán is het nuttig, en dan snapt de gebruiker
 * ook waarom hij het gevraagd krijgt. Nooit ongevraagd bij het laden.
 */
export function canNotify() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function askForNotificationPermission(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function notify(title: string, body: string) {
  if (!canNotify() || Notification.permission !== "granted") return;
  // Alleen buiten beeld melden; staat het tabblad open, dan is de toast genoeg.
  if (document.visibilityState === "visible") return;
  try {
    new Notification(title, { body, tag: "storyteq-asset" });
  } catch {
    // Sommige browsers weigeren dit buiten een service worker; geen probleem.
  }
}
