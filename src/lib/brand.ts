/**
 * Every user-visible product name, in one place.
 *
 * The name is still under review — four spec headers say "famOS (brand name
 * under review)". Deferring the NAME is free; deferring the indirection is
 * not, because it turns into a find-and-replace across every surface built
 * between now and the decision. So the constant ships first and the decision
 * can land later by editing this file.
 *
 * Nothing here is a design token or a copy string: it is the name, the
 * things the name qualifies, and the one sentence that describes the product.
 * Screen copy stays in the screen.
 */

export const BRAND = {
  /** The platform. Used bare, and as the PWA short name. */
  name: "famOS",

  /** The wall panel product — the name a room device calls itself. */
  panel: "famOS Hub",

  /** The installable app's full name. */
  appName: "famOS Hub",

  /** Home-screen label on iOS, where the space is very short. */
  appleWebAppTitle: "famOS",

  /** One sentence. Manifest description and the root page's subtitle. */
  description:
    "The family display: page, call, broadcast, plan the day and play music.",
} as const;

export type Brand = typeof BRAND;
