import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/hooks/use-auth"
import { Spinner } from "@/components/ui/spinner"

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
