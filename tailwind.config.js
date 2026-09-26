/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: { DEFAULT: '#6366f1', light: '#e0e7ff', dark: '#4f46e5' },
        savings: { DEFAULT: '#10b981', light: '#d1fae5', dark: '#059669' },
        needs: { DEFAULT: '#3b82f6', light: '#dbeafe', dark: '#2563eb' },
        wants: { DEFAULT: '#8b5cf6', light: '#ede9fe', dark: '#7c3aed' },
        fixed: { DEFAULT: '#64748b', light: '#f1f5f9', dark: '#475569' },
        danger: { DEFAULT: '#f43f5e', light: '#ffe4e6', dark: '#e11d48' },
        warn: { DEFAULT: '#f59e0b', light: '#fef3c7', dark: '#d97706' },
      },
    },
  },
  plugins: [],
}

