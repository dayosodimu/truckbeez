/**
 * DEVELOPMENT ONLY. Each install gets a random id so two phones can play owner and driver.
 * Replace with real driver accounts (BR-3); the server refuses this scheme in production.
 */
const random = Math.random().toString(36).slice(2, 10);

export const session = { userId: `dev-${random}`, name: "Driver" };

export function setSessionName(name: string) {
  session.name = name.trim().slice(0, 60) || "Driver";
}
