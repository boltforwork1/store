import * as React from "react"

export type Language = "en" | "ar"

type LanguageProviderState = {
  lang: Language
  setLang: (lang: Language) => void
  toggleLang: () => void
  t: (en: string, ar: string) => string
}

const LanguageProviderContext = React.createContext<
  LanguageProviderState | undefined
>(undefined)

const STORAGE_KEY = "dashboard-language"

function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "ar"
}

export function LanguageProvider({
  children,
  defaultLang = "en",
}: {
  children: React.ReactNode
  defaultLang?: Language
}) {
  const [lang, setLangState] = React.useState<Language>(() => {
    if (typeof window === "undefined") return defaultLang
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLanguage(stored) ? stored : defaultLang
  })

  const applyLang = React.useCallback((next: Language) => {
    const root = document.documentElement
    root.lang = next
    root.dir = next === "ar" ? "rtl" : "ltr"
  }, [])

  const setLang = React.useCallback(
    (next: Language) => {
      localStorage.setItem(STORAGE_KEY, next)
      setLangState(next)
      applyLang(next)
    },
    [applyLang]
  )

  const toggleLang = React.useCallback(() => {
    setLang(lang === "ar" ? "en" : "ar")
  }, [lang, setLang])

  React.useEffect(() => {
    applyLang(lang)
  }, [lang, applyLang])

  const t = React.useCallback(
    (en: string, ar: string) => (lang === "ar" ? ar : en),
    [lang]
  )

  const value = React.useMemo(
    () => ({ lang, setLang, toggleLang, t }),
    [lang, setLang, toggleLang, t]
  )

  return (
    <LanguageProviderContext.Provider value={value}>
      {children}
    </LanguageProviderContext.Provider>
  )
}

export function useLanguage() {
  const context = React.useContext(LanguageProviderContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
