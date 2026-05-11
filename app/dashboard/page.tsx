"use client"

export const dynamic = "force-dynamic"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function DashboardPage() {
  const router = useRouter()

  useEffect(() => {
    async function redirect() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push("/auth/login"); return }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()

        if (!profile) { router.push("/auth/login"); return }

        if (profile.role === "teacher") router.push("/dashboard/teacher")
        else if (profile.role === "student") router.push("/dashboard/student")
        else if (profile.role === "parent") router.push("/dashboard/parent")
        else router.push("/auth/login")
      } catch { router.push("/auth/login") }
    }
    redirect()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">Loading your dashboard...</p>
      </div>
    </div>
  )
}
