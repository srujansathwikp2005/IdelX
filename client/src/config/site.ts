import { ROUTES } from "@/lib/constants";

export const SITE_CONFIG = {
  name: "IdleX",
  tagline: "Rent Smart. Live More.",
  description:
    "IdleX is your trusted community marketplace to rent items you love and earn from what you don't use.",
  url: "https://idlex.app",
  email: "support@idlex.app",
  phone: "",
  address: "Bhimavaram, Andhra Pradesh, India",
  social: {
    twitter: "https://twitter.com/idlex",
    instagram: "https://instagram.com/idlex",
    facebook: "https://facebook.com/idlex",
    linkedin: "https://linkedin.com/company/idlex",
  },
};

export const PUBLIC_NAV = [
  { label: "Browse Items", href: ROUTES.SEARCH },
  { label: "Categories", href: ROUTES.CATEGORIES },
  { label: "How it Works", href: "/#how-it-works" },
  { label: "Become a Host", href: ROUTES.BECOME_HOST },
];

export const FOOTER_NAV = {
  Company: [
    { label: "About Us", href: ROUTES.ABOUT },
    { label: "How it Works", href: "/#how-it-works" },
    { label: "Careers", href: "#" },
    { label: "Blog", href: "#" },
  ],
  Support: [
    { label: "Help Center", href: ROUTES.HELP },
    { label: "Safety", href: ROUTES.SAFETY },
    { label: "Community Guidelines", href: ROUTES.COMMUNITY_GUIDELINES },
    { label: "Contact Us", href: ROUTES.CONTACT },
  ],
  Legal: [
    { label: "Terms of Service", href: ROUTES.TERMS },
    { label: "Privacy Policy", href: ROUTES.PRIVACY },
    { label: "Cookie Policy", href: ROUTES.COOKIE_POLICY },
  ],
};
