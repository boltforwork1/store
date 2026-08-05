import { Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"

export function LanguageToggle() {
  const { lang, toggleLang } = useLanguage()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="rounded-lg"
      onClick={toggleLang}
      aria-label="Toggle language"
      title={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
    >
      <Languages className="size-4" />
    </Button>
  )
}
