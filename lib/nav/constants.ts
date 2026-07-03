/** Nav hrefs hidden until features ship — filter with this in Sidebar (one-line re-enable). */
export const COMING_SOON_NAV_HIDDEN = new Set([
  "/ai-training",
  "/utilities",
  "/favorites",
]);

export const PRIMARY_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/credits", label: "Credits" },
] as const;

export const ADMIN_NAV_ITEM = { href: "/admin/usage", label: "Admin usage" } as const;

export const ADMIN_APPROVALS_NAV_ITEM = {
  href: "/admin/approvals",
  label: "Pending approvals",
} as const;
